import {keccak256,toHex} from 'viem';

/** Address-derived pixel avatar. No stored profile or third-party image request. */
export function Identicon({address,size=36}:{address:string;size?:number}){
  const seed=keccak256(toHex(address.toLowerCase())).slice(2);
  const hue=parseInt(seed.slice(0,4),16)%360;
  const colors=[`hsl(${hue} 78% 57%)`,`hsl(${(hue+55)%360} 86% 68%)`,`hsl(${(hue+190)%360} 62% 31%)`];
  return <svg className="pixel-avatar" data-identicon={address.toLowerCase()} aria-hidden="true" width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges"><rect width="8" height="8" fill={colors[2]}/>{Array.from({length:32},(_,i)=>{const x=i%4,y=Math.floor(i/4),n=parseInt(seed[i+4],16);return n%3===0?null:<g key={i} fill={colors[n%2]}><rect x={x} y={y} width="1" height="1"/><rect x={7-x} y={y} width="1" height="1"/></g>})}</svg>;
}
