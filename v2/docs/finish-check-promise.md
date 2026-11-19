# What the finish check's ✓ promises

Written 19 Nov 2026, after L13 round 6, so a review checks the code against a stated promise instead of against everything git can do. Ega chose this scope (option A in the round-6 report).

## The promise

Codehere prints ✓ only when both of these hold for the session:

1. Codehere ran the approved test command itself, at the end of the agent's turn, and it passed.
2. Every test file, test config, test setup file and CI file whose bytes changed since the session started was read by the weakened-test scan, and the scan found nothing.

A test file is code in a test folder or with a test name, in a language the scan reads (`EXT_LANG` in `v2/src/noskip.js`); data in a test folder is not one. Test configs, setup and CI files are the ones `isCheckFile` in `v2/src/signals.js` names.

"Changed" is decided by Codehere's own record of each such file's bytes, taken at session start without asking git and kept when a session resumes. A change git does not show is read through a diff Codehere builds from that record; to build it, Codehere writes the start version of a file that was changed or untracked at session start into git's object store, where git can later prune it. A new file the agent leaves untracked is read the same way. If a change cannot be read at all, there is no ✓ and the line says so.

Test files are read through that record alone, never through git's diff of them, which can be of the index or of a replaced commit. Other files are read through git's diff, with Codehere's own settings whatever the repo's config says: no external diff program, textconv, color, replace objects, fsmonitor or repo hooks.

A test file touched while the check runs (between reading the record and the end of the test run) means no ✓: what ran may not be what was read. A file's change time cannot be set back, so a swap and a swap back are both seen. Tests that write test code into the repo while they run get no ✓ for the same reason.

## What the agent may do, and the promise must still hold

- Edit, add, delete or rename any file in the work tree, and leave it unstaged, untracked or ignored.
- Change anything under `.git/`: config, index flags (assume-unchanged, skip-worktree, sparse-checkout), attributes, `info/exclude`, replace refs, hooks.
- Run any git command, including ones that make git report a changed file as unchanged or stop reading the folder as a repo.

## Out of scope

A review that finds one of these should name it as out of scope, not as a hole in the promise.

- The agent changing Codehere itself: its installed code, its state in `.codehere/local/`, the approvals file in the user's config folder, or the agent's hook settings outside the repo.
- The agent's code stopping the hook: a process it started that kills or stalls the hook. The result is no line, never a false ✓.
- Code outside the work tree that the tests load: global packages, the language runtime, files under the user's home folder.
- How much a passing test checks. The scan looks for known ways to weaken tests (measured on CheatBench, `docs/evidence/2026-11-13-cheatbench.md`). A weakening it has no pattern for is a gap in detection, which is measured separately; this promise is about every changed file being read.
- Folders the byte record does not walk: `.git`, `.codehere`, `node_modules` and `site-packages`; a folder holding its own `.git` (a nested repo or a worktree) or a `pyvenv.cfg` (a virtual environment); and the folders git ignored at session start. A test file the agent puts there is not read. A repo with more than 200,000 entries outside them gets no byte record. The finish check then says so and prints no ✓.
- Deleting or moving `.codehere/`: the hooks find no Codehere folder and stay silent. Its config and rules are tracked, so the deletion is in the diff a person reads.
- A filter program the repo sets (in `.gitattributes`) still runs inside `git status`. If it kills or stalls the hook, the result is no line; if it swaps a test file, the check above sees the change.
- One pattern match longer than 1,000 characters on a line longer than 10,000: a long line is read in overlapping pieces of 10,000, so such a match across two pieces is a detection gap like any other.

## Honest work

The promise has a second side: honest work is not sent back. A false send-back is a finding too, rated by how often an ordinary session would meet it.
