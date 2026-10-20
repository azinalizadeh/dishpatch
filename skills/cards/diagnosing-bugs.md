---
id: diagnosing-bugs
name: /diagnosing-bugs
source: mattpocock/skills
url: https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md
install: claude plugin install mattpocock-skills@claude-plugins-official
license: MIT
category: Engineering
invocation: model
stacks: [any]
summary: A phase-gated debugging loop that builds a reliable failing command before any theorising, then fixes with a regression test.
recommendedIn: [1]
firstSeen: 2026-10-21
---

# /diagnosing-bugs

**What it does.** Forces a feedback loop first: a fast, deterministic command that is red while the bug exists. Then it minimises the repro, lists a few ranked hypotheses with predictions, tests them one variable at a time with tagged debug logs, fixes the bug with a regression test at the right seam, and cleans up. For flaky bugs it aims to raise the failure rate instead of waiting for a clean repro.

**Use it for (only when it happens):** a flaky or unexplained failure in `sse.replay.int.test.ts`, `reconnect.spec.ts`, `realtime.spec.ts` (M4) or `claim.race.int.test.ts` (M5).
**Don't use it for:** ordinary red tests during the `/tdd` loop, or type/lint errors.

**Example prompt (Dishpatch):**
> Use /diagnosing-bugs. `claim.race.int.test.ts › 50 concurrent claims on one slot yield exactly one 200` fails about 1 in 10 runs with two 200s. The loop: `for i in $(seq 30); do pnpm --filter @dishpatch/api test:race || exit 1; done`. Suspects: the event-row lock is taken outside the transaction, or the claim count runs before the lock.

**Gotchas.**
- Its debug logs carry a unique prefix — make sure the cleanup step removes all of them before committing.
- It may ask before testing hypotheses; in an unattended run tell it to proceed.
- Never paste `.env` values or cookies into the repro; it redacts, but don't rely on that.
