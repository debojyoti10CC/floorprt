import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAddressEqual, keccak256, stringToHex, type Address, type Hex } from 'viem';
import {
  abis, contractNames, PositionCreditDeskAbi, MarginCreditDeskAbi, TraderCreditKeeperAbi,
  positionTokenAbi, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_EXPLORER, ARC_TESTNET_RPC, type Deployment,
} from '../packages/shared/src/index.js';
import { arcClients, arcDeploymentSteps, arcWork, writeArcJson } from './arc-testnet.js';

const context = await arcClients();
const { account, chain, client, usdc } = context;
const curator = account.address;
const { deploy, send, confirmed } = await arcDeploymentSteps(context);
if (!await client.getBalance({ address: curator })) throw new Error('The Arc deployer needs test USDC for gas.');

const registry = await deploy('SharedObservationRegistry', [curator, curator]);
const factory = await deploy('OutcomeMarketFactory', [curator, registry.address, usdc.address]);
const outcomeTokens = await client.readContract({ address: factory.address, abi: abis.OutcomeMarketFactory, functionName: 'tokens' }) as Address;
const verifier = await deploy('FloorVerifier', [factory.address]);
const vault = await deploy('FloorVault', [curator, verifier.address]);
const floorDesk = await deploy('CreditDesk', [curator, vault.address, 2000]);
await send('BindFloorCreditDesk', vault.address, abis.FloorVault, 'bindCreditDesk', [floorDesk.address]);

const ctfArtifact = JSON.parse(await readFile(
  'node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json', 'utf8',
)) as { bytecode: Hex };
const ledger = await deploy('PositionTokenLedger', [], { abi: [], bytecode: ctfArtifact.bytecode });
const token = { address: ledger.address, abi: positionTokenAbi } as const;
const question = keccak256(stringToHex('AQRA Arc Testnet binary position'));
const conditionId = await client.readContract({ ...token, functionName: 'getConditionId', args: [curator, question, 2n] });
await send('PreparePositionCondition', ledger.address, positionTokenAbi, 'prepareCondition', [curator, question, 2n]);
assert.equal(await client.readContract({ ...token, functionName: 'getOutcomeSlotCount', args: [conditionId] }), 2n);

const relay = await deploy('ArcTestReportRelay', [curator]);
const workflowId = keccak256(stringToHex('aqra-arc-testnet-operator-workflow-v1'));
const deskArgs = [usdc.address, relay.address, curator, workflowId, ledger.address, conditionId] as const;
const paired = await deploy('PositionCreditDesk', deskArgs);
const referenceTokenId = 93957887834338563974539451982699098159783757606297234361279958285677456300272n;
const margin = await deploy('MarginCreditDesk', [...deskArgs, referenceTokenId]);
const keeper = await deploy('TraderCreditKeeper', [margin.address, 2]);

const codeHash = async (address: Address) => {
  const code = await client.getCode({ address });
  if (!code) throw new Error('Arc contract code is missing at ' + address);
  return keccak256(code);
};
const position = { address: paired.address, abi: PositionCreditDeskAbi } as const;
const [yesTokenId, noTokenId, keeperDesk, marginAsset] = await Promise.all([
  client.readContract({ ...position, functionName: 'yesTokenId' }),
  client.readContract({ ...position, functionName: 'noTokenId' }),
  client.readContract({ address: keeper.address, abi: TraderCreditKeeperAbi, functionName: 'desk' }),
  client.readContract({ address: margin.address, abi: MarginCreditDeskAbi, functionName: 'asset' }),
]);
assert(isAddressEqual(keeperDesk, margin.address) && isAddressEqual(marginAsset, usdc.address));

const contracts = {
  CollateralToken: usdc.address, SharedObservationRegistry: registry.address, OutcomeMarketFactory: factory.address,
  OutcomeTokens: outcomeTokens, FloorVerifier: verifier.address, FloorVault: vault.address, CreditDesk: floorDesk.address,
  TraderCreditDesk: paired.address, PositionTokenLedger: ledger.address,
};
const codeHashes = Object.fromEntries(await Promise.all(
  [...contractNames, 'TraderCreditDesk', 'PositionTokenLedger'].map(async name => {
    const address = contracts[name as keyof typeof contracts];
    return [name, await codeHash(address)];
  }),
)) as Deployment['codeHashes'];
const manifest: Deployment = {
  schema: 'floor-deployment/v1', chainId: ARC_TESTNET_CHAIN_ID, chainName: chain.name, rpcUrl: ARC_TESTNET_RPC,
  explorerUrl: ARC_TESTNET_EXPLORER, deploymentBlock: registry.receipt.blockNumber.toString(),
  deployedAt: new Date(Number((await client.getBlock({ blockNumber: registry.receipt.blockNumber })).timestamp) * 1000).toISOString(),
  contracts, codeHashes, roles: { curator, resolver: curator, borrower: curator, lender: curator },
  mockCollateral: false, oracleMode: 'TRUSTED_TEST_RESOLVER',
  traderCredit: {
    mode: 'ARC_TEST_RELAY', deploymentBlock: paired.receipt.blockNumber.toString(),
    transactionHash: paired.receipt.transactionHash, buildHash: paired.buildHash,
    testRelay: { address: relay.address, codeHash: await codeHash(relay.address), workflowId },
    positionCollateral: {
      conditionId, yesTokenId: yesTokenId.toString(), noTokenId: noTokenId.toString(), title: 'AQRA Arc Testnet binary position',
    },
    arcMargin: { desk: margin.address, deskCodeHash: await codeHash(margin.address), keeper: keeper.address,
      keeperCodeHash: await codeHash(keeper.address), referenceTokenId: referenceTokenId.toString() },
  },
};
await writeArcJson('packages/contracts/deployments/5042002.json', manifest);
await writeArcJson('packages/contracts/deployments/5042002-receipts.json', confirmed);
await writeArcJson('apps/web/public/deployment.arc.json', manifest);
await writeArcJson('services/trader-cre/workflow/config.arc.local.json', {
  desk: paired.address, chainId: chain.id, arcSimulation: true, pnlApiUrl: 'http://127.0.0.1:8789',
});
await writeArcJson(arcWork + '/deployment.json', manifest);
console.log('Arc Testnet deployment pinned · ' + ARC_TESTNET_EXPLORER + '/address/' + paired.address);
