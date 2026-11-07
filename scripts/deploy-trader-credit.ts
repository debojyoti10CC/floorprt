import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, erc20Abi, http, isAddress, keccak256, stringToHex, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PositionCreditDeskAbi, TraderCreditDeskAbi } from '../packages/shared/src/abis.generated.js';
import { chainFor, type Deployment } from '../packages/shared/src/chain.js';
import { positionTokenAbi, SHARE_UNIT } from '../packages/shared/src/position-credit.js';
import { readPositionMarket } from '../packages/shared/src/position-collateral.js';
import { PnlApiOrigin } from '../services/underwriting/pnl-wire.js';

const sepolia = process.argv.includes('--sepolia');
const isolatedPath = sepolia ? undefined : process.env.FLOOR_DEPLOYMENT_FILE;
const publicPath = isolatedPath ?? 'apps/web/public/deployment.json';
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
const configuredApi = process.env.FLOOR_CRE_PNL_API_URL?.trim();
if (sepolia && !pin && !configuredApi?.startsWith('https://')) {
  throw new Error('Set FLOOR_CRE_PNL_API_URL to the HTTPS origin of the AQRA read API.');
}
const pnlApiUrl = pin ? undefined : PnlApiOrigin.parse(configuredApi || 'http://127.0.0.1:' + (process.env.FLOOR_API_PORT || '8787'));
const writeConfig = async (desk: Address) => {
  // Pinning uses the workflow config already built and hashed by the operator.
  if (!isolatedPath && !pin) await writeFile(configPath, JSON.stringify({ desk, chainId, pnlApiUrl }, null, 2) + '\n');
};
const chain = chainFor(chainId, rpcUrl);
const client = createPublicClient({ chain, transport: http(rpcUrl) });
if (await client.getChainId() !== chainId) throw new Error('The RPC does not match the requested lending chain.');
if (sepolia && !await client.getCode({ address: forwarder })) throw new Error('The Sepolia forwarder has no runtime code.');
const collateralCode = await client.getCode({ address: manifest.contracts.CollateralToken });
if (!collateralCode || keccak256(collateralCode) !== manifest.codeHashes.CollateralToken) {
  throw new Error('The active collateral deployment does not match the manifest.');
}
const withPositions = !sepolia && Boolean(isolatedPath);
const contractName = withPositions ? 'PositionCreditDesk' : 'TraderCreditDesk';
const artifact = JSON.parse(await readFile('packages/contracts/out/' + contractName + '.sol/' + contractName + '.json', 'utf8'));
const bytecode = artifact.bytecode.object as Hex;
const buildHash = keccak256(bytecode);
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (sepolia && (!privateKey || !/^0x[0-9a-f]{64}$/i.test(privateKey))) throw new Error('Sepolia requires a funded testnet deployer.');
const account = sepolia ? privateKeyToAccount(privateKey as Hex) : manifest.roles.curator;
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

const existing = manifest.contracts.TraderCreditDesk;
const currentLedger = manifest.contracts.PositionTokenLedger;
const currentPositions = manifest.traderCredit?.positionCollateral;
const ledgerCode = currentLedger && await client.getCode({ address: currentLedger });
const ledgerVerified = Boolean(ledgerCode && currentPositions && keccak256(ledgerCode) === manifest.codeHashes.PositionTokenLedger);
if (existing && manifest.traderCredit?.mode === mode
  && (manifest.traderCredit.buildHash === buildHash || (!sepolia && withPositions === Boolean(currentPositions)))) {
  const code = await client.getCode({ address: existing });
  if (code && keccak256(code) === manifest.codeHashes.TraderCreditDesk) {
    const [sender, asset, author, currentId] = await Promise.all([
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'forwarder' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'asset' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'workflowOwner' }),
      client.readContract({ address: existing, abi: TraderCreditDeskAbi, functionName: 'workflowId' }),
    ]);
    if (sender.toLowerCase() === forwarder.toLowerCase() && author.toLowerCase() === owner.toLowerCase()
      && asset.toLowerCase() === manifest.contracts.CollateralToken.toLowerCase()
      && (sepolia || (currentId === workflowId && (!withPositions || ledgerVerified)))) {
      if (withPositions && currentPositions) {
        const market = await readPositionMarket(client, manifest, await client.getBlockNumber());
        if (!market || market.conditionId !== currentPositions.conditionId
          || market.yesTokenId !== currentPositions.yesTokenId || market.noTokenId !== currentPositions.noTokenId) {
          throw new Error('Existing position terms do not match the manifest. Resolve the mismatch before deploying.');
        }
      }
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
const collateral = manifest.contracts.CollateralToken;
let positionCollateral: NonNullable<Deployment['traderCredit']>['positionCollateral'];
let hash: Hex;
if (!withPositions) {
  hash = await wallet.deployContract({
    abi: TraderCreditDeskAbi, bytecode, args: [collateral, forwarder, owner, workflowId],
  });
} else {
  let ledger = currentLedger;
  let conditionId = currentPositions?.conditionId;
  if (!ledgerVerified || !ledger || !conditionId) {
    const ctfArtifact = JSON.parse(await readFile(
      'node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json', 'utf8',
    ));
    const ledgerHash = await wallet.deployContract({ abi: [], bytecode: ctfArtifact.bytecode as Hex });
    const receipt = await client.waitForTransactionReceipt({ hash: ledgerHash });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Local Conditional Tokens deployment failed.');
    ledger = receipt.contractAddress;
    const token = { address: ledger, abi: positionTokenAbi } as const;
    const question = keccak256(stringToHex('AQRA local demo binary market'));
    conditionId = await client.readContract({ ...token, functionName: 'getConditionId', args: [manifest.roles.resolver, question, 2n] });
    const prepared = await wallet.writeContract({ ...token, functionName: 'prepareCondition', args: [manifest.roles.resolver, question, 2n] });
    if ((await client.waitForTransactionReceipt({ hash: prepared })).status !== 'success') throw new Error('Local condition preparation failed.');

    const borrower = manifest.roles.borrower;
    const amount = 150n * SHARE_UNIT;
    const approval = await wallet.writeContract({ account: borrower, address: collateral, abi: erc20Abi, functionName: 'approve', args: [ledger, amount] });
    if ((await client.waitForTransactionReceipt({ hash: approval })).status !== 'success') throw new Error('Demo split approval failed.');
    const split = await wallet.writeContract({
      ...token, account: borrower, functionName: 'splitPosition', args: [collateral, zeroHash, conditionId, [1n, 2n], amount],
    });
    if ((await client.waitForTransactionReceipt({ hash: split })).status !== 'success') throw new Error('Demo position split failed.');
    console.log('Demo borrower split 150 test USDC into 150 YES and 150 NO shares · tx ' + split);
  }
  const ctfCode = await client.getCode({ address: ledger });
  if (!ctfCode) throw new Error('Local Conditional Tokens ledger is missing.');
  manifest.contracts.PositionTokenLedger = ledger;
  manifest.codeHashes.PositionTokenLedger = keccak256(ctfCode);
  hash = await wallet.deployContract({
    abi: PositionCreditDeskAbi, bytecode, args: [collateral, forwarder, owner, workflowId, ledger, conditionId],
  });
}
const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Trader credit deployment reverted.');
const code = await client.getCode({ address: receipt.contractAddress });
if (!code) throw new Error('Trader credit code missing after confirmed deployment.');
if (withPositions) {
  const positionDesk = { address: receipt.contractAddress, abi: PositionCreditDeskAbi } as const;
  const [conditionId, yesTokenId, noTokenId] = await Promise.all([
    client.readContract({ ...positionDesk, functionName: 'conditionId' }),
    client.readContract({ ...positionDesk, functionName: 'yesTokenId' }),
    client.readContract({ ...positionDesk, functionName: 'noTokenId' }),
  ]);
  positionCollateral = { conditionId, yesTokenId: yesTokenId.toString(), noTokenId: noTokenId.toString(), title: 'AQRA binary market · test shares' };
}
manifest.contracts.TraderCreditDesk = receipt.contractAddress;
manifest.codeHashes.TraderCreditDesk = keccak256(code);
manifest.traderCredit = {
  mode,
  buildHash,
  deploymentBlock: receipt.blockNumber.toString(),
  transactionHash: hash,
  ...(positionCollateral ? { positionCollateral } : {}),
};
const json = JSON.stringify(manifest, null, 2) + '\n';
if (!isolatedPath) await writeFile(manifestPath, json);
if (!sepolia) await writeFile(publicPath, json);
await writeConfig(receipt.contractAddress);
console.log('Trader credit desk deployed: ' + receipt.contractAddress + ' · tx ' + hash);
