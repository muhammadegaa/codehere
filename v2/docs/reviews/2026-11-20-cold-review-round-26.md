# Cold review, round 26 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on baf89fe, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on baf89fe, 550cad4, fbd8b88, 9af23ae and d5dc9e7 with real `git diff -U0` output and the file read; the JS cases of findings 1 to 3 also through the real hooks in throwaway repos with node:test. It fuzzed 800 honest layouts and 336 cheats in JS and Python, marked each finding as a regression or not, and tried a fix for each in a scratch copy. It ran only node and git.
- Our reproduction: each finding we changed code for is a check in the `R26` block of `test/e2e.mjs`, built from the reviewer's own inputs, run on baf89fe first.

## Findings

No Blocker: since 550cad4 only the pairing in `noskip.js` changed, so the record and read path is the same.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | a test copied above an existing one under the same name took the old test's key (tests were numbered in file order), so the old test's line found its twin in the copy: weakening the old test gave `codehere ✓ node --test · 2 passed` through the hooks, and the same for a value changed in a second same-named describe, a Python class above with the same method, and a Go row of the same name added to an earlier table | yes, from fbd8b88, 9af23ae and d5dc9e7 | fixed |
| 2 | Spec | Major | round 25's cross-test pairing applied only when the removed text was left nowhere in the file, so a copy on an unchanged line of another test blocked it: a case dropped from the second of two loops over one list, with a test added between, gave `✓ … 6 passed` through the hooks; a Go check weakened while another table keeps the old line, and a parametrize case dropped while another test keeps the decorator, gave no finding | yes, from fbd8b88, 9af23ae and d5dc9e7 | fixed |
| 3 | Spec (honest) | Minor | tests wrapped with a same-named test in a new group above them: the old test's assertion paired with the new one, sent back through the hooks, in JS and Python | yes, from 550cad4 and fbd8b88 | fixed |

Blocker: 0. Major: 2, both Spec-axis regressions from rounds 24 and 25 that give ✓ to cheats. Round 26 is not clean under finish line B.

How we triaged: findings 1 and 3 are about which new test is which old one, and the reviewer's suggested rule fixed both in its trial: a new test whose name line did not change keeps its old key, the others take the old keys of their name left over, in order, and when more of a name are new than old, each gets a key of its own. Trying it, we found a hole it opens: tests wrapped while a same-named copy is added beside the old one, which is weakened, gave no finding, and with the copy below, baf89fe had found it. So with more new tests of a name than old, a new one keeps an old key when the line after its name line matches exactly one old test of the name and no other new one (the route or input it checks); both forms are now found and are checks. Finding 2's fix is the reviewer's one line: only an added line counts as a copy, since a copy on an unchanged line did not move.

## Fixes

Each change started as a failing check in the `R26` block, built from the reviewer's inputs plus the two wrapped-copy cases (13 red on baf89fe; two pass there and guard the fix: a same-named group added below, and the wrapped copy below). e2e 979/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1, 3 | New tests are matched to old ones through the diff, then by name in order; with more new than old of a name, by the line after the name, or else as new tests. | the copy above with the old one weakened, a value changed beside a same-named test above, the Python and Go forms, both wrapped-copy forms: found; tests wrapped with a same-named group above or below, a Python test moved into a class beside a same-named one, two same-named tests wrapped with a third added: no finding |
| 2 | Only an added line counts as a copy for cross-test pairing. | the second loop's dropped case, the Go check weakened or flipped while another table keeps the line, the parametrize case: found |

The reviewer's 34 cases, run again on the fix: every cheat is found except one form, which it ran twice as a control (`A2c` through the hooks and its scan twin): a value changed with a new test added below, which git shows as lines added and none removed (the promise names it); its honest cases are quiet. Its fuzz, three seeds of 400: 1 of 1,200 honest layouts sent back (baf89fe: 14, fbd8b88: 93); 495 of 532 cheats found (baf89fe: 482, 550cad4: 435, fbd8b88: 506, many by a wrong pair). The cheats baf89fe found and the fix does not are 2, both with tests wrapped and reordered beside a same-named group; that family is named in the promise. Rounds 24 and 25's 1,896 honest layouts: none sent back.

Rounds 15 to 25's 576 cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
