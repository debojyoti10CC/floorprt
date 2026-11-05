'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {ArrowDownLeft,ArrowRight,ArrowUpRight,CheckCircle2,Clock3,Info,LockKeyhole,ShieldCheck,Wallet} from 'lucide-react';
import {parseAmount,formatAmount,maximumDue} from '@floor/proof-engine';
import {CollateralTokenAbi,publicClientFor,type PositionRow} from '@floor/shared';
import {useProtocol,short} from '../lib/protocol';
import {useAction} from './actions';
import {Address,Badge,Button,Empty,Money,Panel,Stat,Steps} from './ui';
import {PageHeading} from './composer';

const inputAmount=(value:bigint|string)=>formatAmount(value,6,6).replaceAll(',','');
export function CreditDeskView(){
  const p=useProtocol(),a=useAction();const [tab,setTab]=useState<'borrow'|'lend'>('borrow');
  const [positionId,setPositionId]=useState(''),[principal,setPrincipal]=useState('0.75'),[due,setDue]=useState('0.78');
  const owned=p.data?.positions.filter(x=>{const o=p.data?.observations.find(o=>o.id===x.observationId);return x.owner.toLowerCase()===p.address?.toLowerCase()&&x.state===1&&o?.state===0&&BigInt(o.observationTime)>BigInt(p.data?.timestamp??'0')})??[];
  const now=BigInt(p.data?.timestamp??'0');
  const requests=p.data?.positions.filter(x=>{const o=p.data?.observations.find(o=>o.id===x.observationId);return x.state===1&&x.request.active&&BigInt(x.request.expiry)>now&&o?.state===0&&BigInt(o.observationTime)>now})??[];
  const selected=(tab==='borrow'?owned:requests).find(x=>x.id===positionId)??(tab==='borrow'?owned[0]:requests[0]);
  const activeLoans=p.data?.loans.filter(x=>x.state===1)??[];
  const sum=(key:'principal'|'due'|'certifiedFloor')=>activeLoans.reduce((v,l)=>v+BigInt(l[key]),0n);
  const cap=selected?maximumDue(BigInt(selected.certifiedFloor),BigInt(p.data?.bufferBps??2000)):0n;
  const requestPrincipal=tab==='lend'?selected?.request.principal:undefined,requestMaximumDue=tab==='lend'?selected?.request.maximumDue:undefined,requestExpiry=tab==='lend'?selected?.request.expiry:undefined;
  useEffect(()=>{if(!selected)return;const f=BigInt(selected.certifiedFloor);setPrincipal(tab==='lend'?inputAmount(selected.request.principal):inputAmount(f*75n/100n));setDue(tab==='lend'?inputAmount(selected.request.maximumDue):inputAmount(f*78n/100n));},[selected?.id,selected?.certifiedFloor,tab,requestPrincipal,requestMaximumDue,requestExpiry]);
  const terms=useMemo(()=>{try{const pr=parseAmount(principal),d=parseAmount(due);if(pr<=0n||d<pr)return {valid:false,reason:'Total due must include the positive principal.',pr,d};if(d>cap)return {valid:false,reason:'Total due exceeds the floor minus its safety reserve.',pr,d};if(requestPrincipal!==undefined&&pr!==BigInt(requestPrincipal))return {valid:false,reason:'The borrower changed the requested principal. Review the updated terms.',pr,d};if(requestMaximumDue!==undefined&&d>BigInt(requestMaximumDue))return {valid:false,reason:'Total due exceeds the borrower-approved maximum.',pr,d};return {valid:true,reason:null,pr,d}}catch(e){return {valid:false,reason:(e as Error).message,pr:0n,d:0n}}},[principal,due,cap,requestPrincipal,requestMaximumDue]);
  const changeTab=(value:'borrow'|'lend')=>{setTab(value);setPositionId('');a.setError(null)};
  const request=async()=>{
    if(!selected||!terms.valid)throw new Error('Choose collateral and valid terms');
    const obs=p.data!.observations.find(o=>o.id===selected.observationId)!;
    const deadline=BigInt(obs.observationTime)<now+1800n?BigInt(obs.observationTime):now+1800n;
    await p.transact('Publish borrower-approved loan request','CreditDesk','requestLoan',[BigInt(selected.id),terms.pr,terms.d,deadline]);
  };
  const fund=async()=>{
    if(!selected||!p.deployment||!p.address||!terms.valid)throw new Error('Choose an open request and connect a separate lender wallet.');
    const pr=BigInt(selected.request.principal);if(terms.pr!==pr)throw new Error('The borrower fixed the exact principal.');
    const client=publicClientFor(p.deployment,p.rpcUrl);
    const allowance=await client.readContract({address:p.deployment.contracts.CollateralToken,abi:CollateralTokenAbi,functionName:'allowance',args:[p.address,p.deployment.contracts.CreditDesk]});
    if(allowance<pr)await p.transact('Approve exact lender principal','CollateralToken','approve',[p.deployment.contracts.CreditDesk,pr]);
    await p.transact('Fund the consented loan','CreditDesk','fundLoan',[BigInt(selected.id),pr,terms.d]);
  };
  const same=selected&&(p.address?.toLowerCase()===selected.owner.toLowerCase()||p.address?.toLowerCase()===selected.beneficiary.toLowerCase());
  return <>
    <PageHeading eyebrow="FIXED DEBT. VERIFIED COLLATERAL." title="The credit desk" description="" action={<Badge tone="green">20% floor reserve</Badge>}/>
    <div className="stats-grid three"><Stat label="Outstanding principal" value={<Money value={sum('principal')}/>} detail={`${activeLoans.length} funded ${activeLoans.length===1?'loan':'loans'} onchain`} icon={<ArrowDownLeft size={16}/>}/><Stat label="Fixed repayment obligations" value={<Money value={sum('due')}/>} detail="Includes all agreed lender fees" icon={<LockKeyhole size={16}/>}/><Stat label="Collateral settlement floor" value={<Money value={sum('certifiedFloor')}/>} detail="Conditional terminal payout bound" icon={<ShieldCheck size={16}/>}/></div>
    <div className="tabs-row"><div className="tabs"><button data-testid="borrow-tab" className={tab==='borrow'?'selected':''} onClick={()=>changeTab('borrow')}>Borrow<ArrowDownLeft size={14}/></button><button data-testid="lend-tab" className={tab==='lend'?'selected':''} onClick={()=>changeTab('lend')}>Lend<ArrowUpRight size={14}/></button></div><span className="small muted">Matched counterparty · one lender · no floating interest</span></div>
    <Steps active={tab==='borrow'?2:3}/>
    <div className="credit-layout"><div>
      <Panel title={tab==='borrow'?'Your available collateral':'Open borrower requests'} eyebrow={tab==='borrow'?'01 / SELECT A VAULT POSITION':'01 / REVIEW A REQUEST'} action={<Badge>{tab==='borrow'?owned.length:requests.length} available</Badge>}>
        {(tab==='borrow'?owned:requests).length===0?<Empty title={tab==='borrow'?'A proven floor comes first.':'No open requests yet.'}>{tab==='borrow'?<>Connect the borrower wallet, compose a compatible pair, and lock the exact claims.<Link href="/compose/" className="button secondary">Open portfolio studio<ArrowRight size={14}/></Link></>:<>A borrower must lock claims and publish their principal, maximum due and expiry onchain.</>}</Empty>:<div className="credit-position-list">{(tab==='borrow'?owned:requests).map(pos=><button key={pos.id} className={`credit-position ${selected?.id===pos.id?'selected':''}`} onClick={()=>setPositionId(pos.id)}><span className="radio"/><div><strong>Proof position #{pos.id}</strong><span>{pos.unitsLower} YES lower + {pos.unitsUpper} NO upper · observation #{pos.observationId}</span><small>{tab==='lend'?`Borrower ${short(pos.owner)}`:'Unencumbered ERC-1155 inventory'}</small></div><div><span className="small muted">SETTLEMENT FLOOR</span><strong><Money value={pos.certifiedFloor}/></strong><Badge tone="green">{tab==='lend'?'Request open':'Vault locked'}</Badge></div></button>)}</div>}
      </Panel>
      {selected&&<Panel title="What secures this loan" eyebrow="02 / UNDERWRITING EVIDENCE"><div className="collateral-details"><div><ShieldCheck size={21}/><h3>Exact inventory. Exact bound.</h3><p>The CreditDesk checks the onchain vault state, borrower consent, request deadline and debt cap in one transaction.</p></div><dl><dt>Borrower</dt><dd><Address value={selected.owner}/></dd><dt>Surplus beneficiary</dt><dd><Address value={selected.beneficiary}/></dd><dt>Lower / upper market IDs</dt><dd className="mono">#{selected.marketLower} / #{selected.marketUpper}</dd><dt>Certified terminal floor</dt><dd><Money value={selected.certifiedFloor} full/></dd><dt>Shared observation</dt><dd className="mono">#{selected.observationId}</dd><dt>Cancellation</dt><dd>50% per claim, shared longstop</dd>{tab==='lend'&&<><dt>Request expiry</dt><dd className="mono">{new Date(Number(selected.request.expiry)*1000).toLocaleString()}</dd></>}</dl></div><div className="info-strip"><Clock3 size={14}/>Repayment waits for finalization. Fixed debt does not grow if the resolver is delayed.</div></Panel>}

    </div><aside>
      <Panel title={tab==='borrow'?'Request credit':'Fund this request'} eyebrow="TERMS & CAPITAL">
        <div className="form-body"><label htmlFor="principal">{tab==='borrow'?'Requested principal':'Borrower-requested principal'}<span className="input-currency">test USDC</span></label><div className="amount-input"><span>$</span><input data-testid="loan-principal" id="principal" inputMode="decimal" value={principal} readOnly={tab==='lend'} onChange={e=>setPrincipal(e.target.value)}/></div><label htmlFor="total-due">{tab==='borrow'?'Maximum total due':'Fixed total due'}<span className="input-currency">test USDC</span></label><div className="amount-input"><span>$</span><input data-testid="loan-due" id="total-due" inputMode="decimal" value={due} onChange={e=>setDue(e.target.value)}/></div><p className="small muted">Total due includes principal and the entire fixed lender fee.</p><div className="summary-divider"/><div className="summary-row"><span>Terminal floor</span><Money value={selected?.certifiedFloor??0n}/></div><div className="summary-row"><span>Safety reserve (20%)</span><Money value={selected?BigInt(selected.certifiedFloor)-cap:0n}/></div><div className="summary-row"><span>Maximum permitted due</span><strong><Money value={cap}/></strong></div><div className="summary-row"><span>Fixed lender fee</span><Money value={terms.d>=terms.pr?terms.d-terms.pr:0n}/></div><div className="summary-row green-text"><span>Minimum borrower residual</span><Money value={selected&&BigInt(selected.certifiedFloor)>=terms.d?BigInt(selected.certifiedFloor)-terms.d:0n}/></div><div className="debt-bar"><span style={{width:cap>0n?`${Number(terms.d*100n/BigInt(selected!.certifiedFloor))}%`:'0%'}}/><i/></div><div className="debt-bar-caption"><span>Fixed debt</span><span>20% reserve</span></div>{selected&&!terms.valid&&<div className="error-box" role="alert">{terms.reason}</div>}{tab==='borrow'?<><Button data-testid="request-loan" className="full" disabled={!selected||!terms.valid||!p.address||!p.online||a.busy} onClick={()=>void a.run(request)}>{a.busy?'Confirming request…':'Publish loan request'}<ArrowRight size={14}/></Button>{selected?.request.active&&<><div className="success-box" data-testid="request-success"><CheckCircle2 size={14}/>Borrow request confirmed onchain.</div><Button variant="ghost" className="full" disabled={a.busy} onClick={()=>void a.run(()=>p.transact('Cancel unfunded loan request','CreditDesk','cancelRequest',[BigInt(selected.id)]))}>Cancel request</Button></>}</>:<><Button data-testid="fund-loan" className="full" disabled={!selected||!terms.valid||!p.address||same||!p.online||a.busy||terms.pr!==BigInt(selected?.request.principal??0n)||terms.d>BigInt(selected?.request.maximumDue??0n)} onClick={()=>void a.run(fund)}>{a.busy?'Confirming funding…':'Approve & fund loan'}<ArrowRight size={14}/></Button>{same&&<div className="info-strip"><Info size={14}/>Switch to the lender wallet to fund this request.</div>}</>}{a.error&&<div className="error-box" role="alert">{a.error}</div>}</div>
      </Panel>

    </aside></div>
  </>;
}
