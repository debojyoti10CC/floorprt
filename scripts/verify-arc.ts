import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { erc20Abi, formatUnits, keccak256 } from 'viem';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC, ARC_TESTNET_USDC, publicClientFor, jsonSafe, MarginCreditDeskAbi, positionTokenAbi, type Deployment } from '../packages/shared/src/index';
import { verifyMarginReplay } from '../packages/shared/src/margin-replay';

if (process.argv.includes('--help')) {
  console.log('pnpm arc:verify [--output <new-proof.json>]');
  console.log('Read-only verification of pinned Arc code, canonical receipts, relay bindings and historical ERC-20/share balance deltas. No signer or CRE CLI required.');
  process.exit(0);
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Use --help for arguments.');
const output = args[1];
const deployment = JSON.parse(await readFile('apps/web/public/deployment.arc.json', 'utf8')) as Deployment;
const proof = JSON.parse(await readFile('apps/web/public/cre-margin.arc.json', 'utf8'));
if (deployment.chainId !== ARC_TESTNET_CHAIN_ID || deployment.traderCredit?.mode !== 'ARC_TEST_RELAY') throw new Error('Expected the Arc test-relay deployment.');
const client = publicClientFor(deployment, process.env.ARC_TESTNET_RPC_URL ?? ARC_TESTNET_RPC);
const replay = await verifyMarginReplay(client, deployment, proof);
for (const [name, address] of Object.entries(deployment.contracts)) {
  const code = await client.getCode({ address, blockNumber: replay.block.number });
  if (!code || keccak256(code) !== deployment.codeHashes[name as keyof typeof deployment.codeHashes]) throw new Error('Pinned runtime code mismatch: ' + name);
}
const money = { address: ARC_TESTNET_USDC, abi: erc20Abi } as const;
if (await client.readContract({ ...money, functionName: 'decimals', blockNumber: replay.block.number }) !== 6) throw new Error('Expected six-decimal ERC-20 USDC.');
const tokenId = await client.readContract({ address: replay.desk, abi: MarginCreditDeskAbi, functionName: 'tokenId', blockNumber: replay.block.number });
const ledger = await client.readContract({ address: replay.desk, abi: MarginCreditDeskAbi, functionName: 'positionToken', blockNumber: replay.block.number });
if (ledger.toLowerCase() !== deployment.contracts.PositionTokenLedger?.toLowerCase()) throw new Error('Margin position ledger mismatch.');
const [lenderBefore, lenderAfter, bidderBefore, bidderAfter, escrowBefore, escrowAfter] = await Promise.all([
  ...[replay.liquidationBlock - 1n, replay.liquidationBlock].map(blockNumber => client.readContract({ ...money, functionName: 'balanceOf', args: [replay.loan.lender], blockNumber })),
  ...[replay.releaseBlock - 1n, replay.releaseBlock].map(blockNumber => client.readContract({ address: ledger, abi: positionTokenAbi, functionName: 'balanceOf', args: [replay.release.recipient, tokenId], blockNumber })),
  ...[replay.releaseBlock - 1n, replay.releaseBlock].map(blockNumber => client.readContract({ address: ledger, abi: positionTokenAbi, functionName: 'balanceOf', args: [replay.desk, tokenId], blockNumber })),
]);
if (lenderAfter - lenderBefore !== replay.loan.terms.due || bidderAfter - bidderBefore !== replay.release.shares
  || escrowBefore - escrowAfter !== replay.release.shares) throw new Error('Historical USDC or share balance deltas do not match settlement events.');
const result = jsonSafe({
  schema: 'aqra.arc-verification/v1', observedAt: new Date().toISOString(), chainId: ARC_TESTNET_CHAIN_ID,
  block: replay.block.number, blockHash: replay.block.hash, desk: replay.desk, loanId: replay.loanId,
  delivery: replay.delivery, scoreSource: 'LABELED_TEST_FIXTURE', priceSource: 'RECORDED_POLYMARKET_HISTORY',
  principal: replay.loan.terms.principal, due: replay.loan.terms.due, lender: replay.loan.lender,
  recovered: lenderAfter - lenderBefore, backstop: replay.release.recipient, releasedShares: bidderAfter - bidderBefore,
  receipts: replay.receipts, studioProvenance: 'NOT_VERIFIED_BY_THIS_COMMAND',
  limits: 'Public testnet settlement verification. Not a new CRE CLI run, live DON delivery, mainnet safety, or Arc Studio provenance.',
});
if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); }
console.log(`PASS Arc ${ARC_TESTNET_CHAIN_ID}: ${formatUnits(lenderAfter - lenderBefore, 6)} test USDC recovered, ${formatUnits(bidderAfter - bidderBefore, 6)} outcome shares delivered.`);
console.log(`Delivery: ${replay.delivery}. Studio build/test/deploy provenance remains a separate gate.`);
if (output) console.log('Saved ' + output);
