import type {Snapshot} from './chain';

export function eligibleMarkets(data:Snapshot){
  const open=new Set(data.observations.filter(o=>o.state===0&&BigInt(o.observationTime)>BigInt(data.timestamp)).map(o=>o.id));
  return data.markets.filter(m=>m.enabledForNewCollateral&&open.has(m.observationId));
}
export function latestEligiblePair(data:Snapshot){
  const markets=eligibleMarkets(data);
  for(const o of [...data.observations].reverse()){
    const group=markets.filter(m=>m.observationId===o.id).sort((a,b)=>BigInt(a.strike)<BigInt(b.strike)?-1:1);
    if(group.length>1&&group[0].strike!==group.at(-1)!.strike)return {lower:group[0].id,upper:group.at(-1)!.id};
  }
  return null;
}
