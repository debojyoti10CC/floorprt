import type { Evidence, MonthMetrics, POLICY } from './policy.js';
import type { SampleCandidate, SampleProfile } from './sample.js';

export const COHORTS = {
  score: 'Consistency score',
  pnl: 'Largest monthly P&L',
  tail10: '10× to <100× settled buy',
  tail100: '100× or higher settled buy',
  baseline: 'Seeded sample baseline',
} as const;
export type Cohort = keyof typeof COHORTS;

export type CandidateRow = SampleCandidate & {
  month: string;
  evidence: Evidence | null;
  current: MonthMetrics | null;
  forward: MonthMetrics | null;
  selectedBy: Cohort[];
};
export type PolicyResult = {
  cohort: Cohort;
  selected: number;
  evaluated: number;
  forwardActive: number;
  forwardProfitable: number;
  totalForwardPnl: number;
  medianForwardPnl: number | null;
};
export type CohortRound = {
  month: string;
  forwardMonth: string;
  eligibleUniverse: number;
  results: PolicyResult[];
};
export type UnderwritingRun = {
  schema: 'aqra-underwriting-v2';
  capturedAt: string;
  sampleProfile: SampleProfile;
  sampling: { daysUtc: number[]; hoursUtc: number[]; assets: string[]; activityWalletCap: number; largeWinWalletCap: number };
  datasetHash: string;
  first: string;
  last: string;
  policy: typeof POLICY;
  coverage: {
    polyMarkets: number;
    polyPlanned: number;
    polyFills: number;
    pnlWallets: number;
    pnlCaptured: number;
    pnlDays: number;
    verifiedBoundaries: number;
    totalBoundaries: number;
    candidateMonths: number;
    decisionMonths: {
      month: string; observedWallets: number; observed10x: number; observed100x: number;
      sampled: number; usable: number; qualified: number;
    }[];
  };
  rounds: CohortRound[];
  summary: PolicyResult[];
  candidates: CandidateRow[];
};
