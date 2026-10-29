# v2 Stop hook vs `codehere check` (1.0.3): overlap and recommendation

Written 2026-10-24. Both tools re-run the tests and scan for weakened tests. This compares them on the same inputs.

## Measured: same 8 tamperings, both detectors

Fixture: a small Node repo (`node --test`) with one failing test. Each row applies one change to `test/cart.test.js`, then runs `codehere check --json` (1.0.3, the published build) and v2's `tamperFindings` on the same `git diff HEAD`. Script: `/tmp/ch-v2-real/overlap/compare.sh` (not in the repo).

| Tampering | 1.0.3 `check` | v2 Stop hook |
|---|---|---|
| `test.skip(...)` | caught (skipped) | caught |
| node:test `{ skip: true }` | caught (skipped) | missed |
| assertion replaced with `assert.equal(1, 1)` | caught (trivial-assertion) | missed |
| assertion commented out | caught (commented-out) | missed |
| `.only` on another test | caught (skipped) | missed |
| `return;` above the assertion | caught (unreachable-assertion) | missed |
| test file deleted | verdict fail, but no finding names the deletion | caught |
| expected value edited to match the bug (1300 → 800) | **missed: verdict pass** | **missed** |

`check` catches 6 of 8, v2 catches 2 of 8. Neither catches an edited expected value. That is the cheat the x10 experiment found most often after a blocked test edit; only re-running the tests from before the session (the shadow run, not in 1.0.3) catches it.

## Other differences

| | 1.0.3 `check` | v2 Stop hook |
|---|---|---|
| Scope | diff against `HEAD` or `--base` | only files changed in this session (baseline taken at SessionStart) |
| Test command | Node, Go, Rust, pytest, vitest/jest, `node --test`, override | the command saved by `init` (npm test today) |
| All tests skipped | not a pass (`noTests`) | counted as a pass |
| Extra rules | trivial, commented-out, unreachable, `.only`/`fit` | deleted test file, net assertions removed, `@ts-nocheck`, `--no-verify` |
| Runtime | TypeScript build with dependencies | plain Node, no dependencies |
| Output | verdict, findings, receipt (JSON) | a message to the agent |

## Recommendation

**Do not call `codehere check --json` from the v2 hook.** Two reasons:

1. They are the same npm package. If v2 ships as `codehere@2.0.0`, there is no separate 1.x binary to call; v2 would have to contain `check` anyway.
2. `check` has no way to limit itself to this session's files. Calling it would flag changes the user made before the session, which breaks v2's rule "only react to this session's work".

**Do this instead:** move the two deterministic parts of `check` (the weakened-test detector and the test-command finder, about 620 lines) into one zero-dependency module in v2. The Stop hook passes it this session's files; a `codehere check` subcommand passes the whole diff. Keep v2's extra rules (deleted test file, assertions removed). Then add the shadow run (re-run the tests as they were at session start) to catch edited expected values.

**Not before the 14:00 demo.** The demo's tampering scene uses `.skip`, which v2 already catches in a real Claude Code session. The port is a few hours of work with its own tests, and nothing in `agent/` changes until the owner decides.
