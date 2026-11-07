import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import {
  createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, erc20Abi, http, keccak256,
  type Abi, type Address, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC, ARC_TESTNET_USDC } from '../packages/shared/src/arc.js';
import { chainFor, jsonSafe } from '../packages/shared/src/chain.js';

export const arcWork = 'work/arc-testnet';

export async function arcAccount() {
  const key = process.env.DEPLOYER_PRIVATE_KEY
    ?? (JSON.parse(await readFile(arcWork + '/deployer.json', 'utf8')) as { key: Hex }).key;
  if (!/^0x[0-9a-f]{64}$/i.test(key)) throw new Error('Provide a dedicated Arc Testnet deployer key.');
  return privateKeyToAccount(key as Hex);
}

export async function arcClients() {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL ?? ARC_TESTNET_RPC;
  if (!rpcUrl.startsWith('https://')) throw new Error('Arc Testnet requires an HTTPS RPC.');
  const chain = chainFor(ARC_TESTNET_CHAIN_ID, rpcUrl);
  const transport = http(rpcUrl, { timeout: 15_000, retryCount: 1 });
  const client = createPublicClient({ chain, transport });
  if (await client.getChainId() !== chain.id) throw new Error('Arc Testnet chain ID mismatch.');
  const usdc = { address: ARC_TESTNET_USDC, abi: erc20Abi } as const;
  const [decimals, code] = await Promise.all([
    client.readContract({ ...usdc, functionName: 'decimals' }),
    client.getCode({ address: usdc.address }),
  ]);
  if (decimals !== 6 || !code) throw new Error('Canonical Arc Testnet USDC could not be verified.');
  const account = await arcAccount();
  return { chain, client, account, wallet: createWalletClient({ chain, account, transport }), usdc };
}

export async function writeArcJson(path: string, value: unknown) {
  const temporary = path + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(jsonSafe(value), null, 2) + '\n');
  await rename(temporary, path);
}

export async function arcArtifact(name: string) {
  const file = 'packages/contracts/out/' + name + '.sol/' + name + '.json';
  const artifact = JSON.parse(await readFile(file, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

export async function arcDeploymentSteps(context: Awaited<ReturnType<typeof arcClients>>) {
  const { client, wallet, account, chain } = context;
  await mkdir(arcWork, { recursive: true });
  const path = arcWork + '/deployment-progress.json';
  const journal = await readFile(path, 'utf8').then(raw => JSON.parse(raw) as Record<string, Hex>).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return {} as Record<string, Hex>;
  });
  const confirmed: { step: string; hash: Hex; block: bigint; address: Address | null }[] = [];
  const transact = async (step: string, data: Hex, to?: Address) => {
    let hash = journal[step];
    if (!hash) {
      hash = await wallet.sendTransaction({ account, chain, to, data });
      journal[step] = hash;
      await writeArcJson(path, journal);
    }
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000, confirmations: 1 });
    const tx = await client.getTransaction({ hash });
    if (receipt.status !== 'success' || tx.from.toLowerCase() !== account.address.toLowerCase()
      || tx.to?.toLowerCase() !== to?.toLowerCase() || tx.input !== data) {
      throw new Error('Arc deployment checkpoint failed for ' + step + ' · ' + hash);
    }
    confirmed.push({ step, hash, block: receipt.blockNumber, address: receipt.contractAddress ?? null });
    return receipt;
  };
  const deploy = async (name: string, args: readonly unknown[], artifact?: { abi: Abi; bytecode: Hex }) => {
    const build = artifact ?? await arcArtifact(name);
    const receipt = await transact(name, encodeDeployData({ ...build, args }));
    if (!receipt.contractAddress || !await client.getCode({ address: receipt.contractAddress })) {
      throw new Error(name + ' has no deployed code.');
    }
    console.log(name + ' · ' + receipt.contractAddress + ' · ' + receipt.transactionHash);
    return { address: receipt.contractAddress, receipt, buildHash: keccak256(build.bytecode) };
  };
  const send = (step: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[]) =>
    transact(step, encodeFunctionData({ abi, functionName, args }), to);
  return { deploy, send, confirmed };
}
