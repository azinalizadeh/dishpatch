---
id: retro
name: /retro
source: mattpocock/skills
url: https://github.com/mattpocock/skills/blob/main/skills/engineering/retro/SKILL.md
install: claude plugin install mattpocock-skills@claude-plugins-official
license: MIT
category: Productivity
invocation: user
stacks: [any]
summary: Reviews a finished coding session's logs and proposes ranked improvements to the agent's environment (checks, standards, AGENTS.md, tooling).
recommendedIn: [1]
firstSeen: 2026-10-21
---

# /retro

**What it does.** Reads the session logs on your machine and looks for friction: files the agent struggled to find, mistakes a lint/type/test check could have caught, instructions in AGENTS.md that changed nothing, expensive tool use, and missing access to useful information. It returns a list of candidate fixes, most severe first. It is user-invoked only.

**Use it for:** the end of M7, after `v1-mvp` is tagged. Copy the top 3 suggestions into `skills/usage-log.md` notes and into the next day's AGENTS.md template.
**Don't use it for:** mid-milestone status checks.

**Example prompt (Dishpatch):**
> /retro for today's Dishpatch session. Focus on where the agent drifted from 05-features.md, any DoD box it ticked without evidence, and which checks would have caught the SSE/race bugs earlier.

**Gotchas.**
- It works on local session logs, so run it on the machine where you built the project.
- It loads Matt's `writing-for-agents` guidance first; suggestions come back phrased as agent instructions — review before pasting them into AGENTS.md.
