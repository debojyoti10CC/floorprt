import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { keccak256, type Hex } from 'viem';
import { TraderCreditDeskAbi, publicClientFor, readPositionPledge, type Deployment } from '../packages/shared/src/index';
import { queryCreditPackets, plainCreditPacket } from '../apps/web/src/lib/credit-packet-schema';
import { creditPacketMatches } from '../services/underwriting/credit-packet';
import { readAssessment } from '../services/underwriting/swarm';
import { positionDisclosure } from '../services/underwriting/position-assessment';
import { assertAssessmentEvidence, storageProofBundle } from '../services/underwriting/storage-proof';

// Read-only: no private key, wallet client, upload, publication or monetary transaction.
if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('pnpm storage:verify --deployment <manifest.json> --loan <id> --entity <0x key> --output <proof.json>');
  console.log('Reads Rabdi + the lending chain + Bee. Requires SWARM_BEE_URL; no postage batch or signer needed.');
  process.exit(0);
}
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!['--deployment', '--loan', '--entity', '--output'].includes(args[i]) || !args[i + 1] || options.has(args[i])) {
    throw new Error('Invalid or duplicate arguments. Run pnpm storage:verify --help.');
  }
  options.set(args[i], args[i + 1]);
}
const manifest = options.get('--deployment');
const rawId = options.get('--loan') ?? '';
const entityKey = options.get('--entity') ?? '';
const output = options.get('--output');
if (!manifest || !/^[1-9]\d{0,18}$/.test(rawId) || !/^0x[0-9a-f]{64}$/i.test(entityKey) || !output) {
  throw new Error('Provide --deployment, --loan, --entity and --output. No transactions will be sent.');
}
if (existsSync(output)) throw new Error('Output already exists; choose a new evidence filename.');
const deployment = JSON.parse(await readFile(manifest, 'utf8')) as Deployment;
const desk = deployment.contracts.TraderCreditDesk;
if (!desk) throw new Error('The deployment has no TraderCreditDesk.');
const client = publicClientFor(deployment, process.env.FLOOR_RPC_URL ?? deployment.rpcUrl);
const block = await client.getBlock();
const code = await client.getCode({ address: desk, blockNumber: block.number });
if (await client.getChainId() !== deployment.chainId || !code || keccak256(code) !== deployment.codeHashes.TraderCreditDesk) {
  throw new Error('Lending chain or desk code identity mismatch.');
}
const id = BigInt(rawId);
const contract = { address: desk, abi: TraderCreditDeskAbi, blockNumber: block.number } as const;
const [packets, loan, wallets, hash, reference, pledge] = await Promise.all([
  queryCreditPackets(deployment.chainId, desk, id, process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY?.trim() ?? ''),
  client.readContract({ ...contract, functionName: 'getLoan', args: [id] }),
  client.readContract({ ...contract, functionName: 'traderWallets', args: [id] }),
  client.readContract({ ...contract, functionName: 'assessmentHashOf', args: [id] }),
  client.readContract({ ...contract, functionName: 'assessmentReferenceOf', args: [id] }),
  readPositionPledge(client, deployment, block.number, id),
]);
const entity = packets.find(packet => packet.$key.toLowerCase() === entityKey.toLowerCase());
if (!entity) throw new Error('Entity was not returned by the scoped Rabdi query (at most ten results).');
const packet = plainCreditPacket(entity);
if (!creditPacketMatches(packet, id, loan, block.timestamp, pledge, { hash, reference })) {
  throw new Error('Arkiv does not match an open, attested loan and its immutable report commitment.');
}
const report = await readAssessment(packet.reportRef, packet.reportHash);
assertAssessmentEvidence(report.evidence, loan, wallets);
if (!!pledge !== !!report.position) throw new Error('Missing or unexpected position disclosure.');
if (pledge && report.position && JSON.stringify(positionDisclosure({
  chainId: deployment.chainId, desk, asset: deployment.contracts.CollateralToken, id,
}, loan, pledge, report.position.source)) !== JSON.stringify(report.position)) {
  throw new Error('Swarm position disclosure differs from the lending-chain pledge.');
}
const proof = storageProofBundle({
  arkivChainId: 7794095, lendingChainId: deployment.chainId, desk, packet,
  lendingBlock: block.number, lendingBlockHash: block.hash as Hex, reportBytes: report.bytes,
});
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
console.log(`PASS: Rabdi entity ${packet.key}, borrower ${packet.owner}, ${report.bytes} verified Swarm bytes.`);
console.log(`Saved ${output}. Point-in-time read verification only; no transactions sent.`);
