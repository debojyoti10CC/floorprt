import { createPublicClient, http, type Address, type Hex } from 'viem';
import { polygon } from 'viem/chains';
import { z } from 'zod';
import { positionTokenAbi } from '../../packages/shared/src/position-credit.js';
import { POLYGON_RPC } from './sources.js';

const DATA_API = 'https://data-api.polymarket.com/v2';
const CTF: Address = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const POSITION_MANAGER: Address = '0x006F54F7f9A22e0000CC2AB60031000000ae9fEF';
const PREVIEW_ACCOUNT: Address = '0x85f031d069de300055900c4055c1baeb6bde3f67';
const PAGE_LIMIT = 100;
const MAX_PAGES = 4;
const ACTIVITY_LIMIT = 10;
const SNAPSHOT_TTL_MS = 60_000;
const MAX_SNAPSHOT_AGE_MS = 15 * 60_000;
const MAX_SNAPSHOTS = 48;
const walletAddress = z.string().regex(/^0x[0-9a-f]{40}$/i);
const conditionId = z.string().regex(/^0x[0-9a-f]{64}$/i);
const tokenId = z.string().regex(/^\d{1,78}$/).refine(value => BigInt(value) < 2n ** 256n);
const rawPosition = z.object({
  proxy_wallet: walletAddress,
  token_id: tokenId,
  opposite_token_id: tokenId.nullish(),
  condition_id: conditionId,
  current_size: z.number().nonnegative(),
  avg_price: z.number().nullish(),
  current_price: z.number().nullish(),
  current_value: z.number().nullish(),
  unrealized_pnl: z.number().nullish(),
  outcome: z.string().nullish(),
  title: z.string().nullish(),
  event_slug: z.string().nullish(),
  name: z.string().nullish(),
  redeemable: z.boolean().nullish(),
  negative_risk: z.boolean().nullish(),
  mergeable: z.boolean().nullish(),
});
const positionPage = z.object({
  data: z.array(rawPosition).max(PAGE_LIMIT),
  pagination: z.object({ next_cursor: z.string().max(4096).nullish() }),
});
const activityPage = z.object({
  data: z.array(z.object({
    proxy_wallet: walletAddress,
    token_id: z.string().nullish(),
    condition_id: z.string().nullish(),
    title: z.string().nullish(),
    event_slug: z.string().nullish(),
    outcome: z.string().nullish(),
    name: z.string().nullish(),
  })).max(ACTIVITY_LIMIT),
});

export class PolymarketRateLimitError extends Error {}

export type PolymarketHolding = {
  id: string;
  oppositeId: string | null;
  condition: Hex;
  title: string;
  eventSlug: string | null;
  outcome: string;
  size: number;
  average: number | null;
  mark: number | null;
  value: number | null;
  unrealized: number | null;
  redeemable: boolean;
  mergeable: boolean;
  negativeRisk: boolean;
  onchain: { ledger: 'CTF' | 'POSITION_MANAGER'; units: string } | null;
};

export type PolymarketPortfolio = {
  account: Address;
  label: string | null;
  sampled: boolean;
  cached: boolean;
  source: 'POSITIONS' | 'ACTIVITY';
  positions: PolymarketHolding[];
  matched: { condition: Hex; title: string; units: string }[];
  capturedAt: string;
  more: boolean;
  polygonBlock: string | null;
  ledgersChecked: number;
};

async function dataApi(path: string, params: URLSearchParams) {
  const response = await fetch(DATA_API + path + '?' + params, {
    signal: AbortSignal.timeout(7_000),
    headers: { Accept: 'application/json' },
  });
  if (response.status === 429) throw new PolymarketRateLimitError('Polymarket is rate limiting portfolio requests. Try again shortly.');
  if (!response.ok) throw new Error('Polymarket Data API returned HTTP ' + response.status + '.');
  return response.json() as Promise<unknown>;
}

async function readOpenPositions(account: Address) {
  const params = new URLSearchParams({ user: account, limit: String(PAGE_LIMIT), status: 'OPEN' });
  const rows = new Map<string, z.infer<typeof rawPosition>>();
  const seenCursors = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = positionPage.parse(await dataApi('/positions', params));
    for (const row of result.data) {
      if (row.proxy_wallet.toLowerCase() !== account.toLowerCase()) throw new Error('Polymarket returned a different account.');
      if (row.current_size > 0) rows.set(row.token_id, row);
    }
    const cursor = result.pagination.next_cursor;
    if (!cursor) return { rows: [...rows.values()], more: false };
    if (seenCursors.has(cursor)) throw new Error('Polymarket repeated a portfolio page.');
    seenCursors.add(cursor);
    params.set('cursor', cursor);
  }
  return { rows: [...rows.values()], more: true };
}

async function confirmBalances(account: Address, ids: bigint[]) {
  if (!ids.length) return null;
  const client = createPublicClient({
    chain: polygon,
    transport: http(process.env.FLOOR_POLYGON_RPC_URL || POLYGON_RPC, { timeout: 5_000, retryCount: 0 }),
  });
  try {
    const [network, block] = await Promise.all([client.getChainId(), client.getBlock({ blockTag: 'finalized' })]);
    if (network !== polygon.id) return null;
    const accounts = ids.map(() => account);
    const checks = await Promise.allSettled([CTF, POSITION_MANAGER].map(address => client.readContract({
      address, abi: positionTokenAbi, functionName: 'balanceOfBatch', args: [accounts, ids], blockNumber: block.number,
    })));
    const [ctf, manager] = checks.map(check => check.status === 'fulfilled' && check.value.length === ids.length ? check.value : null);
    return { block: block.number.toString(), ctf, manager, checked: Number(!!ctf) + Number(!!manager) };
  } catch {
    return null;
  }
}

function confirmedHolding(balances: Awaited<ReturnType<typeof confirmBalances>>, index: number): PolymarketHolding['onchain'] {
  const ctf = balances?.ctf?.[index] ?? 0n;
  const manager = balances?.manager?.[index] ?? 0n;
  if (ctf > 0n && manager === 0n) return { ledger: 'CTF', units: ctf.toString() };
  if (manager > 0n && ctf === 0n) return { ledger: 'POSITION_MANAGER', units: manager.toString() };
  return null;
}

async function loadPortfolio(account: Address) {
  const { rows, more } = await readOpenPositions(account);
  const capturedAt = new Date().toISOString();
  const balances = await confirmBalances(account, rows.map(row => BigInt(row.token_id)));
  const positions: PolymarketHolding[] = rows.map((row, index) => {
    return {
      id: row.token_id, oppositeId: row.opposite_token_id ?? null, condition: row.condition_id as Hex,
      title: row.title || 'Unnamed market', eventSlug: row.event_slug ?? null, outcome: row.outcome || 'Outcome',
      size: row.current_size, average: row.avg_price ?? null, mark: row.current_price ?? null,
      value: row.current_value ?? null, unrealized: row.unrealized_pnl ?? null,
      redeemable: row.redeemable === true, negativeRisk: row.negative_risk !== false, mergeable: row.mergeable === true,
      onchain: confirmedHolding(balances, index),
    };
  });
  const byId = new Map(positions.map(row => [row.id, row]));
  const matched = positions.flatMap(row => {
    if (!row.oppositeId || row.id >= row.oppositeId || !row.mergeable || row.negativeRisk || !row.onchain) return [];
    const opposite = byId.get(row.oppositeId);
    if (opposite?.oppositeId !== row.id || opposite.condition !== row.condition || opposite.negativeRisk
      || opposite.onchain?.ledger !== row.onchain.ledger || row.redeemable || opposite.redeemable) return [];
    const amounts = [BigInt(row.onchain.units), BigInt(opposite.onchain.units)];
    return [{ condition: row.condition, title: row.title, units: (amounts[0] < amounts[1] ? amounts[0] : amounts[1]).toString() }];
  });
  return {
    account, source: 'POSITIONS' as const, label: rows.find(row => row.name)?.name ?? null, positions, matched, capturedAt, more,
    polygonBlock: balances?.checked ? balances.block : null, ledgersChecked: balances?.checked ?? 0,
  };
}

type Snapshot = Omit<PolymarketPortfolio, 'sampled' | 'cached'>;

async function loadActivityBalances(account: Address): Promise<Snapshot> {
  const params = new URLSearchParams({ user: account, limit: String(ACTIVITY_LIMIT) });
  const { data } = activityPage.parse(await dataApi('/activity', params));
  const tokens = new Map<string, { id: string; condition: Hex; row: typeof data[number] }>();
  for (const row of data) {
    if (row.proxy_wallet.toLowerCase() !== account.toLowerCase()) throw new Error('Polymarket returned a different account.');
    const token = tokenId.safeParse(row.token_id);
    const condition = conditionId.safeParse(row.condition_id);
    if (token.success && condition.success && !tokens.has(token.data)) {
      tokens.set(token.data, { id: token.data, condition: condition.data as Hex, row });
    }
  }
  const candidates = [...tokens.values()];
  const balances = await confirmBalances(account, candidates.map(({ id }) => BigInt(id)));
  if (candidates.length && balances?.checked !== 2) throw new Error('Polygon balance checks are incomplete.');
  const positions = candidates.flatMap(({ id, condition, row }, index): PolymarketHolding[] => {
    const onchain = confirmedHolding(balances, index);
    if (!onchain) return [];
    return [{
      id, condition, onchain, title: row.title || 'Unnamed market', outcome: row.outcome || 'Outcome',
      eventSlug: row.event_slug ?? null, size: Number(onchain.units) / 1_000_000,
      oppositeId: null, average: null, mark: null, value: null, unrealized: null,
      redeemable: false, negativeRisk: true, mergeable: false,
    }];
  });
  return {
    account, source: 'ACTIVITY', label: data.find(row => row.name)?.name ?? null, positions, matched: [],
    capturedAt: new Date().toISOString(), more: false, polygonBlock: balances?.block ?? null, ledgersChecked: balances?.checked ?? 0,
  };
}

type SnapshotEntry = { snapshot?: Snapshot; refreshAfter: number; pending?: Promise<Snapshot> };
const portfolioSnapshots = new Map<Address, SnapshotEntry>();

export async function readPolymarketPortfolio(account: Address, sampled = false): Promise<PolymarketPortfolio> {
  const key = account.toLowerCase() as Address;
  const entry: SnapshotEntry = portfolioSnapshots.get(key) ?? { refreshAfter: 0 };
  if (!portfolioSnapshots.has(key)) {
    if (portfolioSnapshots.size >= MAX_SNAPSHOTS) portfolioSnapshots.delete(portfolioSnapshots.keys().next().value!);
    portfolioSnapshots.set(key, entry);
  }
  if (entry.snapshot && Date.now() < entry.refreshAfter) return { ...entry.snapshot, sampled, cached: true };
  const recent = () => entry.snapshot && Date.now() - Date.parse(entry.snapshot.capturedAt) < MAX_SNAPSHOT_AGE_MS;
  entry.pending ??= loadPortfolio(key).catch(error => {
    if (!(error instanceof PolymarketRateLimitError) || recent()) throw error;
    return loadActivityBalances(key).catch(() => { throw error; });
  }).then(snapshot => {
    entry.snapshot = snapshot;
    entry.refreshAfter = Date.now() + SNAPSHOT_TTL_MS;
    return snapshot;
  }).finally(() => { entry.pending = undefined; });
  try {
    return { ...await entry.pending, sampled, cached: false };
  } catch (error) {
    if (!entry.snapshot || !recent()) throw error;
    entry.refreshAfter = Math.min(Date.now() + SNAPSHOT_TTL_MS, Date.parse(entry.snapshot.capturedAt) + MAX_SNAPSHOT_AGE_MS);
    return { ...entry.snapshot, sampled, cached: true };
  }
}

export const readPublicPolymarketSample = () => readPolymarketPortfolio(PREVIEW_ACCOUNT, true);
