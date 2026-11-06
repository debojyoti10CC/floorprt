import { encodeAbiParameters, keccak256, parseAbiParameters, type Address, type Hex, type PublicClient } from 'viem';
import { PositionCreditDeskAbi } from './abis.generated';
import type { Deployment } from './chain';

export type PositionMarket = {
  ledger: Address;
  conditionId: Hex;
  yesTokenId: string;
  noTokenId: string;
};
export type PositionPledge = PositionMarket & { pairs: string; released: boolean };
const pledgeParameters = parseAbiParameters('address ledger, bytes32 condition, uint256 yes, uint256 no, uint96 amount');

export function positionPledgeHash(pledge: Pick<PositionPledge, 'ledger' | 'conditionId' | 'yesTokenId' | 'noTokenId' | 'pairs'>) {
  return keccak256(encodeAbiParameters(pledgeParameters, [
    pledge.ledger, pledge.conditionId, BigInt(pledge.yesTokenId), BigInt(pledge.noTokenId), BigInt(pledge.pairs),
  ]));
}

export async function readPositionMarket(
  client: Pick<PublicClient, 'readContract'>, deployment: Deployment, blockNumber: bigint,
): Promise<PositionMarket | null> {
  if (!deployment.traderCredit?.positionCollateral || !deployment.contracts.TraderCreditDesk) return null;
  const call = { address: deployment.contracts.TraderCreditDesk, abi: PositionCreditDeskAbi, blockNumber } as const;
  const [ledger, conditionId, yes, no] = await Promise.all([
    client.readContract({ ...call, functionName: 'positionToken' }),
    client.readContract({ ...call, functionName: 'conditionId' }),
    client.readContract({ ...call, functionName: 'yesTokenId' }),
    client.readContract({ ...call, functionName: 'noTokenId' }),
  ]);
  if (ledger.toLowerCase() !== deployment.contracts.PositionTokenLedger?.toLowerCase()) {
    throw new Error('Position ledger differs from the verified deployment.');
  }
  return { ledger, conditionId, yesTokenId: yes.toString(), noTokenId: no.toString() };
}

export async function readPositionPledge(
  client: Pick<PublicClient, 'readContract'>, deployment: Deployment, blockNumber: bigint, id: bigint,
  market?: PositionMarket | null,
): Promise<PositionPledge | null> {
  if (!deployment.traderCredit?.positionCollateral || !deployment.contracts.TraderCreditDesk) return null;
  const [amount, released] = await client.readContract({
    address: deployment.contracts.TraderCreditDesk, abi: PositionCreditDeskAbi,
    functionName: 'positionCollateralOf', args: [id], blockNumber,
  });
  if (amount === 0n) return null;
  const terms = market ?? await readPositionMarket(client, deployment, blockNumber);
  if (!terms) throw new Error('The position pledge has no verified market.');
  return { ...terms, pairs: amount.toString(), released };
}
