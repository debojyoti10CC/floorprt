import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, keccak256, type Abi, type AbiEvent, type Hex, type TransactionReceipt } from 'viem';
import { MarginCreditDeskAbi } from './abis.generated';
import { verifyMarginReplay } from './margin-replay';
import type { Deployment } from './chain';

const desk = '0x1111111111111111111111111111111111111111';
const borrower = '0x2222222222222222222222222222222222222222';
const lender = '0x3333333333333333333333333333333333333333';
const bidder = '0x4444444444444444444444444444444444444444';
const hash = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hex;
const loan = { borrower, lender, state: 4, maturity: 1000n, terms: { principal: 1_000_000n, due: 1_020_000n, bond: 250_000n } };
function log(eventName: string, args: Record<string, unknown>) {
  const event = MarginCreditDeskAbi.find(item => item.type === 'event' && item.name === eventName) as AbiEvent;
  const dataInputs = event.inputs.filter(input => !input.indexed);
  return { address: desk, topics: encodeEventTopics({ abi: [event] as Abi, eventName, args }),
    data: encodeAbiParameters(dataInputs, dataInputs.map(input => args[input.name!])), logIndex: 0 };
}
function fixture() {
  const entries = [
    [log('MarginPledged', { loanId: 1n, offer: 1n, shares: 2_400_000n, proceeds: 770_000n })],
    [log('MarketMark', { loanId: 1n, price: 505_000n, backing: 1_462_000n, observedAt: 100n, sourceHash: hash(40) })],
    [log('TraderLoanFunded', { loanId: 1n, lender, principal: 1_000_000n, maturity: 1000n })],
    [log('MarketMark', { loanId: 1n, price: 500n, backing: 251_200n, observedAt: 101n, sourceHash: hash(41) }),
      log('MarginLiquidated', { loanId: 1n, backing: 251_200n, proceeds: 770_000n }),
      log('TraderLoanDefaulted', { loanId: 1n, lenderPaid: 1_020_000n, unpaidDue: 0n, principalLoss: 0n })],
    [log('MarginSharesReleased', { loanId: 1n, recipient: bidder, shares: 2_400_000n })],
  ];
  const receipts = entries.map((logs, i) => ({ status: 'success', blockNumber: BigInt(i + 1), blockHash: hash(i + 100),
    transactionHash: hash(i + 1), transactionIndex: 0, to: desk, logs })) as unknown as TransactionReceipt[];
  const client = {
    getChainId: vi.fn(async () => 31337), getCode: vi.fn(async () => '0x6000' as Hex),
    getBlock: vi.fn(async (args: { blockNumber?: bigint }) => ({ number: args.blockNumber ?? 10n,
      hash: hash(Number(args.blockNumber ?? 10n) + 99), timestamp: 200n })),
    getTransactionReceipt: vi.fn(async ({ hash: tx }: { hash: Hex }) => receipts.find(receipt => receipt.transactionHash === tx)!),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => functionName === 'getLoan' ? loan : [bidder, borrower, 2_400_000n, 770_000n, 1n, true]),
  };
  const deployment = { chainId: 31337 } as Deployment;
  const proof = { chainId: 31337, mode: 'CRE_CLI_LOCAL_REPLAY', desk, deskCodeHash: keccak256('0x6000'), loanId: '1',
    receipts: { request: hash(1), initialMark: hash(2), fund: hash(3), liquidation: hash(4), shares: hash(5) } };
  return { client, deployment, proof, receipts,
    run: () => verifyMarginReplay(client as unknown as Parameters<typeof verifyMarginReplay>[0], deployment, proof) };
}
describe('receipt-backed directional recovery verification', () => {
  it('derives recovery from chain events rather than JSON amounts', async () => {
    const f = fixture();
    const result = await f.run();
    expect(result.recovery.lenderPaid).toBe(1_020_000n);
    expect(result.release.recipient).toBe(bidder);
    expect(result.delivery).toBe('LOCAL_SIMULATION_FORWARDER');
  });
  it('rejects wrong chain, code, failed or noncanonical receipts', async () => {
    const wrongChain = fixture(); wrongChain.client.getChainId.mockResolvedValue(1);
    await expect(wrongChain.run()).rejects.toThrow(/finalized/);
    const wrongCode = fixture(); wrongCode.client.getCode.mockResolvedValue('0x6001');
    await expect(wrongCode.run()).rejects.toThrow(/finalized/);
    const failed = fixture(); failed.receipts[3].status = 'reverted';
    await expect(failed.run()).rejects.toThrow(/finalized/);
    const fork = fixture(); fork.receipts[3].blockHash = hash(999);
    await expect(fork.run()).rejects.toThrow(/canonical/);
  });
  it('rejects out-of-order steps and missing or tampered payouts', async () => {
    const reordered = fixture(); reordered.proof.receipts.fund = hash(4);
    await expect(reordered.run()).rejects.toThrow(/order/);
    const missing = fixture(); missing.receipts[4].logs = [];
    await expect(missing.run()).rejects.toThrow(/Missing/);
    const altered = fixture(); altered.receipts[4].logs = [log('MarginSharesReleased', { loanId: 1n, recipient: borrower, shares: 2_400_000n })] as unknown as TransactionReceipt['logs'];
    await expect(altered.run()).rejects.toThrow(/exact collateral/);
  });
  it('does not confuse a local snapshot with the pinned Arc deployment', async () => {
    const f = fixture(); f.deployment.chainId = 5042002;
    await expect(f.run()).rejects.toThrow(/deployment/);
  });
});
