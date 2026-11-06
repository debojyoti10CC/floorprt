import { keccak256, stringToHex, type Hex } from 'viem';
import { DAY, monthStart, offsetMonth } from './calendar';

export const POLICY_ID = 'aqra-trader-credit-v1';
export const MICRO = 1_000_000;
export const BPS = 10_000;
export const POLICY = {
  minMonthlyTurnover: 500 * MICRO,
  minMonthlyTrades: 20,
  minActiveMonths: 2,
  minPositiveMonths: 2,
  minScore: 60,
  priorTurnover: 2_000 * MICRO,
  fullEfficiencyBps: 400,
  drawdownLimitBps: 2_000,
  sampleCap: 20,
  principal: 100 * MICRO,
  bondBps: 2_500,
  feeBps: 200,
} as const;

export type DailyPoint = {
  timestamp: number;
  source_block: number;
  realized_market_pnl: number;
  volume_usdc: number;
  trade_count: number;
};
export type AccountHistory = {
  proxy_wallet: string;
  points: DailyPoint[];
};

export function evidenceBoundaries(month: string): number[] {
  return [-2, -1, 0, 1].map(offset => monthStart(offsetMonth(month, offset)));
}

export function boundaryBlockMaxima(histories: readonly AccountHistory[], month: string): Map<number, number> {
  const anchors = new Set(evidenceBoundaries(month));
  const blocks = new Map<number, number>();
  for (const history of histories) {
    for (const point of history.points) {
      if (anchors.has(point.timestamp)) blocks.set(point.timestamp, Math.max(blocks.get(point.timestamp) ?? 0, point.source_block));
    }
  }
  return blocks;
}
export type MonthMetrics = {
  month: string;
  pnl: number;
  turnover: number;
  trades: number;
  pnlDrawdown: number;
  startBlock: number;
  endBlock: number;
};
export type Decision = {
  score: number;
  qualified: boolean;
  reason: string;
  activeMonths: number;
  positiveMonths: number;
  pnl: number;
  turnover: number;
  efficiencyBps: number;
  drawdownBps: number;
  components: { consistency: number; efficiency: number; drawdown: number };
};
export type Evidence = {
  policyId: typeof POLICY_ID;
  wallets: string[];
  month: string;
  asOf: number;
  windows: (MonthMetrics | null)[];
  decision: Decision;
  digest: Hex;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonicalWindow(value: MonthMetrics | null): MonthMetrics | null {
  if (value === null) return null;
  return {
    month: value.month,
    pnl: value.pnl,
    turnover: value.turnover,
    trades: value.trades,
    pnlDrawdown: value.pnlDrawdown,
    startBlock: value.startBlock,
    endBlock: value.endBlock,
  };
}

function canonicalDecision(value: Decision): Decision {
  return {
    score: value.score,
    qualified: value.qualified,
    reason: value.reason,
    activeMonths: value.activeMonths,
    positiveMonths: value.positiveMonths,
    pnl: value.pnl,
    turnover: value.turnover,
    efficiencyBps: value.efficiencyBps,
    drawdownBps: value.drawdownBps,
    components: {
      consistency: value.components.consistency,
      efficiency: value.components.efficiency,
      drawdown: value.components.drawdown,
    },
  };
}

function canonicalEvidencePacket(evidence: Pick<Evidence, 'policyId' | 'wallets' | 'month' | 'asOf' | 'windows'>) {
  return {
    policyId: evidence.policyId,
    wallets: evidence.wallets,
    month: evidence.month,
    asOf: evidence.asOf,
    windows: evidence.windows.map(canonicalWindow),
  };
}

/** Stable report bytes used for Swarm publication and byte-for-byte hash verification. */
export function serializeEvidence(evidence: Evidence): string {
  return JSON.stringify({
    ...canonicalEvidencePacket(evidence),
    decision: canonicalDecision(evidence.decision),
    digest: evidence.digest,
  });
}

/** Validate an untrusted downloaded report and recompute every derived field before use. */
export function verifyEvidence(value: unknown): Evidence {
  if (!isRecord(value) || value.policyId !== POLICY_ID || typeof value.month !== 'string'
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
    || !Number.isSafeInteger(value.asOf)
    || !Array.isArray(value.wallets) || value.wallets.length < 1 || value.wallets.length > 4
    || value.wallets.some(wallet => typeof wallet !== 'string' || !/^0x[0-9a-f]{40}$/.test(wallet))
    || new Set(value.wallets).size !== value.wallets.length
    || [...(value.wallets as string[])].sort().some((wallet, index) => wallet !== (value.wallets as string[])[index])
    || !Array.isArray(value.windows) || value.windows.length !== 3
    || !isRecord(value.decision) || !isRecord(value.decision.components)
    || typeof value.digest !== 'string' || !/^0x[0-9a-f]{64}$/.test(value.digest)) {
    throw new Error('Assessment report has an invalid schema.');
  }

  const windows = value.windows as unknown[];
  const expectedMonths = [-2, -1, 0].map(offset => offsetMonth(value.month as string, offset));
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    if (window === null) continue;
    if (!isRecord(window) || window.month !== expectedMonths[index]
      || !Number.isSafeInteger(window.pnl) || !Number.isSafeInteger(window.turnover) || Number(window.turnover) < 0
      || !Number.isSafeInteger(window.trades) || Number(window.trades) < 0
      || !Number.isSafeInteger(window.pnlDrawdown) || Number(window.pnlDrawdown) < 0
      || !Number.isSafeInteger(window.startBlock) || Number(window.startBlock) < 0
      || !Number.isSafeInteger(window.endBlock) || Number(window.endBlock) < Number(window.startBlock)) {
      throw new Error('Assessment report contains an invalid monthly window.');
    }
  }
  if (Number(value.asOf) !== monthStart(offsetMonth(value.month as string, 1))) {
    throw new Error('Assessment report cutoff does not match its decision month.');
  }

  const typedWindows = windows as (MonthMetrics | null)[];
  const expectedDecision = scoreWindows(typedWindows);
  if (JSON.stringify(canonicalDecision(value.decision as unknown as Decision)) !== JSON.stringify(canonicalDecision(expectedDecision))) {
    throw new Error('Assessment report decision does not recompute from its monthly evidence.');
  }
  const packet = canonicalEvidencePacket({
    policyId: POLICY_ID,
    wallets: value.wallets as string[],
    month: value.month as string,
    asOf: Number(value.asOf),
    windows: typedWindows,
  });
  if (keccak256(stringToHex(JSON.stringify(packet))).toLowerCase() !== (value.digest as string).toLowerCase()) {
    throw new Error('Assessment report digest does not match its evidence.');
  }
  return {
    ...packet,
    decision: expectedDecision,
    digest: value.digest as Hex,
  };
}

const asMicros = (dollars: number) => {
  const micros = Math.round(dollars * MICRO);
  return Number.isSafeInteger(micros) ? micros : null;
};

export function historyIndex(history: AccountHistory): Map<number, DailyPoint> {
  const index = new Map<number, DailyPoint>();
  for (const point of history.points) {
    if (index.has(point.timestamp)) throw new Error('Duplicate daily P&L timestamp.');
    index.set(point.timestamp, point);
  }
  return index;
}

export function monthMetrics(
  histories: ReadonlyArray<ReadonlyMap<number, DailyPoint>>,
  month: string,
  auditedBoundaries?: ReadonlySet<number>,
): MonthMetrics | null {
  const start = monthStart(month);
  const end = monthStart(offsetMonth(month, 1));
  if (histories.length === 0 || (auditedBoundaries && (!auditedBoundaries.has(start) || !auditedBoundaries.has(end)))) {
    return null;
  }
  let startPnl = 0;
  let startTurnover = 0;
  let startTrades = 0;
  let startBlock = 0;
  let pnl = 0;
  let turnover = 0;
  let trades = 0;
  let endBlock = 0;
  let peak = Number.NEGATIVE_INFINITY;
  let pnlDrawdown = 0;
  const previous: DailyPoint[] = [];
  for (let timestamp = start; timestamp <= end; timestamp += DAY) {
    pnl = 0;
    turnover = 0;
    trades = 0;
    endBlock = 0;
    for (let index = 0; index < histories.length; index++) {
      const point = histories[index].get(timestamp);
      if (!point || !Number.isSafeInteger(point.source_block) || point.source_block <= 0
        || !Number.isSafeInteger(point.trade_count) || point.trade_count < 0) return null;
      const previousPoint = previous[index];
      if (previousPoint && (point.source_block < previousPoint.source_block
        || point.volume_usdc < previousPoint.volume_usdc || point.trade_count < previousPoint.trade_count)) {
        return null;
      }
      previous[index] = point;
      const pointPnl = asMicros(point.realized_market_pnl);
      const pointTurnover = asMicros(point.volume_usdc);
      if (pointPnl === null || pointTurnover === null || pointTurnover < 0) return null;
      pnl += pointPnl;
      turnover += pointTurnover;
      trades += point.trade_count;
      endBlock = Math.max(endBlock, point.source_block);
    }
    if (![pnl, turnover, trades].every(Number.isSafeInteger)) return null;
    if (timestamp === start) {
      startPnl = pnl;
      startTurnover = turnover;
      startTrades = trades;
      startBlock = endBlock;
    }
    peak = Math.max(peak, pnl);
    pnlDrawdown = Math.max(pnlDrawdown, peak - pnl);
  }
  return {
    month,
    pnl: pnl - startPnl,
    turnover: turnover - startTurnover,
    trades: trades - startTrades,
    pnlDrawdown,
    startBlock,
    endBlock,
  };
}

const isActive = (month: MonthMetrics | null): month is MonthMetrics =>
  month !== null && month.turnover >= POLICY.minMonthlyTurnover && month.trades >= POLICY.minMonthlyTrades;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function scoreWindows(windows: readonly (MonthMetrics | null)[]): Decision {
  const active = windows.filter(isActive);
  const activeMonths = active.length;
  const positiveMonths = active.filter(window => window.pnl > 0).length;
  const pnl = active.reduce((sum, window) => sum + window.pnl, 0);
  const turnover = active.reduce((sum, window) => sum + window.turnover, 0);
  const efficiencyBps = Math.round(pnl * BPS / (turnover + POLICY.priorTurnover));
  const drawdownBps = active.reduce((worst, window) => Math.max(worst, Math.round(window.pnlDrawdown * BPS / window.turnover)), 0);
  const components = {
    consistency: activeMonths ? Math.round(40 * positiveMonths / activeMonths) : 0,
    efficiency: clamp(Math.round(35 * efficiencyBps / POLICY.fullEfficiencyBps), 0, 35),
    drawdown: activeMonths ? clamp(Math.round(25 * (1 - drawdownBps / POLICY.drawdownLimitBps)), 0, 25) : 0,
  };
  const score = components.consistency + components.efficiency + components.drawdown;
  let reason = 'Passes the pilot policy';
  if (activeMonths < POLICY.minActiveMonths) reason = 'Fewer than two sufficiently active months';
  else if (!isActive(windows.at(-1) ?? null)) reason = 'Most recent month has insufficient activity';
  else if (positiveMonths < POLICY.minPositiveMonths || pnl <= 0) reason = 'Insufficient repeat profitability';
  else if (score < POLICY.minScore) reason = 'Score is below the pilot threshold';
  return {
    score,
    qualified: reason === 'Passes the pilot policy',
    reason,
    activeMonths,
    positiveMonths,
    pnl,
    turnover,
    efficiencyBps,
    drawdownBps,
    components,
  };
}

export function evidenceFromHistories(
  histories: readonly AccountHistory[],
  month: string,
  auditedBoundaries?: ReadonlySet<number>,
): Evidence {
  const wallets = histories.map(history => history.proxy_wallet.toLowerCase()).sort();
  if (wallets.length === 0 || wallets.length > 4 || new Set(wallets).size !== wallets.length
    || wallets.some(wallet => !/^0x[0-9a-f]{40}$/.test(wallet))) {
    throw new Error('Evidence requires one to four distinct EVM wallets.');
  }
  const indices = histories.map(historyIndex);
  const windows = [-2, -1, 0].map(offset => monthMetrics(indices, offsetMonth(month, offset), auditedBoundaries));
  const asOf = monthStart(offsetMonth(month, 1));
  const packet: Omit<Evidence, 'decision' | 'digest'> = { policyId: POLICY_ID, wallets, month, asOf, windows };
  return {
    ...packet,
    decision: scoreWindows(windows),
    digest: keccak256(stringToHex(JSON.stringify(packet))),
  };
}

