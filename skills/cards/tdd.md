---
id: tdd
name: /tdd
source: mattpocock/skills
url: https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md
install: claude plugin install mattpocock-skills@claude-plugins-official
license: MIT
category: Testing
invocation: model
stacks: [any]
summary: Drives red-green test-driven development one vertical slice at a time through a module's public interface.
recommendedIn: [1]
firstSeen: 2026-10-21
---

# /tdd

**What it does.** Runs a strict loop: agree on the public seams to test, write one failing test, write the least code that passes it, repeat. It pushes tests to describe behaviour through public interfaces and warns against tests that mirror the implementation or recompute the expected value the same way the code does. Refactoring is left to the review step.

**Use it for:** every `[domain]`/`[api]` subtask in M2–M6 that lists test names in 05-features.md — above all `ClaimService` (F4.2–F4.4), `applyBoardEvent` (F3.1), the SSE replay (F3.4) and `computeCoverage` (F5.1).
**Don't use it for:** pure layout work in `[ui]` subtasks (use `design-parity`), scaffolding (M1), or spikes where you don't know the seam yet.

**Example prompt (Dishpatch):**
> Use /tdd for F4.2. The confirmed seams are `ClaimService.claim` and `ClaimService.release` (04-architecture.md › API service interfaces). Work through the tests listed under F4 in 05-features.md in order, starting with `claims.int.test.ts › claim stores dish, tags, claimant and increments seq by 1`. Use the Testcontainers helper in `apps/api/test/helpers`. Take expected values from the spec or the mockup fixture, never from the code.

**Gotchas.**
- The skill asks you to confirm seams before writing tests. In this project the seams and test names in 05-features.md count as confirmed — say so in the prompt so the agent doesn't stall.
- It reads `CONTEXT.md` for domain terms if present; the domain words here are *board, slot, claim, participant, host, coverage, seq*.
- Refactor is out of the loop by design; run `/code-review` at the end of the milestone to catch the cleanup.
