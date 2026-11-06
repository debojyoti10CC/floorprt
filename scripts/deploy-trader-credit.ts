import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, isAddress, keccak256, stringToHex, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TraderCreditDeskAbi } from '../packages/shared/src/abis.generated.js';
import { chainFor, type Deployment } from '../packages/shared/src/chain.js';

const publicPath = 'apps/web/public/deployment.json';
const sepolia = process.argv.includes('--sepolia');
const pin = process.argv.includes('--pin-workflow');
if (pin && !sepolia) throw new Error('The local workflow ID is pinned at deployment.');
const chainId = sepolia ? 11155111 : 31337;
const manifestPath = 'packages/contracts/deployments/' + chainId + '.json';
const manifest = JSON.parse(await readFile(sepolia ? manifestPath : publicPath, 'utf8')) as Deployment;
const rpcUrl = process.env.FLOOR_RPC_URL ?? manifest.rpcUrl;
if (manifest.chainId !== chainId || manifest.mockCollateral !== !sepolia
  || (!sepolia && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(rpcUrl).hostname))) {
  throw new Error('Trader credit requires the matching canonical Sepolia or loopback Anvil deployment.');
}

const mode = sepolia ? 'CHAINLINK_CRE' : 'LOCAL_FORWARDER';
const forwarder = sepolia ? process.env.FLOOR_CRE_FORWARDER : manifest.roles.curator;
const owner = sepolia ? process.env.FLOOR_CRE_WORKFLOW_OWNER : manifest.roles.curator;
const id = pin ? process.env.FLOOR_CRE_WORKFLOW_ID : sepolia ? zeroHash : keccak256(stringToHex('aqra-local-score-forwarder-v1'));
if (!forwarder || !isAddress(forwarder) || forwarder === zeroAddress || !owner || !isAddress(owner) || owner === zeroAddress
  || !id || !/^0x[0-9a-f]{64}$/i.test(id) || (pin && id === zeroHash)) {
  throw new Error('Provide the CRE tenant forwarder and workflow owner. Pinning also needs the built workflow ID.');
}
const workflowId = id as Hex;
const configPath = 'services/trader-cre/workflow/config.' + (sepolia ? 'sepolia' : 'local') + '.json';
const writeConfig = (desk: Address) => writeFile(configPath, JSON.stringify({ desk, chainId }, null, 2) + '\n');
const chain = chainFor(chainId, rpcUrl);
const client = createPublicClient({ chain, transport: http(rpcUrl) });
if (await client.getChainId() !== chainId) throw new Error('The RPC does not match the requested lending chain.');
if (sepolia && !await client.getCode({ address: forwarder })) throw new Error('The Sepolia forwarder has no runtime code.');
const collateralCode = await client.getCode({ address: manifest.contracts.CollateralToken });
if (!collateralCode || keccak256(collateralCode) !== manifest.codeHashes.CollateralToken) {
  throw new Error('The active collateral deployment does not match the manifest.');
}
const artifact = JSON.parse(await readFile('packages/contracts/out/TraderCreditDesk.sol/TraderCreditDesk.json', 'utf8'));
const bytecode = artifact.bytecode.object as Hex;
const buildHash = keccak256(bytecode);
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (sepolia && (!privateKey || !/^0x[0-9a-f]{64}$/i.test(privateKey))) throw new Error('Sepolia requires a funded testnet deployer.');
const account = sepolia ? privateKeyToAccount(privateKey as Hex) : manifest.roles.curator;
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

const existing = manifest.contracts.TraderCreditDesk;
if (existing && manifest.traderCredit?.mode === mode && manifest.traderCredit.buildHash === buildHash) {
  const code = await client.getCode({ address: existing });
  if (code && keccak256(code) === manifest.codeHashes.TraderCreditDesk) {
    const [sender, asset, author, currentId] = await Promise.all([
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'forwarder' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'asset' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'workflowOwner' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'workflowId' }),
    ]);
    if (sender.toLowerCase() === forwarder.toLowerCase() && author.toLowerCase() === owner.toLowerCase()
      && asset.toLowerCase() === manifest.contracts.CollateralToken.toLowerCase() && (sepolia || currentId === workflowId)) {
      if (pin && currentId !== workflowId.toLowerCase()) {
        if (currentId !== zeroHash) throw new Error('The existing desk already pins a different workflow.');
        const simulation = await client.simulateContract({ account, address: existing, abi: TraderCreditDeskAbi, functionName: 'pinWorkflow', args: [workflowId] });
        const hash = await wallet.writeContract(simulation.request);
        if ((await client.waitForTransactionReceipt({ hash })).status !== 'success') throw new Error('Pinning the CRE workflow reverted.');
        console.log('Pinned CRE workflow ' + workflowId + ' · tx ' + hash);
      }
      await writeConfig(existing);
      console.log('Trader credit desk already running: ' + existing);
      process.exit(0);
    }
  }
}

if (pin || (sepolia && existing)) throw new Error('The existing public trader desk does not match the configured build and forwarder.');
const hash = await wallet.deployContract({
  abi: TraderCreditDeskAbi,
  bytecode,
  args: [manifest.contracts.CollateralToken, forwarder, owner, workflowId],
});
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Trader credit deployment reverted.');
const code = await client.getCode({ address: receipt.contractAddress });
if (!code) throw new Error('Trader credit code missing after confirmed deployment.');
manifest.contracts.TraderCreditDesk = receipt.contractAddress;
manifest.codeHashes.TraderCreditDesk = keccak256(code);
manifest.traderCredit = {
  mode,
  buildHash,
  deploymentBlock: receipt.blockNumber.toString(),
  transactionHash: hash,
};
const json = JSON.stringify(manifest, null, 2) + '\n';
await writeFile(manifestPath, json);
if (!sepolia) await writeFile(publicPath, json);
await writeConfig(receipt.contractAddress);
console.log('Trader credit desk deployed: ' + receipt.contractAddress + ' · tx ' + hash);
