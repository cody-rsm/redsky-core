import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a running RedSky in demo data mode with development sign-in. They need a RedSky
// database (REDSKY_DATABASE_URL) and never touch Twenty.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: { baseURL, trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: { REDSKY_DATA_MODE: 'demo', AUTH_DEV_ENABLED: 'true' },
      },
});
