import {z} from 'zod';
const Row=z.object({id:z.string(),question:z.string(),slug:z.string().optional(),conditionId:z.string().optional(),outcomes:z.string().optional(),endDate:z.string().optional(),resolutionSource:z.string().optional()}).passthrough();
let cached:{markets:unknown[];fetchedAt:string}|null=null;let inFlight:Promise<any>|null=null;
export async function researchMarkets(){
  if(cached&&Date.now()-Date.parse(cached.fetchedAt)<60000)return {...cached,stale:false};
  if(inFlight)return inFlight;
  inFlight=(async()=>{
    const response=await fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=12',{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Floor-Protocol-Research/0.1'}});
    if(!response.ok)throw new Error(`Gamma source returned ${response.status}`);
    const rows=z.array(Row).parse(await response.json());
    const markets=rows.map(r=>{
      let outcomes:string[]=[];try{outcomes=z.array(z.string()).parse(JSON.parse(r.outcomes??'[]'))}catch{outcomes=[]}
      return {externalId:r.id,question:r.question.slice(0,1000),outcomes,conditionId:r.conditionId??null,endDate:r.endDate??null,resolutionSource:r.resolutionSource??null,sourceUri:r.slug?`https://polymarket.com/market/${encodeURIComponent(r.slug)}`:'https://polymarket.com',venue:'POLYMARKET',eligibility:'RESEARCH_ONLY',collateralEligible:false};
    });
    cached={markets,fetchedAt:new Date().toISOString()};return {...cached,stale:false};
  })();
  try{return await inFlight}finally{inFlight=null;}
}
