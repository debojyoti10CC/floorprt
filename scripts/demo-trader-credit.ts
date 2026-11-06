import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createTestClient, createWalletClient, http, isAddress, keccak256, parseEventLogs, zeroHash, type Address } from 'viem';
import { CollateralTokenAbi, MockUSDCAbi, TraderCreditDeskAbi, chainFor, publicClientFor, type Deployment } from '../packages/shared/src/index.js';
import { lastCompleteMonth, readLiveControllers, readLiveEvidence } from '../services/underwriting/live-evidence.js';
import { localReportMetadata, scoreReport } from '../services/underwriting/reports.js';
import type { UnderwritingRun } from '../services/underwriting/report.js';

const deployment = JSON.parse(await readFile('apps/web/public/deployment.json', 'utf8')) as Deployment;
const desk = deployment.contracts.TraderCreditDesk;
const rpcUrl = process.env.FLOOR_RPC_URL ?? deployment.rpcUrl;
assert(desk && deployment.chainId === 31337 && deployment.traderCredit?.mode === 'LOCAL_FORWARDER'
  && deployment.mockCollateral && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpcUrl).hostname),
'The trader replay can only impersonate a historical wallet on the loopback Anvil test deployment.');
const client = publicClientFor(deployment, rpcUrl);
assert.equal(await client.getChainId(), 31337);
const asset = deployment.contracts.CollateralToken;
for (const [address, hash] of [[desk, deployment.codeHashes.TraderCreditDesk], [asset, deployment.codeHashes.CollateralToken]] as const) {
  const code = await client.getCode({ address });
  assert(code && keccak256(code) === hash, 'Local code hash mismatch.');
}
const chain = chainFor(31337, rpcUrl);
const transport = http(rpcUrl);
const test = createTestClient({ chain, transport, mode: 'anvil' });
const wallet = (account: Address) => createWalletClient({ account, chain, transport });
const run = JSON.parse(await readFile('apps/web/public/underwriting/run.json', 'utf8')) as UnderwritingRun;
const row = run.candidates.find(candidate => candidate.month === lastCompleteMonth() && candidate.evidence?.decision.qualified);
assert(row, 'The replay needs a qualifying wallet in the latest completed month. Refresh the source capture first.');
const trader = row.wallet as Address;
const controllerIndex = process.argv.indexOf('--controller');
const controller = controllerIndex === -1 ? trader : process.argv[controllerIndex + 1];
assert(controller && isAddress(controller), 'Provide a valid Polygon controller address.');
const borrower = controller;
const linked = borrower.toLowerCase() !== trader.toLowerCase();
const lender = deployment.roles.lender;
const curator = deployment.roles.curator;
const [evidence] = await Promise.all([readLiveEvidence([trader], row.month), readLiveControllers([trader], [borrower])]);
assert(evidence.decision.qualified, evidence.decision.reason);
const latest = await client.getBlock();
assert(BigInt(evidence.asOf) <= latest.timestamp && latest.timestamp < BigInt(evidence.asOf) + 35n * 86400n,
  'The local chain clock is outside the live evidence window.');
assert.equal(await client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'activeForWallet', args: [borrower] }),
  0n, 'Close the previous local demo request first.');

const principal = 100_000_000n;
const due = 102_000_000n;
const bond = 25_000_000n;
const balance = (account: Address) => client.readContract({ address: asset, abi: CollateralTokenAbi, functionName: 'balanceOf', args: [account] });
const confirmed = async (tx: Promise<`0x${string}`>) => {
  const receipt = await client.waitForTransactionReceipt({ hash: await tx });
  assert.equal(receipt.status, 'success');
  return receipt;
};
const approve = (account: Address, amount: bigint) => confirmed(wallet(account).writeContract({
  address: asset, abi: CollateralTokenAbi, functionName: 'approve', args: [desk, amount],
}));
const readLoan = (id: bigint) => client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'getLoan', args: [id] });
const writeResult = async (result: object) => {
  const json = JSON.stringify(result, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';
  await mkdir('work/underwriting', { recursive: true });
  await writeFile('work/underwriting/local-credit-demo.json', json);
  console.log(json);
};

await test.impersonateAccount({ address: borrower });
try {
  await test.setBalance({ address: borrower, value: 10n ** 18n });
  await confirmed(wallet(borrower).writeContract({ address: asset, abi: MockUSDCAbi, functionName: 'faucet', args: [100_000_000n] }));
  const borrowerBefore = await balance(borrower);
  const lenderBefore = await balance(lender);
  await approve(borrower, bond);
  const terms = {
    principal, due, bond, termSeconds: 30 * 86400, asOf: BigInt(evidence.asOf),
    linkExpires: latest.timestamp + 3600n, evidenceDigest: evidence.digest, ensNode: zeroHash,
  };
  const contract = { address: desk, abi: TraderCreditDeskAbi } as const;
  const request = await confirmed(linked
    ? wallet(borrower).writeContract({ ...contract, functionName: 'requestLoanWithControllers', args: [terms, [trader], [borrower], ['0x']] })
    : wallet(borrower).writeContract({ ...contract, functionName: 'requestLoan', args: [terms, [trader], ['0x']] }));
  const [event] = parseEventLogs({ abi: TraderCreditDeskAbi, eventName: 'TraderCreditRequested', logs: request.logs });
  const id = event.args.loanId;
  const requestEventIndex = request.logs.findIndex(log => log.logIndex === event.logIndex);
  const provenance = {
    mode: 'Loopback Anvil · test collateral · historical wallet impersonated · local forwarder',
    chainId: 31337, desk, id, borrower, trader, polygonControllerVerified: linked, lender, evidenceDigest: evidence.digest, asOf: evidence.asOf,
    score: evidence.decision.score, principal, due, bond, request: request.transactionHash, requestEventIndex,
  };
  const loan = await readLoan(id);
  assert.equal(loan.score, 0);
  assert.equal(await balance(borrower), borrowerBefore - bond);
  await writeFile('services/trader-cre/workflow/config.local.json', JSON.stringify({ desk, chainId: 31337 }, null, 2) + '\n');
  if (process.argv.includes('--pending')) {
    await writeResult({ ...provenance, state: 'Requested' });
  } else {
    const [workflowId, author] = await Promise.all([
      client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'workflowId' }),
      client.readContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'workflowOwner' }),
    ]);
    const report = scoreReport({ desk, chainId: 31337, id, borrower, walletSetHash: loan.walletSetHash,
      evidenceDigest: loan.terms.evidenceDigest, asOf: loan.terms.asOf }, evidence);
    const attest = await confirmed(wallet(curator).writeContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'onReport',
      args: [localReportMetadata(workflowId, author), report] }));
    assert.equal((await readLoan(id)).score, evidence.decision.score);
    await approve(lender, principal);
    const fund = await confirmed(wallet(lender).writeContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'fundLoan', args: [id] }));
    assert.equal((await readLoan(id)).state, 2);
    assert.equal(await balance(borrower), borrowerBefore + principal - bond);
    await approve(borrower, due);
    const repay = await confirmed(wallet(borrower).writeContract({ address: desk, abi: TraderCreditDeskAbi, functionName: 'repay', args: [id] }));
    assert.equal((await readLoan(id)).state, 3);
    assert.equal(await balance(borrower) - borrowerBefore, -2_000_000n);
    assert.equal(await balance(lender) - lenderBefore, 2_000_000n);
    await writeResult({ ...provenance, attestation: attest.transactionHash, funding: fund.transactionHash, repayment: repay.transactionHash,
      borrowerNet: -2_000_000n, lenderNet: 2_000_000n, state: 'Repaid' });
  }
} finally {
  await test.stopImpersonatingAccount({ address: borrower });
}
