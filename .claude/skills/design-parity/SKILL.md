---
name: design-parity
description: Compare an implemented web screen against its design PNGs (light, dark, mobile, and every listed state) using Playwright screenshots and a side-by-side HTML report, then fix the differences. Use when finishing any UI subtask in a project that has design/screens/<screen-id>[-state][-mobile][-dark].png files, or when asked whether the UI "matches the design".
---

# Design parity check

Goal: before a UI subtask is marked done, every state of the screen looks like its design PNG in light, dark and mobile. This is a review aid, not a pixel-diff gate.

## Inputs
- Screen id (e.g. `board`) and its states, from `03-design.md` (the screen's "States" list).
- Design PNGs: `design/screens/<id>.png`, `<id>-dark.png`, `<id>-mobile.png`, `<id>-<state>.png`, `<id>-<state>-mobile.png`, `<id>-<state>-dark.png` (use the ones that exist).
- Viewports: desktop 1440×900, mobile 390×844 (or the sizes stated in 03-design.md).
- A seed fixture that reproduces the mockup's data.

## Steps
1. **List pairs.** Glob `design/screens/<id>*.png`. For each file derive `{state, viewport, colorScheme}` from the suffixes. Print the list; missing designs for a state listed in 03-design.md are a finding.
2. **Start the app** the project's normal way (e.g. `docker compose up -d --wait` or `pnpm dev`) and seed the fixture data through the public API, never by writing to the DB.
3. **Drive each state** with a small `@playwright/test` spec at `e2e/specs/visual.spec.ts` (create it if missing; one `test()` per pair). Recipes:
   - loading → `page.route('**/api/**', r => setTimeout(() => r.continue(), 5000))` and screenshot immediately.
   - empty → seed a board with no claims.
   - error → `page.route` returning the documented error code (e.g. 404 `INVITE_INVALID`).
   - offline/reconnecting → load, then `context.setOffline(true)` and wait past the debounce.
   - conflict/race → a second browser context performs the competing action.
   - dark → `test.use({ colorScheme: 'dark' })`; mobile → `test.use({ viewport: { width: 390, height: 844 }, isMobile: true })`.
   Use `reducedMotion: 'reduce'` and wait for `document.fonts.ready` before each screenshot. Save to `e2e/visual-output/<same-file-name>.png`.
4. **Build the report.** Write `e2e/visual-output/report.html` with one row per pair: design image left, implementation right, file names as captions. Open both images yourself and compare them.
5. **List differences** as a table ordered by severity: missing/incorrect state > wrong component or copy > layout/spacing > colour token > minor. Name the CSS token or component responsible for each.
6. **Fix, re-run steps 3–5** until only accepted differences remain (live data, font hinting, timestamps). Write accepted differences under the screen in the report.
7. **Record.** Add a row to `skills/usage-log.md` (milestone, screen, number of differences fixed, outcome, rating) and tick the DoD line only after this.

## Rules
- Compare against the PNG, not against your memory of the design doc.
- Don't change the design PNGs or tokens to match the implementation. If the design is wrong, say so and ask.
- Keep `e2e/visual-output/` git-ignored.
