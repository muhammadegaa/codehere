# Cold review, round 18 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 6713250, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every case ran on d5dc9e7, 428c3ac and 6713250; the key cases through the real hooks in throwaway repos, with a stub `tox` that runs `node --test`. It marked each finding as a regression or not.
- Our reproduction: each finding we changed code for is a check in the `R18` block of `test/e2e.mjs`, run on 6713250 first.

## Findings

No Blocker: every miss is in a file the scan reads, or in one the promise does not count.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | round 17's "a new tox env that copies what every env set" rule let a filter spread to tests that ran without it: the integration run moved into its own env and given the unit run's `--ignore-glob` got ✓ through the hooks | yes, from 428c3ac | the rule removed |
| 2 | Spec | Minor | a `-k` narrowed in one command and added to another was let off | no | the rule narrowed |
| 3 | Spec (honest) | Minor | a tox pytest command split into two that both keep its filter was sent back | for `-k` only | named in the promise |
| 4 | Spec | Minor | `tox.toml` and `[tool.tox]` in `pyproject.toml` are not read for commands | no | named in the promise |
| 5 | Spec | Minor | "the approved command runs tox" means it names tox, so `make test` that runs tox does not count | no | the promise says so |
| 6 | Spec | Minor | a `\` with spaces after it did not continue a tox command; `{[section]commands}` substitution not read | no | the first fixed; the second named |
| 7 | Spec (honest) | Minor | a `#` comment after a tox command was read as its arguments | no | fixed |
| 8 | Standards | Nit | round 17's bounds lost a variable's list with a long type, or a one-line list over 10,000 characters | yes, from 428c3ac | fixed |

On the out-of-scope list, said once: a skip made inside a test's body (`t.skip()`, `pytest.skip()`), `xfail`, jest's `test.failing`, playwright's `test.fixme` and pytest's `-m` were caught by no build and named nowhere, while the README's table says a skipped test gets the agent blocked. They are now named in the promise's known gaps and in the README's list of what the scan does not catch.

Blocker: 0. Major: 1 (Spec axis), a regression from round 17. Round 18 is not clean.

How we triaged: as in round 17, regressions, honest send-backs that come from misreading a file, and holes in which files are read are fixed; new forms are named in the promise. One change of approach: finding 1 came from a rule written to stop an honest send-back (round 17 finding 4). When a rule that makes the scan more lenient opens a hole, we now remove the rule and name the false send-back instead of adding more logic.

## Fixes

Each change started as a failing check in the `R18` block (7 red on 6713250), plus round 17's check of a new tox env that copies every env's `--ignore`, which now expects the send-back the promise names (also red on 6713250); e2e 863/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | The copy rule is gone: a value set in more places than at the start is new, wherever the new place is. | the env split and the env rename with the value added: found |
| 2 | A narrower `-k` is let off only as many times as the wider `-k` values it narrows were dropped. | found; round 16's narrowed `-k` still quiet |
| 6 | A `\` with spaces or tabs after it joins the next line, as tox reads it. | found |
| 7 | A `#` and what follows it is cut from each command line first, as tox 4 does. | no finding |
| 8 | The declaration is found in the line's first 10,000 characters with no bound on its type, and its list is read from the whole line. | both found |

The reviewer's 61 scan cases, run again on the fix: 33 give the expected result. Of the other 28, three the reviewer marked with a question mark (one of them now gives a finding it did not on 6713250); the rest give the same result on 6713250, and each is named in the promise (the new detection gaps above, the known false send-backs, tox in TOML, `make test`, a filter moved between tox envs when one env is approved, a test path removed from a command). Round 18's Major through the reviewer's hook harness: ✓ on 6713250, sent back on the fix. Rounds 15 and 16's cases: unchanged; round 17's: one changed, the new-env copy case, now the named send-back. Round 14's hook and scan cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
