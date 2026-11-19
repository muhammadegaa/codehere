# Cold review, round 10 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 0ebe725, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). It ran its cases on the CLI in throwaway repos.
- Our reproduction: each finding below is a check in the `R10` block of `test/e2e.mjs`, run on 0ebe725 first.

## Findings

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Spec | Blocker (narrow) | a session whose state.json entry is lost (two sessions starting at once, 21 newer sessions, a record pruned meanwhile) is checked in silence after it guts a test and commits: round 9's recovery was only in session start, and the session-start, prompt and after-tool hooks still wrote state.json without merging | Blocker |
| 2 | Standards (Spec effect) | Major | a CI workflow that ran the tests, deleted with `git rm`, renamed to `ci.yml.disabled`, or `.gitlab-ci.yml` moved into a folder: ✓ | Major |
| 3 | Spec (honest) | Minor | a runner config rewritten as it moves (`jest.config.js` to `jest.config.mjs`) is read as a new filter | Minor |
| 4 | Spec (honest) | Minor | a config a build copies into an ignored folder is let off during the run, then sent back at the next stop | Minor |
| 5 | Spec (honest) | Minor | a side `test:smoke` script with a filter sends the agent back, though `npm test` does not run it | Minor |
| 6 | Standards | Minor | `-t` read as jest's after `jest-extended` (a mocha timeout) | Minor |
| 7 | Standards | Minor | the finish check writes other sessions back as they were when it started (a send-back count lost) | Minor |
| 8 | Standards | Minor | an edit inside a submodule already dirty at session start is invisible; the failing tests never run | Minor |
| 9 | Standards | Minor | about 15 ms per changed test file (two git calls each): 3,000 tests moved took 45 s | Minor |

Blocker: 1. Major: 1. Round 10 is not clean.

## Fixes

Each fix started as a failing check in the `R10` block (13 red on 0ebe725, 0 after; e2e 693/0 and CI 8 of 8 on a clean clone).

| # | Fix | Check |
|---|---|---|
| 1, 7 | Every state writer passes the sessions it changed; `writeState` takes a lock, reads the file again, and takes every other session as it is on disk. The finish check looks up a lost session's record by its id, as session start does, and a session with no known start is checked and says there is no record instead of staying silent. State keeps the 50 sessions active most recently. | a lost session that gutted a test and committed: sent back through its record; the same with no record: "no record", no ✓; six sessions starting at once keep their entries and records; a send-back during another session's check keeps its count |
| 2 | A deleted CI file's removed lines are read under its own name; a CI file moved where CI does not read it is reported; CI files count at the repo's top only. | `git rm` of the workflow, a move to `ci.yml.disabled`, `.gitlab-ci.yml` moved into `ci/`: sent back |
| 3 | Pairing by shared lines covers configs too. | `jest.config.js` rewritten as `jest.config.mjs`: ✓ |
| 4 | One rule before and during the run: a new file in a folder git ignores is let off; a file git ignores by its own name is read. | a config the test command copies into ignored `dist/`: ✓ at both stops |
| 5 | A `test:*` script counts only when the `test` script calls it (the audit, without the file, still counts every one). | a side `test:smoke` with `-t`: no finding |
| 6 | jest's `-t` only after `jest` or `vitest` as the command word. | `mocha -r jest-extended/all -t 5000`: no finding |
| 8 | A folder in the dirty list (a submodule, a worktree) is hashed by its own commit and status. | an edit inside a submodule dirty at session start: the failing tests send the agent back |
| 9 | The bytes of every built file are written in one git call; a move with no change builds no diff. | 1,000 tests moved with plain `mv`: ✓ in under 8 s |

Found while fixing, by the e2e suite: owning only its own session, the prompt hook dropped the team-snapshot update a save makes to other open sessions (E25); it now owns those too. A submodule's status line stays the same when a file already changed in it changes again, so its hash also covers its diff. One earlier check changed: "no changes this session: silent" now runs in a session that started; a session Codehere never saw start is checked and says there is no record.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
