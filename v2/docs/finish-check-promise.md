# What the finish check's ✓ promises

Written 19 Nov 2026 after L13 round 6, and bounded after round 8: Ega chose option A in the Pareto review (`docs/launch/PARETO_2026-11-19.md` in the codehere repo). A review checks the code against this promise, not against everything git can do.

## Who the adversary is

An agent trying to finish its task, doing what agents do while they work. Codehere checks that agent's work. It is not a sandbox against an agent that sets out to defeat Codehere itself, through git's own machinery or by editing Codehere's installed code. What Codehere catches of that kind today it keeps catching, but a way around it is a known limit, not a hole in this promise.

## The promise

Codehere prints ✓ only when all of these hold for the session:

1. Codehere ran the approved test command itself, at the end of the agent's turn, it passed, and, where Codehere can read the runner's count (node, jest, vitest, pytest, mocha, unittest, cargo), at least one test passed. Where it cannot, the ✓ line says "exit 0" instead of a count.
2. Every test file, test config, test setup file and CI file whose bytes changed since the session started was read by the weakened-test scan, and the scan found nothing.
3. No such file was touched while the check ran (between reading the record and the end of the test run): what ran must be what was read.

A test file is code in a test folder or with a test name, in a language the scan reads (`EXT_LANG` in `v2/src/noskip.js`); data in a test folder is not one. Test configs, setup and CI files are the ones `isCheckFile` in `v2/src/signals.js` names.

"Changed" is decided by Codehere's own record of each such file's bytes, taken at session start and kept when a session resumes. Test files are read through that record, from their start version to their bytes now; other files through git's diff, with Codehere's own settings whatever the repo's config says (no external diff program, textconv, color, replace objects, fsmonitor or repo hooks). To build a diff from the record, Codehere writes the start version of a file that was changed or untracked at session start into git's object store, where git can later prune it. If a change cannot be read, there is no ✓ and the line says so.

## What the agent may do, and the promise must still hold

The things agents do while working on a task:

- Edit, add, delete, rename or move any file, with git or without it, and leave it unstaged, untracked or ignored.
- Stage, commit, amend, stash, reset, check out, switch branches, rebase.
- Run the tests, build the project, install packages (into `node_modules`, a virtual environment or a build folder).
- Start a worktree inside the repo.

## Out of scope

A review that finds one of these should name it as out of scope, not as a hole in the promise.

- **Working against Codehere through git's machinery:** index flags (assume-unchanged, skip-worktree, sparse-checkout), replace refs, `core.bare` and `core.worktree`, filters and attributes set to hide a change, repo hooks, moving `.git`, a folder made only to stop the record walking (an empty `.git` or `pyvenv.cfg` beside the tests), or a test folder swapped for a link. The record catches many of these today; a way around it is a known limit.
- **Working against Codehere directly:** editing its installed code, its state in `.codehere/local/`, the approvals file in the user's config folder, or the agent's hook settings outside the repo; deleting or moving `.codehere/` (the hooks then find no Codehere folder and stay silent; its config and rules are tracked, so the deletion is in the diff a person reads); a process that kills or stalls the hook (the result is no line, never a false ✓).
- **Code outside the work tree** that the tests load: global packages, the language runtime, files under the user's home folder.
- **How much a passing test checks.** The scan looks for known ways to weaken tests (measured on CheatBench, `docs/evidence/2026-11-13-cheatbench.md`). A weakening it has no pattern for is a gap in detection, measured separately; this promise is about every changed file being read. A line longer than 10,000 characters is read in overlapping pieces, so one match across two pieces can be missed.
- **What the record does not walk:** `.git`, `.codehere`, `node_modules` and `site-packages`; a folder holding its own `.git` or a `pyvenv.cfg` that held no test file at session start (a nested repo, a worktree, a virtual environment); and the folders git ignored at session start. New test code, or a new `package.json`, in a folder git ignores is not read (a build copying the tests or writing package files, an install); any other new test config or setup file is read wherever the record walks. Tests the approved command runs straight from such a folder (`node --test dist/test`, with the build a separate step) are read only as their source: an edit made in the build output itself is not read. A repo with more than 200,000 entries outside these folders gets no record: the finish check says so and prints no ✓.

## Honest work

The promise has a second side: honest work is not sent back and gets its ✓. A false send-back, or a ✓ withheld from an ordinary session, is a finding too, rated by how often an ordinary session would meet it.
