import { Terminal } from '../../components/terminal';
import { notFound } from 'next/navigation';
const localDemoUi=process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI==='true';
const operationsUi=localDemoUi||process.env.NEXT_PUBLIC_ENABLE_OPERATIONS_UI==='true';
const screens=['terminal','markets','outcomes','compose','proof','credit','portfolio','settlements','docs'];
export function generateStaticParams(){return [...screens,...(operationsUi?['ops']:[])].map(screen=>({screen}));}
export default async function Page({params}:{params:Promise<{screen:string}>}){const {screen}=await params;if(screen==='ops'&&!operationsUi)notFound();return <Terminal initialPage={screen}/>}
