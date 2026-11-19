# Cold review, round 14 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on d071afc, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task), comparing every case with d5dc9e7. It ran its cases through the real hooks in throwaway repos and compared the scan of both builds on the same inputs.
- Our reproduction: each finding below is a check in the `R14` block of `test/e2e.mjs`, run on d071afc first.

## Findings

No Blocker: every changed check file is still read. Four of round 13's fixes broke rules that worked on d5dc9e7; three of them gave a ✓ through the hooks on a weakening d5dc9e7 sent back.

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Standards, Spec (honest) | Major | package.json's `"jest"` values were read from one character before the key: a path added to a one-line `testPathIgnorePatterns` got ✓, and package.json rewritten the way `npm install` writes it was sent back | Major |
| 2 | Standards | Major | every quote dropped from `addopts`, so `-k "not slow"` read as `-k not`: widened to `-k "not slow and not test_adds"`, ✓ (also single quotes, `setup.cfg`, continuation lines, `--deselect a[1-2]`) | Major |
| 3 | Standards | Major | a commented-out line counted as a value the file held, so uncommenting a `--deselect` or an ignore path got ✓; a `--deselect` moved from tox's `commands` into `addopts` was missed | Major |
| 4 | Standards, Spec (honest) | Major (narrow) | Azure's `bash:`, `pwsh:` and `powershell:` steps were not test steps; an `echo` cut the rest of the line, so `echo "::group::tests" && npm test` was no test step | Major |
| 5 | Standards | Minor | `|| true` more than 500 characters after the test command in CI was not read | Minor |
| 6 | Spec (honest) | Minor | a comment after the `[` that opens a list was read as a new filter value | Minor |
| 7 | Standards, Spec (honest) | Minor | from before this diff: a `.mocharc.yml` block list item, an unindented pyproject list item, an unquoted `pnpm run /^test:/`, and a wrapped jest list collapsed to one line (sent back) | Minor |
| 8 | Standards | Minor | the promise's list of builds and installs sat after "working against Codehere" | Minor |
| 9 | Standards | Nit | identical ternary arms, a dead line, and a regex that does not compile making every `test:*` script count | Nit |

On the promise, said once: "What the agent may do" let the agent leave any file ignored, while the out-of-scope list called hiding a test file from git working against Codehere. The may-do line now covers files a build or an install puts there, and hiding a test file is listed under working against Codehere.

Blocker: 0. Major: 4, all regressions from round 13. Round 14 is not clean.

## Fixes

Each fix started as a failing check in the `R14` block (27 red on d071afc, 0 after; e2e 783/0).

| # | Fix | Check |
|---|---|---|
| 1 | A `"jest"` key's value is read from where its name starts. | through the hooks: the path added is sent back; the widened `testNamePattern` is found; npm's rewrite gets no finding |
| 2 | In an ini file `addopts` is read as written, quotes kept; in `pyproject.toml` a TOML string's text is used, and a list item holding a space stays one argument; values are compared without their outer quotes. | each form widened is found; a TOML string rewritten as a list, and `-q` added before `-k`, are not |
| 3 | A commented-out line holds no value, removed or added. A removed line inside a list or `addopts` block counts under the key the file at session start held it under: the start file is rebuilt from the file now and the diff's hunks. | each uncommented filter is found; the tox move is found; a commented-out item added is not a filter |
| 4 | `bash`, `pwsh`, `powershell` and `commands` are step keys; an echo drops only its own arguments. | both Azure steps removed: sent back (through the hooks too); a step with an echo before `npm test` removed is found; an echo added in front is not |
| 5 | The first test command is found, then a fallback anywhere after it. | `|| true` 1,380 characters after `npx jest` is found |
| 6 | A comment at the end of a config line holds no value. | no finding |
| 7 | YAML block lists and unindented pyproject list items are placed under their key; an unquoted `/regex/` argument counts; the Prettier collapse is read against the removed items of its own key. | each found; the collapse gets no finding; a path moved from `coveragePathIgnorePatterns` into `testPathIgnorePatterns` is found |
| 8 | The list moved after "because builds and installs put them there". | |
| 9 | The arms merged, the dead line removed, a regex that does not compile runs nothing. | a side `test:smoke` filter beside a broken regex: no finding |

Found while fixing: placing removed list items under their own key closes a gap the round-13 rule had, where an item moved from another list's key (`coveragePathIgnorePatterns`) counted as already held. It has its own check. The promise now states that a package or build tool counts as running the tests in CI only when `test` comes within 200 characters of it.

The reviewer's own cases, run again on the fix: its six hook cases (A, C, D, its control, E2, F) each give the expected result, and of its 28 scan cases the fix agrees with d5dc9e7 on 23 and differs on 5, each a gain (four weakenings neither build found, and the Prettier collapse no longer sent back).

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
