import { z } from 'zod';

export const POLYMARKET_DATA_API = 'https://data-api.polymarket.com/v2';
const Wallet = z.string().regex(/^0x[0-9a-f]{40}$/i).transform(value => value.toLowerCase());
const DayPoint = z.object({
  timestamp: z.number().int().positive(),
  source_block: z.number().int().nonnegative(),
  realized_market_pnl: z.number().finite(),
  unrealized_pnl: z.number().finite().nullable().optional(),
  volume_usdc: z.number().finite().nonnegative(),
  trade_count: z.number().int().nonnegative(),
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

export function pnlUrl(wallet: string) {
  return POLYMARKET_DATA_API + '/user-pnl?interval=all&fidelity=1d&user=' + Wallet.parse(wallet);
}
