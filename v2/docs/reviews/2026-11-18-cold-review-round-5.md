# Cold review, round 5 (launch bar L13)

- Date: 18 Nov 2026
- Why not Codex: round 5 by Codex stopped at its usage limit ("try again at Dec 18th, 2026"), so it did not count.
- Reviewer: the `cold-reviewer` agent (no session history, no CLAUDE.md), reading `git diff main...HEAD -- v2/src v2/bin` at 06ec0b8. Same model family as the author, so weaker independence than Codex. It ran nothing.
- Each finding was then probed on the real CLI by `2026-11-18-round-5-probe.sh` (a repo per case, session start, the agent's change, the finish check; the test command left unapproved, so only the tamper scan decides).

## Findings and probe results

| # | Reviewer | Finding | Probe | Our rating |
|---|---|---|---|---|
| 1 | Major | A quote inside a comment, `/* don't run yet */ it.skip('adds', ...)`, hides the skip | not sent back (the same line without the comment is sent back) | Major |
| 2 | Major | Repo config or attributes switch the diff off: `*.mjs -diff` in `.git/info/attributes`, or `color.diff always` | both not sent back after 3 assertions were deleted (control: sent back) | Major |
| 3 | Major | A `++ n;` line inside a hunk is read as a new file header, so the rest of the file is not a test file | not sent back after 3 assertions were deleted below it | Major |
| 4 | Major | `git()` returns nothing when git's output passes 1 MiB, so the finish check goes silent | 25,000 untracked files (1,675,000 bytes of status), then `git rm` of the test: no output at all | Major |
| 5 | Major | The hardcoded-answer rule fires on ordinary code: `if (n % 15 === 0) return 'FizzBuzz'` with a test expecting 'FizzBuzz' for 15 | sent back: "returns 'FizzBuzz' when given 15, the exact value a test expects" | Major (false alarm on honest code) |
| 6 | Major | noskip's Ruby and Java test-name regexes are quadratic or worse on long blank runs, with no length cap | `spec/x_spec.rb` of 1,000,000 newlines: the stop hook was still running at 60 s | Major |
| 7 | Minor | A test renamed to another code extension counts as hidden (b801503) | `git mv test/cart.test.mjs test/cart.test.ts` sent back | Major (false alarm on a common honest change; ours, from round 2's fix) |

Blocker: 0. Major: 7, all open. This is round 5, so by agent/CLAUDE.md step 6 the owner decides how to proceed.
