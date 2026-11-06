import { z } from 'zod';
import { DAY } from './calendar.js';
import { evidenceBoundaries } from './policy.js';

export const POLYMARKET_DATA_API = 'https://data-api.polymarket.com/v2';
export const PnlApiOrigin = z.string().regex(/^(?:https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?|http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5})\/?$/)
  .transform(value => value.replace(/\/$/, ''));
const Wallet = z.string().regex(/^0x[0-9a-f]{40}$/i).transform(value => value.toLowerCase());
const ScorePoint = z.object({
  timestamp: z.number().int().positive(),
  source_block: z.number().int().nonnegative(),
  realized_market_pnl: z.number().finite(),
  volume_usdc: z.number().finite().nonnegative(),
  trade_count: z.number().int().nonnegative(),
});
const DayPoint = ScorePoint.extend({ unrealized_pnl: z.number().finite().nullable().optional() });
const ScoreWindow = z.object({
  proxy_wallet: Wallet,
  month: z.string(),
  points: z.array(ScorePoint).max(93),
});
const Response = z.object({
  data: z.object({
    proxy_wallet: Wallet,
    fidelity: z.literal('1d'),
    source_fidelity: z.string().nullable().optional(),
    points: z.array(DayPoint),
  }).nullable(),
});

export type PnlHistory = NonNullable<z.infer<typeof Response>['data']>;
export function parsePnlHistory(input: unknown, expectedWallet: string): PnlHistory | null {
  const history = Response.parse(input).data;
  if (history && history.proxy_wallet !== expectedWallet.toLowerCase()) throw new Error('PnL returned a different wallet.');
  return history;
}

export function pnlUrl(wallet: string, interval: 'all' | '1m' = 'all') {
  return POLYMARKET_DATA_API + '/user-pnl?interval=' + interval + '&fidelity=1d&user=' + Wallet.parse(wallet);
}

export function parsePnlWindow(input: unknown, wallet: string, month: string) {
  const window = ScoreWindow.parse(input);
  if (window.proxy_wallet !== Wallet.parse(wallet) || window.month !== month) {
    throw new Error('P&L window does not match the requested wallet and month.');
  }
  const [start, , , end] = evidenceBoundaries(month);
  window.points.sort((first, second) => first.timestamp - second.timestamp);
  if (window.points.some(({ timestamp }, index) => timestamp < start || timestamp > end
    || timestamp % DAY !== 0 || timestamp === window.points[index - 1]?.timestamp)) {
    throw new Error('P&L window contains an out-of-range or duplicate daily snapshot.');
  }
  return window;
}

export function projectPnlWindow(history: PnlHistory | null, wallet: string, month: string) {
  const [start, , , end] = evidenceBoundaries(month);
  const points = (history?.points ?? []).filter(({ timestamp }) => timestamp >= start && timestamp <= end && timestamp % DAY === 0);
  return parsePnlWindow({ proxy_wallet: history?.proxy_wallet ?? wallet, month, points }, wallet, month);
}
