/** Exact integer mathematics. A preview is never an onchain collateral authorization. */
export const UNIT = 1_000_000n;
export const HALF = 500_000n;
export const MAX_UNITS = (1n << 64n) - 1n;
export const RULE = 'FLOOR_PAIR_GEQ_V1';
export type Side = 'YES' | 'NO';
export type Pair = { lower: bigint; upper: bigint; lowerUnits: bigint; upperUnits: bigint };
export type Leg = { strike: bigint; side: Side; units: bigint; observationId: string };

export function parseAmount(text: string, decimals = 6): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('Unsupported decimal precision');
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(text)) throw new Error('Enter a nonnegative decimal amount');
  const [integer, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error(`Maximum ${decimals} decimal places`);
  return BigInt(integer) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function parseUnits(text: string): bigint {
  if (!/^[1-9]\d*$/.test(text)) throw new Error('Claim quantities must be positive whole units');
  const value = BigInt(text);
  if (value > MAX_UNITS) throw new Error('Quantity exceeds uint64');
  return value;
}

export function formatAmount(amount: bigint | string, decimals = 6, digits = 2): string {
  const value = BigInt(amount);
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const raw = abs.toString().padStart(decimals + 1, '0');
  const whole = decimals ? raw.slice(0, -decimals) : raw;
  const fraction = decimals ? raw.slice(-decimals) : '';
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (digits ? '.' + fraction.padEnd(digits, '0').slice(0, digits) : '');
}

export function assertPair(pair: Pair): void {
  if (pair.lower < 0n || pair.lower >= pair.upper) throw new Error('ERR_BAD_STRIKE_ORDER');
  if (pair.lowerUnits < 1n || pair.upperUnits < 1n) throw new Error('ERR_ZERO_UNITS');
  if (pair.lowerUnits > MAX_UNITS || pair.upperUnits > MAX_UNITS) throw new Error('ERR_OVER_MAX_UNITS');
}

export function floorOf(pair: Pair): bigint {
  assertPair(pair);
  return (pair.lowerUnits < pair.upperUnits ? pair.lowerUnits : pair.upperUnits) * UNIT;
}

export function payout(pair: Pair, price: bigint | 'CANCELLED'): bigint {
  assertPair(pair);
  if (price === 'CANCELLED') return (pair.lowerUnits + pair.upperUnits) * HALF;
  if (price < 0n) throw new Error('Negative observation price');
  return (price >= pair.lower ? pair.lowerUnits * UNIT : 0n) + (price < pair.upper ? pair.upperUnits * UNIT : 0n);
}

export function maximumDue(floor: bigint, bufferBps = 2000n): bigint {
  if (floor < 0n || bufferBps < 0n || bufferBps > 10_000n) throw new Error('Invalid debt policy');
  return floor - (floor * bufferBps + 9999n) / 10_000n;
}

export function waterfall(redeemed: bigint, due: bigint) {
  if (due < 0n || redeemed < due) throw new Error('ERR_REDEMPTION_SHORTFALL');
  return { lenderPaid: due, borrowerPaid: redeemed - due };
}

export function scenarios(pair: Pair) {
  assertPair(pair);
  return [
    { state: 'LOW', label: 'Below lower strike', price: pair.lower > 0n ? pair.lower - 1n : 0n },
    { state: 'LOWER_EQUAL', label: 'At lower strike (inclusive)', price: pair.lower },
    { state: 'MID', label: 'Inside interval', price: (pair.lower + pair.upper) / 2n },
    { state: 'UPPER_EQUAL', label: 'At upper strike (exclusive)', price: pair.upper },
    { state: 'HIGH', label: 'Above upper strike', price: pair.upper + 1n },
    { state: 'CANCELLED', label: 'Shared cancellation · 50/50', price: 'CANCELLED' as const },
  ].map(row => ({ ...row, payout: payout(pair, row.price) }));
}

/** P1 research tool only: exact 2–8 leg interval sweep, never used to authorize loans. */
export function analyzeThresholdPortfolio(legs: Leg[]) {
  if (legs.length < 2 || legs.length > 8) throw new Error('Research portfolios require 2–8 legs');
  if (legs.some(l => l.observationId !== legs[0].observationId)) throw new Error('ERR_OBSERVATION_MISMATCH');
  if (legs.some(l => l.strike < 0n || l.units <= 0n || l.units > MAX_UNITS)) throw new Error('Invalid leg');
  const strikes = [...new Set(legs.map(l => l.strike))].sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
  const evaluate = (price: bigint) => legs.reduce((sum, leg) => sum + (((price >= leg.strike) === (leg.side === 'YES')) ? leg.units * UNIT : 0n), 0n);
  const states = [...new Set([0n, ...strikes])].map(price => ({ price: price.toString(), payout: evaluate(price) }));
  const cancelled = legs.reduce((sum, leg) => sum + leg.units * HALF, 0n);
  const minimum = [...states.map(s => s.payout), cancelled].reduce((a,b) => a < b ? a : b);
  return { minimum, maximum: [...states.map(s => s.payout), cancelled].reduce((a,b) => a > b ? a : b), states, cancelled, onchainVerified: false as const };
}
