'use client';

import Link from 'next/link';
import Image from 'next/image';

import {useState,useEffect,useRef} from 'react';

import {ArrowRight,ArrowUpRight,ChartNoAxesCombined,Check,ChevronDown,ExternalLink,FlaskConical,Menu,RefreshCw,Wallet,X,ShieldCheck,HandCoins,Landmark,FileText} from 'lucide-react';

import {useProtocol,message,short} from '../lib/protocol';

import {Button,Badge,Money,TxLink} from './ui';

import {TraderCredit, type TraderCreditSection} from './trader-credit';
import {Whitepaper} from './whitepaper';

import {Identicon} from './identicon';

const localDemoUi=process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI==='true';

export function Terminal({initialPage}:{initialPage:string}){

  const p=useProtocol();const [walletOpen,setWalletOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[walletError,setWalletError]=useState<string|null>(null);
  const [section,setSection]=useState<'Data'|'Risk'|TraderCreditSection>('Data');
  const [focusRiskSignal,setFocusRiskSignal]=useState(0);

  const dialogRef=useRef<HTMLElement>(null);

  useEffect(()=>{if(!walletOpen)return;const opener=document.activeElement as HTMLElement|null;const dialog=dialogRef.current;const items=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]);items()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setWalletOpen(false);return}if(e.key!=='Tab')return;const all=items(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);opener?.focus()};},[walletOpen]);

  const screen=initialPage==='terminal'?'markets':initialPage;
  const current=screen==='whitepaper'?'Whitepaper':section==='Risk'?'Risk engine':section==='Borrow'?'Borrow':section==='Lend'?'Lend':'Data';

  const connect=async(fn:()=>Promise<void>)=>{setWalletError(null);try{await fn();setWalletOpen(false)}catch(e){setWalletError(message(e))}};

  const role=p.address&&p.deployment?Object.entries(p.deployment.roles).find(([,v])=>v.toLowerCase()===p.address!.toLowerCase())?.[0]:null;

  return <div className="app-shell">

    {mobileOpen&&<button className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}

    <aside className={`sidebar ${mobileOpen?'mobile-open':''}`}>

      <Link href="/underwriting/" className="brand" aria-label="AQRA trader credit"><span className="brand-mark aqra-logo"><Image src="/aqra-mark.png" alt="" width={1920} height={1080} priority /></span><span>AQRA</span><span className="brand-beta">BETA</span></Link>

      <button type="button" className="workspace-selector" data-testid="sidebar-account-menu" aria-label={p.address?`Manage wallet ${short(p.address)}`:'Connect wallet'} aria-haspopup="dialog" onClick={()=>setWalletOpen(true)}>{p.address?<Identicon address={p.address} size={32}/>:<span className="workspace-avatar"><Wallet size={16}/></span>}<span className="workspace-account-copy"><strong>{p.address?(role==='resolver'?'Curator':role??'Connected wallet'):'Connect wallet'}</strong><small>{p.address?short(p.address):'Choose a signing account'}</small></span><ChevronDown size={14}/></button>

      {screen==='whitepaper'?<><div className="nav-label">RESEARCH</div><nav aria-label="Main navigation"><Link title="Data" aria-label="Back to data" onClick={()=>setMobileOpen(false)} href="/underwriting/" className="nav-item"><ChartNoAxesCombined size={18}/><span>Data &amp; credit</span></Link></nav></>:<>
        <div className="nav-label">ANALYSIS</div>
        <nav aria-label="Analysis navigation">
          <button type="button" title="Data" aria-current={section==='Data'?'page':undefined} onClick={()=>{setSection('Data');setMobileOpen(false)}} className={`nav-item ${section==='Data'?'selected':''}`}><ChartNoAxesCombined size={18}/><span>Data</span>{section==='Data'&&<i/>}</button>
          <button type="button" title="Risk engine" aria-current={section==='Risk'?'page':undefined} onClick={()=>{setSection('Risk');setFocusRiskSignal(value=>value+1);setMobileOpen(false)}} className={`nav-item ${section==='Risk'?'selected':''}`}><ShieldCheck size={18}/><span>Risk engine</span>{section==='Risk'&&<i/>}</button>
        </nav>
        <div className="nav-label nav-group-spaced">CREDIT DESK</div>
        <nav aria-label="Credit desk navigation">
          <button type="button" title="Borrow" aria-current={section==='Borrow'?'page':undefined} onClick={()=>{setSection('Borrow');setMobileOpen(false)}} className={`nav-item ${section==='Borrow'?'selected':''}`}><HandCoins size={18}/><span>Borrow</span>{section==='Borrow'&&<i/>}</button>
          <button type="button" title="Lend" aria-current={section==='Lend'?'page':undefined} onClick={()=>{setSection('Lend');setMobileOpen(false)}} className={`nav-item ${section==='Lend'?'selected':''}`}><Landmark size={18}/><span>Lend</span>{section==='Lend'&&<i/>}</button>
        </nav>
      </>}

      <div className="sidebar-bottom">
        <Link href="/whitepaper/" aria-current={screen==='whitepaper'?'page':undefined} onClick={()=>setMobileOpen(false)} className={`nav-item sidebar-paper-link ${screen==='whitepaper'?'selected':''}`}><FileText size={17}/><span>Whitepaper</span>{screen==='whitepaper'&&<i/>}</Link>
        <div className="network-card" title={p.online?'AQRA network connected':'AQRA network unavailable'} aria-label={p.online?'AQRA network connected':'AQRA network unavailable'}><div><span className={`status-dot ${p.online?'live':'amber'}`}/>{p.online?'CONNECTED':'OFFLINE'}</div><span className="mono">{p.deployment?.chainName??'NO NETWORK'} · {p.deployment?.chainId??'—'}</span></div>
      </div>

    </aside>

    <div className="app-main">

      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu size={18}/></button><span>AQRA</span><span className="crumb-slash">/</span><strong>{current}</strong></div><div className="header-actions"><span className="testnet-chip"><FlaskConical size={12}/>{p.deployment?.chainName?.toUpperCase()??'NO NETWORK'}</span><button className="icon-button" aria-label="Refresh chain state" onClick={()=>void p.refresh()}><RefreshCw size={15} className={p.loading?'spin':''}/></button><button className="wallet-button" data-testid="wallet-menu" onClick={()=>setWalletOpen(true)}>{p.address?<Identicon address={p.address} size={26}/>:<Wallet size={15}/>} {p.address?<><span className="capitalize">{role??'Wallet'}</span><span className="mono">{short(p.address)}</span><ChevronDown size={12}/></>:<>Connect wallet<ArrowRight size={14}/></>}</button></div></header>

      {!p.online&&<div className="connection-banner" role="status"><span className="status-dot amber"/>Network unavailable · transactions paused</div>}

      <main id="main-content">

        {screen==='underwriting'&&<TraderCredit activeTab={section==='Borrow'||section==='Lend'?section:'Data'} onTabChange={setSection} focusRiskSignal={focusRiskSignal} />}{screen==='whitepaper'&&<Whitepaper/>}

      </main>

      <footer className="app-footer"><div className="app-footer-links"><a href="https://github.com/debojyoti10CC/floorprt/tree/main/docs/mintlify" target="_blank" rel="noreferrer">Documentation<ExternalLink size={12}/></a><Link href="/whitepaper/">Whitepaper</Link></div><span className="mono">{p.data?`RPC · BLOCK ${p.data.blockNumber}`:'AWAITING RPC'}<span className={`status-dot ${p.online?'live':'amber'}`}/></span></footer>

    </div>

    {walletOpen&&<div className="modal-overlay" onClick={()=>setWalletOpen(false)}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label="Connect wallet" onClick={e=>e.stopPropagation()}><div className="modal-head"><span className="eyebrow">WALLET</span><button className="icon-button" aria-label="Close wallet dialog" onClick={()=>setWalletOpen(false)}><X size={18}/></button></div><h2>Connect wallet</h2><Button className="full" variant="secondary" onClick={()=>void connect(p.connectInjected)}><Wallet size={17}/>Browser wallet<ArrowUpRight size={16}/></Button>{localDemoUi&&p.deployment?.chainId===31337&&<details className="local-developer-tools"><summary><span>Local developer tools</span><small>ANVIL · 31337</small></summary><p>Test roles and faucet for this local chain only. These are developer accounts, not customer wallets.</p>{(['borrower','lender','resolver'] as const).map(role=><button data-testid={`connect-${role}`} className="wallet-choice" key={role} disabled={!p.online} onClick={()=>void connect(()=>p.connectLocal(role))}><Identicon address={p.deployment?.roles[role]??role} size={42}/><div><strong className="capitalize">{role==='resolver'?'Local curator / test resolver':role}</strong><small className="mono">{short(p.deployment?.roles[role])}</small></div><ArrowRight size={15}/></button>)}{p.address&&p.online&&p.deployment?.mockCollateral&&<Button variant="secondary" className="full" onClick={()=>void connect(async()=>{await p.transact('Get 100 test USDC from local faucet','CollateralToken','faucet',[100000000n])})}>Local test faucet · 100 USDC</Button>}</details>}{walletError&&<div className="error-box" role="alert">{walletError}</div>}{p.address&&<Button variant="ghost" className="full" onClick={()=>{p.disconnect();setWalletOpen(false)}}>Disconnect {short(p.address)}</Button>}</section></div>}

    {p.tx&&<div className={`transaction-toast ${p.tx.status}`} role="status" aria-live="polite"><div className="tx-indicator">{p.tx.status==='confirmed'?<Check size={18}/>:p.tx.status==='error'?<X size={18}/>:<RefreshCw size={18} className="spin"/>}</div><div><strong>{p.tx.label}</strong><p>{p.tx.status==='signing'?'Review and sign in your wallet':p.tx.status==='pending'?'Transaction submitted · waiting for receipt':p.tx.status==='confirmed'?'Confirmed onchain':p.tx.error}</p>{p.tx.hash&&<TxLink hash={p.tx.hash}/>}</div>{!['pending','signing'].includes(p.tx.status)&&<button aria-label="Dismiss transaction" className="icon-button" onClick={p.dismissTx}><X size={14}/></button>}</div>}

  </div>;

}

