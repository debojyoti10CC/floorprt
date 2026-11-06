import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {contractFingerprint} from './contract-fingerprint.mjs';
const require=createRequire(import.meta.url);
const positionDemo = process.argv.includes('--positions');
if (positionDemo && existsSync('.env.positions.local')) process.loadEnvFile('.env.positions.local');
if(existsSync('.env'))process.loadEnvFile('.env');
const webPort = positionDemo ? 3002 : 3000;
const apiPort = positionDemo ? 8788 : 8787;
const rpcPort = positionDemo ? 8549 : 8545;
const webUrl = 'http://127.0.0.1:' + webPort;
const apiUrl = 'http://127.0.0.1:' + apiPort;
const rpcUrl = 'http://127.0.0.1:' + rpcPort;
const manifestPath = positionDemo ? 'apps/web/public/deployment.positions.local.json' : 'apps/web/public/deployment.json';
if (positionDemo) Object.assign(process.env, {
  FLOOR_DEPLOYMENT_FILE: manifestPath,
  FLOOR_API_PORT: String(apiPort),
  FLOOR_RPC_URL: rpcUrl,
  NEXT_PUBLIC_AQRA_POSITIONS_DEV: 'true',
  NEXT_PUBLIC_FLOOR_API_URL: apiUrl,
});
const children=[];let stopping=false;
function start(script,args=[]){const p=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true});children.push(p);p.on('exit',code=>{if(!stopping&&code){console.error(`Service exited (${code}): ${script}`);shutdown(code)}});return p;}
async function run(script,args=[]){await new Promise((resolve,reject)=>{const p=start(script,args);p.once('exit',code=>code===0?resolve():reject(new Error(`${script} failed with ${code}`)));});}
async function rpc(method,params=[]){const r=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(1000)});const data=await r.json();if(data.error)throw new Error(data.error.message);return data.result;}
async function ready(url){for(let n=0;n<100;n++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw new Error(`Service did not become ready: ${url}`);}
function shutdown(code=0){if(stopping)return;stopping=true;for(const p of children){if(!p.pid||p.exitCode!==null)continue;if(process.platform==='win32')spawn('taskkill.exe',['/pid',String(p.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else p.kill('SIGTERM');}setTimeout(()=>process.exit(code),500);}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
const pnpm=process.env.npm_execpath;
try{
  let chain;try{chain=await rpc('eth_chainId')}catch{}
  if(!chain){start('scripts/foundry.mjs',['anvil','--host','127.0.0.1','--port',String(rpcPort),'--chain-id','31337','--silent']);for(let i=0;i<50;i++){try{chain=await rpc('eth_chainId');break}catch{await new Promise(r=>setTimeout(r,250))}}}
  if(chain!=='0x7a69')throw new Error('Expected the local Anvil chain at ' + rpcUrl);
  await run('scripts/foundry.mjs',['forge','build','--root','packages/contracts']);
  const tsx=require.resolve('tsx/cli');await run(tsx,['scripts/generate-abis.ts']);
  let deployed=false;
  if(existsSync(manifestPath)){
    try{
      const d=JSON.parse(readFileSync(manifestPath,'utf8'));
      const builds=await Promise.all([contractFingerprint(),contractFingerprint('\r\n')]);
      deployed=d.chainId===31337&&d.contracts.CollateralToken&&builds.includes(d.buildFingerprint)&&(await rpc('eth_getCode',[d.contracts.CreditDesk,'latest']))!=='0x';
    }catch{}
  }
  if(!deployed)await run(tsx,['scripts/deploy.ts']);
  await run(tsx,['scripts/deploy-trader-credit.ts']);
  await run(tsx,['scripts/ensure-open.ts']);
  const deployment=JSON.parse(readFileSync(manifestPath,'utf8'));
  let apiHealth;try{const response=await fetch(apiUrl + '/api/v1/health',{signal:AbortSignal.timeout(2000)});apiHealth={ok:response.ok,body:await response.json()};}catch{}
  const apiUp=apiHealth?.ok&&apiHealth.body.apiVersion==='floor-api/v2'&&apiHealth.body.status==='ok'&&apiHealth.body.chainId===deployment.chainId&&apiHealth.body.deployment?.deploymentBlock===deployment.deploymentBlock&&apiHealth.body.deployment?.registry?.toLowerCase()===deployment.contracts.SharedObservationRegistry.toLowerCase()&&apiHealth.body.deployment?.creditDesk?.toLowerCase()===deployment.contracts.CreditDesk.toLowerCase()&&apiHealth.body.deployment?.traderDesk?.toLowerCase()===deployment.contracts.TraderCreditDesk.toLowerCase();
  if(apiHealth&&!apiUp)throw new Error('An incompatible or unhealthy API is running at ' + apiUrl);
  if(!apiUp)start(tsx,positionDemo?['watch','--clear-screen=false','apps/api/src/server.ts']:['apps/api/src/server.ts']);
  await ready(apiUrl + '/api/v1/health');
  let webUp=false;try{webUp=(await fetch(webUrl,{signal:AbortSignal.timeout(1500)})).ok}catch{}
  if(!webUp){if(!pnpm)throw new Error('Start with pnpm dev so the pinned package manager is available.');process.env.NEXT_PUBLIC_ENABLE_LOCAL_DEMO_UI='true';process.env.NEXT_PUBLIC_ENABLE_OPERATIONS_UI='true';start(pnpm,['--filter','@floor/web','exec','next','dev','--hostname','127.0.0.1','--port',String(webPort)]);}
  await ready(webUrl);
  console.log('\nAQRA is ready at ' + webUrl + ' · API ' + apiUrl + ' · test chain ' + rpcUrl);
  setInterval(()=>{},60_000);
}catch(e){console.error(e.message);shutdown(1)}
