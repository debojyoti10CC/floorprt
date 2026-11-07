import {
  EVMClient, HTTPClient, LAST_FINALIZED_BLOCK_NUMBER, TxStatus, blockNumber, bytesToHex,
  consensusIdenticalAggregation, cre, encodeCallMsg, hexToBase64, ok, protoBigIntToBigint, text,
  type EVMLog, type HTTPSendRequester, type Runtime,
} from '@chainlink/cre-sdk';
import {
  decodeEventLog, decodeFunctionResult, encodeFunctionData, isAddress, toEventSelector,
  zeroAddress, type Address,
} from 'viem';
import { z } from 'zod';
import { ARC_TESTNET_CHAIN_ID } from '../../../packages/shared/src/arc.js';
import { TraderCreditDeskAbi } from '../../../packages/shared/src/abis.generated.js';
import { monthOf, offsetMonth } from '../../underwriting/calendar.js';
import { boundaryBlockMaxima, evidenceBoundaries, evidenceFromHistories, type AccountHistory } from '../../underwriting/policy.js';
import { parsePnlWindow, PnlApiOrigin } from '../../underwriting/pnl-wire.js';
import { scoreReport } from '../../underwriting/reports.js';
import { verifyControllers } from '../../underwriting/controllers.js';
import { onLoanSweep } from './lifecycle.js';
import { lendingSelector } from './network.js';

const contractAddress = z.string().refine(value => isAddress(value) && value !== zeroAddress).transform(value => value as Address);
export const configSchema = z.object({
  desk: contractAddress,
  chainId: z.union([z.literal(31337), z.literal(11155111), z.literal(ARC_TESTNET_CHAIN_ID)]),
  arcSimulation: z.literal(true).optional(),
  keeper: contractAddress.optional(),
  pnlApiUrl: PnlApiOrigin.optional(),
  replayAt: z.number().int().positive().optional(),
  replayRelayPort: z.number().int().min(1024).max(65535).optional(),
}).refine(config => config.arcSimulation === undefined || config.chainId === ARC_TESTNET_CHAIN_ID)
  .refine(config => config.replayAt === undefined
  ? config.replayRelayPort === undefined
  : (config.chainId === 31337 || config.arcSimulation) && config.keeper !== undefined)
  .refine(config => config.chainId === 31337 || config.arcSimulation || config.pnlApiUrl?.startsWith('https://'),
    'Configure an HTTPS AQRA read API for public CRE delivery.');
export type Config = z.infer<typeof configSchema>;
const requestedTopic = toEventSelector('TraderCreditRequested(uint256,address,bytes32)');
const polygonSelector = EVMClient.SUPPORTED_CHAIN_SELECTORS['polygon-mainnet'];

function fetchHistory(send: HTTPSendRequester, origin: string, wallet: Address, month: string) {
  const url = origin + '/api/v1/underwriting/pnl-window?wallet=' + wallet.toLowerCase() + '&month=' + month;
  const response = send.sendRequest({ method: 'GET', url }).result();
  if (!ok(response)) throw new Error('AQRA P&L window returned ' + response.statusCode);
  return JSON.stringify(parsePnlWindow(JSON.parse(text(response)), wallet, month));
}

export async function onLoanRequested(runtime: Runtime<Config>, log: EVMLog) {
  const { desk, chainId } = runtime.config;
  if (bytesToHex(log.address).toLowerCase() !== desk.toLowerCase()) throw new Error('Unexpected request emitter.');
  const decoded = decodeEventLog({
    abi: TraderCreditDeskAbi,
    eventName: 'TraderCreditRequested',
    data: bytesToHex(log.data),
    topics: log.topics.map(bytesToHex) as [Address, ...Address[]],
  });
  const { loanId, borrower, evidenceDigest } = decoded.args;
  const lending = new EVMClient(lendingSelector(chainId));
  const polygon = new EVMClient(polygonSelector);
  if (!log.blockNumber) throw new Error('Request log is missing its block number.');
  const requestBlock = blockNumber(protoBigIntToBigint(log.blockNumber));
  const read = (functionName: 'getLoan' | 'traderWallets' | 'traderControllers') => lending.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress, to: desk,
      data: encodeFunctionData({ abi: TraderCreditDeskAbi, functionName, args: [loanId] }),
    }),
    blockNumber: requestBlock,
  });
  const loan = decodeFunctionResult({ abi: TraderCreditDeskAbi, functionName: 'getLoan', data: bytesToHex(read('getLoan').result().data) });
  const wallets = decodeFunctionResult({ abi: TraderCreditDeskAbi, functionName: 'traderWallets', data: bytesToHex(read('traderWallets').result().data) });
  const controllers = decodeFunctionResult({ abi: TraderCreditDeskAbi, functionName: 'traderControllers', data: bytesToHex(read('traderControllers').result().data) });
  const now = BigInt(Math.floor(runtime.now().getTime() / 1000));
  if (loan.state !== 1 || loan.score !== 0 || now >= loan.fundBy || now < loan.terms.asOf
    || loan.borrower.toLowerCase() !== borrower.toLowerCase() || loan.terms.evidenceDigest !== evidenceDigest
    || wallets.length < 1 || wallets.length > 4) {
    throw new Error('Request is stale, invalid or already evaluated.');
  }
  await verifyControllers(wallets, controllers, async (to, data) => bytesToHex(polygon.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to, data }), blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result().data));

  const month = offsetMonth(monthOf(Number(loan.terms.asOf)), -1);
  const boundaries = evidenceBoundaries(month);
  const through = boundaries[boundaries.length - 1];
  if (BigInt(through) !== loan.terms.asOf) throw new Error('Evidence must end at a UTC month boundary.');
  const origin = runtime.config.pnlApiUrl ?? 'http://127.0.0.1:8787';
  const httpClient = new HTTPClient();
  const fetches = wallets.map(wallet => httpClient.sendRequest(runtime, fetchHistory, consensusIdenticalAggregation<string>())(
    origin, wallet, month,
  ));
  const histories = fetches.map(response => JSON.parse(response.result()) as AccountHistory);
  const verified = new Set<number>();
  for (const [timestamp, block] of boundaryBlockMaxima(histories, month)) {
    if (block <= 0) continue;
    const response = polygon.headerByNumber(runtime, { blockNumber: blockNumber(block) }).result();
    if (!response.header || response.header.timestamp > BigInt(timestamp)) {
      throw new Error('Polygon source block is missing or postdates the cutoff.');
    }
    verified.add(timestamp);
  }
  const evidence = evidenceFromHistories(histories, month, verified);
  if (!evidence.decision.qualified) {
    runtime.log('Credit held for request ' + loanId + ' · ' + evidence.decision.reason);
    return 'Held';
  }
  const payload = scoreReport({
    desk, chainId, id: loanId, borrower, walletSetHash: loan.walletSetHash, evidenceDigest, asOf: loan.terms.asOf,
  }, evidence);
  // Anvil uses its own local forwarder. Return the exact receiver payload for comparison in CRE simulation.
  if (chainId === 31337 || runtime.config.arcSimulation) {
    runtime.log('Simulated score ' + evidence.decision.score + ' · request ' + loanId + ' · payload ' + payload);
    return payload;
  }
  const report = runtime.report({
    encodedPayload: hexToBase64(payload),
    encoderName: 'evm',
    signingAlgo: 'ecdsa',
    hashingAlgo: 'keccak256',
  }).result();
  const result = lending.writeReport(runtime, { receiver: desk, report, gasConfig: { gasLimit: '300000' } }).result();
  if (result.txStatus !== TxStatus.SUCCESS) throw new Error('Forwarder rejected the report: ' + result.errorMessage);
  const hash = result.txHash ? bytesToHex(result.txHash) : '0x';
  runtime.log('Score ' + evidence.decision.score + ' · request ' + loanId + ' · ' + hash);
  return hash;
}

export function initWorkflow(config: Config) {
  const client = new EVMClient(lendingSelector(config.chainId));
  return [
    cre.handler(client.logTrigger({
      addresses: [hexToBase64(config.desk)],
      topics: [{ values: [hexToBase64(requestedTopic)] }],
      confidence: 'CONFIDENCE_LEVEL_FINALIZED',
    }), onLoanRequested),
    ...(config.keeper ? [cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: '0 * * * * *' }), onLoanSweep)] : []),
  ];
}
