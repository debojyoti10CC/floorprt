import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {createReadApi} from './app';
import {deploymentLoader} from './deployment';
import type {Deployment} from '../../../packages/shared/src/index';

const address=(last:string)=>`0x${last.padStart(40,'0')}` as `0x${string}`;
const hash=(digit:string)=>`0x${digit.repeat(64)}` as `0x${string}`;
const manifest=(deploymentBlock='10'):Deployment=>({
  schema:'floor-deployment/v1',chainId:31337,chainName:'Anvil local devnet',rpcUrl:'http://127.0.0.1:8545',explorerUrl:'',deploymentBlock,deployedAt:'2026-11-06T00:00:00.000Z',
  contracts:{CollateralToken:address('1'),SharedObservationRegistry:address('2'),OutcomeMarketFactory:address('3'),OutcomeTokens:address('4'),FloorVerifier:address('5'),FloorVault:address('6'),CreditDesk:address('7')},
  codeHashes:{CollateralToken:hash('1'),SharedObservationRegistry:hash('2'),OutcomeMarketFactory:hash('3'),OutcomeTokens:hash('4'),FloorVerifier:hash('5'),FloorVault:hash('6'),CreditDesk:hash('7')},
  roles:{curator:address('8'),resolver:address('9'),borrower:address('a'),lender:address('b')},mockCollateral:true,oracleMode:'TRUSTED_TEST_RESOLVER',
});

describe('API deployment generations',()=>{
  let directory:string|undefined;
  afterEach(async()=>{if(directory){await rm(directory,{recursive:true,force:true});directory=undefined;}});

  it('serves a refreshed manifest and replaces the journal only when chain identity changes',async()=>{
    directory=await mkdtemp(join(tmpdir(),'floor-api-'));
    const path=join(directory,'deployment.json');
    await writeFile(path,JSON.stringify(manifest()));
    const load=deploymentLoader(path,'http://127.0.0.1:8545');
    const app=createReadApi(load);
    const original=await load();
    expect(await load()).toBe(original);

    const refreshed={...manifest(),'chainName':'Renamed devnet'};
    await writeFile(path,JSON.stringify(refreshed));
    const response=await app.request('/api/v1/config');
    expect(response.status).toBe(200);
    expect((await response.json()).chainName).toBe('Renamed devnet');
    const sameChain=await load();
    expect(sameChain).not.toBe(original);
    expect(sameChain.journal).toBe(original.journal);

    await writeFile(path,JSON.stringify(manifest('11')));
    const redeployed=await load();
    expect(redeployed.journal).not.toBe(original.journal);
    expect((JSON.parse(await readFile(path,'utf8')) as Deployment).deploymentBlock).toBe('11');
  });
});
