import { defineConfig } from '@playwright/test';

// Marketing checks need the web server only, never a funded chain or resolver.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'landing.spec.ts',
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3000', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm dev:web',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
