import { afterEach, describe, expect, it } from 'vitest';
import { createUnderwritingApi } from './underwriting.js';

const saved = {
  url: process.env.SWARM_BEE_URL,
  batch: process.env.SWARM_POSTAGE_BATCH_ID,
  token: process.env.SWARM_BEE_API_TOKEN,
};

afterEach(() => {
  for (const [key, value] of [
    ['SWARM_BEE_URL', saved.url],
    ['SWARM_POSTAGE_BATCH_ID', saved.batch],
    ['SWARM_BEE_API_TOKEN', saved.token],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Swarm assessment API', () => {
  it('reports missing configuration without exposing server details', async () => {
    delete process.env.SWARM_BEE_URL;
    delete process.env.SWARM_POSTAGE_BATCH_ID;
    process.env.SWARM_BEE_API_TOKEN = 'must-not-leak';
    const api = createUnderwritingApi();
    const response = await api.request('/storage-status');
    const result = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(result.swarmConfigured).toBe(false);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    const publish = await api.request('/assessment/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?sha256=' + '0'.repeat(64));
    expect(publish.status).toBe(503);
  });

  it('rejects malformed Swarm references before making a Bee request', async () => {
    process.env.SWARM_BEE_URL = 'http://127.0.0.1:1';
    process.env.SWARM_POSTAGE_BATCH_ID = 'configured-test-batch';
    const api = createUnderwritingApi();
    const response = await api.request('/assessment/not-a-reference?sha256=' + '0'.repeat(64));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Invalid Swarm report reference.' });
  });
});
