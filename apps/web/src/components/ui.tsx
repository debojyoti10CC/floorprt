'use client';
import type {ReactNode,ButtonHTMLAttributes} from 'react';
import {ArrowUpRight,Check,Copy,ExternalLink} from 'lucide-react';
import {formatAmount} from '@floor/proof-engine';
import {useProtocol,short} from '../lib/protocol';

export function Button({children,variant='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger'}){return <button className={`button ${variant} ${className}`} {...props}>{children}</button>}
export function Badge({children,tone='muted'}:{children:ReactNode;tone?:'green'|'blue'|'amber'|'red'|'muted'}){return <span className={`badge ${tone}`}><i/>{children}</span>}
export function Panel({children,title,eyebrow,action,className=''}:{children:ReactNode;title?:string;eyebrow?:string;action?:ReactNode;className?:string}){return <section className={`panel ${className}`}>{(title||eyebrow)&&<div className="panel-head"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}{title&&<h2>{title}</h2>}</div>{action}</div>}{children}</section>}
export function Money({value,full=false}:{value:string|bigint;full?:boolean}){return <span className="mono" title={`${formatAmount(value,6,6)} test USDC`}>${formatAmount(value,6,full?6:2)}</span>}
export function Stat({label,value,detail,icon}:{label:string;value:ReactNode;detail:string;icon?:ReactNode}){return <div className="stat"><div className="stat-label">{label}{icon}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><div className="empty-icon">⌁</div><h3>{title}</h3><p>{children}</p></div>}
export function Address({value}:{value:string}){return <button className="address mono" title={`Copy ${value}`} onClick={()=>void navigator.clipboard.writeText(value)}>{short(value)}<Copy size={11}/></button>}
export function TxLink({hash,label}:{hash:string;label?:string}){
  const {deployment}=useProtocol();const url=deployment?.explorerUrl;
  if(url&&/^https:\/\//.test(url))return <a className="tx-link mono" href={`${url.replace(/\/$/,'')}/tx/${hash}`} target="_blank" rel="noreferrer">{label??short(hash)}<ExternalLink size={12}/></a>;
  return <button title={`Local transaction: ${hash}. Click to copy.`} className="tx-link mono" onClick={()=>void navigator.clipboard.writeText(hash)}>{label??short(hash)}<Copy size={11}/></button>
}
export function ArrowLink({children,href}:{children:ReactNode;href:string}){return <a className="arrow-link" href={href}>{children}<ArrowUpRight size={14}/></a>}
export function Steps({active=0}:{active?:number}){return <div className="steps">{['Compose','Verify','Lock','Fund','Settle'].map((name,i)=><div key={name} className={i===active?'active':i<active?'complete':''}><span>{i<active?<Check size={12}/>:String(i+1).padStart(2,'0')}</span>{name}{i<4&&<i/>}</div>)}</div>}
export const positionState=(state:number)=>['Unknown','Open','Encumbered','Released','Redeemed'][state]??'Unknown';
export const observationState=(state:number)=>['Awaiting observation','Price finalized','Shared cancellation'][state]??'Unknown';
