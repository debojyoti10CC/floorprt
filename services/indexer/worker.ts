import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {publicClientFor,jsonSafe,type Deployment} from '../../packages/shared/src/index';
import {newJournal,syncJournal,type Journal,type ChainReader} from './indexer';
export class EventJournal {
  private state:Journal|null=null;private running=false;public error:string|null=null;
  constructor(private deployment:Deployment,private rpcUrl=deployment.rpcUrl,private path='services/indexer/state/journal.json'){}
  async sync(){
    if(this.running)return;this.running=true;
    try{
      if(!this.state){try{const s=JSON.parse(await readFile(this.path,'utf8'));if(s.chainId!==this.deployment.chainId||s.startBlock!==this.deployment.deploymentBlock)throw new Error('Changed deployment');this.state=s;}catch{this.state=newJournal(this.deployment.chainId,BigInt(this.deployment.deploymentBlock));}}
      const client=publicClientFor(this.deployment,this.rpcUrl);const tip=await client.getBlockNumber();
      const depth=BigInt(process.env.FLOOR_CONFIRMATIONS??(this.deployment.chainId===31337?'0':'3'));
      const reader:ChainReader={getBlock:async height=>{const b=await client.getBlock({blockNumber:height});return {number:b.number.toString(),hash:b.hash,parentHash:b.parentHash}},getLogs:async height=>{const logs=await client.getLogs({address:Object.values(this.deployment.contracts),fromBlock:height,toBlock:height});return logs.map(l=>({chainId:this.deployment.chainId,blockNumber:l.blockNumber!.toString(),blockHash:l.blockHash!,transactionHash:l.transactionHash!,logIndex:l.logIndex!,data:jsonSafe(l)}));}};
      const next=await syncJournal(this.state!,reader,tip>depth?tip-depth:0n);
      const slash=this.path.lastIndexOf('/');await mkdir(this.path.slice(0,slash),{recursive:true});
      await writeFile(this.path+'.tmp',JSON.stringify(next));await rename(this.path+'.tmp',this.path);this.state=next;this.error=null;
    }catch(e){this.error=(e as Error).message;throw e;}finally{this.running=false;}
  }
  overview(){return {cursor:this.state?.cursor??null,canonicalLogs:this.state?.logs.filter(l=>l.canonical).length??0,orphanLogs:this.state?.logs.filter(l=>!l.canonical).length??0,reorgs:this.state?.reorgs??0,error:this.error,authority:'DERIVED_READ_CACHE'};}
}
