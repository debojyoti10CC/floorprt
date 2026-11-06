import { keccak256, type Address, type Hex } from 'viem';
import { CollateralTokenAbi, TraderCreditDeskAbi, publicClientFor } from '@floor/shared';
import type { useProtocol } from './protocol';

type Protocol = ReturnType<typeof useProtocol>;
export type CreditConnection = Pick<Protocol, 'deployment' | 'rpcUrl'>;
export type EnsGroup = {
  name: string;
  node: Hex;
  primary: Address;
  wallets: Address[];
  source: string;
  block: string;
};

export const sameWallet = (first: Address | null | undefined, second: Address | null | undefined) =>
  Boolean(first && second && first.toLowerCase() === second.toLowerCase());

export async function underwritingApi<T>(path: string, signal?: AbortSignal): Promise<T> {
  const configured = process.env.NEXT_PUBLIC_FLOOR_API_URL?.trim().replace(/\/+$/, '');
  const base = configured || (['127.0.0.1', 'localhost'].includes(window.location.hostname) ? 'http://127.0.0.1:8787' : '');
  if (!base) throw new Error('Connect an AQRA read API to fetch wallet evidence.');
  const response = await fetch(base + '/api/v1/underwriting' + path, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'The AQRA read API is unavailable.');
  return data as T;
}

export async function traderDesk({ deployment, rpcUrl }: CreditConnection) {
  const address = deployment?.contracts.TraderCreditDesk;
  if (!deployment || !address) throw new Error('Trader credit is unavailable on this deployment.');
  const client = publicClientFor(deployment, rpcUrl);
  const [chain, code, block] = await Promise.all([client.getChainId(), client.getCode({ address }), client.getBlock()]);
  if (chain !== deployment.chainId || !code || keccak256(code) !== deployment.codeHashes.TraderCreditDesk) {
    throw new Error('The trader desk address could not be verified on the active chain.');
  }
  const contract = { address, abi: TraderCreditDeskAbi, blockNumber: block.number } as const;
  return {
    address, client, block, contract,
    loan: (id: bigint) => client.readContract({ ...contract, functionName: 'getLoan', args: [id] }),
    active: (wallet: Address) => client.readContract({ ...contract, functionName: 'activeForWallet', args: [wallet] }),
  };
}

export type TraderLoan = Awaited<ReturnType<Awaited<ReturnType<typeof traderDesk>>['loan']>>;

export async function approveTraderCredit(p: Protocol, amount: bigint) {
  if (!p.deployment || !p.address) throw new Error('Connect the signing wallet.');
  const { client, address, block } = await traderDesk(p);
  const collateral = { address: p.deployment.contracts.CollateralToken, abi: CollateralTokenAbi, blockNumber: block.number } as const;
  const [balance, allowance] = await Promise.all([
    client.readContract({ ...collateral, functionName: 'balanceOf', args: [p.address] }),
    client.readContract({ ...collateral, functionName: 'allowance', args: [p.address, address] }),
  ]);
  if (balance < amount) throw new Error('The wallet balance is below the amount required.');
  if (allowance < amount) await p.transact('Approve collateral for trader credit', 'CollateralToken', 'approve', [address, amount]);
}
