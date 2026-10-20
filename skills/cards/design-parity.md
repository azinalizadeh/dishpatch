---
id: design-parity
name: design-parity
source: custom
url: https://github.com/azinalizadeh/20-days-20-projects/blob/main/day-01-dishpatch/skills/custom/design-parity/SKILL.md
install: mkdir -p .claude/skills/design-parity && cp skills/custom/design-parity/SKILL.md .claude/skills/design-parity/SKILL.md
license: unknown
category: Design
invocation: both
stacks: [web]
summary: Screenshots each implemented screen state in light, dark and mobile with Playwright and compares it side by side with the matching design PNG before a UI subtask is called done.
recommendedIn: [1]
firstSeen: 2026-10-21
---

# design-parity (custom)

**What it does.** Turns the DoD line "UI matches design/screens/*.png for all states, including dark mode" into a routine: it maps a screen id to its design PNGs, drives the running app into each state with Playwright, saves matching screenshots, puts each pair into one side-by-side HTML report, and makes the agent list concrete differences (spacing, colour token, missing state, copy) and fix them before ticking the box.

**Use it for:** every `[ui]` subtask (F1.6, F1.7, F2.5, F3.6, F4.6, F5.4, F6.4) and the M7 polish pass.
**Don't use it for:** pixel-perfect gating in CI (fonts and live data differ), or non-UI work.

**Example prompt (Dishpatch):**
> Use design-parity for `board` (states: default, loading, empty, offline, locked, conflict). The design PNGs are design/screens/board*.png. Seed data with the mockup-board fixture. Report differences ordered by severity, fix them, re-run, and attach the report path to the usage-log row.

**Gotchas.**
- Seed the same data as the mockup (`packages/shared/test/fixtures/mockup-board.ts`), otherwise every card "differs".
- States that depend on timing (offline, conflict) need `context.setOffline` or a second context; see the SKILL.md recipes.
- Drafted on Day 1 — note in the usage log what was missing so it can be improved for the next web day.
