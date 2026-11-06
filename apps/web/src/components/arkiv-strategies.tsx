'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import {custom,http,type Address,type Hex,encodePacked,keccak256} from 'viem';
import {createPublicClient as createArkivPublicClient,createWalletClient as createArkivWalletClient,ExpirationTime,defineSchema} from '@arkiv-network/sdk';
import {rabdi} from '@arkiv-network/sdk/chains';
import {eq} from '@arkiv-network/sdk/query';
import {addr,str,u64} from '@arkiv-network/sdk/schema';
import {ArrowDownToLine,ExternalLink,LoaderCircle,RefreshCw,Trash2,UploadCloud} from 'lucide-react';
import {formatAmount,UNIT,type Pair} from '@floor/proof-engine';
import type {Deployment} from '@floor/shared';
import {Badge,Button,Panel} from './ui';

declare global{interface Window{ethereum?:import('viem').EIP1193Provider}}

const APP_TAG='aqra.floor.strategies.v1';
const STRATEGIES=defineSchema(APP_TAG,{
  app:str().indexed(),owner:addr().indexed(),chainId:u64().indexed(),observationId:u64().indexed(),asset:str().indexed(),
  title:str(),lowerMarketId:u64(),upperMarketId:u64(),lowerUnits:u64(),upperUnits:u64(),lowerStrike:str(),upperStrike:str(),
  certifiedFloorMicros:u64(),proofHash:str(),registry:addr(),vault:addr(),
});
const accessKey=process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY??'';
const arkivChain=rabdi({accessKey});
type ArkivRow={
  $key:Hex;$owner:Address;$expiresAt:bigint;title:{value:string};chainId:{value:bigint};observationId:{value:bigint};asset:{value:string};
  lowerMarketId:{value:bigint};upperMarketId:{value:bigint};lowerUnits:{value:bigint};upperUnits:{value:bigint};
  lowerStrike:{value:string};upperStrike:{value:string};certifiedFloorMicros:{value:bigint};proofHash:{value:string};
  registry:{value:Address};vault:{value:Address};
};
type Props={deployment:Deployment|null;pair:Pair|null;verified:boolean;observationId:string|null;asset:string;lowerMarketId:string;upperMarketId:string;onLoad:(row:{lowerMarketId:string;upperMarketId:string;lowerUnits:string;upperUnits:string})=>void};

function arkivReadClient(){return createArkivPublicClient({chain:arkivChain,transport:http()});}

export function ArkivStrategyLibrary({deployment,pair,verified,observationId,asset,lowerMarketId,upperMarketId,onLoad}:Props){
  const [walletAddress,setWalletAddress]=useState<Address|null>(null),[walletChainId,setWalletChainId]=useState<number|null>(null),[rows,setRows]=useState<ArkivRow[]>([]),[title,setTitle]=useState(''),[search,setSearch]=useState('');
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[receipt,setReceipt]=useState<{key:Hex;tx:Hex}|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const result=await arkivReadClient().select({$key:true,$owner:true,$expiresAt:true,title:true,chainId:true,observationId:true,asset:true,lowerMarketId:true,upperMarketId:true,lowerUnits:true,upperUnits:true,lowerStrike:true,upperStrike:true,certifiedFloorMicros:true,proofHash:true,registry:true,vault:true})
        .from(STRATEGIES).where(eq('app',APP_TAG)).limit(100).fetch();
      setRows(result.entities as unknown as ArkivRow[]);
    }catch(e){setError(e instanceof Error?e.message:'Arkiv query failed.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const provider=window.ethereum as (typeof window.ethereum & {on?:(event:string,listener:(arg:unknown)=>void)=>void;removeListener?:(event:string,listener:(arg:unknown)=>void)=>void})|undefined;
    if(!provider)return;
    const accounts=(value:unknown)=>setWalletAddress(((value as Address[])[0]??null) as Address|null);
    const chain=(value:unknown)=>{try{setWalletChainId(Number(BigInt(String(value))))}catch{setWalletChainId(null)}};
    provider.request({method:'eth_accounts'}).then(accounts).catch(()=>{});
    provider.request({method:'eth_chainId'}).then(chain).catch(()=>{});
    provider.on?.('accountsChanged',accounts);
    provider.on?.('chainChanged',chain);
    return()=>{provider.removeListener?.('accountsChanged',accounts);provider.removeListener?.('chainChanged',chain)};
  },[]);

  const connect=async()=>{
    if(!window.ethereum)throw new Error('Install a wallet that supports EVM networks.');
    const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as Address[];
    if(!accounts[0])throw new Error('No wallet account was returned.');
    const chainId=Number(BigInt(await window.ethereum.request({method:'eth_chainId'}) as string));
    if(chainId!==arkivChain.id){
      try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:`0x${arkivChain.id.toString(16)}`} ]});}
      catch(e){
        if((e as {code?:number}).code!==4902)throw e;
        const walletSafeChain=rabdi({accessKey:''});
        await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:`0x${arkivChain.id.toString(16)}`,chainName:'Arkiv Rabdi',nativeCurrency:{name:'Golem',symbol:'tGLM',decimals:18},rpcUrls:[...walletSafeChain.rpcUrls.default.http],blockExplorerUrls:[walletSafeChain.blockExplorers.default.url]}]});
        await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:`0x${arkivChain.id.toString(16)}`} ]});
      }
    }
    if(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}) as string))!==arkivChain.id)throw new Error('Wallet did not switch to Arkiv Rabdi.');
    setWalletAddress(accounts[0]);
    setWalletChainId(arkivChain.id);
  };

  const publish=async()=>{
    if(!deployment||!pair||!verified||!observationId||!window.ethereum||!walletAddress)throw new Error('Connect on Arkiv and verify this portfolio against the active chain first.');
    const cleanTitle=title.trim().slice(0,48);
    if(cleanTitle.length<3)throw new Error('Enter a strategy name with at least 3 characters.');
    const chainWallet=createArkivWalletClient({account:walletAddress,chain:arkivChain,transport:custom(window.ethereum)});
    if(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}) as string))!==arkivChain.id)throw new Error('Switch the wallet back to Arkiv Rabdi before publishing.');
    const proofHash=keccak256(encodePacked(['uint256','uint256','uint256','uint256','uint256','uint256','address','address'],[
      BigInt(deployment.chainId),BigInt(observationId),BigInt(lowerMarketId),BigInt(upperMarketId),pair.lowerUnits,pair.upperUnits,deployment.contracts.SharedObservationRegistry,deployment.contracts.FloorVault,
    ]));
    const result=await chainWallet.createEntity(STRATEGIES,{
      app:APP_TAG,owner:addr(walletAddress),chainId:u64(BigInt(deployment.chainId)),observationId:u64(BigInt(observationId)),asset,
      title:cleanTitle,lowerMarketId:u64(BigInt(lowerMarketId)),upperMarketId:u64(BigInt(upperMarketId)),lowerUnits:u64(pair.lowerUnits),upperUnits:u64(pair.upperUnits),
      lowerStrike:pair.lower.toString(),upperStrike:pair.upper.toString(),certifiedFloorMicros:u64(pairStateFloor(pair)*UNIT),proofHash,
      registry:addr(deployment.contracts.SharedObservationRegistry),vault:addr(deployment.contracts.FloorVault),
    },{expiration:ExpirationTime.fromDays(30),flags:{readonly:true}});
    setReceipt({key:result.entityKey,tx:result.txHash});
    setTitle('');
    await refresh();
  };

  const remove=async(entityKey:Hex)=>{
    if(!window.ethereum||!walletAddress)throw new Error('Connect the strategy owner wallet on Arkiv.');
    const wallet=createArkivWalletClient({account:walletAddress,chain:arkivChain,transport:custom(window.ethereum)});
    if(Number(BigInt(await window.ethereum.request({method:'eth_chainId'}) as string))!==arkivChain.id)throw new Error('Switch the wallet back to Arkiv Rabdi before removing a strategy.');
    await wallet.deleteEntity({entityKey});
    await refresh();
  };
  const visible=useMemo(()=>rows.filter(row=>row.title.value.toLowerCase().includes(search.trim().toLowerCase())).slice(0,30),[rows,search]);
  const actionError=async(fn:()=>Promise<void>)=>{setBusy(true);setError(null);try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const currentChain=deployment?.chainId;
  const onArkiv=walletChainId===arkivChain.id;

  return <Panel title="Arkiv strategy library" eyebrow="WALLET-OWNED · EXPIRES IN 30 DAYS" action={<Button variant="ghost" aria-label="Refresh Arkiv strategies" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={14}/></Button>}>
    <div className="arkiv-toolbar">
      <span className="small muted">Rabdi · {rows.length} published</span>
      {walletAddress&&onArkiv?<Badge tone="green">{walletAddress.slice(0,6)}…{walletAddress.slice(-4)} · Rabdi</Badge>:<Button variant="secondary" disabled={busy} onClick={()=>void actionError(connect)}>{walletAddress?'Switch to Rabdi':'Connect wallet'}</Button>}
    </div>
    <div className="arkiv-publish">
      <label className="sr-only" htmlFor="arkiv-strategy-title">Strategy name</label>
      <input id="arkiv-strategy-title" maxLength={48} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Name this verified portfolio"/>
      <Button disabled={busy||!walletAddress||!onArkiv||!verified||!pair||!currentChain} onClick={()=>void actionError(publish)}>{busy?<LoaderCircle size={14} className="spin"/>:<UploadCloud size={14}/>}Publish verified strategy</Button>
    </div>
    <div className="arkiv-search"><input aria-label="Search Arkiv strategies" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search strategies"/><span>{loading?'Querying Arkiv…':`${visible.length} shown`}</span></div>
    {receipt&&<div className="arkiv-receipt" role="status"><span>Published</span><code>{receipt.key}</code><a href={`${arkivChain.blockExplorers.default.url}`} target="_blank" rel="noreferrer" aria-label="Open Arkiv explorer"><ExternalLink size={13}/></a></div>}
    {error&&<div className="error-box small" role="alert">{error}</div>}
    {visible.length? <div className="arkiv-list">{visible.map(row=>{
      const owned=walletAddress?.toLowerCase()===row.$owner.toLowerCase();
      const sameDeployment=!!deployment&&Number(row.chainId.value)===deployment.chainId&&row.registry.value.toLowerCase()===deployment.contracts.SharedObservationRegistry.toLowerCase()&&row.vault.value.toLowerCase()===deployment.contracts.FloorVault.toLowerCase();
      return <article className="arkiv-row" key={row.$key}>
        <div className="arkiv-row-main"><div className="arkiv-row-title"><strong>{row.title.value}</strong><span>{row.asset.value} · Observation #{row.observationId.value.toString()} · Expires {new Date(Number(row.$expiresAt)*1000).toLocaleDateString()}</span></div><div className="arkiv-row-stats"><span>Floor <b>${formatAmount(row.certifiedFloorMicros.value,6,2)}</b></span><span>YES #{row.lowerMarketId.value.toString()} × {row.lowerUnits.value.toString()}</span><span>NO #{row.upperMarketId.value.toString()} × {row.upperUnits.value.toString()}</span></div><code className="arkiv-owner">{row.$owner.slice(0,6)}…{row.$owner.slice(-4)} · Chain {row.chainId.value.toString()}</code></div>
        <div className="arkiv-row-actions"><Button variant="secondary" disabled={!sameDeployment} title={sameDeployment?'Load into composer':'This strategy belongs to a different AQRA deployment'} onClick={()=>onLoad({lowerMarketId:row.lowerMarketId.value.toString(),upperMarketId:row.upperMarketId.value.toString(),lowerUnits:row.lowerUnits.value.toString(),upperUnits:row.upperUnits.value.toString()})}><ArrowDownToLine size={13}/>Load</Button>{owned&&<Button variant="ghost" disabled={busy||!onArkiv} aria-label={`Delete ${row.title.value}`} title="Delete your Arkiv strategy" onClick={()=>void actionError(()=>remove(row.$key))}><Trash2 size={13}/></Button>}</div>
      </article>;
    })}</div>:<div className="arkiv-empty">{loading?'':error?'Arkiv query unavailable':'No matching Arkiv strategies'}</div>}
    <div className="arkiv-footnote">Arkiv stores the public recipe; AQRA rechecks the payout proof on the selected chain before locking.</div>
  </Panel>;
}

function pairStateFloor(pair:Pair){return pair.lowerUnits<pair.upperUnits?pair.lowerUnits:pair.upperUnits;}
