# 04 · Architecture — Dishpatch

> Role: Tech Lead. Versions were checked against the npm registry, endoflife.date and the GitHub tags on 2026-10-20 (see README Sources). Pin exactly these; don't add dependencies outside this table (AGENTS.md).

## Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js LTS | 24.22.0 | Current LTS line with security support to Apr 2028; Node 26 becomes LTS within days of this package, so upgrading is a one-line `.nvmrc`/Dockerfile change once it's promoted. |
| Package manager | pnpm (workspaces) | 12.14.0 | Fast, strict workspaces for `apps/*` + `packages/shared`; enforced with `packageManager` field + Corepack. |
| Language | TypeScript | 6.0.3 | Last JS-API release; TS 7 (native) is out but some editor/tool integrations still depend on the JS compiler API. Strict mode everywhere. Upgrade is isolated to `tsc --noEmit`. |
| Frontend | React + React DOM | 19.3.1 | Familiar, `useOptimistic`/`useTransition` fit optimistic claims. |
| Build/dev server | Vite + @vitejs/plugin-react | 8.3.4 / 6.1.2 | Fast HMR; dev proxy `/api` → API so cookies stay same-origin. |
| Routing | React Router (library mode) | 8.5.0 | 8 routes, no SSR needed. |
| Server state | TanStack Query | 5.104.5 | Snapshot cache that SSE events patch; optimistic update + rollback built in. |
| Styling | Tailwind CSS + @tailwindcss/vite | 4.3.3 | Tokens from 03-design.md exposed through `@theme`; no runtime CSS-in-JS. |
| Fonts | @fontsource-variable/bricolage-grotesque, @fontsource/atkinson-hyperlegible-next, @fontsource/jetbrains-mono | 5.3.0 each | Self-hosted fonts: no third-party request (privacy + strict CSP). |
| Backend | Express + @types/express | 5.3.0 / 5.0.6 | The most widely known Node framework; Express 5 forwards rejected async handlers to the error middleware, so no wrapper is needed. Tested with supertest. |
| Validation / types | Zod | 4.6.7 | One schema in `packages/shared` validates on the client and server and types both. On the API a small `validate({ body, params, query })` middleware runs `schema.safeParse()` and returns 400 `VALIDATION` on error; handlers read the typed result from `res.locals`. |
| Real-time | Server-Sent Events (hand-written, no library) | — | One-way server→client fan-out is all the board needs; native `EventSource` gives auto-reconnect + `Last-Event-ID`. The writer is ~40 lines in `realtime/sse-hub.ts`: set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, call `res.flushHeaders()`, then `res.write()` each frame; clean up on `req.on('close')`. |
| Security middleware | helmet, express-rate-limit, cookie-parser + @types/cookie-parser, `express.static` (built in) | 8.3.0 / 8.7.1 / 1.4.7 / 1.4.10 / — | Headers/CSP, per-route limits, reading the unsigned httpOnly session cookie (set with `res.cookie()`), serving the built SPA from the same origin. |
| Database | PostgreSQL | 18.6 (`postgres:18.6-alpine`) | Row locks + conditional `UPDATE … RETURNING` make the claim race trivial to get right; `text[]` + CHECK constraints for tags. |
| DB driver | postgres (postgres.js) | 3.4.9 | Small, fast, tagged-template SQL (parameterised by construction). |
| ORM / migrations | Drizzle ORM + drizzle-kit | 0.45.4 / 0.31.11 | Typed queries, SQL-first migrations checked into git. |
| Logging | pino + pino-http | 10.4.0 / 11.0.0 | JSON request logs with redaction paths for tokens/cookies; `req.log` in handlers; `genReqId` sets the `req.id` used as `requestId` in error bodies. |
| Ids / tokens | `crypto.randomUUID()` / `crypto.randomBytes(32)` (Node built-in) | — | No extra dependency. |
| Lint + format | Biome | 2.5.15 | One fast tool for lint + format across TS/JSON/CSS. |
| Unit / integration tests | Vitest + @vitest/coverage-v8 | 5.0.5 | Same runner for shared, API and web; v8 coverage thresholds. |
| Component tests | @testing-library/react + happy-dom | 16.3.3 / 21.0.3 | Fast DOM for hooks/components. |
| HTTP mocking (web) | msw | 3.0.3 | Mock API + SSE in component tests. |
| DB in tests | Testcontainers + @testcontainers/postgresql | 12.2.1 | Real Postgres 18 per test run; race tests need real locking. |
| E2E | @playwright/test + @axe-core/playwright | 1.64.1 / 4.14.0 | Two-context real-time tests, a11y scans, visual check against design PNGs. |
| Containers | Docker (multi-stage) + docker compose | build: `node:24.22.0-alpine`; runtime: `gcr.io/distroless/nodejs24-debian13:nonroot` | Small, shell-less, non-root runtime image. Pin both by digest in M1. |
| CI | GitHub Actions | actions/checkout v7.0.1, actions/setup-node v7.1.0, pnpm/action-setup v6.1.0, aquasecurity/trivy-action v0.36.0, github/codeql-action v4.39.0 | Pin every action by full commit SHA (the March 2026 trivy-action tag hijack, GHSA-69fq-xp46-6x23, is why). |

No auth library: there are no passwords. Authentication is a random, high-entropy capability token exchanged for a per-event httpOnly session cookie (see 07-security.md).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>TanStack Query cache]
    ES[EventSource<br/>/stream]
    UI <--> ES
  end
  subgraph API["API container · Express 5 · non-root"]
    R[Routes + Zod schemas]
    MW[helmet · rate-limit · origin check · session resolver]
    D[Domain services<br/>claim, coverage, host]
    BUS[EventBus<br/>in-process]
    SSE[SSE hub<br/>per-event connections]
    CL[Cleanup job<br/>hourly]
    ST["express.static<br/>built SPA"]
  end
  DB[(PostgreSQL 18<br/>events · participants · sessions · slots · event_log)]

  UI -- fetch JSON + cookie --> MW --> R --> D
  D -- tx: lock event row, conditional UPDATE, seq++, log --> DB
  D -- after commit: publish --> BUS --> SSE
  SSE -- text/event-stream id: seq --> ES
  SSE -- replay seq > Last-Event-ID --> DB
  CL -- delete expired --> DB
  UI -. static assets .- ST
```

- **One origin.** In dev, Vite proxies `/api` to Express; in prod, Express serves the SPA with `express.static` (plus an SPA fallback to `index.html` for non-`/api` GETs). No CORS.
- **Write path:** every mutation runs in one transaction that locks the event row (`SELECT … FOR UPDATE`), applies a conditional change, increments `events.seq`, and inserts an `event_log` row. Only after `COMMIT` is the event published on the bus. Subscribers never see uncommitted state.
- **Read path:** `GET /api/events/:id` returns a snapshot with its `seq`. The SSE stream sends events with `id: <seq>`; the client ignores events with `seq ≤ snapshot.seq` (idempotent apply).
- **Fan-out:** `EventBus` is an interface (`publish(eventId, msg)`, `subscribe(eventId, fn)`), implemented in-process for the MVP. A `PgNotifyEventBus` can replace it for multiple instances without touching routes (out of scope).
- **Presence:** the SSE hub counts open connections per event and broadcasts `presence` (no `id`, not logged) at most every 5 s when the count changes.

## Signature challenge: race-safe live claims with gap-free reconnect

```mermaid
sequenceDiagram
  autonumber
  participant P as Priya (tab A)
  participant J as Jonah (tab B)
  participant API as Express
  participant DB as PostgreSQL
  participant HUB as SSE hub

  P->>API: GET /api/events/E (cookie)
  API->>DB: snapshot + seq=41
  API-->>P: 200 {slots, seq: 41}
  P->>HUB: GET /stream (EventSource)
  J->>HUB: GET /stream
  par both claim slot S at the same moment
    P->>API: POST /slots/S/claim {dish: "Mushroom pie"}
    J->>API: POST /slots/S/claim {dish: "Lentil stew"}
  end
  API->>DB: BEGIN, SELECT events WHERE id=E FOR UPDATE (Jonah's tx gets the lock)
  API->>DB: UPDATE slots SET claimed_by=Jonah WHERE id=S AND claimed_by IS NULL RETURNING *  → 1 row
  API->>DB: UPDATE events SET seq=seq+1 → 42, INSERT event_log(42, slot.claimed), COMMIT
  API->>HUB: publish {seq 42, slot.claimed S by Jonah}
  API-->>J: 200 {slot, seq: 42}
  API->>DB: (Priya's tx acquires lock) UPDATE … WHERE claimed_by IS NULL → 0 rows, ROLLBACK
  API-->>P: 409 SLOT_TAKEN {claimedBy: "Jonah"}
  HUB-->>P: id: 42 · event: slot.claimed
  HUB-->>J: id: 42 · event: slot.claimed
  Note over P: roll back optimistic card, show claim/error
  Note over P,HUB: Wi-Fi drops, seq 43–45 happen meanwhile
  P->>HUB: EventSource auto-reconnect, Last-Event-ID: 42
  HUB->>DB: SELECT event_log WHERE event_id=E AND seq>42 ORDER BY seq
  HUB-->>P: id: 43, 44, 45 (replayed), then live
  Note over HUB: if 42 < oldest retained seq → send event: resync, client refetches snapshot
```

Why both a row lock *and* a conditional update: the conditional `WHERE claimed_by IS NULL` alone guarantees one winner; the event-row lock additionally gives a gap-free, strictly increasing `seq` per event and makes the 3-claims-per-person limit race-free. Potluck boards are small (≤ 100 people, ≤ 40 slots), so serialising writes per event costs nothing noticeable. Trade-off noted: this would not suit a board with thousands of writers per second.

## Data model

```mermaid
erDiagram
  EVENTS ||--o{ PARTICIPANTS : has
  EVENTS ||--o{ SLOTS : has
  EVENTS ||--o{ EVENT_LOG : records
  PARTICIPANTS ||--o{ SESSIONS : "signed in via"
  PARTICIPANTS |o--o{ SLOTS : claims

  EVENTS {
    uuid id PK
    varchar title
    timestamptz starts_at
    varchar location
    bytea host_token_hash UK
    bytea invite_token_hash UK
    boolean locked
    bigint seq
    timestamptz created_at
    timestamptz expires_at
  }
  PARTICIPANTS {
    uuid id PK
    uuid event_id FK
    varchar display_name
    text_array dietary_needs
    participant_role role
    timestamptz created_at
  }
  SESSIONS {
    uuid id PK
    uuid participant_id FK
    bytea token_hash UK
    timestamptz created_at
    timestamptz expires_at
  }
  SLOTS {
    uuid id PK
    uuid event_id FK
    slot_category category
    smallint position
    uuid claimed_by FK
    varchar dish_name
    text_array dish_tags
    timestamptz claimed_at
  }
  EVENT_LOG {
    bigint id PK
    uuid event_id FK
    bigint seq
    varchar type
    jsonb payload
    timestamptz created_at
  }
```

### Tables, constraints and indexes

Enums: `slot_category = ('main','side','salad','dessert','drinks')`, `participant_role = ('host','guest')`. Dietary values (shared constant `DIETARY = ['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal']`).

**events**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` |
| title | varchar(80) | NOT NULL, CHECK `char_length(trim(title)) BETWEEN 1 AND 80` |
| starts_at | timestamptz | NOT NULL |
| location | varchar(120) | NULL |
| host_token_hash | bytea | NOT NULL, UNIQUE (SHA-256 of host token, 32 bytes) |
| invite_token_hash | bytea | NOT NULL, UNIQUE |
| locked | boolean | NOT NULL default false |
| seq | bigint | NOT NULL default 0 |
| created_at | timestamptz | NOT NULL default now() |
| expires_at | timestamptz | NOT NULL, = `starts_at + interval '14 days'` (set by service); index `events_expires_at_idx` |

**participants**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | NOT NULL, FK → events.id ON DELETE CASCADE |
| display_name | varchar(40) | NOT NULL, CHECK length 1–40 after trim |
| dietary_needs | text[] | NOT NULL default '{}', CHECK `dietary_needs <@ ARRAY['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal']` |
| role | participant_role | NOT NULL |
| created_at | timestamptz | NOT NULL default now() |

Indexes: UNIQUE `(event_id, lower(display_name))` → `NAME_TAKEN`; partial UNIQUE `(event_id) WHERE role = 'host'` (one host per board).

**sessions**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| participant_id | uuid | NOT NULL, FK → participants.id ON DELETE CASCADE |
| token_hash | bytea | NOT NULL, UNIQUE |
| created_at | timestamptz | NOT NULL default now() |
| expires_at | timestamptz | NOT NULL (= event.expires_at) |

**slots**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| event_id | uuid | NOT NULL, FK → events.id ON DELETE CASCADE |
| category | slot_category | NOT NULL |
| position | smallint | NOT NULL, CHECK 0–11 |
| claimed_by | uuid | NULL, FK → participants.id ON DELETE SET NULL |
| dish_name | varchar(60) | NULL |
| dish_tags | text[] | NOT NULL default '{}', CHECK `<@ DIETARY` |
| claimed_at | timestamptz | NULL |

Constraints: CHECK `(claimed_by IS NULL) = (dish_name IS NULL)` (no half-claims); UNIQUE `(event_id, category, position)`. Indexes: `slots_event_idx (event_id)`, `slots_claimed_by_idx (event_id, claimed_by) WHERE claimed_by IS NOT NULL` (claim limit count).

**event_log**
| Column | Type | Constraints |
|---|---|---|
| id | bigint | PK identity |
| event_id | uuid | NOT NULL, FK → events.id ON DELETE CASCADE |
| seq | bigint | NOT NULL |
| type | varchar(32) | NOT NULL, CHECK in (`slot.claimed`,`slot.released`,`slot.added`,`slot.removed`,`participant.joined`,`event.updated`,`invite.rotated`) |
| payload | jsonb | NOT NULL (no tokens, no dietary needs of other events) |
| created_at | timestamptz | NOT NULL default now() |

UNIQUE `(event_id, seq)` (also the replay index). Retention: the cleanup job deletes log rows older than 24 h; replay older than the oldest retained `seq` triggers `resync`.

**Limits (enforced in services and tests):** ≤ 40 slots per event, ≤ 12 per category, ≤ 100 participants, ≤ 3 claims per participant, ≤ 5 SSE connections per session, ≤ 20 SSE connections per IP.

## API contract

Base path `/api`. JSON only (`Content-Type: application/json` required on bodies; other types → 415). Errors use one shape:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Jonah just claimed this slot.", "requestId": "req-7f3a" } }
```

Session = cookie `dp_sess` with `Path=/api/events/<eventId>`, `HttpOnly`, `SameSite=Strict`, `Secure` (prod), `Max-Age` until event expiry. Mutations also require an `Origin` header equal to `APP_ORIGIN` (403 `BAD_ORIGIN`). "Auth: session" means a valid session for **that** event; otherwise 404 `NOT_FOUND` (never 403, so board ids can't be probed).

| # | Method & path | Auth | Request | Response | Errors | Rate limit |
|---|---|---|---|---|---|---|
| 1 | `POST /api/events` | none | `CreateEventInput { title, startsAt (ISO, future), location?, hostName, hostDietaryNeeds[], slots: {category, count}[] }` | 201 `{ eventId, inviteUrl, hostUrl }` + Set-Cookie (host session for the new event) | 400 `VALIDATION`, 415, 429 | 5 / hour / IP |
| 2 | `POST /api/host-links/:hostToken/session` | token | — | 200 `{ eventId }` + Set-Cookie (host) | 404 `NOT_FOUND`, 429 | 10 / min / IP |
| 3 | `GET /api/invites/:inviteToken` | token | — | 200 `{ title, startsAt, location, hostName, participantCount }` | 404 `INVITE_INVALID` (also used for expired — see note), 429 | 30 / min / IP |
| 4 | `POST /api/invites/:inviteToken/join` | token | `JoinInput { displayName, dietaryNeeds[] }` | 201 `{ eventId, participantId }` + Set-Cookie | 400, 404 `INVITE_INVALID`, 409 `NAME_TAKEN`, 409 `EVENT_FULL`, 429 | 10 / min / IP |
| 5 | `GET /api/events/:eventId` | session | — | 200 `Snapshot { event {id,title,startsAt,location,locked}, slots[], participants[{id,displayName,dietaryNeeds,role}], coverage, me {participantId, role}, seq }` | 404 | 120 / min / session |
| 6 | `GET /api/events/:eventId/stream` | session | header `Last-Event-ID?` | 200 `text/event-stream`: `retry: 3000`, events `slot.claimed`, `slot.released`, `slot.added`, `slot.removed`, `participant.joined`, `event.updated`, `event.deleted`, `presence`, `resync`; comment heartbeat every 20 s | 404, 429 `TOO_MANY_STREAMS` | 5 concurrent / session, 20 / IP |
| 7 | `POST /api/events/:eventId/slots/:slotId/claim` | session | `ClaimInput { dishName (1–60), dishTags[] }` | 200 `{ slot, seq }` | 400, 404, 409 `SLOT_TAKEN {claimedBy}`, 409 `CLAIM_LIMIT`, 423 `BOARD_LOCKED`, 403 `BAD_ORIGIN` | 30 / min / session |
| 8 | `DELETE /api/events/:eventId/slots/:slotId/claim` | session (owner or host) | — | 200 `{ slot, seq }` | 403 `NOT_OWNER`, 404, 409 `NOT_CLAIMED`, 423 `BOARD_LOCKED` | 30 / min / session |
| 9 | `PATCH /api/events/:eventId` | host | `{ locked: boolean }` | 200 `{ event, seq }` | 400, 403 `HOST_ONLY`, 404 | 30 / min / session |
| 10 | `POST /api/events/:eventId/slots` | host | `{ category }` | 201 `{ slot, seq }` | 403 `HOST_ONLY`, 409 `SLOT_LIMIT` | 30 / min / session |
| 11 | `DELETE /api/events/:eventId/slots/:slotId` | host | — | 200 `{ seq }` | 403, 404, 409 `SLOT_CLAIMED` | 30 / min / session |
| 12 | `POST /api/events/:eventId/invite/rotate` | host | — | 200 `{ inviteUrl, seq }` | 403, 404 | 5 / hour / event |
| 13 | `DELETE /api/events/:eventId` | host | `{ confirmTitle }` | 204 (all connected streams receive `event.deleted` and close) | 400 `CONFIRM_MISMATCH`, 403, 404 | 5 / hour / session |
| 14 | `GET /api/health` | none | — | 200 `{ status: "ok", db: "ok" }` | 503 | none (not exposed through proxy logs) |

Notes:
- Expired events and rotated invites both return 404 `INVITE_INVALID` from #3/#4 so the response doesn't say whether a board ever existed. The UI shows the same `join/error` screen.
- SSE event payloads: `slot.claimed {slot: {id, category, position, claimedBy: {id, displayName}, dishName, dishTags}}`, `slot.released {slotId}`, `slot.added {slot}`, `slot.removed {slotId}`, `participant.joined {participant}`, `event.updated {locked}`, `presence {count}`, `resync {}`, `event.deleted {}`. Coverage is recomputed client-side with the shared `computeCoverage` function.

### Shared domain interfaces (`packages/shared`)

```ts
export const DIETARY = ['vegetarian','vegan','gluten_free','dairy_free','nut_free','halal'] as const;
export type Dietary = typeof DIETARY[number];
export type CoverageStatus = 'ok' | 'thin' | 'gap';
export interface NeedCoverage { need: Dietary; guests: number; dishes: number; mains: number; status: CoverageStatus; }
export function effectiveTags(tags: Dietary[]): Set<Dietary>;          // vegan ⇒ vegetarian + dairy_free
export function computeCoverage(participants: {dietaryNeeds: Dietary[]}[], slots: SlotView[]): NeedCoverage[]; // sorted gap → thin → ok, then guests desc
export function topHint(coverage: NeedCoverage[]): { need: Dietary; categories: 'main' | 'any' } | null;
export function applyBoardEvent(state: BoardState, msg: BoardEvent): BoardState; // pure, ignores seq <= state.seq
```

Coverage rule: `guests = 0` → omitted; `dishes = 0` → `gap`; `mains = 0` or `dishes = 1` → `thin`; otherwise `ok`.

### API service interfaces (`apps/api/src/domain`)

```ts
interface ClaimService {
  claim(eventId: string, slotId: string, actor: Actor, input: ClaimInput): Promise<{ slot: SlotView; seq: number }>; // throws SlotTaken | ClaimLimit | BoardLocked | NotFound
  release(eventId: string, slotId: string, actor: Actor): Promise<{ slot: SlotView; seq: number }>;     // throws NotOwner | NotClaimed | BoardLocked
}
interface EventBus { publish(eventId: string, msg: BoardEvent): void; subscribe(eventId: string, fn: (m: BoardEvent) => void): () => void; }
interface EventLogRepo { since(eventId: string, seq: number): Promise<BoardEvent[] | 'too_old'>; }
```

## Repository structure

```
dishpatch/
├── AGENTS.md
├── README.md
├── 01-product.md … 08-agent-plan.md
├── design/                      # mockup.html, screens/*.png, overview.png
├── skills/                      # skill plan, cards, usage-log.md, custom/
├── .github/{workflows/ci.yml, dependabot.yml}
├── .gitignore  .gitattributes  .nvmrc  .env.example  biome.json
├── docker-compose.yml           # db (postgres:18.6-alpine) + api
├── docker-compose.ci.yml        # CI overrides (no host ports for db, test env)
├── Dockerfile                   # multi-stage → distroless nonroot
├── package.json  pnpm-workspace.yaml  tsconfig.base.json  vitest.config.ts   # Vitest projects: shared, api-unit, api-int, web
├── packages/
│   └── shared/
│       ├── src/{schemas.ts, dietary.ts, coverage.ts, board-events.ts, index.ts}
│       └── test/{coverage.test.ts, board-events.test.ts, schemas.test.ts}
├── apps/
│   ├── api/
│   │   ├── drizzle.config.ts
│   │   ├── migrations/                       # generated SQL, committed
│   │   ├── src/
│   │   │   ├── server.ts  app.ts  env.ts
│   │   │   ├── middleware/{security.ts, session.ts, rate-limits.ts, origin-check.ts, validate.ts, errors.ts}
│   │   │   ├── db/{schema.ts, client.ts}
│   │   │   ├── domain/{tokens.ts, events.ts, participants.ts, claims.ts, host.ts, errors.ts}
│   │   │   ├── realtime/{event-bus.ts, sse-hub.ts, event-log.ts}
│   │   │   ├── routes/{events.ts, invites.ts, host-links.ts, slots.ts, stream.ts, health.ts}
│   │   │   └── jobs/cleanup.ts
│   │   └── test/{helpers/, *.int.test.ts, *.test.ts}
│   └── web/
│       ├── index.html  vite.config.ts
│       ├── src/
│       │   ├── main.tsx  router.tsx  format.ts  api/{client.ts, created-board.ts, joined-boards.ts, queries.ts, use-board-stream.ts}
│       │   ├── styles/{tokens.css, app.css}
│       │   ├── components/{Button, TextField, Stepper, Chip, Tag, SlotCard, CategoryGroup, CoverageMeter, ConnectionIndicator, Banner, Toast, Dialog, LinkBox, Switch, Avatar, Skeleton}.tsx
│       │   └── screens/{CreateScreen, ShareScreen, JoinScreen, HostLinkScreen, BoardScreen, ClaimDialog, CoverageScreen, HostScreen, NotFoundScreen}.tsx
│       └── test/                             # component tests (*.test.tsx)
└── e2e/
    ├── playwright.config.ts
    └── specs/{create-board, join, realtime, claim-race-ui, reconnect, host-controls, a11y, visual}.spec.ts
```

## Environment variables

Names only; real values live in the developer's `.env` (git-ignored) and in CI secrets.

| Name | Used by | Purpose |
|---|---|---|
| `NODE_ENV` | api | `development` / `test` / `production` |
| `PORT` | api | HTTP port (default 3000) |
| `DATABASE_URL` | api, drizzle-kit | Postgres connection string |
| `APP_ORIGIN` | api | Exact origin for Origin checks and link building (e.g. `http://localhost:5173`) |
| `COOKIE_SECURE` | api | `true` in production (forces `Secure` cookies) |
| `TRUST_PROXY` | api | `true` only when behind a known reverse proxy (affects client IP for rate limits) |
| `LOG_LEVEL` | api | pino level |
| `CLEANUP_INTERVAL_MINUTES` | api | Cleanup job period (default 60) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | docker compose db | Local database only |

`.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://dishpatch:change-me@localhost:5432/dishpatch
APP_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
TRUST_PROXY=false
LOG_LEVEL=info
CLEANUP_INTERVAL_MINUTES=60
POSTGRES_USER=dishpatch
POSTGRES_PASSWORD=change-me
POSTGRES_DB=dishpatch
```

`env.ts` validates these with Zod at boot and exits with a clear message if any is missing; it never logs values.
