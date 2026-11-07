import type { Address } from 'viem';
import type { PositionPledge } from '@floor/shared';
import { verifyEvidence, type Evidence } from '../../../../services/underwriting/policy';
import { positionDisclosure, serializeAssessment, verifyPositionDisclosure, type PositionDisclosure } from '../../../../services/underwriting/position-assessment';
import { underwritingApi, type TraderLoan } from './trader-credit';

export type AssessmentChallenge = {
  challengeId: string;
  message: string;
  expiresAt: number;
  sha256: string;
  evidence: Evidence;
  position: PositionDisclosure | null;
};

export type PublicAssessment = {
  reference: string;
  sha256: string;
  bytes: number;
  evidence: Evidence;
  position: PositionDisclosure | null;
};

export async function prepareAssessmentRelease(id: bigint) {
  return underwritingApi<AssessmentChallenge>(`/assessment-challenge/${id}`);
}

export async function uploadConsentedAssessment(id: bigint, challengeId: string, signature: string) {
  return underwritingApi<PublicAssessment>(`/assessment-publication/${id}`, undefined, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, signature }),
  });
}

export async function retrieveAssessment(reference: string, sha256: string) {
  const params = new URLSearchParams({ sha256 });
  const report = await underwritingApi<PublicAssessment>(`/assessment/${encodeURIComponent(reference)}?${params}`);
  if (report.reference.toLowerCase() !== reference.toLowerCase()) {
    throw new Error('The retrieved Swarm reference differs from the requested report.');
  }
  const evidence = verifyEvidence(report.evidence);
  const position = report.position == null ? null : verifyPositionDisclosure(report.position);
  const bytes = new TextEncoder().encode(serializeAssessment(evidence, position));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (actualHash !== sha256.toLowerCase() || actualHash !== report.sha256.toLowerCase()) {
    throw new Error('Assessment file bytes do not match the Arkiv and Swarm SHA-256 commitment.');
  }
  if (bytes.byteLength !== report.bytes) throw new Error('Assessment file size does not match the retrieved report.');
  return { ...report, evidence, position };
}

export function assertPositionReport(
  position: PositionDisclosure | null, pledge: PositionPledge | null,
  context: { chainId: number; desk: Address; asset: Address; id: bigint }, loan: TraderLoan,
) {
  if (!pledge && !position) return;
  if (!pledge || !position || pledge.released
    || JSON.stringify(positionDisclosure(context, loan, pledge, position.source)) !== JSON.stringify(verifyPositionDisclosure(position))) {
    throw new Error('The assessment does not match the locked positions and loan terms.');
  }
}
