import type { PolySample } from './sources.js';

export const CORE_SAMPLE_SIZE = 160;
export const TAIL_SAMPLE_SIZE = 40;
export const MIN_DISCOVERY_NOTIONAL = 25;
export const MIN_DISCOVERY_SESSIONS = 2;
export const MIN_BIG_WIN_NOTIONAL = 5;
export const SAMPLE_PROFILES = {
  pilot: { activity: CORE_SAMPLE_SIZE, largeWin: TAIL_SAMPLE_SIZE },
  benchmark: { activity: 500, largeWin: 100 },
} as const;
export type SampleProfile = keyof typeof SAMPLE_PROFILES;

export type SampleCandidate = {
  wallet: string;
  sampledNotional: number;
  sampledFills: number;
  sampledSessions: number;
  bestGrossBuyMultiple: number | null;
  bestFill: { slug: string; tx: string; price: number; cost: number; payout: number; resolvedAt: string } | null;
  buySleeveCost: number;
  buySleevePayout: number;
  group: 'activity' | 'large-win';
};

export function discoverCandidates(
  samples: PolySample[],
  limits: { activity: number; largeWin: number } = SAMPLE_PROFILES.pilot,
) {
  const accounts = new Map<string, Omit<SampleCandidate, 'group' | 'sampledSessions'> & { sessions: Set<string> }>();
  for (const { fills, slot, resolution } of samples) {
    for (const fill of fills) {
      let account = accounts.get(fill.proxy_wallet);
      if (!account) {
        account = {
          wallet: fill.proxy_wallet,
          sampledNotional: 0,
          sampledFills: 0,
          sessions: new Set(),
          bestGrossBuyMultiple: null,
          bestFill: null,
          buySleeveCost: 0,
          buySleevePayout: 0,
        };
        accounts.set(account.wallet, account);
      }
      const cost = fill.price * fill.size;
      account.sampledNotional += cost;
      account.sampledFills++;
      account.sessions.add(slot.slug);
      if (fill.side !== 'BUY' || cost <= 0) continue;
      const payout = fill.size * resolution.payouts[fill.outcome_index] / 1_000_000;
      account.buySleeveCost += cost;
      account.buySleevePayout += payout;
      if (cost < MIN_BIG_WIN_NOTIONAL) continue;
      const multiple = resolution.payouts[fill.outcome_index] / 1_000_000 / fill.price;
      if (multiple > (account.bestGrossBuyMultiple ?? 0)) {
        account.bestGrossBuyMultiple = multiple;
        account.bestFill = {
          slug: slot.slug, tx: fill.transaction_hash, price: fill.price, cost, payout,
          resolvedAt: resolution.resolved_at,
        };
      }
    }
  }

  const all = [...accounts.values()].map(({ sessions, ...account }) => ({
    ...account, sampledSessions: sessions.size,
  }));
  const core: SampleCandidate[] = all.filter(row =>
    row.sampledSessions >= MIN_DISCOVERY_SESSIONS && row.sampledNotional >= MIN_DISCOVERY_NOTIONAL,
  ).sort((a, b) => b.sampledNotional - a.sampledNotional || a.wallet.localeCompare(b.wallet))
    .slice(0, limits.activity)
    .map(row => ({ ...row, group: 'activity' }));
  const coreWallets = new Set(core.map(row => row.wallet));
  const tail: SampleCandidate[] = all.filter(row =>
    (row.bestGrossBuyMultiple ?? 0) >= 10 && !coreWallets.has(row.wallet),
  ).sort((a, b) =>
    b.bestGrossBuyMultiple! - a.bestGrossBuyMultiple! || b.sampledNotional - a.sampledNotional || a.wallet.localeCompare(b.wallet),
  ).slice(0, limits.largeWin)
    .map(row => ({ ...row, group: 'large-win' }));

  return {
    observedWallets: all.length,
    observed10x: all.filter(row => (row.bestGrossBuyMultiple ?? 0) >= 10).length,
    observed100x: all.filter(row => (row.bestGrossBuyMultiple ?? 0) >= 100).length,
    candidates: [...core, ...tail],
  };
}
