# 01 · Product — Dishpatch

> Role: Product Owner. Every story maps to a feature (F-id), a flow (02-user-flows.md) and a screen (design/screens/*.png).

## Problem statement

Potlucks are organised in group chats. Within an hour the thread has 140 messages, three people are bringing hummus, nobody is bringing drinks, and the one vegan guest learns at the door that the only thing she can eat is bread. Spreadsheets and sign-up sites fix part of this, but they make guests create accounts, they only refresh when you reload, and they treat dietary needs as free-text notes that nobody adds up.

**Dishpatch** is a live potluck board. The host creates a board with slots (3 mains, 3 sides…), shares one link, and guests claim slots in real time without an account. Two people can never claim the same slot, and the board shows which dietary needs are still uncovered ("2 vegan guests, no vegan main yet").

## Personas

### Mina — the host
- 31, product designer, hosts Friendsgiving and a summer barbecue every year for 8–15 friends.
- **Goals:** set up a board in under a minute from her phone; get a balanced menu without chasing people; lock the list a few days before so she can plan oven time.
- **Frustrations:** duplicate dishes; "I'll bring something!" with no follow-up; sign-up sites that email her guests; losing the admin link of last year's sheet.

### Priya — the guest with dietary needs
- 28, nurse on rotating shifts, vegan, opens links from WhatsApp on her phone between shifts.
- **Goals:** join in 10 seconds, see what's still needed, know whether there will be something she can eat.
- **Frustrations:** having to make an account for a one-off party; asking "is anything vegan?" in the chat and feeling like a burden; claiming a dish on a stale page and finding out later someone else had it.

## Goals

1. A host can go from landing page to a shareable board in ≤ 60 seconds.
2. Guests join with a name only (no email, no password, no account).
3. Every viewer sees claims within 1 second, with no page reload.
4. Two guests claiming the same slot at the same moment: exactly one wins, the other is told clearly and can pick another slot.
5. The board makes dietary gaps visible before the party, not at the door.

## Non-goals (out of scope for MVP)

- User accounts, email/password login, OAuth, or magic links by email.
- Email/SMS reminders, calendar invites, notifications of any kind.
- Recipes, photos of dishes, comments or chat on the board.
- Multiple hosts / co-host roles (one host participant per board).
- Quantities ("enough for 8"), allergen severity levels, or ingredient lists.
- Horizontal scaling of the real-time layer (single API instance; the event bus interface is ready for Postgres LISTEN/NOTIFY later).
- Native mobile apps (responsive web only).
- Localisation (English only; dates shown in the viewer's locale/time zone).

## Features

| ID | Feature | Value statement |
|---|---|---|
| F1 | Create a board | A host gets a ready-to-share board with categorised slots and two links (guest invite + private host link) in one step. |
| F2 | Join as a guest | Guests join from the invite link with a display name and optional dietary needs, no account. |
| F3 | Live board | Everyone sees claims, releases and new guests appear instantly, with a clear live/reconnecting indicator and gap-free catch-up after a drop. |
| F4 | Claim & release a slot | A guest claims an open slot with a dish name and dietary tags; concurrent claims on one slot resolve to exactly one winner. |
| F5 | Dietary coverage | The board compares guests' needs with the dishes' tags and flags gaps ("no vegan main yet") and hints which open slot would fix them. |
| F6 | Host controls | The host can lock the board, remove a claim, add/remove empty slots, rotate the invite link and delete the board. |

## User stories

Priority uses MoSCoW (M = Must, S = Should, C = Could). Acceptance criteria are Given/When/Then.

### US-01 · Create a board (F1) — **M**
As a **host**, I want to create a board with a title, date/time, optional location and a number of slots per category, so that guests know exactly what's needed.
- **Given** I'm on the create screen **When** I enter a title (1–80 chars), a future date/time, my name, and at least 1 slot in total **And** press "Create board" **Then** the board is created and I land on the share screen with a guest invite link and a host link.
- **Given** the date is in the past or my name is empty **When** I press "Create board" **Then** I see inline errors on those fields and a summary banner, and nothing is created.
- **Given** I've created 5 boards in the last hour from the same IP **When** I try a 6th **Then** I see "You've made a lot of boards — try again in a bit" (HTTP 429).

### US-02 · Keep a private host link (F1) — **S**
As a **host**, I want a private host link I can open on another device, so that I can manage the board from my phone too.
- **Given** I just created a board **When** the share screen loads **Then** it shows the host link once, a "Copy" button, and a warning that it won't be shown again.
- **Given** I open the host link on another browser **When** the page loads **Then** I'm signed in as the host of that board and the token is removed from the address bar.
- **Given** a host link with a wrong token **When** it's opened **Then** I see the not-found screen and no information about whether the board exists.

### US-03 · Join without an account (F2) — **M**
As a **guest**, I want to join from the invite link with just a display name, so that I don't have to create an account for one party.
- **Given** a valid invite link **When** I open it **Then** I see the event title, date, location, host name and number of guests, and a name field.
- **Given** I enter a name of 1–40 characters that isn't taken on this board (case-insensitive) **When** I press "Join the board" **Then** I land on the live board as a participant, and returning later on the same browser takes me straight to the board.
- **Given** the name "Sam" is already on the board **When** I try to join as "sam" **Then** I see "Someone called Sam is already here — add an initial?" and stay on the form.
- **Given** the link was rotated or the event has expired **When** I open it **Then** the API answers 404 `INVITE_INVALID` and I see the join error screen ("This invite link doesn't work anymore").

### US-04 · Share my dietary needs (F2) — **M**
As a **guest**, I want to say what I can't eat, so that the group can plan around it.
- **Given** the join form **When** I toggle any of Vegetarian, Vegan, Gluten-free, Dairy-free, Nut-free, Halal **Then** the chips show a pressed state (aria-pressed="true") and my needs are saved with my participant.
- **Given** I chose no needs **When** I join **Then** I don't count towards any coverage meter.

### US-05 · See changes live (F3) — **M**
As a **guest**, I want the board to update without refreshing, so that I always see what's still open.
- **Given** two browsers on the same board **When** one claims a slot **Then** the other shows the claimed card within 1 second (p95, local) without reload, and the header count updates ("7 of 12 claimed").
- **Given** a new guest joins **When** the join completes **Then** every viewer's "Who's coming" list and coverage meter update.
- **Given** a viewer count of N open connections **When** someone opens or closes the board **Then** the "Live · N here" indicator updates within 5 seconds.

### US-06 · Know when I'm offline (F3) — **S**
As a **guest**, I want to see when my connection drops, so that I don't act on stale data.
- **Given** the live connection drops **When** 2 seconds pass without reconnecting **Then** a "Connection lost. Reconnecting…" banner appears, the header shows "Reconnecting…", and open slots show "Paused" and can't be claimed.
- **Given** I reconnect **When** I missed events in between **Then** the board replays the missed events in order (via Last-Event-ID) and the banner disappears; if the gap is too old, the board reloads its snapshot instead.

### US-07 · Claim a slot (F4) — **M**
As a **guest**, I want to claim an open slot with my dish name and what it's suitable for, so that nobody duplicates it.
- **Given** an open slot on an unlocked board **When** I tap it, enter a dish name (1–60 chars), pick tags and press "Claim slot" **Then** the card shows my dish immediately (optimistic), and stays after the server confirms.
- **Given** I already hold 3 claims on this board **When** I try a 4th **Then** I see "You're already bringing 3 dishes — release one to claim another".

### US-08 · Lose a race gracefully (F4) — **M**
As a **guest**, when someone else claims the same slot a moment before me, I want a clear message, so that I can choose another slot.
- **Given** two guests submit a claim on the same open slot at the same time **When** the server processes both **Then** exactly one claim is stored, the winner sees their card, and the other sees the claim dialog error "Jonah just claimed this slot…" with their optimistic card rolled back.
- **Given** 50 concurrent claim requests on one slot (integration test) **When** they all complete **Then** exactly 1 returns 200 and 49 return 409 `SLOT_TAKEN`.

### US-09 · Release my claim (F4) — **M**
As a **guest**, I want to release my claim, so that someone else can take the slot if my plans change.
- **Given** a slot I claimed on an unlocked board **When** I press its ✕ button and confirm **Then** the slot becomes open for everyone.
- **Given** a slot claimed by someone else **When** I call release on it (e.g. a crafted request) **Then** I get 403 `NOT_OWNER` and nothing changes.

### US-10 · See dietary coverage (F5) — **M**
As a **guest with dietary needs**, I want to see if something I can eat is coming, so that I can plan (or bring it myself).
- **Given** 2 vegan guests and claimed dishes tagged Vegan only in sides/salads **When** I view the coverage panel **Then** Vegan shows status "Thin — No vegan main yet".
- **Given** 1 nut-free guest and no dish tagged Nut-free **When** I view coverage **Then** Nut-free shows status "Gap — Nothing yet".
- **Given** a dish tagged Vegan **When** coverage is computed **Then** it also counts as Vegetarian and Dairy-free.
- **Given** nobody listed dietary needs **When** I open the coverage screen **Then** I see the empty state "No one has listed dietary needs yet".

### US-11 · Get a hint on what to bring (F5) — **C**
As a **guest choosing a slot**, I want a hint about which gap I could fill, so that the meal works for everyone.
- **Given** the highest-priority uncovered need is Vegan with status Thin **When** I look at open Main slots **Then** they show the chip "Vegan would help"; other categories show no hint.
- **Given** the top need has status Gap **When** I look at the board **Then** every open slot shows the hint for that need.

### US-12 · Lock the board (F6) — **S**
As a **host**, I want to lock the board, so that the list is final before I go shopping.
- **Given** I'm the host **When** I switch "Lock the board" on **Then** every viewer sees the locked banner, open slots show "Closed", and claim/release requests return 423 `BOARD_LOCKED`.
- **Given** I'm a guest **When** I call the lock endpoint **Then** I get 403 `HOST_ONLY`.

### US-13 · Fix mistakes and leaks (F6) — **S**
As a **host**, I want to remove someone's claim, change slot counts and rotate the invite link, so that I can handle mistakes or a link posted in the wrong chat.
- **Given** I'm the host **When** I remove a claim **Then** the slot becomes open for everyone and the claimant sees it disappear live.
- **Given** I'm the host **When** I press "New link" **Then** a new invite link is shown, the old link shows the join error screen, and people who already joined keep access.
- **Given** a slot is claimed **When** I try to remove that slot **Then** I see "Remove the claim first" (409 `SLOT_CLAIMED`).

### US-14 · Delete the board (F6) — **M**
As a **host**, I want to delete the board and everyone's data, so that nothing lingers after the party.
- **Given** I'm the host on the delete dialog **When** I type the exact event name and press "Delete for everyone" **Then** the board, slots, participants, sessions and event log rows are deleted, and every connected viewer is sent to the not-found screen.
- **Given** a board whose event date was more than 14 days ago **When** the hourly cleanup job runs **Then** the board and all its data are deleted.

## Story → feature map

| Story | Feature | Flow (02) | Screens |
|---|---|---|---|
| US-01 | F1 | Flow A | create, share |
| US-02 | F1 | Flow A, Flow G | share, board, notfound |
| US-03 | F2 | Flow B | join, board |
| US-04 | F2 | Flow B | join |
| US-05 | F3 | Flow C | board |
| US-06 | F3 | Flow C | board (offline) |
| US-07 | F4 | Flow D | board, claim |
| US-08 | F4 | Flow D | claim (error), board (conflict) |
| US-09 | F4 | Flow E | board |
| US-10 | F5 | Flow C, Flow D | board (sidebar), coverage |
| US-11 | F5 | Flow D | board |
| US-12 | F6 | Flow F | host, board (locked) |
| US-13 | F6 | Flow F | host |
| US-14 | F6 | Flow F | host (confirm), notfound |

## Success metrics (MVP)

| Metric | Target | How it's measured |
|---|---|---|
| Time from landing to share screen | ≤ 60 s for a first-time host | Manual timed run in the demo; Playwright E2E `create-board.spec.ts` finishes in < 10 s |
| Claim propagation latency | p95 < 500 ms, local docker-compose | `realtime.spec.ts` measures claim in tab A → visible in tab B over 20 runs |
| Double claims | 0 under 50 concurrent claims on one slot | `claim.race.int.test.ts` |
| Reconnect catch-up | 100% of events missed during a 10 s drop are applied in order | `sse.replay.int.test.ts` |
| Accessibility | 0 serious/critical axe violations on all screens; Lighthouse a11y ≥ 95 | `a11y.spec.ts` with @axe-core/playwright |
| Domain test coverage | ≥ 80% lines on `packages/shared` and `apps/api/src/domain` | Vitest coverage report in CI |
