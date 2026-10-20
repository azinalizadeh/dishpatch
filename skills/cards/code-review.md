---
id: code-review
name: /code-review
source: mattpocock/skills
url: https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md
install: claude plugin install mattpocock-skills@claude-plugins-official
license: MIT
category: Engineering
invocation: model
stacks: [any]
summary: Reviews the diff since a fixed point on two separate axes, coding standards and fidelity to the spec, using parallel sub-agents.
recommendedIn: [1]
firstSeen: 2026-10-21
---

# /code-review

**What it does.** Takes a fixed point (commit, branch or tag), diffs `HEAD` against it, and runs two reviewers in parallel: one checks the repo's written standards plus a baseline of classic code smells, the other checks whether the change does what the spec asked — no missing pieces, no unrequested extras. The two reports are shown side by side, not merged.

**Use it for:** the last step of M2–M6, before merging the milestone branch into `main` (fixed point = `main`), and in M7 for a whole-project review (fixed point = tag `v0-docs`).
**Don't use it for:** a diff that is empty or only docs; as a replacement for lint/typecheck (it skips what tooling enforces).

**Example prompt (Dishpatch):**
> Run /code-review with fixed point `main`. The spec is the F4 section of 05-features.md plus the claim sequence diagram in 04-architecture.md. Standards are AGENTS.md › Code conventions and 07-security.md › Concrete settings. Flag anything that publishes an SSE event before the transaction commits.

**Gotchas.**
- It looks for `docs/agents/issue-tracker.md`; run `/setup-matt-pocock-skills` once in M1 (choose "Local markdown"), and always pass the spec path explicitly.
- Findings marked as smells are judgement calls; fix hard spec gaps first.
- The diff it reviews is three-dot (`main...HEAD`), so commit your work before running it.
