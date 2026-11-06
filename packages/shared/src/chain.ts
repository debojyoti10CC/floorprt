import { createPublicClient, http, defineChain, type Address, type Hash, type PublicClient, decodeEventLog, type Abi } from 'viem';
import * as A from './abis.generated';
import {erc20Abi} from 'viem';
export const CollateralTokenAbi=erc20Abi;

export type CoreContractName = 'CollateralToken'|'SharedObservationRegistry'|'OutcomeMarketFactory'|'OutcomeTokens'|'FloorVerifier'|'FloorVault'|'CreditDesk';
export type ContractName = CoreContractName|'ChainlinkObservationResolver';
export type Deployment = {
  schema: 'floor-deployment/v1'; chainId: number; chainName: string; rpcUrl: string;
  explorerUrl: string; deploymentBlock: string; deployedAt: string;
  contracts: Record<CoreContractName, Address> & {ChainlinkObservationResolver?:Address}; codeHashes: Record<CoreContractName, Hash> & {ChainlinkObservationResolver?:Hash};
  roles: { curator: Address; resolver: Address; borrower: Address; lender: Address };
  mockCollateral: boolean; oracleMode: 'TRUSTED_TEST_RESOLVER'|'CHAINLINK_HISTORICAL';
  oracle?:{feed:Address;sourceId:Hash;assetId:Hash;maxAge:number};
  buildFingerprint?:string;seededBlock?:string;defaultPair?:{lower:string;upper:string};
};
export const contractNames: CoreContractName[]=['CollateralToken','SharedObservationRegistry','OutcomeMarketFactory','OutcomeTokens','FloorVerifier','FloorVault','CreditDesk'];
export const abis: Record<ContractName, Abi>={CollateralToken:erc20Abi,ChainlinkObservationResolver:A.ChainlinkObservationResolverAbi, SharedObservationRegistry:A.SharedObservationRegistryAbi,OutcomeMarketFactory:A.OutcomeMarketFactoryAbi,OutcomeTokens:A.OutcomeTokensAbi,FloorVerifier:A.FloorVerifierAbi,FloorVault:A.FloorVaultAbi,CreditDesk:A.CreditDeskAbi};
export const chainFor=(id:number,rpcUrl:string)=>defineChain({id,name:id===31337?'Anvil local devnet':'EVM testnet',nativeCurrency:{name:'Test Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpcUrl]}}});
export const publicClientFor=(deployment:Deployment,rpcUrl=deployment.rpcUrl)=>createPublicClient({chain:chainFor(deployment.chainId,rpcUrl),transport:http(rpcUrl,{batch:{batchSize:50,wait:10},retryCount:1,timeout:8000})});
export const jsonSafe=<T>(value:T):any=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v));

export type ObservationRow={id:string;assetId:Hash;observationTime:string;priceDecimals:number;sourceId:Hash;resolutionPolicyHash:Hash;cancelAfter:string;state:number;price:string;resolver:Address};
export type MarketRow={id:string;observationId:string;strike:string;enabledForNewCollateral:boolean;yesTokenId:string;noTokenId:string;escrow:string;yesBalance:string;noBalance:string};
export type PositionRow={id:string;owner:Address;beneficiary:Address;marketLower:string;marketUpper:string;unitsLower:string;unitsUpper:string;observationId:string;certifiedFloor:string;state:number;lienLoanId:string;request:{principal:string;maximumDue:string;expiry:string;active:boolean}};
export type LoanRow={id:string;positionId:string;lender:Address;borrower:Address;principal:string;due:string;certifiedFloor:string;fundedAt:string;targetMaturity:string;state:number};
export type Activity={event:string;args:Record<string,unknown>;transactionHash:Hash;blockNumber:string;blockHash:Hash;logIndex:number;address:Address};
export type Snapshot={chainId:number;blockNumber:string;blockHash:Hash;timestamp:string;observations:ObservationRow[];markets:MarketRow[];positions:PositionRow[];loans:LoanRow[];activity:Activity[];walletAddress:Address|null;walletBalance:string|null;bufferBps:number;source:'DIRECT_CHAIN';fetchedAt:string};

/** All related reads are pinned to one block to avoid a mixed-state snapshot. */
export async function readSnapshot(deployment:Deployment,wallet?:Address,rpcUrl?:string):Promise<Snapshot>{
  const client=publicClientFor(deployment,rpcUrl);
  if(await client.getChainId()!==deployment.chainId)throw new Error('ERR_CHAIN_MISMATCH');
  const block=await client.getBlock(); const blockNumber=block.number;
  const read=async(name:CoreContractName,functionName:string,args:unknown[]=[])=>client.readContract({address:deployment.contracts[name],abi:abis[name],functionName,args,blockNumber}) as Promise<any>;
  const [nObs,nMarket,nPosition,nLoan,bufferBps,walletBalance]=await Promise.all([
    read('SharedObservationRegistry','observationCount'),read('OutcomeMarketFactory','marketCount'),read('FloorVault','positionCount'),read('CreditDesk','loanCount'),read('CreditDesk','bufferBps'),wallet?read('CollateralToken','balanceOf',[wallet]):Promise.resolve(null),
  ]);
  const ids=(n:bigint,max=200)=>Array.from({length:Number(n<BigInt(max)?n:BigInt(max))},(_,i)=>n<BigInt(max)?BigInt(i+1):n-BigInt(max)+1n+BigInt(i));
  const [observations,markets,positions,loans]=await Promise.all([
    Promise.all(ids(nObs).map(async id=>({id:id.toString(),...jsonSafe(await read('SharedObservationRegistry','observation',[id]))}))),
    Promise.all(ids(nMarket).map(async id=>{
      const [m,escrow,yesBalance,noBalance]=await Promise.all([read('OutcomeMarketFactory','getMarket',[id]),read('OutcomeTokens','escrow',[id]),wallet?read('OutcomeTokens','balanceOf',[wallet,id*2n+1n]):0n,wallet?read('OutcomeTokens','balanceOf',[wallet,id*2n+2n]):0n]);
      return {...jsonSafe(m),yesTokenId:(id*2n+1n).toString(),noTokenId:(id*2n+2n).toString(),escrow:escrow.toString(),yesBalance:yesBalance.toString(),noBalance:noBalance.toString()};
    })),
    Promise.all(ids(nPosition).map(async id=>({id:id.toString(),...jsonSafe(await read('FloorVault','getPosition',[id])),request:jsonSafe(await read('CreditDesk','getRequest',[id]))}))),
    Promise.all(ids(nLoan).map(async id=>({id:id.toString(),...jsonSafe(await read('CreditDesk','getLoan',[id]))}))),
  ]);
  const activity=await readActivity(client as PublicClient,deployment,blockNumber);
  return {chainId:deployment.chainId,blockNumber:blockNumber.toString(),blockHash:block.hash,timestamp:block.timestamp.toString(),observations,markets,positions,loans,activity,walletAddress:wallet??null,walletBalance:walletBalance?.toString()??null,bufferBps:Number(bufferBps),source:'DIRECT_CHAIN',fetchedAt:new Date().toISOString()};
}

export async function readActivity(client:PublicClient,deployment:Deployment,toBlock?:bigint):Promise<Activity[]> {
  const tip=toBlock??await client.getBlockNumber();
  const initial=BigInt(deployment.deploymentBlock);
  // bounded direct view; the persistent indexer is used for full history on a large deployment.
  const fromBlock=tip>initial+5000n?tip-5000n:initial;
  const logs=await client.getLogs({address:Object.values(deployment.contracts),fromBlock,toBlock:tip});
  const result:Activity[]=[];
  for(const log of logs){
    const name=(Object.keys(deployment.contracts) as ContractName[]).find(n=>deployment.contracts[n]?.toLowerCase()===log.address.toLowerCase());
    if(!name||!log.blockHash||!log.transactionHash||log.logIndex===null)continue;
    try{
      const decoded=decodeEventLog({abi:abis[name],data:log.data,topics:log.topics});
      if(['Transfer','TransferSingle','TransferBatch','Approval','ApprovalForAll','OwnershipTransferred'].includes(decoded.eventName??''))continue;
      result.push({event:decoded.eventName??'Unknown',args:jsonSafe(decoded.args),transactionHash:log.transactionHash,blockNumber:log.blockNumber!.toString(),blockHash:log.blockHash,logIndex:log.logIndex,address:log.address});
    }catch{ /* non-ABI logs are not protocol events; never substitute financial state */ }
  }
  return result.sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:a.logIndex-b.logIndex);
}
