import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const roots=['apps','packages/proof-engine','packages/shared','packages/contracts/src','scripts','services','e2e'];
let checked=0;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','.next','out','state'].includes(e.name))continue;const path=join(dir,e.name);if(e.isDirectory()){await walk(path);continue;}if(!/\.(ts|tsx|mjs|sol|json|py)$/.test(path))continue;const content=await readFile(path,'utf8');if(/^(<<<<<<< |>>>>>>> )/m.test(content))throw new Error(`Unresolved conflict: ${path}`);if(/(?:PRIVATE_KEY|SECRET_KEY)\s*=\s*['"]?(?:0x)?[0-9a-fA-F]{64}\b/.test(content))throw new Error(`Hardcoded signing secret: ${path}`);checked++;}}
for(const root of roots)await walk(root);
const generated=await readFile('packages/shared/src/abis.generated.ts','utf8');
const abiNames=['MockUSDC','SharedObservationRegistry','OutcomeMarketFactory','OutcomeTokens','FloorVerifier','FloorVault','CreditDesk','ChainlinkObservationResolver','TraderCreditDesk'];
for(const name of abiNames){
  const artifact=JSON.parse(await readFile(`packages/contracts/out/${name}.sol/${name}.json`,'utf8'));
  if(!generated.includes(`export const ${name}Abi = ${JSON.stringify(artifact.abi)} as const;`))throw new Error(`Generated ABI drift: ${name}; run pnpm abi`);
}
console.log(`PASS: ${checked} source files checked for conflict markers and hardcoded signing secrets; ${abiNames.length} generated ABIs match compiler artifacts.`);
