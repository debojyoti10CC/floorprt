'use client';
import {useMemo,useRef,useState} from 'react';
import {formatAmount,payout,type Pair} from '@floor/proof-engine';

type Point={x:number;y:number};
const polygon=(points:Point[])=>points.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
function tint(ratio:number,factor=1){const base=`color-mix(in srgb, var(--chart-low) ${(100-ratio*100).toFixed(1)}%, var(--chart-high))`;return factor<=1?`color-mix(in srgb, ${base} ${factor*100}%, black)`:`color-mix(in srgb, ${base} ${100-(factor-1)*100}%, white)`;}

/** Geometric chart of exact payout values. Coordinates alone use floating point. */
export function PayoffSurface({pair,price,cancelled=false,mode='surface'}:{pair:Pair;price:bigint;cancelled?:boolean;mode?:'surface'|'matrix'}){
  const [yaw,setYaw]=useState(-.62),[hover,setHover]=useState<{price:bigint;scale:bigint;paid:bigint}|null>(null);
  const drag=useRef<{x:number;yaw:number}|null>(null);
  const gap=pair.upper-pair.lower;
  const prices=useMemo(()=>{const start=pair.lower>gap?pair.lower-gap:0n;return Array.from({length:13},(_,i)=>start+(pair.upper+gap-start)*BigInt(i)/12n)},[pair.lower,pair.upper]);
  const cells=useMemo(()=>Array.from({length:6},(_,row)=>prices.map((p,col)=>{
    const scale=BigInt(row+1),paid=payout({...pair,lowerUnits:pair.lowerUnits*scale,upperUnits:pair.upperUnits*scale},cancelled?'CANCELLED':p);
    return {row,col,price:p,scale,paid};
  })).flat(),[pair.lower,pair.upper,pair.lowerUnits,pair.upperUnits,cancelled,prices]);
  const max=cells.reduce((v,c)=>c.paid>v?c.paid:v,1n);
  const project=(x:number,y:number,z:number):Point=>({x:380+x*Math.cos(yaw)-y*Math.sin(yaw),y:244+(x*Math.sin(yaw)+y*Math.cos(yaw))*.43-z});
  const nearest=prices.reduce((best,p,i)=>{const a=p>price?p-price:price-p,b=prices[best]>price?prices[best]-price:price-prices[best];return a<b?i:best},0);
  const sorted=[...cells].sort((a,b)=>{const da=(a.col-6)*27*Math.sin(yaw)+(a.row-2.5)*34*Math.cos(yaw);const db=(b.col-6)*27*Math.sin(yaw)+(b.row-2.5)*34*Math.cos(yaw);return da-db});
  const caption=hover??{price,scale:1n,paid:payout(pair,cancelled?'CANCELLED':price)};
  return <div className="payoff-surface" data-testid="payoff-surface">
    <svg tabIndex={0} onKeyDown={e=>{if(mode==='surface'&&['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();setYaw(v=>e.key==='Home'?-.62:Math.min(-.2,Math.max(-1.15,v+(e.key==='ArrowRight'?.08:-.08))))}}} aria-keyshortcuts="ArrowLeft ArrowRight Home" viewBox="0 0 760 390" role="img" aria-label="Interactive three dimensional payout surface. Price runs across the horizontal axis; rows scale the whole portfolio from one to six times. Height is exact test-USDC payout. Drag to rotate."
      onPointerDown={e=>{if(mode==='surface'){drag.current={x:e.clientX,yaw};e.currentTarget.setPointerCapture(e.pointerId)}}}
      onPointerMove={e=>{if(drag.current)setYaw(Math.min(-.2,Math.max(-1.15,drag.current.yaw+(e.clientX-drag.current.x)*.004)))}}
      onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onPointerLeave={()=>{setHover(null);drag.current=null}}>
      <defs><radialGradient id="surface-floor"><stop stopColor="var(--chart-mid)" stopOpacity=".32"/><stop offset="1" stopColor="var(--color-surface-base)" stopOpacity="0"/></radialGradient></defs>
      {mode==='surface'?<>
        <ellipse cx="390" cy="270" rx="300" ry="100" fill="url(#surface-floor)"/>
        {Array.from({length:15},(_,i)=>{const x=(i-7)*27;return <line key={`x${i}`} x1={project(x,-119,0).x} y1={project(x,-119,0).y} x2={project(x,119,0).x} y2={project(x,119,0).y} stroke="var(--chart-grid)" strokeWidth=".7"/>})}
        {Array.from({length:9},(_,i)=>{const y=(i-4)*34;return <line key={`y${i}`} x1={project(-189,y,0).x} y1={project(-189,y,0).y} x2={project(189,y,0).x} y2={project(189,y,0).y} stroke="var(--chart-grid)" strokeWidth=".7"/>})}
        {sorted.map(cell=>{
          const x=(cell.col-6)*27,y=(cell.row-2.5)*34,ratio=Number(cell.paid*10000n/max)/10000,z=8+ratio*145,w=19,d=24;
          const p0=project(x-w/2,y-d/2,0),p1=project(x+w/2,y-d/2,0),p2=project(x+w/2,y+d/2,0),p3=project(x-w/2,y+d/2,0);
          const a=project(x-w/2,y-d/2,z),b=project(x+w/2,y-d/2,z),c=project(x+w/2,y+d/2,z),dd=project(x-w/2,y+d/2,z);
          const active=cell.col===nearest;
          return <g key={`${cell.row}-${cell.col}`} className="surface-bar" opacity={active?1:.76} onPointerEnter={()=>setHover(cell)} onClick={()=>setHover(cell)}>
            <polygon points={polygon([a,b,p1,p0])} fill={tint(ratio,.62)} stroke="var(--chart-grid)" strokeWidth=".5"/>
            <polygon points={polygon([b,c,p2,p1])} fill={tint(ratio,.72)} stroke="var(--chart-grid)" strokeWidth=".5"/>
            <polygon points={polygon([c,dd,p3,p2])} fill={tint(ratio,.85)} stroke="var(--chart-grid)" strokeWidth=".5"/>
            <polygon points={polygon([dd,a,p0,p3])} fill={tint(ratio,.66)} stroke="var(--chart-grid)" strokeWidth=".5"/>
            <polygon points={polygon([a,b,c,dd])} fill={tint(ratio,1.18)} stroke={active?'var(--color-accent)':'var(--color-border-default)'} strokeWidth={active?1.15:.5}/>
          </g>;
        })}
        <line x1="120" y1="327" x2="647" y2="327" stroke="var(--color-border-default)" strokeWidth=".7"/>
        {[0,4,8,12].map(i=><g key={i}><line x1={120+i*43.9} y1="327" x2={120+i*43.9} y2="332" stroke="var(--color-border-default)"/><text x={120+i*43.9} y="348" fill="var(--color-text-secondary)" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono,monospace">${formatAmount(prices[i],8,0)}</text></g>)}
        <text x="380" y="375" fill="var(--color-text-secondary)" fontSize="11" letterSpacing="1.5" textAnchor="middle">OBSERVED SETTLEMENT PRICE</text>
        <text x="75" y="192" fill="var(--color-text-secondary)" fontSize="11" letterSpacing="1" transform="rotate(-90 75 192)" textAnchor="middle">PAYOUT / PORTFOLIO SCALE</text>
        <text x="638" y="284" fill="var(--color-text-secondary)" fontSize="11" fontFamily="JetBrains Mono,monospace">1×</text><text x="570" y="160" fill="var(--color-text-secondary)" fontSize="11" fontFamily="JetBrains Mono,monospace">6×</text>
      </>:<>
        {cells.map(cell=>{const ratio=Number(cell.paid*10000n/max)/10000,x=99+cell.col*43,y=45+(5-cell.row)*44;return <g key={`${cell.row}-${cell.col}`} onPointerEnter={()=>setHover(cell)}><rect x={x} y={y} width="39" height="39" rx="5" fill={tint(ratio)} stroke={cell.col===nearest?'var(--color-accent)':'var(--color-border-default)'} strokeWidth={cell.col===nearest?1.5:.5}/><text x={x+19.5} y={y+24} fontSize="10" textAnchor="middle" fill="var(--color-text-primary)" fontFamily="JetBrains Mono,monospace">{formatAmount(cell.paid,6,0)}</text></g>})}
        {Array.from({length:6},(_,i)=><text key={i} x="76" y={68+i*44} fontSize="11" textAnchor="end" fill="var(--color-text-secondary)" fontFamily="JetBrains Mono,monospace">{6-i}×</text>)}
        {[0,4,8,12].map(i=><text key={i} x={119+i*43} y="334" fill="var(--color-text-secondary)" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono,monospace">${formatAmount(prices[i],8,0)}</text>)}
        <text x="380" y="365" fill="var(--color-text-secondary)" fontSize="11" letterSpacing="1.5" textAnchor="middle">EXACT PAYOUT IN TEST USDC · NO PROBABILITY MODEL</text>
      </>}
    </svg>
    <div className="surface-tooltip"><span>{cancelled?'SHARED CANCELLATION':`ETH / USD $${formatAmount(caption.price,8,0)}`} · {caption.scale.toString()}×</span><strong>${formatAmount(caption.paid)} <small>test USDC</small></strong></div>
  </div>;
}
