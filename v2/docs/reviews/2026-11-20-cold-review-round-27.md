# Cold review, round 27 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on 17cb89e, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 17cb89e, baf89fe, 550cad4, fbd8b88, 9af23ae and d5dc9e7 with real `git diff -U0` output and the file read; findings 1 to 3 and 5 also through the real hooks with node:test. It fuzzed JS and Python layouts with three generators, tried a fix for findings 1 to 4 and 6 in scratch copies, and, as the brief asked, tried each against variants of its own case. It ran only node and git.
- Our reproduction: each finding we changed code for is a check in the `R27` block of `test/e2e.mjs`, built from the reviewer's own inputs, run on 17cb89e first.

## Findings

No Blocker: since baf89fe only `testsOf` and `pairing` in `noskip.js` changed.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | a value changed while the tests' name lines are edited (`async` added, a fixture, `#[tokio::test]`) and a same-named test is added with the same first line: no test kept its key, so the old line paired with nothing: `codehere ✓ node --test · 3 passed` through the hooks, with the new test above or below | yes: the below form from baf89fe, the above form from fbd8b88, 9af23ae and d5dc9e7 | fixed for the forms tried; the rest named |
| 2 | Spec (honest) | Minor | two adjacent describe or class blocks holding same-named tests swapped: git lines up their `it(` lines, so the bodies looked swapped, sent back through the hooks | yes, from 550cad4 and fbd8b88 | fixed |
| 3 | Spec | Minor | a case dropped from a list while a new test above has a list of the same shape: the removed line paired with the new test's list: `✓ … 3 passed` through the hooks | yes, from baf89fe and 550cad4 | fixed |
| 4 | Spec | Major | a parametrize case dropped right below a new parametrized test: a decorator belonged to the test above it, so the old and new decorators paired | no, in every build | fixed |
| 5 | Spec | Major | a row removed from a test table written over several lines is never read (`✓ node --test · 2 passed` through the hooks); the README says so, the promise did not | no, in every build | named in the promise |
| 6 | Standards | Minor | the line-after-name lookup copied the rest of the file per test: 30,000 same-named tests made async took 3.8 s (baf89fe 0.2 s) | yes | fixed |

On the promise, said once: its new gap and false send-back began "in some layouts", which cannot be tested. They now state their triggers.

Blocker: 0. Major: 3. Finding 1 is a Spec-axis regression that gives ✓ to a cheat; findings 4 and 5 are gaps in every build. Round 27 is not clean under finish line B.

How we triaged: the reviewer's trial fixes for findings 1, 2, 3, 4 and 6 were each tried against its variants and its fuzz, so they are applied together, with two changes: the edited-in-place lookup is indexed by name and the lines around the test (the trial's search over old tests was quadratic in the case of finding 6), and the line after a name is read below where the name's match ends, so a Python test that starts at its decorators still reads the line after its `def`. A new test now takes the old key it was by the first rule that places it: its name line and the line above unchanged; its name line edited in place with the lines around the test unchanged; the line above it (its describe or class line) unique to one old and one new test of the name; then the name's old keys in order, or the line after the name. A Python test starts at its decorators. The list rule takes a line of the removed line's own test first. Finding 5 needs a reader for whole rows, so it is named.

## Fixes

Each change started as a failing check in the `R27` block, built from the reviewer's inputs (12 red on 17cb89e; six honest layouts pass there and guard the fix). e2e 997/0 and all 8 CI steps on a clean clone after. The timing check first passed on 17cb89e too: the check's own `git diff` call had Node's default 1 MiB output buffer, so the 2.6 MB diff was cut short; with a larger buffer it fails on 17cb89e (4.2 s) as it should.

| # | Fix | Check |
|---|---|---|
| 1 | A test whose name line was edited in place keeps its old key when the lines around it did not change. | a value changed or weakened while the tests are made async or given a timeout and a same-named test is added above, between or below, and the Python form: found; the honest forms: no finding |
| 2 | An unchanged name line keeps its key only when the line above it is unchanged too; the line above a test matches it to an old one first. | two same-named blocks swapped, and the middle two of three: no finding |
| 3 | The list rule takes a line of the removed line's own test first. | found |
| 4 | A Python test starts at its decorators. | the parametrize drop below a new parametrized test, with and without a fixture: found; a new parametrized test above with a fixture: no finding |
| 6 | The line after a name is found by a loop. | 30,000 same-named tests made async in under 2 s |

The reviewer's cases, run again on the fix: of its finding-1 forms, the fix finds those its trial build finds; it misses one old test whose name line alone was edited and two Python forms (a fixture added to one test, or the new test between), which only builds that send honest work back found, and three forms no build finds (its `cheatBelow`, `cheatOneSig` and `cheatNoSig`). These, a test deleted beside wrapped same-named tests (missed by every build), and a parametrize list wrapped over several lines are named. Its fuzz, three generators, three seeds each, JS and Python: the fix and its trial build give the same counts everywhere; honest layouts sent back 0 in the first two generators (17cb89e: 2 to 4 a seed); cheats found higher than 17cb89e in JS and up to 4 lower a seed in Python, all reorders split across hunks (named). Round 26's fuzz, three seeds: 0 of 1,200 honest sent back (was 1), 496 of 532 cheats found (was 495). Rounds 24 and 25's 1,896 honest layouts: none sent back.

Rounds 15 to 26's 610 cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
