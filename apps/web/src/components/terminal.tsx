'use client';

import Link from 'next/link';

import {useState,useEffect,useRef} from 'react';

import {ArrowRight,ArrowUpRight,Check,ChevronDown,ExternalLink,FlaskConical,Menu,RefreshCw,Wallet,X} from 'lucide-react';

import {useProtocol,message,short} from '../lib/protocol';

import {Button,Money,TxLink} from './ui';

import {Markets,Portfolio,Settlements,Operations,Documentation} from './views';
import {ARQOOverview,ARQOMarketDetail} from './aqra-overview';

import {Composer,ProofInspector} from './composer';

import {CreditDeskView} from './credit';

import {Identicon} from './identicon';
import {ArqoLogo} from './ArqoLogo';

const navigation=[{id:'terminal',name:'Overview',href:'/app/'},{id:'markets',name:'Markets',href:'/app/markets/'},{id:'portfolio',name:'Portfolio',href:'/app/portfolio/'},{id:'compose',name:'Portfolio Builder',href:'/app/compose/'},{id:'proof',name:'Proof Inspector',href:'/app/proofs/'},{id:'credit',name:'Credit Desk',href:'/app/credit/'}];

export function Terminal({initialPage,marketId}:{initialPage:string;marketId?:string}){

  const p=useProtocol();const [walletOpen,setWalletOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[walletError,setWalletError]=useState<string|null>(null);

  const dialogRef=useRef<HTMLElement>(null);

  useEffect(()=>{if(!walletOpen)return;const opener=document.activeElement as HTMLElement|null;const dialog=dialogRef.current;const items=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]);items()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setWalletOpen(false);return}if(e.key!=='Tab')return;const all=items(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);opener?.focus()};},[walletOpen]);

  const activePage=initialPage==='market-detail'?'markets':initialPage;
  const current=navigation.find(n=>n.id===activePage)?.name??(initialPage==='terminal'?'ARQO Terminal':initialPage==='ops'?'Operations':initialPage==='settlements'?'Settlement audit':'Protocol docs');

  const connect=async(fn:()=>Promise<void>)=>{setWalletError(null);try{await fn();setWalletOpen(false)}catch(e){setWalletError(message(e))}};

  const role=p.address&&p.deployment?Object.entries(p.deployment.roles).find(([,v])=>v.toLowerCase()===p.address!.toLowerCase())?.[0]:null;

  return <div className="app-shell aqra-shell">

    <div className="app-main aqra-app-main">

      <header className="aqra-topbar">
        <Link href="/app/" className="aqra-brand" aria-label="ARQO home"><ArqoLogo variant="light" size={27}/></Link>
        <button className="aqra-menu-button" aria-label={mobileOpen?'Close navigation':'Open navigation'} aria-expanded={mobileOpen} onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={18}/></button>
        <nav className={`aqra-nav ${mobileOpen?'open':''}`} aria-label="Main navigation">
          {navigation.map(n=><Link key={n.id} href={n.href} aria-current={activePage===n.id?'page':undefined} className={activePage===n.id?'active':''} onClick={()=>setMobileOpen(false)}>{n.name}</Link>)}
          <Link href="/app/settlements/" className="aqra-nav-extra" onClick={()=>setMobileOpen(false)}>Settlement audit</Link>
        </nav>
        <div className="aqra-header-actions">
          <Link href="/app/ops/" className="aqra-network" title="Open network configuration"><i className={p.online?'live':''}/><span>{p.deployment?.chainName??(p.data?`Chain ${p.data.chainId}`:'Network offline')}</span><ChevronDown size={12}/></Link>
          {p.address&&p.online&&p.data?.source==='DIRECT_CHAIN'&&<span className="aqra-balance"><Money value={p.data.walletBalance??'0'}/><small>USDC</small></span>}
          <button className="aqra-refresh" aria-label="Refresh chain state" onClick={()=>void p.refresh()}><RefreshCw size={15} className={p.loading?'spin':''}/></button>
          <button className="aqra-wallet" data-testid="wallet-menu" onClick={()=>setWalletOpen(true)}>{p.address?<Identicon address={p.address} size={25}/>:<Wallet size={14}/>} {p.address?<><span className="capitalize">{role??'Wallet'}</span><span className="mono">{short(p.address)}</span></>:<>Connect wallet<ArrowRight size={14}/></>}</button>
        </div>
      </header>

      <div className="aqra-crumb"><span className="aqra-breadcrumb-label">ARQO / WEB TERMINAL</span><span>{current}</span><span className="aqra-testnet"><FlaskConical size={11}/> TESTNET</span></div>

      {!p.online&&<div className="connection-banner" role="status"><span className="status-dot amber"/>{p.data?'Recorded local-chain evidence. Connect the devnet for current balances and wallet transactions.':'Start the local devnet to read contract state. The proof calculator is available without a wallet.'}<Link href="/ops/">Connection settings<ArrowUpRight size={12}/></Link></div>}

      <main id="main-content">

        {initialPage==='terminal'&&<ARQOOverview/>}{initialPage==='market-detail'&&marketId&&<ARQOMarketDetail marketId={marketId}/>}{initialPage==='markets'&&<Markets/>}{initialPage==='compose'&&<Composer/>}{initialPage==='proof'&&<ProofInspector/>}{initialPage==='credit'&&<CreditDeskView/>}{initialPage==='portfolio'&&<Portfolio/>}{initialPage==='settlements'&&<Settlements/>}{initialPage==='ops'&&<Operations/>}{initialPage==='docs'&&<Documentation/>}

      </main>

      <footer className="app-footer aqra-footer"><span>ARQO · OUTCOME COLLATERAL TERMINAL</span><a href="https://github.com/debojyoti10CC/floorprt/tree/main/docs" target="_blank" rel="noreferrer">Protocol documentation<ExternalLink size={12}/></a><Link href="/app/settlements/">Settlement audit<ArrowUpRight size={12}/></Link><span className="mono">{p.data?`${p.data.source==='DIRECT_CHAIN'?'RPC':'RECORDED'} · BLOCK ${p.data.blockNumber}`:'AWAITING RPC'}<span className={`status-dot ${p.online?'live':'amber'}`}/></span></footer>

    </div>

    {walletOpen&&<div className="modal-overlay" onClick={()=>setWalletOpen(false)}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label="Connect wallet" onClick={e=>e.stopPropagation()}><div className="modal-head"><span className="eyebrow">YOUR SIGNING IDENTITY</span><button className="icon-button" aria-label="Close wallet dialog" onClick={()=>setWalletOpen(false)}><X size={18}/></button></div><h2>Connect to ARQO.</h2><Button className="full" variant="secondary" onClick={()=>void connect(p.connectInjected)}><Wallet size={17}/>Browser wallet<ArrowUpRight size={16}/></Button><div className="divider-label">LOCAL DEVNET WALLETS</div>{(['borrower','lender','resolver'] as const).map((role,i)=><button data-testid={`connect-${role}`} className="wallet-choice" key={role} disabled={!p.online||p.deployment?.chainId!==31337} onClick={()=>void connect(()=>p.connectLocal(role))}><Identicon address={p.deployment?.roles[role]??role} size={42}/><div><strong className="capitalize">{role==='resolver'?'Curator / test resolver':role}</strong><small className="mono">{short(p.deployment?.roles[role])}</small></div><ArrowRight size={15}/></button>)}{p.address&&p.online&&p.deployment?.mockCollateral&&p.deployment.chainId===31337&&<Button variant="secondary" className="full" onClick={()=>void connect(async()=>{await p.transact('Get 100 test USDC from the faucet','CollateralToken','faucet',[100000000n])})}>Get 100 test USDC</Button>}{walletError&&<div className="error-box" role="alert">{walletError}</div>}{p.address&&<Button variant="ghost" className="full" onClick={()=>{p.disconnect();setWalletOpen(false)}}>Disconnect {short(p.address)}</Button>}</section></div>}

    {p.tx&&<div className={`transaction-toast ${p.tx.status}`} role="status" aria-live="polite"><div className="tx-indicator">{p.tx.status==='confirmed'?<Check size={18}/>:p.tx.status==='error'?<X size={18}/>:<RefreshCw size={18} className="spin"/>}</div><div><strong>{p.tx.label}</strong><p>{p.tx.status==='signing'?'Review and sign in your wallet':p.tx.status==='pending'?'Transaction submitted · waiting for receipt':p.tx.status==='confirmed'?'Confirmed onchain':p.tx.error}</p>{p.tx.hash&&<TxLink hash={p.tx.hash}/>}</div>{!['pending','signing'].includes(p.tx.status)&&<button aria-label="Dismiss transaction" className="icon-button" onClick={p.dismissTx}><X size={14}/></button>}</div>}

  </div>;

}

