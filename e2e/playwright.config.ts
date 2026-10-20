import { randomInt } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Every worker looks like its own client to the per-IP rate limits (5 boards/hour). The API only
// reads X-Forwarded-For when TRUST_PROXY=true, which docker-compose.ci.yml sets for E2E runs.
const clientIp = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** Runs against the full stack from `docker compose up -d --build --wait` (06-test-plan.md › E2E suite). */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'firefox-desktop',
      testMatch: /(realtime|reconnect)\.spec\.ts$/,
      use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
