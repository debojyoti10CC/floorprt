'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowRight,ArrowUpRight,Check,CheckCircle2,FileCheck2,LockKeyhole,Plus,ShieldCheck,SlidersHorizontal} from 'lucide-react';
import {formatAmount,parseAmount,payout,UNIT,type Pair} from '@floor/proof-engine';
import {latestEligiblePair,OutcomeTokensAbi,publicClientFor} from '@floor/shared';
import {useProtocol} from '../lib/protocol';
import {usePair} from '../lib/use-pair';
import {assetLabel} from '../lib/labels';
import {Badge,Button,Panel,Money,Steps,Address,Empty} from './ui';
import {OutcomeGraph,PayoffChart} from './charts';
import {useAction,useMint,eventArgs} from './actions';
import {ArkivStrategyLibrary} from './arkiv-strategies';

export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="page-heading"><div><div className="eyebrow page-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>}

function priceLabel(value:bigint){return formatAmount(value,8,8).replaceAll(',','').replace(/\.?0+$/,'');}

export function Composer(){
  const p=useProtocol(),pairState=usePair(),action=useAction(),mint=useMint();
  const {lower,upper,observation,verified,proof}=pairState;
  const pair=pairState.pair;
  const fresh=p.data?latestEligiblePair(p.data):null;
  const expired=!!observation&&(observation.state!==0||BigInt(observation.observationTime)<=BigInt(p.data?.timestamp??0));
  const [priceText,setPriceText]=useState(''),[cancelled,setCancelled]=useState(false),[lockedId,setLockedId]=useState<string|null>(null);
  useEffect(()=>{if(!pair){setPriceText('');setCancelled(false);return;}setPriceText(priceLabel((pair.lower+pair.upper)/2n));setCancelled(false);},[pair]);
  let settlementPrice:bigint|null=null;
  try{if(pair&&priceText)settlementPrice=parseAmount(priceText,8)}catch{/* Keep an invalid entry out of the live payout. */}
  const currentPayout=pair&&settlementPrice!==null?payout(pair,cancelled?'CANCELLED':settlementPrice):null;
  const hasBalances=p.walletReady&&!!pair&&!!lower&&!!upper&&BigInt(lower.yesBalance)>=pair.lowerUnits&&BigInt(upper.noBalance)>=pair.upperUnits;
  const update=(key:'lower'|'upper'|'lowerUnits'|'upperUnits',value:string)=>p.setDraft(d=>({...d,[key]:value}));
  const lock=async()=>{
    if(!p.deployment||!p.address||!pair||!verified)throw new Error('An onchain proof and connected wallet are required.');
    const client=publicClientFor(p.deployment,p.rpcUrl);
    const approved=await client.readContract({address:p.deployment.contracts.OutcomeTokens,abi:OutcomeTokensAbi,functionName:'isApprovedForAll',args:[p.address,p.deployment.contracts.FloorVault]});
    if(!approved)await p.transact('Approve the collateral vault operator','OutcomeTokens','setApprovalForAll',[p.deployment.contracts.FloorVault,true]);
    const receipt=await p.transact('Lock verified outcome claims','FloorVault','lockPair',[BigInt(p.draft.lower),BigInt(p.draft.upper),pair.lowerUnits,pair.upperUnits,p.address]);
    setLockedId(String(eventArgs(receipt,'FloorVault','VaultPositionCreated').positionId));
  };
  return <>
    <PageHeading eyebrow="AQRA · COLLATERAL ENGINEERING" title="Portfolio composer" description="" action={<Badge tone={verified?'green':'amber'}>{verified?'Verified onchain':'Verification required'}</Badge>}/>
    <Steps active={0}/>
    {expired&&<div className="recovery-bar" role="status" data-testid="expired-pair"><div><strong>This observation has closed.</strong><span>Choose another open market to continue.</span></div>{fresh?<Button data-testid="use-open-pair" onClick={()=>p.setDraft(d=>({...d,...fresh}))}>Use open pair #{fresh.lower} / #{fresh.upper}<ArrowRight size={14}/></Button>:<span className="small muted">No open compatible pair on this chain.</span>}</div>}
    <div className="studio-layout"><div className="studio-main">
      <Panel title="Outcome relationship" eyebrow="01 / SELECT CLAIMS" action={pair?<span className="small muted"><span className="status-dot live"/>Observation #{observation?.id??'—'}</span>:undefined}>
        {pair?<><OutcomeGraph asset={assetLabel(observation)} lower={formatAmount(pair.lower,8,0)} upper={formatAmount(pair.upper,8,0)} observation={observation?.id??'—'} valid={!pairState.problem}/><div className="graph-caption"><span className="line-key green"/>YES at lower strike<span className="line-key blue"/>NO at upper strike</div></>:<Empty title={p.data?'Select two registered claims':'Chain data unavailable'}>{p.data?'Choose a YES claim and a NO claim below.':'Connect to the AQRA chain before composing a collateral position.'}</Empty>}
      </Panel>
      <div className="outcome-tray"><div><span className="eyebrow">AVAILABLE CLAIMS</span></div><div className="outcome-tray-chips">{(p.data?.markets.filter(m=>m.observationId===observation?.id).slice(0,6)??[]).flatMap(m=>(['YES','NO'] as const).map(side=><button key={m.id+side} data-testid={`claim-${m.id}-${side}`} draggable onDragStart={event=>{event.dataTransfer.setData('application/floor-market',JSON.stringify({marketId:m.id,side}));event.dataTransfer.effectAllowed='copy'}} onClick={()=>update(side==='YES'?'lower':'upper',m.id)} aria-label={`Add ${side} market ${m.id} to ${side==='YES'?'lower':'upper'} leg`}><span className={side==='YES'?'yes':'no'}>{side}</span>${formatAmount(m.strike,8,0)}<Plus size={11}/></button>))}</div></div>
      <div className="leg-grid">{(['lower','upper'] as const).map((side,index)=>{const market=side==='lower'?lower:upper;const label=side==='lower'?'YES':'NO';return <div className={`leg-card ${index===0?'lower':'upper'}`} key={side} data-testid={`${side}-dropzone`} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();try{const item=JSON.parse(event.dataTransfer.getData('application/floor-market'));if(item.side!==label)throw new Error(`${side==='lower'?'Lower':'Upper'} leg requires ${label} claims`);if(!p.data?.markets.some(m=>m.id===item.marketId))throw new Error('Choose a registered AQRA claim');update(side,item.marketId);action.setError(null)}catch(error){action.setError((error as Error).message)}}}>
        <div className="leg-header"><span className={`side-pill ${index===0?'yes':'no'}`}>{label}</span><span className="eyebrow">{index===0?'LOWER':'UPPER'} THRESHOLD</span><span className="mono muted">LEG 0{index+1}</span></div>
        <label className="sr-only" htmlFor={`${side}-market`}>{label} market</label>
        <select id={`${side}-market`} data-testid={`${side}-market`} value={market?p.draft[side]:''} onChange={event=>update(side,event.target.value)}><option value="" disabled>Select a registered claim</option>{p.data?.markets.map(m=><option key={m.id} value={m.id}>#{m.id} · ${formatAmount(m.strike,8,0)} · observation #{m.observationId}</option>)}</select>
        <div className="leg-quantity"><label htmlFor={`${side}-units`}>Claim units</label><input id={`${side}-units`} data-testid={`${side}-units`} type="text" inputMode="numeric" value={p.draft[`${side}Units`]} onChange={event=>update(`${side}Units`,event.target.value)}/></div>
        <div className="leg-balance">Wallet balance <span className="mono">{p.walletReady?market?.[index===0?'yesBalance':'noBalance']??'0':p.address?'Reading…':'Connect wallet'} {p.walletReady?'units':''}</span></div>
        {p.address&&p.online&&<Button variant="ghost" className="mint-inline" disabled={action.busy||!market||!pair||expired} onClick={()=>void action.run(()=>mint(BigInt(market!.id),index===0?pair!.lowerUnits:pair!.upperUnits))}><Plus size={12}/>Mint complete set</Button>}
      </div>})}</div>
      <Panel title="Settlement payout" eyebrow="02 / EXPLORE PRICE OUTCOMES" action={<Badge tone={verified?'green':'muted'}>{verified?'Verified floor':'Current portfolio'}</Badge>}>
        {pair?<><div className="chart-summary"><div><span className="small muted">PAYOUT AT SELECTED PRICE</span><strong>{currentPayout===null?'—':<Money value={currentPayout}/>}<span>test USDC</span></strong></div><div className="chart-legend"><span className="line-key green"/>Portfolio payout<span className="line-key dashed"/>{verified?'Verified minimum':'Unverified minimum'}</div></div><PayoffChart pair={pair} verified={verified} price={settlementPrice??undefined} cancelled={cancelled}/><div className="scenario-controls"><div className="scenario-label"><label htmlFor="scenario-price">{assetLabel(observation)} settlement price</label><div className="scenario-value"><span>$</span><input id="scenario-price" aria-label="Scenario settlement price" value={priceText} inputMode="decimal" onChange={event=>{setPriceText(event.target.value);setCancelled(false)}}/></div></div><input aria-label="Explore settlement price" className="price-slider" type="range" min={Math.max(0,Number(pair.lower)/1e8-1500)} max={Number(pair.upper)/1e8+1500} step="1" value={settlementPrice===null?(Number(pair.lower+pair.upper)/2e8):Number(settlementPrice)/1e8} onChange={event=>{setPriceText(event.target.value);setCancelled(false)}}/><Button variant="secondary" aria-pressed={cancelled} onClick={()=>setCancelled(value=>!value)}>{cancelled?'Use price settlement':'Explore cancellation result'}</Button></div></>:<Empty title="Select a compatible pair">The payout chart appears when both registered claims share an observation.</Empty>}
      </Panel>
      {pair&&<ArkivStrategyLibrary deployment={p.deployment} pair={pair} verified={verified} observationId={observation?.id??null} asset={assetLabel(observation)} lowerMarketId={p.draft.lower} upperMarketId={p.draft.upper} onLoad={strategy=>p.setDraft(d=>({...d,...strategy}))}/>}
    </div><aside className="studio-inspector">
      <div className="proof-summary"><div className="eyebrow"><ShieldCheck size={14}/>COLLATERAL STATUS</div><Badge tone={verified?'green':pairState.reason?'red':'amber'}>{verified?'Verified onchain':pairState.reason?'Not eligible':p.online?'Checking chain':'Chain offline'}</Badge><span className="summary-label">Minimum settlement payout</span><div className="floor-amount"><Money value={verified?proof!.floorUsdcBase:pairState.preview}/><span>test USDC</span></div><p>{verified?'Eligible for a credit request':'A live contract verification is required before locking.'}</p><div className="summary-divider"/><div className="summary-row"><span>Maximum payout</span><strong>{pair?<Money value={(pair.lowerUnits+pair.upperUnits)*UNIT}/>: '—'}</strong></div><div className="summary-row"><span>Claims to lock</span><strong>{pair?`${pair.lowerUnits} YES · ${pair.upperUnits} NO`:'—'}</strong></div><div className="summary-row"><span>Observation</span><strong>{observation?`#${observation.id}`:'—'}</strong></div>{pairState.reason&&!pairState.reason.startsWith('ERR_ALREADY_RESOLVED')&&<div className="error-box small" role="alert" data-testid="proof-rejection">{pairState.reason}</div>}<Link className="button secondary full" href="/proof/"><FileCheck2 size={14}/>Open proof evidence<ArrowUpRight size={14}/></Link><Button data-testid="lock-pair" className="full" disabled={!verified||!p.address||!hasBalances||action.busy} onClick={()=>void action.run(lock)}><LockKeyhole size={14}/>{action.busy?'Confirming transactions…':'Lock verified claims'}<ArrowRight size={14}/></Button>{!p.address?<p className="small muted center">Connect your wallet to lock claims.</p>:!hasBalances&&<p className="small muted center">Mint the selected claims to continue.</p>}{lockedId&&<div className="success-box" data-testid="lock-success"><Check size={14}/>Position #{lockedId} confirmed.<Link href="/credit/">Request credit <ArrowRight size={12}/></Link></div>}{action.error&&<div className="error-box" role="alert">{action.error}</div>}</div>
    </aside></div>
  </>;
}

export function ProofInspector(){
  const p=useProtocol(),pairState=usePair();
  const {verified,proof,observation,lower,upper,reason}=pairState;
  const pair=pairState.pair;
  return <>
    <PageHeading eyebrow="AQRA · CONTRACT READS" title="Proof inspector" description="" action={<Link href="/compose/" className="button secondary">Edit portfolio<SlidersHorizontal size={14}/></Link>}/>
    <Steps active={1}/>
    {!pair?<Panel><Empty title="No portfolio selected">Compose a pair of registered claims to inspect its onchain status.</Empty></Panel>:<>
      <div className={`proof-hero ${verified?'verified':''}`}><span className="proof-hero-icon"><ShieldCheck size={30}/></span><div><Badge tone={verified?'green':'amber'}>{verified?'VERIFIED ONCHAIN':'NOT VERIFIED'}</Badge><h2>{verified?'Collateral floor confirmed':'Collateral cannot be locked'}</h2><p>{p.online?`Checked at block ${proof?.block.toString()??'—'}`:'Live chain query unavailable'}</p></div><div className="proof-hero-value"><span className="eyebrow">MINIMUM PAYOUT</span><strong>{verified?<Money value={proof!.floorUsdcBase} full/>:'—'}</strong><span>test USDC</span></div></div>
      {reason&&!reason.startsWith('ERR_ALREADY_RESOLVED')&&<div className="error-box" role="alert">{reason}</div>}
      <div className="two-column"><Panel title="Selected claims" eyebrow="LIVE PORTFOLIO"><div className="metadata-list">{[['Chain',p.deployment?.chainName??'—'],['Observation',observation?`#${observation.id}`:'—'],['Lower claim',lower?`Market #${lower.id} · YES ≥ $${formatAmount(lower.strike,8,0)} · ${pair.lowerUnits} units`:'—'],['Upper claim',upper?`Market #${upper.id} · NO < $${formatAmount(upper.strike,8,0)} · ${pair.upperUnits} units`:'—'],['Resolution state',observation?.state===0?'Pending':observation?.state===1?'Resolved':observation?.state===2?'Cancelled':'Unavailable'],['Oracle policy',observation?.resolutionPolicyHash??'—']].map(([label,value])=><div key={label}><span>{label}</span><strong className="mono">{value}</strong></div>)}</div></Panel>
        <Panel title="Verifier receipt" eyebrow="ONCHAIN EVIDENCE"><div className="metadata-list">{[['Block',proof?.block.toString()??'—'],['Proof version',proof?.proofVersion??'—'],['Verifier',p.deployment?.contracts.FloorVerifier??'—'],['Outcome issuer',p.deployment?.contracts.OutcomeTokens??'—'],['Vault',p.deployment?.contracts.FloorVault??'—']].map(([label,value])=><div key={label}><span>{label}</span>{label==='Verifier'||label==='Outcome issuer'||label==='Vault'?value!=='—'?<Address value={value}/>:<strong>—</strong>:<strong className="mono">{value}</strong>}</div>)}</div><Link href="/compose/" className="button primary full">Return to composer<ArrowRight size={14}/></Link></Panel></div>
    </>}
  </>;
}
