'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,ArrowUpRight,ExternalLink,FileCheck2,Plus,RefreshCw,Search,Wallet} from 'lucide-react';
import {formatAmount,MAX_UNITS,parseAmount,parseUnits,UNIT} from '@floor/proof-engine';
import {eligibleMarkets,latestEligiblePair,type MarketRow} from '@floor/shared';
import {useProtocol,short} from '../lib/protocol';
import {assetLabel} from '../lib/labels';
import {estimateMarketRisk,type AskLevel} from '../lib/market-risk';
import {Badge,Button,Empty,Money,Panel} from './ui';
import {PageHeading} from './composer';
import {useAction,useMint} from './actions';
import {TradingViewChart,type TradedSymbol} from './tradingview-chart';

type ResearchMarket={
  externalId:string;question:string;outcomes:string[];
  buyBooks:AskLevel[][];minimumOrderSizes:(string|null)[];
  conditionId:string|null;endDate:string|null;status:string;volume:number|null;volume24h:number|null;
  liquidity:number|null;sourceUri:string;venue:string;collateralEligible:false;
};
type MarketFeed={markets:ResearchMarket[];fetchedAt:string;bookFetchedAt:string|null;stale:boolean};
type MarketTab='prediction'|'aqra';

const priceSymbol=(asset:string):TradedSymbol=>asset.startsWith('BTC')?'COINBASE:BTCUSD':'COINBASE:ETHUSD';
const usd=(value:number|null)=>value===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const askPrice=(value:string|undefined)=>{const price=Number(value);return value&&Number.isFinite(price)?`$${price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}`:'—'};
const preciseAmount=(value:bigint)=>{const formatted=formatAmount(value,6,6);return formatted.includes('.')?formatted.replace(/0+$/,'').replace(/\.$/,''):formatted};
const microUsd=(value:bigint)=>`$${preciseAmount(value)}`;
const formatShares=(value:bigint)=>preciseAmount(value);

function marketFeedUrl(){
  const configured=process.env.NEXT_PUBLIC_FLOOR_API_URL?.trim();
  if(configured)return `${configured.replace(/\/+$/,'')}/api/v1/research/markets`;
  if(typeof window!=='undefined'&&['localhost','127.0.0.1'].includes(window.location.hostname))return 'http://127.0.0.1:8787/api/v1/research/markets';
  return null;
}

function MarketDirectory({markets,selectedId,onInspect}:{markets:MarketRow[];selectedId:string;onInspect:(market:MarketRow)=>void}){
  const p=useProtocol();
  if(!markets.length)return <Empty title={p.loading?'Reading the chain…':'No registered AQRA markets'}>Registered collateral markets appear here after an observation and backed outcome claims exist on this chain.</Empty>;
  return <div className="table-wrap market-directory"><table><thead><tr><th>Market / condition</th><th>Outcome tokens</th><th>Oracle settlement</th><th>Escrow</th><th>Status</th><th/></tr></thead><tbody>{markets.map(m=>{
    const observation=p.data?.observations.find(o=>o.id===m.observationId),asset=assetLabel(observation);
    const open=!!observation&&observation.state===0&&BigInt(observation.observationTime)>BigInt(p.data?.timestamp??0)&&m.enabledForNewCollateral;
    const status=!observation?'Observation unavailable':observation.state===2?'Cancelled':observation.state===1?'Resolved':open?'Open':'Matured';
    return <tr key={m.id} className={selectedId===m.id?'market-selected':''}>
      <td><div className="market-cell"><span className={`asset-icon ${asset.startsWith('BTC')?'btc':'eth'}`}>{asset.startsWith('BTC')?'₿':'Ξ'}</span><div><strong>{asset} ≥ ${formatAmount(m.strike,observation?.priceDecimals??8,0)}</strong><span>Market #{m.id} · observation #{m.observationId}</span></div></div></td>
      <td><div className="token-pair"><span className="side-pill yes">YES <small>#{m.yesTokenId}</small></span><span className="side-pill no">NO <small>#{m.noTokenId}</small></span></div><small className="table-subtext">$1 per winning token</small></td>
      <td><span className="mono">{observation?new Date(Number(observation.observationTime)*1000).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}):'—'}</span><small className="table-subtext">UTC source timestamp</small></td>
      <td><Money value={m.escrow}/><small className="table-subtext">test USDC</small></td>
      <td><Badge tone={open?'green':observation?.state===2?'amber':'muted'}>{status}</Badge></td>
      <td><Button variant="ghost" aria-label={`Select market ${m.id}`} aria-pressed={selectedId===m.id} onClick={()=>onInspect(m)}>Inspect</Button></td>
    </tr>;
  })}</tbody></table></div>;
}

function PredictionRiskTicket({market,feed,loading,stake,onStake,outcomeIndex,onOutcome}:{market:ResearchMarket|null;feed:MarketFeed|null;loading:boolean;stake:string;onStake:(value:string)=>void;outcomeIndex:number;onOutcome:(value:number)=>void}){
  const activeIndex=market?Math.min(outcomeIndex,Math.max(0,market.outcomes.length-1)):0;
  const asks=market?.buyBooks[activeIndex]??[];
  const minimum=market?.minimumOrderSizes[activeIndex]??null;
  let validStake=false;
  try{validStake=parseAmount(stake)>0n}catch{/* Invalid input has no risk estimate. */}
  const risk=useMemo(()=>{
    if(!market||asks.length===0)return null;
    try{return estimateMarketRisk(stake,asks,minimum)}catch{return null;}
  },[market,asks,stake,minimum]);
  return <Panel className="ticket-panel prediction-risk-panel">
    <div className="ticket-heading"><div className="eyebrow">PREDICTION RISK</div><Badge tone={feed?.bookFetchedAt&&!feed.stale?'green':'amber'}>{feed?.stale?'STALE BOOK':feed?.bookFetchedAt?'LIVE ASK BOOK':'NO LIVE BOOK'}</Badge></div>
    {market?<>
      <h2 className="prediction-ticket-question">{market.question}</h2>
      <label className="terminal-select-label" htmlFor="prediction-outcome">Outcome</label>
      <select id="prediction-outcome" aria-label="Choose prediction market outcome" value={activeIndex} onChange={event=>onOutcome(Number(event.target.value))}>{market.outcomes.map((outcome,index)=><option key={`${outcome}-${index}`} value={index}>{outcome} · ask {askPrice(market.buyBooks[index]?.[0]?.price)}</option>)}</select>
      <label className="ticket-amount-label" htmlFor="prediction-stake">Order budget <span>USD</span></label>
      <div className="prediction-stake-input"><span>$</span><input id="prediction-stake" aria-label="Prediction trade budget in US dollars" inputMode="decimal" maxLength={18} value={stake} onChange={event=>onStake(event.target.value)} placeholder="1.00"/></div>
      {!asks.length?<div className="risk-empty"><strong>{loading?'Refreshing market book…':'No executable asks'}</strong><span>There is no current visible buy depth for this outcome.</span></div>:!validStake?<div className="error-box" role="alert">Enter a valid amount with up to six decimal places.</div>:risk?<>
        {risk.belowMinimum?<div className="risk-loss-card risk-warning"><span>Order not executable</span><strong>{minimum} shares minimum</strong><small>Your budget reaches {formatShares(risk.shares)} shares at the current asks.</small></div>:<><div className="risk-loss-card"><span>Maximum loss if filled</span><strong>{microUsd(risk.spent)}</strong><small>If this outcome settles against you</small></div><div className="risk-metrics"><div><span>Settlement payout</span><strong>{microUsd(risk.grossIfCorrect)}</strong></div><div><span>Shares at visible asks</span><strong>{formatShares(risk.shares)}</strong></div><div><span>Unfilled budget</span><strong>{microUsd(risk.unfilled)}</strong></div>{risk.bestAsk!==null&&<div><span>Best ask</span><strong>{microUsd(risk.bestAsk)}</strong></div>}</div><p className="risk-fee-note">Indicative order-book estimate · venue fees excluded</p></>}
      </>:<div className="risk-empty"><strong>Risk estimate unavailable</strong><span>Refresh the market book before placing an order.</span></div>}
      <div className="risk-collateral-note"><Badge tone="amber">NOT AQRA COLLATERAL</Badge><span>Prediction positions cannot back AQRA loans.</span></div>
      <a className="button primary full prediction-trade-link" href={market.sourceUri} target="_blank" rel="noreferrer" aria-label={`Trade ${market.question} on Polymarket`}>Trade on Polymarket<ArrowUpRight size={14}/></a>
      <div className="prediction-feed-time">Book refreshed {feed?.bookFetchedAt?new Date(feed.bookFetchedAt).toLocaleTimeString(): '—'}</div>
    </>:<Empty title={loading?'Loading prediction markets…':'No market selected'}>{loading?'':'Live venue markets appear here when the market data service is connected.'}</Empty>}
  </Panel>;
}

export function MarketTerminal(){
  const p=useProtocol(),action=useAction(),mint=useMint();
  const [tab,setTab]=useState<MarketTab>('prediction'),[search,setSearch]=useState(''),[observationFilter,setObservationFilter]=useState('all'),[selectedId,setSelectedId]=useState(''),[units,setUnits]=useState('1'),[symbol,setSymbol]=useState<TradedSymbol>('COINBASE:ETHUSD');
  const [feed,setFeed]=useState<MarketFeed|null>(null),[researchError,setResearchError]=useState<string|null>(null),[researchLoading,setResearchLoading]=useState(true);
  const [selectedPredictionId,setSelectedPredictionId]=useState<string|null>(null),[stake,setStake]=useState('1.00'),[outcomeIndex,setOutcomeIndex]=useState(0),[marketSearch,setMarketSearch]=useState('');
  const research=feed?.markets??[];
  const selectedResearch=research.find(m=>m.externalId===selectedPredictionId)??research[0]??null;
  const openMarkets=p.data?eligibleMarkets(p.data):[];
  const defaultMarket=openMarkets.find(m=>m.id===p.deployment?.defaultPair?.lower)??openMarkets.at(-1);
  const selectedMarket=p.data?.markets.find(m=>m.id===selectedId)??defaultMarket??p.data?.markets[0];
  const selectedObservation=p.data?.observations.find(o=>o.id===selectedMarket?.observationId);
  const chainMarkets=p.data?.markets??[];
  const directory=useMemo(()=>chainMarkets.filter(m=>{const obs=p.data?.observations.find(o=>o.id===m.observationId);return (observationFilter==='all'||m.observationId===observationFilter)&&`${assetLabel(obs)} ${formatAmount(m.strike,8,0)} ${m.id} ${m.yesTokenId} ${m.noTokenId}`.toLowerCase().includes(search.toLowerCase())}),[chainMarkets,observationFilter,p.data?.observations,search]);
  const predictionDirectory=useMemo(()=>research.filter(m=>`${m.question} ${m.outcomes.join(' ')} ${m.venue}`.toLowerCase().includes(marketSearch.toLowerCase())),[research,marketSearch]);
  const now=BigInt(p.data?.timestamp??0);
  const openCreditRequests=p.data?.positions.filter(position=>{
    const observation=p.data?.observations.find(item=>item.id===position.observationId);
    return position.state===1&&position.request.active&&BigInt(position.request.expiry)>now&&observation?.state===0&&BigInt(observation.observationTime)>now;
  })??[];

  useEffect(()=>{
    if(tab!=='prediction')return;
    let disposed=false;
    const controller=new AbortController();
    const load=async()=>{
      const url=marketFeedUrl();
      if(!url){setResearchError('Market data service is not configured for this deployment.');setResearchLoading(false);return;}
      setResearchLoading(true);
      try{
        const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
        const result=await response.json();
        if(!response.ok)throw new Error(result.error??'Market data service unavailable');
        if(!disposed){setFeed(result as MarketFeed);setResearchError(null);}
      }catch(error){if(!disposed&&!controller.signal.aborted){setResearchError(error instanceof Error?error.message:'Market data service unavailable');setFeed(current=>current?{...current,stale:true}:current);}}
      finally{if(!disposed)setResearchLoading(false);}
    };
    void load();
    const interval=setInterval(()=>void load(),15000);
    return()=>{disposed=true;controller.abort();clearInterval(interval)};
  },[tab]);

  useEffect(()=>{if(!selectedObservation||tab!=='aqra')return;const candidate=priceSymbol(assetLabel(selectedObservation));setSymbol(current=>current===candidate?current:candidate)},[selectedObservation?.id,tab]);

  const selectedOpen=openMarkets.some(m=>m.id===selectedMarket?.id);
  const validUnits=/^[1-9]\d*$/.test(units)&&BigInt(units)<=MAX_UNITS;
  const requestedUnits=validUnits?BigInt(units):0n;
  const mintCost=requestedUnits*UNIT;
  const hasWalletBalance=p.walletReady&&p.data?.walletBalance!==null&&p.data?.walletBalance!==undefined;
  const sufficientBalance=hasWalletBalance&&BigInt(p.data?.walletBalance??'0')>=mintCost;
  const compatiblePair=p.data&&selectedMarket?(()=>{const candidate=latestEligiblePair(p.data);if(candidate?.lower===selectedMarket.id)return candidate;const upper=p.data.markets.find(m=>m.observationId===selectedMarket.observationId&&BigInt(m.strike)>BigInt(selectedMarket.strike)&&m.enabledForNewCollateral&&p.data!.observations.some(o=>o.id===m.observationId&&o.state===0&&BigInt(o.observationTime)>BigInt(p.data!.timestamp)));return upper?{lower:selectedMarket.id,upper:upper.id,lowerUnits:'1',upperUnits:'1'}:candidate})():null;
  const selectMarket=(market:MarketRow)=>{setSelectedId(market.id);const obs=p.data?.observations.find(o=>o.id===market.observationId);if(obs)setSymbol(priceSymbol(assetLabel(obs)))};
  const mintSet=()=>{if(!selectedMarket)return;void action.run(()=>mint(BigInt(selectedMarket.id),parseUnits(units)))};

  return <>
    <PageHeading eyebrow="AQRA · PREDICTION MARKETS & CREDIT" title="Market terminal" description="" action={<button className="icon-button" aria-label="Refresh chain state" onClick={()=>void p.refresh()}><RefreshCw size={16}/></button>}/>
    <div className="terminal-ticker" aria-label="Live AQRA protocol state"><div><span>REGISTERED AQRA MARKETS</span><strong>{p.data?.markets.length??'—'}</strong></div><div><span>OPEN CREDIT REQUESTS</span><strong>{p.data?openCreditRequests.length:'—'}</strong></div><div><span>ACTIVE LOANS</span><strong>{p.data?.loans.filter(loan=>loan.state===1).length??'—'}</strong></div><div><span>CHAIN SNAPSHOT</span><strong className="mono">{p.data?`#${p.data.blockNumber}`:'WAITING'}</strong></div></div>

    <Panel className="terminal-markets-panel">
      <div className="market-panel-heading"><div><span className="eyebrow">MARKET ACCESS</span><h2>{tab==='prediction'?'Prediction markets':'AQRA collateral markets'}</h2></div><div className="market-tabs" role="tablist" aria-label="Market type"><button role="tab" aria-selected={tab==='prediction'} className={tab==='prediction'?'selected':''} onClick={()=>setTab('prediction')}>Prediction markets <span>{research.length||'—'}</span></button><button role="tab" aria-selected={tab==='aqra'} className={tab==='aqra'?'selected':''} onClick={()=>setTab('aqra')}>AQRA collateral <span>{p.data?.markets.length??'—'}</span></button></div></div>
      {tab==='prediction'?<div className="terminal-workspace prediction-workspace">
        <Panel className="prediction-directory-panel">
          <div className="prediction-list-toolbar"><div className="search-field"><Search size={15}/><input aria-label="Search prediction markets" placeholder="Search live markets" value={marketSearch} onChange={event=>setMarketSearch(event.target.value)}/></div><span className="market-feed-status"><i className={`status-dot ${feed?.bookFetchedAt&&!feed.stale?'live':'amber'}`}/>{researchLoading&&!feed?'Loading':researchError?'Unavailable':feed?.stale?'Stale feed':`${predictionDirectory.length} markets`}</span></div>
          {researchError&&!feed?<Empty title="Market feed unavailable">{researchError}</Empty>:!predictionDirectory.length?<Empty title={researchLoading?'Loading live markets…':'No matching markets'}>{researchLoading?'':'Try another search or refresh the venue feed.'}</Empty>:<div className="prediction-market-list" role="list">
            {predictionDirectory.map(m=><button type="button" role="listitem" key={m.externalId} aria-pressed={selectedResearch?.externalId===m.externalId} className={`prediction-market-row ${selectedResearch?.externalId===m.externalId?'selected':''}`} onClick={()=>{setSelectedPredictionId(m.externalId);setOutcomeIndex(0)}}>
              <span className="prediction-market-copy"><strong>{m.question}</strong><small>{m.endDate?`Ends ${new Date(m.endDate).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`:'No end date'} · {m.venue}</small></span>
              <span className="prediction-outcomes-preview">{m.outcomes.slice(0,3).map((outcome,index)=><span key={`${outcome}-${index}`}><b>{outcome}</b><strong>{askPrice(m.buyBooks[index]?.[0]?.price)}</strong></span>)}</span>
              <span className="prediction-volume">{usd(m.volume24h??m.volume)}<small>24H VOL</small></span>
              <ArrowRight size={15}/>
            </button>)}
          </div>}
          <div className="market-footer"><span>Polymarket · Gamma discovery + CLOB asks</span><span>{feed?.fetchedAt?`Updated ${new Date(feed.fetchedAt).toLocaleTimeString()}`:'Awaiting market feed'}</span></div>
        </Panel>
        <PredictionRiskTicket market={selectedResearch} feed={feed} loading={researchLoading} stake={stake} onStake={setStake} outcomeIndex={outcomeIndex} onOutcome={setOutcomeIndex}/>
      </div>:<>
        <div className="terminal-workspace">
          <Panel className="terminal-chart-panel">
            <div className="terminal-instrument"><div className="instrument-identity"><span className={`asset-icon ${symbol.includes('BTC')?'btc':'eth'}`}>{symbol.includes('BTC')?'₿':'Ξ'}</span><div><strong>{symbol.includes('BTC')?'BTC / USD':'ETH / USD'}</strong><span>SPOT REFERENCE · TRADINGVIEW</span></div></div><div className="instrument-actions"><div className="instrument-symbols" aria-label="Select spot reference symbol">{(['COINBASE:BTCUSD','COINBASE:ETHUSD'] as const).map(value=><button key={value} className={symbol===value?'selected':''} aria-pressed={symbol===value} onClick={()=>setSymbol(value)}>{value.includes('BTC')?'BTC/USD':'ETH/USD'}</button>)}</div><Badge tone="amber">TESTNET SETTLEMENT</Badge></div></div>
            <TradingViewChart symbol={symbol}/>
            <div className="chart-source"><span><i className="status-dot live"/>External spot candles</span><a href="https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/" target="_blank" rel="noreferrer">TradingView chart source<ExternalLink size={12}/></a><span>Settlement uses the selected AQRA observation.</span></div>
          </Panel>
          <aside className="terminal-ticket"><Panel className="ticket-panel">
            <div className="ticket-heading"><div className="eyebrow">AQRA OUTCOME ISSUER</div><Badge tone={p.online?'green':'amber'}>{p.online?'CONNECTED':'READ ONLY'}</Badge></div>
            <h2>Mint complete sets</h2>
            {selectedMarket?<>
              <label className="terminal-select-label" htmlFor="terminal-market-select">Market</label>
              <select id="terminal-market-select" aria-label="Choose an AQRA collateral market" value={selectedMarket.id} onChange={event=>selectMarket(chainMarkets.find(m=>m.id===event.target.value)??selectedMarket)}>{chainMarkets.map(m=>{const obs=p.data?.observations.find(o=>o.id===m.observationId);return <option key={m.id} value={m.id}>#{m.id} · {assetLabel(obs)} ≥ ${formatAmount(m.strike,obs?.priceDecimals??8,0)}</option>})}</select>
              <div className="ticket-condition"><span>{assetLabel(selectedObservation)} ≥ ${formatAmount(selectedMarket.strike,selectedObservation?.priceDecimals??8,0)}</span><strong>Market #{selectedMarket.id}</strong><small>YES #{selectedMarket.yesTokenId} + NO #{selectedMarket.noTokenId}</small></div>
              <label className="ticket-amount-label" htmlFor="complete-set-quantity">Complete sets <span>1 set = 1 test USDC</span></label><input id="complete-set-quantity" aria-label="Complete-set quantity" inputMode="numeric" value={units} onChange={event=>setUnits(event.target.value)}/>
              <div className="ticket-cost"><span>Mint cost</span><strong>{validUnits?`$${units}.00`:'—'} <small>test USDC</small></strong></div>
              <Button data-testid="mint-complete-set" className="full" disabled={!p.address||!p.online||!p.walletReady||!selectedOpen||action.busy||!validUnits||!sufficientBalance} onClick={mintSet}><Plus size={15}/>{action.busy?'Confirming transaction…':'Mint complete set'}<ArrowRight size={14}/></Button>
              {!p.address&&<p className="ticket-hint"><Wallet size={13}/>Connect a wallet to mint the registered YES and NO claims.</p>}{p.address&&!p.online&&<p className="ticket-hint">Live devnet connection is required for wallet transactions.</p>}{p.address&&p.online&&!p.walletReady&&<p className="ticket-hint">Reading the connected wallet balance…</p>}{p.walletReady&&validUnits&&!sufficientBalance&&<p className="ticket-hint">Insufficient test USDC.</p>}{p.address&&p.online&&!selectedOpen&&<p className="ticket-hint">This observation is not open for new collateral.</p>}
              {!selectedOpen&&defaultMarket&&<Button variant="secondary" className="full" onClick={()=>selectMarket(defaultMarket)}>Select open market</Button>}
              {action.error&&<div className="error-box" role="alert">{action.error}</div>}
              <Link href="/outcomes/" className="button secondary full"><FileCheck2 size={14}/>Check outcome compatibility</Link>
              {compatiblePair&&<Link href="/compose/" className="text-link ticket-compose" onClick={()=>p.setDraft(draft=>({...draft,...compatiblePair}))}>Compose compatible pair<ArrowUpRight size={13}/></Link>}
            </>:<Empty title="No AQRA market selected">Connect to a deployment with registered outcome claims.</Empty>}
          </Panel></aside>
        </div>
        <div className="market-filters"><div className="search-field"><Search size={15}/><input aria-label="Search AQRA collateral markets" placeholder="Search asset, threshold, token ID" value={search} onChange={event=>setSearch(event.target.value)}/></div><select aria-label="Filter AQRA markets by observation" value={observationFilter} onChange={event=>setObservationFilter(event.target.value)}><option value="all">All observations</option>{p.data?.observations.map(o=><option key={o.id} value={o.id}>#{o.id} · {assetLabel(o)}</option>)}</select><Badge tone={p.online?'green':'amber'}>{p.online?`DIRECT RPC · CHAIN ${p.deployment?.chainId??'—'}`:'CHAIN OFFLINE'}</Badge></div>
        <MarketDirectory markets={directory} selectedId={selectedMarket?.id??''} onInspect={selectMarket}/>
        <div className="market-footer"><span>{directory.length} registered AQRA markets</span><span>Collateral state read from AQRA contracts</span></div>
      </>}
    </Panel>
  </>;
}
