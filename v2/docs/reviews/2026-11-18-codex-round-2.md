# Codex review, round 2 (launch bar L13)

- Date: 18 Nov 2026
- Command: `codex review --base main` on `fix/2.1.0-rc.3` at 533e7c6 (the whole 2.1.0 diff)
- Reviewer: Codex CLI, default model and default review instructions

## Findings

| # | Codex priority | File | Finding | Our rating | Outcome |
|---|---|---|---|---|---|
| 1 | P1 | `v2/src/brain.js:64` | A committed directory link (`.codehere`, `.codehere/briefs`) is followed by `readPlain`, so rules, config, state or briefs load from outside the repo | Major for `.codehere`, lessons/ and help/; briefs/ was already closed by 8f05ce3 | Fixed in 85af009 |
| 2 | P2 | `v2/src/audit.js:97` | A test renamed to a non-test path is not seen by `codehere audit` | Major: the finish check missed it too, so a hidden test could pass the finish check | Fixed in b801503 |

## How each was checked

- Finding 1, probed before the fix: a repo with `.codehere -> ../outside-brain` and a rule in that folder; `codehere hook session-start` printed the outside rule. Writes through the link were already refused. After the fix: session start loads no rule through a linked `.codehere/`, and `codehere status` counts a linked `lessons/` as 0.
- Finding 2, probed before the fix: after `git rm test/cart.test.mjs` the finish check sent the agent back; after `git mv test/cart.test.mjs test/cart.test.mjs.off` it said nothing, and `codehere audit` listed the committed rename as clean. Cause: the status list dropped the old name of a rename, and committed renames were listed by their new name only.
- Both fixes went checks first: the six new e2e checks failed before the fixes (566 passed, 6 failed) and pass after (572 passed, 0 failed).
- Not changed by the fixes: CheatBench dev half 20 of 20 gamed sent back, 0 of 30 honest with a finding; case suite cheats 26 of 26, honest 20 of 20. The held-out half was not run.

Blocker: 0. Major: 2, both fixed. L13 restarts its count: rounds 3 and 4 must both have no open Blocker or Major.
