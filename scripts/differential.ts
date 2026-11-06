import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {floorOf,payout} from '../packages/proof-engine/src/index';
import {publicClientFor,FloorVerifierAbi,latestEligiblePair,readSnapshot,type Deployment} from '../packages/shared/src/index';
let seed=20261105n;const next=()=>seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<128n)-1n);
const cases=Array.from({length:10000},()=>{const l=next()%10n**25n+1n,u=l+next()%10n**25n+1n;return [l,u,next()%((1n<<64n)-1n)+1n,next()%((1n<<64n)-1n)+1n,next()%10n**27n].map(String)});
const py=spawnSync(process.env.PYTHON??'python',['scripts/reference-proof.py'],{input:JSON.stringify(cases),encoding:'utf8',maxBuffer:8*1024*1024});
if(py.status!==0)throw new Error(py.stderr||'Independent Python model failed');const result=JSON.parse(py.stdout) as string[][];
for(let i=0;i<cases.length;i++){const [lower,upper,lowerUnits,upperUnits,price]=cases[i].map(BigInt);const pair={lower,upper,lowerUnits,upperUnits};const actual=[floorOf(pair),payout(pair,price),payout(pair,'CANCELLED')].map(String);if(actual.some((s,j)=>s!==result[i][j]))throw new Error(`Differential mismatch at vector ${i}`);}
const deployment:Deployment=JSON.parse(await readFile('apps/web/public/deployment.json','utf8'));
const client=publicClientFor(deployment,process.env.FLOOR_RPC_URL);
const receipts=JSON.parse(await readFile(`packages/contracts/deployments/${deployment.chainId}-receipts.json`,'utf8')) as {blockNumber:string}[];
const live = await readSnapshot(deployment, undefined, process.env.FLOOR_RPC_URL);
const pair = latestEligiblePair(live);
const [lowerId, upperId] = pair ? [BigInt(pair.lower), BigInt(pair.upper)] : [2n, 3n];
const lower = pair ? BigInt(live.markets.find(market => market.id === pair.lower)!.strike) : 5000n;
const upper = pair ? BigInt(live.markets.find(market => market.id === pair.upper)!.strike) : 6000n;
const block=BigInt(pair ? live.blockNumber : deployment.seededBlock??receipts.at(-1)!.blockNumber);let contractCases=0;
for(let i=0;i<100;i++){
  const a=next()%10000000n+1n,b=next()%10000000n+1n;
  // A restarted Anvil may retain the live pair while pruning the original seed block's state.
  const r=await client.readContract({address:deployment.contracts.FloorVerifier,abi:FloorVerifierAbi,functionName:'verifyPair',args:[lowerId,upperId,a,b],blockNumber:block});
  if(!r.valid)throw new Error(`Solidity comparison needs a fresh deployment (reason ${r.reasonCode}). Run pnpm deploy:local on a clean Anvil.`);
  if(r.floorUsdcBase!==floorOf({lower,upper,lowerUnits:a,upperUnits:b}))throw new Error('Solidity/TS floor mismatch');contractCases++;
}
await mkdir('evidence',{recursive:true});await writeFile('evidence/differential.json',JSON.stringify({seed:'20261105',pythonVsTypescriptVectors:cases.length,solidityVsTypescriptVectors:contractCases,verifiedAtBlock:block.toString(),status:'PASS'},null,2));
console.log(`PASS: ${cases.length} independent Python/TypeScript vectors; ${contractCases} Solidity/TypeScript comparisons.`);
