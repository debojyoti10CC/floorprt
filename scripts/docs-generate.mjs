import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const site=resolve(root,'docs/mintlify');
const check=process.argv.includes('--check');
let count=0;
async function emit(path,content){
  const target=resolve(site,path);count++;
  content=content.split('\n').map(line=>line.replace(/[ \t]+$/,'')).join('\n').trimEnd()+'\n';
  if(check){if(await readFile(target,'utf8').catch(()=>null)!==content)throw new Error(`Generated docs drift: ${path}. Run pnpm docs:generate.`);}
  else{await mkdir(dirname(target),{recursive:true});await writeFile(target,content);}
}
const front=(title,description)=>`---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\n---\n\n`;
const repo='https://github.com/debojyoti10CC/floorprt/blob/main/';
const specs=['PRD','ARCHITECTURE','MECHANISM_AND_PROOFS','CONTRACT_SPEC','DATA_AND_API','SECURITY_AND_QA','FRONTEND_UX','DESIGN_SYSTEM','BUILD_PLAN_CODEX','INTEGRATIONS_AND_PRIZES','IMPLEMENTATION_DECISIONS','REFERENCE_RESEARCH','SOURCE_AUDIT','BUILD_STATUS','FEATURES_AND_LIMITATIONS','EXTERNAL_DEPLOYMENT','RELEASE_EVIDENCE'];
for(const name of specs){
  const path=`docs/${name==='IMPLEMENTATION_DECISIONS'?'ADR/':''}${name}.md`;
  const original=await readFile(resolve(root,path),'utf8');
  const title=original.match(/^# (.+)$/m)?.[1]??name;
  let fence=null;
  const body=original.replace(/^# .+\n/,'').split('\n').map(line=>{
    const mark=line.match(/^\s*(`{3,}|~{3,})/);
    if(mark){if(!fence)fence=mark[1][0];else if(mark[1][0]===fence)fence=null;return line;}
    return fence?line:line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('{','&#123;').replaceAll('}','&#125;').replace(/ {2,}$/,'<br />');
  }).join('\n');
  await emit(`specifications/${name}.mdx`,front(title,`Preserved repository document: ${path}. Historical proposals may differ from current implementation.`)+`<Warning>\nPreserved source document. Status, interface examples and proposals are historical where noted; consult the current guides and source-derived references before integration. This page is generated, not a new execution or audit claim.\n</Warning>\n\n[Original Markdown source](${repo}${path}) · [Current documentation scope](/maintenance/source-audit)\n\n${body}`);
}
const abiText=await readFile(resolve(root,'packages/shared/src/abis.generated.ts'),'utf8');
const intros={
  SharedObservationRegistry:'Curator registers immutable observations. Only the bound resolver finalizes at/after maturity; anyone cancels at/after the common longstop. Both terminal states are irreversible.',
  OutcomeMarketFactory:'Curator creates positive distinct GEQ strikes for an open observation, with a global maximum of 4,096 markets. Constructor deploys the only bound issuer and requires six-decimal collateral. Disabling new eligibility preserves existing redemption rights.',
  OutcomeTokens:'Complete sets require exact collateral before mint. Merge is pre-maturity only. Redemption burns the caller’s claims, including redeemFor; operator approvals never permit third-party redemption. See the backing guide for exact fixed payouts.',
  FloorVerifier:'Restricted YES(lower GEQ) plus NO(upper GEQ) proof. verifyPair fixes sides by grammar; verifySelection additionally checks explicit sides. The factory/issuer/registry identity is fixed by immutable construction.',
  FloorVault:'Nontransferable exact-inventory positions with immutable owner and beneficiary. Lock recomputes the proof; expected batch context rejects unsolicited deposits. Only the once-bound reciprocal CreditDesk may lien, redeem or release repaid claims. New-lock pauses do not pause exits.',
  CreditDesk:'Exact borrower-approved principal, bounded fixed due and expiry. One distinct lender per position. Full fixed-due borrower repayment or permissionless terminal settlement is atomic; shortfalls revert. Immutable bufferBps is 2,000 in deployment scripts, not a universal constructor constant.',
  TraderCreditDesk:'Separate trader credit pilot with a first-loss bond and capped principal. An authenticated Chainlink workflow report binds a score to the borrower, evidence digest and exact request. A distinct lender can fund after attestation. The borrower can repay before maturity, and default releases the bond to the lender.',
  ChainlinkObservationResolver:'Permissionless historical-round witness submission, not arbitrary price submission or CRE. The last complete feed publication at/before observation time needs its contiguous successor after it, within the committed window and unchanged deployment phase.',
  MockUSDC:'LOCAL TEST MONEY ONLY. Freely mintable six-decimal tUSDC with no market value. faucet allows a positive amount up to 10,000 USDC per call, with no global issuance cap. The Sepolia deployment path uses external Circle USDC instead.'
};
const type=(p)=>p.type.startsWith('tuple')?`(${p.components.map(type).join(',')})${p.type.slice(5)}`:p.type;
const args=(xs)=>xs.map(p=>`${type(p)}${p.indexed?' indexed':''}${p.name?' '+p.name:''}`).join(', ');
for(const [name,intro] of Object.entries(intros)){
  const match=abiText.match(new RegExp(`export const ${name}Abi = (.+) as const;`));
  if(!match)throw new Error(`Missing ABI ${name}`);
  const abi=JSON.parse(match[1]);
  let content=front(name,`Compiler-ABI-derived callable functions, events and errors for ${name}.`)+`${intro}\n\n[Contract source](${repo}packages/contracts/src/${name}.sol) · [Generated ABI](${repo}packages/shared/src/abis.generated.ts)\n\n<Note>This reference is generated from the checked-in compiler ABI. It includes inherited OpenZeppelin interfaces. It is not a deployment/address claim. Amounts and IDs are integers; tuples expand below to exact ABI field order.</Note>\n\n`;
  for(const [kind,title] of [['constructor','Constructor'],['function','Functions'],['event','Events'],['error','Errors']]){
    content+=`## ${title}\n\n`;
    for(const item of abi.filter(x=>x.type===kind)){
      const signature=kind==='constructor'?`constructor(${args(item.inputs)})`:kind==='function'?`function ${item.name}(${args(item.inputs)}) ${item.stateMutability}${item.outputs.length?' returns ('+args(item.outputs)+')':''}`:`${kind} ${item.name}(${args(item.inputs)})`;
      content+=`### ${item.name??'Deploy'}\n\n\x60\x60\x60solidity\n${signature}\n\x60\x60\x60\n\n`;
    }
  }
  await emit(`contracts/${name}.mdx`,content);
}
const colorLogo=(color)=>`<svg xmlns="http://www.w3.org/2000/svg" width="232" height="48" viewBox="0 0 232 48" role="img" aria-label="AQRA Floor Protocol"><g fill="${color}"><path d="M4 34V14h8v20zm12 0V8h8v26zm12 0V2h8v32z"/><text x="49" y="32" font-family="Arial,sans-serif" font-size="30" font-weight="600" letter-spacing="3">AQRA</text></g></svg>\n`;
await emit('logo/light.svg',colorLogo('#292A48'));await emit('logo/dark.svg',colorLogo('#B7B9F4'));
await emit('favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#15151B"/><path d="M8 36V16h8v20zm12 0V10h8v26zm12 0V4h8v32z" fill="#B7B9F4"/></svg>\n');
console.log(`PASS: ${count} generated documentation files ${check?'match their sources':'written'}.`);
