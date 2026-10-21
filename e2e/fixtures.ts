import { randomInt } from 'node:crypto';
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** A fresh private client IP, so each test gets its own per-IP rate-limit budget (5 boards/hour). */
export function clientIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/**
 * Every test looks like a different client to the API's per-IP limits. The API only reads
 * X-Forwarded-For when TRUST_PROXY=true, which docker-compose.ci.yml sets for E2E runs.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ browserName: _ }, use) => {
    await use({ 'X-Forwarded-For': clientIp() });
  },
});
