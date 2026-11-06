import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  BENCHMARK_FIRST_MONTH, BENCHMARK_LAST_MONTH, BENCHMARK_SAMPLE_DAYS, BENCHMARK_SAMPLE_HOURS,
  capture, captureManifestPath, DEFAULT_FIRST_MONTH, DEFAULT_LAST_MONTH,
  mapLimited, monthsBetween, monthStart, offsetMonth, pnlPath, polygonBlockTime, polyPath,
  readPnlHistory, readPolySample, replayRunName, SAMPLE_DAYS, sampleSlots, SOURCE_DIR,
} from '../services/underwriting/sources.js';
import { discoverCandidates, SAMPLE_PROFILES, type SampleProfile } from '../services/underwriting/sample.js';

const { values } = parseArgs({
  options: {
    benchmark: { type: 'boolean', default: false },
    first: { type: 'string' },
    last: { type: 'string' },
  },
});
const profile: SampleProfile = values.benchmark ? 'benchmark' : 'pilot';
const first = values.first ?? (profile === 'benchmark' ? BENCHMARK_FIRST_MONTH : DEFAULT_FIRST_MONTH);
const last = values.last ?? (profile === 'benchmark' ? BENCHMARK_LAST_MONTH : DEFAULT_LAST_MONTH);
const months = monthsBetween(first, last);
const slots = sampleSlots(months, profile);
const from = monthStart(offsetMonth(first, -2));
const through = monthStart(offsetMonth(last, 1));
const limits = SAMPLE_PROFILES[profile];
const sampleDays = profile === 'benchmark' ? BENCHMARK_SAMPLE_DAYS : SAMPLE_DAYS;
const sampleHours = profile === 'benchmark' ? BENCHMARK_SAMPLE_HOURS : [12];

console.log(`Profile ${profile}: ${slots.length} scheduled Polymarket sessions across ${months.length} months (${first} through ${last} UTC).`);
const candidatesByMonth: ({ month: string } & ReturnType<typeof discoverCandidates>)[] = [];
const polySlots: { slug: string; error?: string }[] = [];
let polyMarkets = 0;
let polyFills = 0;

for (const month of months) {
  const monthSlots = slots.filter(slot => slot.month === month);
  const captured = await mapLimited(monthSlots, 6, async slot => {
    const result = await capture(polyPath(slot), () => readPolySample(slot));
    if (result.error) console.warn(slot.slug + ': ' + result.error);
    return { slot, result };
  });
  const monthSamples = captured.flatMap(({ slot, result }) => {
    polySlots.push({ slug: slot.slug, ...(result.error ? { error: result.error } : {}) });
    if (!result.data) return [];
    polyMarkets++;
    polyFills += result.data.fills.length;
    return [result.data];
  });
  const discovery = discoverCandidates(monthSamples, limits);
  candidatesByMonth.push({ month, ...discovery });
  console.log(`${month}: ${monthSamples.length}/${monthSlots.length} markets, ${monthSamples.reduce((sum, row) => sum + row.fills.length, 0)} fills, ${discovery.candidates.length} sampled wallets.`);
}

const wallets = [...new Set(candidatesByMonth.flatMap(month => month.candidates.map(candidate => candidate.wallet)))].sort();
if (wallets.length === 0) throw new Error('No historical candidate wallets were captured.');
console.log('Fetching daily P&L for ' + wallets.length + ' distinct public wallets.');

const boundaries = new Set(Array.from({ length: months.length + 3 }, (_, index) => monthStart(offsetMonth(first, index - 2))));
const boundaryBlocks = new Map<number, number>();
let finished = 0;
const pnl = await mapLimited(wallets, 8, async wallet => {
  const result = await capture(pnlPath(wallet, first, last), async () => {
    const history = await readPnlHistory(wallet);
    return {
      fetchedAt: new Date().toISOString(),
      history: history ? { ...history, points: history.points.filter(point => point.timestamp >= from && point.timestamp <= through) } : null,
    };
  });
  finished++;
  const points = result.data?.history?.points ?? [];
  for (const point of points) {
    if (boundaries.has(point.timestamp)) {
      boundaryBlocks.set(point.timestamp, Math.max(point.source_block, boundaryBlocks.get(point.timestamp) ?? 0));
    }
  }
  if (finished % 50 === 0 || finished === wallets.length) console.log(`Wallet history: ${finished}/${wallets.length}`);
  return { wallet, points: points.length, error: result.error };
});

const audit = await mapLimited([...boundaryBlocks.entries()].sort(([a], [b]) => a - b), 3, async ([timestamp, maxBlock]) => {
  try {
    const blockTimestamp = await polygonBlockTime(maxBlock);
    return { timestamp, maxBlock, blockTimestamp, verified: blockTimestamp <= timestamp };
  } catch (error) {
    return { timestamp, maxBlock, blockTimestamp: null, verified: false, error: (error as Error).message };
  }
});
const manifest = {
  schema: 'aqra-capture-v1',
  capturedAt: new Date().toISOString(),
  first,
  last,
  profile,
  sampling: { daysUtc: sampleDays, hoursUtc: sampleHours, assets: ['btc', 'eth'], activityWalletCap: limits.activity, largeWinWalletCap: limits.largeWin },
  months,
  candidatesByMonth,
  poly: { planned: slots.length, captured: polyMarkets, fills: polyFills, slots: polySlots },
  pnl: pnl.map(({ wallet, points, error }) => ({ wallet, points, ...(error ? { error } : {}) })),
  audit,
};
await mkdir(SOURCE_DIR, { recursive: true });
const manifestPath = captureManifestPath(first, last, profile);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('Capture complete: ' + JSON.stringify({
  profile,
  plannedPolyMarkets: slots.length,
  capturedPolyMarkets: polyMarkets,
  polyFills,
  pnlWallets: wallets.length,
  pnlCaptured: pnl.filter(row => !row.error && row.points > 0).length,
  boundaryBlocks: audit.length,
  verifiedBoundaryBlocks: audit.filter(row => row.verified).length,
}));
console.log('Manifest: ' + manifestPath + ' · replay output: work/underwriting/run/' + replayRunName(first, last, profile));
