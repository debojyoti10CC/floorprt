import {describe,it,expect} from 'vitest';
import {latestEligiblePair} from './eligibility';
import type {Snapshot} from './chain';
const data=()=>({timestamp:'100',observations:[{id:'1',state:1,observationTime:'200'},{id:'2',state:0,observationTime:'90'},{id:'3',state:0,observationTime:'200'}],markets:[{id:'1',observationId:'1',strike:'100',enabledForNewCollateral:true},{id:'2',observationId:'1',strike:'200',enabledForNewCollateral:true},{id:'3',observationId:'2',strike:'100',enabledForNewCollateral:true},{id:'4',observationId:'2',strike:'200',enabledForNewCollateral:true},{id:'5',observationId:'3',strike:'100',enabledForNewCollateral:true},{id:'6',observationId:'3',strike:'200',enabledForNewCollateral:true}]} as Snapshot);
describe('live pair recovery',()=>{
  it('skips finalized and matured observations even when IDs are registered',()=>expect(latestEligiblePair(data())).toEqual({lower:'5',upper:'6'}));
  it('never combines different observations to recover an invalid draft',()=>{const d=data();d.markets=d.markets.filter(m=>m.id!=='6');expect(latestEligiblePair(d)).toBeNull()});
  it('does not offer a disabled market as fresh collateral',()=>{const d=data();d.markets[5].enabledForNewCollateral=false;expect(latestEligiblePair(d)).toBeNull()});
});
