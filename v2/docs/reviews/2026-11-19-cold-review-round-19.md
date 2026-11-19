# Cold review, round 19 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 6af1a11, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every case ran on d5dc9e7, 6713250 and 6af1a11; the key cases through the real hooks in throwaway repos, with a stub `tox` and node:test shims. It marked each finding as a regression or not.
- Our reproduction: each finding we changed code for is a check in the `R19` block of `test/e2e.mjs`, run on 6af1a11 first.

## Findings

No Blocker.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Standards | Major (a hang; only a crafted file) | round 18's tox comment cut was quadratic on a long run of spaces: 37 s for 150,000 spaces, past the 180 s hook limit at 400,000 | yes, from 6713250 | fixed |
| 2 | Spec | Minor | a `-k` split into two narrower ones claimed one dropped value twice; a filter moved between commands of one env is count-neutral | no | the narrowing rule removed; the move named |
| 3 | Spec | Minor | brackets were counted only in a line's first 10,000 characters, so a long one-line array left its `[` open: a list below it was missed, or an honest edit below a long ignore list was sent back | honest half yes, from d5dc9e7 | fixed |
| 4 | Standards | Nit | the declaration pattern without its bound cost the rest of the line for every `let x:` | yes, speed | fixed |
| 5 | Spec | Major | skip and only with modifiers: `test.describe.only`, `it.skip.each`, `test.only.each`, `describe.concurrent.only`, `test.concurrent.skip`, `xit.each`, mocha's `context.skip`, `suite.skip`, `xcontext`: ✓ through the hooks, while the README says `.skip` and `.only` are caught | no | fixed |
| 6 | Spec | Minor | `pytestmark = pytest.mark.skip` (a whole module) and a conftest hook's `add_marker(pytest.mark.skip)`, while the README says Python's skip is caught | no | fixed |
| 7 | Spec | Minor | mocha, vitest and cargo `--exclude`, `.mocharc` `exclude:`, tox `commands` in `setup.cfg`, `{posargs:...}` defaults, `PYTEST_ADDOPTS` in `setenv` | no | named in the promise |
| 8 | Spec (honest) | Minor | a `-k` narrowed back (also as `not (a or b)`) was sent back | partly | named as a false send-back |

On the out-of-scope list, said once: the README's list of what is caught claimed `.skip`, `.only` and Python's skip while common forms of them were missed. Findings 5 and 6 are now caught, and the README says which forms.

Blocker: 0. Major: 2. Finding 5 is on the Spec axis and is not a regression: every build since d5dc9e7 missed it. Finding 1 is a Standards regression, triggered only by a file padded to stall the hook. Round 19 is not clean under finish line B.

How we triaged: findings 5 and 6 are new patterns, which the rule from round 17 would name rather than add. We added them because the README already claims these forms, so leaving them out made the README false; they are test-file patterns, apart from the config reading that kept regressing. mocha's `context`, `suite` and `specify` are read only in test files, since `context.skip(` is a plausible call in other code. Finding 2 is the second hole in the `-k` narrowing rule, a rule that makes the scan more lenient, so under round 18's approach it is removed and a narrowed `-k` is named as a false send-back. Removing it showed one more honest case: a `-k` with its terms reordered was sent back. A `-k` made only of `not x and not y` terms is now compared with its terms sorted, which treats two spellings of one filter as one and lets off nothing else.

## Fixes

Each change started as a failing check in the `R19` block (19 red on 6af1a11), plus round 16's narrowed `-k` check, which now expects the named send-back (also red on 6af1a11). One more check, the reordered `-k`, passes on 6af1a11 and guards the narrowing rule's removal. e2e 888/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | The `#` is found with a single search, then the line is cut and trimmed. | 40,000 spaces read in under 2 s and found; through the reviewer's hook harness, 150,000 spaces: 1 s, sent back |
| 2 | No `-k` is let off as narrower. | the split found; the narrowed `-k` sent back, as named |
| 3 | Brackets are counted over the whole line; the patterns still read its first 10,000 characters. | the list below a long array: found; the edit below a long ignore list: no finding |
| 4 | A declaration is matched only at the start of a line. | a 1 MB config of `let a:` lines read in under 2 s |
| 5 | `.skip`, `.only` and `x` names allow `describe`, `concurrent`, `serial`, `parallel` and `sequential` between the name and the keyword, and `.each` after it; mocha's names in test files. | twelve forms found; `list.skip(2)`, `stream.only(1)` and `test.describe(` quiet |
| 6 | `pytestmark = ... pytest.mark.skip` and `add_marker(pytest.mark.skip` are Python skips; `skipif` and other marks are not. | both found; `pytestmark = pytest.mark.slow` and a `skipif` on a variable quiet |

The reviewer's 56 scan cases, run again on the fix: 22 differ from 6af1a11, 21 of them gains, and one the honest narrowed `-k`, now the named send-back. Its hook cases for findings 1, 5 and 6: sent back. Rounds 15 to 18's cases: unchanged, except the three honest narrowed-`-k` cases, now the named send-back.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged, with the new skip patterns); held-out half not run.
