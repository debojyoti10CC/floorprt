'use client';
import {useEffect,useMemo,useState} from 'react';
import {floorOf,parseUnits,type Pair} from '@floor/proof-engine';
import {FloorVerifierAbi,publicClientFor,REASONS} from '@floor/shared';
import {useProtocol,message} from './protocol';
type Proof={valid:boolean;floorUsdcBase:bigint;observationId:bigint;proofVersion:`0x${string}`;reasonCode:number;block:bigint};
export function usePair(){
  const {data,deployment,draft,online,rpcUrl}=useProtocol();
  const lower=data?.markets.find(m=>m.id===draft.lower),upper=data?.markets.find(m=>m.id===draft.upper);
  const observation=data?.observations.find(o=>o.id===lower?.observationId);
  const derived=useMemo(()=>{
    try{
      if(!lower||!upper)return {pair:null,problem:'Select two registered threshold markets.',preview:0n};
      const pair:Pair={lower:BigInt(lower.strike),upper:BigInt(upper.strike),lowerUnits:parseUnits(draft.lowerUnits),upperUnits:parseUnits(draft.upperUnits)};
      const preview=floorOf(pair);
      if(lower.observationId!==upper.observationId)return {pair,preview:0n,problem:'ERR_OBSERVATION_MISMATCH · Similar titles do not share an immutable observation.'};
      return {pair,preview,problem:null};
    }catch(e){return {pair:null,preview:0n,problem:message(e)}}
  },[lower,upper,draft.lowerUnits,draft.upperUnits]);
  const [proof,setProof]=useState<Proof|null>(null),[verifyError,setVerifyError]=useState<string|null>(null);
  useEffect(()=>{
    let cancelled=false;setProof(null);setVerifyError(null);
    if(!online||!deployment||!derived.pair||!lower||!upper)return;
    const timer=setTimeout(async()=>{try{
      const client=publicClientFor(deployment,rpcUrl);const block=await client.getBlockNumber();
      const result=await client.readContract({address:deployment.contracts.FloorVerifier,abi:FloorVerifierAbi,functionName:'verifyPair',args:[BigInt(lower.id),BigInt(upper.id),derived.pair!.lowerUnits,derived.pair!.upperUnits],blockNumber:block});
      if(!cancelled)setProof({...result,block});
    }catch(e){if(!cancelled)setVerifyError(message(e))}},180);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[deployment,rpcUrl,online,derived.pair,lower,upper,data?.blockNumber]);
  return {...derived,lower,upper,observation,proof,verified:online&&proof?.valid===true,reason:derived.problem??verifyError??(proof&&!proof.valid?REASONS[proof.reasonCode]:null)};
}
