# Cold review, round 8 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on e121c2b, against `v2/docs/finish-check-promise.md` (Spec and Standards axes), running its cases on the CLI and comparing each with 1678cec.
- Our reproduction: `2026-11-19-round-8-repro.sh` (`ONLY=<case>` runs one), on e121c2b.

## Findings

| # | Axis | Reviewer | Finding | Regression from round 7? | Our check |
|---|---|---|---|---|---|
| B1 | Spec | Blocker | an empty `test/.git` folder (or a `pyvenv.cfg`) made mid-session stops the record walking the test folder; then a rename and two asserts removed: ✓ | yes (1678cec sent it back) | reproduced (✓) |
| B2 | Spec | Blocker | the test folder replaced by a link into `node_modules/`: the test no longer runs, ✓ | yes | reproduced (✓ 0 passed) |
| B3 | Spec | Blocker | `git mv`, assume-unchanged on the new name, then `rm` it: git's rename comes from the index and nothing is read: ✓ | no (on 1678cec too) | reproduced (✓ 0 passed) |
| B4 | Spec | Blocker (narrow) | a test untracked at session start, overwritten through a staged rename of another test: read from the wrong start version, ✓ | no | not rerun |
| B5 | Spec | Blocker | the long-line pieces: a template string crossing the cut flips the mask; a key and its value in different pieces | partly (the pieces are round 7's) | reproduced, template case (✓ 0 passed) |
| B6 | Spec | Blocker | gut the test, `mv .git .git-old`: no output | yes (1678cec said "could not be read") | reproduced (no output) |
| M1 | Spec | Major | a session started on an older version and resumed after upgrading takes a new record: a gutted test gets ✓ | yes | not rerun |
| M2 | Standards | Major | honest: `dist/` ignored but absent at session start (a fresh clone or worktree), built from `test/` by the test command: sent back for a skip already in `test/`, or "changed while Codehere ran the check" on every stop | yes | reproduced (sent back) |
| M3 | Spec | Major | broken code marked assume-unchanged: the finish check is silent and the failing tests never run; `core.worktree` the same | partly pre-existing | reproduced (no output) |
| M4 | Standards | Major | honest: a test moved with plain `mv` (not staged) is sent back as "test file deleted" | no | reproduced (sent back) |
| m1 | Standards | Minor | the wider test names make `src/test-utils.js`, `scripts/test.js` and `src/ab-test.js` test files | yes | not rerun |
| m2 | Standards | Minor | the record pruning races: six parallel session starts left the surviving session without its record | yes | not rerun |
| m3 | Standards | Minor | a folder with a `.git` git cannot read (dubious ownership, a broken gitfile) now runs the tests and prints ✕ on every turn | yes | not rerun |
| m4 | Standards | Minor | `log.showSignature` with a `gpg.program` runs a program inside the stop (teamChanged's `git log`) | no | not rerun |

Blocker: 6 open, 4 of them regressions from round 7's fixes. Major: 4 open. Round 8 is not clean.

## The trend

| Round | Blocker | Major | Findings in code the previous round added |
|---|---|---|---|
| 5 | 0 | 7 | 1 of 7 (round 2's rename rule) |
| 6 | 5 | 4 | 2 of 15 (m2, m5) |
| 7 | 4 | 5 | 6 of 10 (#1, #3, #6, #7, #9 in the record and its built diffs; #8 made reachable by it) |
| 8 | 6 | 4 | 8 of 14 (B1, B2, B6, M1, M2, m1 to m3), and B5 in part |

Over the same rounds, the measured catch rate on real agent runs did not move: CheatBench dev 20/20 gamed and 0/30 honest, the case suite 26/26 and 20/20, at every round. The findings since round 6 are built by a reviewer attacking Codehere through git's machinery (index flags, replace refs, links, marker folders, moving `.git`); none is a way an agent was seen weakening tests. The honest-work findings (round 7 #7, round 8 M2 and M4) are the exception: those hit ordinary sessions.

## Decision and fixes (Ega chose A in the Pareto review, 19 Nov)

The adversary is an agent doing its task; working against Codehere through git's machinery is out of scope (`v2/docs/finish-check-promise.md`, rewritten). Under that promise: B5 (long-line pieces), M3 (code hidden by an index flag) and round 7's core.bare-without-a-record case are out of scope and stay as known limits; everything else is fixed, including the out-of-scope regressions, which were cheap and made the branch worse than 1678cec. Each fix started as a failing check in `test/e2e.mjs` (the `R8` block: 13 red on 419344f (12 in the full run; the overwritten-untracked check was rebuilt after it passed there for another reason, and then gave ✓ on 419344f), 0 after; e2e 669/0 on a fresh copy; the other seven CI steps 8 of 8 on a clean clone before the last two check changes).

| # | Fix | Check |
|---|---|---|
| B1 | A `.git` or `pyvenv.cfg` stops the walk only in a folder that held no recorded file at session start. | a `.git` folder made beside the tests, then a rename and two asserts removed: sent back |
| B2 | A recorded file the walk does not see now is read as deleted, even when a linked parent folder still reaches it. | a test folder swapped for a link: "test file deleted" |
| B3, B4 | A rename git takes from the index is kept only when its new file is walked now and has no start version of its own; otherwise the old file is deleted and the new one read from its own start. | a renamed test then deleted: "test file deleted"; an untracked test overwritten through another test's staged removal: sent back |
| B6, m3 | A session that started in a working repo is checked blind when git no longer reads the folder (a moved `.git`); a folder git could not read at session start stays quiet, as before round 7. | `.git` moved after session start: a ✕ line, no ✓; a broken gitfile from the start: no output |
| M1 | A session resumed without a record keeps none (no ✓, the "no record" line) instead of starting one from the agent's changes. | a session from before the record, resumed after the upgrade: no ✓, "no record" |
| M2 | New test code in a folder git ignores now (a build copying the tests, an install) is not read and does not count as touched during the run; new configs and setup files are read wherever they are. `check-ignore` runs without the pathspec flag, which it refuses. | `dist/` ignored and absent at session start, built from `test/` by the test command: ✓ |
| M4 | A test moved without git is paired with the new file as git pairs renames: the same bytes, or at least half the same lines; the new file is read from the old one's start. | a plain `mv`: ✓; a plain `mv` then gutted: sent back |
| m1 | node's `test-*.js`, `*-test.js` and `test.js` are not test names again (they also name helpers and features). | deleting `src/test-utils.js` and `src/ab-test.js`: ✓ |
| m2 | A record no session names is removed only when it is older than an hour. | another session's recent record survives a session start; an old one is removed |
| m4 | Every git call runs with `log.showSignature=false`. | not covered by an e2e check (needs a gpg program); read in `GIT_ENV` |
| Pareto 6 | A passing run whose runner reports 0 passed gets no ✓: `codehere ✕ <cmd> · 0 passed · no test ran`. | every test skipped: no ✓, "0 passed" |

Earlier checks that changed with the bounded promise: round 6's "a new test file with a skip, hidden through `.git/info/exclude`" is out of scope now (git's machinery; new test code git ignores is not read), so the check is now the case that still matters, a new `pytest.ini` hidden the same way, which is read and sent back. Round 7's "core.bare in a session Codehere never saw start" is out of scope and removed. Round 7's dash test names (`test-cart.mjs`, `cart-test.mjs`) are removed with m1. A session resumed with no record and a gutted test is now sent back through git's diff; the "no record" line is checked on an honest resumed session.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run. The demo (`node demo/demo.mjs`) still shows its ✕ and then its ✓.
