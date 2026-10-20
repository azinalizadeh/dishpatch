# 08 · Agent plan — Dishpatch

> Role: Engineering Manager. Seven milestones, ~9 hours total. Paste one brief at a time into Claude Code (from the repo root). Each brief assumes AGENTS.md is loaded. Branch per milestone (`m1-scaffold`, `m2-create-board`, …); merge to `main` only when the covered DoD boxes in 05-features.md are ticked.

| # | Branch | Covers | Est. |
|---|---|---|---|
| M1 | `m1-scaffold` | Scaffold, tooling, tests, CI, security baseline, skills | 1 h 15 |
| M2 | `m2-create-board` | F1 (F1.1–F1.8) + DB schema | 1 h 30 |
| M3 | `m3-join` | F2 (F2.1–F2.6) | 1 h |
| M4 | `m4-live-board` | F3 (F3.1–F3.7) | 1 h 30 |
| M5 | `m5-claims` | F4 (F4.1–F4.7) | 1 h 30 |
| M6 | `m6-coverage-host` | F5 (F5.1–F5.4) + F6 (F6.1–F6.5) | 1 h 30 |
| M7 | `m7-hardening` | Security review, a11y, polish, README, demo, usage log, retro | 45 min |

---

## M1 — Scaffold, tooling, CI green, security baseline

**Goal:** an empty-but-real monorepo where `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` and CI all pass, with security headers, env validation, log redaction and the error handler in place, and today's skills installed.

**Features & subtasks covered:** none of F1–F6 yet. Baseline items:
- M1.1 `[infra]` pnpm workspace (`apps/api`, `apps/web`, `packages/shared`, `e2e`), `packageManager: pnpm@12.14.0`, `.nvmrc` 24.22.0, `tsconfig.base.json` (strict), Biome config (`noDangerouslySetInnerHtml` error, `noConsole` warn), root scripts from 06-test-plan.md incl. `lint:sql`.
- M1.2 `[infra]` Express app factory `buildApp({db, clock, bus})` (returns the app without calling `listen()`), `env.ts` (Zod), pino-http with redaction + token-path serializer, central error middleware (registered last, 4-arg; maps body-parser errors `entity.too.large` → 413 and `entity.parse.failed` → 400 `VALIDATION` to the standard error body), `/api/health`, helmet with the exact CSP/headers from 07-security.md, JSON-only content-type guard, `express.json({ limit: '16kb' })`, `express.static` for the SPA in production.
- M1.3 `[infra]` Vite + React + Tailwind v4 skeleton with `tokens.css` copied from `design/mockup.html`, Fontsource fonts, React Router with all 8 routes rendering placeholders; Vite proxy `/api` → `http://localhost:3000`.
- M1.4 `[infra]` Dockerfile (multi-stage → distroless nonroot), `docker-compose.yml` (db `postgres:18.6-alpine` with healthcheck + api, `read_only`, tmpfs), `docker-compose.ci.yml`, `.env.example`.
- M1.5 `[test]` Vitest projects (`shared`, `api-unit`, `api-int` with Testcontainers global setup, `web`), Playwright config (projects in 06-test-plan.md), one smoke test per level; cross-cutting security tests from 06 (`security-headers.int.test.ts`, `logging.test.ts`, `errors.int.test.ts`, `env.test.ts`).
- M1.6 `[infra]` `.github/workflows/ci.yml` with jobs lint/unit/integration/e2e/deps-audit/image-scan/codeql, every action pinned by full commit SHA (resolve with `git ls-remote https://github.com/<owner>/<action> refs/tags/<tag>` and add the tag as a trailing comment); `.github/dependabot.yml` (npm, github-actions, docker; weekly).
- M1.7 `[infra]` Install skills (skills/README.md › Install), run `/setup-matt-pocock-skills` (Local markdown), copy `design-parity` into `.claude/skills/`.

**Skills to use:** none for building; install `/tdd`, `/code-review`, `/diagnosing-bugs`, `/retro` and `design-parity` at the end of M1.

**Context:** AGENTS.md; 04-architecture.md (Stack, Repository structure, Environment variables); 06-test-plan.md (Tools, CI quality gates, Commands, Cross-cutting security tests); 07-security.md (Concrete settings); 03-design.md (Design tokens).

**Constraints:** exact versions from the stack table; no dependency outside it; no secrets in any file (`.env` git-ignored); the CSP must not contain `unsafe-inline`/`unsafe-eval`; non-root container.

**Success criteria:**
- `pnpm lint && pnpm lint:sql && pnpm typecheck && pnpm test && pnpm test:int` green locally.
- `docker compose up -d --build --wait && pnpm test:e2e --project=chromium-desktop` green (smoke spec loads `/` and checks the title).
- `curl -sI http://localhost:3000/api/health` shows the CSP, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, no `x-powered-by`.
- CI run on the branch is green on all jobs; `git grep -nE "uses: [^@]+@v[0-9]"` in `.github/` returns nothing (all SHA-pinned).
- Cross-cutting security tests in 06-test-plan.md written and green.

**Non-goals:** any feature logic, DB tables (M2), real UI screens.

---

## M2 — Data model + F1 Create a board

**Goal:** a host can create a board and get the two links; the host link works on another device.

**Features & subtasks covered:** F1.1–F1.8.

**Skills to use:** `/tdd` for F1.1, F1.3, F1.4, F1.5 (seams = test names in 05-features.md › F1, already confirmed); `design-parity` for F1.6, F1.7 on `create` and `share` (all states, light/dark/mobile); `/code-review` with fixed point `main` and spec 05-features.md › F1 before merging.

**Context:** 05-features.md › F1; 04-architecture.md › Data model, API contract #1–#2, Shared domain interfaces; 03-design.md › `create`, `share`, `notfound`; PNGs `design/screens/create*.png`, `share*.png`, `notfound*.png`; 07-security.md › S1, I2, D2, D3; 02-user-flows.md › Flow A, Flow G.

**Constraints:** all five tables and constraints are created now (later milestones only add code); raw tokens never stored or logged; event creation is one transaction.

**Success criteria:** F1 DoD fully ticked in 05-features.md; `pnpm test && pnpm test:int && pnpm test:e2e e2e/specs/create-board.spec.ts` green; `pnpm db:migrate` on an empty DB succeeds; CI green.

**Non-goals:** join, live updates, claims; editing a board after creation (F6).

---

## M3 — F2 Join as a guest

**Goal:** guests join from the invite link with a name and dietary needs and land on a (still static) board.

**Features & subtasks covered:** F2.1–F2.6.

**Skills to use:** `/tdd` for F2.1–F2.4; `design-parity` for F2.5 (`join` default/loading/error, light/dark/mobile); `/code-review` (fixed point `main`, spec 05-features.md › F2).

**Context:** 05-features.md › F2; 04-architecture.md › API contract #3–#4, sessions table; 03-design.md › `join`; PNGs `design/screens/join*.png`; 07-security.md › S1, S3, I1, I4, session settings; 02-user-flows.md › Flow B.

**Constraints:** session cookie flags exactly as in 07-security.md; invalid/rotated/expired invites indistinguishable; preview leaks no participant names.

**Success criteria:** F2 DoD ticked; `pnpm test && pnpm test:int && pnpm test:e2e e2e/specs/join.spec.ts` green; CI green.

**Non-goals:** real-time updates (M4); claiming (M5).

---

## M4 — F3 Live board (the first half of the signature challenge)

**Goal:** the board renders from a snapshot and stays live over SSE, with presence, a reconnecting state and gap-free replay via `Last-Event-ID`.

**Features & subtasks covered:** F3.1–F3.7.

**Skills to use:** `/tdd` for F3.1–F3.5; `design-parity` for F3.6 (`board` default/loading/empty/offline/locked, light/dark/mobile); `/diagnosing-bugs` only if `sse.replay.int.test.ts`, `realtime.spec.ts` or `reconnect.spec.ts` is flaky or red for an unclear reason; `/code-review` (fixed point `main`, spec 05-features.md › F3 + the sequence diagram in 04-architecture.md).

**Context:** 05-features.md › F3; 04-architecture.md › Architecture, Signature challenge sequence diagram, API #5–#6, event_log; 03-design.md › `board` (live regions!); PNGs `design/screens/board*.png`; 07-security.md › I1, I3, D1; 02-user-flows.md › Flow C.

**Constraints:** publish only after commit; client ignores `seq ≤ current`; native `EventSource` (no polyfill); heartbeat 20 s; announcements throttled to one per 2 s. To make F3 testable before claims exist, emit `participant.joined` from F2's join (already in scope) and use it in the realtime spec.

**Success criteria:** F3 DoD ticked (p95 measured with `participant.joined`; the claim-based p95 belongs to F4 in M5); `pnpm test:int` incl. `stream.int.test.ts` + `sse.replay.int.test.ts` green; `pnpm test:e2e e2e/specs/realtime.spec.ts e2e/specs/reconnect.spec.ts` green on chromium and firefox projects; CI green.

**Non-goals:** multi-instance fan-out (Postgres LISTEN/NOTIFY), WebSockets.

---

## M5 — F4 Claim & release (the second half of the signature challenge)

**Goal:** claims and releases are race-safe, optimistic in the UI, and conflicts are explained clearly.

**Features & subtasks covered:** F4.1–F4.7.

**Skills to use:** `/tdd` for F4.1–F4.5 (start with `claim.race.int.test.ts`); `/diagnosing-bugs` if any race test is non-deterministic; `design-parity` for F4.6 (`claim` default/submitting/error, `board/conflict`, light/dark/mobile); `/code-review` (fixed point `main`, spec 05-features.md › F4; ask it to check publish-after-commit and the lock order).

**Context:** 05-features.md › F4; 04-architecture.md › Signature challenge, API #7–#8, slots constraints, Limits; 03-design.md › `claim`, `board` conflict state; PNGs `design/screens/claim*.png`, `board-conflict*.png`; 07-security.md › T1, T2, T3, T4, S2; 02-user-flows.md › Flow D, Flow E.

**Constraints:** lock order is always event row → slot rows; no application-level mutex (the DB is the source of truth); Origin check + JSON-only on every mutation; ≤ 3 claims per participant.

**Success criteria:** F4 DoD ticked, including 20 consecutive green runs of the race suite and claim p95 < 500 ms recorded in README; `pnpm test:e2e e2e/specs/claim-race-ui.spec.ts e2e/specs/xss.spec.ts e2e/specs/realtime.spec.ts` green; CI green.

**Non-goals:** editing a claimed dish in place (release + claim again), quantities.

---

## M6 — F5 Dietary coverage + F6 Host controls

**Goal:** coverage meter, hints and coverage screen work live; the host can lock, rotate, edit slots, remove claims and delete; expired boards are cleaned up.

**Features & subtasks covered:** F5.1–F5.4, F6.1–F6.5.

**Skills to use:** `/tdd` for F5.1, F5.2, F6.1–F6.3; `design-parity` for F5.4 (`coverage` default/empty, board sidebar + mobile banner, claim preview) and F6.4 (`host` default/confirm, `board/locked`); `/code-review` (fixed point `main`, spec 05-features.md › F5 + F6).

**Context:** 05-features.md › F5, F6; 04-architecture.md › Shared domain interfaces (coverage rule), API #9–#13, Limits; 03-design.md › `coverage`, `host`, `board` locked; PNGs `design/screens/coverage*.png`, `host*.png`, `board-locked*.png`; 07-security.md › E1, E2, R1, I4, Privacy; 02-user-flows.md › Flow F; fixture `packages/shared/test/fixtures/mockup-board.ts`.

**Constraints:** one shared `computeCoverage` used by server and client; `requireHost` in the service layer; delete is a hard delete (cascade) with typed confirmation; cleanup logs counts only.

**Success criteria:** F5 and F6 DoD ticked; `coverage.ts` at 100% branch coverage; `pnpm test:e2e e2e/specs/host-controls.spec.ts` green; CI green.

**Non-goals:** co-hosts, editing event title/date after creation, email notifications.

---

## M7 — Security review, polish, README, demo, usage log

**Goal:** ship-ready MVP tagged `v1-mvp`.

**Features & subtasks covered:**
- M7.1 Security pass: walk every row of 07-security.md (STRIDE + OWASP checklist) and confirm the named test exists and is green; run `pnpm audit --audit-level high` and Trivy; fix or document findings.
- M7.2 Accessibility: `a11y.spec.ts` on every screen/state (0 serious/critical), keyboard-only walkthrough, screen-reader spot check of live announcements.
- M7.3 Visual: `design-parity` full pass on all 8 screens; resolve or document differences.
- M7.4 README: setup, commands, architecture diagram, screenshots (from `e2e/visual-output/`), p95 latency number, known limitations (single instance, capability links).
- M7.5 Demo recording checklist (below) and a dry run.
- M7.6 Fill `skills/usage-log.md`, set every skill's status in `skills/README.md` (`used` / `skipped (reason)`), run `/retro` and paste its top 3 suggestions into the usage-log notes.
- M7.7 Tag `v1-mvp` after merging `m7-hardening`.

**Skills to use:** `design-parity` (M7.3); `/code-review` with fixed point `v0-docs` for a whole-project spec check (M7.1); `/retro` (M7.6).

**Context:** 07-security.md (all); 06-test-plan.md (gates); README.md › Demo script; skills/README.md; skills/usage-log.md.

**Constraints:** no new features; fixes only. Don't relax a test to make it pass.

**Success criteria:** every DoD box in 05-features.md is ticked; all CI gates green; `git tag v1-mvp` on `main`; usage log has at least one row per used skill.

**Demo recording checklist:**
- [ ] Two browser windows side by side (host on the left, guest on the right), plus a phone-sized window for the join.
- [ ] Seed nothing: create the board live (≤ 15 s).
- [ ] Join as Priya (vegan) from the invite link.
- [ ] Coverage shows "No vegan main yet"; claim a vegan main; it flips to Covered in both windows.
- [ ] Race: both windows click the last dessert and submit together; one wins, the other shows the conflict.
- [ ] Turn Wi-Fi off in the guest window, claim in the host window, turn Wi-Fi on: the missed claim appears.
- [ ] Lock the board; guest sees the locked banner.
- [ ] Dark mode + mobile glimpse; end on the overview of the board.

**Non-goals:** deployment to a public host; new features.

---

## Traceability

| Story | Feature | Screens (PNG) | Key tests | Security controls | Skills | Milestone |
|---|---|---|---|---|---|---|
| US-01 | F1 | create.png, create-error.png, share.png | `schemas.test.ts › CreateEventInput…`, `events.int.test.ts › POST /api/events returns 201…`, `› 6th create… 429`, `create-board.spec.ts` | S1, D2, D3, A10 tx | tdd, design-parity, code-review | M2 |
| US-02 | F1 | share.png, share-copied.png, notfound.png | `host-links.int.test.ts` (3), `create-board.spec.ts › host link opened in a new context…` | S1, I2 | tdd, design-parity | M2 |
| US-03 | F2 | join.png, join-error.png, board.png | `join.int.test.ts › rejects case-insensitive duplicate…`, `invites.int.test.ts`, `join.spec.ts` | S1, S3, I1, I2 | tdd, design-parity | M3 |
| US-04 | F2 | join.png | `schemas.test.ts › JoinInput trims…`, `JoinScreen.test.tsx › toggling a chip…` | T5, I4 | tdd, design-parity | M3 |
| US-05 | F3 | board.png, board-empty.png, board-loading.png | `board-events.test.ts`, `stream.int.test.ts`, `realtime.spec.ts` | I3, D1, A10 publish-after-commit | tdd, design-parity, diagnosing-bugs | M4 |
| US-06 | F3 | board-offline.png, board-offline-dark.png | `sse.replay.int.test.ts` (2), `use-board-stream.test.tsx`, `reconnect.spec.ts` | D1 | tdd, diagnosing-bugs | M4 |
| US-07 | F4 | claim.png, claim-submitting.png | `claims.int.test.ts › claim stores…`, `› 4th claim… CLAIM_LIMIT`, `ClaimDialog.test.tsx` | T2, T3, S2 | tdd, design-parity | M5 |
| US-08 | F4 | claim-error.png, board-conflict.png | `claim.race.int.test.ts` (3), `claim-race-ui.spec.ts` | T4 | tdd, diagnosing-bugs | M5 |
| US-09 | F4 | board.png | `claims.int.test.ts › release by non-owner returns 403…` | T1 | tdd | M5 |
| US-10 | F5 | board.png (sidebar), coverage.png, coverage-empty.png | `coverage.test.ts` (10), `snapshot.int.test.ts › snapshot coverage equals…` | I4, T5 | tdd, design-parity | M6 |
| US-11 | F5 | board.png (hint chip), claim.png (preview) | `coverage.test.ts › topHint…` (3), `› previewCoverage…` | — (read-only derived data) | tdd, design-parity | M6 |
| US-12 | F6 | host.png, board-locked.png | `host.int.test.ts › guest PATCH lock returns 403…`, `› claim after lock returns 423…`, `host-controls.spec.ts` | E1, R1 | tdd, design-parity | M6 |
| US-13 | F6 | host.png | `host.int.test.ts › rotated-out invite token…`, `› removing a claimed slot…`, `› host removing a claim writes…` | E2, R1 | tdd | M6 |
| US-14 | F6 | host-confirm.png, notfound.png | `host.int.test.ts › delete removes…`, `cleanup.int.test.ts` (3), `host-controls.spec.ts › deleting the board…` | Privacy, I4 | tdd, design-parity | M6 |
| (all) | — | all PNGs | `a11y.spec.ts`, `visual.spec.ts`, cross-cutting security tests | All STRIDE rows, OWASP A01–A10 | code-review, design-parity, retro | M1, M7 |
