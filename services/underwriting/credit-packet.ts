import type { Address, Hex } from 'viem';
import { positionPledgeHash, type PositionPledge } from '../../packages/shared/src/position-collateral';
import { quotePositionCredit } from '../../packages/shared/src/position-credit';

export const CREDIT_PACKET_APP = 'aqra.trader.credit.v2';
export const CREDIT_PACKET_RETENTION = 90n * 24n * 60n * 60n;
export type CreditPacketLoan = {
  borrower: Address; state: number; score: number; fundBy: bigint; walletSetHash: Hex;
  terms: { principal: bigint; due: bigint; bond: bigint; asOf: bigint; evidenceDigest: Hex };
};
export type CreditPacket = {
  key: Hex; owner: Address; loanId: bigint; score: bigint; fundBy: bigint; asOf: bigint;
  evidence: string; group: string; reportRef: string; reportHash: string;
  pledge?: string; principal?: bigint; maxDue?: string;
};
export type AssessmentCommitment = { hash: Hex; reference: Hex };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Discovery is untrusted. The caller must supply the loan ID and current chain state. */
export function creditPacketMatches(
  packet: CreditPacket, id: bigint, loan: CreditPacketLoan, now: bigint,
  pledge: PositionPledge | null = null, commitment?: AssessmentCommitment,
) {
  const positionMatches = pledge
    ? !pledge.released && same(packet.pledge ?? '', positionPledgeHash(pledge))
      && packet.principal === loan.terms.principal
      && packet.maxDue === quotePositionCredit(loan.terms.principal, loan.terms.due, loan.terms.bond, BigInt(pledge.pairs)).maxDue.toString()
    : packet.pledge === undefined && packet.principal === undefined && packet.maxDue === undefined;
  return id > 0n && packet.loanId === id && loan.state === 1 && loan.score >= 60 && loan.fundBy > now && positionMatches
    && same(packet.owner, loan.borrower) && packet.score === BigInt(loan.score)
    && packet.fundBy === loan.fundBy && packet.asOf === loan.terms.asOf
    && same(packet.evidence, loan.terms.evidenceDigest) && same(packet.group, loan.walletSetHash)
    // Encrypted Swarm references embed keys and must never enter public entities.
    && /^[0-9a-f]{64}$/i.test(packet.reportRef) && /^[0-9a-f]{64}$/i.test(packet.reportHash)
    && (!commitment || same(commitment.hash, '0x' + packet.reportHash) && same(commitment.reference, '0x' + packet.reportRef));
}
