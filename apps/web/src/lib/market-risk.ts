import {parseAmount,UNIT} from '@floor/proof-engine';

export type AskLevel={price:string;size:string};
export type MarketRisk={spent:bigint;shares:bigint;grossIfCorrect:bigint;unfilled:bigint;bestAsk:bigint|null;belowMinimum:boolean};

export function estimateMarketRisk(stakeText:string,levels:AskLevel[],minimumOrderSize?:string|null):MarketRisk{
  const stake=parseAmount(stakeText,6);
  if(stake<=0n)throw new Error('Enter a stake above zero.');
  let remaining=stake,spent=0n,shares=0n,bestAsk:bigint|null=null;
  const ordered=[...levels].map(level=>({price:parseAmount(level.price,6),size:parseAmount(level.size,6)})).filter(level=>level.price>0n&&level.price<=UNIT&&level.size>0n).sort((a,b)=>a.price<b.price?-1:a.price>b.price?1:0);
  for(const level of ordered){
    if(bestAsk===null)bestAsk=level.price;
    const capacity=level.price*level.size/UNIT;
    const budget=remaining<capacity?remaining:capacity;
    let bought=budget*UNIT/level.price;
    let cost=(bought*level.price+UNIT-1n)/UNIT;
    if(cost>remaining){bought=(remaining*UNIT)/level.price;cost=(bought*level.price+UNIT-1n)/UNIT;}
    if(bought===0n||cost===0n)continue;
    shares+=bought;spent+=cost;remaining-=cost;
    if(remaining===0n)break;
  }
  const minimum=minimumOrderSize?parseAmount(minimumOrderSize,6):null;
  return {spent,shares,grossIfCorrect:shares,unfilled:remaining,bestAsk,belowMinimum:minimum!==null&&shares>0n&&shares<minimum};
}
