'use client';
import {useEffect,useRef,useMemo} from 'react';
import {ReactFlow,Background,Handle,Position,MarkerType,useNodesState,type NodeProps} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {formatAmount,payout,floorOf,type Pair} from '@floor/proof-engine';

function MarketNode({data}:NodeProps){const d=data as {label:string;detail:string;kind:string};return <div className={`flow-node ${d.kind}`}><Handle type="target" position={Position.Left}/><span className="node-icon">{d.kind==='observation'?'◈':d.kind==='yes'?'↗':'↘'}</span><div><span className="eyebrow">{d.detail}</span><strong>{d.label}</strong></div><Handle type="source" position={Position.Right}/></div>}
const nodeTypes={market:MarketNode};
export function OutcomeGraph({lower='5,000',upper='6,000',observation='01',valid=true,compact=false,asset='ETH / USD'}:{lower?:string;upper?:string;observation?:string;valid?:boolean;compact?:boolean;asset?:string}){
  const initialNodes=useMemo(()=>[
    {id:'obs',type:'market',position:{x:5,y:85},data:{label:asset,detail:`OBSERVATION #${observation}`,kind:'observation'}},
    {id:'yes',type:'market',position:{x:260,y:10},data:{label:`YES ≥ $${lower}`,detail:'LOWER THRESHOLD',kind:'yes'}},
    {id:'no',type:'market',position:{x:260,y:160},data:{label:`NO ≥ $${upper}`,detail:'UPPER THRESHOLD',kind:'no'}},
    {id:'floor',type:'market',position:{x:520,y:85},data:{label:valid?'Common payoff floor':'Incompatible pair',detail:valid?'RESTRICTED PROOF GRAMMAR':'OBSERVATIONS DIFFER',kind:valid?'floor':'invalid'}},
  ],[lower,upper,observation,valid,asset]);
  const [nodes,setNodes,onNodesChange]=useNodesState(initialNodes);
  useEffect(()=>{setNodes(previous=>initialNodes.map(node=>({...node,position:previous.find(p=>p.id===node.id)?.position??node.position})));},[initialNodes,setNodes]);
  const edge=(source:string,target:string,id:string)=>({id,source,target,type:'smoothstep',animated:!compact,style:{stroke:valid?'var(--color-accent)':'var(--color-negative)',strokeWidth:1.5,strokeDasharray:valid?undefined:'5 4'},markerEnd:{type:MarkerType.ArrowClosed,color:valid?'var(--color-accent)':'var(--color-negative)'}});
  return <div className={`outcome-graph ${compact?'compact':''}`} role="img" aria-label={`Shared observation ${observation} connects YES lower ${lower} and NO upper ${upper}. ${valid?'Both must use the same observation.':'Pair is incompatible.'}`}><ReactFlow nodes={nodes} onNodesChange={onNodesChange} edges={[edge('obs','yes','a'),edge('obs','no','b'),edge('yes','floor','c'),edge('no','floor','d')]} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:0.18}} minZoom={0.5} maxZoom={1.2} nodesConnectable={false} panOnDrag={!compact} zoomOnScroll={false} preventScrolling={false}><Background color="var(--chart-grid)" gap={20} size={1}/></ReactFlow></div>
}

export function PayoffChart({pair,verified,price,cancelled=false}:{pair:Pair;verified:boolean;price?:bigint;cancelled?:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{let disposed=false;let instance:import('echarts').ECharts|undefined;let resize:ResizeObserver|undefined;
    void import('echarts').then(echarts=>{
      if(disposed||!ref.current)return;
      instance=echarts.init(ref.current,undefined,{renderer:'svg'});
      // Conversion to Number is exclusively for screen coordinates, never transaction arithmetic.
      const vars=getComputedStyle(document.documentElement);const token=(name:string)=>vars.getPropertyValue(name).trim();const c={surface:token('--color-surface-raised'),border:token('--color-border-default'),text:token('--color-text-primary'),muted:token('--color-text-secondary'),accent:token('--color-accent'),fill:token('--chart-fill'),fade:token('--chart-fill-fade'),warning:token('--color-warning')};
      const l=Number(pair.lower)/1e8,u=Number(pair.upper)/1e8;
      const start=Math.max(0,l-(u-l)*.8),end=u+(u-l)*.8;
      const a=Number(pair.upperUnits),b=Number(pair.lowerUnits),top=a+b;
      const data=[[start,a],[l,a],[l,top],[u,top],[u,b],[end,b]];
      const markers:any[]=[{yAxis:Number(floorOf(pair))/1e6}];if(price!==undefined&&!cancelled)markers.push({xAxis:Number(price)/1e8,label:{show:false},lineStyle:{color:c.warning,type:'dotted'}});
      instance.setOption({animationDuration:300,textStyle:{fontFamily:'Poppins, sans-serif'},grid:{left:48,right:20,top:30,bottom:43},tooltip:{trigger:'axis',backgroundColor:c.surface,borderColor:c.border,textStyle:{color:c.text},formatter:(params:any)=>{const p=params[0];return `Observed settlement price: $${Number(p.value[0]).toLocaleString()}<br/>Combined payout: ${p.value[1]} test USDC`}},xAxis:{type:'value',min:start,max:end,axisLabel:{color:c.muted,fontSize:11,formatter:(v:number)=>'$'+v.toLocaleString('en-US',{maximumFractionDigits:0})},splitLine:{show:false},axisLine:{lineStyle:{color:c.border}}},yAxis:{type:'value',min:0,max:top+0.5,interval:Math.max(1,Math.ceil(top/4)),axisLabel:{color:c.muted,fontSize:11,formatter:'${value}'},splitLine:{lineStyle:{color:c.border,type:'dashed'}}},series:[{type:'line',data:cancelled?[[start,Number(payout(pair,'CANCELLED'))/1e6],[end,Number(payout(pair,'CANCELLED'))/1e6]]:data,symbol:'none',lineStyle:{color:c.accent,width:2.5},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:c.fill},{offset:1,color:c.fade}])},markLine:{silent:true,symbol:['none','none'],lineStyle:{type:'dashed',color:verified?c.accent:c.muted},label:{color:c.muted,fontSize:11,position:'insideEndTop',formatter:verified?'VERIFIED FLOOR':'CURRENT FLOOR'},data:markers}}]});
      resize=new ResizeObserver(()=>instance?.resize());resize.observe(ref.current);
    });return()=>{disposed=true;resize?.disconnect();instance?.dispose()};
  },[pair,verified,price,cancelled]);
  return <div ref={ref} className="payoff-chart" role="img" aria-label={`Payoff chart. Minimum $${formatAmount(floorOf(pair))}; upper payoff $${formatAmount((pair.lowerUnits+pair.upperUnits)*1000000n)}. Exact values are also available in the state table.`}/>;
}

export function Sparkline(){return <svg className="sparkline" viewBox="0 0 200 54" aria-hidden="true"><defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--color-accent)" stopOpacity=".25"/><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0"/></linearGradient></defs><path d="M0 44L25 44L25 31L80 31L80 10L125 10L125 31L175 31L175 20L200 20L200 54L0 54Z" fill="url(#spark)"/><path d="M0 44H25V31H80V10H125V31H175V20H200" fill="none" stroke="var(--color-accent)" strokeWidth="2"/></svg>}
