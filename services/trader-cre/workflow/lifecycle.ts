import {
  EVMClient, HTTPClient, LAST_FINALIZED_BLOCK_NUMBER, LATEST_BLOCK_NUMBER, TxStatus, bytesToHex,
  consensusIdenticalAggregation, encodeCallMsg, hexToBase64, ok, text,
  type HTTPSendRequester, type Runtime,
} from '@chainlink/cre-sdk';
import {
  decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbiParameters, sha256, stringToHex,
  zeroAddress, type Hex,
} from 'viem';
import { z } from 'zod';
import { MarginCreditDeskAbi, TraderCreditKeeperAbi } from '../../../packages/shared/src/abis.generated.js';
import { parsePnlHistory, pnlUrl } from '../../underwriting/pnl-wire.js';
import type { Config } from './workflow.js';

const lendingSelector = EVMClient.SUPPORTED_CHAIN_SELECTORS['ethereum-testnet-sepolia'];
const MARK_SCHEMA = keccak256(stringToHex('aqra-market-mark-v1'));
const markParameters = parseAbiParameters('bytes32, uint256, address, uint256, uint256, uint96, uint64, bytes32');
const sweepParameters = parseAbiParameters('uint256, address, address, uint256, uint256, uint64, bytes32');
const clob = 'https://clob.polymarket.com';
const captureHash = '0x028492fde972f82ba27c06c43406a3d5a42ad7b566d6acd1e3c464a6a96c4ea1';
const micro = 1_000_000n;
const decimal = z.string().regex(/^\d{1,18}(\.\d{1,12})?$/);
const historySchema = z.object({ history: z.array(z.object({
  t: z.number().int().positive(), p: z.number().min(0).max(1),
})).max(10_000) });
const bookSchema = z.object({
  asset_id: z.string(), timestamp: z.string().regex(/^\d{10,13}$/),
  bids: z.array(z.object({ price: decimal, size: decimal })).max(1_000),
});

const micros = (text: string) => {
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * micro + BigInt(fraction.padEnd(6, '0').slice(0, 6));
};

function fetchMarket(
  send: HTTPSendRequester, token: string, observedAt: number, shares: string[], replayAt?: number, relayPort?: number,
) {
  if (replayAt !== undefined) {
    const origin = relayPort ? 'http://127.0.0.1:' + relayPort : clob;
    const url = origin + '/prices-history?market=' + token + '&interval=max&fidelity=1';
    const response = send.sendRequest({ method: 'GET', url }).result();
    if (!ok(response)) throw new Error('Polymarket price history HTTP ' + response.statusCode);
    if (relayPort && sha256(response.body) !== captureHash) throw new Error('Polymarket replay capture hash mismatch.');
    const point = historySchema.parse(JSON.parse(text(response))).history.find(row => row.t === replayAt);
    if (!point) throw new Error('The requested historical mark is unavailable.');
    return JSON.stringify({
      source: 'POLYMARKET_HISTORY', transport: relayPort ? 'VERIFIED_CAPTURE' : 'DIRECT',
      time: point.t, price: Math.floor(point.p * 1_000_000).toString(),
    });
  }
  const response = send.sendRequest({ method: 'GET', url: clob + '/book?token_id=' + token }).result();
  if (!ok(response)) throw new Error('Polymarket order book HTTP ' + response.statusCode);
  const book = bookSchema.parse(JSON.parse(text(response)));
  const time = Math.floor(Number(book.timestamp) / (book.timestamp.length === 13 ? 1000 : 1));
  if (book.asset_id !== token || time > observedAt + 5 || time < observedAt - 300) {
    throw new Error('Polymarket returned a stale or different order book.');
  }
  const bids = book.bids.map(({ price, size }) => ({ price: micros(price), size: micros(size) }))
    .filter(level => level.price <= micro && level.size > 0n)
    .sort((first, second) => first.price > second.price ? -1 : first.price < second.price ? 1 : 0);
  const prices = shares.map(quantity => markPerShare(bids, BigInt(quantity)).toString());
  const bookHash = keccak256(stringToHex(JSON.stringify(bids.map(level => [level.price.toString(), level.size.toString()]))));
  return JSON.stringify({ source: 'POLYMARKET_BID_DEPTH', time, prices, bookHash });
}

type Market = { source: 'POLYMARKET_HISTORY'; time: number; price: string }
  | { source: 'POLYMARKET_BID_DEPTH'; time: number; prices: string[]; bookHash: Hex };

export type LoanSweepResult = {
  observedAt: string;
  audit: string;
  actions: { loanId: string; action: number }[];
  marks: { loanId: string; price: string; backing: string; debtLtvBps: string; liquidate: boolean; payload: Hex }[];
  sweep?: Hex;
  tx?: Hex;
};

function markPerShare(bids: { price: bigint; size: bigint }[], shares: bigint) {
  let remaining = shares;
  let proceeds = 0n;
  for (const bid of bids) {
    const filled = bid.size < remaining ? bid.size : remaining;
    proceeds += filled * bid.price;
    remaining -= filled;
    if (!remaining) break;
  }
  return proceeds / shares;
}

function fetchActivityAudit(send: HTTPSendRequester, trader: string) {
  const response = send.sendRequest({ method: 'GET', url: pnlUrl(trader) }).result();
  if (!ok(response)) throw new Error('Polymarket performance history HTTP ' + response.statusCode);
  const points = parsePnlHistory(JSON.parse(text(response)), trader)?.points ?? [];
  const latest = points.reduce<number>((maximum, row) => Math.max(maximum, row.timestamp), 0);
  return JSON.stringify({ trader, points: points.length, latest });
}

export function onLoanSweep(runtime: Runtime<Config>): LoanSweepResult {
  const { desk, chainId, keeper, replayAt, replayRelayPort } = runtime.config;
  if (!keeper) throw new Error('The scheduled workflow requires a desk-bound keeper.');
  const client = new EVMClient(lendingSelector);
  const http = new HTTPClient();
  const atBlock = chainId === 31337 ? LATEST_BLOCK_NUMBER : LAST_FINALIZED_BLOCK_NUMBER;
  const read = (to: Hex, data: Hex) => bytesToHex(client.callContract(runtime, {
    call: encodeCallMsg({ from: zeroAddress, to, data }), blockNumber: atBlock,
  }).result().data);
  const keptDesk = decodeFunctionResult({
    abi: TraderCreditKeeperAbi, functionName: 'desk',
    data: read(keeper, encodeFunctionData({ abi: TraderCreditKeeperAbi, functionName: 'desk' })),
  });
  if (keptDesk.toLowerCase() !== desk.toLowerCase()) throw new Error('The keeper points to a different desk.');
  const [first, through, count, observedAt, checks] = decodeFunctionResult({
    abi: TraderCreditKeeperAbi, functionName: 'preview',
    data: read(keeper, encodeFunctionData({ abi: TraderCreditKeeperAbi, functionName: 'preview' })),
  });
  const marginChecks = checks.filter(row => row.directional && row.custodyVerified && row.shares > 0n
    && row.action === 0 && row.lastMark < observedAt);
  const marks: LoanSweepResult['marks'] = [];
  let audit = 'No active borrower';
  if (marginChecks.length) {
    try {
      const token = decodeFunctionResult({
        abi: MarginCreditDeskAbi, functionName: 'referenceTokenId',
        data: read(desk, encodeFunctionData({ abi: MarginCreditDeskAbi, functionName: 'referenceTokenId' })),
      });
      audit = http.sendRequest(runtime, fetchMarket, consensusIdenticalAggregation<string>())(
        token.toString(), Number(observedAt), marginChecks.map(row => row.shares.toString()), replayAt, replayRelayPort,
      ).result();
      const market = JSON.parse(audit) as Market;
      const hash = keccak256(stringToHex(token + ':' + audit));
      for (const [index, row] of marginChecks.entries()) {
        const price = BigInt(market.source === 'POLYMARKET_HISTORY' ? market.price : market.prices[index]);
        const backing = row.bond + row.shares * price / micro;
        const liquidate = row.state === 2 && row.due * 10_000n >= backing * 9_000n;
        marks.push({
          loanId: row.loanId.toString(), price: price.toString(), backing: backing.toString(),
          debtLtvBps: (row.due * 10_000n / backing).toString(), liquidate,
          payload: encodeAbiParameters(markParameters, [MARK_SCHEMA, BigInt(chainId), desk, row.loanId, token, price, observedAt, hash]),
        });
      }
    } catch (error) {
      audit = 'Market mark unavailable';
      runtime.log(audit + ' · ' + String(error));
    }
  } else {
    const trader = checks.find(row => row.trader !== zeroAddress)?.trader;
    if (trader) {
      try {
        audit = http.sendRequest(runtime, fetchActivityAudit, consensusIdenticalAggregation<string>())(trader).result();
      } catch (error) {
        audit = 'Performance audit unavailable';
        runtime.log(audit + ' · ' + String(error));
      }
    }
  }
  const actions = checks.filter(row => row.action !== 0).map(row => ({ loanId: row.loanId.toString(), action: row.action }));
  const rotate = checks.length > 0 && (first > 1n || through < count);
  const sweep = actions.length || rotate ? encodeAbiParameters(sweepParameters, [
    BigInt(chainId), keeper, desk, first, through, observedAt, keccak256(stringToHex(audit)),
  ]) : undefined;
  runtime.log('AQRA checked ' + checks.length + ' loans at ' + observedAt + ' · ' + audit);
  for (const mark of marks) runtime.log('Loan ' + mark.loanId + ' · LTV ' + mark.debtLtvBps + ' bps · liquidate ' + mark.liquidate);

  const output = { observedAt: observedAt.toString(), audit, actions, marks, ...(sweep ? { sweep } : {}) };
  if (chainId === 31337 || !sweep) return output;
  const report = runtime.report({
    encodedPayload: hexToBase64(sweep), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256',
  }).result();
  const result = client.writeReport(runtime, { receiver: keeper, report, gasConfig: { gasLimit: '1800000' } }).result();
  if (result.txStatus !== TxStatus.SUCCESS) throw new Error('Loan servicing failed: ' + result.errorMessage);
  return { ...output, tx: result.txHash ? bytesToHex(result.txHash) : '0x' };
}
