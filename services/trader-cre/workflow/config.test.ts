import { describe, expect, it } from 'vitest';
import { configSchema } from './config';

const desk = '0x1111111111111111111111111111111111111111';
const keeper = '0x2222222222222222222222222222222222222222';
describe('CRE delivery boundaries', () => {
  it('requires explicit Arc simulation and never enables DON delivery to the test relay', () => {
    expect(configSchema.parse({ desk, chainId: 5042002, arcSimulation: true, keeper }).arcSimulation).toBe(true);
    expect(() => configSchema.parse({ desk, chainId: 5042002, pnlApiUrl: 'https://aqra.example' })).toThrow(/simulation only/);
    expect(() => configSchema.parse({ desk, chainId: 11155111, arcSimulation: true })).toThrow();
  });
  it('keeps historical replay out of public DON configs', () => {
    expect(configSchema.safeParse({ desk, chainId: 5042002, arcSimulation: true, keeper, replayAt: 1793974817, replayRelayPort: 1234 }).success).toBe(true);
    expect(configSchema.safeParse({ desk, chainId: 31337, keeper, replayAt: 1793974817 }).success).toBe(true);
    for (const config of [
      { desk, chainId: 11155111, keeper, replayAt: 1793974817, pnlApiUrl: 'https://aqra.example' },
      { desk, chainId: 5042002, arcSimulation: true, replayAt: 1793974817 },
      { desk, chainId: 31337, replayRelayPort: 1234 },
    ]) expect(configSchema.safeParse(config).success).toBe(false);
  });
  it('requires HTTPS for public intake and rejects unsupported chains', () => {
    expect(configSchema.safeParse({ desk, chainId: 11155111, pnlApiUrl: 'https://aqra.example' }).success).toBe(true);
    expect(configSchema.safeParse({ desk, chainId: 11155111, pnlApiUrl: 'http://127.0.0.1:8787' }).success).toBe(false);
    expect(configSchema.safeParse({ desk, chainId: 1 }).success).toBe(false);
  });
});
