# Contributing to codehere

codehere is one command, `codehere check`, which re-runs the tests an AI says passed and reports whether they did. Issues and pull requests are welcome.

## Setup

```
cd agent
nvm use      # Node 20 or later, from .nvmrc
npm ci
npm test     # build, then the vitest suite
```

You also need `gitleaks` for the pre-commit hook (`brew install gitleaks`). If it is missing, the hook warns and skips the scan. `npm ci` in a git checkout runs `scripts/install-hooks.sh`, which points git at `.githooks`. The pre-push hook blocks a push when a non-trivial commit message lacks a review token (`Reviewed by codex`, `Reviewed by claude-max-cold`, or `[no-review: <reason>]`); the header of `.githooks/pre-push` says what counts as trivial.

## Before you open a pull request

- `npm run build`, `npm test`, `npm run lint` and `npm run format:check` pass.
- `node eval/false-done.mjs` still prints 12 of 14 false claims caught, 8 of 8 true ones confirmed and 0 false alarms. A change to detection code that moves those numbers should say so in the pull request.
- A change to `check` comes with a test that fails without it. Tests run the real CLI through `spawnSync` where they can; see `agent/test/cli/`.
- A missed false claim or a false alarm is the most useful issue you can open. Include the repository layout, the claim text and what `codehere check` printed.
- `npm run knip:gate` passes: delete what you stop using in the same change.

## Commits

One concern per commit. The message says why, not what. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `security`.

## Out of scope

- Telemetry or phone-home code of any kind.
- Closed-source dependencies.
- Features other than checking what an AI claimed about its tests.

## License

By contributing you agree your work is licensed under the project's MIT license (see [`LICENSE`](./LICENSE)).
