import { createPublicClient, http, type Address } from 'viem';
import { polygon } from 'viem/chains';
import { monthOf, monthStart, offsetMonth } from './calendar.js';
import { boundaryBlockMaxima, evidenceFromHistories, type Evidence } from './policy.js';
import { POLYGON_RPC, polygonBlockTime, readPnlHistory } from './sources.js';
import { verifyControllers } from './controllers.js';

export async function readLiveControllers(wallets: readonly Address[], controllers: readonly Address[]) {
  const client = createPublicClient({ chain: polygon, transport: http(POLYGON_RPC, { timeout: 10000, retryCount: 1 }) });
  await verifyControllers(wallets, controllers, async (to, data) => {
    const result = await client.call({ to, data, blockTag: 'finalized' });
    if (!result.data) throw new Error('Polygon did not return a wallet verification.');
    return result.data;
  });
}

export function lastCompleteMonth(now = Math.floor(Date.now() / 1000)) {
  return offsetMonth(monthOf(now), -1);
}

export async function readLiveEvidence(wallets: string[], month: string): Promise<Evidence> {
  const requested = wallets.map(wallet => wallet.toLowerCase()).sort();
  if (requested.length < 1 || requested.length > 4 || new Set(requested).size !== requested.length
    || requested.some(wallet => !/^0x[0-9a-f]{40}$/.test(wallet))) {
    throw new Error('Provide one to four distinct EVM addresses.');
  }
  if (monthStart(offsetMonth(month, 1)) > Date.now() / 1000) throw new Error('Choose a completed UTC month.');
  const histories = await Promise.all(requested.map(async wallet => {
    const history = await readPnlHistory(wallet);
    return history ?? { proxy_wallet: wallet, points: [] };
  }));
  const audits = await Promise.all([...boundaryBlockMaxima(histories, month)].map(async ([timestamp, block]) => {
    if (block <= 0) return null;
    const blockTime = await polygonBlockTime(block);
    if (blockTime > timestamp) throw new Error('A Polygon snapshot postdates its reporting boundary.');
    return timestamp;
  }));
  return evidenceFromHistories(histories, month, new Set(audits.filter(value => value !== null)));
}
