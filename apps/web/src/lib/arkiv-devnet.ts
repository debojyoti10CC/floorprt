import {
  createPublicClient, createWalletClient, parseAbi, parseEventLogs, numberToHex, slice, stringToHex,
  zeroAddress, zeroHash, type Address, type Chain, type Hex, type Transport,
} from 'viem';
import type { HDAccount } from 'viem/accounts';
import { z } from 'zod';

// Wire interface of Arkiv arkiv-op-reth v0.1.0-pure-6. Rabdi uses the current SDK.
const registry = '0x4400000000000000000000000000000000000044';
const abi = parseAbi([
  'struct Mime128 { bytes32[4] data; }',
  'struct Attribute { bytes32 name; uint8 valueType; bytes32[4] value; }',
  'struct Operation { uint8 operationType; bytes32 entityKey; bytes payload; Mime128 contentType; Attribute[] attributes; uint32 btl; address newOwner; }',
  'function execute(Operation[] ops)',
]);
const eventAbi = parseAbi([
  'event EntityOperation(bytes32 indexed entityKey, uint8 indexed operationType, address indexed owner, uint32 expiresAt, bytes32 entityHash)',
]);
const devPage = z.object({
  data: z.array(z.object({
    key: z.string().regex(/^0x[0-9a-f]{64}$/i),
    owner: z.string().regex(/^0x[0-9a-f]{40}$/i),
    attributes: z.array(z.object({ key: z.string(), value: z.string() })).max(32),
  })).max(60),
});

export async function queryArkivDevnet(chain: Chain, tag: string, lendingChain: number, desk: Address, id?: bigint) {
  const filters = [
    'app = ' + JSON.stringify(tag),
    'lendingchain = ' + BigInt(lendingChain),
    'desk = ' + JSON.stringify(desk.toLowerCase()),
  ];
  if (id !== undefined) filters.push('loanid = ' + id);
  const response = await fetch(chain.rpcUrls.default.http[0], {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [
      filters.join(' AND '),
      { resultsPerPage: id === undefined ? 60 : 10, includeData: { owner: true, attributes: true } },
    ] }),
  });
  if (!response.ok) throw new Error('The local Arkiv query returned HTTP ' + response.status + '.');
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'The local Arkiv query failed.');
  return devPage.parse(body.result).data.map(entity => ({
    key: entity.key as Hex,
    owner: entity.owner as Address,
    attributes: Object.fromEntries(entity.attributes.map(attribute => [attribute.key, attribute.value])),
  }));
}

function packText(value: string) {
  const bytes = stringToHex(value, { size: 128 });
  return [slice(bytes, 0, 32), slice(bytes, 32, 64), slice(bytes, 64, 96), slice(bytes, 96, 128)] as const;
}

export async function createArkivDevEntity(
  chain: Chain, transport: Transport, account: Address | HDAccount,
  data: Record<string, string | bigint>, expiresAt: bigint,
) {
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account });
  const { timestamp } = await client.getBlock();
  const duration = expiresAt - timestamp;
  // The documented local profile mines a block every two seconds.
  const btl = (duration + 1n) / 2n;
  if (btl <= 0n || btl >= 2n ** 32n) throw new Error('The local Arkiv record lifetime is invalid.');
  const attributes = Object.entries(data).map(([name, value]) => ({
    name: stringToHex(name.toLowerCase(), { size: 32 }),
    valueType: typeof value === 'bigint' ? 1 : 2,
    value: typeof value === 'bigint' ? [numberToHex(value, { size: 32 }), zeroHash, zeroHash, zeroHash] as const : packText(value),
  }));
  const txHash = await wallet.writeContract({ address: registry, abi, functionName: 'execute', args: [[{
    operationType: 1, entityKey: zeroHash, payload: '0x', contentType: { data: packText('application/json') },
    attributes, btl: Number(btl), newOwner: zeroAddress,
  }]] });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error('The local Arkiv publication reverted.');
  const entity = parseEventLogs({ abi: eventAbi, eventName: 'EntityOperation', logs: receipt.logs })
    .find(log => log.address.toLowerCase() === registry && log.args.operationType === 1
      && log.args.owner.toLowerCase() === wallet.account.address.toLowerCase());
  if (!entity) throw new Error('The local Arkiv receipt has no borrower-owned entity.');
  return { txHash, entityKey: entity.args.entityKey };
}
