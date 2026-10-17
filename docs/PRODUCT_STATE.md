# codehere · product state

Last verified 2026-10-16. One page. Numbers come from commands noted next to them.

**USERS: 0.** Nine people on the waitlist were emailed on 2026-09-17 (`agent/docs/discovery/SIGNUP_WELCOME.md`, legacy branch); none has replied. Sales sprint from 2026-10-08: stop rule is 30 qualified asks and no written commitment by 30 Oct (`studio-os/NOW.md`: 4 prospects verified, 0 messages sent, 0 commitments).

## What exists

- **`codehere check`** re-runs a project's tests and reports whether they passed. It exits 1 on a failing run, a weakened existing test (`assert True`, a skip marker, a commented assertion, a `return` above an assertion), a run that collected zero tests, or (with `--claim`) a named test file that is not in the repo. Options: `--json`, `--proof`, `--claim`, `--base`. `codehere help [command]` is the only other command (`node dist/index.js --help`).
- **GitHub Action** in `action/`: posts the receipt on a pull request. Run live on 5 pull requests in a throwaway repository on 2026-10-13. Not published to the marketplace and not run on anyone else's repository.
- **Package:** npm latest is 1.0.1, which has `check` with `--json` and `--proof` only (`npm view codehere version`, and `check --help` of the installed 1.0.1, 2026-10-16). This repository is 1.0.2, unpublished, and adds `--base`, `--claim` and the zero-test and Go fixes.

## What has been measured

- **False-done eval:** 22 recorded claims (14 false, 8 true), graded by code. 12 of 14 false claims caught, 2 false green (`fd-04`, `fd-14`), 8 of 8 true claims confirmed, 0 false alarms (`node agent/eval/false-done.mjs`, 2026-10-16; stored result `agent/eval/false-done-result.json`). The cases were written to fit the detectors.
- **S11, how often agent pull requests carry a failing claim:** not measured. Two models labeled 299 public agent pull requests and disagreed (kappa 0.092). No rate is claimed. Report: `agent/eval/promise-verification/studies/S11-demand/REPORT.md`. The human anchor is postponed.
- **Tests:** 190 in 19 files, all passing (`cd agent && npm test`).
- **Not reproducible, so not used:** "0 real test weakenings in 302 agent PRs" (source data lost, one labeler).

## Open, and the owner's to decide

- Publish 1.0.2 (needed before the Action can use `--base` and `--claim`).
- Push: local commits are not pushed; older ones lack review tokens, so the pre-push hook blocks (`git rev-list --count origin/v1-enterprise-spine..HEAD`).
- Price and whether it recurs (the S11 pre-registration assumes £79 per repo-month).

## Where to look

`agent/README.md` (what a user sees) · `agent/eval/` (false-done eval, S11 and the campaign) · `agent/CLAUDE.md` (how work is done here).
