import {describe,it,expect} from 'vitest';
import {newJournal,syncFinalizedJournal,syncJournal,type ChainReader} from './indexer';
function reader(fork='a'):ChainReader{return {getBlock:async n=>({number:n.toString(),hash:`${n<3n?'a':fork}${n}`,parentHash:`${n<=3n?'a':fork}${n-1n}`}),getLogs:async n=>[{chainId:31337,blockNumber:n.toString(),blockHash:`${n<3n?'a':fork}${n}`,transactionHash:'tx'+n,logIndex:0,data:{event:'LoanFunded'}}]}}
describe('canonical read-side journal',()=>{
  it('indexes idempotently and advances only complete blocks',async()=>{const first=await syncJournal(newJournal(31337,1n),reader(),4n);const again=await syncJournal(first,reader(),4n);expect(again.logs).toHaveLength(4);expect(again.cursor?.number).toBe('4');});
  it('retains orphan evidence and projects only replacement canonical logs',async()=>{const first=await syncJournal(newJournal(31337,1n),reader(),4n);const next=await syncJournal(first,reader('b'),4n);expect(next.reorgs).toBe(1);expect(next.logs.filter(l=>l.canonical)).toHaveLength(4);expect(next.logs.filter(l=>!l.canonical)).toHaveLength(2);expect(next.cursor?.hash).toBe('b4');});
  it('bounds each replay batch',async()=>{const state=await syncJournal(newJournal(31337,1n),reader(),1000n,5);expect(state.cursor?.number).toBe('5');});
  it('rejects foreign or inconsistent log provenance without mutating committed state',async()=>{const state=newJournal(31337,1n),bad=reader();bad.getLogs=async()=>[{chainId:1,blockNumber:'1',blockHash:'fake',transactionHash:'tx',logIndex:0,data:null}];await expect(syncJournal(state,bad,1n)).rejects.toThrow('LOG_PROVENANCE_MISMATCH');expect(state.cursor).toBeNull();});
});

it('pages finalized log ranges without skipping empty blocks or accepting out-of-range events', async () => {
  const { getBlock } = reader();
  const queries: [bigint, bigint][] = [];
  const getLogs = async (from: bigint, to: bigint) => {
    queries.push([from, to]);
    return [];
  };
  const head = await getBlock(1_005n);
  const first = await syncFinalizedJournal(newJournal(5042002, 1n), { getBlock, getLogs }, head);
  const second = await syncFinalizedJournal(first, { getBlock, getLogs }, head);
  expect(queries).toEqual([[1n, 1_000n], [1_001n, 1_005n]]);
  expect(second.cursor).toEqual(head);
  const bad = { getBlock, getLogs: async () => [{
    chainId: 5042002, blockNumber: '999', blockHash: 'a999', transactionHash: 'tx', logIndex: 0, data: null,
  }] };
  await expect(syncFinalizedJournal(first, bad, head)).rejects.toThrow('LOG_PROVENANCE_MISMATCH');
  expect(first.cursor?.number).toBe('1000');
});
