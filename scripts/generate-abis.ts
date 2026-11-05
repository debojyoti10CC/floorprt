import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const names=['MockUSDC','SharedObservationRegistry','OutcomeMarketFactory','OutcomeTokens','FloorVerifier','FloorVault','CreditDesk','ChainlinkObservationResolver'] as const;
await mkdir('packages/shared/src',{recursive:true});
let source='// Generated from Foundry artifacts. Run pnpm abi; do not edit.\n';
for(const name of names){
  const artifact=JSON.parse(await readFile(join('packages/contracts/out',name+'.sol',name+'.json'),'utf8'));
  source+=`export const ${name}Abi = ${JSON.stringify(artifact.abi)} as const;\n`;
}
await writeFile('packages/shared/src/abis.generated.ts',source);
console.log('Generated 8 typed ABIs from compiler artifacts.');
