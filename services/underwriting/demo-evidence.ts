import type { Address } from 'viem';
import { DAY } from './calendar.js';
import { evidenceBoundaries, evidenceFromHistories } from './policy.js';

// Synthetic cumulative points are confined to the local test borrower. The normal scorer consumes them unchanged.
export function demoEvidence(wallet: Address, month: string) {
  const [start, , , end] = evidenceBoundaries(month);
  const points = Array.from({ length: (end - start) / DAY + 1 }, (_, index) => ({
    timestamp: start + index * DAY,
    source_block: index + 1,
    realized_market_pnl: 8 * index - (index % 7 === 6 ? 12 : 0),
    volume_usdc: 84 * index,
    trade_count: 2 * index,
  }));
  return evidenceFromHistories([{ proxy_wallet: wallet, points }], month);
}
