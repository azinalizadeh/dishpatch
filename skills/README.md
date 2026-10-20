# Skills plan — Day 01 · Dishpatch

> Role: AI Tooling Lead. Each skill below was opened at its source on 2026-10-20 and is recommended only where it clearly helps a named milestone or subtask (fit ≥ 4/5). Status is updated by the implementing agent (`recommended` → `used` / `skipped (reason)`), and every use is logged in [usage-log.md](usage-log.md).

## Install (do this in Milestone 1)

```bash
# Matt Pocock's skills (MIT) — Claude Code plugin, installs the whole set; we use 4 of them
claude plugin install mattpocock-skills@claude-plugins-official
# then, inside Claude Code in the repo, once:
/setup-matt-pocock-skills      # pick "Local markdown" as the issue tracker (no remote yet); accept single-context docs.
                               # It writes docs/agents/*.md and adds an "## Agent skills" block to AGENTS.md — keep it.

# Custom skill drafted today (project-local)
mkdir -p .claude/skills/design-parity
cp skills/custom/design-parity/SKILL.md .claude/skills/design-parity/SKILL.md
```

## Plan

| Skill | Source | Install | Where it's used | Why it fits this project | Fit | Status |
|---|---|---|---|---|---|---|
| [`/tdd`](cards/tdd.md) | [mattpocock/skills · engineering/tdd](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md) | plugin above | M2–M6: F1.1, F1.3–F1.5, F2.1–F2.4, F3.1–F3.5, F4.1–F4.5, F5.1–F5.2, F6.1–F6.3 | The core of today is a correctness problem (one winner per slot, gap-free replay, coverage rules) whose seams and test names are already listed in 05-features.md, which is exactly the red-green vertical-slice loop this skill drives. | 5 | recommended |
| [`/code-review`](cards/code-review.md) | [mattpocock/skills · engineering/code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) | plugin above | End of M2–M6 (before merging each milestone branch) and M7 full review against `main@v0-docs` | It reviews a diff on two separate axes (coding standards and fidelity to a spec), and 05-features.md is a precise spec to check each milestone against. | 4 | recommended |
| [`/diagnosing-bugs`](cards/diagnosing-bugs.md) | [mattpocock/skills · engineering/diagnosing-bugs](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md) | plugin above | Conditional: M4 (F3.4, F3.7 SSE replay/reconnect) and M5 (F4.4 race tests) when a test is flaky or red for an unclear reason | SSE ordering and DB races are the classic non-deterministic bugs; its "build a red-capable loop first, raise the repro rate" discipline stops the agent from guessing. | 4 | recommended |
| [`/retro`](cards/retro.md) | [mattpocock/skills · engineering/retro](https://github.com/mattpocock/skills/blob/main/skills/engineering/retro/SKILL.md) | plugin above | M7, after the last merge | Day 1 of 20: a ranked list of environment fixes (missing checks, AGENTS.md no-ops, tool waste) compounds over the next 19 projects. | 4 | recommended |
| [`design-parity`](cards/design-parity.md) | custom — [skills/custom/design-parity/SKILL.md](custom/design-parity/SKILL.md) | `cp` above | M2–M6 every `[ui]` subtask (F1.6, F1.7, F2.5, F3.6, F4.6, F5.4, F6.4); M7 final pass | The DoD requires every screen/state to match `design/screens/*.png` in light, dark and mobile; this skill makes that a repeatable screenshot-and-compare step instead of eyeballing. | 4 | recommended |

## Considered but rejected

| Skill | Source | Reason |
|---|---|---|
| `/implement` | mattpocock/skills | Builds from a spec/tickets with its own loop; 08-agent-plan.md already sequences the work, and running both would duplicate planning. |
| `/to-tickets`, `/to-spec`, `/wayfinder` | mattpocock/skills | The spec and ticket breakdown already exist (05-features.md). |
| `/grill-with-docs`, `/grill-me` | mattpocock/skills | Product and design decisions are made; interviewing would reopen them on a one-day build. |
| `/prototype` | mattpocock/skills | The clickable prototype already exists (design/mockup.html). |
| `/handoff` | mattpocock/skills | Each milestone brief in 08-agent-plan.md is already a self-contained handoff. |
| `/pr` | mattpocock/skills | Milestones merge locally into `main`; no pull requests are planned. Revisit if you push milestone branches for review. |
| `frontend-design` | anthropics/skills | Steers toward fresh aesthetic choices; the design system is fixed in 03-design.md and changing it mid-build would break parity with the PNGs. |
| `webapp-testing` | anthropics/skills | Uses Python Playwright scripts; this repo already has `@playwright/test` (TS), and `design-parity` covers screenshot checks without a second toolchain. |
| `startup-hook-skill` | local (~/.claude/skills) | For Claude Code cloud sessions; the build runs locally. |
| `skill-creator` | local (~/.claude/skills) | Only needed if `design-parity` gets evals; not today. |
