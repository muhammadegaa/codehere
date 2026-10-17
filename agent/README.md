# codehere

> **Re-runs the tests an AI says passed, and tells you whether they did.**
> `codehere check` on your machine, or the GitHub Action on every pull request. No account.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](https://github.com/muhammadegaa/codehere/blob/main/LICENSE)

`codehere check` re-runs your project's tests itself and reports the real result, so you do not have to take an agent's "all tests pass" on trust. It detects `npm test`, `node --test`, `pytest`, `go test`, `cargo test` and vitest or jest configs.

## Install

```
npx codehere check
```

## The four commands

```
codehere check                                    # re-run the tests here
codehere check --base origin/main                 # also read everything this branch changed
codehere check --claim "<the agent's summary>"    # flag test files it named that do not exist
codehere check --proof                            # a receipt you can paste into a pull request
```

`codehere help check` lists the options. `--json` adds a `verdict` (`pass`, `fail`, `unverified` or `skipped`) and the receipt text.

Exit codes:

- **0**: the tests ran and passed, no test was weakened, no named test file is missing, and the weakened-test scan finished.
- **1**: the tests failed; the runner reported no test that ran (0 tests, or every test skipped); the change made a test check nothing (an assertion swapped for `assert True` or `assert.ok(true)`, a skip marker, an assertion commented out, or a `return` above it); or a test file named in `--claim` is not in the repository. Usage errors (an unknown `--base`, a missing folder, an unknown option) also exit 1, with the message on stderr and nothing on stdout, and so does an internal error. Pass the claim as `--claim=<text>`: in `--claim --json` the claim is the text `--json`.
- **2**: nothing could be verified: the run timed out, no test command was recognized, the runner is not installed, the re-run was turned off, or the weakened-test scan could not run (git is not installed, git could not read the repository, or the diff could not be read).

Settings, as environment variables: `CODEHERE_TEST_CMD` replaces the detected test command (split on whitespace, no shell); `CODEHERE_RERUN_TIMEOUT_MS` sets the time limit in whole milliseconds (default 120000, two minutes, also used for a value that is not a whole number from 1 to 2147483647); `CODEHERE_RERUN_TESTS=0` turns the re-run off. Detection covers `npm test` (a `test` script in `package.json`), `go test ./...`, `cargo test`, `pytest` (with `pytest.ini`, `conftest.py` or a pytest section in `pyproject.toml` or `setup.cfg`), `vitest.config.ts`/`.js`, `jest.config.js`/`.ts`, and `node --test` for `*.test.js` files.

"No test ran" is read from the runner's own summary for node:test, pytest, jest, vitest and Go's `[no test files]`. A Go package with test files but no tests (`[no tests to run]`), `cargo test` with 0 tests, jest with `--passWithNoTests`, mocha, and a test script that only prints "No tests found" read as a pass. A test script that leaves a background process holding its output open is reported as timed out, even when the tests passed.

## GitHub Action

A GitHub Action that posts the receipt on each pull request is in [`action/`](https://github.com/muhammadegaa/codehere/tree/main/action). It runs `npx codehere@<version> check --json --base origin/<base> --claim=<PR body>`. Its default version is 1.0.2. The 120-second default time limit applies, and the Action has no input to change it. With the default `fail-on-unverified: false`, a pull request that makes the suite unrunnable (removes the test script, breaks the runner) gets `unverified` and a green job with a warning, and a `skipped` verdict (the re-run turned off in the workflow) gets a green job with no warning. Set `fail-on-unverified: true` to fail the job on `unverified`. It is not published to the marketplace.

## What it does not catch

- **Weakened tests.** The detector reads Python (`test_*.py`, `*_test.py`), JavaScript and TypeScript (`*.test.*`, `*.spec.*`), Go (`*_test.go`) and PHP (`*Test.php`) test files, and files under `test`, `tests` or `__tests__`. It flags an assertion replaced by an always-true one (`assert True`, `assert.ok(true)`, `assertTrue(True)`, a value compared with itself), a skip marker (including `skipif(True)`, `it.only(`, `test.only(` or `describe.only(` outside strings and `//` comments (including `test.describe.only(`), and in JavaScript, TypeScript and Vue files `fit(` or `fdescribe(` at the start of a statement, after `=>`, or after `await`, `return` or `void`; variants such as `test.only.each` are not flagged, a JavaScript helper or method named `fit` at the start of a statement is flagged, and `.vue` files are read only under `test`, `tests` or `__tests__`), a commented-out assertion and an early `return`. It does not flag a deleted assertion, a deleted test or test file, a loosened expectation, an always-true check written another way, or an edited test script. A very small test file that is renamed and changed in the same commit can read to git as a new file, and a new file is not scanned. Without `--base` it sees only uncommitted changes, so a weakened test that is already committed passes; with `--base <ref>` it sees everything since the branch left that ref. Only test files are diffed; if their diff cannot be read (over 64 MB), the run is reported as unverified. In a folder with no git repository and no `--base`, or before the first commit, the scan is skipped and the output says so. When git is missing or fails on a repository that is there, or `--base` is given outside a repository, the run is reported as unverified.
- **`--claim`** finds test files named in the summary in plain text, in quotes or backticks, in markdown bold or italics, in brackets, in `path::test` form and with a `:line` suffix. It ignores absolute paths, Windows backslash paths and Java `*Test.java` names. A file counts as present when any file with the same name exists in the checkout (outside `node_modules`, `dist`, `build`, `vendor`, `target` and virtual environments), so a file in the wrong folder is not reported. The search goes 8 folders deep and stops after 50,000 entries, so a named file deeper than that, or in a larger checkout, is reported as missing.
- **A passing suite with a broken build, and code the tests do not cover.** A receipt says what the test suite showed, not that the software is correct.
- **Who controls the tests.** `check` runs the project's own test command, so whoever controls that command controls the result, and whoever controls the environment can point the weakened-test scan at another tree (`GIT_DIR`, `GIT_WORK_TREE`). For a pull request from someone you do not trust, a receipt is not evidence. In the Action, use the `pull_request` trigger, not `pull_request_target`.

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
