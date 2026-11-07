import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import {
  createPublicClient, createTestClient, createWalletClient, erc20Abi, http, keccak256,
  formatUnits, parseEventLogs, stringToHex, zeroHash, type Address, type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { ArcTestReportRelayAbi, MarginCreditDeskAbi, MockUSDCAbi, TraderCreditKeeperAbi } from '../packages/shared/src/abis.generated.js';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_USDC } from '../packages/shared/src/arc.js';
import type { Deployment } from '../packages/shared/src/chain.js';
import { positionTokenAbi } from '../packages/shared/src/position-credit.js';
import { lastCompleteMonth } from '../services/underwriting/calendar.js';
import { demoEvidence } from '../services/underwriting/demo-evidence.js';
import { localReportMetadata, scoreReport } from '../services/underwriting/reports.js';
import { assessmentSha256, uploadAssessment } from '../services/underwriting/swarm.js';
import { arcClients, arcWork } from './arc-testnet.js';

const arc = process.argv.includes('--arc');
const arcContext = arc ? await arcClients() : undefined;
const arcManifest = arc ? JSON.parse(readFileSync(arcWork + '/deployment.json', 'utf8')) as Deployment : undefined;
const chain = arcContext?.chain ?? foundry;
const rpc = arcContext?.chain.rpcUrls.default.http[0] ?? 'http://127.0.0.1:8550';
const project = 'services/trader-cre';
const evidenceDir = arc ? arcWork + '/replay' : 'work/cre-margin';
const buildName = 'margin.' + process.pid + '.local';
const configName = 'config.' + buildName + '.json';
const wasmName = buildName + '.wasm';
const cli = process.env.CRE_CLI ?? 'cre';
const useCapture = process.argv.includes('--capture');
const runFile = promisify(execFile);
const workflowId = arcManifest?.traderCredit?.testRelay?.workflowId ?? keccak256(stringToHex('aqra-margin-loopback-v1'));
const referenceTokenId = 93957887834338563974539451982699098159783757606297234361279958285677456300272n;
const referenceCondition = '0x6de49a83f6f2da9117056f8fd66c7c3b44625e7a119b2737af3cb3951af2ca67';
const highAt = 1793974817;
const lowAt = 1793975419;
const principal = arc ? 1_000_000n : 50_000_000n;
const due = principal * 102n / 100n;
const bond = principal / 4n;
const proceeds = due - bond;
const shares = principal * 24n / 10n;
const client = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ chain, transport: http(rpc) });
const test = createTestClient({ chain: foundry, transport: http(rpc), mode: 'anvil' });

type LoanSweepResult = {
  observedAt: string;
  audit: string;
  actions: { loanId: string; action: number }[];
  marks: { loanId: string; price: string; backing: string; debtLtvBps: string; liquidate: boolean; payload: Hex }[];
  sweep?: Hex;
};

const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const bytecode = (name: string): Hex =>
  JSON.parse(readFileSync('packages/contracts/out/' + name + '.sol/' + name + '.json', 'utf8')).bytecode.object;
const receipt = async (hash: Hex) => {
  const result = await client.waitForTransactionReceipt({ hash, pollingInterval: 50 });
  assert.equal(result.status, 'success', hash + ' reverted');
  return result;
};
const deployed = async (hash: Hex) => {
  const result = await receipt(hash);
  assert(result.contractAddress, 'Missing deployment address');
  return result.contractAddress;
};
const advance = async (observedAt: string) => {
  if (!arc) {
    await test.setNextBlockTimestamp({ timestamp: (await client.getBlock()).timestamp + 2n });
    await test.mine({ blocks: 1 });
    return;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await client.getBlock({ blockTag: 'finalized' })).timestamp > BigInt(observedAt)) return;
    await delay(1_000);
  }
  throw new Error('Arc Testnet did not advance past the previous observation.');
};

async function simulate(stage: string, desk: Address, keeper: Address, replayAt: number, replayRelayPort?: number) {
  writeFileSync(project + '/workflow/' + configName, json({
    desk, keeper, chainId: chain.id, arcSimulation: arc ? true : undefined, replayAt, replayRelayPort,
  }));
  const run = await runFile(cli, ['workflow', 'simulate', './workflow', '--target', arc ? 'arc-simulation' : 'margin-simulation', '--non-interactive',
    '--trigger-index', '1', '--wasm', wasmName, '--config', configName], {
    cwd: project, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: 240_000, windowsHide: true,
  }).catch((error: Error & { stdout?: string; stderr?: string }) => ({ stdout: error.stdout, stderr: error.stderr, error }));
  const stdout = (run.stdout ?? '').replace(/\x1b\[[0-9;]*[a-z]/gi, '');
  const stderr = (run.stderr ?? '').replace(/\x1b\[[0-9;]*[a-z]/gi, '');
  const transcript = runDir + '/' + stage + '.log';
  writeFileSync(transcript, stdout + '\n' + stderr);
  if ('error' in run) throw new Error('CRE ' + stage + ' failed. See ' + transcript + '\n' + run.error.message);
  const marker = 'Workflow Simulation Result:';
  const start = stdout.indexOf(marker);
  assert(start >= 0, 'CRE did not return a successful result. See ' + transcript);
  const output = stdout.slice(start + marker.length);
  const result = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)) as LoanSweepResult;
  for (const payload of [...result.marks.map(mark => mark.payload), ...(result.sweep ? [result.sweep] : [])]) {
    assert.match(payload, /^0x[0-9a-f]+$/i, 'Invalid CRE report encoding');
  }
  console.log('CRE CLI simulation · ' + stage + ' · ' + transcript);
  return result;
}

async function simulateMark(stage: string, desk: Address, keeper: Address, replayAt: number) {
  if (!useCapture) {
    const direct = await simulate(stage, desk, keeper, replayAt);
    if (direct.audit !== 'Market mark unavailable') return direct;
  }
  const path = '/prices-history?market=' + referenceTokenId + '&interval=max&fidelity=1';
  const capture = readFileSync('evidence/cre-margin-polymarket.json');
  const relay = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== path) return void response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(capture);
  });
  await new Promise<void>((resolve, reject) => {
    relay.once('error', reject);
    relay.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = relay.address();
    assert(address && typeof address !== 'string');
    const result = await simulate(stage + '-capture', desk, keeper, replayAt, address.port);
    if (!result.marks.length) throw new Error('Polymarket mark unavailable. See ' + runDir);
    return result;
  } finally {
    relay.close();
  }
}

if (existsSync('.env.positions.local')) process.loadEnvFile('.env.positions.local');
assert(process.env.SWARM_DEV_MODE === 'true'
  && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/.test(process.env.SWARM_BEE_URL ?? ''),
'Configure a local Bee and its postage batch for the demo. See docs/TRADER_CREDIT.md.');
assert.equal(await client.getChainId(), chain.id, 'The RPC does not match the selected demo chain');
mkdirSync(evidenceDir, { recursive: true });
const runDir = mkdtempSync(evidenceDir + '/run-');
const actorKeys = arcContext ? [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()] : [];
if (arcContext) writeFileSync(runDir + '/test-actors.json', json(actorKeys), { mode: 0o600, flag: 'wx' });
const actors = arcContext ? [arcContext.account, ...actorKeys.map(key => privateKeyToAccount(key))] : [];
const [curator, borrower, lender, provider] = arcContext ? actors.map(actor => actor.address) : await wallet.getAddresses();
assert(provider && (arc || curator.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'),
  'Use the isolated Anvil test accounts from pnpm cre:chain');
const signer = (address: Address) => {
  if (!arc) return address;
  const actor = actors.find(candidate => candidate.address === address);
  assert(actor, 'Unknown Arc Testnet signer');
  return actor;
};
const build = spawnSync('bun', ['./node_modules/@chainlink/cre-sdk/bin/cre-compile.ts', './main.ts', wasmName, '--skip-type-checks'], {
  cwd: project + '/workflow', stdio: 'inherit', timeout: 180_000, windowsHide: true,
});
assert.equal(build.status, 0, build.error?.message ?? 'The official CRE SDK compiler failed');
const metadata = localReportMetadata(workflowId, curator);
async function localDeployment() {
  const asset = await deployed(await wallet.deployContract({ account: curator, abi: MockUSDCAbi, bytecode: bytecode('MockUSDC') }));
  const ledgerArtifact = JSON.parse(readFileSync(
    'node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json', 'utf8',
  ));
  const ledger = await deployed(await wallet.deployContract({ account: curator, abi: [], bytecode: ledgerArtifact.bytecode as Hex }));
  const token = { address: ledger, abi: positionTokenAbi } as const;
  await receipt(await wallet.writeContract({ ...token, account: curator, functionName: 'prepareCondition', args: [curator, referenceCondition, 2n] }));
  const condition = await client.readContract({ ...token, functionName: 'getConditionId', args: [curator, referenceCondition, 2n] });
  const desk = await deployed(await wallet.deployContract({
    account: curator, abi: MarginCreditDeskAbi, bytecode: bytecode('MarginCreditDesk'),
    args: [asset, curator, curator, workflowId, ledger, condition, referenceTokenId],
  }));
  const keeper = await deployed(await wallet.deployContract({
    account: curator, abi: TraderCreditKeeperAbi, bytecode: bytecode('TraderCreditKeeper'), args: [desk, 2],
  }));
  return { asset, ledger, condition, desk, keeper };
}

async function arcDeployment(manifest: Deployment) {
  const profile = manifest.traderCredit;
  const position = profile?.positionCollateral;
  const margin = profile?.arcMargin;
  const relay = profile?.testRelay;
  const ledger = manifest.contracts.PositionTokenLedger;
  assert(manifest.chainId === ARC_TESTNET_CHAIN_ID && manifest.contracts.CollateralToken === ARC_TESTNET_USDC
    && profile?.mode === 'ARC_TEST_RELAY' && manifest.roles.curator === curator && position && margin && relay && ledger);
  assert.equal(margin.referenceTokenId, referenceTokenId.toString());
  for (const [address, hash] of [[ledger, manifest.codeHashes.PositionTokenLedger], [margin.desk, margin.deskCodeHash],
    [margin.keeper, margin.keeperCodeHash], [relay.address, relay.codeHash]] as const) {
    const code = await client.getCode({ address });
    assert(code && keccak256(code) === hash, 'Arc deployment code mismatch');
  }
  return { asset: ARC_TESTNET_USDC, ledger, condition: position.conditionId, desk: margin.desk, keeper: margin.keeper } as const;
}

const { asset, ledger, condition, desk, keeper } = arcManifest ? await arcDeployment(arcManifest) : await localDeployment();
const token = { address: ledger, abi: positionTokenAbi } as const;
const money = { address: asset, abi: erc20Abi } as const;
const margin = { address: desk, abi: MarginCreditDeskAbi } as const;
const positionId = await client.readContract({ ...margin, functionName: 'tokenId' });
const approve = async (account: Address, spender: Address, amount: bigint) =>
  receipt(await wallet.writeContract({ ...money, account: signer(account), functionName: 'approve', args: [spender, amount] }));
const balance = (account: Address) => client.readContract({ ...money, functionName: 'balanceOf', args: [account] });
const positionBalance = (account: Address) => client.readContract({ ...token, functionName: 'balanceOf', args: [account, positionId] });
const deliver = (receiver: Address, payload: Hex) => {
  const relay = arcManifest?.traderCredit?.testRelay;
  if (relay) return wallet.writeContract({
    account: signer(curator), address: relay.address, abi: ArcTestReportRelayAbi,
    functionName: 'deliver', args: [receiver, workflowId, payload],
  }).then(receipt);
  return wallet.writeContract({ address: receiver, abi: TraderCreditKeeperAbi, account: curator,
    functionName: 'onReport', args: [metadata, payload] }).then(receipt);
};

for (const [account, amount] of [[borrower, shares + bond], [lender, principal], [provider, proceeds]] as const) {
  if (arc) {
    await receipt(await wallet.writeContract({ ...money, account: signer(curator), functionName: 'transfer', args: [account, amount + 250_000n] }));
  } else {
    await receipt(await wallet.writeContract({ address: asset, abi: MockUSDCAbi, account, functionName: 'faucet', args: [amount] }));
  }
}
await approve(borrower, ledger, shares);
await receipt(await wallet.writeContract({
  ...token, account: signer(borrower), functionName: 'splitPosition', args: [asset, zeroHash, condition, [1n, 2n], shares],
}));
await receipt(await wallet.writeContract({ ...token, account: signer(borrower), functionName: 'setApprovalForAll', args: [desk, true] }));
await approve(provider, desk, proceeds);
const reserve = await receipt(await wallet.writeContract({
  ...margin, account: signer(provider), functionName: 'postBackstop', args: [borrower, shares, proceeds],
}));
const [posted] = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'BackstopPosted', logs: reserve.logs });
assert(posted);
const offer = posted.args.offer;
await approve(borrower, desk, bond);
const timestamp = (await client.getBlock()).timestamp;
const evidence = demoEvidence(borrower, lastCompleteMonth(Number(timestamp)));
const terms = {
  principal, due, bond, termSeconds: 86400, asOf: BigInt(evidence.asOf), linkExpires: timestamp + 86400n,
  evidenceDigest: evidence.digest, ensNode: zeroHash,
};
const request = await receipt(await wallet.writeContract({
  ...margin, account: signer(borrower), functionName: 'requestMarginLoan', args: [terms, [borrower], [borrower], ['0x'], offer],
}));
const [requested] = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderCreditRequested', logs: request.logs });
assert(requested);
const id = requested.args.loanId;
const loan = () => client.readContract({ ...margin, functionName: 'getLoan', args: [id] });
assert.equal(await positionBalance(desk), shares, 'Shares were not locked');
assert.equal(await balance(desk), bond + proceeds, 'Recovery cash was not locked');

// Local borrower fixture. The official scheduled run verifies custody and fetches the actual market observations.
const attestation = scoreReport({ desk, chainId: chain.id, id, borrower,
  walletSetHash: (await loan()).walletSetHash, evidenceDigest: evidence.digest, asOf: terms.asOf }, evidence);
const score = await deliver(desk, attestation);
const hash = assessmentSha256(evidence);
const consentMessage = 'AQRA test borrower · publish assessment ' + hash + ' · ' + desk + ' · ' + id;
const signature = await wallet.signMessage({ account: signer(borrower), message: consentMessage });
assert(await client.verifyMessage({ address: borrower, message: consentMessage, signature }), 'Report consent did not verify');
const stored = await uploadAssessment(evidence);
assert.equal(stored.sha256, hash);
const assessment = await receipt(await wallet.writeContract({
  ...margin, account: signer(borrower), functionName: 'commitAssessment',
  args: [id, ('0x' + stored.sha256) as Hex, ('0x' + stored.reference) as Hex],
}));

const high = await simulateMark('01-origination-mark', desk, keeper, highAt);
assert.equal(high.marks.length, 1);
assert.equal(high.marks[0].price, '505000');
assert.equal(high.marks[0].debtLtvBps, '6976');
assert.equal(high.marks[0].liquidate, false);
const initial = await deliver(desk, high.marks[0].payload);
await approve(lender, desk, principal);
const funded = await receipt(await wallet.writeContract({ ...margin, account: signer(lender), functionName: 'fundLoan', args: [id] }));
const active = await loan();
assert.equal(active.state, 2);
const before = await balance(lender);

await advance(high.observedAt);
const low = await simulateMark('02-liquidation-mark', desk, keeper, lowAt);
assert.equal(low.marks.length, 1);
assert.equal(low.marks[0].price, '500');
assert.equal(low.marks[0].liquidate, true);
const liquidated = await deliver(desk, low.marks[0].payload);
assert((await client.getBlock({ blockNumber: liquidated.blockNumber })).timestamp < active.maturity, 'Liquidation came after maturity');
assert.equal((await loan()).state, 4);
assert.equal(await balance(lender) - before, due, 'Lender did not receive full due');
assert.equal(await balance(desk), 0n, 'Recovered cash remains in escrow');
const [recovered] = parseEventLogs({ abi: MarginCreditDeskAbi, eventName: 'TraderLoanDefaulted', logs: liquidated.logs });
assert(recovered && recovered.args.lenderPaid === due && recovered.args.unpaidDue === 0n && recovered.args.principalLoss === 0n);

await advance(low.observedAt);
const release = await simulate('03-release-shares', desk, keeper, lowAt);
assert.deepEqual(release.actions, [{ loanId: id.toString(), action: 3 }]);
assert(release.sweep, 'CRE did not return the share release report');
const released = await deliver(keeper, release.sweep);
assert.equal(await positionBalance(provider), shares, 'The bid provider did not receive the shares');
assert.equal(await positionBalance(desk), 0n, 'Shares remain in escrow');

const code = await client.getCode({ address: desk });
assert(code);
const proof = {
  mode: arc ? 'CRE_CLI_ARC_REPLAY' : 'CRE_CLI_LOCAL_REPLAY', chainId: chain.id, desk, keeper, deskCodeHash: keccak256(code), loanId: id,
  source: { referenceTokenId, referenceCondition, highAt, lowAt },
  receipts: {
    reserve: reserve.transactionHash, request: request.transactionHash, score: score.transactionHash,
    assessment: assessment.transactionHash, initialMark: initial.transactionHash, fund: funded.transactionHash,
    liquidation: liquidated.transactionHash, shares: released.transactionHash,
  },
  swarmReference: stored.reference, marks: [high.marks[0], low.marks[0]], releasedShares: shares,
};
writeFileSync(runDir + '/proof.json', json({ ...proof, simulation: { high, low, release } }));
writeFileSync(evidenceDir + '/proof.json', json({ ...proof, simulation: { high, low, release }, runDir }));
writeFileSync(arc ? 'apps/web/public/cre-margin.arc.json' : 'apps/web/public/cre-margin.local.json', json(proof));
console.log('Early liquidation · lender received ' + formatUnits(due, 6) + ' test USDC · ' + liquidated.transactionHash);
console.log('Backstop claimed ' + formatUnits(shares, 6) + ' test shares · ' + released.transactionHash);
console.log('Receipts and simulation output · ' + evidenceDir + '/proof.json');
