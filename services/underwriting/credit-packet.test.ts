import { describe, expect, it } from 'vitest';
import { positionPledgeHash, type PositionPledge } from '../../packages/shared/src/position-collateral';
import { CREDIT_PACKET_RETENTION, creditPacketMatches, type CreditPacket, type CreditPacketLoan } from './credit-packet';
import { demoEvidence } from './demo-evidence';
import { walletSetHash } from './reports';
import { assertAssessmentEvidence, storageProofBundle } from './storage-proof';

const borrower = '0x1111111111111111111111111111111111111111';
const evidence = demoEvidence(borrower, '2026-09');
const loan: CreditPacketLoan = {
  borrower, state: 1, score: evidence.decision.score, fundBy: 2000n, walletSetHash: walletSetHash([borrower]),
  terms: { principal: 100_000_000n, due: 102_000_000n, bond: 25_000_000n, asOf: BigInt(evidence.asOf), evidenceDigest: evidence.digest },
};
const packet: CreditPacket = {
  key: `0x${'a'.repeat(64)}`, owner: borrower, loanId: 1n, score: BigInt(loan.score), fundBy: loan.fundBy,
  asOf: loan.terms.asOf, evidence: evidence.digest, group: loan.walletSetHash,
  reportRef: 'b'.repeat(64), reportHash: 'c'.repeat(64),
};
const commitment = { hash: `0x${packet.reportHash}` as const, reference: `0x${packet.reportRef}` as const };
const matches = (p = packet, l = loan, now = 1999n) => creditPacketMatches(p, 1n, l, now, null, commitment);

describe('untrusted Arkiv credit discovery', () => {
  it('accepts only an exact attested request before its deadline', () => {
    expect(matches()).toBe(true);
    expect(matches(packet, loan, 2000n)).toBe(false);
    expect(matches(packet, loan, 2001n)).toBe(false);
    expect(creditPacketMatches(packet, 2n, loan, 1999n, null, commitment)).toBe(false);
    expect(creditPacketMatches(packet, 0n, loan, 1999n)).toBe(false);
    for (const state of [0, 2, 3, 4, 5]) expect(matches(packet, { ...loan, state })).toBe(false);
    expect(matches(packet, { ...loan, score: 59 })).toBe(false);
  });

  it.each([
    ['owner', '0x2222222222222222222222222222222222222222'], ['loanId', 2n], ['score', 0n],
    ['fundBy', 2001n], ['asOf', 1n], ['evidence', '0x' + '0'.repeat(64)], ['group', '0x' + '0'.repeat(64)],
    ['reportHash', '0'.repeat(64)], ['reportRef', '0'.repeat(64)], ['reportRef', 'a'.repeat(128)],
    ['reportHash', 'not-a-hash'], ['pledge', 'unexpected'], ['principal', 1n], ['maxDue', '1'],
  ])('rejects mismatched %s', (field, value) => {
    expect(matches({ ...packet, [field]: value })).toBe(false);
  });

  it('requires the locked pledge, principal and integer debt cap for position listings', () => {
    const pledge: PositionPledge = {
      ledger: borrower, conditionId: `0x${'d'.repeat(64)}`, yesTokenId: '1', noTokenId: '2', pairs: '120000000', released: false,
    };
    const positioned = { ...packet, pledge: positionPledgeHash(pledge), principal: loan.terms.principal, maxDue: '116000000' };
    expect(creditPacketMatches(positioned, 1n, loan, 1999n, pledge, commitment)).toBe(true);
    expect(creditPacketMatches(packet, 1n, loan, 1999n, pledge, commitment)).toBe(false);
    expect(creditPacketMatches(positioned, 1n, loan, 1999n, { ...pledge, released: true }, commitment)).toBe(false);
    expect(creditPacketMatches({ ...positioned, maxDue: '116000001' }, 1n, loan, 1999n, pledge, commitment)).toBe(false);
    expect(creditPacketMatches({ ...positioned, principal: 1n }, 1n, loan, 1999n, pledge, commitment)).toBe(false);
  });
});

it('recomputes assessment inputs and compares the current wallet group', () => {
  expect(() => assertAssessmentEvidence(evidence, loan, [borrower])).not.toThrow();
  expect(() => assertAssessmentEvidence(evidence, loan, [])).toThrow(/wallet group/);
  expect(() => assertAssessmentEvidence(evidence, { ...loan, score: 0 }, [borrower])).toThrow(/score/);
  expect(() => assertAssessmentEvidence({ ...evidence, decision: { ...evidence.decision, score: 1 } }, loan, [borrower])).toThrow();
});

it('exports exact integers and never labels local reads as public receipts', () => {
  const input = { arkivChainId: 1337, lendingChainId: 31337, desk: borrower, packet,
    lendingBlock: 9007199254740993n, lendingBlockHash: evidence.digest, reportBytes: 100 } as const;
  const proof = storageProofBundle(input);
  expect(proof.scope).toBe('LOCAL_DEVNET');
  expect(proof.arkiv.publicationTx).toBeNull();
  expect(proof.arkiv.expectedExpiresAt).toBe((loan.fundBy + CREDIT_PACKET_RETENTION).toString());
  expect(proof.lending.block).toBe('9007199254740993');
  expect(() => JSON.stringify(proof)).not.toThrow();
  expect(storageProofBundle({ ...input, arkivChainId: 7794095 }).scope).toBe('RABDI_TESTNET');
});
