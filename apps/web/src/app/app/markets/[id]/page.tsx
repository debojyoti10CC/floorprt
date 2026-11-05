import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Terminal} from '../../../../components/terminal';
export function generateStaticParams(){
  try{
    const run=JSON.parse(readFileSync(join(process.cwd(),'public/recorded-run.json'),'utf8')) as {snapshot?:{markets?:Array<{id:string}>}};
    return (run.snapshot?.markets??[]).map(m=>({id:m.id}));
  }catch{return []}
}
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  return <Terminal initialPage="market-detail" marketId={id}/>;
}
