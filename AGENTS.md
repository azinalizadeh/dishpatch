# AGENTS.md — Dishpatch

Standing instructions for any AI coding agent working in this repo. Read this first, every session.

## What we're building

Dishpatch: a live potluck board. Hosts create a board with slots; guests join from a link without an account, claim slots in real time (race-safe), and see dietary coverage gaps. Specs: `01-product.md` → `08-agent-plan.md`. Work milestone by milestone from `08-agent-plan.md`.

## Stack (exact versions in 04-architecture.md › Stack)

Node 24.22.0 · pnpm 12.14.0 workspaces · TypeScript 6.0.3 (strict) · React 19.3 + Vite 8.3 + React Router 8.5 + TanStack Query 5 + Tailwind 4.3 · Express 5.3 + Zod 4.6 + hand-written SSE · PostgreSQL 18.6 + Drizzle ORM 0.45 + postgres.js · Vitest 5 · Testcontainers 12 · Playwright 1.64 · Biome 2.5 · Docker (distroless nonroot) · GitHub Actions.

**Don't add dependencies outside the stack table.** If you think one is needed, stop and explain why in your reply instead of installing it.

## Commands

```bash
corepack enable && pnpm install          # install
cp .env.example .env                     # local env (never commit .env)
docker compose up -d db && pnpm db:migrate
pnpm dev                                 # api :3000 + web :5173 (proxy /api)
pnpm build                               # all packages
pnpm lint && pnpm lint:sql && pnpm typecheck
pnpm format                              # biome format --write .
pnpm test                                # unit + component
pnpm test:cov                            # with coverage thresholds
pnpm test:int                            # API/integration (needs Docker)
pnpm --filter @dishpatch/api test:race   # race tests
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build --wait && pnpm test:e2e   # CI override: per-test client IPs for rate limits
pnpm db:generate                         # after changing apps/api/src/db/schema.ts
```

Run `pnpm lint && pnpm typecheck && pnpm test` before every commit; run `pnpm test:int` before every commit that touches `apps/api`.

## Code conventions

- TypeScript strict; no `any` (use `unknown` + Zod). Named exports only. Files `kebab-case.ts`, React components `PascalCase.tsx`.
- **Schemas live once** in `packages/shared/src/schemas.ts`; the API and the web app import them. Never duplicate a validation rule.
- Domain logic in `apps/api/src/domain/*` takes an `Actor` and plain inputs, returns plain data, throws typed `DomainError`s (`apps/api/src/domain/errors.ts`). Routes are thin: parse → resolve actor → call service → map result.
- Every mutation: one transaction → lock event row → change → `seq + 1` → `event_log` row → commit → **then** publish. Never publish inside the transaction.
- SQL only through Drizzle / postgres.js tagged templates. `sql.raw(` and `.unsafe(` are banned (`pnpm lint:sql`).
- UI: components in `apps/web/src/components`, screens in `apps/web/src/screens`; style with Tailwind utilities mapped to the CSS tokens in `styles/tokens.css` — no hard-coded hex values in components.
- Error copy comes from 03-design.md / 01-product.md; never show raw error codes or stack traces to users.
- Logs: use the pino-http logger (`req.log`); never log request bodies, tokens, cookies or names.

## Rules

1. **Before any UI work, read `03-design.md` (the screen's section) and open the matching `design/screens/<id>*.png`** (light, dark, mobile, and each state). `design/mockup.html` is the clickable reference.
2. **Write the tests listed for a subtask in `05-features.md` before or alongside the code.** Use the exact test names given there; they are the agreed seams.
3. **A feature is not done until every DoD box in `05-features.md` is checked. Tick them in the file** (`- [x]`) in the same commit that makes them true. Don't tick a box without evidence (a green test, a screenshot, a command output).
4. **Follow `07-security.md`.** Every STRIDE mitigation has a named test — keep them green. **Never commit secrets**: `.env` stays local, `.env.example` has placeholders only. Before each commit run `git status` and make sure no `.env`, keys or tokens are staged.
5. **Use the skills in `skills/README.md` where they're listed** (milestone briefs say which). After each use, add a row to `skills/usage-log.md` and set the skill's status in `skills/README.md` to `used`. If a listed skill turns out not to help, mark it `skipped (reason)`.
6. Don't change the design tokens or PNGs to match your code; change the code. If the design is wrong, say so.
7. Don't widen scope: anything in 01-product.md › Non-goals stays out.
8. Don't relax, skip or delete a test to get green. Fix the code or explain the blocker.

## Git workflow (standalone repo)

This folder was generated inside the shared `20-days-20-projects` repo. To start building, copy it out and make it its own repo:

```bash
cp -R day-01-dishpatch ~/code/dishpatch && cd ~/code/dishpatch
git init -b main
git add -A && git status          # check: no .env, no keys
git commit -m "docs: project package (Dishpatch)"
git tag v0-docs
```

Then, for every milestone in `08-agent-plan.md`:

- **One branch per milestone:** `m1-scaffold`, `m2-create-board`, `m3-join`, `m4-live-board`, `m5-claims`, `m6-coverage-host`, `m7-hardening` — branched from the latest `main`.
- **Conventional Commits** with the feature/subtask id in the scope: `feat(F2.3): join route with path-scoped session cookie`, `test(F4.4): 50 concurrent claims yield one winner`, `fix(F3.4): replay from Last-Event-ID in seq order`, `docs(F1): tick DoD`, `chore(M1): biome config`, `ci(M1): pin actions by SHA`, `refactor(F5.1): extract effectiveTags`. Types: feat, fix, test, docs, chore, refactor, ci.
- **Commit after every green subtask** (tests + lint + typecheck pass).
- **Merge to `main` only when every DoD box of the features covered by that milestone is ticked** (`git merge --no-ff m2-create-board`). Run `/code-review` against `main` before merging.
- **Tag `v1-mvp`** on `main` when M7 is merged.
- **Never force-push and never rewrite `main`** (no rebase/amend of pushed commits, no `reset --hard` on `main`).

## Agent skills

### Issue tracker

Local markdown: issues and specs live as files under `.scratch/<feature>/` (no remote tracker yet). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
