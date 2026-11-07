import { http, type Address } from 'viem';
import { createPublicClient, defineSchema } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, eq } from '@arkiv-network/sdk/query';
import { addr, str, u64 } from '@arkiv-network/sdk/schema';
import { CREDIT_PACKET_APP, type CreditPacket } from '../../../../services/underwriting/credit-packet';

export const creditPackets = defineSchema(CREDIT_PACKET_APP, {
  app: str().indexed(), lendingChain: u64().indexed(), desk: addr().indexed(), loanId: u64().indexed(),
  score: u64().indexed(), fundBy: u64().indexed(), asOf: u64(), evidence: str(), group: str(),
  reportRef: str(), reportHash: str(), pledge: str().optional(), principal: u64().optional(), maxDue: str().optional(),
});
const fields = {
  $key: true, $owner: true, loanId: true, score: true, fundBy: true, asOf: true, evidence: true, group: true,
  reportRef: true, reportHash: true, pledge: true, principal: true, maxDue: true,
} as const;

/** Public read only. Access keys are intentionally not included in wallet network configuration. */
export async function queryCreditPackets(chainId: number, desk: Address, id?: bigint, accessKey = '') {
  const client = createPublicClient({ chain: rabdi({ accessKey }), transport: http(undefined, { timeout: 10000, retryCount: 0 }) });
  const scope = and(eq('app', CREDIT_PACKET_APP), eq('lendingChain', u64(BigInt(chainId))), eq('desk', addr(desk)));
  const filter = id === undefined ? scope : and(scope, eq('loanId', u64(id)));
  const result = await client.select(fields).from(creditPackets).where(filter).limit(id === undefined ? 60 : 10).fetch();
  return result.entities;
}
export type ArkivPacket = Awaited<ReturnType<typeof queryCreditPackets>>[number];
export function plainCreditPacket(packet: ArkivPacket): CreditPacket {
  return {
    key: packet.$key, owner: packet.$owner, loanId: packet.loanId.value, score: packet.score.value,
    fundBy: packet.fundBy.value, asOf: packet.asOf.value, evidence: packet.evidence.value, group: packet.group.value,
    reportRef: packet.reportRef.value, reportHash: packet.reportHash.value, pledge: packet.pledge?.value,
    principal: packet.principal?.value, maxDue: packet.maxDue?.value,
  };
}
