# Cold review, round 13 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on d5dc9e7 (2.1.0-rc.4, as published to npm `next`), against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task), comparing cases with ec16005.
- Our reproduction: each finding below is a check in the `R13` block of `test/e2e.mjs`, run on d5dc9e7 first.

## Findings

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Spec | Blocker (subfolder setups) | the repo's `.gitlab-ci.yml` moved into a folder between the top and Codehere's folder: recorded there as CI, paired as a plain move, ✓ | Blocker (narrow) |
| 2 | Spec | Major | `concurrently "npm:test:*"` and `pnpm run "/^test:/"` were not read as running `test:*` scripts (round 11's glob rule) | Major |
| 3 | Standards | Major | a pytest filter inside a quoted `addopts` string or a TOML list in `pyproject.toml` was not read | Major |
| 4 | Spec (honest) | Minor | an item of a wrapped filter list rewritten (a trailing comma, sorted, re-indented) was read as a new filter | Minor |
| 5 | Standards | Minor | a config value found at the first place its key's name appears, and a list cut at a bracket inside an item | Minor |
| 6 | Spec | Minor | a parent config that is a link was recorded, but read without following the link | Minor |
| 7 | Spec | Minor | a value added on the line that opens a wrapped list was not read | Minor |
| 8 | Standards | Minor | long CI lines took seconds each with the wider test-command pattern | Minor |
| 9 | Standards | Minor | a CI test step replaced by an `echo` naming it, or a cache key naming `test`, balanced the removal | Minor |
| 10 | Standards | Minor | filter forms not read: unquoted YAML values, playwright regex values, a second script on a one-line package.json | Minor |
| 11 | Standards | Minor | `|| true` after an escaped quote in the test script was not read | Minor |

On the promise, said once: its reason for letting off new test code git ignores ("can add tests but not weaken the ones there were") is false where the runner loads every test file into one process (pytest, mocha). The promise now says these files are let off because builds and installs put them there, and that hiding a test file from git is working against Codehere.

Blocker: 1 (narrow). Major: 2. Round 13 is not clean.

## Fixes

Each fix started as a failing check in the `R13` block (18 red on d5dc9e7, 0 after; e2e 754/0 and CI 8 of 8 on a clean clone).

| # | Fix | Check |
|---|---|---|
| 1 | CI files are recorded only at the repo's top; a CI file paired with a plain move to a place CI does not read is read as removed. | `.gitlab-ci.yml` moved into a folder in between: sent back |
| 2 | A glob's runner prefix (`npm:`) is dropped before matching; a `/regex/` argument is matched as a regex. | both forms found |
| 3 | `addopts` text is read without quotes, brackets and commas. | three `pyproject.toml` forms found |
| 4, 7 | With no key line before, an item's values are checked against the values the removed lines held; removed `addopts` continuation lines count their options; a value on a list-opening line is checked. | a trailing comma, sorted items, a re-indented line: no finding; a value on the opening line: found |
| 5 | A value is read from where its key matched, and a list ends at its closing bracket outside quotes. | both found |
| 6 | Parent configs are read through a link, as they are recorded. | read |
| 8 | The test-command gaps are bounded (200 characters, 500 before a fallback), and lines are cut at 10,000. | twenty 10,000-character CI lines read in under 2 s |
| 9 | Only commands count as test steps: an `echo` and other YAML keys are not. | an echo replacing the step: removed |
| 10, 11 | Every script on a package.json line is read; a config value is its quoted strings, else a regex literal, else the bare word; `|| true` is found after an escaped quote. | each found |

GitHub CI on the pushed d5dc9e7 (run 44553786561): success.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
