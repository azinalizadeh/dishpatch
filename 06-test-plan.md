# 06 · Test plan — Dishpatch

> Role: QA Lead. Feature-level test names live in 05-features.md; this file defines the levels, tools, fixtures, gates and commands, plus the cross-cutting security tests that don't belong to one feature.

## Test pyramid

```
            ┌───────────────┐   E2E (Playwright): ~15 specs — real browser, real API, real Postgres
            │   E2E / a11y  │   two-context real-time, race, reconnect, host flows, axe, visual parity
          ┌─┴───────────────┴─┐
          │ API + integration │  supertest + Testcontainers Postgres 18.6: ~60 tests
          │   + race tests    │  routes, services, SSE, constraints, concurrency
        ┌─┴───────────────────┴─┐
        │   Unit + component    │  Vitest: ~70 tests — shared schemas, coverage, applyBoardEvent,
        │                       │  tokens, hooks/components with happy-dom + msw
        └───────────────────────┘
```

The heaviest logic (coverage rules, event application, schemas) is pure and lives in `packages/shared`, so most of it is cheap unit tests. Anything that depends on locking or ordering is tested against a real Postgres, never a mock.

## Tools and versions

| Tool | Version | Used for |
|---|---|---|
| Vitest + @vitest/coverage-v8 | 5.0.5 | Unit, component, API and integration tests; coverage |
| @testing-library/react | 16.3.3 | Component tests |
| happy-dom | 21.0.3 | DOM environment for component tests |
| msw | 3.0.3 | Mocking `/api/*` (including an SSE stream) in component tests |
| supertest + @types/supertest | 7.3.1 / 7.2.1 | API tests against `buildApp()` without starting the server on a fixed port |
| Testcontainers + @testcontainers/postgresql | 12.2.1 | One `postgres:18.6-alpine` container per test run; migrations applied once; each test file uses its own schema-truncated DB |
| @playwright/test | 1.64.1 | E2E, multi-context real-time, offline simulation, screenshots |
| @axe-core/playwright | 4.14.0 | Accessibility scans on every screen/state |
| Biome | 2.5.15 | Lint + format gate |
| TypeScript `tsc --noEmit` | 6.0.3 | Typecheck gate |
| pnpm audit | pnpm 12.14.0 | Dependency vulnerability gate |
| Trivy (aquasecurity/trivy-action, SHA-pinned) | v0.36.0 | Container image scan |
| CodeQL (github/codeql-action, SHA-pinned) | v4.39.0 | Static analysis on push to main |

## Fixtures and test data

- **Builders** in `apps/api/test/helpers/builders.ts`: `anEvent()`, `aGuest()`, `aClaim()` with sensible defaults (title "Friendsgiving at Mina's", 3/3/2/2/2 slots) and overrides.
- **Scenario fixture** `packages/shared/test/fixtures/mockup-board.ts`: the exact board from `design/mockup.html` (6 participants, 6 claims; expected coverage Vegan thin, Nut-free gap, Gluten-free ok, Halal ok). Used by unit, snapshot and E2E tests so the PNGs, the rules and the tests agree.
- **App factory** `buildApp({ db, clock, bus })` lets tests inject a fake clock (expiry, cleanup, heartbeat) and a spy bus (assert publish-after-commit).
- **DB isolation:** one container per Vitest run (global setup), `TRUNCATE … CASCADE` in `beforeEach` per file; race tests use their own database to avoid cross-talk.
- **Time:** `vi.useFakeTimers()` for heartbeat/presence/reconnect timing; Playwright `page.clock` for UI timers.
- **E2E data:** created through the public API in `test.beforeEach` (no direct DB writes), so E2E exercises real flows.
- **External services:** there are none (no email, payments or third-party APIs). The only "external" thing mocked is the network in component tests (msw) and the connection drop in E2E (`context.setOffline(true)`).

## Cross-cutting security tests (M1 baseline, owned by no single feature)

| Test | Asserts | STRIDE |
|---|---|---|
| `security-headers.int.test.ts › CSP has script-src 'self' and no unsafe-inline` | Header value on `/` and `/api/health` | S2 |
| `security-headers.int.test.ts › sets Referrer-Policy no-referrer` | Header present on HTML and API | I2 |
| `security-headers.int.test.ts › api responses are Cache-Control no-store and have no x-powered-by` | Headers | A02 |
| `logging.test.ts › redacts invite and host tokens from request logs` | Captured pino output for `/e/<t>`, `/api/invites/<t>`, `/api/host-links/<t>` contains `:token`, never `<t>` | I2 |
| `logging.test.ts › does not log request bodies` | A join request's name/needs never appear in logs | I4 |
| `logging.test.ts › redacts cookie and set-cookie headers` | `dp_sess` value absent | S2 |
| `errors.int.test.ts › 500 response has no stack trace and includes requestId` | Forced error route in test build | I5 |
| `errors.int.test.ts › unknown route returns JSON 404 for /api and the SPA for other paths` | Routing | A02 |
| `env.test.ts › boot fails with a clear message when DATABASE_URL is missing` | No value echoed | A02 |
| `origin-check.int.test.ts` (3 tests, see F4) | CSRF controls | T2 |

Every STRIDE row in 07-security.md maps to a test either here or in 05-features.md; E3 maps to the `deps-audit` and `image-scan` CI gates below.

## E2E suite (Playwright)

| Spec | What it covers |
|---|---|
| `create-board.spec.ts` | F1 happy path, host link on second context |
| `join.spec.ts` | F2 join, invalid link, token removed from URL |
| `realtime.spec.ts` | F3/F5 two-context propagation (20 runs, p95), presence, coverage flip |
| `reconnect.spec.ts` | F3 offline banner + replay |
| `claim-race-ui.spec.ts` | F4 two contexts racing |
| `xss.spec.ts` | F4 dish name rendered as text |
| `host-controls.spec.ts` | F6 lock, rotate, delete |
| `a11y.spec.ts` | axe scan (`wcag2a, wcag2aa, wcag21aa, wcag22aa` tags) on create, share, join, join error, board (default/empty/locked/offline), claim dialog, coverage, host, host confirm, notfound — 0 serious/critical violations; keyboard-only walk through create → join → claim |
| `visual.spec.ts` | Screenshots of every screen/state at 1440×900 and 390×844, light + dark, saved to `e2e/visual-output/` for the `design-parity` side-by-side check (not a pixel-diff gate: fonts and live data differ from the mockup) |

Projects: `chromium-desktop` (1440×900), `chromium-mobile` (390×844, `isMobile`), plus `firefox-desktop` for `realtime` and `reconnect` only (EventSource behaviour differs slightly).

## CI quality gates (`.github/workflows/ci.yml`)

All actions pinned by full commit SHA. Node 24.22.0 via `.nvmrc`. Jobs:

| Job | Steps | Gate |
|---|---|---|
| `lint` | `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm lint:sql` → `pnpm typecheck` | zero errors, zero warnings (`biome ci --error-on-warnings`) |
| `unit` | `pnpm test` | all green |
| `integration` | `pnpm test:cov` (every Vitest project incl. `api-int`; Testcontainers uses the runner's Docker) | all green incl. race tests; coverage ≥ 80% lines/branches on `packages/shared` and `apps/api/src/domain`; 100% branches on `coverage.ts`. Domain services are exercised by the integration tests, so coverage is measured across unit + integration together |
| `e2e` | `docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build --wait` → `pnpm test:e2e --project=chromium-desktop --project=chromium-mobile --project=firefox-desktop` | all green; Playwright report uploaded as artifact on failure |
| `deps-audit` | `pnpm audit --audit-level high` | no high/critical advisories (temporary ignores need an issue link in `pnpm-workspace.yaml` `auditConfig`) |
| `image-scan` | build image → Trivy `severity: HIGH,CRITICAL`, `ignore-unfixed: true`, `exit-code: 1` | no fixable high/critical CVEs |
| `codeql` | CodeQL javascript-typescript (push to main + weekly) | no new high alerts |

Branch protection on the standalone repo's `main`: require `lint`, `unit`, `integration`, `e2e`, `deps-audit`, `image-scan`.

## Commands (run from the repo root)

```bash
# one-time
corepack enable && pnpm install
cp .env.example .env            # then edit POSTGRES_PASSWORD / DATABASE_URL
docker compose up -d db
pnpm db:migrate

# fast loop
pnpm lint                       # biome check .
pnpm lint:sql                   # bans sql.raw( / .unsafe( in apps/api/src
pnpm typecheck                  # tsc --noEmit in every package
pnpm test                       # unit + component (Vitest projects: shared, api-unit, web)
pnpm test:cov                   # every project incl. api-int (needs Docker), with v8 coverage + thresholds

# integration (needs Docker running; Testcontainers starts Postgres 18.6)
pnpm test:int                   # vitest run --project api-int
pnpm --filter @dishpatch/api test:race     # race tests only
for i in $(seq 20); do pnpm --filter @dishpatch/api test:race || break; done   # F4 DoD

# E2E (full stack in containers)
docker compose up -d --build --wait
pnpm test:e2e                   # all Playwright projects
pnpm test:e2e --project=chromium-desktop e2e/specs/realtime.spec.ts
pnpm test:e2e e2e/specs/a11y.spec.ts
pnpm test:e2e e2e/specs/visual.spec.ts     # writes e2e/visual-output/*.png for design-parity

# security
pnpm audit --audit-level high
docker build -t dishpatch:local . && docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.69.3 image --severity HIGH,CRITICAL --ignore-unfixed dishpatch:local
```

Trivy CLI is pinned to 0.69.3 (a known-safe version per GHSA-69fq-xp46-6x23); never use the `latest` tag.
