/** Durable read-side journal. It never signs transactions or authorizes collateral. */
export type IndexedLog={chainId:number;blockNumber:string;blockHash:string;transactionHash:string;logIndex:number;data:unknown;canonical:boolean};
export type Checkpoint={number:string;hash:string;parentHash:string};
export type Journal={schema:1;chainId:number;startBlock:string;cursor:Checkpoint|null;checkpoints:Checkpoint[];logs:IndexedLog[];reorgs:number};
export type ChainReader={getBlock:(height:bigint)=>Promise<Checkpoint>;getLogs:(height:bigint)=>Promise<Omit<IndexedLog,'canonical'>[]>};
export const newJournal=(chainId:number,startBlock:bigint):Journal=>({schema:1,chainId,startBlock:startBlock.toString(),cursor:null,checkpoints:[],logs:[],reorgs:0});
const key=(log:IndexedLog)=>`${log.chainId}:${log.blockHash}:${log.transactionHash}:${log.logIndex}`;

export async function syncJournal(previous:Journal,reader:ChainReader,toBlock:bigint,maxBlocks=250):Promise<Journal>{
  const state:Journal=structuredClone(previous);const start=BigInt(state.startBlock);
  if(state.cursor){
    const cursorHeight=BigInt(state.cursor.number);
    const actual=cursorHeight<=toBlock?await reader.getBlock(cursorHeight):null;
    if(!actual||actual.hash!==state.cursor.hash){
      let ancestor:Checkpoint|null=null;
      for(const saved of [...state.checkpoints].reverse()){
        if(BigInt(saved.number)>toBlock)continue;
        const canonical=await reader.getBlock(BigInt(saved.number));if(canonical.hash===saved.hash){ancestor=saved;break;}
      }
      const height=ancestor?BigInt(ancestor.number):start-1n;
      for(const log of state.logs)if(BigInt(log.blockNumber)>height)log.canonical=false;
      state.checkpoints=state.checkpoints.filter(c=>BigInt(c.number)<=height);state.cursor=ancestor;state.reorgs++;
    }
  }
  const first=state.cursor?BigInt(state.cursor.number)+1n:start;
  const last=toBlock<first+BigInt(maxBlocks)-1n?toBlock:first+BigInt(maxBlocks)-1n;
  const known=new Map(state.logs.map(l=>[key(l),l]));
  for(let height=first;height<=last;height++){
    const block=await reader.getBlock(height);
    if(state.cursor&&block.parentHash!==state.cursor.hash)throw new Error('CHAIN_CHANGED_DURING_INDEX · retry from the last committed journal');
    for(const log of await reader.getLogs(height)){
      if(log.chainId!==state.chainId||log.blockNumber!==height.toString()||log.blockHash!==block.hash)throw new Error('LOG_PROVENANCE_MISMATCH');
      known.set(key({...log,canonical:true}),{...log,canonical:true});
    }
    state.checkpoints.push(block);state.cursor=block;
  }
  state.logs=[...known.values()];state.checkpoints=state.checkpoints.slice(-256);return state;
}
