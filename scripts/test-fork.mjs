import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('evidence/logs',{recursive:true});let output='';
const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/foundry.mjs','forge','test','--root','packages/contracts','--match-contract','SepoliaForkTests','-vv'],{env:{...process.env,FLOOR_FORK_TEST:'true'},windowsHide:true});child.stdout.on('data',d=>{output+=d;process.stdout.write(d)});child.stderr.on('data',d=>{output+=d;process.stderr.write(d)});child.on('error',reject);child.on('close',resolve)});
await writeFile('evidence/logs/sepolia-fork.log',output);
await writeFile('evidence/sepolia-fork.json',JSON.stringify({status:code===0?'PASS':'FAIL',checkedAt:new Date().toISOString(),authority:'LOCAL_EVM_FORK_OF_PUBLIC_SEPOLIA',forkBlock:12071482,publicTransactionsSent:0,balanceProvisioning:'FOUNDRY_TEST_CHEATCODE',command:'pnpm test:fork'},null,2));
process.exit(Number(code)||0);
