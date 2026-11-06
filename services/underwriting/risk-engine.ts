/**
 * AQRA portfolio credit stress engine.
 *
 * This module computes scenario losses from explicit PD and default-correlation
 * assumptions. It deliberately does not infer either quantity from trading P&L.
 * All monetary inputs and outputs are integer micro-USDC, matching the desk.
 */

export const RISK_ENGINE_VERSION = 'aqra-credit-risk-v1';
export const RISK_BPS = 10_000;
const MAX_EXPOSURES = 5_000;
const MAX_PER_LOAN_MICROS = Math.floor(Number.MAX_SAFE_INTEGER / MAX_EXPOSURES);

export type RiskInput = {
  exposureCount: number;
  principal: number;
  bondBps: number;
  bondRecoveryBps: number;
  feeBps: number;
  pdBps: number;
  defaultCorrelationBps: number;
  confidenceBps: number;
  capitalChargeBps: number;
  operatingCostPerLoan: number;
  scenarioCapital: number;
};

export type LossPoint = { defaults: number; probability: number; loss: number };
export type RiskMetrics = {
  version: typeof RISK_ENGINE_VERSION;
  exposureCount: number;
  principal: number;
  bond: number;
  recoveredBond: number;
  fee: number;
  lossPerDefault: number;
  ead: number;
  lgdBps: number;
  bondRecoveryBps: number;
  pdBps: number;
  defaultCorrelationBps: number;
  confidenceBps: number;
  expectedLoss: number;
  valueAtRisk: number;
  expectedShortfall: number;
  unexpectedLoss: number;
  expectedFeeRevenue: number;
  costOfCapital: number;
  operatingCost: number;
  requiredRiskPrice: number;
  expectedRiskAdjustedMargin: number;
  mandatoryStressLoss: number;
  requiredCapital: number;
  scenarioCapital: number;
  capitalGap: number;
  coverageRatioBps: number;
  breakEvenPdBps: number | null;
  distribution: LossPoint[];
};

export type CreditGateInput = {
  requestedLoans: number;
  calibratedPd: boolean;
  outOfTimeValidationPassed: boolean;
  repaymentLabels: number;
  committedCapital: number;
};

export type CreditDecision = {
  status: 'REJECT' | 'REDUCE_LIMIT' | 'APPROVE';
  requestedLoans: number;
  maximumLoans: number;
  approvedPrincipal: number;
  bindingReasons: string[];
};

const clampInt = (value: number, min: number, max: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${name} is outside the supported range.`);
  return value;
};

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const z = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index++) series += coefficients[index] / (z + index + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

const logBeta = (a: number, b: number) => logGamma(a) + logGamma(b) - logGamma(a + b);
const logChoose = (n: number, k: number) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

function defaultCountDistribution(n: number, p: number, rho: number): number[] {
  if (n === 0) return [1];
  if (p <= 0) return [1, ...Array<number>(n).fill(0)];
  if (p >= 1) return [...Array<number>(n).fill(0), 1];

  if (rho <= 0) {
    return Array.from({ length: n + 1 }, (_, k) => Math.exp(
      logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p),
    ));
  }
  if (rho >= 1) {
    const values = Array<number>(n + 1).fill(0);
    values[0] = 1 - p;
    values[n] += p;
    return values;
  }

  // Beta-binomial mixture: each portfolio shares a latent default rate.
  // The resulting pairwise Bernoulli default correlation is exactly rho.
  const concentration = (1 - rho) / rho;
  const alpha = p * concentration;
  const beta = (1 - p) * concentration;
  const denominator = logBeta(alpha, beta);
  return Array.from({ length: n + 1 }, (_, k) => Math.exp(
    logChoose(n, k) + logBeta(k + alpha, n - k + beta) - denominator,
  ));
}

function normalize(probabilities: number[]): number[] {
  const total = probabilities.reduce((sum, probability) => sum + probability, 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new Error('Loss distribution could not be normalized.');
  return probabilities.map(probability => probability / total);
}

function exactValueAtRisk(distribution: readonly LossPoint[], confidence: number): number {
  let cumulative = 0;
  for (const point of distribution) {
    cumulative += point.probability;
    if (cumulative + 1e-12 >= confidence) return point.loss;
  }
  return distribution.at(-1)?.loss ?? 0;
}

/** Expected loss in the worst (1-confidence) probability mass, including a fractional boundary atom. */
function exactExpectedShortfall(distribution: readonly LossPoint[], confidence: number): number {
  const tailMass = 1 - confidence;
  if (tailMass <= 0) return distribution.at(-1)?.loss ?? 0;
  let remaining = tailMass;
  let weightedLoss = 0;
  for (const point of [...distribution].reverse()) {
    const selectedMass = Math.min(point.probability, remaining);
    weightedLoss += point.loss * selectedMass;
    remaining -= selectedMass;
    if (remaining <= 1e-14) break;
  }
  return weightedLoss / tailMass;
}

function distributionFor(input: RiskInput, pdBps = input.pdBps): LossPoint[] {
  const n = clampInt(input.exposureCount, 0, MAX_EXPOSURES, 'Exposure count');
  const pBps = clampInt(pdBps, 0, RISK_BPS, 'Default probability');
  const rhoBps = clampInt(input.defaultCorrelationBps, 0, RISK_BPS, 'Default correlation');
  const principal = clampInt(input.principal, 0, MAX_PER_LOAN_MICROS, 'Principal');
  const bondBps = clampInt(input.bondBps, 0, RISK_BPS, 'Bond ratio');
  const bondRecoveryBps = clampInt(input.bondRecoveryBps, 0, RISK_BPS, 'Bond recovery');
  const bond = Math.floor(principal * bondBps / RISK_BPS);
  const recoveredBond = Math.floor(bond * bondRecoveryBps / RISK_BPS);
  const lossPerDefault = Math.max(0, principal - recoveredBond);
  const probabilities = normalize(defaultCountDistribution(n, pBps / RISK_BPS, rhoBps / RISK_BPS));
  return probabilities.map((probability, defaults) => ({ defaults, probability, loss: defaults * lossPerDefault }));
}

function riskPrice(input: RiskInput, pdBps: number): { expectedLoss: number; expectedShortfall: number; feeRevenue: number; riskPrice: number; margin: number } {
  const distribution = distributionFor(input, pdBps);
  const confidence = clampInt(input.confidenceBps, 9_000, 9_999, 'Confidence level') / RISK_BPS;
  const expectedLoss = distribution.reduce((sum, point) => sum + point.loss * point.probability, 0);
  const expectedShortfall = exactExpectedShortfall(distribution, confidence);
  const fee = Math.floor(input.principal * clampInt(input.feeBps, 0, RISK_BPS, 'Fee ratio') / RISK_BPS);
  const feeRevenue = input.exposureCount * (1 - pdBps / RISK_BPS) * fee;
  const operatingCost = input.exposureCount * clampInt(input.operatingCostPerLoan, 0, MAX_PER_LOAN_MICROS, 'Operating cost');
  const capitalCost = Math.max(0, expectedShortfall - expectedLoss) * clampInt(input.capitalChargeBps, 0, RISK_BPS, 'Capital charge') / RISK_BPS;
  const price = expectedLoss + capitalCost + operatingCost;
  return { expectedLoss, expectedShortfall, feeRevenue, riskPrice: price, margin: feeRevenue - price };
}

function breakEvenPd(input: RiskInput): number | null {
  if (input.exposureCount === 0 || input.principal === 0) return null;
  if (riskPrice(input, 0).margin < 0) return 0;
  if (riskPrice(input, RISK_BPS).margin >= 0) return RISK_BPS;
  let low = 0;
  let high = RISK_BPS;
  for (let index = 0; index < 40; index++) {
    const middle = Math.floor((low + high) / 2);
    if (riskPrice(input, middle).margin >= 0) low = middle;
    else high = middle;
  }
  return low;
}

export function calculateRisk(input: RiskInput): RiskMetrics {
  const n = clampInt(input.exposureCount, 0, MAX_EXPOSURES, 'Exposure count');
  const principal = clampInt(input.principal, 0, MAX_PER_LOAN_MICROS, 'Principal');
  const bondBps = clampInt(input.bondBps, 0, RISK_BPS, 'Bond ratio');
  const bondRecoveryBps = clampInt(input.bondRecoveryBps, 0, RISK_BPS, 'Bond recovery');
  const feeBps = clampInt(input.feeBps, 0, RISK_BPS, 'Fee ratio');
  const pdBps = clampInt(input.pdBps, 0, RISK_BPS, 'Default probability');
  const rhoBps = clampInt(input.defaultCorrelationBps, 0, RISK_BPS, 'Default correlation');
  const confidenceBps = clampInt(input.confidenceBps, 9_000, 9_999, 'Confidence level');
  const capitalChargeBps = clampInt(input.capitalChargeBps, 0, RISK_BPS, 'Capital charge');
  const operatingCostPerLoan = clampInt(input.operatingCostPerLoan, 0, MAX_PER_LOAN_MICROS, 'Operating cost');
  const scenarioCapital = clampInt(input.scenarioCapital, 0, Number.MAX_SAFE_INTEGER, 'Scenario capital');
  const bond = Math.floor(principal * bondBps / RISK_BPS);
  const fee = Math.floor(principal * feeBps / RISK_BPS);
  const recoveredBond = Math.floor(bond * bondRecoveryBps / RISK_BPS);
  const lossPerDefault = Math.max(0, principal - recoveredBond);
  const distribution = distributionFor(input);
  const confidence = confidenceBps / RISK_BPS;
  const expectedLoss = distribution.reduce((sum, point) => sum + point.loss * point.probability, 0);
  const valueAtRisk = exactValueAtRisk(distribution, confidence);
  const expectedShortfall = exactExpectedShortfall(distribution, confidence);
  const unexpectedLoss = Math.max(0, expectedShortfall - expectedLoss);
  const expectedFeeRevenue = n * (1 - pdBps / RISK_BPS) * fee;
  const costOfCapital = unexpectedLoss * capitalChargeBps / RISK_BPS;
  const operatingCost = n * operatingCostPerLoan;
  const requiredRiskPrice = expectedLoss + costOfCapital + operatingCost;
  const expectedRiskAdjustedMargin = expectedFeeRevenue - requiredRiskPrice;
  const mandatoryStressLoss = n * lossPerDefault;
  const requiredCapital = Math.max(expectedShortfall, mandatoryStressLoss);
  const capitalGap = Math.max(0, requiredCapital - scenarioCapital);
  const coverageRatioBps = requiredCapital === 0 ? RISK_BPS
    : Math.min(RISK_BPS, Math.floor(scenarioCapital * RISK_BPS / requiredCapital));
  return {
    version: RISK_ENGINE_VERSION, exposureCount: n, principal, bond, recoveredBond, fee, lossPerDefault,
    ead: n * principal, lgdBps: principal > 0 ? Math.floor(lossPerDefault * RISK_BPS / principal) : 0,
    pdBps, defaultCorrelationBps: rhoBps, confidenceBps, bondRecoveryBps,
    expectedLoss, valueAtRisk, expectedShortfall, unexpectedLoss, expectedFeeRevenue,
    costOfCapital, operatingCost, requiredRiskPrice, expectedRiskAdjustedMargin,
    mandatoryStressLoss, requiredCapital, scenarioCapital, capitalGap, coverageRatioBps,
    breakEvenPdBps: breakEvenPd(input), distribution,
  };
}

/**
 * Returns a binding decision only after the credit model has repayment labels,
 * passed out-of-time validation, and has real committed loss-absorbing capital.
 */
export function decideCreditLimit(input: RiskInput, gate: CreditGateInput): CreditDecision {
  const requestedLoans = clampInt(gate.requestedLoans, 0, MAX_EXPOSURES, 'Requested loans');
  const committedCapital = clampInt(gate.committedCapital, 0, Number.MAX_SAFE_INTEGER, 'Committed capital');
  const repaymentLabels = clampInt(gate.repaymentLabels, 0, Number.MAX_SAFE_INTEGER, 'Repayment labels');
  const bindingReasons: string[] = [];
  if (repaymentLabels <= 0) bindingReasons.push('No mature repayment or default labels');
  if (!gate.calibratedPd) bindingReasons.push('Default probability is not calibrated from loan outcomes');
  if (!gate.outOfTimeValidationPassed) bindingReasons.push('Out-of-time credit validation has not passed');
  if (requestedLoans === 0) bindingReasons.push('The selected cohort contains no exposures');
  const principal = clampInt(input.principal, 0, MAX_PER_LOAN_MICROS, 'Principal');
  if (requestedLoans > 0 && principal === 0) bindingReasons.push('Loan principal must be positive');
  const bond = Math.floor(principal * clampInt(input.bondBps, 0, RISK_BPS, 'Bond ratio') / RISK_BPS);
  const recoveredBond = Math.floor(bond * clampInt(input.bondRecoveryBps, 0, RISK_BPS, 'Bond recovery') / RISK_BPS);
  const lossPerDefault = Math.max(0, principal - recoveredBond);
  if (requestedLoans > 0 && lossPerDefault > 0 && committedCapital <= 0) bindingReasons.push('No funded loss-absorbing capital is committed');

  if (bindingReasons.length) return {
    status: 'REJECT', requestedLoans, maximumLoans: 0, approvedPrincipal: 0, bindingReasons,
  };

  const capitalCount = lossPerDefault === 0 ? requestedLoans : Math.floor(committedCapital / lossPerDefault);
  let low = 0;
  let high = Math.min(requestedLoans, capitalCount);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const scenario = calculateRisk({ ...input, exposureCount: middle, scenarioCapital: committedCapital });
    if (scenario.requiredCapital <= committedCapital && scenario.expectedRiskAdjustedMargin >= 0) low = middle;
    else high = middle - 1;
  }
  const maximumLoans = low;
  if (maximumLoans === 0) bindingReasons.push('Risk price exceeds expected fee revenue or the capital limit');
  if (maximumLoans > 0 && maximumLoans < requestedLoans) bindingReasons.push('Committed capital or risk-adjusted economics limits the requested portfolio');
  return {
    status: maximumLoans === 0 ? 'REJECT' : maximumLoans < requestedLoans ? 'REDUCE_LIMIT' : 'APPROVE',
    requestedLoans, maximumLoans, approvedPrincipal: maximumLoans * input.principal, bindingReasons,
  };
}
