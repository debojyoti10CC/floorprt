'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Clock3, Layers3, Plus, Search, ShieldCheck, Wallet} from 'lucide-react';
import {formatAmount} from '@floor/proof-engine';
import {latestEligiblePair, type MarketRow} from '@floor/shared';
import {useProtocol} from '../lib/protocol';
import {assetLabel} from '../lib/labels';
import {Identicon} from './identicon';

const money=(base:string|bigint)=>`$${formatAmount(base,6,2)}`;
const upperBuffer=(floor:bigint,bps:number)=>floor-(floor*BigInt(bps)+9999n)/10000n;

export function AQRAOverview(){
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
  const walletPositions=p.address?p.data?.positions.filter(v=>v.owner.toLowerCase()===p.address!.toLowerCase()&&(v.state===1||v.state===2))??[]:[];
  const floor=walletPositions.reduce((total,v)=>total+BigInt(v.certifiedFloor),0n);
  const capacity=walletPositions.filter(v=>v.state===1).reduce((total,v)=>total+upperBuffer(BigInt(v.certifiedFloor),p.data?.bufferBps??2000),0n);
  const debt=p.address?(p.data?.loans.filter(l=>l.state===1&&l.borrower.toLowerCase()===p.address!.toLowerCase()).reduce((total,l)=>total+BigInt(l.due),0n)??0n):0n;
  const pair=p.data?latestEligiblePair(p.data):null;
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
    <section className="aqra-hero-row">
      <div className="aqra-hero">
        <span className="aqra-orbit aqra-orbit-one"/><span className="aqra-orbit aqra-orbit-two"/>
        <div className="aqra-hero-copy">
          <div className="aqra-kicker"><i/> STRUCTURED OUTCOME FINANCE</div>
          <h1>Structure outcomes.<br/>Prove value. Unlock liquidity.</h1>
          <p>Build prediction-market portfolios, verify their minimum settlement value, and borrow against eligible positions.</p>
          <div className="aqra-actions"><Link className="aqra-primary-dark" href="/app/markets/">Explore markets <ArrowRight size={15}/></Link><Link className="aqra-secondary-light" href="/app/docs/">How AQRA works <ArrowUpRight size={14}/></Link></div>
        </div>
        <span className="aqra-hero-index">AQRA / TERMINAL <b>01—04</b></span>
      </div>
      <aside className="aqra-account">
        <div className="aqra-account-heading"><div><span className="aqra-label">ACCOUNT OVERVIEW</span><span className="aqra-wallet-state"><i className={p.address?'online':''}/>{p.address?`Connected · ${p.deployment?.chainName??'EVM'}`:'Wallet disconnected'}</span></div><span className="aqra-avatar">{p.address?<Identicon address={p.address} size={29}/>:<Wallet size={15}/>}</span></div>
        <div className="aqra-metrics">
          <Metric title="Portfolio value" value="—" detail="No live market marks"/>
          <Metric title="Verified settlement floor" value={p.address&&p.online&&p.data?.source==='DIRECT_CHAIN'?money(floor):'—'} detail={p.address?'Onchain vault positions':'Connect wallet to load'}/>
          <Metric title="Available borrowing capacity" value={p.address&&p.online&&p.data?.source==='DIRECT_CHAIN'?money(capacity):'—'} detail={p.address?'Open collateral · buffer applied':'Connect wallet to load'}/>
          <Metric title="Outstanding debt" value={p.address&&p.online&&p.data?.source==='DIRECT_CHAIN'?money(debt):'—'} detail={p.address?'Fixed due on funded loans':'Connect wallet to load'}/>
        </div>
        <div className="aqra-account-foot"><span className={`aqra-dot ${p.online?'connected':''}`}/>{p.online?`Chain ${p.data?.chainId} · block ${p.data?.blockNumber}`:p.data?'Recorded chain snapshot · read only':'Connect a supported network to read balances'}</div>
      </aside>
    </section>
    <section className="aqra-market-section">
      <div className="aqra-section-head"><div><span className="aqra-label">DISCOVER</span><h2>Markets <small>{String(filtered.length).padStart(2,'0')}</small></h2></div><Link href="/app/compose/" className="aqra-inline-link">Open portfolio builder <ArrowRight size={14}/></Link></div>
      <div className="aqra-controls"><label className="aqra-search"><Search size={16}/><input aria-label="Search markets" placeholder="Search markets" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>⌘ K</kbd></label><div className="aqra-categories" aria-label="Market asset filters">{categories.map(value=><button key={value} className={category===value?'active':''} onClick={()=>setCategory(value)}>{value}</button>)}</div><label className="aqra-sort"><span>Status</span><select aria-label="Filter market status" value={marketStatus} onChange={e=>setMarketStatus(e.target.value)}><option>All</option><option>Open</option><option>Matured</option><option>Finalized</option><option>Cancelled</option></select></label><label className="aqra-sort"><span>Sort</span><select aria-label="Sort markets" value={sort} onChange={e=>setSort(e.target.value)}><option>Featured</option><option>Highest backing</option><option>Lowest threshold</option><option>Soonest settlement</option></select></label></div>
      {markets.length===0?<div className="aqra-empty"><Layers3 size={22}/><b>{p.loading?'Loading approved markets':'No onchain markets available'}</b><span>{p.online?'Create an observation and markets in Operations & devnet.':'Connect the local devnet for current market metadata.'}</span><Link href="/app/ops/">Open operations <ArrowRight size={13}/></Link></div>:filtered.length===0?<div className="aqra-empty"><Search size={22}/><b>No markets match</b><span>Change your search or asset filter.</span></div>:<div className="aqra-market-grid">{filtered.slice(0,12).map(m=><MarketCard key={m.id} market={m} p={p} onAdd={()=>{if(choosePair(m))router.push('/app/compose/')}} eligible={eligible.some(x=>x.id===m.id)}/>)}</div>}
      <div className="aqra-market-note"><ShieldCheck size={14}/><span>Only approved, fully backed onchain claims can enter the collateral vault. External venue data is not used as collateral.</span><Link href="/app/markets/">Full directory <ArrowUpRight size={12}/></Link></div>
    </section>
    <section className="aqra-bottom"><div><span className="aqra-label">PROOF FIRST · FIXED DEBT · ONCHAIN SETTLEMENT</span><h2>Compose a pair.<br/>See every outcome.</h2></div><p>The composer checks the same immutable observation and displays the payout for boundary states, shared cancellation, and unmatched quantities.</p><Link href="/app/compose/" className="aqra-button-outline">Build a portfolio <ArrowRight size={14}/></Link></section>
    {p.data?.source==='RECORDED_CHAIN'&&<div className="aqra-recorded">Recorded data is read only. Connect the configured chain before any wallet transaction.</div>}
    {pair&&<div className="aqra-pair-hint">Latest compatible pair: markets #{pair.lower} / #{pair.upper}</div>}
  </div>;
}

function Metric({title,value,detail}:{title:string;value:string;detail:string}){return <div className="aqra-metric"><span>{title}</span><b>{value}</b><small>{detail}</small></div>}
function MarketCard({market,p,onAdd,eligible}:{market:MarketRow;p:ReturnType<typeof useProtocol>;onAdd:()=>void;eligible:boolean}){
  const observation=p.data?.observations.find(o=>o.id===market.observationId);
  const asset=assetLabel(observation);
  const threshold=formatAmount(market.strike,observation?.priceDecimals??8,0);
  const status=observation?.state===2?'Cancelled':observation?.state===1?'Finalized':eligible?'Open':'Matured';
  const hasPartner=eligible&&p.data?.markets.some(m=>{const o=p.data?.observations.find(x=>x.id===m.observationId);return m.id!==market.id&&m.observationId===market.observationId&&BigInt(m.strike)!==BigInt(market.strike)&&m.enabledForNewCollateral&&o?.state===0&&BigInt(o.observationTime)>BigInt(p.data?.timestamp??0)});
  const units=BigInt(market.escrow)/1000000n;
  const close=observation?new Date(Number(observation.observationTime)*1000).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric'}):'—';
  return <article className="aqra-market-card">
    <div className="aqra-market-meta"><span className="aqra-chip">{asset.split('/')[0]??'Market'}</span><span className={`aqra-status ${eligible?'open':''}`}><i/>{status}</span></div>
    <span className="aqra-symbol">{asset.toUpperCase().includes('BTC')?'₿':'Ξ'}</span>
    <h3>Will {asset} settle above ${threshold}?</h3>
    <div className="aqra-market-details"><span><Clock3 size={12}/>{close}</span><span>Observation #{market.observationId}</span></div>
    <div className="aqra-market-stats"><div><span>OUTCOME</span><b>YES / NO</b></div><div><span>ESCROW BACKING</span><b>{money(market.escrow)}</b></div><div><span>COMPLETE SETS</span><b>{units.toString()}</b></div></div>
    <div className="aqra-card-actions"><button disabled={!eligible||!hasPartner||!p.online} title={!hasPartner?'No compatible market shares this observation.':undefined} onClick={onAdd}><Plus size={13}/> Add to portfolio</button><Link href={`/app/markets/${market.id}/`} aria-label={`View ${asset} market`}>View market <ArrowUpRight size={13}/></Link></div>
  </article>;
}


export function AQRAMarketDetail({marketId}:{marketId:string}){
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
  return <div className="aqra-detail-layout">
    <section className="aqra-detail-main">
      <Link href="/app/markets/" className="aqra-inline-link"><ArrowLeft size={13}/> All markets</Link>
      <div className="aqra-market-meta"><span className="aqra-chip">{asset}</span><span className={`aqra-status ${eligible?'open':''}`}><i/>{eligible?'Open for collateral':observation?.state===2?'Cancelled':'Finalized / ineligible'}</span></div>
      <span className="aqra-symbol large">{asset.toUpperCase().includes('BTC')?'₿':'Ξ'}</span>
      <h1>Will {asset} settle above ${formatAmount(market.strike,observation?.priceDecimals??8,0)}?</h1>
      <p>This is an approved onchain threshold claim. The contract determines settlement from the shared observation shown here; the market title alone does not establish compatibility.</p>
      <div className="aqra-outcome-choice"><div><b>Select a portfolio role</b><span>Indicative market pricing is not available on this issuer.</span></div><div className="aqra-outcome-actions"><button disabled={!eligible||!partners.some(m=>BigInt(m.strike)>BigInt(market.strike))} onClick={()=>useSide('lower')}><span>YES</span><b>Fixed $1 winning payout</b><small>Use as lower threshold</small></button><button disabled={!eligible||!partners.some(m=>BigInt(m.strike)<BigInt(market.strike))} onClick={()=>useSide('upper')}><span>NO</span><b>Fixed $1 winning payout</b><small>Use as upper threshold</small></button></div><Link className="aqra-primary" href="/app/compose/">Continue to portfolio builder <ArrowRight size={14}/></Link></div>
      {!partners.length&&<div className="aqra-detail-warning">No eligible partner with a shared observation is currently available. A market description or similar asset alone is not enough for a proof.</div>}
    </section>
    <aside className="aqra-spec-panel"><span className="aqra-label">SETTLEMENT SPECIFICATION</span>{[
      ['Market ID',`#${market.id}`],['Predicate','GEQ (price ≥ strike)'],['Payout','1 test USDC per winning whole unit · 0 losing'],['Shared cancellation','0.5 per whole unit'],['Strike',`${formatAmount(market.strike,observation?.priceDecimals??8,0)} ${asset}`],['Observation ID',observation?`#${observation.id}`:'—'],['Price source',observation?`Source ${observation.sourceId.slice(0,12)}…`:'—'],['Settlement time',observation?new Date(Number(observation.observationTime)*1000).toLocaleString():'—'],['Collateral',p.deployment?.mockCollateral?'Test USDC · 6 decimals':'USDC · 6 decimals'],['Chain ID',String(p.deployment?.chainId??p.data.chainId)],['Outcome issuer',p.deployment?.contracts.OutcomeTokens??'—'],['Collateral token',p.deployment?.contracts.CollateralToken??'—'],['YES / NO token IDs',`${market.yesTokenId} / ${market.noTokenId}`],['Escrow backing',money(market.escrow)],['Wallet YES / NO',p.address?`${market.yesBalance} / ${market.noBalance}`:'Connect wallet to read'],['Compatible markets',String(partners.length)],
    ].map(([label,value])=><div className="aqra-spec-row" key={label}><span>{label}</span><b>{value}</b></div>)}<div className="aqra-integrity"><ShieldCheck size={15}/><span>Collateral eligibility is checked against contract metadata in the portfolio builder.</span></div><Link className="aqra-inline-link" href="/app/proofs/">Open proof inspector <ArrowUpRight size={13}/></Link></aside>
  </div>;
}
