import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { parseArgs } from 'node:util';
import {
  BENCHMARK_FIRST_MONTH, BENCHMARK_LAST_MONTH, BENCHMARK_SAMPLE_DAYS, BENCHMARK_SAMPLE_HOURS,
  captureManifestPath, DEFAULT_FIRST_MONTH, DEFAULT_LAST_MONTH, loadCapture, monthStart,
  monthsBetween, offsetMonth, pnlPath, polyPath, replayRunName, SAMPLE_DAYS, sampleSlots, SOURCE_DIR, RUN_DIR,
} from '../services/underwriting/sources.js';
import type { PnlHistory } from '../services/underwriting/sources.js';
import { SAMPLE_PROFILES, type SampleProfile, type SampleCandidate } from '../services/underwriting/sample.js';
import {
  evidenceFromHistories, historyIndex, MICRO, monthMetrics, POLICY,
  POLICY_ID, type MonthMetrics, type AccountHistory,
} from '../services/underwriting/policy.js';
import { COHORTS, type CandidateRow, type Cohort, type PolicyResult, type UnderwritingRun } from '../services/underwriting/report.js';

type CaptureManifest = {
  schema: string;
  capturedAt: string;
  first: string;
  last: string;
  profile?: SampleProfile;
  sampling?: UnderwritingRun['sampling'];
  months: string[];
  candidatesByMonth: { month: string; observedWallets: number; observed10x: number; observed100x: number; candidates: SampleCandidate[] }[];
  pnl: { wallet: string; points: number; error?: string }[];
  audit: { timestamp: number; maxBlock: number; blockTimestamp: number | null; verified: boolean; error?: string }[];
};
type WalletCapture = { fetchedAt: string; history: PnlHistory | null };
type ReplayRow = { cohort: Cohort; month: string; forwardMonth: string; candidate: CandidateRow };
type Cell = number | string | boolean | null | undefined;

const { values } = parseArgs({
  options: { benchmark: { type: 'boolean', default: false }, first: { type: 'string' }, last: { type: 'string' } },
});
const profile: SampleProfile = values.benchmark ? 'benchmark' : 'pilot';
const first = values.first ?? (profile === 'benchmark' ? BENCHMARK_FIRST_MONTH : DEFAULT_FIRST_MONTH);
const last = values.last ?? (profile === 'benchmark' ? BENCHMARK_LAST_MONTH : DEFAULT_LAST_MONTH);
const manifestText = await readFile(captureManifestPath(first, last, profile), 'utf8');
const manifest = JSON.parse(manifestText) as CaptureManifest;
if (manifest.schema !== 'aqra-capture-v1' || manifest.first !== first || manifest.last !== last
  || (manifest.profile && manifest.profile !== profile)) throw new Error('Capture manifest and replay range/profile disagree.');
const verified = new Set(manifest.audit.filter(row => row.verified).map(row => row.timestamp));
if (!manifest.months.every(month => verified.has(monthStart(month)) && verified.has(monthStart(offsetMonth(month, 1))))) {
  throw new Error('Month-boundary evidence is missing or ahead of the cutoff. Recollect before ranking.');
}
const slots = sampleSlots(manifest.months, profile);
const panelMonths = [offsetMonth(first, -2), offsetMonth(first, -1), ...manifest.months];
const lastBoundary = monthStart(offsetMonth(last, 1));
const candidates: CandidateRow[] = manifest.candidatesByMonth.flatMap(({ month, candidates: sampled }) => sampled.map(candidate => ({
  ...candidate, month, evidence: null, current: null, forward: null, selectedBy: [],
})));
const candidatesByWallet = new Map<string, CandidateRow[]>();
for (const candidate of candidates) {
  const rows = candidatesByWallet.get(candidate.wallet) ?? [];
  rows.push(candidate);
  candidatesByWallet.set(candidate.wallet, rows);
}

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const csvEscape = (value: Cell) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
};
const csv = (headers: string[], rows: Iterable<Cell[]>) => headers.join(',') + '\n'
  + [...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
const usd = (micros: number | null | undefined) => micros == null ? '' : (micros / MICRO).toFixed(6);
const utc = (seconds: number) => new Date(seconds * 1000).toISOString();
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const out = join(RUN_DIR, replayRunName(first, last, profile));
await mkdir(out, { recursive: true });
for (const obsolete of ['paper-loans.csv', 'recovery-sensitivity.csv', 'matched-venue-sessions.csv', 'kalshi-public-trades.csv.gz']) {
  await unlink(join(out, obsolete)).catch(() => undefined);
}
const files: Record<string, { sha256: string; bytes: number }> = {};

async function put(name: string, content: string | Buffer) {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content;
  await writeFile(join(out, name), bytes);
  files[name] = { sha256: hash(bytes), bytes: bytes.length };
}

async function putCsvGzip(name: string, headers: string[], rows: AsyncIterable<Cell[]>) {
  const path = join(out, name);
  async function* lines() {
    yield headers.join(',') + '\n';
    for await (const row of rows) yield row.map(csvEscape).join(',') + '\n';
  }
  await pipeline(Readable.from(lines()), createGzip({ level: 9 }), createWriteStream(path));
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  files[name] = { sha256: digest.digest('hex'), bytes: (await stat(path)).size };
}

await put('capture-manifest.json', manifestText);

let polyMarkets = 0;
let polyFills = 0;
async function* polymarketRows(): AsyncGenerator<Cell[]> {
  for (const slot of slots) {
    const capture = await loadCapture<import('../services/underwriting/sources.js').PolySample>(polyPath(slot));
    const sample = capture?.data;
    if (!sample) continue;
    polyMarkets++;
    polyFills += sample.fills.length;
    const payouts = sample.resolution.payouts;
    for (const fill of sample.fills) yield [
      slot.month, slot.slug, sample.market.conditionId, sample.market.version, fill.proxy_wallet, utc(fill.timestamp),
      fill.side, fill.token_id, fill.outcome_index, fill.size, fill.price, fill.transaction_hash, sample.resolution.resolved_at,
      sample.resolution.transaction_hash, payouts[0], payouts[1],
    ];
  }
}
await putCsvGzip('polymarket-fills.csv.gz',
  ['month', 'slot', 'condition_id', 'protocol_version', 'wallet', 'timestamp_utc', 'side', 'token_id', 'outcome_index', 'shares', 'fill_price', 'transaction_hash', 'resolved_at', 'resolution_tx', 'up_payout_micros', 'down_payout_micros'],
  polymarketRows());

let pnlCaptured = 0;
let pnlDays = 0;
const metricsByWallet = new Map<string, Map<string, MonthMetrics | null>>();
async function* pnlRows(): AsyncGenerator<Cell[]> {
  for (const { wallet } of manifest.pnl) {
    const capture = await loadCapture<WalletCapture>(pnlPath(wallet, first, last));
    const history = capture?.data?.history;
    const metrics = new Map<string, MonthMetrics | null>();
    let index: Map<number, AccountHistory['points'][number]> | null = null;
    if (history) {
      try {
        index = historyIndex(history);
        pnlCaptured++;
        pnlDays += history.points.length;
        for (const point of history.points) yield [
          history.proxy_wallet, utc(point.timestamp), point.source_block, point.realized_market_pnl,
          point.unrealized_pnl, point.volume_usdc, point.trade_count, history.source_fidelity, capture!.data!.fetchedAt,
        ];
      } catch {
        index = null;
      }
    }
    for (const month of panelMonths) metrics.set(month, index ? monthMetrics([index], month, verified) : null);
    metricsByWallet.set(wallet.toLowerCase(), metrics);
    for (const candidate of candidatesByWallet.get(wallet.toLowerCase()) ?? []) {
      if (!history || !index) continue;
      const evidence = evidenceFromHistories([history], candidate.month, verified);
      const forwardMonth = offsetMonth(candidate.month, 1);
      candidate.evidence = evidence;
      candidate.current = evidence.windows.at(-1) ?? null;
      candidate.forward = monthStart(forwardMonth) < lastBoundary ? metrics.get(forwardMonth) ?? null : null;
    }
  }
}
await putCsvGzip('polymarket-daily-pnl.csv.gz',
  ['wallet', 'timestamp_utc', 'source_block', 'realized_market_pnl_usd', 'unrealized_pnl_usd', 'turnover_usd', 'cumulative_trade_count', 'source_fidelity', 'fetched_at'],
  pnlRows());

const sampled = new Set(candidates.map(row => row.wallet + ':' + row.month));
await put('wallet-months.csv', csv(
  ['wallet', 'month', 'sampled_candidate', 'coverage', 'realized_market_pnl_usd', 'turnover_usd', 'trades', 'realized_pnl_peak_to_trough_usd', 'start_source_block', 'end_source_block'],
  manifest.pnl.flatMap(({ wallet }) => panelMonths.map(month => {
    const metric = metricsByWallet.get(wallet.toLowerCase())?.get(month) ?? null;
    return [wallet, month, sampled.has(wallet.toLowerCase() + ':' + month), metric ? 'observed' : 'missing_or_invalid',
      usd(metric?.pnl), usd(metric?.turnover), metric?.trades, usd(metric?.pnlDrawdown), metric?.startBlock, metric?.endBlock];
  })),
));
await put('candidates.csv', csv(
  ['month', 'wallet', 'sampling_group', 'observed_fill_rows', 'observed_sessions', 'observed_notional_usd', 'best_settled_buy_multiple', 'best_buy_tx', 'best_buy_cost_usd', 'best_buy_payout_usd', 'hold_sampled_buys_cost_usd', 'hold_sampled_buys_gross_payout_usd', 'score', 'qualified', 'decision_reason', 'active_months', 'positive_months', 'efficiency_bps', 'drawdown_bps', 'evidence_digest', 'selected_cohorts', 'next_month_pnl_usd'],
  candidates.map(row => [row.month, row.wallet, row.group, row.sampledFills, row.sampledSessions, row.sampledNotional.toFixed(6),
    row.bestGrossBuyMultiple, row.bestFill?.tx, row.bestFill?.cost, row.bestFill?.payout, row.buySleeveCost.toFixed(6),
    row.buySleevePayout.toFixed(6), row.evidence?.decision.score, row.evidence?.decision.qualified,
    row.evidence?.decision.reason ?? 'Missing or invalid P&L history', row.evidence?.decision.activeMonths,
    row.evidence?.decision.positiveMonths, row.evidence?.decision.efficiencyBps, row.evidence?.decision.drawdownBps,
    row.evidence?.digest, row.selectedBy.join('|'), usd(row.forward?.pnl)]),
));

const cohorts = Object.keys(COHORTS) as Cohort[];
const replay: ReplayRow[] = [];
const rounds = manifest.months.slice(0, -1).map(month => {
  const universe = candidates.filter(row => row.month === month && row.current && row.current.turnover > 0);
  const baseRank = new Map(universe.map(row => [row.wallet, hash(POLICY_ID + ':' + month + ':' + row.wallet)]));
  const choose = (cohort: Cohort): CandidateRow[] => {
    const rows = [...universe];
    const tie = (a: CandidateRow, b: CandidateRow) => a.wallet.localeCompare(b.wallet);
    const multiple = (row: CandidateRow) => row.bestGrossBuyMultiple ?? 0;
    switch (cohort) {
      case 'score': return rows.filter(row => row.evidence?.decision.qualified)
        .sort((a, b) => b.evidence!.decision.score - a.evidence!.decision.score
          || b.evidence!.decision.efficiencyBps - a.evidence!.decision.efficiencyBps || tie(a, b));
      case 'pnl': return rows.sort((a, b) => b.current!.pnl - a.current!.pnl || tie(a, b));
      case 'tail10': return rows.filter(row => multiple(row) >= 10 && multiple(row) < 100)
        .sort((a, b) => multiple(b) - multiple(a) || tie(a, b));
      case 'tail100': return rows.filter(row => multiple(row) >= 100).sort((a, b) => multiple(b) - multiple(a) || tie(a, b));
      case 'baseline': return rows.sort((a, b) => baseRank.get(a.wallet)!.localeCompare(baseRank.get(b.wallet)!));
    }
  };
  const forwardMonth = offsetMonth(month, 1);
  const results = cohorts.map(cohort => {
    const selected = choose(cohort).slice(0, POLICY.sampleCap);
    const loans = selected.map(candidate => {
      candidate.selectedBy.push(cohort);
      return { cohort, month, forwardMonth, candidate };
    });
    replay.push(...loans);
    return summarize(cohort, loans);
  });
  return { month, forwardMonth, eligibleUniverse: universe.length, results };
});

function summarize(cohort: Cohort, rows: ReplayRow[]): PolicyResult {
  const forward = rows.flatMap(row => row.candidate.forward ? [row.candidate.forward] : []);
  const pnls = forward.map(row => row.pnl).sort((a, b) => a - b);
  const center = Math.floor(pnls.length / 2);
  const median = pnls.length ? pnls.length % 2 ? pnls[center] : Math.round((pnls[center - 1] + pnls[center]) / 2) : null;
  return {
    cohort, selected: rows.length, evaluated: forward.length, forwardActive: forward.filter(row => row.turnover > 0).length,
    forwardProfitable: forward.filter(row => row.pnl > 0).length,
    totalForwardPnl: pnls.reduce((sum, pnl) => sum + pnl, 0), medianForwardPnl: median,
  };
}

await put('walk-forward-outcomes.csv', csv(
  ['decision_month', 'forward_month', 'selection_policy', 'wallet', 'forward_coverage', 'next_month_realized_pnl_usd', 'next_month_turnover_usd', 'next_month_trades'],
  replay.map(row => [row.month, row.forwardMonth, row.cohort, row.candidate.wallet, row.candidate.forward ? 'observed' : 'missing',
    usd(row.candidate.forward?.pnl), usd(row.candidate.forward?.turnover), row.candidate.forward?.trades]),
));
const summary = cohorts.map(cohort => summarize(cohort, replay.filter(row => row.cohort === cohort)));
await put('policy-results.csv', csv(
  ['decision_month', 'forward_month', 'selection_policy', 'selected', 'evaluated', 'next_month_active', 'next_month_profitable', 'profitable_rate', 'median_next_month_pnl_usd', 'sum_next_month_pnl_usd'],
  [...rounds.flatMap(round => round.results.map(result => ({ decisionMonth: round.month, forwardMonth: round.forwardMonth, result }))),
    ...summary.map(result => ({ decisionMonth: 'all', forwardMonth: 'all', result }))].map(({ decisionMonth, forwardMonth, result }) => [
    decisionMonth, forwardMonth, result.cohort, result.selected, result.evaluated, result.forwardActive,
    result.forwardProfitable, result.evaluated ? (result.forwardProfitable / result.evaluated).toFixed(6) : '',
    usd(result.medianForwardPnl), usd(result.totalForwardPnl),
  ]),
));

const fallbackDays = profile === 'benchmark' ? BENCHMARK_SAMPLE_DAYS : SAMPLE_DAYS;
const sampling = manifest.sampling ?? {
  daysUtc: [...fallbackDays], hoursUtc: [12], assets: ['btc', 'eth'],
  activityWalletCap: SAMPLE_PROFILES[profile].activity, largeWinWalletCap: SAMPLE_PROFILES[profile].largeWin,
};
const datasetHash = '0x' + hash(JSON.stringify({ policy: POLICY_ID, profile, first, last, files }));
const run: UnderwritingRun = {
  schema: 'aqra-underwriting-v2', capturedAt: manifest.capturedAt, sampleProfile: profile, sampling, datasetHash,
  first, last, policy: POLICY,
  coverage: {
    polyMarkets, polyPlanned: slots.length, polyFills, pnlWallets: manifest.pnl.length, pnlCaptured, pnlDays,
    verifiedBoundaries: verified.size, totalBoundaries: manifest.audit.length,
    candidateMonths: candidates.length,
    decisionMonths: manifest.candidatesByMonth.map(({ month, observedWallets, observed10x, observed100x, candidates: sampled }) => ({
      month, observedWallets, observed10x, observed100x, sampled: sampled.length,
      usable: candidates.filter(row => row.month === month && row.current && row.current.turnover > 0).length,
      qualified: candidates.filter(row => row.month === month && row.evidence?.decision.qualified).length,
    })),
  },
  rounds, summary, candidates,
};
const publicDir = join('apps', 'web', 'public', 'underwriting');
await mkdir(publicDir, { recursive: true });
await put('run.json', JSON.stringify(run) + '\n');
await writeFile(join(publicDir, 'run.json'), JSON.stringify(run) + '\n');
await writeFile(join(out, 'checksums.json'), json({ datasetHash, files }));
const dayList = sampling.daysUtc.join(', ');
const hourList = sampling.hoursUtc.map(hour => String(hour).padStart(2, '0') + ':00').join(', ');
await writeFile(join(out, 'README.txt'), [
  'AQRA trader credit replay, ' + first + ' through ' + last + ' UTC',
  'Sampling profile: ' + profile + '.',
  '',
  'Polymarket scheduled sessions: days ' + dayList + ' at ' + hourList + ' UTC for BTC and ETH 15-minute markets.',
  'Polymarket sources: Gamma market-by-slug, Data API v2 trades (maker and taker rows), resolutions and daily cumulative user P&L.',
  'Daily realized_market_pnl and USD turnover are differenced at UTC boundaries. Highest source blocks at month boundaries are checked on Polygon.',
  'A 10× or 100× hit is a settled sample buy with at least $5 fill cost. The multiple is gross payout divided by purchase cost before fees.',
  'The monthly activity-wallet cap is ' + sampling.activityWalletCap + '; the added large-win wallet cap is ' + sampling.largeWinWalletCap + '. This is not a venue census.',
  'Each selection policy is evaluated against the following month of realized trader P&L, turnover, and activity.',
  'The output does not infer loan repayment, default probability, lender return, or collateral from future trader P&L.',
  'Wallet history lacks opening bankroll, timestamped trader probability forecasts, and actual loan outcomes.',
  '',
  'Inputs, exclusions and verified boundary blocks: capture-manifest.json.',
  'All monetary micro-unit fields in run.json represent one millionth of a US dollar. CSV monetary fields use USD.',
  'Raw normalized rows are compressed CSV. Derived wallet-month, candidate, walk-forward outcome and policy-result rows are CSV.',
  'Checksums bind source and replay outputs to the dataset commitment in run.json.',
  '',
  'Reproduce with pnpm underwriting:collect' + (profile === 'benchmark' ? ' --benchmark' : '')
    + ' and pnpm underwriting:replay' + (profile === 'benchmark' ? ' --benchmark' : '') + '.',
].join('\n') + '\n');

console.log('Capture: ' + JSON.stringify(run.coverage));
console.table(summary.map(result => ({ cohort: result.cohort, selected: result.selected, evaluated: result.evaluated,
  nextMonthProfitable: result.evaluated ? (result.forwardProfitable / result.evaluated * 100).toFixed(1) + '%' : '—',
  medianForwardPnl: usd(result.medianForwardPnl), totalForwardPnl: usd(result.totalForwardPnl),
})));
console.log('Dataset: ' + datasetHash + ' in ' + out);
