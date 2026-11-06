import {readFile} from 'node:fs/promises';
import {keccak256,zeroHash} from 'viem';
import {publicClientFor,contractNames,CollateralTokenAbi,TraderCreditDeskAbi,readSnapshot,type Deployment,type ContractName} from '../packages/shared/src/index';
const d:Deployment=JSON.parse(await readFile('apps/web/public/deployment.json','utf8')),client=publicClientFor(d,process.env.FLOOR_RPC_URL);
if(await client.getChainId()!==d.chainId)throw new Error('Chain ID mismatch');
const deployedContracts:ContractName[]=[...contractNames];
if(d.contracts.ChainlinkObservationResolver)deployedContracts.push('ChainlinkObservationResolver');
if(d.contracts.TraderCreditDesk||d.traderCredit)deployedContracts.push('TraderCreditDesk');
if(d.oracleMode==='CHAINLINK_HISTORICAL'&&!d.contracts.ChainlinkObservationResolver)throw new Error('Historical oracle adapter is missing from deployment');
for(const name of deployedContracts){const address=d.contracts[name],code=address?await client.getCode({address}):undefined;if(!code||code==='0x'||keccak256(code)!==d.codeHashes[name])throw new Error(`Code identity mismatch: ${name}`);}
const decimals=await client.readContract({address:d.contracts.CollateralToken,abi:CollateralTokenAbi,functionName:'decimals'});if(decimals!==6)throw new Error('Wrong settlement precision');
if (d.contracts.TraderCreditDesk) {
  const desk = { address: d.contracts.TraderCreditDesk, abi: TraderCreditDeskAbi } as const;
  const [asset, workflow] = await Promise.all([
    client.readContract({ ...desk, functionName: 'asset' }),
    client.readContract({ ...desk, functionName: 'workflowId' }),
  ]);
  if (asset.toLowerCase() !== d.contracts.CollateralToken.toLowerCase() || workflow === zeroHash) throw new Error('Trader credit collateral or workflow is unconfigured.');
}
const s=await readSnapshot(d,d.roles.borrower,process.env.FLOOR_RPC_URL);
console.log(JSON.stringify({status:'PASS',chainId:d.chainId,contractsVerified:deployedContracts.length,decimals,mockCollateral:d.mockCollateral,oracleMode:d.oracleMode,block:s.blockNumber,markets:s.markets.length,borrowerBalance:s.walletBalance,positions:s.positions.length,loans:s.loans.length},null,2));
