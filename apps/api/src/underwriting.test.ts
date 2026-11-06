import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY, lastCompleteMonth, offsetMonth } from '../../../services/underwriting/calendar.js';
import { evidenceBoundaries, evidenceFromHistories } from '../../../services/underwriting/policy.js';
import { parsePnlWindow } from '../../../services/underwriting/pnl-wire.js';
import { createUnderwritingApi } from './underwriting.js';

const saved = {
  url: process.env.SWARM_BEE_URL,
  batch: process.env.SWARM_POSTAGE_BATCH_ID,
  token: process.env.SWARM_BEE_API_TOKEN,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, value] of [
    ['SWARM_BEE_URL', saved.url],
    ['SWARM_POSTAGE_BATCH_ID', saved.batch],
    ['SWARM_BEE_API_TOKEN', saved.token],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it('serves the scoring window of an oversized P&L history with the same evidence digest', async () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const month = lastCompleteMonth();
  const [start, , , end] = evidenceBoundaries(month);
  const points = Array.from({ length: 751 }, (_, index) => ({
    timestamp: end + (index - 749) * DAY,
    source_block: index + 1,
    realized_market_pnl: index * 15 - (index % 11 === 0 ? 24 : 0),
    volume_usdc: index * 85,
    trade_count: index * 3,
    unused_fields: 'x'.repeat(600),
  }));
  const history = { proxy_wallet: wallet, fidelity: '1d', points };
  const upstream = JSON.stringify({ data: history });
  expect(Buffer.byteLength(upstream)).toBeGreaterThan(250_000);
  const fetch = vi.fn(async () => new Response(upstream, { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);

  const api = createUnderwritingApi();
  const response = await api.request('/pnl-window?wallet=' + wallet + '&month=' + month);
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(Buffer.byteLength(body)).toBeLessThan(25_000);
  const window = parsePnlWindow(JSON.parse(body), wallet, month);
  expect(window.points).toHaveLength((end - start) / DAY + 1);
  expect(window.points[0].timestamp).toBe(start);
  expect(window.points.at(-1)?.timestamp).toBe(end);
  expect(evidenceFromHistories([window], month)).toEqual(evidenceFromHistories([history], month));
  expect(() => parsePnlWindow({ ...window, month: offsetMonth(month, -1) }, wallet, month)).toThrow(/wallet and month/);

  expect((await api.request('/pnl-window?wallet=' + wallet + '&month=9999-12')).status).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(1);
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
