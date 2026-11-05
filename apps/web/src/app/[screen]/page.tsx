import { Terminal } from '../../components/terminal';
export function generateStaticParams(){return ['terminal','markets','compose','proof','credit','portfolio','settlements','ops','docs'].map(screen=>({screen}));}
export default async function Page({params}:{params:Promise<{screen:string}>}){const {screen}=await params;return <Terminal initialPage={screen}/>}
