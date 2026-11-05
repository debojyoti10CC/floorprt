/** Preparation for a future authorized oracle workflow, not a CRE CLI simulation. */
import {encodeFunctionData,type Hash} from 'viem';
import {SharedObservationRegistryAbi} from '../../packages/shared/src/abis.generated';
import {parseAmount} from '../../packages/proof-engine/src/index';
export type ObservationPolicy={id:bigint;assetId:Hash;sourceId:Hash;observationTime:bigint;priceDecimals:number;state:number};
export type ExternalScalar={assetId:Hash;sourceId:Hash;observedAt:string;price:string;priceDecimals:number};
export function prepareReport(obs:ObservationPolicy,feed:ExternalScalar,now:bigint,windowSeconds=60n,maxReportDelay=300n){
  if(obs.state!==0)throw new Error('OBSERVATION_ALREADY_TERMINAL');
  if(now<obs.observationTime)throw new Error('OBSERVATION_NOT_MATURE');
  if(feed.assetId!==obs.assetId||feed.sourceId!==obs.sourceId)throw new Error('SOURCE_IDENTITY_MISMATCH');
  if(feed.priceDecimals!==obs.priceDecimals)throw new Error('PRECISION_MISMATCH');
  if(!/^[0-9]+$/.test(feed.observedAt))throw new Error('INVALID_SOURCE_TIMESTAMP');
  const sourceTime=BigInt(feed.observedAt);
  if(sourceTime<obs.observationTime||sourceTime>obs.observationTime+windowSeconds)throw new Error('OUTSIDE_OBSERVATION_WINDOW');
  if(sourceTime>now||now-sourceTime>maxReportDelay)throw new Error('STALE_OR_FUTURE_REPORT');
  const canonicalPrice=parseAmount(feed.price,obs.priceDecimals);
  if(canonicalPrice>10n**36n)throw new Error('PRICE_OUT_OF_RANGE');
  return {observationId:obs.id,canonicalPrice,sourceTime,calldata:encodeFunctionData({abi:SharedObservationRegistryAbi,functionName:'finalize',args:[obs.id,canonicalPrice]}),authorization:'NONE_PREPARATION_ONLY' as const};
}
