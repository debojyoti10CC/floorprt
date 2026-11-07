import type { Address, Hex } from 'viem';
import { CREDIT_PACKET_RETENTION, type CreditPacket, type CreditPacketLoan } from './credit-packet';
import { verifyEvidence, type Evidence } from './policy';
import { walletSetHash } from './reports';

export function assertAssessmentEvidence(evidence: Evidence, loan: CreditPacketLoan, wallets: readonly Address[]) {
  verifyEvidence(evidence);
  if (!evidence.decision.qualified || BigInt(evidence.asOf) !== loan.terms.asOf
    || evidence.digest.toLowerCase() !== loan.terms.evidenceDigest.toLowerCase()
    || evidence.decision.score !== loan.score
    || walletSetHash(evidence.wallets as Address[]).toLowerCase() !== loan.walletSetHash.toLowerCase()
    || evidence.wallets.length !== wallets.length
    || evidence.wallets.some((wallet, index) => wallet.toLowerCase() !== wallets[index]?.toLowerCase())) {
    throw new Error('The Swarm assessment does not match the onchain wallet group, cutoff, score and evidence digest.');
  }
}

/** Portable observation, not a certificate of source truth, availability or credit safety. */
export function storageProofBundle(input: {
  arkivChainId: number; lendingChainId: number; desk: Address; packet: CreditPacket;
  lendingBlock: bigint; lendingBlockHash: Hex; reportBytes: number; publicationTx?: Hex | null;
}) {
  return {
    schema: 'aqra.storage-proof/v1', observedAt: new Date().toISOString(),
    scope: input.arkivChainId === 7794095 ? 'RABDI_TESTNET' : 'LOCAL_DEVNET',
    arkiv: {
      chainId: input.arkivChainId, entityKey: input.packet.key, owner: input.packet.owner,
      publicationTx: input.publicationTx ?? null,
      // Policy expiry, not a claim about a currently observed entity TTL.
      expectedExpiresAt: (input.packet.fundBy + CREDIT_PACKET_RETENTION).toString(),
    },
    lending: { chainId: input.lendingChainId, desk: input.desk, loanId: input.packet.loanId.toString(),
      block: input.lendingBlock.toString(), blockHash: input.lendingBlockHash },
    swarm: { reference: input.packet.reportRef.toLowerCase(), sha256: input.packet.reportHash.toLowerCase(), bytes: input.reportBytes },
    evidenceDigest: input.packet.evidence, walletSetHash: input.packet.group,
    limits: 'Point-in-time read verification only. Not an audit, a repayment guarantee, a public lending-chain deployment receipt or proof of event eligibility.',
  };
}
