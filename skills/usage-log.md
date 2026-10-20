# Skills usage log — Day 01 · Dishpatch

Add one row every time a skill is used (see AGENTS.md). Outcome is one of `helped`, `neutral`, `hurt`. Rating is 1–5. After using a skill for the first time, set its status in `skills/README.md` to `used` (or `skipped (reason)` at the end of the day if it was never needed).

| date | milestone | skill | what it did | outcome (helped / neutral / hurt) | rating 1–5 | notes |
|---|---|---|---|---|---|---|
| 2026-10-20 | M2 | tdd | Red → green per F1 seam: schemas.test, tokens.test, events.service/events/host-links int tests written before the code | helped | 4 | Vertical slices kept each commit green; seams came straight from 05-features.md |
| 2026-10-20 | M2 | design-parity | Playwright screenshots of create (default/error), share (default/copied), notfound × light/dark/mobile vs design/screens; 4 differences fixed (Copy button outline, link display, placeholders, small-text line-height) | helped | 4 | Accepted: native datetime-local rendering, Intl date punctuation ("Sat, 21 Nov"), focus scroll on error |
| 2026-10-20 | M2 | code-review | Standards + spec review of main...m2-create-board in parallel sub-agents | helped | 4 | Fixed: host-link 500/offline showed notfound, unparsed API responses, beforeunload returnValue, DoD/usage log not yet ticked |
