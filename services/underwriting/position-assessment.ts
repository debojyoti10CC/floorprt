import { z } from 'zod';
import type { Address, Hex } from 'viem';
import { positionPledgeHash, type PositionPledge } from '../../packages/shared/src/position-collateral';
import { quotePositionCredit } from '../../packages/shared/src/position-credit';
import { serializeEvidence, verifyEvidence, type Evidence } from './policy';

const address = z.string().regex(/^0x[0-9a-f]{40}$/i).transform(value => value.toLowerCase() as Address);
const hash = z.string().regex(/^0x[0-9a-f]{64}$/i).transform(value => value.toLowerCase() as Hex);
const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/);
const amount = uint.refine(value => BigInt(value) < 2n ** 96n);
const disclosure = z.object({
  source: z.enum(['POLYMARKET', 'LOCAL_FIXTURE']),
  chainId: z.literal(31337),
  desk: address,
  loanId: uint,
  borrower: address,
  asset: address,
  ledger: address,
  conditionId: hash,
  yesTokenId: uint,
  noTokenId: uint,
  pairs: amount,
  principal: amount,
  due: amount,
  bond: amount,
  termSeconds: z.number().int().min(86400).max(30 * 86400),
  fundBy: uint,
  gross: uint,
  maxDue: uint,
  pledgeHash: hash,
}).refine(value => {
  const principal = BigInt(value.principal);
  const due = BigInt(value.due);
  const bond = BigInt(value.bond);
  const pairs = BigInt(value.pairs);
  const quote = quotePositionCredit(principal, due, bond, pairs);
  return pairs > 0n && principal > 0n && due >= principal && due <= quote.maxDue
    && quote.gross.toString() === value.gross && quote.maxDue.toString() === value.maxDue
    && positionPledgeHash(value) === value.pledgeHash;
}, 'Position report terms do not match the collateral policy.');

export type PositionDisclosure = z.infer<typeof disclosure>;
export const verifyPositionDisclosure = (value: unknown) => disclosure.parse(value);

export function positionDisclosure(
  context: { chainId: number; desk: Address; asset: Address; id: bigint },
  loan: { borrower: Address; fundBy: bigint; terms: { principal: bigint; due: bigint; bond: bigint; termSeconds: number } },
  pledge: PositionPledge,
  source: PositionDisclosure['source'],
): PositionDisclosure {
  const { principal, due, bond, termSeconds } = loan.terms;
  const quote = quotePositionCredit(principal, due, bond, BigInt(pledge.pairs));
  return verifyPositionDisclosure({
    source, chainId: context.chainId, desk: context.desk, loanId: context.id.toString(), borrower: loan.borrower,
    asset: context.asset, ...pledge, principal: principal.toString(), due: due.toString(), bond: bond.toString(),
    termSeconds, fundBy: loan.fundBy.toString(), gross: quote.gross.toString(), maxDue: quote.maxDue.toString(),
    pledgeHash: positionPledgeHash(pledge),
  });
}

const positionReportSchema = 'aqra.position-assessment/v1';
export function serializeAssessment(evidence: Evidence, position: PositionDisclosure | null) {
  const report = serializeEvidence(verifyEvidence(evidence));
  if (!position) return report;
  return JSON.stringify({
    schema: positionReportSchema, evidence: JSON.parse(report), position: verifyPositionDisclosure(position),
  });
}

export function verifyAssessment(value: unknown): { evidence: Evidence; position: PositionDisclosure | null } {
  if (value && typeof value === 'object' && 'schema' in value && value.schema === positionReportSchema) {
    const report = z.object({ evidence: z.unknown(), position: disclosure }).parse(value);
    return { evidence: verifyEvidence(report.evidence), position: report.position };
  }
  return { evidence: verifyEvidence(value), position: null };
}
