# 05 · Features — the build contract

> Roles: Engineering Manager + QA + Security. Tick boxes in this file as you go (`- [x]`). A feature is done only when every DoD box is ticked. Paths are relative to the repo root (see 04-architecture.md). Test names are the confirmed seams for the `tdd` skill.

Layer tags: `[db]` `[api]` `[domain]` `[ui]` `[test]` `[infra]`.

---

### F1: Create a board

- **Stories:** US-01, US-02 · **Screens:** `create`, `share`, `notfound` (design/screens/create*.png, share*.png) · **Endpoints:** `POST /api/events`, `POST /api/host-links/:hostToken/session` · **Entities:** events, participants (host), sessions, slots
- **Subtasks**
  - [x] F1.1 `[domain]` Shared Zod schemas `CreateEventInput`, `SlotCountInput`, `DIETARY`, error-code enum; limits (title 80, location 120, name 40, ≤ 12 per category, 1–40 total). Files: `packages/shared/src/{schemas.ts,dietary.ts,index.ts}`, `packages/shared/test/schemas.test.ts`. Skill: `tdd`
  - [x] F1.2 `[db]` Drizzle schema for all five tables + enums + constraints/indexes from 04-architecture.md; generate first migration. Files: `apps/api/src/db/schema.ts`, `apps/api/migrations/0000_init.sql`, `apps/api/test/db-constraints.int.test.ts`. Skill: none
  - [x] F1.3 `[domain]` Token helpers `generateToken()`, `hashToken()`; event creation service (one transaction: event + host participant + slots + host session; `expires_at = starts_at + 14 days`). Files: `apps/api/src/domain/{tokens.ts,events.ts}`, `apps/api/test/tokens.test.ts`, `apps/api/test/events.service.int.test.ts`. Skill: `tdd`
  - [x] F1.4 `[api]` `POST /api/events` route (Zod `validate()` middleware, 5/hour/IP limit, body limit, sets host cookie, returns links built from `APP_ORIGIN`). Files: `apps/api/src/routes/events.ts`, `apps/api/src/middleware/session.ts`, `apps/api/test/events.int.test.ts`. Skill: `tdd`
  - [x] F1.5 `[api]` `POST /api/host-links/:hostToken/session` (10/min/IP; 404 on miss). Files: `apps/api/src/routes/host-links.ts`, `apps/api/test/host-links.int.test.ts`. Skill: `tdd`
  - [x] F1.6 `[ui]` `CreateScreen` with TextField, Stepper, validation via shared schema, error/rate-limit/offline banners. Files: `apps/web/src/screens/CreateScreen.tsx`, `apps/web/src/components/{TextField,Stepper,Banner,Button}.tsx`, `apps/web/test/CreateScreen.test.tsx`. Skill: `design-parity` (custom) after the screen renders
  - [x] F1.7 `[ui]` `ShareScreen` (LinkBox + copy + fallback, one-time host link held in memory, `beforeunload` guard) and `HostLinkScreen` (`/h/:token` exchange → `replaceState` → board, or notfound). Files: `apps/web/src/screens/{ShareScreen,HostLinkScreen,NotFoundScreen}.tsx`, `apps/web/src/components/{LinkBox,Toast}.tsx`, `apps/web/test/ShareScreen.test.tsx`. Skill: `design-parity`
  - [x] F1.8 `[test]` E2E create → share → board; host link on a second browser context. Files: `e2e/specs/create-board.spec.ts`. Skill: none
- **Tests**
  - Unit: `schemas.test.ts › CreateEventInput accepts the default Friendsgiving payload` — parses the fixture without changes.
  - Unit: `schemas.test.ts › rejects title over 80 characters` — error path `title`.
  - Unit: `schemas.test.ts › rejects a start date in the past` — error path `startsAt`.
  - Unit: `schemas.test.ts › rejects more than 12 slots in one category and 0 slots in total`.
  - Unit: `schemas.test.ts › rejects unknown dietary value` — `"keto"` fails.
  - Unit: `tokens.test.ts › generateToken returns 43-char base64url from 32 random bytes` — length 43, charset `[A-Za-z0-9_-]`, 1,000 calls unique.
  - Unit: `tokens.test.ts › hashToken is SHA-256 and stable` — known vector.
  - Integration: `events.service.int.test.ts › createEvent stores hashes, never raw tokens` — DB has no column equal to the returned token.
  - Integration: `events.service.int.test.ts › createEvent creates host participant, slots with positions and sets expires_at to starts_at + 14 days`.
  - Integration: `db-constraints.int.test.ts › DB rejects unknown dish tag even if service is bypassed` and `› DB rejects half-claimed slot (dish without claimant)`.
  - API: `events.int.test.ts › POST /api/events returns 201 with inviteUrl, hostUrl and an HttpOnly host cookie`.
  - API: `events.int.test.ts › 6th create within an hour from one IP returns 429`.
  - API: `events.int.test.ts › rejects body over 16 KB with 413`.
  - API: `host-links.int.test.ts › valid host token sets a host session for that event`; `› unknown token returns 404 NOT_FOUND`; `› 11th host-link attempt in a minute returns 429`.
  - UI: `CreateScreen.test.tsx › shows field errors and focuses the summary banner on invalid submit`; `› shows rate-limit banner on 429`.
  - UI: `ShareScreen.test.tsx › copy writes the invite link and shows a toast`; `› falls back to selecting the text when clipboard is denied`.
  - E2E: `create-board.spec.ts › host creates a board and reaches the share screen in under 10 s`; `› host link opened in a new context lands on the board as host and the URL has no token`.
  - Edge cases: empty title/whitespace-only (rejected), location omitted (null stored), clipboard denied, offline submit (banner, nothing created), DB down (500 `INTERNAL` with requestId).
- **Security**
  - S1 token guessing → 256-bit tokens, hash at rest, rate limits on create and host-link exchange (tests above).
  - I2 token leakage → host link never persisted client-side, `replaceState` after exchange, logger redaction (`logging.test.ts › redacts invite and host tokens from request logs`).
  - D2/D3 spam and oversized bodies → 5/hour/IP, 16 KB limit, schema max lengths.
  - A10 → event creation is one transaction; failure leaves no partial board (`events.service.int.test.ts › rolls back everything if slot insert fails`).
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [x] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] The raw host and invite tokens appear only in the 201 response body — not in DB rows, logs, localStorage or sessionStorage (checked by test + manual DevTools look)
  - [x] Migration `0000_init.sql` is committed and `pnpm db:migrate` runs cleanly on an empty Postgres 18.6

---

### F2: Join as a guest

- **Stories:** US-03, US-04 · **Screens:** `join` (default, error), `board` (design/screens/join*.png) · **Endpoints:** `GET /api/invites/:inviteToken`, `POST /api/invites/:inviteToken/join` · **Entities:** participants, sessions
- **Subtasks**
  - [x] F2.1 `[domain]` `JoinInput` schema (name trim 1–40, no control chars, needs ⊆ DIETARY, deduped). Files: `packages/shared/src/schemas.ts`, `packages/shared/test/schemas.test.ts`. Skill: `tdd`
  - [x] F2.2 `[domain]` Participant service: `previewInvite(token)`, `join(token, input)` (expired → `INVITE_INVALID`; ≤ 100 participants; unique name → `NAME_TAKEN`; creates session). Files: `apps/api/src/domain/participants.ts`, `apps/api/test/participants.int.test.ts`. Skill: `tdd`
  - [x] F2.3 `[api]` Routes for preview (30/min/IP) and join (10/min/IP), cookie `Path=/api/events/<id>`. Files: `apps/api/src/routes/invites.ts`, `apps/api/test/join.int.test.ts`, `apps/api/test/invites.int.test.ts`. Skill: `tdd`
  - [x] F2.4 `[api]` Session resolver middleware `resolveActor(req, eventId)` (sha256 lookup, expiry check, returns `Actor | null`) used by every `/api/events/:id*` route. Files: `apps/api/src/middleware/session.ts`, `apps/api/test/session.int.test.ts`. Skill: `tdd`
  - [x] F2.5 `[ui]` `JoinScreen`: preview skeleton, name field, chip group, name-taken inline error, board-full banner, `join/error` screen, redirect when a session already exists (snapshot 200), `replaceState` to `/events/:id`. Files: `apps/web/src/screens/JoinScreen.tsx`, `apps/web/src/components/Chip.tsx`, `apps/web/test/JoinScreen.test.tsx`. Skill: `design-parity`
  - [x] F2.6 `[test]` E2E join flow + invalid link. Files: `e2e/specs/join.spec.ts`. Skill: none
- **Tests**
  - Unit: `schemas.test.ts › JoinInput trims names and dedupes dietary needs`; `› rejects a name with control characters`.
  - Integration: `participants.int.test.ts › join creates a guest participant and a session hash`; `› join on an expired event throws INVITE_INVALID`; `› 101st participant gets EVENT_FULL`.
  - API: `join.int.test.ts › rejects case-insensitive duplicate name with 409 NAME_TAKEN`.
  - API: `invites.int.test.ts › preview returns title, date, host name and count but no participant names`; `› unknown token returns 404 INVITE_INVALID`; `› preview is rate limited after 30 requests per minute`.
  - API: `session.int.test.ts › session cookie is HttpOnly, SameSite=Strict and Path-scoped to the event`; `› expired session resolves to null`.
  - UI: `JoinScreen.test.tsx › toggling a chip sets aria-pressed`; `› shows inline error on 409 NAME_TAKEN and keeps the form`; `› renders the error card for 404`.
  - E2E: `join.spec.ts › guest joins from invite link and sees the board`; `› address bar no longer contains the invite token after joining`; `› rotated or bogus link shows "This invite link doesn't work anymore"`.
  - Edge cases: name with only spaces, emoji names (allowed, counted by code points ≤ 40), same browser joining twice (redirected to board, no second participant), network failure on join (banner + retry), cookies blocked (banner: "Dishpatch needs cookies to remember you on this board").
- **Security**
  - S1 invite guessing → rate limits + 256-bit tokens.
  - S3 name spoofing → unique case-insensitive names; identity is the participant id.
  - I1/I4 → preview exposes only title/date/location/host name/count; participant names and needs need a session.
  - Session hardening (S2) → cookie flags tested in `session.int.test.ts`.
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [x] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] Invalid, rotated and expired invite links produce byte-identical 404 bodies (except `requestId`)
  - [x] The join screen states that dietary needs are optional, visible only to this board, and deleted with it

---

### F3: Live board

- **Stories:** US-05, US-06 · **Screens:** `board` (default, loading, empty, offline, locked) (design/screens/board*.png) · **Endpoints:** `GET /api/events/:eventId`, `GET /api/events/:eventId/stream` · **Entities:** events (seq), event_log, slots, participants
- **Subtasks**
  - [x] F3.1 `[domain]` Shared `BoardEvent` union + pure `applyBoardEvent(state, msg)` (ignores `seq ≤ state.seq`, handles every event type). Files: `packages/shared/src/board-events.ts`, `packages/shared/test/board-events.test.ts`. Skill: `tdd`
  - [x] F3.2 `[api]` Snapshot route `GET /api/events/:eventId` (404 without session; includes `seq`, `me`). Files: `apps/api/src/routes/events.ts`, `apps/api/test/snapshot.int.test.ts`. Skill: `tdd`
  - [x] F3.3 `[domain]` `EventBus` (in-process) + `EventLogRepo.since(eventId, seq)` returning events or `'too_old'`; helper `recordAndPublish(tx, …)` that writes the log row in the tx and publishes after commit. Files: `apps/api/src/realtime/{event-bus.ts,event-log.ts}`, `apps/api/test/event-log.int.test.ts`. Skill: `tdd`
  - [x] F3.4 `[api]` SSE hub + `/stream` route (hand-written SSE writer on `res.write()`): `retry: 3000`, `id: seq`, replay from `Last-Event-ID`, `resync` when too old, heartbeat 20 s, presence (throttled 5 s), per-session (5) and per-IP (20) stream limits, close all streams on `event.deleted`. Files: `apps/api/src/realtime/sse-hub.ts`, `apps/api/src/routes/stream.ts`, `apps/api/test/{stream.int.test.ts,sse.replay.int.test.ts}`. Skill: `tdd`; `diagnosing-bugs` if replay/ordering tests are flaky
  - [x] F3.5 `[ui]` `use-board-stream` hook: TanStack Query snapshot, `EventSource`, apply events through `applyBoardEvent`, connection state machine (live → reconnecting after 2 s → live; `resync` → refetch; 404 → notfound), polite live-region announcer (throttled 2 s). Files: `apps/web/src/api/{queries.ts,use-board-stream.ts}`, `apps/web/test/use-board-stream.test.tsx`. Skill: `tdd`
  - [x] F3.6 `[ui]` `BoardScreen` layout + `CategoryGroup`, `SlotCard` (open/claimed/mine/disabled), `ConnectionIndicator`, guest list, loading/empty/offline/locked states, mobile coverage banner placeholder. Files: `apps/web/src/screens/BoardScreen.tsx`, `apps/web/src/components/{CategoryGroup,SlotCard,ConnectionIndicator,Avatar,Skeleton,Tag}.tsx`, `apps/web/test/BoardScreen.test.tsx`. Skill: `design-parity`
  - [x] F3.7 `[test]` E2E two-context real-time + reconnect. Files: `e2e/specs/{realtime.spec.ts,reconnect.spec.ts}`. Skill: `diagnosing-bugs` if flaky
- **Tests**
  - Unit: `board-events.test.ts › applies slot.claimed and bumps seq`; `› ignores an event with seq <= current seq (idempotent replay)`; `› slot.released clears claimant and dish`; `› participant.joined appends once even if delivered twice`.
  - Integration: `event-log.int.test.ts › since returns events after seq in order`; `› since returns too_old when seq is older than the oldest retained row`; `› nothing is published when the transaction rolls back`.
  - API: `snapshot.int.test.ts › returns slots, participants, coverage, me and seq for a member`; `› returns 404 (not 403) without a session for an existing event`.
  - API: `stream.int.test.ts › sends retry and a presence event on connect`; `› stream for event B with a session of event A returns 404`; `› 6th concurrent stream for one session returns 429 TOO_MANY_STREAMS`; `› sends heartbeat comment within 21 s (fake timers)`; `› closes all streams with event.deleted when the board is deleted`.
  - API: `sse.replay.int.test.ts › reconnect with Last-Event-ID replays missed events in seq order`; `› sends resync when Last-Event-ID is older than retention`.
  - UI: `use-board-stream.test.tsx › switches to reconnecting after 2 s of error and back to live on open` (msw SSE mock, fake timers); `› refetches the snapshot on resync`.
  - UI: `BoardScreen.test.tsx › renders skeleton while loading`; `› renders empty banner when nothing is claimed`; `› open slots are disabled and show Paused when reconnecting`.
  - E2E: `realtime.spec.ts › a guest joining in context A appears in context B's guest list within 1 s` (20 runs, p95 recorded); `› presence count goes from 1 to 2 when a second context opens the board`.
  - E2E: `reconnect.spec.ts › offline banner shows after dropping the network and missed claims appear after reconnect` (`context.setOffline`).
  - Edge cases: tab sleeping for 10 min (resync), duplicate delivery (idempotent), out-of-order delivery across replay/live (ignored by seq), proxy buffering (`X-Accel-Buffering: no` header), server restart (EventSource reconnects, replay from DB).
- **Security**
  - I3 cross-board stream reading → per-event session check (`stream.int.test.ts` negative test).
  - D1 stream exhaustion → per-session/IP limits + heartbeat + closing on delete.
  - I1 → snapshot 404 for non-members.
  - A10 → publish strictly after commit (`event-log.int.test.ts › nothing is published when the transaction rolls back`).
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [ ] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] p95 event propagation (participant.joined) < 500 ms over 20 runs of `realtime.spec.ts`, number written in README
  - [x] Live-region announcements are throttled (no more than one per 2 s) — verified with a screen reader or the component test

---

### F4: Claim & release a slot

- **Stories:** US-07, US-08, US-09 · **Screens:** `claim` (default, submitting, error), `board` (conflict) (design/screens/claim*.png, board-conflict*.png) · **Endpoints:** `POST/DELETE /api/events/:eventId/slots/:slotId/claim` · **Entities:** slots, events (lock + seq), event_log
- **Subtasks**
  - [x] F4.1 `[domain]` `ClaimInput` schema (dish 1–60, tags ⊆ DIETARY). Files: `packages/shared/src/schemas.ts`, `packages/shared/test/schemas.test.ts`. Skill: `tdd`
  - [x] F4.2 `[domain]` `ClaimService.claim`: tx → `SELECT … FOR UPDATE` event → locked? → count my claims (≤ 3) → conditional `UPDATE … WHERE claimed_by IS NULL RETURNING` → 0 rows: look up winner for `SLOT_TAKEN {claimedBy}` or `NOT_FOUND` → `seq+1` → log → commit → publish. Files: `apps/api/src/domain/claims.ts`, `apps/api/test/claims.int.test.ts`. Skill: `tdd`
  - [x] F4.3 `[domain]` `ClaimService.release` (owner or host; `NOT_CLAIMED`; locked → `BOARD_LOCKED`; logs actor role). Files: `apps/api/src/domain/claims.ts`, `apps/api/test/claims.int.test.ts`. Skill: `tdd`
  - [x] F4.4 `[test]` Race tests with real Postgres: 50 concurrent claims on one slot; 10 concurrent claims by one participant against the limit. Files: `apps/api/test/claim.race.int.test.ts`. Skill: `tdd`; `diagnosing-bugs` if non-deterministic
  - [x] F4.5 `[api]` Claim/release routes + origin check middleware + JSON-only content-type guard + per-session rate limit. Files: `apps/api/src/routes/slots.ts`, `apps/api/src/middleware/origin-check.ts`, `apps/api/test/origin-check.int.test.ts`. Skill: `tdd`
  - [x] F4.6 `[ui]` `ClaimDialog` (dialog/bottom sheet, focus trap, chips, live coverage preview, submitting/error/limit states, closes into error if SSE claims the slot meanwhile) + optimistic claim/release with rollback in TanStack Query mutations; release confirm popover; conflict toast. Files: `apps/web/src/screens/ClaimDialog.tsx`, `apps/web/src/components/{Dialog,Chip,Toast}.tsx`, `apps/web/src/api/queries.ts`, `apps/web/test/ClaimDialog.test.tsx`. Skill: `design-parity`
  - [x] F4.7 `[test]` E2E race in the UI (two contexts submit together) + XSS check on dish name. Files: `e2e/specs/{claim-race-ui.spec.ts,xss.spec.ts}`. Skill: none
- **Tests**
  - Unit: `schemas.test.ts › ClaimInput rejects empty and 61-char dish names`.
  - Integration: `claims.int.test.ts › claim stores dish, tags, claimant and increments seq by 1`; `› claim on a claimed slot throws SLOT_TAKEN with the winner's name`; `› 4th claim by one participant throws CLAIM_LIMIT`; `› claim on a locked board throws BOARD_LOCKED`; `› claim on a slot of another event throws NOT_FOUND`; `› dish name with SQL metacharacters is stored verbatim`.
  - Integration: `claims.int.test.ts › release by owner reopens the slot`; `› release by non-owner returns 403 NOT_OWNER and slot is unchanged`; `› release by host succeeds and logs actorRole host`; `› release on an open slot throws NOT_CLAIMED`.
  - Race: `claim.race.int.test.ts › 50 concurrent claims on one slot yield exactly one 200`; `› claim limit holds under 10 concurrent claims by one participant`; `› seq values are gap-free and unique after 100 mixed concurrent operations`.
  - API: `origin-check.int.test.ts › rejects POST with foreign Origin with 403 BAD_ORIGIN`; `› rejects form-encoded body with 415`; `› accepts same-origin JSON`.
  - UI: `ClaimDialog.test.tsx › traps focus and returns it to the slot on close`; `› shows submitting state and disables inputs`; `› rolls back the optimistic card and shows the winner on 409`; `› switches to error when an SSE slot.claimed arrives for the open slot`.
  - E2E: `claim-race-ui.spec.ts › two guests submit the same slot, one sees their card, the other sees "just claimed this slot"`.
  - E2E: `realtime.spec.ts › claim in context A appears in context B within 1 s` (20 runs, p95 recorded).
  - E2E: `xss.spec.ts › dish name with <img onerror> renders as text`.
  - Edge cases: double-click submit (button disabled after first), network timeout (rollback after 10 s), release while offline (disabled), host removing a claim while the claimant has the release popover open (popover closes, toast).
- **Security**
  - T4 double claim → lock + conditional update (race tests).
  - T1 tampering with others' claims → ownership check (negative test).
  - T2 CSRF → SameSite=Strict + Origin + JSON-only (negative tests).
  - T3 injection, S2 XSS via dish names → parameterised SQL, React escaping, CSP (tests above).
  - Abuse: per-session 30/min limit on claim/release; ≤ 3 claims per participant.
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [x] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] `claim.race.int.test.ts` passes 20 times in a row locally (`for i in $(seq 20); do pnpm --filter @dishpatch/api test:race || break; done`)
  - [x] The SSE event is published only after commit, proven by the rollback test in F3
  - [x] p95 claim propagation < 500 ms over 20 runs of `realtime.spec.ts`, number written in README

---

### F5: Dietary coverage

- **Stories:** US-10, US-11 · **Screens:** `board` sidebar + mobile banner, `coverage` (default, empty), `claim` preview banner (design/screens/coverage*.png) · **Endpoints:** none new (part of snapshot + SSE) · **Entities:** participants.dietary_needs, slots.dish_tags
- **Subtasks**
  - [x] F5.1 `[domain]` `effectiveTags` (vegan ⇒ vegetarian + dairy_free) and `computeCoverage` (rule: guests 0 → omitted; dishes 0 → gap; mains 0 or dishes 1 → thin; else ok; sorted gap → thin → ok, then guests desc). Files: `packages/shared/src/coverage.ts`, `packages/shared/test/coverage.test.ts`. Skill: `tdd`
  - [x] F5.2 `[domain]` `topHint(coverage)` → `{need, categories: 'main' | 'any'}` (thin → main slots only; gap → any open slot) and `previewCoverage(current, draftClaim)` for the claim dialog banner. Files: `packages/shared/src/coverage.ts`, `packages/shared/test/coverage.test.ts`. Skill: `tdd`
  - [x] F5.3 `[api]` Include `coverage` in the snapshot (server uses the same shared function). Files: `apps/api/src/routes/events.ts`, `apps/api/test/snapshot.int.test.ts`. Skill: none
  - [x] F5.4 `[ui]` `CoverageMeter` (compact + full), board sidebar card, mobile summary banner, hint chip on open `SlotCard`s, `CoverageScreen` with empty state and rules card, claim-dialog preview banner. Files: `apps/web/src/components/CoverageMeter.tsx`, `apps/web/src/screens/CoverageScreen.tsx`, `apps/web/src/components/SlotCard.tsx`, `apps/web/test/CoverageMeter.test.tsx`. Skill: `design-parity`
- **Tests**
  - Unit: `coverage.test.ts › vegan dish counts for vegetarian and dairy-free guests`.
  - Unit: `coverage.test.ts › two vegan guests with vegan side and salad only is thin`.
  - Unit: `coverage.test.ts › one nut-free guest and no nut-free dish is gap`.
  - Unit: `coverage.test.ts › a single compatible main and nothing else is thin`; `› one compatible main plus one other compatible dish is ok`.
  - Unit: `coverage.test.ts › needs nobody has are omitted`; `› result is sorted gap, thin, ok then by guests desc`.
  - Unit: `coverage.test.ts › topHint prefers the need with more guests and targets mains when thin`; `› topHint targets any slot when the top need is a gap`; `› topHint is null when everything is ok`.
  - Unit: `coverage.test.ts › previewCoverage shows the vegan main gap closing for a vegan main draft`.
  - Integration: `snapshot.int.test.ts › snapshot coverage equals computeCoverage of the stored data` (fixture: the mockup board — Vegan thin, Nut-free gap, Gluten-free ok, Halal ok).
  - UI: `CoverageMeter.test.tsx › status is shown as text, not only colour`; `› renders the empty state when no guest has needs`; `› bar has role img with an accessible label`.
  - E2E: `realtime.spec.ts › claiming a vegan main in context A flips Vegan from Thin to Covered in context B`.
  - Edge cases: guest with all six needs, dish with no tags (counts for nobody), needs change because a participant is deleted with the board (n/a), 100 guests (performance: compute in < 1 ms).
- **Security**
  - I4 → coverage only aggregates needs of the current board's participants; individual needs are visible only to members (snapshot auth).
  - T5 → tag values validated by Zod + DB CHECK, so the coverage maths can't be fed arbitrary strings.
  - Privacy copy on `coverage` and `join` explains what's shared.
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [x] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] Server and client produce identical coverage for the same data (one shared function, one integration test)
  - [x] `packages/shared/src/coverage.ts` has 100% branch coverage

---

### F6: Host controls

- **Stories:** US-12, US-13, US-14 · **Screens:** `host` (default, confirm), `board` (locked), `notfound` (design/screens/host*.png, board-locked*.png) · **Endpoints:** `PATCH /api/events/:eventId`, `POST /api/events/:eventId/slots`, `DELETE /api/events/:eventId/slots/:slotId`, `POST /api/events/:eventId/invite/rotate`, `DELETE /api/events/:eventId`, host branch of `DELETE …/claim` · **Entities:** events, slots, event_log
- **Subtasks**
  - [x] F6.1 `[domain]` `HostService` with `requireHost(actor)`: `setLocked`, `addSlot` (≤ 12 per category, ≤ 40 total → `SLOT_LIMIT`), `removeSlot` (claimed → `SLOT_CLAIMED`), `rotateInvite` (atomic hash swap), `deleteEvent(confirmTitle)` (exact match → cascade delete → publish `event.deleted`). Files: `apps/api/src/domain/host.ts`, `apps/api/test/host.int.test.ts`. Skill: `tdd`
  - [x] F6.2 `[api]` Host routes with limits (rotate 5/hour/event, delete 5/hour/session). Files: `apps/api/src/routes/{events.ts,slots.ts}`, `apps/api/test/host.int.test.ts`. Skill: `tdd`
  - [x] F6.3 `[infra]` Cleanup job: every `CLEANUP_INTERVAL_MINUTES` delete events with `expires_at < now()` (cascade) and `event_log` rows older than 24 h; runs once at boot; logs counts only. Files: `apps/api/src/jobs/cleanup.ts`, `apps/api/test/cleanup.int.test.ts`. Skill: `tdd`
  - [x] F6.4 `[ui]` `HostScreen` (Switch, rotate with inline LinkBox, slot steppers with claimed counts, danger card, alertdialog with typed confirmation), host-only "Host settings" button, host ✕ on every card with confirm, locked banner wiring. Files: `apps/web/src/screens/HostScreen.tsx`, `apps/web/src/components/{Switch,Dialog,Stepper}.tsx`, `apps/web/test/HostScreen.test.tsx`. Skill: `design-parity`
  - [x] F6.5 `[test]` E2E host controls (lock propagates, rotate kills old link, delete sends viewers to notfound). Files: `e2e/specs/host-controls.spec.ts`. Skill: none
- **Tests**
  - Integration: `host.int.test.ts › guest PATCH lock returns 403 HOST_ONLY`; `› host lock sets locked, bumps seq and publishes event.updated`; `› claim after lock returns 423 BOARD_LOCKED`.
  - Integration: `host.int.test.ts › rotated-out invite token returns 404 on preview and join`; `› existing guest sessions still work after rotation`.
  - Integration: `host.int.test.ts › removing a claimed slot returns 409 SLOT_CLAIMED`; `› adding a 13th main returns 409 SLOT_LIMIT`.
  - Integration: `host.int.test.ts › host removing a claim writes slot.released with actorRole host`.
  - Integration: `host.int.test.ts › delete with wrong confirmTitle returns 400 CONFIRM_MISMATCH`; `› delete removes event, participants, sessions, slots and log rows`.
  - Integration: `cleanup.int.test.ts › deletes events 14 days after starts_at with all participants`; `› keeps events that expire tomorrow`; `› prunes event_log rows older than 24 h`.
  - UI: `HostScreen.test.tsx › delete button stays disabled until the typed name matches exactly`; `› switch reverts and shows a toast when PATCH fails`; `› Host settings button is not rendered for guests`.
  - E2E: `host-controls.spec.ts › locking in the host context shows the locked banner in the guest context`; `› old invite link shows the join error after rotation`; `› deleting the board sends a connected guest to notfound`.
  - Edge cases: host deletes while a claim is in flight (claim gets 404), two host devices toggling lock simultaneously (last write wins, both see final state via SSE), host releases own claim on a locked board (allowed? No — locked blocks everyone; host must unlock first, message says so).
- **Security**
  - E1 privilege escalation → `requireHost` in the service (negative test).
  - E2 stale invite → atomic rotation (negative test).
  - R1 repudiation → actor recorded in `event_log`.
  - Privacy → hard delete + cleanup job (tests above); delete requires typed confirmation to prevent accidental data loss.
- **Definition of Done**
  - [x] All subtasks done; acceptance criteria of linked stories pass
  - [x] Listed tests written and green locally and in CI; coverage of new domain code ≥ 80%
  - [x] Security controls for this feature implemented and tested (at least one negative/abuse test)
  - [x] UI matches design/screens/*.png for all states (loading/empty/error/success), including dark mode
  - [x] Accessibility: labels/content descriptions, touch targets ≥ 48dp, keyboard navigation (web), contrast AA
  - [x] Lint/format/typecheck clean; no new warnings
  - [x] No secrets in code or logs; errors handled with user-friendly messages
  - [x] README/docs updated if behavior or setup changed
  - [x] Any skill used for this feature is logged in skills/usage-log.md
  - Feature-specific:
  - [x] Every host-only route is covered by a guest-session negative test (one per route, 5 total)
  - [x] After `DELETE /api/events/:id`, a `SELECT count(*)` across all five tables for that event id returns 0
