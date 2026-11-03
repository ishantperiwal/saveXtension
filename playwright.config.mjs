import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  // Existing layout regression fixtures exercise the compact grid. Feed defaults are covered separately.
  use: { storageState: { cookies: [], origins: [{ origin: 'http://localhost:3211', localStorage: [{ name: 'savex-card-view', value: 'grid' }] }] }, baseURL: 'http://localhost:3211', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/serve.mjs', url: 'http://localhost:3211/api/session', reuseExistingServer: false, timeout: 15000 },
  reporter: 'list'
});
