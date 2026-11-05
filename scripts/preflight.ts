import {readFile} from 'node:fs/promises';
import {keccak256} from 'viem';
import {publicClientFor,contractNames,CollateralTokenAbi,readSnapshot,type Deployment} from '../packages/shared/src/index';
const d:Deployment=JSON.parse(await readFile('apps/web/public/deployment.json','utf8')),client=publicClientFor(d,process.env.FLOOR_RPC_URL);
if(await client.getChainId()!==d.chainId)throw new Error('Chain ID mismatch');
for(const name of contractNames){const code=await client.getCode({address:d.contracts[name]});if(!code||keccak256(code)!==d.codeHashes[name])throw new Error(`Code identity mismatch: ${name}`);}
const decimals=await client.readContract({address:d.contracts.CollateralToken,abi:CollateralTokenAbi,functionName:'decimals'});if(decimals!==6)throw new Error('Wrong settlement precision');
const s=await readSnapshot(d,d.roles.borrower,process.env.FLOOR_RPC_URL);
console.log(JSON.stringify({status:'PASS',chainId:d.chainId,contractsVerified:contractNames.length,decimals,mockCollateral:d.mockCollateral,oracleMode:d.oracleMode,block:s.blockNumber,markets:s.markets.length,borrowerBalance:s.walletBalance,positions:s.positions.length,loans:s.loans.length},null,2));
