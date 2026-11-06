import { describe, expect, it } from 'vitest';
import { DAY, monthStart } from './calendar.js';
import { evidenceFromHistories, historyIndex, monthMetrics, type AccountHistory } from './policy.js';

const wallet = '0x' + '01'.repeat(20);
const start = monthStart('2026-07');
const cutoff = monthStart('2026-10');
const history = (address = wallet): AccountHistory => ({
  proxy_wallet: address,
  points: Array.from({ length: (cutoff - start) / DAY + 1 }, (_, index) => ({
    timestamp: start + DAY * index,
    source_block: 100 + index,
    realized_market_pnl: index * 12,
    volume_usdc: index * 70,
    trade_count: index * 2,
  })),
});

describe('historical credit evidence', () => {
  it('keeps post-cutoff P&L out of the decision and its hash', () => {
    const before = history();
    const evidence = evidenceFromHistories([before], '2026-09');
    expect(evidence.decision.qualified).toBe(true);
    before.points.push({ timestamp: cutoff + DAY, source_block: 900, realized_market_pnl: -50_000, volume_usdc: 100_000, trade_count: 1000 });
    expect(evidenceFromHistories([before], '2026-09')).toEqual(evidence);
  });

  it('fails closed on incomplete, nonmonotonic or unaudited observations', () => {
    const incomplete = history();
    incomplete.points.splice(2, 1);
    expect(monthMetrics([historyIndex(incomplete)], '2026-07')).toBeNull();
    const invalid = history();
    invalid.points[2].volume_usdc = 0;
    expect(monthMetrics([historyIndex(invalid)], '2026-07')).toBeNull();
    expect(monthMetrics([historyIndex(history())], '2026-07', new Set())).toBeNull();
  });

  it('requires unique wallets and commits the sorted group', () => {
    const first = history();
    const second = history('0x' + '02'.repeat(20));
    expect(() => evidenceFromHistories([first, first], '2026-09')).toThrow(/distinct/);
    const combined = evidenceFromHistories([first, second], '2026-09');
    expect(combined.digest).toEqual(evidenceFromHistories([second, first], '2026-09').digest);
    expect(combined.windows[2]?.pnl).toBe(2 * evidenceFromHistories([first], '2026-09').windows[2]!.pnl);
  });
});
