import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { DAY, monthStart, offsetMonth } from './calendar.js';
import { POLYMARKET_DATA_API, parsePnlHistory, pnlUrl, type PnlHistory } from './pnl-wire.js';
export type { PnlHistory } from './pnl-wire.js';
export { DAY, monthsBetween, monthStart, offsetMonth } from './calendar.js';

export const POLYMARKET = POLYMARKET_DATA_API;
export const GAMMA = 'https://gamma-api.polymarket.com';
export const POLYGON_RPC = 'https://polygon.drpc.org';
export const SAMPLE_DAYS = [2, 5, 9, 13, 17, 21, 25, 28] as const;
export const BENCHMARK_SAMPLE_DAYS = [1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 28] as const;
export const BENCHMARK_SAMPLE_HOURS = [0, 12] as const;
export const ASSETS = ['btc', 'eth'] as const;
export const SAMPLE_WINDOW_SECONDS = 15 * 60;
export const SOURCE_DIR = join('work', 'underwriting', 'sources');
export const RUN_DIR = join('work', 'underwriting', 'run');
export const DEFAULT_FIRST_MONTH = '2026-07';
export const DEFAULT_LAST_MONTH = '2026-10';
export const BENCHMARK_FIRST_MONTH = '2025-11';
export const BENCHMARK_LAST_MONTH = '2026-10';

const Wallet = z.string().regex(/^0x[0-9a-f]{40}$/i).transform(value => value.toLowerCase());
const Hash = z.string().regex(/^0x[0-9a-f]{64}$/i);
const Timestamp = z.number().int().positive();
const Price = z.number().finite().min(0).max(1);
const PolygonFill = z.object({
  proxy_wallet: Wallet,
  side: z.enum(['BUY', 'SELL']),
  condition_id: Hash,
  size: z.number().finite().positive(),
  price: Price,
  timestamp: Timestamp,
  outcome_index: z.number().int().min(0).max(1),
  transaction_hash: Hash,
  token_id: z.string().optional(),
});
const PolyPage = z.object({
  data: z.array(PolygonFill),
  pagination: z.object({ next_cursor: z.string().nullable() }),
});
const PolymarketResolution = z.object({
  condition_id: Hash,
  status: z.literal('resolved'),
  payouts: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  resolved_at: z.iso.datetime({ offset: true }),
  resolved_block: z.number().int().positive(),
  transaction_hash: Hash,
});
const GammaMarket = z.object({
  slug: z.string(),
  conditionId: Hash,
  endDate: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  closed: z.boolean(),
  version: z.string().optional(),
});

export type SampleSlot = {
  asset: typeof ASSETS[number];
  month: string;
  start: number;
  end: number;
  slug: string;
};
export type PolyFill = z.infer<typeof PolygonFill>;
export type PolySample = {
  slot: SampleSlot;
  market: z.infer<typeof GammaMarket>;
  resolution: z.infer<typeof PolymarketResolution>;
  fetchedAt: string;
  requests: number;
  fills: PolyFill[];
};
export type Capture<T> = { data: T; error?: never } | { data?: never; error: string };

export function sampleSlots(months: string[], profile: 'pilot' | 'benchmark' = 'pilot'): SampleSlot[] {
  const days = profile === 'benchmark' ? BENCHMARK_SAMPLE_DAYS : SAMPLE_DAYS;
  const hours = profile === 'benchmark' ? BENCHMARK_SAMPLE_HOURS : [12] as const;
  return months.flatMap(month => days.flatMap(day => hours.flatMap(hour => {
    const start = monthStart(month) + (day - 1) * DAY + hour * 3600;
    return ASSETS.map(asset => ({
      asset,
      month,
      start,
      end: start + SAMPLE_WINDOW_SECONDS,
      slug: asset + '-updown-15m-' + start,
    }));
  })));
}

export function captureManifestPath(first: string, last: string, profile: 'pilot' | 'benchmark') {
  return join(SOURCE_DIR, `capture-${first}_${last}${profile === 'benchmark' ? '-benchmark' : ''}.json`);
}

export function replayRunName(first: string, last: string, profile: 'pilot' | 'benchmark') {
  return `${first}_${last}${profile === 'benchmark' ? '-benchmark' : ''}`;
}

export async function loadCapture<T>(path: string): Promise<Capture<T> | undefined> {
  try {
    const compressed = await readFile(path);
    return JSON.parse(gunzipSync(compressed).toString('utf8')) as Capture<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function saveCapture<T>(path: string, capture: Capture<T>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, gzipSync(JSON.stringify(capture)));
}

export function polyPath(slot: SampleSlot) {
  return join(SOURCE_DIR, 'polymarket', slot.slug + '.json.gz');
}

export function pnlPath(wallet: string, first: string, last: string) {
  return join(SOURCE_DIR, 'pnl', first + '_' + last, wallet.toLowerCase() + '.json.gz');
}

export async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  let failure: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    let retryAfter = 0;
    try {
      const response = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', 'User-Agent': 'AQRA-Evidence/1.0', ...init?.headers },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) return await response.json();
      if (response.status < 429 || (response.status > 429 && response.status < 500)) {
        throw new PermanentSourceError('HTTP ' + response.status + ' for ' + url);
      }
      retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000;
      failure = new Error('HTTP ' + response.status + ' for ' + url);
    } catch (error) {
      if (error instanceof PermanentSourceError) throw error;
      failure = error;
    }
    if (attempt < 4) await delay(Math.max(Math.min(retryAfter || 0, 30_000), 350 * 2 ** attempt));
  }
  throw new Error('Upstream unavailable at ' + url, { cause: failure });
}

class PermanentSourceError extends Error {}

export async function capture<T>(path: string, producer: () => Promise<T>): Promise<Capture<T>> {
  const previous = await loadCapture<T>(path);
  if (previous && !previous.error) return previous;
  let result: Capture<T>;
  try {
    result = { data: await producer() };
  } catch (error) {
    result = { error: error instanceof Error ? error.message.slice(0, 450) : String(error) };
  }
  await saveCapture(path, result);
  return result;
}

export async function mapLimited<T, R>(items: T[], workers: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await run(items[index], index);
    }
  }));
  return output;
}

export async function readPolySample(slot: SampleSlot): Promise<PolySample> {
  const market = GammaMarket.parse(await getJson(GAMMA + '/markets/slug/' + slot.slug));
  const cutoff = monthStart(offsetMonth(slot.month, 1));
  if (market.slug !== slot.slug || !market.closed || Date.parse(market.endDate) !== slot.end * 1000
    || Date.parse(market.createdAt) > slot.start * 1000) {
    throw new Error('Scheduled market failed metadata checks.');
  }
  const resolutions = z.object({ data: z.array(PolymarketResolution) })
    .parse(await getJson(POLYMARKET + '/resolutions?condition=' + market.conditionId));
  const resolution = resolutions.data.find(row => row.condition_id === market.conditionId);
  if (!resolution || resolution.payouts[0] + resolution.payouts[1] !== 1_000_000
    || Date.parse(resolution.resolved_at) >= cutoff * 1000
    || Date.parse(resolution.resolved_at) < slot.end * 1000) {
    throw new Error('Resolution is missing or outside the sampling period.');
  }
  const fills: PolyFill[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let oldest = Number.POSITIVE_INFINITY;
  let requests = 0;
  do {
    const query = new URLSearchParams({
      condition: market.conditionId,
      taker_only: 'false',
      limit: '1000',
    });
    if (cursor) query.set('cursor', cursor);
    const page = PolyPage.parse(await getJson(POLYMARKET + '/trades?' + query));
    requests++;
    for (const fill of page.data) {
      if (fill.condition_id !== market.conditionId || fill.timestamp > oldest) {
        throw new Error('Trade feed returned a different condition or nonmonotonic timestamps.');
      }
      oldest = fill.timestamp;
      if (fill.timestamp >= slot.start && fill.timestamp < slot.end) fills.push(fill);
    }
    cursor = page.pagination.next_cursor;
    if (oldest < slot.start || cursor === null) break;
    if (cursors.has(cursor) || requests >= 120 || page.data.length === 0) throw new Error('Trade pagination did not finish.');
    cursors.add(cursor);
  } while (cursor);
  if (fills.length === 0) throw new Error('No fills in the scheduled interval.');
  return { slot, market, resolution, fetchedAt: new Date().toISOString(), requests, fills };
}

export async function readPnlHistory(wallet: string): Promise<PnlHistory | null> {
  return parsePnlHistory(await getJson(pnlUrl(wallet)), wallet);
}

export async function polygonBlockTime(block: number) {
  const response = z.object({ result: z.object({ timestamp: z.string().regex(/^0x[0-9a-f]+$/i) }) })
    .parse(await getJson(POLYGON_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: ['0x' + block.toString(16), false], id: 1 }),
    }));
  return Number.parseInt(response.result.timestamp, 16);
}
