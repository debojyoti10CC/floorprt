import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,keccak256,toHex,erc20Abi,isAddress,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {contractFingerprint} from './contract-fingerprint.mjs';
import {chainFor,contractNames,abis,jsonSafe,type Deployment,type ContractName} from '../packages/shared/src/index';

const rpcUrl=process.env.FLOOR_RPC_URL??'http://127.0.0.1:8545';
const probe=createPublicClient({transport:http(rpcUrl)}); const chainId=await probe.getChainId();
if(chainId!==31337 && !process.env.DEPLOYER_PRIVATE_KEY)throw new Error('Public testnet deployment needs an explicitly supplied deployer wallet; no API signing key is used.');
if(![31337,11155111].includes(chainId))throw new Error('Only Anvil 31337 and Sepolia 11155111 are supported by this test-only deployment script.');
const chain=chainFor(chainId,rpcUrl);
const client=createPublicClient({chain,transport:http(rpcUrl)});
const accounts:Address[]=chainId===31337?await createWalletClient({chain,transport:http(rpcUrl)}).getAddresses():[];
const account=chainId===31337?accounts[0]:privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
if(!account)throw new Error('No unlocked LOCAL devnet account');
const wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
const curator=typeof account==='string'?account:account.address;
const roles={curator,resolver:curator,borrower:accounts[1]??curator,lender:accounts[2]??curator} as Deployment['roles'];
const contracts={} as Deployment['contracts']; const codeHashes={} as Deployment['codeHashes'];
const receipts:unknown[]=[];
const deploy=async(name:ContractName|'MockUSDC',args:unknown[])=>{
  const artifact=JSON.parse(await readFile(`packages/contracts/out/${name}.sol/${name}.json`,'utf8'));
  const hash=await wallet.deployContract({account,chain,abi:artifact.abi,bytecode:artifact.bytecode.object,args});
  const receipt=await client.waitForTransactionReceipt({hash});
  if(receipt.status!=='success'||!receipt.contractAddress)throw new Error(`${name} deployment failed`);
  contracts[name==='MockUSDC'?'CollateralToken':name]=receipt.contractAddress;receipts.push({contract:name,transactionHash:hash,blockNumber:receipt.blockNumber});
  console.log(`Deployed ${name}: ${receipt.contractAddress}`);return receipt.contractAddress;
};
const send=async(name:ContractName,fn:string,args:unknown[],who:Address=curator)=>{
  const signer=chainId===31337?createWalletClient({account:who,chain,transport:http(rpcUrl)}):wallet;
  const hash=await signer.writeContract({account:chainId===31337?who:account,chain,address:contracts[name]!,abi:fn==='faucet'?JSON.parse(await readFile('packages/contracts/out/MockUSDC.sol/MockUSDC.json','utf8')).abi:abis[name],functionName:fn,args});
  const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error(`${fn} reverted`);
  receipts.push({action:fn,transactionHash:hash,blockNumber:receipt.blockNumber});return receipt;
};
const firstBlock=(await client.getBlockNumber())+1n;
let oracle:Deployment['oracle'];
if(chainId===31337){
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL(rpcUrl).hostname))throw new Error('Unlocked local deployment is restricted to loopback RPC.');
  await deploy('MockUSDC',[]);
  await deploy('SharedObservationRegistry',[curator,roles.resolver]);
}else{
  const usdc='0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
  const feed='0x694AA1769357215DE4FAC081bf1f309aDC325306' as Address;
  if(!await client.getCode({address:usdc})||await client.readContract({address:usdc,abi:erc20Abi,functionName:'decimals'})!==6)throw new Error('Canonical Sepolia USDC is unavailable or has wrong precision.');
  contracts.CollateralToken=usdc;
  const adapter=await deploy('ChainlinkObservationResolver',[curator,feed,keccak256(toHex('ETH/USD')),7200]);
  contracts.SharedObservationRegistry=await client.readContract({address:adapter,abi:abis.ChainlinkObservationResolver,functionName:'registry'}) as Address;
  roles.resolver=adapter;
  oracle={feed,sourceId:await client.readContract({address:adapter,abi:abis.ChainlinkObservationResolver,functionName:'sourceId'}) as Hex,assetId:keccak256(toHex('ETH/USD')),maxAge:7200};
}
await deploy('OutcomeMarketFactory',[curator,contracts.SharedObservationRegistry,contracts.CollateralToken]);
contracts.OutcomeTokens=await client.readContract({address:contracts.OutcomeMarketFactory,abi:abis.OutcomeMarketFactory,functionName:'tokens'}) as Address;
await deploy('FloorVerifier',[contracts.OutcomeMarketFactory]);
await deploy('FloorVault',[curator,contracts.FloorVerifier]);
await deploy('CreditDesk',[curator,contracts.FloorVault,2000]);
await send('FloorVault','bindCreditDesk',[contracts.CreditDesk]);
const now=(await client.getBlock()).timestamp;
const policy=keccak256(toHex('FLOOR_SHARED_GEQ_50_50_V1'));
// Four independent, internally shared observations support all canonical scenario replays.
for(const [asset,offset] of (chainId===31337?[['ETH/USD',0n],['ETH/USD',1n],['BTC/USD',2n]]:[['ETH/USD',0n]]) as [string,bigint][]){
  const count=await client.readContract({address:contracts.SharedObservationRegistry,abi:abis.SharedObservationRegistry,functionName:'observationCount'}) as bigint;
  const id=count+1n; const t=now+3600n+offset*600n;
  await send('SharedObservationRegistry','registerObservation',[keccak256(toHex(asset)),t,8,oracle?.sourceId??keccak256(toHex('TRUSTED_TEST_RESOLVER')),policy,t+86400n]);
  const strikes=asset==='ETH/USD'?[4500n,5000n,6000n,6500n]:[90000n,100000n,110000n];
  for(const strike of strikes)await send('OutcomeMarketFactory','createMarket',[id,strike*100000000n]);
}
if(chainId===31337){
  for(const who of [roles.borrower,roles.lender])await send('CollateralToken','faucet',[1000_000_000n],who);
  // Pre-minted inventory is funded, real and held by borrower; no loan is fabricated.
  await send('CollateralToken','approve',[contracts.OutcomeTokens,20_000_000n],roles.borrower);
  await send('OutcomeTokens','mintCompleteSet',[2n,10n],roles.borrower);
  await send('OutcomeTokens','mintCompleteSet',[3n,10n],roles.borrower);
}
for(const name of contractNames){const code=await client.getCode({address:contracts[name]});if(!code)throw new Error(`No code for ${name}`);codeHashes[name]=keccak256(code);}
if(contracts.ChainlinkObservationResolver)codeHashes.ChainlinkObservationResolver=keccak256((await client.getCode({address:contracts.ChainlinkObservationResolver}))!);
const manifest:Deployment={schema:'floor-deployment/v1',chainId,chainName:chain.name,rpcUrl,explorerUrl:process.env.FLOOR_EXPLORER_URL??(chainId===11155111?'https://sepolia.etherscan.io':''),deploymentBlock:firstBlock.toString(),deployedAt:new Date().toISOString(),contracts,codeHashes,roles,mockCollateral:chainId===31337,oracleMode:oracle?'CHAINLINK_HISTORICAL':'TRUSTED_TEST_RESOLVER',oracle,seededBlock:(await client.getBlockNumber()).toString(),defaultPair:{lower:'2',upper:'3'}};
await mkdir('packages/contracts/deployments',{recursive:true});await mkdir('apps/web/public',{recursive:true});
manifest.buildFingerprint=await contractFingerprint();
await writeFile(`packages/contracts/deployments/${chainId}.json`,JSON.stringify(manifest,null,2));
await writeFile('apps/web/public/deployment.json',JSON.stringify(manifest,null,2));
await writeFile(`packages/contracts/deployments/${chainId}-receipts.json`,JSON.stringify(jsonSafe(receipts),null,2));
console.log(`Pinned ${contractNames.length} contract code hashes on chain ${chainId}. Test funds only.`);
