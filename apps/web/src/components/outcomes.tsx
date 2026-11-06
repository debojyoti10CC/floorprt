'use client';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,GitBranch,ShieldCheck} from 'lucide-react';
import {formatAmount,floorOf} from '@floor/proof-engine';
import type {MarketRow} from '@floor/shared';
import {useProtocol} from '../lib/protocol';
import {assetLabel} from '../lib/labels';
import {Badge,Button,Empty} from './ui';
import {PageHeading} from './composer';

export function OutcomeNetwork(){
  const p=useProtocol(),router=useRouter();
  const [lowerId,setLowerId]=useState(p.draft.lower),[upperId,setUpperId]=useState(p.draft.upper);
  useEffect(()=>{setLowerId(p.draft.lower);setUpperId(p.draft.upper)},[p.draft.lower,p.draft.upper]);
  const markets=p.data?.markets??[];
  const grouped=useMemo(()=>{const groups=new Map<string,MarketRow[]>();for(const market of markets)groups.set(market.observationId,[...(groups.get(market.observationId)??[]),market]);return [...groups.entries()]},[markets]);
  const lower=markets.find(m=>m.id===lowerId),upper=markets.find(m=>m.id===upperId);
  const lowerObservation=p.data?.observations.find(o=>o.id===lower?.observationId),upperObservation=p.data?.observations.find(o=>o.id===upper?.observationId);
  const shared=!!lower&&!!upper&&lower.observationId===upper.observationId;
  const ordered=!!lower&&!!upper&&BigInt(lower.strike)<BigInt(upper.strike);
  const open=!!lowerObservation&&lowerObservation.state===0&&BigInt(lowerObservation.observationTime)>BigInt(p.data?.timestamp??0);
  const eligible=shared&&ordered&&open&&!!lower?.enabledForNewCollateral&&!!upper?.enabledForNewCollateral;
  const reason=!lower||!upper?'Select a YES lower claim and a NO upper claim.':!shared?'The two claims must reference the same canonical oracle observation.':!ordered?'The YES lower strike must be below the NO upper strike.':!eligible?'This observation is not open for new collateral.':'Same observation · ordered thresholds · open issuer markets.';
  const choose=(side:'lower'|'upper',market:MarketRow)=>{if(side==='lower'){setLowerId(market.id);p.setDraft(draft=>({...draft,lower:market.id}))}else{setUpperId(market.id);p.setDraft(draft=>({...draft,upper:market.id}))}};
  const compose=()=>{if(!eligible||!lower||!upper)return;p.setDraft(draft=>({...draft,lower:lower.id,upper:upper.id}));router.push('/compose/')};
  const floor=lower&&upper&&ordered?floorOf({lower:BigInt(lower.strike),upper:BigInt(upper.strike),lowerUnits:1n,upperUnits:1n}):null;

  return <>
    <PageHeading eyebrow="SHARED OBSERVATIONS · CLAIM RELATIONSHIPS" title="Outcome graph" description="Choose a lower YES and upper NO claim. Links are based on their canonical observation IDs." action={<Badge tone={eligible?'green':'amber'}>{eligible?'PAIR ELIGIBLE':'CHECK PAIR'}</Badge>}/>
    <div className="outcome-network-layout">
      <section className="outcome-network-list" aria-label="Outcome market graph">
        {!grouped.length?<div className="panel"><Empty title="No registered markets to graph">This graph uses registered AQRA markets and shared onchain observations.</Empty></div>:grouped.map(([observationId,group])=>{
          const observation=p.data?.observations.find(o=>o.id===observationId),asset=assetLabel(observation);
          const status=!observation?'UNKNOWN':observation.state===2?'CANCELLED':observation.state===1?'RESOLVED':BigInt(observation.observationTime)>BigInt(p.data?.timestamp??0)?'OPEN':'MATURED';
          return <article className="outcome-observation-group" key={observationId}>
            <header className="outcome-observation-node"><div className="outcome-node-mark"><GitBranch size={17}/></div><div><span className="eyebrow">CANONICAL OBSERVATION #{observationId}</span><strong>{asset}</strong><small>{observation?new Date(Number(observation.observationTime)*1000).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'Unavailable'} · {observation?.priceDecimals??'—'} decimals</small></div><Badge tone={status==='OPEN'?'green':status==='CANCELLED'?'amber':'muted'}>{status}</Badge></header>
            <div className="outcome-market-nodes">{group.map(market=>{
              const strike=formatAmount(market.strike,observation?.priceDecimals??8,0),lowerSelected=lowerId===market.id,upperSelected=upperId===market.id;
              return <div className="outcome-market-node" key={market.id}>
                <div className="outcome-market-node-meta"><span>MARKET #{market.id} · ESCROW ${formatAmount(market.escrow)}</span><span>YES #{market.yesTokenId} · NO #{market.noTokenId}</span></div>
                <div className="outcome-node-actions"><button className={`outcome-token-node yes ${lowerSelected?'selected':''}`} aria-pressed={lowerSelected} onClick={()=>choose('lower',market)}><span className="side-pill yes">YES · LOWER</span><strong>{asset} ≥ ${strike}</strong><small>Token #{market.yesTokenId} · $1 if condition resolves true</small></button><button className={`outcome-token-node no ${upperSelected?'selected':''}`} aria-pressed={upperSelected} onClick={()=>choose('upper',market)}><span className="side-pill no">NO · UPPER</span><strong>{asset} &lt; ${strike}</strong><small>Token #{market.noTokenId} · $1 if condition resolves false</small></button></div>
              </div>
            })}</div>
          </article>;
        })}
      </section>
      <aside className="outcome-selection-panel">
        <div className="eyebrow"><ShieldCheck size={14}/> SELECTED PAIR</div>
        <div className="outcome-selected-leg"><span className="side-pill yes">YES · LOWER</span><strong>{lower?`${assetLabel(lowerObservation)} ≥ $${formatAmount(lower.strike,lowerObservation?.priceDecimals??8,0)}`:'Choose a lower claim'}</strong><small>{lower?`Market #${lower.id} · observation #${lower.observationId}`:'Click a YES node in the graph'}</small></div>
        <div className="outcome-link-line" aria-hidden="true"><i/><span>same observation</span><i/></div>
        <div className="outcome-selected-leg"><span className="side-pill no">NO · UPPER</span><strong>{upper?`${assetLabel(upperObservation)} &lt; $${formatAmount(upper.strike,upperObservation?.priceDecimals??8,0)}`:'Choose an upper claim'}</strong><small>{upper?`Market #${upper.id} · observation #${upper.observationId}`:'Click a NO node in the graph'}</small></div>
        <div className={`outcome-pair-status ${eligible?'eligible':'ineligible'}`} role="status">{reason}</div>
        <div className="outcome-floor"><span>Calculated floor · 1 unit each</span><strong>{floor!==null?`$${formatAmount(floor)}`:'—'} <small>test USDC</small></strong></div>
        <Button className="full" disabled={!eligible} onClick={compose}>Compose selected pair<ArrowRight size={14}/></Button>
        <p className="small muted">The composer runs the verifier against live contract state before collateral can be locked.</p>
      </aside>
    </div>
  </>;
}
