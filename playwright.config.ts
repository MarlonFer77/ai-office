import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real stack (API + worker + web) in demo mode.
 * With E2E_START_SERVERS=1 Playwright starts the built apps itself (CI);
 * otherwise it reuses servers already running on :3000/:4000.
 */
const start = process.env.E2E_START_SERVERS === '1';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: start
    ? [
        {
          command: 'node --env-file-if-exists=../../.env dist/server.js',
          cwd: 'apps/api',
          url: 'http://localhost:4000/api/health',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'node --env-file-if-exists=../../.env dist/main.js',
          cwd: 'apps/worker',
          reuseExistingServer: true,
          timeout: 30_000,
          wait: { stdout: /worker started/ },
        },
        {
          command: 'pnpm start',
          cwd: 'apps/web',
          url: 'http://localhost:3000/login',
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ]
    : undefined,
});
