# Cold review, round 17 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on 428c3ac, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every case ran on d5dc9e7, 2d31b76 and 428c3ac; the key cases through the real hooks in throwaway repos, with stub `tox` and `pytest` commands that run `node --test`.
- Our reproduction: each finding we fixed is a check in the `R17` block of `test/e2e.mjs`, run on 428c3ac first.

## Findings

No Blocker: every miss is in a file the scan reads.

| # | Axis | Reviewer | Finding | Our rating | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | a tox command continued with `\`: its later lines were not read as pytest's arguments (✓ through the hooks) | Major (regression from round 16) | fixed |
| 2 | Spec | Major | the `-k` "narrowed back" rule compared with every start value, so a `-k` copied to a second env, or narrower than another env's, was never new (✓ through the hooks) | Major (regression from round 16) | fixed |
| 3 | Spec | Minor | tox named by its path (`.venv/bin/tox`) or in a subshell did not count as running tox | Minor (regression) | fixed |
| 4 | Spec (honest) | Minor | a new tox env, or a new jest or playwright project, that copies an existing ignore was sent back | Minor (new in round 16) | tox fixed; JavaScript projects named in the promise |
| 5 | Spec | Minor | `.pytest.ini`, `pytest.toml` and `.pytest.toml` were not test configs (pytest's docs list all three) | Minor | fixed |
| 6 | Standards | Minor | an addopts `"""` line holding a line separator threw, and the finish check went silent | Minor (new) | fixed |
| 7 | Standards | Minor | the typed-declaration pattern was quadratic on a long line | Minor (new) | fixed |
| 8 | Spec | Minor | a CI job switched off whose test command lives elsewhere (`extends:`, anchors, reusable workflows, `workflow: rules:`, Azure `condition: false`) | Minor (all builds) | named in the promise |
| 9 | Spec | Minor | a filter key written as a shorthand property | Minor (all builds) | named in the promise |
| 10 | Spec (honest) | Nit | a list moved into a variable and spread back was sent back | Nit (all builds) | fixed |

On the out-of-scope list, said once: pytest `testpaths`, jest `testMatch`, `collect_ignore`, and tox's `- pytest` prefix and `ignore_outcome` have no pattern. They are now named in the promise as known gaps.

Blocker: 0. Major: 2 (Spec axis), both regressions from round 16. Round 17 is not clean.

How we triaged: since round 13, every Major has been a regression from the previous round's fix, because each fix widened what the scan parses. This round fixes regressions, honest send-backs, and holes in which files are read; new forms of config the scan has never read are named in the promise as known gaps instead of parsed. This is a proposal to Ega for how L13 finishes; Ega has not decided.

## Fixes

Each fix started as a failing check in the `R17` block (15 red on 428c3ac; two more checks already passed there and guard the behaviour), then 0 red; e2e 856/0 and all 8 CI steps on a clean clone.

| # | Fix | Check |
|---|---|---|
| 1 | Lines of `commands` ending in `\` are joined before they are split into commands. | `--deselect` and `-k` on continued lines: found |
| 2 | A narrower `-k` is let off only where it replaced the wider value it narrows (that value is now set in fewer places). | the three regressions found; round 16's narrowed `-k` still quiet |
| 3 | tox counts as a command word after `/` or `(` too, and before `;`, `&`, `|` or `)`. | three forms found; `pytest -c ./tox.ini` quiet |
| 4 | tox envs are places by section name; a new env that sets what every env set at the start is a copy. | the copying env: no finding; a new env with a `--deselect` no env had: found |
| 5 | The three names are pytest config files; `.toml` ones are read as TOML. | `.pytest.ini` through the hooks: sent back; `pytest.toml` and `.pytest.toml`: found |
| 6 | The value after `addopts =` is taken by position, not by a pattern that stops at a line separator. | no throw |
| 7 | The type before `=` is at most 200 characters, and the line is cut at 10,000. | a 140 KB line read in under 2 s |
| 10 | A `...spread`'s own text is not a value. | no finding |

The reviewer's cases, run again on the fix: its 46 scan cases give the expected result except 18, each the same on 428c3ac, all items named in the promise (finding 4's JavaScript projects, 8, 9 and the out-of-scope list); its hook cases give the expected result except the new jest project, the named false send-back. Round 16's 68 cases and round 15's 109: unchanged. Round 14's hook and scan cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
