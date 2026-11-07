import { Hono } from 'hono';
import { keccak256, verifyMessage, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { demoEvidence } from '../../../services/underwriting/demo-evidence';
import { walletSetHash } from '../../../services/underwriting/reports';
import { assessmentSha256 } from '../../../services/underwriting/swarm';
import { createUnderwritingApi } from './underwriting';
import type { ApiRuntime } from './deployment';

const mocks = vi.hoisted(() => ({ client: { getBlock: vi.fn(), getCode: vi.fn(), getChainId: vi.fn(), readContract: vi.fn(), verifyMessage: vi.fn() }, upload: vi.fn(), read: vi.fn(), readEvidence: vi.fn() }));
vi.mock('../../../packages/shared/src/index.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../packages/shared/src/index.js')>(),
  publicClientFor: () => mocks.client, readPositionPledge: vi.fn(async () => null),
}));
vi.mock('../../../services/underwriting/live-evidence.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../services/underwriting/live-evidence.js')>(),
  readLiveEvidence: mocks.readEvidence,
}));
vi.mock('../../../services/underwriting/swarm.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../services/underwriting/swarm.js')>(), uploadAssessment: mocks.upload, readAssessment: mocks.read,
}));
// Standard public Anvil test identities; never used to sign public transactions.
const mnemonic = 'test test test test test test test test test test test junk';
const borrower = mnemonicToAccount(mnemonic, { addressIndex: 1 });
const other = mnemonicToAccount(mnemonic, { addressIndex: 2 });
const evidence = demoEvidence(borrower.address, '2026-09');
const desk = '0x1111111111111111111111111111111111111111';
const code = '0x6000' as Hex;
const runtime = { deployment: {
  chainId: 31337, roles: { borrower: borrower.address }, contracts: { TraderCreditDesk: desk }, codeHashes: { TraderCreditDesk: keccak256(code) },
}, rpcUrl: 'http://127.0.0.1:8545' } as unknown as ApiRuntime;
let loan: { borrower: Hex; state: number; score: number; fundBy: bigint; walletSetHash: Hex; terms: { asOf: bigint; evidenceDigest: Hex } };
let timestamp: bigint;
function app() {
  const app = new Hono<{ Variables: { runtime: ApiRuntime } }>();
  app.use('*', async (c, next) => { c.set('runtime', runtime); await next(); });
  app.route('/', createUnderwritingApi());
  return app;
}
const publish = (api: ReturnType<typeof app>, challengeId: string, signature: Hex, id = '1') => api.request('/assessment-publication/' + id, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, signature }),
});
async function challenge(api: ReturnType<typeof app>) {
  const response = await api.request('/assessment-challenge/1');
  expect(response.status).toBe(200);
  return await response.json() as { challengeId: string; message: string; sha256: string; expiresAt: number };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SWARM_BEE_URL', 'http://127.0.0.1:1633');
  vi.stubEnv('SWARM_POSTAGE_BATCH_ID', 'a'.repeat(64));
  timestamp = BigInt(evidence.asOf) + 86400n;
  loan = { borrower: borrower.address, state: 1, score: evidence.decision.score, fundBy: timestamp + 3600n,
    walletSetHash: walletSetHash([borrower.address]), terms: { asOf: BigInt(evidence.asOf), evidenceDigest: evidence.digest } };
  mocks.client.getBlock.mockImplementation(async () => ({ number: 10n, timestamp }));
  mocks.client.getCode.mockResolvedValue(code);
  mocks.client.getChainId.mockResolvedValue(31337);
  mocks.client.readContract.mockImplementation(async ({ functionName }) => functionName === 'getLoan' ? loan : [borrower.address]);
  mocks.client.verifyMessage.mockImplementation(verifyMessage);
  mocks.readEvidence.mockResolvedValue(evidence);
  mocks.upload.mockResolvedValue({ reference: 'b'.repeat(64), sha256: assessmentSha256(evidence), evidence, position: null, bytes: 100 });
});
afterEach(() => vi.unstubAllEnvs());

describe('borrower-authorized Swarm publication', () => {
  it('serves verified report reads without requiring upload postage', async () => {
    vi.stubEnv('SWARM_POSTAGE_BATCH_ID', '');
    const api = app();
    const report = { reference: 'b'.repeat(64), sha256: assessmentSha256(evidence), evidence, position: null, bytes: 100 };
    mocks.read.mockResolvedValue(report);
    const response = await api.request('/assessment/' + report.reference + '?sha256=' + report.sha256);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(mocks.read).toHaveBeenCalledWith(report.reference, report.sha256);
    expect((await api.request('/assessment-challenge/1')).status).toBe(503);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('binds consent to the loan and exact report and uploads only once on retries', async () => {
    const api = app();
    const prepared = await challenge(api);
    expect(prepared.message).toContain('Loan ID: 1');
    expect(prepared.message).toContain('Report SHA-256: ' + assessmentSha256(evidence));
    const signature = await borrower.signMessage({ message: prepared.message });
    expect((await publish(api, prepared.challengeId, signature)).status).toBe(201);
    expect((await publish(api, prepared.challengeId, signature)).status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect((await publish(api, prepared.challengeId, signature, '2')).status).toBe(404);
  });

  it('rejects another wallet and an altered consent message before upload', async () => {
    const api = app();
    const prepared = await challenge(api);
    for (const signature of [await other.signMessage({ message: prepared.message }), await borrower.signMessage({ message: prepared.message + ' changed' })]) {
      expect((await publish(api, prepared.challengeId, signature)).status).toBe(403);
    }
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects consent at expiry and changed or closed requests', async () => {
    const api = app();
    const prepared = await challenge(api);
    const signature = await borrower.signMessage({ message: prepared.message });
    timestamp = BigInt(prepared.expiresAt);
    expect((await publish(api, prepared.challengeId, signature)).status).toBe(410);
    timestamp--;
    loan = { ...loan, state: 2 };
    expect((await publish(api, prepared.challengeId, signature)).status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('does not issue previews for expired, unattested or wrong-code requests', async () => {
    const api = app();
    loan.score = 0;
    expect((await api.request('/assessment-challenge/1')).status).toBe(409);
    loan.score = evidence.decision.score;
    loan.fundBy = timestamp;
    expect((await api.request('/assessment-challenge/1')).status).toBe(409);
    mocks.client.getCode.mockResolvedValue('0x6001');
    expect((await api.request('/assessment-challenge/1')).status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('surfaces upload failure and permits a consented retry without signing money transactions', async () => {
    const api = app();
    const prepared = await challenge(api);
    const signature = await borrower.signMessage({ message: prepared.message });
    mocks.upload.mockRejectedValueOnce(new Error('Bee offline'));
    const failed = await publish(api, prepared.challengeId, signature);
    expect(failed.status).toBe(422);
    expect(await failed.json()).toEqual({ error: 'Bee offline' });
    expect((await publish(api, prepared.challengeId, signature)).status).toBe(201);
  });
});
