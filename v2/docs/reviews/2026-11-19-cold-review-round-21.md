# Cold review, round 21 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 945433e, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 945433e, fe07eb4 and d5dc9e7 with real `git diff -U0` output and the file read as the finish check reads it; the key cases through the real hooks in throwaway repos. It marked each finding as a regression or not.
- Our reproduction: each finding we changed code for is a check in the `R21` block of `test/e2e.mjs`, run on 945433e first.

## Findings

No Blocker: since 6af1a11 only `signals.js` changed, so the record and read path is the same.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | round 20's moved-line rule stopped judging a moved line on every check, so a line that switches something off, moved to where it switches off the tests, was let off: `continue-on-error: true` moved from the coverage step to the test job, `allow_failure` moved between GitLab jobs, an existing `describe.skip(` line moved to wrap another suite, `pytestmark` moved from a class to the module, a `JEST_WORKER_ID` check moved into the code under test: ✓ through the hooks | yes, from fe07eb4 and d5dc9e7 | the rule cut back to assertions |
| 2 | Spec (honest) | Major | a formatter spreading one assertion over several lines (prettier past 80 columns, black past 88), or joining it back, read as "an expected value was changed (`{ a: 1, b: 2 }` → `{`)", and the ✓ was withheld | no, in every build since noskip was ported | fixed |
| 3 | Standards | Minor | the skip and only patterns had `\s*` on both sides of an optional generic: quadratic on a run of spaces | yes, speed | fixed |
| 4 | Spec | Minor | a failing test moved into a `describe.skip` block that already exists, without touching the skip line | no | named in the promise |
| 5 | Standards | Nit | `pytestmark` stopped at a `#` inside a string (regression); a declaration later on a line holding an earlier one is filed under the first name (all builds) | the first yes | the first fixed; the second left |

Blocker: 0. Major: 2. Finding 1 is a Spec-axis regression from round 20; finding 2 is honest work sent back in every build. Round 21 is not clean under finish line B.

How we triaged: finding 1 is the same mistake round 18 named: a rule written to spare honest work (re-indented lines) that switched off checks where a line's position matters. Under round 18's approach it is cut back to the one place position does not change the meaning: an assertion that moved is not counted as removed, added or changed. Every other check reads a moved line where it lands. A re-indented `it.skip` goes back to being sent back, and the promise names it with the moved decorator. Finding 2 is fixed where it starts: noskip's parsers now treat a line that opens a bracket it does not close as part of an assertion spread over lines and do not compare it, as they already did for an unclosed subject.

## Fixes

Each change started as a failing check in the `R21` block (11 red on 945433e), plus round 20's re-indented `it.skip` check, which now expects the named send-back (also red on 945433e); e2e 919/0 and all 8 CI steps on a clean clone after. Two R21 checks were first written on a header-only diff and passed on 945433e too; they were rewritten on git's own diff of the file and the file read, and a heavier timing input, and then failed on 945433e as they should.

| # | Fix | Check |
|---|---|---|
| 1 | The moved pairing applies only to assertion bookkeeping (removed and added counts, shapes, strengths, a commented-out assertion); CI, runner checks and every skip pattern read a moved line. | the five moved cases: found; a describe wrap of two same-shape assertions: still no finding |
| 2 | noskip's `parseExpectStyle` returns nothing when the matcher's call does not close on the line; `parsePyAssert` does the same when the condition's brackets do not balance. | a `toEqual` spread and joined back, a `toBe` value on its own line, a black-spread assert: no finding; a value changed on one line: still found |
| 3 | The generic's own spaces are inside its optional group, so a run of spaces is tried once. | fifty 10,000-character lines in under 2 s |
| 5 | `pytestmark` reads quoted strings whole before it stops at a `#`. | found |

The reviewer's cases, run again on the fix: rounds 15 to 20's 422 cases are unchanged by this round's change; the R21 cases above give the expected result.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged, with noskip's parser change); held-out half not run.
