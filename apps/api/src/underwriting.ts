import { Hono } from 'hono';
import { createPublicClient, encodeAbiParameters, http, isAddress, keccak256, parseAbiParameters, type Address, type Hex } from 'viem';
import { randomUUID } from 'node:crypto';
import { mainnet } from 'viem/chains';
import { namehash, normalize } from 'viem/ens';
import { z } from 'zod';
import { TraderCreditDeskAbi, publicClientFor } from '../../../packages/shared/src/index.js';
import { monthOf, offsetMonth } from '../../../services/underwriting/calendar.js';
import { lastCompleteMonth, readLiveControllers, readLiveEvidence } from '../../../services/underwriting/live-evidence.js';
import { localReportMetadata, scoreReport } from '../../../services/underwriting/reports.js';
import { verifyEvidence } from '../../../services/underwriting/policy.js';
import { assessmentSha256, readAssessment, swarmConfigured, uploadAssessment, type SwarmAssessment } from '../../../services/underwriting/swarm.js';
import type { ApiRuntime } from './deployment.js';

const AddressSchema = z.string().refine(value => isAddress(value, { strict: false })).transform(value => value.toLowerCase() as Address);
const Wallets = z.array(AddressSchema).min(1).max(4).refine(values => new Set(values).size === values.length, 'Duplicate wallet address');
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ENS_WALLET_KEY = 'com.aqra.wallets';
const loanIdSchema = /^[1-9]\d{0,18}$/;
const signatureSchema = /^0x(?:[a-f0-9]{2}){65}$/i;
const assessmentChallenges = new Map<string, {
  message: string;
  expiresAt: number;
  loanId: bigint;
  borrower: Address;
  evidence: ReturnType<typeof verifyEvidence>;
  reportHash: string;
  result?: SwarmAssessment;
}>();

const evidenceCache = new Map<string, { expires: number; promise: ReturnType<typeof readLiveEvidence> }>();
function cachedEvidence(wallets: Address[], month: string) {
  const key = month + ':' + [...wallets].sort().join(',');
  const now = Date.now();
  const stored = evidenceCache.get(key);
  if (stored && stored.expires > now) return stored.promise;
  if (evidenceCache.size >= 80) evidenceCache.delete(evidenceCache.keys().next().value!);
  const promise = readLiveEvidence(wallets, month).catch(error => {
    if (evidenceCache.get(key)?.promise === promise) evidenceCache.delete(key);
    throw error;
  });
  evidenceCache.set(key, { expires: now + 60_000, promise });
  return promise;
}

export function createUnderwritingApi() {
  const app = new Hono<{ Variables: { runtime: ApiRuntime } }>();

  app.get('/storage-status', c => c.json({
    swarmConfigured: swarmConfigured(),
    publicReports: true,
    note: 'Configured means Bee URL and postage batch are present; availability is checked during upload and retrieval.',
  }));

  app.get('/evidence', async c => {
    const parsed = Wallets.safeParse(c.req.queries('wallet') ?? []);
    const month = Month.safeParse(c.req.query('month') ?? lastCompleteMonth());
    if (!parsed.success || !month.success) return c.json({ error: 'Provide one to four wallets and a completed UTC month.' }, 400);
    try {
      return c.json(await cachedEvidence(parsed.data, month.data));
    } catch (error) {
      return c.json({ error: (error as Error).message }, 502);
    }
  });

  app.get('/identity', async c => {
    const raw = c.req.query('name')?.trim() ?? '';
    let name: string;
    try {
      if (raw.length === 0 || raw.length > 255) throw new Error('invalid name');
      name = normalize(raw);
      if (!name.endsWith('.eth')) throw new Error('invalid suffix');
    } catch {
      return c.json({ error: 'Enter a valid .eth name.' }, 400);
    }
    const client = createPublicClient({
      chain: mainnet,
      transport: http(process.env.FLOOR_ENS_RPC_URL ?? 'https://ethereum-rpc.publicnode.com', { timeout: 8000, retryCount: 1 }),
    });
    try {
      const block = await client.getBlock({ blockTag: 'finalized' });
      const [primary, text] = await Promise.all([
        client.getEnsAddress({ name, blockNumber: block.number }),
        client.getEnsText({ name, key: ENS_WALLET_KEY, blockNumber: block.number }),
      ]);
      if (!primary) return c.json({ error: 'This name has no Ethereum address record.' }, 404);
      let wallets: Address[] = [primary.toLowerCase() as Address];
      if (text) {
        if (text.length > 500) return c.json({ error: 'The AQRA wallet record exceeds the supported size.' }, 422);
        try { wallets = Wallets.parse(JSON.parse(text)); }
        catch { return c.json({ error: 'com.aqra.wallets must be a JSON array of one to four distinct addresses.' }, 422); }
      }
      return c.json({ name, node: namehash(name), primary, wallets: [...wallets].sort(), source: text ? ENS_WALLET_KEY : 'addr', block: block.number.toString() });
    } catch {
      return c.json({ error: 'ENS resolution is temporarily unavailable.' }, 502);
    }
  });

  app.get('/controller', async c => {
    const trader = AddressSchema.safeParse(c.req.query('trader'));
    const controller = AddressSchema.safeParse(c.req.query('controller'));
    if (!trader.success || !controller.success || trader.data === controller.data) {
      return c.json({ error: 'Provide distinct trader and controller addresses.' }, 400);
    }
    try {
      await readLiveControllers([trader.data], [controller.data]);
      return c.json({ trader: trader.data, controller: controller.data, network: 'Polygon', verified: true });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.get('/assessment-challenge/:id', async c => {
    if (!swarmConfigured()) return c.json({ error: 'Swarm evidence storage is not configured on this AQRA API.' }, 503);
    const rawId = c.req.param('id');
    if (!loanIdSchema.test(rawId)) return c.json({ error: 'Invalid loan ID.' }, 400);
    try {
      const { deployment, rpcUrl } = c.get('runtime');
      const desk = deployment.contracts.TraderCreditDesk;
      if (!desk) return c.json({ error: 'Trader credit is unavailable on this deployment.' }, 404);
      const client = publicClientFor(deployment, rpcUrl);
      const block = await client.getBlock();
      const code = await client.getCode({ address: desk, blockNumber: block.number });
      if (await client.getChainId() !== deployment.chainId || !code || keccak256(code) !== deployment.codeHashes.TraderCreditDesk) {
        return c.json({ error: 'The configured trader desk could not be verified.' }, 409);
      }
      const loanId = BigInt(rawId);
      const [loan, wallets] = await Promise.all([
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'getLoan', args: [loanId], blockNumber: block.number }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'traderWallets', args: [loanId], blockNumber: block.number }),
      ]);
      if (loan.state !== 1 || loan.score < 60 || block.timestamp >= loan.fundBy) {
        return c.json({ error: 'Only an attested request that is still open can publish an assessment.' }, 409);
      }
      const month = offsetMonth(monthOf(Number(loan.terms.asOf)), -1);
      const evidence = verifyEvidence(await cachedEvidence([...wallets], month));
      if (!evidence.decision.qualified || evidence.digest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()
        || BigInt(evidence.asOf) !== loan.terms.asOf || evidence.decision.score !== loan.score
        || keccak256(encodeWallets(evidence.wallets as Address[])).toLowerCase() !== loan.walletSetHash.toLowerCase()) {
        return c.json({ error: 'Current evidence does not match the report attested to this request.' }, 409);
      }
      const reportHash = assessmentSha256(evidence);
      const expiresAt = Math.min(Number(block.timestamp + 600n), Number(loan.fundBy));
      if (expiresAt <= Number(block.timestamp)) return c.json({ error: 'This request is too close to its funding deadline to publish.' }, 409);
      const challengeId = randomUUID();
      const message = [
        'AQRA PUBLIC ASSESSMENT RELEASE v1',
        `Chain ID: ${deployment.chainId}`,
        `Desk: ${desk.toLowerCase()}`,
        `Loan ID: ${loanId}`,
        `Borrower: ${loan.borrower.toLowerCase()}`,
        `Evidence digest: ${evidence.digest.toLowerCase()}`,
        `Report SHA-256: ${reportHash}`,
        `Expires at: ${expiresAt}`,
        `Challenge: ${challengeId}`,
        'This signature authorizes public Swarm storage and an Arkiv listing for this report only.',
      ].join('\n');
      for (const [key, challenge] of assessmentChallenges) if (challenge.expiresAt <= Number(block.timestamp)) assessmentChallenges.delete(key);
      while (assessmentChallenges.size >= 256) assessmentChallenges.delete(assessmentChallenges.keys().next().value!);
      assessmentChallenges.set(challengeId, { message, expiresAt, loanId, borrower: loan.borrower, evidence, reportHash });
      return c.json({ challengeId, message, expiresAt, sha256: reportHash, evidence });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.post('/assessment-publication/:id', async c => {
    if (!swarmConfigured()) return c.json({ error: 'Swarm evidence storage is not configured on this AQRA API.' }, 503);
    const rawId = c.req.param('id');
    if (!loanIdSchema.test(rawId)) return c.json({ error: 'Invalid loan ID.' }, 400);
    const body = await c.req.text();
    if (new TextEncoder().encode(body).byteLength > 8192) return c.json({ error: 'Payload too large.' }, 413);
    let json: unknown;
    try { json = JSON.parse(body); } catch { return c.json({ error: 'Request body must be valid JSON.' }, 400); }
    const parsed = z.object({ challengeId: z.string().uuid(), signature: z.string().regex(signatureSchema) }).safeParse(json);
    if (!parsed.success) return c.json({ error: 'Provide a valid assessment challenge and borrower signature.' }, 400);
    const challenge = assessmentChallenges.get(parsed.data.challengeId);
    if (!challenge || challenge.loanId !== BigInt(rawId)) return c.json({ error: 'Assessment consent challenge was not found.' }, 404);
    const { deployment, rpcUrl } = c.get('runtime');
    try {
      const desk = deployment.contracts.TraderCreditDesk;
      if (!desk) return c.json({ error: 'Trader credit is unavailable on this deployment.' }, 404);
      const client = publicClientFor(deployment, rpcUrl);
      const [chainId, block, code, loan] = await Promise.all([
        client.getChainId(),
        client.getBlock(),
        client.getCode({ address: desk }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'getLoan', args: [challenge.loanId] }),
      ]);
      if (Number(block.timestamp) >= challenge.expiresAt) return c.json({ error: 'Assessment consent expired; prepare a new signature.' }, 410);
      if (chainId !== deployment.chainId || !code || keccak256(code) !== deployment.codeHashes.TraderCreditDesk || loan.state !== 1
        || loan.borrower.toLowerCase() !== challenge.borrower.toLowerCase() || loan.score !== challenge.evidence.decision.score
        || loan.terms.evidenceDigest.toLowerCase() !== challenge.evidence.digest.toLowerCase()
        || loan.terms.asOf !== BigInt(challenge.evidence.asOf) || block.timestamp >= loan.fundBy) {
        return c.json({ error: 'The request changed or expired after consent was prepared.' }, 409);
      }
      if (!await client.verifyMessage({ address: challenge.borrower, message: challenge.message, signature: parsed.data.signature as Hex })) {
        return c.json({ error: 'Consent must be signed by the borrower wallet.' }, 403);
      }
      if (challenge.result) return c.json(challenge.result);
      const result = await uploadAssessment(challenge.evidence);
      if (result.sha256 !== challenge.reportHash) return c.json({ error: 'The published report hash differs from the consented preview.' }, 409);
      challenge.result = result;
      return c.json(result, 201);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.get('/assessment/:reference', async c => {
    if (!swarmConfigured()) return c.json({ error: 'Swarm evidence storage is not configured on this AQRA API.' }, 503);
    const reference = c.req.param('reference');
    const sha256 = c.req.query('sha256') ?? '';
    try {
      const report = await readAssessment(reference, sha256);
      return c.json(report);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  app.get('/local-report/:id', async c => {
    const { deployment, rpcUrl } = c.get('runtime');
    const desk = deployment.contracts.TraderCreditDesk;
    if (deployment.chainId !== 31337 || deployment.traderCredit?.mode !== 'LOCAL_FORWARDER'
      || !desk || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpcUrl).hostname)) {
      return c.json({ error: 'Local report preparation requires loopback Anvil.' }, 404);
    }
    const id = c.req.param('id');
    if (!/^[1-9]\d{0,18}$/.test(id)) return c.json({ error: 'Invalid loan ID.' }, 400);
    try {
      const client = publicClientFor(deployment, rpcUrl);
      const code = await client.getCode({ address: desk });
      if (await client.getChainId() !== 31337 || !code || keccak256(code) !== deployment.codeHashes.TraderCreditDesk) {
        return c.json({ error: 'The configured trader desk could not be verified.' }, 409);
      }
      const block = await client.getBlock();
      const [loan, wallets, controllers, workflowId, author] = await Promise.all([
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'getLoan', args: [BigInt(id)], blockNumber: block.number }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'traderWallets', args: [BigInt(id)], blockNumber: block.number }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'traderControllers', args: [BigInt(id)], blockNumber: block.number }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'workflowId', blockNumber: block.number }),
        client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'workflowOwner', blockNumber: block.number }),
      ]);
      if (loan.state !== 1 || loan.score !== 0 || block.timestamp >= loan.fundBy) {
        return c.json({ error: 'This request is no longer awaiting a report.' }, 409);
      }
      const month = offsetMonth(monthOf(Number(loan.terms.asOf)), -1);
      const [evidence] = await Promise.all([cachedEvidence([...wallets], month), readLiveControllers(wallets, controllers)]);
      const report = scoreReport({
        desk, chainId: deployment.chainId, id: BigInt(id), borrower: loan.borrower,
        walletSetHash: loan.walletSetHash, evidenceDigest: loan.terms.evidenceDigest, asOf: loan.terms.asOf,
      }, evidence);
      return c.json({ metadata: localReportMetadata(workflowId, author), report, evidence, mode: 'LOCAL_FORWARDER' });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 422);
    }
  });

  return app;
}

function encodeWallets(wallets: Address[]) {
  return encodeAbiParameters(parseAbiParameters('address[]'), [wallets]);
}
