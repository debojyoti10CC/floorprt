import {parseAbi,type Address,type PublicClient} from 'viem';
export const HistoricalFeedAbi=parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
  'function getRoundData(uint80) view returns (uint80,int256,uint256,uint256,uint80)',
]);
/** Same-phase, contiguous-round witness. Never substitutes a caller's price. */
export async function findFeedWitness(client:PublicClient,feed:Address,timestamp:bigint){
  const latest=await client.readContract({address:feed,abi:HistoricalFeedAbi,functionName:'latestRoundData'});
  if(latest[3]<=timestamp)throw new Error('Waiting for the first feed publication after the observation.');
  const phase=latest[0]>>64n;
  let low=1n,high=latest[0]&((1n<<64n)-1n);
  const read=(n:bigint)=>client.readContract({address:feed,abi:HistoricalFeedAbi,functionName:'getRoundData',args:[(phase<<64n)|n]});
  while(low<high){const mid=(low+high+1n)/2n;const r=await read(mid);if(r[3]<=timestamp)low=mid;else high=mid-1n;}
  const [before,after]=await Promise.all([read(low),read(low+1n)]);
  if(before[3]>timestamp||after[3]<=timestamp||before[1]<=0n||after[1]<=0n)throw new Error('No supported contiguous feed witness; use the shared longstop if the feed remains unavailable.');
  return {roundId:before[0],price:before[1],publishedAt:before[3],successorAt:after[3]};
}
