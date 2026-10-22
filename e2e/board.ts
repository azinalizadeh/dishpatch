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
  dietaryNeeds: string[] = [],
) {
  const res = await request.post(`/api/invites/${invitePath.split('/').pop()}/join`, {
    headers: { Origin: originOf(baseURL), 'X-Forwarded-For': clientIp() },
    data: { displayName: name, dietaryNeeds },
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
  await expect(page.getByText(/^Live/)).toBeVisible();
}

export const guestList = (page: Page) => page.getByRole('list', { name: "Who's coming" });

interface SlotSummary {
  id: string;
  category: string;
  claimedBy: { displayName: string } | null;
}

/** The board's slots in display order, read with a member's `request`. */
export async function boardSlots(request: APIRequestContext, eventId: string) {
  const res = await request.get(`/api/events/${eventId}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { slots: SlotSummary[] }).slots;
}

/** Claims `slotId` through the API as whoever's session `request` holds for the board. */
export async function claimSlot(
  request: APIRequestContext,
  baseURL: string | undefined,
  eventId: string,
  slotId: string,
  dishName: string,
  dishTags: string[] = [],
) {
  const res = await request.post(`/api/events/${eventId}/slots/${slotId}/claim`, {
    headers: { Origin: originOf(baseURL) },
    data: { dishName, dishTags },
  });
  expect(res.status()).toBe(200);
}

/** Releases `slotId` through the API. */
export async function releaseSlot(
  request: APIRequestContext,
  baseURL: string | undefined,
  eventId: string,
  slotId: string,
) {
  const res = await request.delete(`/api/events/${eventId}/slots/${slotId}/claim`, {
    headers: { Origin: originOf(baseURL) },
  });
  expect(res.status()).toBe(200);
}
