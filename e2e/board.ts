import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { clientIp, expect } from './fixtures.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export const originOf = (baseURL: string | undefined) =>
  new URL(baseURL ?? 'http://localhost:3000').origin;

/**
 * Creates a board through the public API with `request` (whose cookie jar then holds the host
 * session) and returns its id and invite path.
 */
export async function createBoard(request: APIRequestContext, baseURL: string | undefined) {
  const res = await request.post('/api/events', {
    headers: { Origin: originOf(baseURL) },
    data: {
      title: "Friendsgiving at Mina's",
      startsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      location: "Mina's flat, 3rd floor",
      hostName: 'Mina',
      hostDietaryNeeds: [],
      slots: [
        { category: 'main', count: 3 },
        { category: 'dessert', count: 2 },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const { eventId, inviteUrl } = (await res.json()) as { eventId: string; inviteUrl: string };
  return { eventId, invitePath: new URL(inviteUrl).pathname };
}

/** Joins as `name` with `request`; each join looks like a new client IP (10 joins/min/IP). */
export async function joinBoard(
  request: APIRequestContext,
  baseURL: string | undefined,
  invitePath: string,
  name: string,
) {
  const res = await request.post(`/api/invites/${invitePath.split('/').pop()}/join`, {
    headers: { Origin: originOf(baseURL), 'X-Forwarded-For': clientIp() },
    data: { displayName: name, dietaryNeeds: [] },
  });
  expect(res.status()).toBe(201);
}

/** A fresh browser context (its own cookies), as a second person's device. */
export async function newPerson(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp() },
  });
  return { context, page: await context.newPage() };
}

/** The board page, once its stream is live. */
export async function openLiveBoard(page: Page, eventId: string) {
  await page.goto(`/events/${eventId}`);
  await expect(page.getByRole('status').filter({ hasText: /^Live/ })).toBeVisible();
}

export const guestList = (page: Page) => page.getByRole('list', { name: "Who's coming" });
