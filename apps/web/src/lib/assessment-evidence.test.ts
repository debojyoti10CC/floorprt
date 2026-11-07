import { createHash, webcrypto } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { demoEvidence } from '../../../../services/underwriting/demo-evidence';
import { serializeAssessment } from '../../../../services/underwriting/position-assessment';
import { retrieveAssessment } from './assessment-evidence';

const api = vi.hoisted(() => vi.fn());
vi.mock('./trader-credit', () => ({ underwritingApi: api }));
const evidence = demoEvidence('0x1111111111111111111111111111111111111111', '2026-09');
const bytes = new TextEncoder().encode(serializeAssessment(evidence, null));
const reference = 'a'.repeat(64);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const report = { evidence, position: null, reference, sha256, bytes: bytes.length };
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

it('independently recomputes the browser report hash and size', async () => {
  vi.stubGlobal('crypto', webcrypto);
  api.mockResolvedValue(report);
  expect(await retrieveAssessment(reference, sha256)).toEqual(report);
});
it.each([
  { reference: 'b'.repeat(64) }, { sha256: '0'.repeat(64) }, { bytes: bytes.length + 1 },
])('rejects an API report with mismatched metadata: %j', async patch => {
  vi.stubGlobal('crypto', webcrypto);
  api.mockResolvedValue({ ...report, ...patch });
  await expect(retrieveAssessment(reference, sha256)).rejects.toThrow(/reference|SHA-256|size/);
});
