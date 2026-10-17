# codehere

> **Re-runs the tests an AI says passed, and tells you whether they did.**
> `codehere check` on your machine, or the GitHub Action on every pull request. No account.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](https://github.com/muhammadegaa/codehere/blob/main/LICENSE)

`codehere check` re-runs your project's tests itself and reports the real result, so you do not have to take an agent's "all tests pass" on trust. It detects `npm test`, `node --test`, `pytest`, `go test`, `cargo test` and vitest or jest configs.

## Install

```
npx codehere check
```

The npm release is 1.0.1, which has `check` with `--json` and `--proof`. The options `--base` and `--claim` below are in this repository (version 1.0.2) and are not published yet. To use them now, build from source: `cd agent && npm ci && npm run build && node dist/index.js check`.

## The four commands

```
codehere check                                    # re-run the tests here
codehere check --base origin/main                 # also read everything this branch changed
codehere check --claim "<the agent's summary>"    # flag test files it named that do not exist
codehere check --proof                            # a receipt you can paste into a pull request
```

`codehere help check` lists the options. `--json` adds a `verdict` (`pass`, `fail`, `unverified` or `skipped`) and the receipt text.

Exit codes: 0 when the tests ran and passed and nothing was weakened; 1 when the tests fail, no test ran, or the change made a test check nothing (an assertion swapped for `assert True` or `assert.ok(true)`, a skipped test, an assertion commented out, or a `return` above it); 2 when nothing could be verified (the run timed out, no test command was recognized, the runner is not installed, or the re-run was turned off).

## GitHub Action

A GitHub Action that posts the receipt on each pull request is in [`action/`](https://github.com/muhammadegaa/codehere/tree/main/action). It runs `npx codehere@<version> check --json --base origin/<base> --claim=<PR body>`, so it needs a published release that includes those options. It is not published to the marketplace.

## What it does not catch

- **Weakened tests.** The detector reads Python (`test_*.py`, `*_test.py`), JavaScript and TypeScript (`*.test.*`, `*.spec.*`), Go (`*_test.go`) and PHP (`*Test.php`) test files, and files under `test`, `tests` or `__tests__`. It flags an assertion replaced by an always-true one, a skip marker, a commented-out assertion and an early `return`. It does not flag a deleted assertion, a deleted test or test file, a loosened expectation, or an edited test script. It sees uncommitted changes, and with `--base <ref>` everything since the branch left that ref. Only test files are diffed; if their diff cannot be read (over 64 MB), the run is reported as unverified. In a folder that is not a git repository, or before the first commit, the scan is skipped and the output says so.
- **`--claim`** finds test files named in the summary in plain text, in quotes or backticks, in markdown bold or italics, in brackets, in `path::test` form and with a `:line` suffix. A file counts as present when any file with the same name exists in the checkout (outside `node_modules`, `dist`, `build`, `vendor`, `target` and virtual environments), so a file in the wrong folder is not reported.
- **A passing suite with a broken build, and code the tests do not cover.** A receipt says what the test suite showed, not that the software is correct.
- **Who controls the tests.** `check` runs the project's own test command, so whoever controls that command controls the result. For a pull request from someone you do not trust, a receipt is not evidence. In the Action, use the `pull_request` trigger, not `pull_request_target`.

## What has been measured

- **False-done eval, 22 cases.** 14 false "tests pass" or "all green" claims (6 reconstructed from public posts, 8 planted) and 8 true ones. `codehere check` caught 12 of the 14 false claims, missed 2 (a green suite with a broken build, and green tests with a broken production job), and raised 0 false alarms on the 8 true ones. Result: [`agent/eval/false-done-result.json`](https://github.com/muhammadegaa/codehere/blob/main/agent/eval/false-done-result.json), produced by `node eval/false-done.mjs`. The cases were written to fit the detectors, so this is a small set and not a general rate.
- **How often agent pull requests carry a failing claim: not measured.** A pre-registered study (S11) had two models label 299 public agent pull requests. They disagreed (Cohen's kappa 0.092), so the study reports no rate. The report, with the method and its limits: [`agent/eval/promise-verification/studies/S11-demand/REPORT.md`](https://github.com/muhammadegaa/codehere/blob/main/agent/eval/promise-verification/studies/S11-demand/REPORT.md).

## Development

```
cd agent
npm ci
npm test            # build, then vitest
npm run lint
node eval/false-done.mjs
```

## License

MIT. See [`LICENSE`](https://github.com/muhammadegaa/codehere/blob/main/LICENSE).
