# Cold review, round 28 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on 744cf08, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 744cf08, 17cb89e, baf89fe, 550cad4, fbd8b88, 9af23ae and d5dc9e7 with real `git diff -U0` output and the file read; findings 1 and 3 also through the real hooks with node:test. It fuzzed 11 JS and 3 Python seeds, and tried a fix for findings 1 and 2 against variants of its own cases. Its first few commands (git reads in the repo, and `mkdir`, `tar`, `ls`, `grep` and `wc` to unpack the builds) ran before it set the scratch HOME, XDG_CONFIG_HOME and TMPDIR and used programs other than node and git; they read the repo or wrote to scratch only.
- Our reproduction: each finding we changed code for is a check in the `R28` block of `test/e2e.mjs`, built from the reviewer's own inputs, run on 744cf08 first.

## Findings

No Blocker: since 17cb89e only `testsOf` and `tableChanges` in `noskip.js` changed.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | round 27's first rule kept a test's key only when the line above it was unchanged too, so adding any line right above a test (a new test, an `afterEach`, a comment) beside a same-named copy elsewhere left it unplaced, and its changed value was not read: `codehere ✓ node --test · 2 passed` through the hooks; the Rust, Java and Python forms gave no finding | yes, from 17cb89e, fbd8b88, 9af23ae and d5dc9e7 | fixed |
| 2 | Standards | Minor | the list rule took every fitting line before choosing one: a rewritten file of 32,000 list lines took 42 s (17cb89e 9.6 s), in a hook with a 180 s budget that also runs the tests | yes, from 17cb89e | fixed |
| 3 | Spec (honest) | Minor | a new group of same-named tests added on top while an old group moves to the bottom and every test is made async was sent back: git lines the new test up with the moved one's place, and the edited-in-place rule gives it that key | yes, from 17cb89e and 550cad4 | named as a false send-back |
| 4 | Standards | Nit | `at` was both a character offset and a line number in `testsOf` | no | renamed |

On the promise, said once: the gap "a new test added right below repeats the old line" is narrower than its trigger: a copy placed above the original, with the original's value changed, is missed by every build, as git pairs the old test with the copy. The promise now says a copy added beside it, above or below. The reviewer also showed that a same-named test added in its own describe above a test whose name line changed can take its place even when the line after the name differs, which the promise said it would not; the promise now says so.

Blocker: 0. Major: 1, a Spec-axis regression that gives ✓ to a cheat. Round 28 is not clean under finish line B.

How we triaged: finding 1 is applied with the reviewer's tried rule: a test whose name line did not change also keeps its key when its old line above was not moved elsewhere (it was not removed, or its text was added nowhere) and the line after its name is the same line. Finding 2 is applied with its one-pass loop that stops at the first fitting line in the removed line's own test. For finding 3 the reviewer found no small guard, so it is named. Its copy-below case gives no finding on any build, the trial fix included, since git shows the change as lines added and none removed; it is the named gap, now worded to cover it, and not a check.

## Fixes

Each change started as a failing check in the `R28` block, built from the reviewer's inputs (5 red on 744cf08; two honest layouts pass there and guard the fix). e2e 1004/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | Rule 1 keeps a test whose name line did not change when the line above it did not change, or when its old line above stayed and the line after its name is the same line. | a value changed or weakened beside a same-named copy above, with a new test, an `afterEach` or a comment added right above it: found; a same-named block copied above with a new test, the old test unchanged or the copy holding its own value: no finding |
| 2 | The list rule takes the first fitting line in the removed line's own test, or the first fitting line when the line is in no test, in one pass. | a rewritten file of 16,000 list lines of one shape in under 6 s (744cf08 10.4 s, the fix 2.5 s) |

The reviewer's fuzzer, 6 JS and 3 Python seeds of 300, run on 744cf08, 17cb89e, its patch and the fix: the fix and its patch agree in every seed. JS: 188 of 1,800 cheats missed (744cf08 201, 17cb89e 232), 14 of 1,670 honest layouts sent back (744cf08 13; the one more is a block reorder 17cb89e also sends back). Python: 136 of 900 cheats missed (744cf08 138), no honest layout sent back. Rounds 24 to 27's fuzz: the same counts as after round 27.

Rounds 15 to 26's 610 cases and round 27's case scripts: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
