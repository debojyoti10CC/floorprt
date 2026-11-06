'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useMemo, useState} from 'react';
import {ArrowRight, ArrowUpRight, Clock3, Layers3, Plus, Search, ShieldCheck} from 'lucide-react';
import {formatAmount} from '@floor/proof-engine';
import {type MarketRow} from '@floor/shared';
import {useProtocol} from '../lib/protocol';
import {assetLabel} from '../lib/labels';

const money=(base:string|bigint)=>`$${formatAmount(base,6,2)}`;

export function ARQOOverview(){
  const p=useProtocol();
  const router=useRouter();
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState('All');
  const [sort,setSort]=useState('Featured');
  const [marketStatus,setMarketStatus]=useState('All');
  const markets=p.data?.markets??[];
  const eligible=useMemo(()=>{
    if(!p.data)return [];
    const open=new Set(p.data.observations.filter(o=>o.state===0&&BigInt(o.observationTime)>BigInt(p.data!.timestamp)).map(o=>o.id));
    return markets.filter(m=>open.has(m.observationId)&&m.enabledForNewCollateral);
  },[markets,p.data]);
  const categories=['All',...new Set(markets.map(m=>assetLabel(p.data?.observations.find(o=>o.id===m.observationId))))];
  const statusOf=(m:MarketRow)=>{
    const observation=p.data?.observations.find(o=>o.id===m.observationId);
    if(observation?.state===2)return 'Cancelled';
    if(observation?.state===1)return 'Finalized';
    return observation&&BigInt(observation.observationTime)>BigInt(p.data?.timestamp??0)&&m.enabledForNewCollateral?'Open':'Matured';
  };
  const filtered=markets.filter(m=>{
    const asset=assetLabel(p.data?.observations.find(o=>o.id===m.observationId));
    return (category==='All'||asset===category)&&(marketStatus==='All'||statusOf(m)===marketStatus)&&`${asset} ${formatAmount(m.strike,8,0)} ${m.id}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a,b)=>{
    if(sort==='Highest backing')return BigInt(a.escrow)===BigInt(b.escrow)?0:BigInt(a.escrow)>BigInt(b.escrow)?-1:1;
    if(sort==='Lowest threshold')return BigInt(a.strike)===BigInt(b.strike)?0:BigInt(a.strike)<BigInt(b.strike)?-1:1;
    if(sort==='Soonest settlement'){
      const at=BigInt(p.data?.observations.find(o=>o.id===a.observationId)?.observationTime??0),bt=BigInt(p.data?.observations.find(o=>o.id===b.observationId)?.observationTime??0);
      return at===bt?0:at<bt?-1:1;
    }
    return BigInt(a.id)===BigInt(b.id)?0:BigInt(a.id)>BigInt(b.id)?-1:1;
  });
  const choosePair=(market:MarketRow)=>{
    if(!p.data)return;
    const candidates=eligible.filter(m=>m.observationId===market.observationId&&m.id!==market.id);
    if(!candidates.length)return;
    const partner=candidates.sort((a,b)=>BigInt(a.strike)<BigInt(b.strike)?-1:1)[0];
    const lower=BigInt(market.strike)<BigInt(partner.strike)?market:partner;
    const upper=lower===market?partner:market;
    p.setDraft({lower:lower.id,upper:upper.id,lowerUnits:'1',upperUnits:'1'});
    return true;
  };
  return <div className="aqra-dashboard">
    <section className="aqra-market-section">
      <div className="aqra-section-head"><div><span className="aqra-label">ARQO OUTCOME MARKETS</span><h1>Markets <small>{String(filtered.length).padStart(2,'0')}</small></h1><p>Browse approved threshold markets and build collateral from compatible outcomes.</p></div><Link href="/app/compose/" className="aqra-inline-link">Portfolio builder <ArrowRight size={14}/></Link></div>
      <div className="aqra-controls"><label className="aqra-search"><Search size={16}/><input aria-label="Search markets" placeholder="Search assets or thresholds" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="aqra-categories" aria-label="Market status filters">{['All','Open','Matured','Finalized','Cancelled'].map(value=><button key={value} className={marketStatus===value?'active':''} onClick={()=>setMarketStatus(value)}>{value}</button>)}</div><label className="aqra-sort"><span>Asset</span><select aria-label="Filter market asset" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(value=><option key={value}>{value}</option>)}</select></label><label className="aqra-sort"><span>Sort</span><select aria-label="Sort markets" value={sort} onChange={e=>setSort(e.target.value)}><option>Featured</option><option>Highest backing</option><option>Lowest threshold</option><option>Soonest settlement</option></select></label></div>
      {markets.length===0?<div className="aqra-empty"><Layers3 size={22}/><b>{p.loading?'Loading approved markets':'No onchain markets available'}</b><span>{p.online?'Create an observation and markets in Operations & devnet.':'Connect the local devnet for current market metadata.'}</span><Link href="/app/ops/">Open operations <ArrowRight size={13}/></Link></div>:filtered.length===0?<div className="aqra-empty"><Search size={22}/><b>No markets match</b><span>Change your search or asset filter.</span></div>:<div className="aqra-market-grid">{filtered.slice(0,12).map(m=><MarketCard key={m.id} market={m} p={p} onAdd={()=>{if(choosePair(m))router.push('/app/compose/')}} eligible={eligible.some(x=>x.id===m.id)}/>)}</div>}
      <div className="aqra-market-note"><ShieldCheck size={14}/><span>Only approved, fully backed onchain claims can enter the collateral vault. External venue data is not used as collateral.</span><Link href="/app/markets/">Full directory <ArrowUpRight size={12}/></Link></div>
    </section>
    {p.data?.source==='RECORDED_CHAIN'&&<div className="aqra-recorded">Recorded data is read only. Connect the configured chain before any wallet transaction.</div>}
  </div>;
}

export function MarketCard({market,p,onAdd,eligible,actionLabel='Add to portfolio',actionDisabled,requiresPartner=true}:{market:MarketRow;p:ReturnType<typeof useProtocol>;onAdd:()=>void;eligible:boolean;actionLabel?:string;actionDisabled?:boolean;requiresPartner?:boolean}){
  const observation=p.data?.observations.find(o=>o.id===market.observationId);
  const asset=assetLabel(observation);
  const threshold=formatAmount(market.strike,observation?.priceDecimals??8,0);
  const status=observation?.state===2?'Cancelled':observation?.state===1?'Finalized':eligible?'Open':'Matured';
  const hasPartner=eligible&&p.data?.markets.some(m=>{const o=p.data?.observations.find(x=>x.id===m.observationId);return m.id!==market.id&&m.observationId===market.observationId&&BigInt(m.strike)!==BigInt(market.strike)&&m.enabledForNewCollateral&&o?.state===0&&BigInt(o.observationTime)>BigInt(p.data?.timestamp??0)});
  const units=BigInt(market.escrow)/1000000n;
  const close=observation?new Date(Number(observation.observationTime)*1000).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
  return <article className="aqra-market-card">
    <Link className="aqra-market-card-link" href={`/app/markets/${market.id}/`} aria-label={`Open ${asset} market ${market.id}`}/>
    <div className="aqra-market-card-head">
      <AssetMark asset={asset}/>
      <div><h3>Will {asset} settle above ${threshold}?</h3><span>{asset} · Observation #{market.observationId}</span></div>
      <span className={`aqra-status ${eligible?'open':''}`}><i/>{status}</span>
    </div>
    <div className="aqra-market-outcomes"><div><span>YES</span><b>$1.00</b><small>winning payout</small></div><div><span>NO</span><b>$1.00</b><small>winning payout</small></div></div>
    <div className="aqra-market-card-foot"><span><Clock3 size={12}/>{close}</span><span>Escrow <b>{money(market.escrow)}</b></span><span>{units.toString()} sets</span></div>
    <div className="aqra-card-actions"><button disabled={actionDisabled??(!eligible||(requiresPartner&&!hasPartner)||!p.online)} title={requiresPartner&&!hasPartner?'No compatible market shares this observation.':undefined} onClick={onAdd}><Plus size={13}/> {actionLabel}</button></div>
  </article>;
}

function AssetMark({asset,large=false}:{asset:string;large?:boolean}){
  const bitcoin=asset.toUpperCase().includes('BTC');
  return <span className={`aqra-symbol aqra-asset-mark${large?' large':''} ${bitcoin?'btc':'eth'}`} role="img" aria-label={`${bitcoin?'Bitcoin':'Ethereum'} logo`}>
    {bitcoin?<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15"/><text x="16" y="22" textAnchor="middle">₿</text></svg>:<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1 7.6 16.2 16 21.1l8.4-4.9L16 1Z"/><path d="m16 31 8.4-12.6-8.4 4.9-8.4-4.9L16 31Z"/></svg>}
  </span>;
}


export function ARQOMarketDetail({marketId}:{marketId:string}){
  const p=useProtocol();
  const market=p.data?.markets.find(m=>m.id===marketId);
  const observation=p.data?.observations.find(o=>o.id===market?.observationId);
  const asset=assetLabel(observation);
  const eligible=!!market&&!!observation&&observation.state===0&&BigInt(observation.observationTime)>BigInt(p.data?.timestamp??0)&&market.enabledForNewCollateral;
  const partners=market&&p.data?p.data.markets.filter(m=>m.id!==market.id&&m.observationId===market.observationId&&m.enabledForNewCollateral&&BigInt(m.strike)!==BigInt(market.strike)&&p.data!.observations.some(o=>o.id===m.observationId&&o.state===0&&BigInt(o.observationTime)>BigInt(p.data!.timestamp))):[];
  const useSide=(side:'lower'|'upper')=>{
    if(!market)return;
    const rolePartners=partners.filter(m=>side==='lower'?BigInt(m.strike)>BigInt(market.strike):BigInt(m.strike)<BigInt(market.strike));
    const partner=rolePartners.slice().sort((a,b)=>BigInt(a.strike)<BigInt(b.strike)?-1:1)[0];
    if(!partner)return;
    const lower=side==='lower'?market:partner;
    const upper=side==='upper'?market:partner;
    p.setDraft({lower:lower.id,upper:upper.id,lowerUnits:'1',upperUnits:'1'});
  };
  if(!p.data)return <div className="aqra-empty"><Layers3 size={22}/><b>Reading market details</b><span>Market metadata is loaded from the configured chain snapshot.</span></div>;
  if(!market)return <div className="aqra-empty"><Layers3 size={22}/><b>Market #{marketId} is not in this snapshot</b><span>Open the market directory to inspect available onchain markets.</span><Link href="/app/markets/">Market directory <ArrowRight size={13}/></Link></div>;
  const strike=formatAmount(market.strike,observation?.priceDecimals??8,0);
  const compatibleYes=partners.some(m=>BigInt(m.strike)>BigInt(market.strike));
  const compatibleNo=partners.some(m=>BigInt(m.strike)<BigInt(market.strike));
  const status=eligible?'Open for collateral':observation?.state===2?'Cancelled':'Finalized / ineligible';
  const settlementTime=observation?new Date(Number(observation.observationTime)*1000).toLocaleString():'—';
  const terms:[string,string][]=[
    ['Predicate','GEQ (price ≥ strike)'],['Winning claim','1 test USDC per whole unit'],['Shared cancellation','0.5 per whole unit'],['Price source',observation?`Source ${observation.sourceId.slice(0,12)}…`:'—'],['Settlement time',settlementTime],['Collateral',p.deployment?.mockCollateral?'Test USDC · 6 decimals':'USDC · 6 decimals'],['YES / NO token IDs',`${market.yesTokenId} / ${market.noTokenId}`],['Wallet YES / NO',p.address?`${market.yesBalance} / ${market.noBalance}`:'Connect wallet to read'],['Outcome issuer',p.deployment?.contracts.OutcomeTokens??'—'],['Collateral token',p.deployment?.contracts.CollateralToken??'—'],['Chain ID',String(p.deployment?.chainId??p.data.chainId)],
  ];
  return <div className="aqra-market-terminal">
    <nav className="aqra-detail-breadcrumb" aria-label="Breadcrumb"><Link href="/app/markets/">Markets</Link><span>/</span><span>{asset} · #{market.id}</span></nav>
    <header className="aqra-terminal-header">
      <div className="aqra-terminal-header-main"><div className="aqra-terminal-title"><AssetMark asset={asset} large/><div><div className="aqra-market-meta"><span className="aqra-chip">{asset}</span><span className={`aqra-status ${eligible?'open':''}`}><i/>{status}</span></div><h1>Will {asset} settle above ${strike}?</h1><p>Approved threshold claim · Market #{market.id}</p></div></div><Link className="aqra-detail-header-link" href="/app/markets/">All markets <ArrowUpRight size={13}/></Link></div>
      <div className="aqra-terminal-stats"><div><span>STRIKE</span><b>${strike}</b></div><div><span>ESCROW BACKING</span><b>{money(market.escrow)}</b></div><div><span>OBSERVATION</span><b>#{observation?.id??'—'}</b></div><div><span>COMPATIBLE MARKETS</span><b>{partners.length}</b></div></div>
    </header>
    <div className="aqra-detail-layout">
      <section className="aqra-detail-main">
        <SettlementPayoffGraph asset={asset} strike={strike}/>
        <div className="aqra-terminal-panel-head"><div><span className="aqra-label">CONTRACT TERMS</span><h2>Settlement specification</h2></div><span className="aqra-chip">Onchain metadata</span></div>
        <div className="aqra-spec-list">{terms.map(([label,value])=><div className="aqra-spec-row" key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <div className="aqra-integrity"><ShieldCheck size={15}/><span>Collateral eligibility is checked against contract metadata in the portfolio builder.</span></div>
        <Link className="aqra-inline-link" href="/app/proofs/">Open proof inspector <ArrowUpRight size={13}/></Link>
      </section>
      <aside className="aqra-action-panel">
        <div className="aqra-action-tabs"><span>Portfolio role</span><span>Market #{market.id}</span></div>
        <h2>Choose this market’s role</h2><p>Pair it with a different threshold that shares the same observation.</p>
        <div className="aqra-role-options">
          <button className={p.draft.lower===market.id?'selected':''} disabled={!eligible||!compatibleYes} onClick={()=>useSide('lower')}><span>YES</span><b>$1.00</b><small>Winning payout · lower threshold</small></button>
          <button className={p.draft.upper===market.id?'selected':''} disabled={!eligible||!compatibleNo} onClick={()=>useSide('upper')}><span>NO</span><b>$1.00</b><small>Winning payout · upper threshold</small></button>
        </div>
        <Link className="aqra-primary" href="/app/compose/">Continue to portfolio builder <ArrowRight size={14}/></Link>
        {!partners.length&&<div className="aqra-detail-warning">No eligible market with the same observation is available to pair with this claim.</div>}
        <div className="aqra-action-foot"><span className={`aqra-status ${eligible?'open':''}`}><i/>{status}</span><span>{partners.length} compatible</span></div>
      </aside>
    </div>
  </div>;
}

function SettlementPayoffGraph({asset,strike}:{asset:string;strike:string}){
  const left=58,right=744,top=24,bottom=192,threshold=401;
  return <section className="aqra-payoff-chart" aria-labelledby="aqra-payoff-title">
    <div className="aqra-payoff-chart-head"><div><span className="aqra-label">FIXED CONTRACT PAYOUT</span><h2 id="aqra-payoff-title">Settlement payoff</h2><p>Per whole claim · {asset} threshold at ${strike}</p></div><div className="aqra-payoff-legend"><span><i className="yes"/>YES</span><span><i className="no"/>NO</span></div></div>
    <div className="aqra-chart-plot">
      <div className="aqra-chart-y-axis" aria-hidden="true"><span>$1.00</span><span>$0</span></div>
      <svg viewBox="0 0 780 246" preserveAspectRatio="none" role="img" aria-label={`Illustrative contract payoff by final ${asset} price. YES pays one USDC at or above the ${strike} strike. NO pays one USDC below the strike.`}>
        <line x1={left} y1={top} x2={right} y2={top} className="aqra-chart-gridline"/>
        <line x1={left} y1={bottom} x2={right} y2={bottom} className="aqra-chart-gridline"/>
        <line x1={threshold} y1={top} x2={threshold} y2={bottom} className="aqra-chart-strike"/>
        <path d={`M${left} ${bottom} H${threshold} V${top} H${right}`} className="aqra-chart-yes"/>
        <path d={`M${left} ${top} H${threshold} V${bottom} H${right}`} className="aqra-chart-no"/>
        <circle cx={threshold} cy={top} r="4" className="aqra-chart-dot yes"/>
        <circle cx={threshold} cy={bottom} r="4" className="aqra-chart-dot no"/>
      </svg>
    </div>
    <div className="aqra-chart-x-axis" aria-hidden="true"><span>Below strike</span><b>Strike · ${strike}</b><span>Above strike</span></div>
    <div className="aqra-payoff-chart-caption">At the threshold, YES wins because the condition is greater than or equal to strike.</div>
  </section>;
}
