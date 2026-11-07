import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoEvidence } from './demo-evidence';
import { serializeAssessment } from './position-assessment';
import { assessmentSha256, readAssessment, swarmConfigured, swarmStorageStatus, uploadAssessment } from './swarm';

const bee = vi.hoisted(() => ({ upload: vi.fn(), downloadReadable: vi.fn() }));
vi.mock('@ethersphere/bee-js', () => ({ Bee: class { file = bee; } }));
const evidence = demoEvidence('0x1111111111111111111111111111111111111111', '2026-09');
const reference = 'a'.repeat(64);
const bytes = new TextEncoder().encode(serializeAssessment(evidence, null));
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
function downloaded(data = bytes) {
  bee.downloadReadable.mockImplementation(async () => ({ data: new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SWARM_BEE_URL', 'http://127.0.0.1:1633');
  vi.stubEnv('SWARM_POSTAGE_BATCH_ID', 'b'.repeat(64));
  vi.stubEnv('SWARM_DEV_MODE', 'false');
  downloaded();
  bee.upload.mockResolvedValue({ reference: { toHex: () => reference } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Swarm report bytes', () => {
  it('uploads canonical bytes and verifies a fresh read-back before returning a pointer', async () => {
    const report = await uploadAssessment(evidence);
    expect(report).toMatchObject({ reference, sha256: assessmentSha256(evidence), bytes: bytes.length, evidence, position: null });
    expect(bee.upload.mock.calls[0][1]).toEqual(bytes);
    expect(bee.upload.mock.calls[0][3]).toMatchObject({ deferred: false, pin: true, contentType: 'application/json' });
    expect(bee.downloadReadable).toHaveBeenCalledWith(reference);
  });

  it('can read without upload postage and never hides upstream failure', async () => {
    vi.stubEnv('SWARM_POSTAGE_BATCH_ID', '');
    expect(swarmConfigured()).toBe(false);
    expect((await readAssessment(reference, sha(bytes))).evidence).toEqual(evidence);
    await expect(uploadAssessment(evidence)).rejects.toThrow(/postage/);
    expect(bee.upload).not.toHaveBeenCalled();
    bee.downloadReadable.mockRejectedValue(new Error('Bee unavailable'));
    await expect(readAssessment(reference, sha(bytes))).rejects.toThrow('Bee unavailable');
  });

  it('rejects changed read-back bytes and propagates upload errors', async () => {
    downloaded(new TextEncoder().encode('{}'));
    await expect(uploadAssessment(evidence)).rejects.toThrow(/read-back/);
    bee.upload.mockRejectedValue(new Error('Batch expired'));
    await expect(uploadAssessment(evidence)).rejects.toThrow('Batch expired');
  });

  it('rejects hash mismatches, invalid UTF-8, invalid JSON and altered assessments', async () => {
    await expect(readAssessment(reference, '0'.repeat(64))).rejects.toThrow(/SHA-256/);
    for (const invalid of [new Uint8Array([255]), new TextEncoder().encode('{')]) {
      downloaded(invalid);
      await expect(readAssessment(reference, sha(invalid))).rejects.toThrow(/UTF-8 JSON/);
    }
    const changed = JSON.parse(new TextDecoder().decode(bytes));
    changed.decision.score++;
    const tampered = new TextEncoder().encode(JSON.stringify(changed));
    downloaded(tampered);
    await expect(readAssessment(reference, sha(tampered))).rejects.toThrow(/recompute/);
  });

  it('rejects malformed or encrypted references and malformed hashes without fetching', async () => {
    await expect(readAssessment('a'.repeat(128), sha(bytes))).rejects.toThrow(/reference/);
    await expect(readAssessment(reference, 'bad')).rejects.toThrow(/SHA-256/);
    expect(bee.downloadReadable).not.toHaveBeenCalled();
  });

  it('cancels oversized streams at the size boundary', async () => {
    const cancel = vi.fn();
    bee.downloadReadable.mockResolvedValue({ data: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); }, cancel,
    }) });
    await expect(readAssessment(reference, sha(bytes))).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalled();
  });

  it('uses deferred uploads only for an explicitly local Bee dev node', async () => {
    vi.stubEnv('SWARM_DEV_MODE', 'true');
    await uploadAssessment(evidence);
    expect(bee.upload.mock.calls[0][3].deferred).toBe(true);
    vi.stubEnv('SWARM_BEE_URL', 'https://bee.example.org');
    await uploadAssessment(evidence);
    expect(bee.upload.mock.calls[1][3].deferred).toBe(false);
  });

  it('reports read and upload capability without leaking endpoint or credentials', async () => {
    vi.stubEnv('SWARM_BEE_API_TOKEN', 'secret');
    const fetch = vi.fn().mockResolvedValue(Response.json({ usable: true, exists: true }));
    vi.stubGlobal('fetch', fetch);
    const status = await swarmStorageStatus();
    expect(status).toEqual({ swarmConfigured: true, swarmReadConfigured: true, swarmReady: true, swarmMode: 'NETWORK_BEE' });
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(JSON.stringify(status)).not.toContain('1633');
    fetch.mockRejectedValue(new Error('offline'));
    expect((await swarmStorageStatus()).swarmReady).toBe(false);
  });
});
