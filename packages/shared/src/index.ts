export * from './abis.generated';
export * from './chain';
export * from './eligibility';
export * from './feed';
export * from './position-credit';
export * from './position-collateral';
export const REASONS: Record<number,string> = {
  0:'OK_SHARED_SCALAR_THRESHOLD', 1:'ERR_UNKNOWN_MARKET', 2:'ERR_OBSERVATION_MISMATCH',
  3:'ERR_BAD_STRIKE_ORDER', 4:'ERR_ZERO_UNITS', 5:'ERR_ALREADY_RESOLVED_OR_MATURED',
  6:'ERR_NEW_COLLATERAL_DISABLED', 7:'ERR_WRONG_SIDES',
};
export const ASSUMPTIONS = [
  'One immutable observation, price precision and settlement policy for both markets.',
  'Approved issuer holds full test-USDC backing; the vault holds the exact pledged claims.',
  'A trusted test resolver reports price, or anyone invokes shared cancellation at the longstop.',
  'The settlement token remains transferable. Resolver delay can postpone liquidity.',
  'This bound describes terminal contractual payout, not a resale price or guaranteed profit.',
] as const;
