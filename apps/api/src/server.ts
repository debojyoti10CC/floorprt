import {serve} from '@hono/node-server';
import {createReadApi} from './app';
import {deploymentLoader} from './deployment';

const loadRuntime=deploymentLoader();await loadRuntime();
const app=createReadApi(loadRuntime);
const port=Number(process.env.FLOOR_API_PORT??8787);serve({fetch:app.fetch,port,hostname:'127.0.0.1'},()=>console.log(`Floor read API: http://127.0.0.1:${port} · no signing keys`));
const sync=async()=>{const {journal}=await loadRuntime();await journal.sync();};
void sync().catch(e=>console.error('Indexer:',e.message));const timer=setInterval(()=>void sync().catch(e=>console.error('Indexer:',e.message)),6000);
process.on('SIGINT',()=>{clearInterval(timer);process.exit(0)});process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0)});
