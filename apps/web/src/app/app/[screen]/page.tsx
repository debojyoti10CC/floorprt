import {notFound} from 'next/navigation';
import {Terminal} from '../../../components/terminal';
const screens=['markets','compose','proofs','credit','portfolio','settlements','ops','docs'];
export function generateStaticParams(){return screens.map(screen=>({screen}))}
export default async function Page({params}:{params:Promise<{screen:string}>}){
  const {screen}=await params;
  const page=screen==='proofs'?'proof':screen;
  if(!screens.includes(screen))notFound();
  return <Terminal initialPage={page}/>;
}
