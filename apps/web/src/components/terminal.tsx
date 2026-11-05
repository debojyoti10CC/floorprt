'use client';

import Link from 'next/link';

import {useState,useEffect,useRef} from 'react';

import {Activity,ArrowDownToLine,ArrowRight,ArrowUpRight,BookOpen,Check,ChevronDown,ChevronsUpDown,Command,ExternalLink,FlaskConical,LayoutDashboard,Layers3,Menu,Network,RefreshCw,Search,Settings2,ShieldCheck,Wallet,X} from 'lucide-react';

import {useProtocol,message,short} from '../lib/protocol';

import {Button,Badge,Money,TxLink} from './ui';

import {Overview,Markets,Portfolio,Settlements,Operations,Documentation} from './views';

import {Composer,ProofInspector} from './composer';

import {CreditDeskView} from './credit';

import {Identicon} from './identicon';

const navigation=[{id:'terminal',name:'Overview',icon:LayoutDashboard},{id:'markets',name:'Market explorer',icon:Network},{id:'compose',name:'Portfolio studio',icon:Layers3},{id:'proof',name:'Proof inspector',icon:ShieldCheck},{id:'credit',name:'Credit desk',icon:ArrowDownToLine},{id:'portfolio',name:'My portfolio',icon:Wallet},{id:'settlements',name:'Settlement audit',icon:Activity}];

export function Terminal({initialPage}:{initialPage:string}){

  const p=useProtocol();const [walletOpen,setWalletOpen]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[walletError,setWalletError]=useState<string|null>(null);

  const dialogRef=useRef<HTMLElement>(null);

  useEffect(()=>{if(!walletOpen)return;const opener=document.activeElement as HTMLElement|null;const dialog=dialogRef.current;const items=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')??[]);items()[0]?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setWalletOpen(false);return}if(e.key!=='Tab')return;const all=items(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);opener?.focus()};},[walletOpen]);

  const current=navigation.find(n=>n.id===initialPage)?.name??(initialPage==='ops'?'Operations':'Protocol docs');

  const connect=async(fn:()=>Promise<void>)=>{setWalletError(null);try{await fn();setWalletOpen(false)}catch(e){setWalletError(message(e))}};

  const role=p.address&&p.deployment?Object.entries(p.deployment.roles).find(([,v])=>v.toLowerCase()===p.address!.toLowerCase())?.[0]:null;

  return <div className="app-shell">

    {mobileOpen&&<button className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}

    <aside className={`sidebar ${mobileOpen?'mobile-open':''}`}>

      <Link href="/terminal/" className="brand"><span className="brand-mark"><i/><i/><i/></span><span>AQRA</span><span className="brand-beta">BETA</span></Link>

      <div className="workspace-selector"><Identicon address={p.address??p.deployment?.roles.borrower??'AQRA'} size={32}/><div>AQRA workspace<small>Outcome terminal</small></div><ChevronsUpDown size={13}/></div>

      <div className="nav-label">WORKSPACE</div>

      <nav aria-label="Main navigation">{navigation.map(n=><Link aria-label={n.name} aria-current={initialPage===n.id?'page':undefined} onClick={()=>setMobileOpen(false)} key={n.id} href={`/${n.id}/`} className={`nav-item ${initialPage===n.id?'selected':''}`}><n.icon size={17}/><span>{n.name}</span>{n.id==='compose'&&<span className="nav-new">NEW</span>}{n.id===initialPage&&<i/>}</Link>)}</nav>

      <div className="nav-label resource-label">RESOURCES</div>

      <Link href="/docs/" className={`nav-item ${initialPage==='docs'?'selected':''}`}><BookOpen size={17}/><span>Protocol documentation</span></Link>

      <Link href="/ops/" className={`nav-item ${initialPage==='ops'?'selected':''}`}><Settings2 size={17}/><span>Operations & devnet</span></Link>

      <div className="sidebar-bottom"><div className="network-card"><div><span className={`status-dot ${p.online?'live':'amber'}`}/>{p.online?'LOCAL EVM CONNECTED':p.data?'RECORDED DEVNET RUN':'DEVNET OFFLINE'}<ArrowUpRight size={12}/></div><span className="mono">CHAIN {p.deployment?.chainId??'—'} · v0.1.0</span></div></div>

    </aside>

    <div className="app-main">

      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu size={18}/></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{current}</strong></div><div className="header-actions"><span className="testnet-chip"><FlaskConical size={12}/>TESTNET</span><button className="icon-button" aria-label="Refresh chain state" onClick={()=>void p.refresh()}><RefreshCw size={15} className={p.loading?'spin':''}/></button><button className="wallet-button" data-testid="wallet-menu" onClick={()=>setWalletOpen(true)}>{p.address?<Identicon address={p.address} size={26}/>:<Wallet size={15}/>} {p.address?<><span className="capitalize">{role??'Wallet'}</span><span className="mono">{short(p.address)}</span><ChevronDown size={12}/></>:<>Connect wallet<ArrowRight size={14}/></>}</button></div></header>

      {!p.online&&<div className="connection-banner" role="status"><span className="status-dot amber"/>{p.data?'Recorded local-chain evidence. Connect the devnet for current balances and wallet transactions.':'Start the local devnet to read contract state. The proof calculator is available without a wallet.'}<Link href="/ops/">Connection settings<ArrowUpRight size={12}/></Link></div>}

      <main id="main-content">

        {initialPage==='terminal'&&<Overview/>}{initialPage==='markets'&&<Markets/>}{initialPage==='compose'&&<Composer/>}{initialPage==='proof'&&<ProofInspector/>}{initialPage==='credit'&&<CreditDeskView/>}{initialPage==='portfolio'&&<Portfolio/>}{initialPage==='settlements'&&<Settlements/>}{initialPage==='ops'&&<Operations/>}{initialPage==='docs'&&<Documentation/>}

      </main>

      <footer className="app-footer"><a href="https://github.com/debojyoti10CC/floorprt/tree/main/docs" target="_blank" rel="noreferrer">Documentation<ExternalLink size={12}/></a><span className="mono">{p.data?`${p.data.source==='DIRECT_CHAIN'?'RPC':'RECORDED'} · BLOCK ${p.data.blockNumber}`:'AWAITING RPC'}<span className={`status-dot ${p.online?'live':'amber'}`}/></span></footer>

    </div>

    {walletOpen&&<div className="modal-overlay" onClick={()=>setWalletOpen(false)}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label="Connect wallet" onClick={e=>e.stopPropagation()}><div className="modal-head"><span className="eyebrow">YOUR SIGNING IDENTITY</span><button className="icon-button" aria-label="Close wallet dialog" onClick={()=>setWalletOpen(false)}><X size={18}/></button></div><h2>Connect to AQRA.</h2><Button className="full" variant="secondary" onClick={()=>void connect(p.connectInjected)}><Wallet size={17}/>Browser wallet<ArrowUpRight size={16}/></Button><div className="divider-label">LOCAL DEVNET WALLETS</div>{(['borrower','lender','resolver'] as const).map((role,i)=><button data-testid={`connect-${role}`} className="wallet-choice" key={role} disabled={!p.online||p.deployment?.chainId!==31337} onClick={()=>void connect(()=>p.connectLocal(role))}><Identicon address={p.deployment?.roles[role]??role} size={42}/><div><strong className="capitalize">{role==='resolver'?'Curator / test resolver':role}</strong><small className="mono">{short(p.deployment?.roles[role])}</small></div><ArrowRight size={15}/></button>)}{p.address&&p.online&&p.deployment?.mockCollateral&&p.deployment.chainId===31337&&<Button variant="secondary" className="full" onClick={()=>void connect(async()=>{await p.transact('Get 100 test USDC from the faucet','CollateralToken','faucet',[100000000n])})}>Get 100 test USDC</Button>}{walletError&&<div className="error-box" role="alert">{walletError}</div>}{p.address&&<Button variant="ghost" className="full" onClick={()=>{p.disconnect();setWalletOpen(false)}}>Disconnect {short(p.address)}</Button>}</section></div>}

    {p.tx&&<div className={`transaction-toast ${p.tx.status}`} role="status" aria-live="polite"><div className="tx-indicator">{p.tx.status==='confirmed'?<Check size={18}/>:p.tx.status==='error'?<X size={18}/>:<RefreshCw size={18} className="spin"/>}</div><div><strong>{p.tx.label}</strong><p>{p.tx.status==='signing'?'Review and sign in your wallet':p.tx.status==='pending'?'Transaction submitted · waiting for receipt':p.tx.status==='confirmed'?'Confirmed onchain':p.tx.error}</p>{p.tx.hash&&<TxLink hash={p.tx.hash}/>}</div>{!['pending','signing'].includes(p.tx.status)&&<button aria-label="Dismiss transaction" className="icon-button" onClick={p.dismissTx}><X size={14}/></button>}</div>}

  </div>;

}

