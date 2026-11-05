import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const pnpm=process.env.npm_execpath;if(!pnpm)throw new Error('Run this gate with pnpm verify');
await mkdir('evidence/logs',{recursive:true});
const results=[];
for(const command of ['check','preflight','e2e','demo','build']){
  console.log(`Running release gate: pnpm ${command}`);const started=Date.now();let output='';
  const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[pnpm,command],{windowsHide:true});p.stdout.on('data',d=>{output+=d;process.stdout.write(d)});p.stderr.on('data',d=>{output+=d;process.stderr.write(d)});p.on('error',reject);p.on('close',resolve)});
  await writeFile(`evidence/logs/${command}.log`,output);results.push({command:`pnpm ${command}`,exitCode:code,durationMs:Date.now()-started});if(code!==0){await writeFile('evidence/verification.json',JSON.stringify({status:'FAIL',results},null,2));process.exit(Number(code)||1);}
}
let audit='';const auditCode=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[pnpm,'audit','--json'],{windowsHide:true});p.stdout.on('data',d=>audit+=d);p.on('error',reject);p.on('close',resolve)});
const advisory=JSON.parse(audit);await writeFile('evidence/dependency-audit.json',JSON.stringify(advisory,null,2));
if(auditCode!==0)throw new Error('Dependency audit found advisories; inspect evidence/dependency-audit.json');
await writeFile('evidence/verification.json',JSON.stringify({status:'PASS',checkedAt:new Date().toISOString(),results,audit:advisory.metadata?.vulnerabilities},null,2));
console.log('All release gates passed; evidence is saved under evidence/.');
