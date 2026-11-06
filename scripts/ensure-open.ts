import {readFile,writeFile} from 'node:fs/promises';
import {createWalletClient,http,keccak256,toHex,decodeEventLog} from 'viem';
import {abis,chainFor,publicClientFor,readSnapshot,latestEligiblePair,type Deployment} from '../packages/shared/src/index';
const deploymentFile = process.env.FLOOR_DEPLOYMENT_FILE;
const publicPath = deploymentFile ?? 'apps/web/public/deployment.json';
const d:Deployment=JSON.parse(await readFile(publicPath,'utf8'));
if(d.chainId!==31337||!['localhost','127.0.0.1'].includes(new URL(d.rpcUrl).hostname))throw new Error('Local provisioning requires loopback Anvil.');
const client=publicClientFor(d),snapshot=await readSnapshot(d);
const existing=latestEligiblePair(snapshot);
if(existing){console.log(`Open pair #${existing.lower} / #${existing.upper} is ready.`);process.exit(0);}
const wallet=createWalletClient({account:d.roles.curator,chain:chainFor(d.chainId,d.rpcUrl),transport:http(d.rpcUrl)});
const t=(await client.getBlock()).timestamp+86400n;
const send=async(name:'SharedObservationRegistry'|'OutcomeMarketFactory',functionName:string,args:unknown[])=>{
  const hash=await wallet.writeContract({address:d.contracts[name],abi:abis[name],functionName,args});
  const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Provisioning reverted');
  for(const log of receipt.logs){try{const e=decodeEventLog({abi:abis[name],data:log.data,topics:log.topics});if(e.eventName==='ObservationRegistered')return BigInt(String((e.args as unknown as {observationId:bigint}).observationId));}catch{}}
};
const obs=await send('SharedObservationRegistry','registerObservation',[keccak256(toHex('ETH/USD')),t,8,keccak256(toHex('TRUSTED_TEST_RESOLVER')),keccak256(toHex('FLOOR_SHARED_GEQ_50_50_V1')),t+3600n]);
await send('OutcomeMarketFactory','createMarket',[obs,5000n*100000000n]);await send('OutcomeMarketFactory','createMarket',[obs,6000n*100000000n]);
const pair=latestEligiblePair(await readSnapshot(d));if(!pair)throw new Error('Provisioned pair could not be read');d.defaultPair=pair;
await writeFile(publicPath, JSON.stringify(d, null, 2));
if (!deploymentFile) await writeFile(`packages/contracts/deployments/${d.chainId}.json`, JSON.stringify(d, null, 2));
console.log(`Provisioned open pair #${pair.lower} / #${pair.upper}.`);
