import {Hono} from 'hono';
import {cors} from 'hono/cors';
import {z} from 'zod';
import {isAddress} from 'viem';
import {readSnapshot,publicClientFor,FloorVerifierAbi,REASONS,ASSUMPTIONS,jsonSafe} from '../../../packages/shared/src/index';
import {scenarios} from '../../../packages/proof-engine/src/index';
import {researchMarkets} from './research';
import type {ApiRuntime} from './deployment';

const collection=<T>(items:T[],query:string|undefined)=>{const limit=Math.min(Math.max(Number(query)||50,1),100);return {items:items.slice(-limit),total:items.length,limit,authority:'DIRECT_CHAIN'};};
const uint=z.string().regex(/^(0|[1-9]\d*)$/).max(78);const quantity=z.string().regex(/^[1-9]\d*$/).refine(s=>BigInt(s)<(1n<<64n));
const PairPreview=z.object({lowerMarketId:uint,upperMarketId:uint,lowerYesUnits:quantity,upperNoUnits:quantity});
const snapshot=({deployment,rpcUrl}:ApiRuntime)=>readSnapshot(deployment,undefined,rpcUrl);

export function createReadApi(loadRuntime:()=>Promise<ApiRuntime>){
  const app=new Hono<{Variables:{runtime:ApiRuntime}}>();
  const configuredOrigins=new Set((process.env.FLOOR_WEB_ORIGINS??'').split(',').map(value=>value.trim()).filter(Boolean));
  app.use('/api/*',cors({origin:origin=>/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)||configuredOrigins.has(origin)?origin:undefined}));
  app.use('/api/*',async(c,next)=>{c.set('runtime',await loadRuntime());await next();});
  app.onError((error,c)=>c.json({error:error.message,authority:'READ_ONLY_API'},500));
  app.get('/api/v1/config',c=>c.json(c.get('runtime').deployment));
  app.get('/api/v1/health',async c=>{
    const {deployment,rpcUrl,journal}=c.get('runtime');
    const identity={deploymentBlock:deployment.deploymentBlock,registry:deployment.contracts.SharedObservationRegistry,creditDesk:deployment.contracts.CreditDesk,buildFingerprint:deployment.buildFingerprint};
    try{
      const client=publicClientFor(deployment,rpcUrl);const [chainId,block]=await Promise.all([client.getChainId(),client.getBlockNumber()]);
      return c.json({apiVersion:'floor-api/v2',status:chainId===deployment.chainId?'ok':'chain_mismatch',chainId,expectedChainId:deployment.chainId,block:block.toString(),deployment:identity,indexer:journal.overview(),oracleMode:deployment.oracleMode,signingKeys:'NONE'},chainId===deployment.chainId?200:503);
    }catch(e){return c.json({status:'rpc_unavailable',error:(e as Error).message,deployment:identity,indexer:journal.overview()},503);}
  });
  app.get('/api/v1/snapshot',async c=>c.json(await snapshot(c.get('runtime'))));
  app.get('/api/v1/observations',async c=>c.json(collection((await snapshot(c.get('runtime'))).observations,c.req.query('limit'))));
  app.get('/api/v1/markets',async c=>{const s=await snapshot(c.get('runtime'));return c.json({...collection(s.markets,c.req.query('limit')),blockNumber:s.blockNumber,source:'DIRECT_CHAIN'});});
  app.get('/api/v1/markets/:id',async c=>{const s=await snapshot(c.get('runtime'));const m=s.markets.find(x=>x.id===c.req.param('id'));return m?c.json({market:m,observation:s.observations.find(x=>x.id===m.observationId),block:s.blockNumber}):c.json({error:'Market not found'},404);});
  app.get('/api/v1/vaults/:id',async c=>{const s=await snapshot(c.get('runtime')),id=c.req.param('id');if(isAddress(id))return c.json(collection(s.positions.filter(p=>p.owner.toLowerCase()===id.toLowerCase()),c.req.query('limit')));const p=s.positions.find(p=>p.id===id);return p?c.json(p):c.json({error:'Position not found'},404);});
  app.get('/api/v1/loans',async c=>c.json(collection((await snapshot(c.get('runtime'))).loans,c.req.query('limit'))));
  app.get('/api/v1/loans/:id',async c=>{const l=(await snapshot(c.get('runtime'))).loans.find(l=>l.id===c.req.param('id'));return l?c.json(l):c.json({error:'Loan not found'},404);});
  app.get('/api/v1/activity',async c=>c.json(collection((await snapshot(c.get('runtime'))).activity,c.req.query('limit'))));
  app.get('/api/v1/metrics',async c=>{const s=await snapshot(c.get('runtime'));return c.json(jsonSafe({block:s.blockNumber,activePrincipal:s.loans.filter(l=>l.state===1).reduce((a,l)=>a+BigInt(l.principal),0n),lockedFloor:s.positions.filter(p=>p.state===1||p.state===2).reduce((a,p)=>a+BigInt(p.certifiedFloor),0n),settlements:s.loans.filter(l=>l.state===2).length,authority:'DIRECT_CHAIN'}));});
  app.get('/api/v1/research/markets',async c=>{try{return c.json(await researchMarkets())}catch(e){return c.json({error:(e as Error).message,source:'POLYMARKET_GAMMA',collateralEligible:false},502)}});
  app.post('/api/v1/proof/preview',async c=>{
    const runtime=c.get('runtime'),{deployment,rpcUrl}=runtime;
    if(Number(c.req.header('content-length')??0)>8192)return c.json({error:'Payload too large'},413);
    const parsed=PairPreview.extend({chainId:z.literal(deployment.chainId)}).safeParse(await c.req.json());if(!parsed.success)return c.json({error:'Invalid pair preview request',details:parsed.error.flatten()},400);
    const q=parsed.data,client=publicClientFor(deployment,rpcUrl),block=await client.getBlockNumber();
    const result=await client.readContract({address:deployment.contracts.FloorVerifier,abi:FloorVerifierAbi,functionName:'verifyPair',args:[BigInt(q.lowerMarketId),BigInt(q.upperMarketId),BigInt(q.lowerYesUnits),BigInt(q.upperNoUnits)],blockNumber:block});
    const s=await snapshot(runtime),l=s.markets.find(m=>m.id===q.lowerMarketId),u=s.markets.find(m=>m.id===q.upperMarketId);
    const states=l&&u&&BigInt(l.strike)<BigInt(u.strike)?scenarios({lower:BigInt(l.strike),upper:BigInt(u.strike),lowerUnits:BigInt(q.lowerYesUnits),upperUnits:BigInt(q.upperNoUnits)}):[];
    return c.json(jsonSafe({...result,reason:REASONS[result.reasonCode],scenarios:states,verifiedAtBlock:block,verifierAddress:deployment.contracts.FloorVerifier,assumptions:ASSUMPTIONS,authorization:false}));
  });
  return app;
}
