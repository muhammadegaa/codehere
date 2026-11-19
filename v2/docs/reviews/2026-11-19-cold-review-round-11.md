# Cold review, round 11 (launch bar L13)

- Date: 19 Nov 2026 (the review stopped once at a usage limit and was resumed with its work kept)
- Reviewer: the `cold-reviewer` agent on 29146ae, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task), comparing each case with 0ebe725. It ran its cases on the CLI in throwaway repos.
- Our reproduction: each finding below is a check in the `R11` block of `test/e2e.mjs`, run on 29146ae first.

## Findings

| # | Axis | Reviewer | Finding | From round 10? | Our rating |
|---|---|---|---|---|---|
| 1 | Spec | Blocker (subfolder setups) | Codehere set up in a monorepo package never reads the repo's top: a CI workflow there made to skip the tests, or a parent `pytest.ini` that deselects one, gets ✓ | partly (CI files anchored at the top) | Blocker |
| 2 | Spec | Major | a `test:*` script `npm test` reaches through a chain (`npm run test:all`) or a glob (`run-s test:*`), or that is the approved command itself, is not counted | yes (round 10's side-script rule) | Major |
| 3 | Standards | Major | a removed line with a filter option hides any added filter with the same option name: a path added to an existing `testPathIgnorePatterns`, a second `--ignore`, a filter moved from `test:fast` onto `test` | no (since 0ebe725) | Major |
| 4 | Standards | Minor | jest's `-t` missed when jest is called by its path (`node_modules/.bin/jest -t`) | yes | Minor |
| 5 | Spec (honest) | Minor | test code a build writes next to the sources, ignored by its own name, loses the ✓ at every stop | yes | Minor |
| 6 | Spec (honest) | Minor | a workflow that runs no tests, disabled by renaming it, is sent back | yes | Minor |
| 7 | Standards | Minor | a session state.json lost that commits a breaking change is silent: its start commit was not kept with its record | yes | Minor |
| 8 | Spec (honest) | Minor | more than 50 tests moved with plain `mv` and edited are reported as deleted | no | Minor |
| 9 | Standards | Minor | `writeState` writes the top-level fields from the writer's stale copy: a restart brief written during another session's check is lost | yes | Minor |
| 10 to 12 | Standards | Nit | a tab git writes after a path holding a space; an unused import and stale text; a link to a folder hashed by its target's git state | | Nit |

The reviewer also said, once, that the promise's definition of a test config leaves out `vite.config.*`, GitLab `include:` files and composite actions, and should say so.

Blocker: 1. Major: 2. Round 11 is not clean; five findings are in code round 10 added.

## Fixes

Each fix started as a failing check in the `R11` block (15 red on 29146ae, 0 after; e2e 709/0 on a fresh copy, CI 8 of 8 on a clean clone).

| # | Fix | Check |
|---|---|---|
| 1 | When Codehere's root is below the repo's top, the record also holds the test configs and setup files in each folder above it and the CI files at the top, by their path from root (`../../.github/workflows/ci.yml`), and reads them like the rest. | set up in `packages/app`: the top workflow made to skip the tests, and a parent `pytest.ini` deselecting a test, are each sent back |
| 2 | A `test:*` script counts unless nothing can run it: another script naming it or holding a glob, or the approved command naming it, makes it count. | a filter on `test:unit` reached through `test:all`, or through `run-s test:*`, is found |
| 3 | A filter is new when its option was not there before for that script, or when it gains a value (a path in a list, another `--ignore`). | a path added to `testPathIgnorePatterns`, a second `--ignore`, a filter moved onto `test`: found; the same list written another way is not |
| 4 | jest's `-t` also after jest's path. | `node_modules/.bin/jest -t cart` and `node_modules/jest/bin/jest.js -t cart` are found |
| 5 | New test code git ignores by its own name is let off like new files in an ignored folder; new configs ignored by name are still read. | a build writing `test/cart.test.mjs` next to the sources, ignored by name: ✓ at both stops |
| 6 | A CI file moved where CI does not read it is read as removed lines; only a test step removed counts. | a stale-bot workflow renamed `.disabled`: ✓; round 10's moved test workflows are still sent back |
| 7 | The record keeps the session's start commit and snapshot; a session found again by its record takes them back. | a lost session that commits a breaking change: sent back for the failing tests |
| 8 | Pairing by shared lines covers up to 500 files. | 60 tests moved and edited: ✓ |
| 9 | `writeState` takes the top-level fields from the file too, except those the writer set. | a brief written during another session's check is kept |
| nits | The tab is stripped; the stale comment and the README line are corrected; a link in the dirty list counts by where it points. | the deleted workflow whose name holds a space is read |

The promise now names subfolder setups, the `test:*` rule, new test code ignored by name, and the config files it does not cover (`vite.config.*`, GitLab `include:` files, composite actions).

One earlier check changed: round 10's "1,000 tests moved in under 8 seconds" failed on 29146ae while two suites ran at once, with 9.2 of its 9.5 seconds spent running the 1,000 tests; it now bounds Codehere's own time (the stop's time less the test run it reports) at 5 seconds.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
