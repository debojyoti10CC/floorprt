import { afterEach, expect, it, vi } from 'vitest';
import { createPublicClient } from 'viem';
import { PolymarketRateLimitError, readPolymarketPortfolio } from './polymarket';

vi.mock('viem', async importOriginal => ({
  ...await importOriginal<typeof import('viem')>(),
  createPublicClient: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const wallet = '0x0000000000000000000000000000000000000001';
const condition = '0x' + '10'.repeat(32);
const activity = (id: string, account = wallet) => ({
  proxy_wallet: account, condition_id: condition, token_id: id, title: 'Market title', outcome: 'Yes',
});

it('uses recent activity to discover tokens, then displays only confirmed positive balances', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ data: [activity('1'), activity('1'), activity('2')] })));
  const readContract = vi.fn().mockResolvedValueOnce([7_042_251n, 0n]).mockResolvedValueOnce([0n, 0n]);
  vi.mocked(createPublicClient).mockReturnValue({
    getChainId: vi.fn().mockResolvedValue(137),
    getBlock: vi.fn().mockResolvedValue({ number: 99n }),
    readContract,
  } as unknown as ReturnType<typeof createPublicClient>);

  const result = await readPolymarketPortfolio(wallet);
  expect(readContract).toHaveBeenCalledTimes(2);
  expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ args: [[wallet, wallet], [1n, 2n]], blockNumber: 99n }));
  expect(result).toMatchObject({
    source: 'ACTIVITY', polygonBlock: '99', matched: [], positions: [{
      id: '1', onchain: { ledger: 'CTF', units: '7042251' }, mark: null, value: null, unrealized: null,
    }],
  });
  expect(result.positions).toHaveLength(1);
});

it('keeps the rate limit visible if fallback activity belongs to a different wallet', async () => {
  const otherWallet = '0x0000000000000000000000000000000000000002';
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ data: [activity('1')] })));

  await expect(readPolymarketPortfolio(otherWallet)).rejects.toBeInstanceOf(PolymarketRateLimitError);
  expect(createPublicClient).not.toHaveBeenCalled();
});
