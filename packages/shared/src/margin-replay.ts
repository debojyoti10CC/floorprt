import { isAddressEqual, keccak256, parseEventLogs, type PublicClient } from 'viem';
import { z } from 'zod';
import { ArcTestReportRelayAbi, MarginCreditDeskAbi, TraderCreditKeeperAbi } from './abis.generated';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_USDC } from './arc';
import type { Deployment } from './chain';

const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/i).transform(value => value as `0x${string}`);
const address = z.string().regex(/^0x[0-9a-f]{40}$/i).transform(value => value as `0x${string}`);
export const marginReplaySchema = z.object({
  mode: z.enum(['CRE_CLI_LOCAL_REPLAY', 'CRE_CLI_ARC_REPLAY']),
  chainId: z.union([z.literal(31337), z.literal(ARC_TESTNET_CHAIN_ID)]),
  desk: address, deskCodeHash: hex32,
  loanId: z.string().regex(/^[1-9]\d{0,18}$/).transform(value => BigInt(value)),
  receipts: z.object({ request: hex32, initialMark: hex32, fund: hex32, liquidation: hex32, shares: hex32 }),
});

type ReplayClient = Pick<PublicClient, 'getBlock' | 'getChainId' | 'getCode' | 'readContract' | 'getTransactionReceipt'>;

/** Re-read canonical receipts and contract state. Never trust amounts in the bundled JSON. */
export async function verifyMarginReplay(client: ReplayClient, deployment: Deployment, input: unknown) {
  const { mode, chainId, desk, deskCodeHash, loanId, receipts } = marginReplaySchema.parse(input);
  const arc = chainId === ARC_TESTNET_CHAIN_ID;
  const margin = deployment.traderCredit?.arcMargin;
  const relay = deployment.traderCredit?.testRelay;
  if (chainId !== deployment.chainId || mode !== (arc ? 'CRE_CLI_ARC_REPLAY' : 'CRE_CLI_LOCAL_REPLAY')
    || (arc && (!margin || !relay || deployment.mockCollateral
      || !isAddressEqual(deployment.contracts.CollateralToken, ARC_TESTNET_USDC)
      || !isAddressEqual(desk, margin.desk) || deskCodeHash !== margin.deskCodeHash))) {
    throw new Error('Replay proof does not match the lending deployment.');
  }
  const head = await client.getBlock({ blockTag: arc ? 'finalized' : 'latest' });
  const [chain, code, loan, pledgeReceipt, initialReceipt, fundReceipt, liquidationReceipt, sharesReceipt] = await Promise.all([
    client.getChainId(), client.getCode({ address: desk, blockNumber: head.number }),
    client.readContract({ address: desk, abi: MarginCreditDeskAbi, functionName: 'getLoan', args: [loanId], blockNumber: head.number }),
    ...[receipts.request, receipts.initialMark, receipts.fund, receipts.liquidation, receipts.shares]
      .map(hash => client.getTransactionReceipt({ hash })),
  ]);
  const allReceipts = [pledgeReceipt, initialReceipt, fundReceipt, liquidationReceipt, sharesReceipt];
  if (chain !== chainId || !code || keccak256(code) !== deskCodeHash || loan.state !== 4
    || allReceipts.some(receipt => receipt.status !== 'success' || receipt.blockNumber > head.number)) {
    throw new Error('Replay receipts or contract state do not match the finalized lending chain.');
  }
  const blocks = await Promise.all(allReceipts.map(receipt => client.getBlock({ blockNumber: receipt.blockNumber })));
  if (allReceipts.some((receipt, i) => receipt.blockHash !== blocks[i].hash)) throw new Error('Replay receipt is not canonical.');
  for (let i = 1; i < allReceipts.length; i++) {
    const previous = allReceipts[i - 1]; const current = allReceipts[i];
    if (current.blockNumber < previous.blockNumber || current.blockNumber === previous.blockNumber && current.transactionIndex <= previous.transactionIndex) {
      throw new Error('Replay receipts are not in lifecycle order.');
    }
  }
  if (arc && margin && relay) {
    const [relayCode, keeperCode, operator, keeperDesk, forwarder, owner, workflowId, asset] = await Promise.all([
      client.getCode({ address: relay.address, blockNumber: head.number }),
      client.getCode({ address: margin.keeper, blockNumber: head.number }),
      client.readContract({ address: relay.address, abi: ArcTestReportRelayAbi, functionName: 'operator', blockNumber: head.number }),
      client.readContract({ address: margin.keeper, abi: TraderCreditKeeperAbi, functionName: 'desk', blockNumber: head.number }),
      ...(['forwarder', 'workflowOwner', 'workflowId', 'asset'] as const).map(functionName => client.readContract({ address: desk, abi: MarginCreditDeskAbi, functionName, blockNumber: head.number })),
    ]);
    if (!relayCode || keccak256(relayCode) !== relay.codeHash || !keeperCode || keccak256(keeperCode) !== margin.keeperCodeHash
      || !isAddressEqual(keeperDesk, desk) || !isAddressEqual(forwarder, relay.address)
      || !isAddressEqual(owner, operator) || workflowId !== relay.workflowId || !isAddressEqual(asset, ARC_TESTNET_USDC)
      || [initialReceipt, liquidationReceipt, sharesReceipt].some(receipt => !receipt.to || !isAddressEqual(receipt.to, relay.address))) {
      throw new Error('Arc replay relay, workflow or keeper binding mismatch.');
    }
  }
  const fromDesk = (logs: typeof initialReceipt.logs) => logs.filter(log => isAddressEqual(log.address, desk));
  const pledge = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginPledged', logs: fromDesk(pledgeReceipt.logs) }).find(event => event.args.loanId === loanId)?.args;
  const initial = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarketMark', logs: fromDesk(initialReceipt.logs) }).find(event => event.args.loanId === loanId)?.args;
  const fund = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderLoanFunded', logs: fromDesk(fundReceipt.logs) }).find(event => event.args.loanId === loanId)?.args;
  const logs = fromDesk(liquidationReceipt.logs);
  const latest = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarketMark', logs }).find(event => event.args.loanId === loanId)?.args;
  const liquidation = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginLiquidated', logs }).find(event => event.args.loanId === loanId)?.args;
  const recovery = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderLoanDefaulted', logs }).find(event => event.args.loanId === loanId)?.args;
  const release = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'MarginSharesReleased', logs: fromDesk(sharesReceipt.logs) }).find(event => event.args.loanId === loanId)?.args;
  if (!pledge || !initial || !fund || !latest || !liquidation || !recovery || !release) throw new Error('Missing directional recovery events.');
  const bid = await client.readContract({ address: desk, abi: MarginCreditDeskAbi, functionName: 'backstops', args: [pledge.offer], blockNumber: head.number });
  if (fund.principal !== loan.terms.principal || fund.maturity !== loan.maturity || !isAddressEqual(fund.lender, loan.lender)
    || isAddressEqual(loan.borrower, loan.lender) || !isAddressEqual(bid[0], release.recipient)
    || !isAddressEqual(bid[1], loan.borrower) || bid[2] !== pledge.shares || bid[3] !== liquidation.proceeds || bid[4] !== loanId || !bid[5]
    || release.shares !== pledge.shares || recovery.lenderPaid !== loan.terms.due || recovery.unpaidDue !== 0n || recovery.principalLoss !== 0n
    || initial.backing !== loan.terms.bond + pledge.shares * initial.price / 1_000_000n
    || latest.backing !== loan.terms.bond + pledge.shares * latest.price / 1_000_000n
    || liquidation.backing !== latest.backing || initial.backing === 0n || latest.backing === 0n
    || loan.terms.due * 10_000n > initial.backing * 8_000n || loan.terms.due * 10_000n < latest.backing * 9_000n
    || initial.observedAt > blocks[1].timestamp || blocks[1].timestamp - initial.observedAt > 900n
    || latest.observedAt > blocks[3].timestamp || blocks[3].timestamp - latest.observedAt > 900n
    || latest.observedAt <= initial.observedAt || blocks[3].timestamp >= loan.maturity) {
    throw new Error('The receipts do not show the exact collateral, LTV breach and full directional recovery.');
  }
  return { loan, initial, latest, liquidation, recovery, release, receipts, desk, loanId, block: head,
    liquidationBlock: liquidationReceipt.blockNumber, releaseBlock: sharesReceipt.blockNumber,
    delivery: arc ? 'CRE_SIMULATION_OPERATOR_RELAY' as const : 'LOCAL_SIMULATION_FORWARDER' as const };
}
