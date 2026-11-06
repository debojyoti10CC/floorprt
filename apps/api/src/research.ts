import {z} from 'zod';
const Numeric=z.union([z.string(),z.number()]);
const Row=z.object({id:z.string(),question:z.string(),slug:z.string().optional(),conditionId:z.string().optional(),outcomes:z.unknown().optional(),outcomePrices:z.unknown().optional(),clobTokenIds:z.unknown().optional(),positionIds:z.unknown().optional(),version:z.string().optional(),endDate:z.string().optional(),resolutionSource:z.string().optional(),active:z.boolean().optional(),closed:z.boolean().optional(),volume:z.union([z.string(),z.number()]).optional(),volume24hr:z.union([z.string(),z.number()]).optional(),liquidity:z.union([z.string(),z.number()]).optional()}).passthrough();
const Book=z.object({asset_id:z.string().optional(),assetId:z.string().optional(),timestamp:z.union([z.string(),z.number()]).optional(),min_order_size:Numeric.optional(),minOrderSize:Numeric.optional(),tick_size:Numeric.optional(),tickSize:Numeric.optional(),hash:z.string().optional(),asks:z.array(z.object({price:Numeric,size:Numeric})).default([]),bids:z.array(z.object({price:Numeric,size:Numeric})).default([])}).passthrough();
let cached:{markets:unknown[];fetchedAt:string;bookFetchedAt:string|null}|null=null;let inFlight:Promise<any>|null=null;
const numeric=(value:string|number|undefined)=>{const parsed=Number(value);return value!==undefined&&Number.isFinite(parsed)?parsed:null};
const stringArray=(value:unknown):string[]=>{if(Array.isArray(value))return value.filter((item):item is string=>typeof item==='string');if(typeof value!=='string')return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'):[]}catch{return[]}};
async function fetchJson(url:string,init:RequestInit){
  let failure:unknown;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{...init,signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error(`Market source returned ${response.status}`);
      return await response.json();
    }catch(error){failure=error;if(attempt===0)await new Promise(resolve=>setTimeout(resolve,250));}
  }
  throw failure instanceof Error?failure:new Error('Market source unavailable');
}
export async function researchMarkets(){
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<10000)return {...cached,stale:false};
  if(inFlight)return inFlight;
  inFlight=(async()=>{
    const rawRows=await fetchJson('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=12',{headers:{'User-Agent':'AQRA-Market-Risk/0.1'}});
    const rows=z.array(Row).parse(rawRows);
    const parsed=rows.map(r=>{
      const outcomes=stringArray(r.outcomes);
      const version=r.version?.toLowerCase();
      const assets=version==='v2'||version==='2'?stringArray(r.positionIds):stringArray(r.clobTokenIds);
      return {row:r,outcomes,assets};
    });
    const requests=parsed.flatMap(item=>item.assets.map((assetId,outcomeIndex)=>({assetId,outcomeIndex,marketId:item.row.id}))).slice(0,500);
    let booksByAsset=new Map<string,z.infer<typeof Book>>(),bookFetchedAt:string|null=null;
    if(requests.length){
      try{
        const rawBooks=await fetchJson('https://clob.polymarket.com/books',{method:'POST',headers:{'content-type':'application/json','User-Agent':'AQRA-Market-Risk/0.1'},body:JSON.stringify(requests.map(request=>({token_id:request.assetId})))});
        const books=z.array(Book).parse(rawBooks);booksByAsset=new Map(books.flatMap(book=>{const key=book.asset_id??book.assetId;return key?[[key,book] as const]:[]}));bookFetchedAt=new Date().toISOString();
      }catch{/* Market discovery remains useful while the order-book source is unavailable. */}
    }
    const markets=parsed.map(({row:r,outcomes,assets})=>({externalId:r.id,question:r.question.slice(0,1000),outcomes,buyBooks:outcomes.map((_,i)=>{const book=assets[i]?booksByAsset.get(assets[i]):undefined;return book?.asks.map(level=>({price:String(level.price),size:String(level.size)})).sort((a,b)=>Number(a.price)-Number(b.price))??[]}),minimumOrderSizes:outcomes.map((_,i)=>{const book=assets[i]?booksByAsset.get(assets[i]):undefined,value=book?.min_order_size??book?.minOrderSize;return value===undefined?null:String(value)}),conditionId:r.conditionId??null,endDate:r.endDate??null,resolutionSource:r.resolutionSource??null,status:r.closed?'CLOSED':r.active?'OPEN':'INACTIVE',volume:numeric(r.volume),volume24h:numeric(r.volume24hr),liquidity:numeric(r.liquidity),sourceUri:r.slug?`https://polymarket.com/market/${encodeURIComponent(r.slug)}`:'https://polymarket.com',venue:'POLYMARKET',collateralEligible:false}));
    cached={markets,fetchedAt:new Date().toISOString(),bookFetchedAt};return {...cached,stale:false};
  })();
  try{return await inFlight}catch(error){if(cached&&Date.now()-Date.parse(cached.fetchedAt)<300000)return {...cached,stale:true};throw error}finally{inFlight=null;}
}
