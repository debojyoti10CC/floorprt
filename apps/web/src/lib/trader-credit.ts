import { createTestClient, createWalletClient, http, keccak256, parseEventLogs, zeroHash, type Address, type Hex } from 'viem';
import { CollateralTokenAbi, MockUSDCAbi, TraderCreditDeskAbi, chainFor, publicClientFor, readPositionMarket, readPositionPledge, positionTokenAbi, type PositionMarket } from '@floor/shared';
import type { Evidence } from '../../../../services/underwriting/policy';
import { lastCompleteMonth } from '../../../../services/underwriting/calendar';
import { linkContext } from '../../../../services/underwriting/reports';
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

export async function underwritingApi<T>(path: string, signal?: AbortSignal, init: RequestInit = {}): Promise<T> {
  const configured = process.env.NEXT_PUBLIC_FLOOR_API_URL?.trim().replace(/\/+$/, '');
  const base = configured || (['127.0.0.1', 'localhost'].includes(window.location.hostname) ? 'http://127.0.0.1:8787' : '');
  if (!base) throw new Error('Connect an AQRA read API to fetch wallet evidence.');
  const response = await fetch(base + '/api/v1/underwriting' + path, { ...init, signal, cache: 'no-store' });
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
    positionMarket: () => readPositionMarket(client, deployment, block.number),
    pledge: (id: bigint, market?: PositionMarket | null) => readPositionPledge(client, deployment, block.number, id, market),
  };
}

export async function positionInventory(p: CreditConnection, owner: Address) {
  const live = await traderDesk(p);
  const market = await live.positionMarket();
  if (!market) return null;
  const ledger = { address: market.ledger, abi: positionTokenAbi, blockNumber: live.block.number } as const;
  const [code, balances, approved] = await Promise.all([
    live.client.getCode({ address: market.ledger, blockNumber: live.block.number }),
    live.client.readContract({
      ...ledger, functionName: 'balanceOfBatch', args: [[owner, owner], [BigInt(market.yesTokenId), BigInt(market.noTokenId)]],
    }),
    live.client.readContract({ ...ledger, functionName: 'isApprovedForAll', args: [owner, live.address] }),
  ]);
  if (!code || keccak256(code) !== p.deployment?.codeHashes.PositionTokenLedger || balances.length !== 2) {
    throw new Error('The position ledger or wallet balances could not be verified.');
  }
  const [yes, no] = balances;
  return { market, yes, no, pairs: yes < no ? yes : no, approved };
}

export type TraderLoan = Awaited<ReturnType<Awaited<ReturnType<typeof traderDesk>>['loan']>>;

export type LocalDemoStatus = { id: string; state: number; score: number; principal: string; due: string };

function assertLoopbackDemo(p: CreditConnection) {
  if (!p.deployment || p.deployment.chainId !== 31337 || !p.deployment.mockCollateral
    || p.deployment.traderCredit?.mode !== 'LOCAL_FORWARDER'
    || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(p.rpcUrl).hostname)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)) {
    throw new Error('This action is available only on the local Anvil test chain.');
  }
  return p.deployment;
}

function toDemoStatus(id: bigint, loan: TraderLoan): LocalDemoStatus {
  return { id: id.toString(), state: loan.state, score: loan.score,
    principal: loan.terms.principal.toString(), due: loan.terms.due.toString() };
}

export async function currentLocalDemo(p: CreditConnection): Promise<LocalDemoStatus | null> {
  assertLoopbackDemo(p);
  const live = await traderDesk(p);
  const count = await live.client.readContract({ ...live.contract, functionName: 'loanCount' });
  let latest: LocalDemoStatus | null = null;
  for (let id = count; id > 0n && count - id < 10n; id--) {
    const loan = await live.loan(id);
    if (!latest && loan.state > 0) latest = toDemoStatus(id, loan);
    if (loan.state === 1 || loan.state === 2) return toDemoStatus(id, loan);
  }
  return latest;
}

export async function createLocalDemoRequest(p: CreditConnection) {
  const deployment = assertLoopbackDemo(p);
  const live = await traderDesk(p);
  const existing = await currentLocalDemo(p);
  if (existing && (existing.state === 1 || existing.state === 2)) return { status: existing, transaction: null as Hex | null };

  const response = await fetch('/underwriting/run.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('The saved benchmark is unavailable.');
  const run = await response.json() as { candidates: Array<{ month: string; wallet: Address; evidence?: { decision?: { qualified?: boolean } } }> };
  const month = lastCompleteMonth();
  const candidates = run.candidates.filter(row => row.month === month && row.evidence?.decision?.qualified);
  if (!candidates.length) throw new Error('No qualified wallet is available in the latest completed benchmark month.');
  const chain = chainFor(deployment.chainId, p.rpcUrl);
  const test = createTestClient({ chain, transport: http(p.rpcUrl), mode: 'anvil' });
  let lastError: unknown;
  for (const candidate of candidates.slice(0, 20)) {
    const borrower = candidate.wallet;
    if (await live.active(borrower) > 0n) continue;
    let evidence: Evidence;
    try {
      evidence = await underwritingApi<Evidence>('/evidence?' + new URLSearchParams({ wallet: borrower, month }));
    } catch (error) {
      lastError = error;
      continue;
    }
    if (!evidence.decision.qualified || evidence.wallets.length !== 1
      || evidence.wallets[0]?.toLowerCase() !== borrower.toLowerCase()) continue;
    const block = await live.client.getBlock();
    const principal = 100_000_000n;
    const bond = 25_000_000n;
    const terms = {
      principal, due: 102_000_000n, bond, termSeconds: 30 * 86400,
      asOf: BigInt(evidence.asOf), evidenceDigest: evidence.digest, ensNode: zeroHash,
      linkExpires: block.timestamp + 3600n,
    };
    const wallet = createWalletClient({ account: borrower, chain, transport: http(p.rpcUrl) });
    const collateral = { address: deployment.contracts.CollateralToken, abi: CollateralTokenAbi } as const;
    await test.impersonateAccount({ address: borrower });
    try {
      await test.setBalance({ address: borrower, value: 10n ** 18n });
      const balance = await live.client.readContract({ ...collateral, functionName: 'balanceOf', args: [borrower] });
      if (balance < bond) await wallet.writeContract({ address: collateral.address, abi: MockUSDCAbi, functionName: 'faucet', args: [principal] });
      await wallet.writeContract({ ...collateral, functionName: 'approve', args: [live.address, bond] });
      const simulation = await live.client.simulateContract({ ...live.contract, account: borrower, functionName: 'requestLoan', args: [terms, [borrower], ['0x' as Hex]] });
      const hash = await wallet.writeContract({ ...simulation.request, account: borrower, chain });
      const receipt = await live.client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== 'success') throw new Error('The local request transaction reverted.');
      const [event] = parseEventLogs({ abi: TraderCreditDeskAbi, eventName: 'TraderCreditRequested', logs: receipt.logs });
      if (!event) throw new Error('The local request receipt did not contain a request ID.');
      return { status: toDemoStatus(event.args.loanId, await live.loan(event.args.loanId)), transaction: receipt.transactionHash };
    } catch (error) {
      lastError = error;
    } finally {
      await test.stopImpersonatingAccount({ address: borrower });
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'No unencumbered qualified wallet could start a local request.');
}

export async function repaySeededLocalDemo(p: CreditConnection, id: bigint) {
  const deployment = assertLoopbackDemo(p);
  const live = await traderDesk(p);
  const loan = await live.loan(id);
  if (loan.state !== 2) throw new Error('Fund this local demo request before repaying.');
  const chain = chainFor(deployment.chainId, p.rpcUrl);
  const borrower = loan.borrower;
  const test = createTestClient({ chain, transport: http(p.rpcUrl), mode: 'anvil' });
  const wallet = createWalletClient({ account: borrower, chain, transport: http(p.rpcUrl) });
  const collateral = { address: deployment.contracts.CollateralToken, abi: CollateralTokenAbi } as const;
  await test.impersonateAccount({ address: borrower });
  try {
    await test.setBalance({ address: borrower, value: 10n ** 18n });
    const balance = await live.client.readContract({ ...collateral, functionName: 'balanceOf', args: [borrower] });
    if (balance < loan.terms.due) throw new Error('The local demo borrower lacks test USDC for repayment.');
    await wallet.writeContract({ ...collateral, functionName: 'approve', args: [live.address, loan.terms.due] });
    const simulation = await live.client.simulateContract({ ...live.contract, account: borrower, functionName: 'repay', args: [id] });
    const hash = await wallet.writeContract({ ...simulation.request, account: borrower, chain });
    const receipt = await live.client.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error('The local repayment transaction reverted.');
    return receipt.transactionHash;
  } finally {
    await test.stopImpersonatingAccount({ address: borrower });
  }
}

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
