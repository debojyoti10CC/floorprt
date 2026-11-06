import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),site=resolve(root,'docs/mintlify'),check=process.argv.includes('--check');
const uint={type:'string',pattern:'^(0|[1-9][0-9]*)$'},address={type:'string',pattern:'^0x[0-9a-fA-F]{40}$'},hash={type:'string',pattern:'^0x[0-9a-fA-F]{64}$'};
const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required});
const ref=(name)=>({$ref:`#/components/schemas/${name}`});
const array=(items)=>({type:'array',items});
const str={type:'string'},bool={type:'boolean'},num={type:'integer'},decimal={type:'number'};
const schemas={
  Error:obj({error:str},['error']),
  Request:obj({principal:uint,maximumDue:uint,expiry:uint,active:bool}),
  Observation:obj({id:uint,assetId:hash,observationTime:uint,priceDecimals:num,sourceId:hash,resolutionPolicyHash:hash,cancelAfter:uint,state:{type:'integer',enum:[0,1,2]},price:uint,resolver:address}),
  Market:obj({id:uint,observationId:uint,strike:uint,enabledForNewCollateral:bool,yesTokenId:uint,noTokenId:uint,escrow:uint,yesBalance:uint,noBalance:uint}),
  Position:obj({id:uint,owner:address,beneficiary:address,marketLower:uint,marketUpper:uint,unitsLower:uint,unitsUpper:uint,observationId:uint,certifiedFloor:uint,state:{type:'integer',enum:[0,1,2,3,4]},lienLoanId:uint,request:ref('Request')}),
  Loan:obj({id:uint,positionId:uint,lender:address,borrower:address,principal:uint,due:uint,certifiedFloor:uint,fundedAt:uint,targetMaturity:uint,state:{type:'integer',enum:[0,1,2,3]}}),
  Activity:obj({event:str,args:{type:'object',additionalProperties:true},transactionHash:hash,blockNumber:uint,blockHash:hash,logIndex:num,address}),
  Deployment:obj({schema:{type:'string',enum:['floor-deployment/v1']},chainId:{type:'integer',enum:[31337,11155111]},chainName:str,rpcUrl:str,explorerUrl:str,deploymentBlock:uint,deployedAt:str,contracts:{type:'object',additionalProperties:address},codeHashes:{type:'object',additionalProperties:hash},roles:obj({curator:address,resolver:address,borrower:address,lender:address}),mockCollateral:bool,oracleMode:{type:'string',enum:['TRUSTED_TEST_RESOLVER','CHAINLINK_HISTORICAL']},oracle:{type:'object'},buildFingerprint:str,seededBlock:uint,defaultPair:obj({lower:uint,upper:uint})},['schema','chainId','chainName','rpcUrl','explorerUrl','deploymentBlock','deployedAt','contracts','codeHashes','roles','mockCollateral','oracleMode']),
  Snapshot:obj({chainId:num,blockNumber:uint,blockHash:hash,timestamp:uint,observations:array(ref('Observation')),markets:array(ref('Market')),positions:array(ref('Position')),loans:array(ref('Loan')),activity:array(ref('Activity')),walletAddress:{type:'string',nullable:true},walletBalance:{type:'string',nullable:true},bufferBps:num,source:{type:'string',enum:['DIRECT_CHAIN']},fetchedAt:str}),
  PreviewInput:obj({chainId:{type:'integer',enum:[31337,11155111]},lowerMarketId:{...uint,maxLength:78},upperMarketId:{...uint,maxLength:78},lowerYesUnits:{type:'string',pattern:'^[1-9][0-9]*$',description:'Positive uint64, at most 18446744073709551615.'},upperNoUnits:{type:'string',pattern:'^[1-9][0-9]*$',description:'Positive uint64, at most 18446744073709551615.'}}),
  Preview:obj({valid:bool,floorUsdcBase:uint,observationId:uint,proofVersion:hash,reasonCode:num,reason:str,scenarios:array(obj({state:str,label:str,price:{oneOf:[uint,{type:'string',enum:['CANCELLED']}]},payout:uint})),verifiedAtBlock:uint,verifierAddress:address,assumptions:array(str),authorization:{type:'boolean',enum:[false]}}),
  Metrics:obj({block:uint,activePrincipal:uint,lockedFloor:uint,settlements:num,authority:{type:'string',enum:['DIRECT_CHAIN']}}),
  AskLevel:obj({price:str,size:str}),
  ResearchMarket:obj({externalId:str,question:str,outcomes:array(str),buyBooks:array(array(ref('AskLevel'))),minimumOrderSizes:array({type:'string',nullable:true}),conditionId:{type:'string',nullable:true},endDate:{type:'string',nullable:true},resolutionSource:{type:'string',nullable:true},status:{type:'string',enum:['OPEN','CLOSED','INACTIVE']},volume:{type:'number',nullable:true},volume24h:{type:'number',nullable:true},liquidity:{type:'number',nullable:true},sourceUri:str,venue:{type:'string',enum:['POLYMARKET']},collateralEligible:{type:'boolean',enum:[false]}}),
  Research:obj({markets:array(ref('ResearchMarket')),fetchedAt:str,bookFetchedAt:{type:'string',nullable:true},stale:bool}),
};
const collection=(name)=>obj({items:array(ref(name)),total:num,limit:num,authority:{type:'string',enum:['DIRECT_CHAIN']}});
const routes=[
 ['config','get','/config','Deployment configuration',ref('Deployment'),'Current manifest generation, including addresses and code hashes. It is configuration, not proof that runtime code is present.'],
 ['health','get','/health','API and chain health',{type:'object',additionalProperties:true},'Checks RPC chain identity and exposes deployment identity, oracle mode, journal overview and signingKeys NONE. Returns 503 on chain mismatch or RPC unavailability. Healthy responses include apiVersion floor-api/v2; RPC-failure responses have a smaller shape.'],
 ['snapshot','get','/snapshot','Direct chain snapshot',ref('Snapshot'),'Pins related reads to one block; latest 200 per entity collection and about 5,000 blocks of activity. No wallet argument is accepted by this route, so walletAddress/walletBalance are null and market wallet balances are zero.'],
 ['observations','get','/observations','List observations',collection('Observation'),'Newest observations inside the bounded snapshot. total is the window count, not a global chain count.'],
 ['markets','get','/markets','List approved markets',{...collection('Market'),properties:{...collection('Market').properties,blockNumber:uint,source:{type:'string',enum:['DIRECT_CHAIN']}}},'Approved issuer markets, including escrow and deterministic token IDs; collection also includes blockNumber and source. Eligibility flag alone does not prove observation is still open.'],
 ['market','get','/markets/{id}','Read one market',obj({market:ref('Market'),observation:ref('Observation'),block:uint},['market','block']),'Searches the newest-200 market snapshot. Returns 404 outside that window or for missing IDs. Observation may be omitted when outside its own bounded collection.'],
 ['vault','get','/vaults/{id}','Read a position or owner portfolio',{oneOf:[ref('Position'),collection('Position')]},'If id is an Ethereum address, returns a bounded owner-filtered collection. Otherwise reads one position ID from the snapshot, returning 404 if absent. This route does not accept a separate owner query.'],
 ['loans','get','/loans','List loans',collection('Loan'),'Newest loans from direct chain reads; states are numeric enums.'],
 ['loan','get','/loans/{id}','Read one loan',ref('Loan'),'Searches the bounded direct snapshot. Missing or older IDs return 404 even if older contract state still exists.'],
 ['activity','get','/activity','List protocol activity',collection('Activity'),'Decoded known-contract protocol events in the bounded block window. Standard Transfer/Approval and OwnershipTransferred events are omitted; no address filter is implemented.'],
 ['metrics','get','/metrics','Read bounded metrics',ref('Metrics'),'activePrincipal sums FUNDED loans; lockedFloor sums OPEN and ENCUMBERED positions; settlements counts SETTLED loans. These are window aggregates, not unbounded protocol-wide analytics.'],
 ['research','get','/research/markets','Read external market books',ref('Research'),'Fetches up to 12 active Gamma markets and batches their outcome IDs into the Polymarket CLOB books endpoint. Markets use token IDs for v1 and position IDs for v2. Ask levels are sorted from the best buy price upward. Successful results cache per process for 10 seconds; each upstream request retries once with an 8-second timeout. On upstream failure, a cached result no older than 5 minutes returns with stale=true. Gamma failures without a usable cache return 502. A failed CLOB request leaves discovery metadata available with empty books. External rows are never collateral eligible.'],
 ['preview','post','/proof/preview','Preview a pair proof',ref('Preview'),'Validates decimal-string IDs and positive uint64 quantities, with chainId equal to the configured deployment. Calls the onchain verifier at a pinned block, then builds scenarios from a separate snapshot. Always authorization false. A valid=false proof normally returns HTTP 200; scenarios may still exist and are not certification.'],
];
const spec={openapi:'3.0.3',info:{title:'AQRA read API',version:'0.1.0',description:'Source-derived local prototype API. No signing routes or monetary authorization. Integer financial values are decimal strings; entity lists are bounded snapshots, not cursor pagination.'},servers:[{url:'http://127.0.0.1:8787/api/v1',description:'Local Hono API'}],paths:{},components:{schemas}};
let count=0;
async function emit(path,text){count++;const target=resolve(site,path);if(check){if(await readFile(target,'utf8').catch(()=>null)!==text)throw new Error(`Generated API docs drift: ${path}`);}else{await mkdir(dirname(target),{recursive:true});await writeFile(target,text);}}
for(const [slug,method,path,title,response,notes] of routes){
 const parameters=[];
 if(path.includes('{id}'))parameters.push({name:'id',in:'path',required:true,schema:str,description:slug==='vault'?'Position ID or owner Ethereum address.':'Decimal entity ID.'});
 const hasLimit=['observations','markets','vault','loans','activity'].includes(slug);
 if(hasLimit)parameters.push({name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100,default:50},description:'Tail of bounded snapshot; clamped to 1–100. No cursor/offset support.'});
 const op={operationId:slug,summary:title,description:notes,parameters,responses:{200:{description:'Successful read; proof validity is a separate field.',content:{'application/json':{schema:response}}},500:{description:'Runtime/manifest/RPC error; malformed preview JSON also reaches generic error handling.',content:{'application/json':{schema:ref('Error')}}}}};
 if(['market','vault','loan'].includes(slug))op.responses[404]={description:'Entity not found inside the bounded snapshot.'};
 if(slug==='health')op.responses[503]={description:'Wrong chain or unavailable RPC.'};
 if(slug==='research')op.responses[502]={description:'Gamma/source validation failure; collateralEligible remains false.'};
 if(slug==='preview'){
  op.requestBody={required:true,content:{'application/json':{schema:ref('PreviewInput'),example:{chainId:31337,lowerMarketId:'2',upperMarketId:'3',lowerYesUnits:'1',upperNoUnits:'1'}}}};
  op.responses[400]={description:'Invalid parsed request shape, chain ID or quantity.'};op.responses[413]={description:'Declared Content-Length exceeds 8192 bytes. This is not a hardened streaming size cap.'};
 }
 spec.paths[path]={[method]:op};
 const actualPath=path.replace('{id}',slug==='vault'?'1':'2');
 const body=slug==='preview'?` -X POST \\\n  -H 'Content-Type: application/json' \\\n  -d '{"chainId":31337,"lowerMarketId":"2","upperMarketId":"3","lowerYesUnits":"1","upperNoUnits":"1"}'`:'';
 const curl=`curl 'http://127.0.0.1:8787/api/v1${actualPath}${hasLimit?'?limit=50':''}'${body}`;
 const content=`---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(`${method.toUpperCase()} /api/v1${path} — ${notes.slice(0,140)}`)}\n---\n\n\x60${method.toUpperCase()} /api/v1${path}\x60\n\n${notes}\n\n## Request\n\n\x60\x60\x60bash\n${curl}\n\x60\x60\x60\n\n${hasLimit?'Optional `limit` defaults to 50 and is clamped to 1–100. It selects the tail of the bounded window, without cursor or offset pagination.\n\n':''}${path.includes('{id}')?'Path `id` is required. '+(slug==='vault'?'An owner address switches the response from one Position to a collection.':'Use a decimal entity ID.')+'\n\n':''}## Response contract\n\nThe following is a **schema**, not a transaction result. Shared types resolve in the [OpenAPI specification](/api/openapi.json).\n\n\x60\x60\x60json\n${JSON.stringify(response,null,2)}\n\x60\x60\x60\n\n## Status codes\n\n${Object.entries(op.responses).map(([code,r])=>`- **${code}**: ${r.description}`).join('\n')}\n\n[API conventions and limitations](/api/overview)\n`;
 await emit(`api/${slug}.mdx`,content);
}
const source=await readFile(resolve(root,'apps/api/src/app.ts'),'utf8');
const actual=[...source.matchAll(/app\.(get|post)\('([^']+)'/g)].map(m=>`${m[1]} ${m[2].replace(':id','{id}')}`).sort();
const documented=routes.map(([,method,path])=>`${method} /api/v1${path}`).sort();
if(JSON.stringify(actual)!==JSON.stringify(documented))throw new Error('HTTP route inventory drift: update docs-api-generate.mjs.');
await emit('api/openapi.json',JSON.stringify(spec,null,2)+'\n');
console.log(`PASS: ${routes.length} source-matched HTTP routes; ${count} generated API files ${check?'match':'written'}.`);
