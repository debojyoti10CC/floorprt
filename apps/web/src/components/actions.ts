'use client';
import {useState} from 'react';
import {decodeEventLog,type TransactionReceipt} from 'viem';
import {abis,type ContractName,CollateralTokenAbi,publicClientFor} from '@floor/shared';
import {UNIT} from '@floor/proof-engine';
import {useProtocol,message} from '../lib/protocol';
export function useAction(){const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);const run=async(fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError(null);try{await fn()}catch(e){setError(message(e))}finally{setBusy(false)}};return {busy,error,run,setError};}
export function eventArgs(receipt:TransactionReceipt,name:ContractName,event:string):Record<string,unknown>{for(const log of receipt.logs){try{const d=decodeEventLog({abi:abis[name],data:log.data,topics:log.topics});if(d.eventName===event)return d.args as unknown as Record<string,unknown>}catch{/* unrelated event */}}throw new Error(`Missing ${event} in confirmed receipt`);}
export function useMint(){const p=useProtocol();return async(marketId:bigint,units:bigint)=>{
  if(!p.deployment||!p.address)throw new Error('Connect a wallet to mint backed claims.');
  const client=publicClientFor(p.deployment,p.rpcUrl);const amount=units*UNIT;
  const allowance=await client.readContract({address:p.deployment.contracts.CollateralToken,abi:CollateralTokenAbi,functionName:'allowance',args:[p.address,p.deployment.contracts.OutcomeTokens]});
  if(allowance<amount)await p.transact('Approve test USDC for complete sets','CollateralToken','approve',[p.deployment.contracts.OutcomeTokens,amount]);
  return p.transact('Mint fully backed complete set','OutcomeTokens','mintCompleteSet',[marketId,units]);
};}
