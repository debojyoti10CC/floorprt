import {readFile} from 'node:fs/promises';
import {EventJournal,eventJournalKey} from '../../../services/indexer/worker';
import type {Deployment} from '../../../packages/shared/src/index';

export type ApiRuntime={deployment:Deployment;rpcUrl:string;journal:EventJournal};

/** Each request holds one manifest generation even if a deployment changes during its reads. */
export function deploymentLoader(path='apps/web/public/deployment.json',rpcOverride=process.env.FLOOR_RPC_URL){
  let current:{contents:string;key:string;runtime:ApiRuntime}|undefined;
  return async():Promise<ApiRuntime>=>{
    const contents=await readFile(path,'utf8');
    if(current?.contents===contents)return current.runtime;
    const deployment:Deployment=JSON.parse(contents),rpcUrl=rpcOverride??deployment.rpcUrl;
    const key=eventJournalKey(deployment,rpcUrl);
    const journal=current?.key===key?current.runtime.journal:new EventJournal(deployment,rpcUrl);
    const runtime={deployment,rpcUrl,journal};
    current={contents,key,runtime};
    return runtime;
  };
}
