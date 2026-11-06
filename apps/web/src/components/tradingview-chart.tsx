'use client';
import {useEffect,useRef,useState} from 'react';

export type TradedSymbol='COINBASE:BTCUSD'|'COINBASE:ETHUSD';

export function TradingViewChart({symbol}:{symbol:TradedSymbol}){
  const host=useRef<HTMLDivElement>(null),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{
    const container=host.current;if(!container)return;
    let disposed=false,script:HTMLScriptElement|undefined;
    setStatus('loading');container.replaceChildren();
    const install=()=>{
      if(disposed)return;
      const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';
      const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
      const link=document.createElement('a');link.href=`https://www.tradingview.com/symbols/${symbol}/`;link.target='_blank';link.rel='noopener nofollow';link.textContent=`${symbol.replace(':',' ')} · TradingView`;
      credit.append(link);
      const style=getComputedStyle(document.documentElement);
      script=document.createElement('script');script.type='text/javascript';script.async=true;script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.textContent=JSON.stringify({autosize:true,symbol,interval:'D',timezone:'Etc/UTC',theme:'dark',style:'1',locale:'en',allow_symbol_change:false,hide_side_toolbar:true,hide_top_toolbar:false,hide_legend:false,hide_volume:false,hotlist:false,calendar:false,details:false,save_image:false,withdateranges:true,backgroundColor:style.getPropertyValue('--color-surface-raised').trim(),gridColor:style.getPropertyValue('--chart-grid').trim(),support_host:'https://www.tradingview.com'});
      script.onload=()=>setStatus('ready');script.onerror=()=>setStatus('error');
      container.append(widget,credit,script);
    };
    if(document.readyState==='complete')install();else window.addEventListener('load',install,{once:true});
    return()=>{disposed=true;window.removeEventListener('load',install);if(script)script.onload=script.onerror=null;container.replaceChildren()};
  },[symbol]);
  return <div className="tradingview-frame"><div ref={host} className="tradingview-widget-container" aria-label={`${symbol.replace(':',' ')} spot market chart by TradingView`}/>{status==='loading'&&<div className="tradingview-loading" role="status">Loading live TradingView candles…</div>}{status==='error'&&<div className="tradingview-error" role="status">TradingView could not load. The onchain market directory and portfolio tools remain available.</div>}</div>;
}
