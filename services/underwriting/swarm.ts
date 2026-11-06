import { createHash } from 'node:crypto';
import { Bee } from '@ethersphere/bee-js';
import { serializeEvidence, verifyEvidence, type Evidence } from './policy.js';

const MAX_REPORT_BYTES = 256 * 1024;
const referencePattern = /^[0-9a-f]{64}$/i;
const hashPattern = /^[0-9a-f]{64}$/i;

export type SwarmAssessment = {
  reference: string;
  sha256: string;
  bytes: number;
  evidence: Evidence;
};

export const assessmentSha256 = (evidence: Evidence) =>
  createHash('sha256').update(serializeEvidence(verifyEvidence(evidence))).digest('hex');

export function swarmConfigured() {
  return Boolean(process.env.SWARM_BEE_URL?.trim() && process.env.SWARM_POSTAGE_BATCH_ID?.trim());
}

function beeClient() {
  const url = process.env.SWARM_BEE_URL?.trim();
  if (!url) throw new Error('Swarm storage is not configured: set SWARM_BEE_URL.');
  const token = process.env.SWARM_BEE_API_TOKEN?.trim();
  return new Bee(url, {
    timeout: 20_000,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

async function downloadBytes(reference: string): Promise<Uint8Array> {
  if (!referencePattern.test(reference)) throw new Error('Invalid Swarm report reference.');
  const reader = (await beeClient().file.downloadReadable(reference)).data.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REPORT_BYTES) {
        await reader.cancel();
        throw new Error('Swarm report exceeds the AQRA size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

function verifyBytes(bytes: Uint8Array, expectedHash: string): Evidence {
  if (!hashPattern.test(expectedHash) || sha256(bytes) !== expectedHash.toLowerCase()) {
    throw new Error('Swarm report bytes do not match the published SHA-256 hash.');
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('Swarm report is not valid UTF-8 JSON.');
  }
  return verifyEvidence(value);
}

export async function uploadAssessment(value: unknown): Promise<SwarmAssessment> {
  const batch = process.env.SWARM_POSTAGE_BATCH_ID?.trim();
  if (!batch) throw new Error('Swarm storage is not configured: set SWARM_POSTAGE_BATCH_ID.');
  const evidence = verifyEvidence(value);
  const bytes = new TextEncoder().encode(serializeEvidence(evidence));
  if (bytes.byteLength > MAX_REPORT_BYTES) throw new Error('Assessment report exceeds the AQRA size limit.');
  const result = await beeClient().file.upload(batch, bytes, `aqra-assessment-${evidence.digest.slice(2, 14)}.json`, {
    contentType: 'application/json',
    deferred: false,
    pin: true,
  });
  const reference = result.reference.toHex();
  const expectedHash = sha256(bytes);
  const retrieved = await downloadBytes(reference);
  if (sha256(retrieved) !== expectedHash || retrieved.length !== bytes.length) {
    throw new Error('Swarm upload completed, but the read-back did not match the submitted report.');
  }
  const verified = verifyBytes(retrieved, expectedHash);
  if (verified.digest.toLowerCase() !== evidence.digest.toLowerCase()) {
    throw new Error('Swarm read-back returned a different evidence digest.');
  }
  return { reference, sha256: expectedHash, bytes: bytes.byteLength, evidence: verified };
}

export async function readAssessment(reference: string, expectedHash: string): Promise<SwarmAssessment> {
  const bytes = await downloadBytes(reference);
  const evidence = verifyBytes(bytes, expectedHash);
  return { reference, sha256: expectedHash.toLowerCase(), bytes: bytes.byteLength, evidence };
}
