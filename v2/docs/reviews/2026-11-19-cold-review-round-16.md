# Cold review, round 16 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 2d31b76, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every case ran on d5dc9e7, 20dee96 and 2d31b76 through a harness that builds the `-U0` diff as the finish check does; the key cases through the real hooks in throwaway repos.
- Our reproduction: each finding below is a check in the `R16` block of `test/e2e.mjs`, run on 2d31b76 first.

## Findings

No Blocker: the set of files the finish check reads is unchanged.

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Spec | Major | round 15's whole-file read kept one set of values per option, so a value set in one place and added in another was not new: a path one jest project ignores added to a second project, a playwright project's `testIgnore` copied to another, a `--deselect` copied to a second tox env: ✓ through the hooks | Major (regression from round 15) |
| 2 | Spec | Minor | package.json read as JSON missed `testPathIgnorePatterns` inside `jest.projects[]` | Minor (regression) |
| 3 | Spec | Minor | a key whose value sits on the next line (Prettier's break after the colon) got no value | Minor (regression) |
| 4 | Spec (honest) | Minor | with tox approved, a linter's `--ignore` in tox's `commands` was a test filter; `tox.ini` in `pytest -c tox.ini` counted as tox | Minor (new) |
| 5 | Standards | Minor | GitLab's `- when: never` under `rules:` and a quoted `if: 'false'` were not read | Minor |
| 6 | Spec (honest) | Minor | a switch as the first key of a step (`- if: false` on a deploy step) took the whole steps list as its block | Minor (new) |
| 7 | Spec | Minor | a list a variable holds: one-line, typed (`const x: T[] = [`), and spread into a key's value were not read | Minor |
| 8 | Spec (honest) | Minor | a `-k` narrowed back to fewer `not` terms was sent back | Minor |
| 9, 10 | Standards | Nit | `runsTests` defaulted to a variable declared later; the block-scalar search started at line 0 for every key | Nit |

On the out-of-scope list, said once: TOML `"""` strings (d5dc9e7 found two forms), Azure's `continueOnError` and `enabled: false`, and mocha's comma lists. All three are now read; the promise no longer lists TOML multi-line strings as a gap.

Blocker: 0. Major: 1 (Spec axis), a regression from round 15. Round 16 is not clean.

## Fixes

Each fix started as a failing check in the `R16` block (23 red on 2d31b76, 0 after; e2e 839/0 and all 8 CI steps on a clean clone).

| # | Fix | Check |
|---|---|---|
| 1 | Each filter value is counted by the places that set it; a value is new when it is set in more places than at the start. | through the hooks: the jest project case is sent back; the playwright and tox cases are found; the honest rewraps, sorts and inlined lists stay quiet |
| 2 | The keys in each `jest.projects[]` object are read. | found |
| 3 | A JavaScript key with no value on its line takes the next line's value. | added and widened: found |
| 4 | Only a pytest command's arguments in `commands` count, and tox must be a command word. | the linter's `--ignore`: no finding; `pytest -c tox.ini`: no finding; `python -m pytest --deselect`: found |
| 5 | A `- when:` under `rules:` belongs to its job; a quoted `'false'`; Azure's `continueOnError` and `enabled: false`. | each found |
| 6 | A switch that starts a list item applies to that item. | the deploy step and the lint step: no finding |
| 7 | A variable's list is read on its own line, with a type before the `=`, and through a `...spread` in a key's value. | each found; the one-line list inlined: no finding |
| 8 | A `-k` whose `not` terms are a subset of the start's is not new. | no finding |
| 9, 10 | `runsTests` takes its file from every caller; the block-scalar search starts after its key. | 20,000 block scalars read in under 2 s |
| scope | TOML `"""` and `'''` strings; mocha's comma lists. | each found |

Found while fixing: a JavaScript `String.replace` used to insert this block into the test file read `$'` in a regex string as a replacement pattern and broke the file; the block was reinserted with a function, and the R14 and R15 blocks were checked to be byte-identical to their sources.

The reviewer's cases, run again on the fix: of its 68 scan cases, every finish-check case gives the expected result; the four audit-path cases still missed are a line added inside a wrapped list or `addopts` block with its key line unchanged, which the audit cannot place without the file (the same in every build; the promise now says so). Its nine hook cases give the expected result, except the honest tox case, which is quiet in the scan and then sent back only because `tox` is not installed here to run. Round 15's 109 cases: one changed, a gain (a TOML `"""` string). Round 14's hook and scan cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
