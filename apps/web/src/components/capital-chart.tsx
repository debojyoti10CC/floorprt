'use client';
import {useEffect,useRef} from 'react';
import type {Activity} from '@floor/shared';
import {formatAmount} from '@floor/proof-engine';

export function CapitalChart({events}:{events:Activity[]}){
  const ref=useRef<HTMLDivElement>(null);
  const totals=events.reduce((v,e)=>{if(e.event==='LoanFunded')v.principal+=BigInt(String(e.args.principal));if(e.event==='LoanSettled'){v.lender+=BigInt(String(e.args.lenderPaid));v.residual+=BigInt(String(e.args.borrowerPaid));}if(e.event==='LoanRepaid')v.repaid+=BigInt(String(e.args.paid));return v},{principal:0n,lender:0n,residual:0n,repaid:0n});
  const signature=Object.values(totals).join(',');
  useEffect(()=>{let disposed=false;let chart:import('echarts').ECharts|undefined,observer:ResizeObserver|undefined;
    void import('echarts').then(e=>{if(disposed||!ref.current)return;chart=e.init(ref.current,undefined,{renderer:'svg'});const css=getComputedStyle(document.documentElement),t=(n:string)=>css.getPropertyValue(n).trim();
      const links=[{source:'Lender capital',target:'Borrower advances',value:Number(totals.principal)/1e6},{source:'Redeemed collateral',target:'Lender distributions',value:Number(totals.lender)/1e6},{source:'Redeemed collateral',target:'Borrower residual',value:Number(totals.residual)/1e6},{source:'Borrower repayment',target:'Lender distributions',value:Number(totals.repaid)/1e6}].filter(l=>l.value>0);
      const names=[...new Set(links.flatMap(l=>[l.source,l.target]))];
      chart.setOption({animationDuration:300,textStyle:{fontFamily:'Poppins'},tooltip:{trigger:'item',backgroundColor:t('--color-surface-raised'),borderColor:t('--color-border-default'),textStyle:{color:t('--color-text-primary')},valueFormatter:(v:unknown)=>`${Number(v).toFixed(6)} USDC`},series:[{type:'sankey',left:24,right:170,top:32,bottom:32,nodeWidth:12,nodeGap:24,draggable:true,emphasis:{focus:'adjacency'},data:names.map((name,i)=>({name,itemStyle:{color:[t('--color-accent'),t('--chart-mid'),t('--color-positive')][i%3]}})),links,lineStyle:{color:'gradient',opacity:.32,curveness:.55},label:{color:t('--color-text-primary'),fontSize:12},itemStyle:{borderWidth:0}}]});observer=new ResizeObserver(()=>chart?.resize());observer.observe(ref.current);
    });return()=>{disposed=true;observer?.disconnect();chart?.dispose()};
  // Render coordinates only; totals and transaction arithmetic remain BigInt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  return <><div className="capital-readouts">{[['Advanced',totals.principal],['Lender paid',totals.lender+totals.repaid],['Residual paid',totals.residual]].map(([label,value])=><div key={String(label)}><span>{label as string}</span><strong>${formatAmount(value as bigint)}</strong></div>)}</div><div ref={ref} className="capital-chart" role="img" aria-label={`Confirmed flows: principal ${formatAmount(totals.principal)}, lender paid ${formatAmount(totals.lender+totals.repaid)}, borrower residual ${formatAmount(totals.residual)} USDC.`}/></>;
}
