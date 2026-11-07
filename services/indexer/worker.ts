import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {ARC_TESTNET_CHAIN_ID,publicClientFor,jsonSafe,type Deployment} from '../../packages/shared/src/index';
import {newJournal,syncFinalizedJournal,syncJournal,type Journal} from './indexer';

export function eventJournalKey(deployment:Deployment,rpcUrl=deployment.rpcUrl){
  const contracts=Object.entries(deployment.contracts).sort(([a],[b])=>a.localeCompare(b)).map(([name,address])=>[name,address?.toLowerCase()]);
  const scope = deployment.chainId === ARC_TESTNET_CHAIN_ID ? ['arc-finalized-v1', deployment.traderCredit?.arcMargin] : [];
  return createHash('sha256').update(JSON.stringify([deployment.chainId,deployment.deploymentBlock,deployment.deployedAt,contracts,rpcUrl,...scope])).digest('hex').slice(0,24);
}
export class EventJournal {
  private state:Journal|null=null;private running=false;public error:string|null=null;
  private readonly identity:string;
  constructor(private deployment:Deployment,private rpcUrl=deployment.rpcUrl,private path=`services/indexer/state/${eventJournalKey(deployment,rpcUrl)}.json`){this.identity=eventJournalKey(deployment,rpcUrl);}
  async sync(){
    if(this.running)return;this.running=true;
    try{
      if(!this.state){try{const s=JSON.parse(await readFile(this.path,'utf8'));if(s.deploymentId!==this.identity||s.chainId!==this.deployment.chainId||s.startBlock!==this.deployment.deploymentBlock)throw new Error('Changed deployment');this.state=s;}catch{this.state=newJournal(this.deployment.chainId,BigInt(this.deployment.deploymentBlock));}}
      const client=publicClientFor(this.deployment,this.rpcUrl);
      if(await client.getChainId()!==this.deployment.chainId)throw new Error('ERR_CHAIN_MISMATCH');
      const arc = this.deployment.chainId === ARC_TESTNET_CHAIN_ID;
      const addresses = Object.entries(this.deployment.contracts)
        .filter(([name]) => !arc || name !== 'CollateralToken').map(([, address]) => address);
      const margin = this.deployment.traderCredit?.arcMargin;
      if (arc && margin) addresses.push(margin.desk, margin.keeper);
      const checkpoint = ({ number, hash, parentHash }: { number: bigint; hash: string; parentHash: string }) =>
        ({ number: number.toString(), hash, parentHash });
      const getBlock = async (height: bigint) => checkpoint(await client.getBlock({ blockNumber: height }));
      const getLogs = async (fromBlock: bigint, toBlock: bigint) => {
        const logs = await client.getLogs({ address: addresses, fromBlock, toBlock });
        return logs.map(log => ({ chainId: this.deployment.chainId, blockNumber: log.blockNumber!.toString(),
          blockHash: log.blockHash!, transactionHash: log.transactionHash!, logIndex: log.logIndex!, data: jsonSafe(log) }));
      };
      let next: Journal;
      if (arc) {
        const head = checkpoint(await client.getBlock({ blockTag: 'finalized' }));
        next = await syncFinalizedJournal(this.state!, { getBlock, getLogs }, head);
      } else {
        const tip = await client.getBlockNumber();
        const depth = BigInt(process.env.FLOOR_CONFIRMATIONS ?? (this.deployment.chainId === 31337 ? '0' : '3'));
        next = await syncJournal(this.state!, { getBlock, getLogs: height => getLogs(height, height) }, tip > depth ? tip - depth : 0n);
      }
      await mkdir(dirname(this.path),{recursive:true});
      await writeFile(this.path+'.tmp',JSON.stringify({...next,deploymentId:this.identity}));await rename(this.path+'.tmp',this.path);this.state=next;this.error=null;
    }catch(e){this.error=(e as Error).message;throw e;}finally{this.running=false;}
  }
  overview(){return {cursor:this.state?.cursor??null,canonicalLogs:this.state?.logs.filter(l=>l.canonical).length??0,orphanLogs:this.state?.logs.filter(l=>!l.canonical).length??0,reorgs:this.state?.reorgs??0,error:this.error,authority:'DERIVED_READ_CACHE'};}
}
