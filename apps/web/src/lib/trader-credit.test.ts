import { afterEach, expect, it, vi } from 'vitest';
import { underwritingApi } from './trader-credit';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uses the position demo read service when the public API origin is absent', async () => {
  vi.stubEnv('NEXT_PUBLIC_FLOOR_API_URL', '');
  vi.stubGlobal('window', { location: new URL('http://127.0.0.1:3002/') });
  const fetch = vi.fn().mockResolvedValue(Response.json({ swarmReady: true }));
  vi.stubGlobal('fetch', fetch);

  await expect(underwritingApi('/storage-status')).resolves.toEqual({ swarmReady: true });
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8788/api/v1/underwriting/storage-status', expect.anything());
});

it('tries a hosted page’s same-origin API and handles an HTML response', async () => {
  vi.stubEnv('NEXT_PUBLIC_FLOOR_API_URL', '');
  vi.stubGlobal('window', { location: new URL('https://aqra.example/') });
  const fetch = vi.fn().mockResolvedValue(new Response('<html>Not found</html>', { status: 404 }));
  vi.stubGlobal('fetch', fetch);

  await expect(underwritingApi('/storage-status')).rejects.toThrow('AQRA’s data service is unavailable on this page.');
  expect(fetch).toHaveBeenCalledWith('/api/v1/underwriting/storage-status', expect.anything());
});
