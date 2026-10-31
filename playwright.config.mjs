import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  use: { baseURL: 'http://localhost:3211', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/serve.mjs', url: 'http://localhost:3211/api/session', reuseExistingServer: false, timeout: 15000 },
  reporter: 'list'
});
