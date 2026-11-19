# Cold review, round 12 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on ec16005, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task), comparing cases with 29146ae. It ran its cases on the CLI in throwaway repos.
- Our reproduction: each finding below is a check in the `R12` block of `test/e2e.mjs`, run on ec16005 first.

## Findings

No Blocker: the first round since round 5 without one.

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Spec | Major | the approved command was never passed to the scan, so a filter on the `test:*` script it runs was missed (a plain bug in round 11's fix) | Major |
| 2 | Spec | Major (near Blocker) | set up in a package, the package's own `.github/workflows` counted as the repo's CI: the repo's workflow moved into it read as a rename | Major |
| 3 | Standards | Major | filter values written across lines (a wrapped `testPathIgnorePatterns` list, `addopts` continuation lines) or escaped in package.json were not read | Major |
| 4 | Standards | Major | the CI rules knew only a few test commands (`pnpm -r test`, `turbo run test`, `./gradlew test`, `mvn verify`, `dotnet test` and others were not test steps); a renamed `./gradlew test` workflow got ✓ | Major |
| 5 | Spec (honest) | Minor | another key changed on a one-line runner config was read as a new filter | Minor |
| 6 | Spec (honest) | Minor | any `*` in any script (a lint glob) made every `test:*` script count | Minor |
| 7 | Spec (honest) | Minor | build output ignored by its own name that existed at session start lost the ✓ | Minor |
| 8 | Spec (honest) | Minor | a test script that kept its filter but moved up was read as a new filter | Minor |
| 9 | Standards | Minor | a lost session got its start back but not its settings snapshot: a removed Stop hook went unreported | Minor |
| 10 | Standards | Minor | jest's config under package.json's `"jest"` key was never read for filters | Minor |
| 11 | Spec | Minor | in a subfolder setup, a parent config that is a link was not recorded | Minor |
| 12 | Standards | Nit | `.gitlab-ci.yaml` and `bitbucket-pipelines.yaml` counted as CI files, though those services read `.yml` by default | Nit |

On the promise, said once: test files outside Codehere's folder in a subfolder setup are not recorded, and the ignore rules that let off new files are the ones at the stop. Both are now stated.

## Fixes

Each fix started as a failing check in the `R12` block (27 red on ec16005, 0 after; e2e 736/0 and CI 8 of 8 on a clean clone).

| # | Fix | Check |
|---|---|---|
| 1 | The finish check passes the approved command to the scan. | a filter on the `test:*` script the approved command runs: sent back |
| 2 | With Codehere below the repo's top, a CI file is one at the top (`../../.github/...`); the package's own `.github/workflows` is not recorded as CI. | the repo's workflow moved into the package's `.github`: sent back |
| 3 | A script is read as npm runs it (`\"` is a quote); a line inside a list or an `addopts` block is judged by the key the current file places it under; removed list items count as values the filter had. | a path added to a wrapped list, a `--deselect` on a continuation line, a quoted filter gaining a value: found; a list rewrapped across lines: not |
| 4 | `TEST_CMD` covers workspace and build tools (`pnpm`/`yarn`/`npm` with flags, `turbo`, `nx`, `lerna`, `gradlew`, `mvn`, `dotnet test`, `rspec`, `mix test`, `swift test`, `phpunit`, `pest`, `dart`/`flutter test`, `ctest`, `tox`, `nox`). | each made to always pass in CI is found |
| 5 | In a config, a filter's values are its own key's value only. | `testEnvironment` changed on a one-line jest config: no finding |
| 6 | A glob counts only when it matches the script's name (`test:*`). | a lint glob beside a side `test:smoke`: no finding |
| 7 | Test code git ignores by its own name at session start is not recorded. | build output ignored by name, there at start: ✓ |
| 8 | Every removed filter of a file is collected before any added line is judged. | a test script moved up with its filter: no finding |
| 9 | The record keeps the session's settings, git settings and team snapshots, and a lost session takes them back. | a lost session that removes the Stop hook: sent back for `.claude/settings.json` |
| 10 | `testPathIgnorePatterns` and `testNamePattern` under package.json's `"jest"` key are filters. | found |
| 11 | A parent config that is a link counts by the file it points to. | changed behind the link: no ✓ |
| 12 | CI file names are those each service reads by default. | `.gitlab-ci.yml` renamed `.yaml`: sent back |

Found while fixing, by the e2e suite: the first way of placing a line under its key walked up to 200 lines for each added line, and a new 1.2 MB `pytest.ini` (round 7's check) ran past the hook's time; one pass over the file now places every line, and that file is read in about half a second.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
