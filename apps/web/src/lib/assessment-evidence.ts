import type { Address } from 'viem';
import { stringToHex } from 'viem';
import { serializeEvidence, verifyEvidence, type Evidence } from '../../../../services/underwriting/policy';
import { sameWallet, underwritingApi } from './trader-credit';

export type AssessmentChallenge = {
  challengeId: string;
  message: string;
  expiresAt: number;
  sha256: string;
  evidence: Evidence;
};

export type PublicAssessment = {
  reference: string;
  sha256: string;
  bytes: number;
  evidence: Evidence;
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
  const evidence = verifyEvidence(report.evidence);
  const bytes = new TextEncoder().encode(serializeEvidence(evidence));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actualHash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (actualHash !== sha256.toLowerCase() || actualHash !== report.sha256.toLowerCase()) {
    throw new Error('Assessment file bytes do not match the Arkiv and Swarm SHA-256 commitment.');
  }
  if (bytes.byteLength !== report.bytes) throw new Error('Assessment file size does not match the retrieved report.');
  return { ...report, evidence };
}

export async function requestBorrowerSignature(address: Address, message: string) {
  const provider = window.ethereum;
  if (!provider) throw new Error('Connect the borrower browser wallet to authorize public evidence storage.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
  if (!sameWallet(accounts[0], address)) throw new Error('Select the wallet that owns this loan request.');
  return provider.request({ method: 'personal_sign', params: [stringToHex(message), address] }) as Promise<string>;
}
