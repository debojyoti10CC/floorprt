import {it,expect,describe} from 'vitest';
import {prepareReport,type ExternalScalar,type ObservationPolicy} from './validate-report';
const hash=('0x'+'01'.repeat(32)) as `0x${string}`,other=('0x'+'02'.repeat(32)) as `0x${string}`;
const obs:ObservationPolicy={id:1n,assetId:hash,sourceId:hash,observationTime:1000n,priceDecimals:8,state:0};
const feed:ExternalScalar={assetId:hash,sourceId:hash,observedAt:'1000',price:'5500.12345678',priceDecimals:8};
describe('future oracle report preflight, no signing authority',()=>{
  it('normalizes exact price and builds a proposal without authorizing it',()=>{const r=prepareReport(obs,feed,1001n);expect(r.canonicalPrice).toBe(550012345678n);expect(r.authorization).toBe('NONE_PREPARATION_ONLY');expect(r.calldata.startsWith('0x')).toBe(true)});
  it('rejects premature, stale and future source reports',()=>{expect(()=>prepareReport(obs,feed,999n)).toThrow('OBSERVATION_NOT_MATURE');expect(()=>prepareReport(obs,feed,1400n)).toThrow('STALE_OR_FUTURE_REPORT');expect(()=>prepareReport(obs,{...feed,observedAt:'1002'},1001n)).toThrow('STALE_OR_FUTURE_REPORT')});
  it('enforces exact source, asset and precision',()=>{expect(()=>prepareReport(obs,{...feed,assetId:other},1001n)).toThrow('SOURCE_IDENTITY_MISMATCH');expect(()=>prepareReport(obs,{...feed,priceDecimals:6},1001n)).toThrow('PRECISION_MISMATCH')});
  it('rejects reports outside the contractually chosen observation window',()=>{expect(()=>prepareReport(obs,{...feed,observedAt:'999'},1001n)).toThrow('OUTSIDE_OBSERVATION_WINDOW');expect(()=>prepareReport(obs,{...feed,observedAt:'1061'},1061n)).toThrow('OUTSIDE_OBSERVATION_WINDOW')});
  it('rejects terminal state, negative and out of range prices',()=>{expect(()=>prepareReport({...obs,state:1},feed,1001n)).toThrow('OBSERVATION_ALREADY_TERMINAL');expect(()=>prepareReport(obs,{...feed,price:'-1'},1001n)).toThrow();expect(()=>prepareReport(obs,{...feed,price:'100000000000000000000000000000000000000'},1001n)).toThrow('PRICE_OUT_OF_RANGE')});
});
