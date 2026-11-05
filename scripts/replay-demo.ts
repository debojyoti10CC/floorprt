import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createWalletClient,createTestClient,http,decodeEventLog,keccak256,toHex,type Address,type TransactionReceipt} from 'viem';
import {chainFor,publicClientFor,abis,jsonSafe,readSnapshot,type Deployment,type ContractName} from '../packages/shared/src/index';

const d:Deployment=JSON.parse(await readFile('apps/web/public/deployment.json','utf8'));
const rpcUrl=process.env.FLOOR_RPC_URL??d.rpcUrl;
if(d.chainId!==31337||!['127.0.0.1','localhost'].includes(new URL(rpcUrl).hostname))throw new Error('Replay explicitly advances time; it only runs on loopback Anvil.');
const chain=chainFor(d.chainId,rpcUrl),client=publicClientFor(d,rpcUrl),testClient=createTestClient({chain,mode:'anvil',transport:http(rpcUrl)});
const receipts:unknown[]=[];
const arg=(receipt:TransactionReceipt,name:ContractName,event:string,key:string)=>{for(const log of receipt.logs){try{const decoded=decodeEventLog({abi:abis[name],data:log.data,topics:log.topics});if(decoded.eventName===event)return BigInt(String((decoded.args as unknown as Record<string,unknown>)[key]));}catch{}}throw new Error(`Receipt missing ${event}.${key}`);};
const send=async(role:'borrower'|'lender'|'resolver',name:ContractName,fn:string,args:unknown[])=>{
  const account=d.roles[role],wallet=createWalletClient({account,chain,transport:http(rpcUrl)});
  const {request}=await client.simulateContract({account,address:d.contracts[name]!,abi:abis[name],functionName:fn,args});
  const hash=await wallet.writeContract({...request,account,chain}),r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error(`${fn} reverted`);
  receipts.push({role,action:fn,transactionHash:hash,blockNumber:r.blockNumber});return r;
};
const cash=async(role:'borrower'|'lender')=>await client.readContract({address:d.contracts.CollateralToken,abi:abis.CollateralToken,functionName:'balanceOf',args:[d.roles[role]]}) as bigint;
// Give the observed block timestamp plenty of headroom when Anvil has been
// idle; its next mined block may advance to wall-clock time before this call.
async function pair(delay=86400n){
  const now=(await client.getBlock()).timestamp,t=now+delay;
  const obs=arg(await send('resolver','SharedObservationRegistry','registerObservation',[keccak256(toHex('ETH/USD')),t,8,keccak256(toHex('TRUSTED_TEST_RESOLVER')),keccak256(toHex('FLOOR_SHARED_GEQ_50_50_V1')),t+3600n]),'SharedObservationRegistry','ObservationRegistered','observationId');
  const lower=arg(await send('resolver','OutcomeMarketFactory','createMarket',[obs,5000n*100000000n]),'OutcomeMarketFactory','MarketCreated','marketId');
  const upper=arg(await send('resolver','OutcomeMarketFactory','createMarket',[obs,6000n*100000000n]),'OutcomeMarketFactory','MarketCreated','marketId');
  return {obs,lower,upper,time:t,cancelAfter:t+3600n};
}
async function mintPair(lower:bigint,upper:bigint,units=1n){
  await send('borrower','CollateralToken','approve',[d.contracts.OutcomeTokens,units*2n*1000000n]);
  await send('borrower','OutcomeTokens','mintCompleteSet',[lower,units]);await send('borrower','OutcomeTokens','mintCompleteSet',[upper,units]);
  await send('borrower','OutcomeTokens','setApprovalForAll',[d.contracts.FloorVault,true]);
}
async function lockRequest(lower:bigint,upper:bigint,time:bigint){
  const id=arg(await send('borrower','FloorVault','lockPair',[lower,upper,1n,1n,d.roles.borrower]),'FloorVault','VaultPositionCreated','positionId');
  await send('borrower','CreditDesk','requestLoan',[id,750000n,780000n,time]);return id;
}
async function fund(position:bigint){await send('lender','CollateralToken','approve',[d.contracts.CreditDesk,750000n]);return arg(await send('lender','CreditDesk','fundLoan',[position,750000n,780000n]),'CreditDesk','LoanFunded','loanId');}

const scenarios=[['below',4500n],['lower_equal',5000n],['inside',5500n],['upper_equal',6000n],['above',6500n],['cancelled',null]] as const;
const results=[];
for(const [scenario,price] of scenarios){
  const p=await pair();await mintPair(p.lower,p.upper);const position=await lockRequest(p.lower,p.upper,p.time);
  const b0=await cash('borrower'),l0=await cash('lender');const loan=await fund(position);
  if(await cash('borrower')-b0!==750000n||l0-await cash('lender')!==750000n)throw new Error('Principal transfer mismatch');
  await testClient.setNextBlockTimestamp({timestamp:price===null?p.cancelAfter:p.time});await testClient.mine({blocks:1});
  if(price===null)await send('resolver','SharedObservationRegistry','cancel',[p.obs]);else await send('resolver','SharedObservationRegistry','finalize',[p.obs,price*100000000n]);
  const b=await cash('borrower'),l=await cash('lender');const settled=await send('resolver','CreditDesk','settle',[loan]);
  const expected=price!==null&&price>=5000n&&price<6000n?2000000n:1000000n;
  const lenderPaid=await cash('lender')-l,borrowerPaid=await cash('borrower')-b;
  if(lenderPaid!==780000n||borrowerPaid!==expected-780000n)throw new Error(`Waterfall mismatch: ${scenario}`);
  results.push({scenario,observationId:p.obs,positionId:position,loanId:loan,redeemed:expected,lenderPaid,borrowerPaid,transactionHash:settled.transactionHash,blockNumber:settled.blockNumber});
  console.log(`PASS ${scenario}: redeemed ${expected}, lender ${lenderPaid}, borrower ${borrowerPaid} micro-USDC`);
}
// Leave useful, genuinely funded inventory and a live credit request for the terminal.
const seed=await pair(86400n);await mintPair(seed.lower,seed.upper,10n);
const activePosition=await lockRequest(seed.lower,seed.upper,seed.time);await fund(activePosition);
await lockRequest(seed.lower,seed.upper,seed.time);
d.defaultPair={lower:seed.lower.toString(),upper:seed.upper.toString()};
await writeFile('apps/web/public/deployment.json',JSON.stringify(d,null,2));await writeFile(`packages/contracts/deployments/${d.chainId}.json`,JSON.stringify(d,null,2));
const snapshot=await readSnapshot(d,d.roles.borrower,rpcUrl);
const recorded={schema:'floor-recorded-run/v1',notice:'Historical local Anvil execution evidence. Not a live public deployment. Wallet writes disabled when RPC is offline.',recordedAt:new Date().toISOString(),deployment:d,snapshot,scenarios:jsonSafe(results)};
await mkdir('evidence',{recursive:true});await writeFile('evidence/demo-receipts.json',JSON.stringify(jsonSafe({scenarios:results,receipts}),null,2));
await writeFile('apps/web/public/recorded-run.json',JSON.stringify(recorded,null,2));
console.log(`Recorded ${results.length} settlement scenarios and left two fresh vault positions on observation ${seed.obs}.`);
