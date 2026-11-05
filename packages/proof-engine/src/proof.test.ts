import { describe, expect, it } from 'vitest';
import { floorOf, payout, scenarios, parseAmount, parseUnits, maximumDue, waterfall, analyzeThresholdPortfolio } from './index';
const pair = { lower: 5000n, upper: 6000n, lowerUnits: 1n, upperUnits: 1n };
describe('fixed contractual payout proof', () => {
  it('observes inclusive lower and exclusive upper endpoints plus cancellation', () => {
    expect([4500n,5000n,5500n,6000n,6500n,'CANCELLED' as const].map(p => payout(pair,p))).toEqual([1000000n,2000000n,2000000n,1000000n,1000000n,1000000n]);
    expect(scenarios(pair)).toHaveLength(6);
  });
  it('supports unequal and odd whole quantities without cancellation dust', () => {
    const p = {...pair,lowerUnits:3n,upperUnits:2n};
    expect(floorOf(p)).toBe(2000000n); expect(payout(p,'CANCELLED')).toBe(2500000n);
  });
  it('rejects empty, reversed and fractional inputs', () => {
    expect(() => floorOf({...pair, lower:6000n})).toThrow();
    expect(() => floorOf({...pair, lowerUnits:0n})).toThrow();
    expect(() => parseUnits('0.5')).toThrow();
    expect(() => parseAmount('0.0000001')).toThrow();
    expect(() => parseAmount('1e3')).toThrow();
    expect(() => parseUnits('18446744073709551616')).toThrow();
  });
  it('keeps all transaction amounts exact', () => {
    expect(parseAmount('0.78')).toBe(780000n); expect(parseAmount('9007199254740993.000001')).toBe(9007199254740993000001n);
    expect(maximumDue(1000000n)).toBe(800000n); expect(maximumDue(1n)).toBe(0n);
    expect(waterfall(2000000n,780000n)).toEqual({lenderPaid:780000n,borrowerPaid:1220000n});
    expect(() => waterfall(700000n,780000n)).toThrow();
  });
  it('checks many random boundaries deterministically', () => {
    let seed=20261105n;
    const next = () => seed=(seed*6364136223846793005n+1442695040888963407n) & ((1n<<64n)-1n);
    for(let i=0;i<20000;i++) {
      const lower=next()%100000000000000n+1n, upper=lower+next()%100000000000000n+1n;
      const p={lower,upper,lowerUnits:next()%1000000000n+1n,upperUnits:next()%1000000000n+1n};
      const values=[0n,lower-1n,lower,upper-1n,upper,upper+1n,'CANCELLED' as const].map(x=>payout(p,x));
      expect(values.reduce((a,b)=>a<b?a:b)).toBe(floorOf(p));
    }
  });
  it('keeps generalized portfolio analysis separate from onchain authorization', () => {
    const legs=[{strike:5000n,side:'YES' as const,units:1n,observationId:'1'},{strike:6000n,side:'NO' as const,units:1n,observationId:'1'}];
    expect(analyzeThresholdPortfolio(legs).minimum).toBe(1000000n);
    expect(analyzeThresholdPortfolio(legs).onchainVerified).toBe(false);
    expect(()=>analyzeThresholdPortfolio([legs[0],{...legs[1],observationId:'2'}])).toThrow('ERR_OBSERVATION_MISMATCH');
  });
});
