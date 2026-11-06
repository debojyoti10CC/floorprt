import { Hono } from 'hono';
import { createPublicClient, http, isAddress, keccak256, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { namehash, normalize } from 'viem/ens';
import { z } from 'zod';
import { TraderCreditDeskAbi, publicClientFor } from '../../../packages/shared/src/index.js';
import { monthOf, offsetMonth } from '../../../services/underwriting/calendar.js';
import { lastCompleteMonth, readLiveControllers, readLiveEvidence } from '../../../services/underwriting/live-evidence.js';
import { localReportMetadata, scoreReport } from '../../../services/underwriting/reports.js';
import type { ApiRuntime } from './deployment.js';

const AddressSchema = z.string().refine(value => isAddress(value, { strict: false })).transform(value => value.toLowerCase() as Address);
const Wallets = z.array(AddressSchema).min(1).max(4).refine(values => new Set(values).size === values.length, 'Duplicate wallet address');
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const ENS_WALLET_KEY = 'com.aqra.wallets';

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
