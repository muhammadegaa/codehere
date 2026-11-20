# Cold review, round 23 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on 9af23ae, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 9af23ae, 0cbdd5d and d5dc9e7 with real `git diff -U0` output and the file read; four findings also through the real hooks in throwaway repos with node:test. It marked each finding as a regression or not, and tried its suggested fixes for findings 1 to 5 in scratch copies.
- Our reproduction: each finding we changed code for is a check in the `R23` block of `test/e2e.mjs`, run on 9af23ae first.

## Findings

No Blocker: since 0cbdd5d only the weakened-test rules changed, so the record and read path is the same.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec (honest) | Major | tests wrapped in a `describe` with a new test placed above one that checks the same variable another way: the old assertion was paired with the new test's (`toEqual(…)` → `toBeNull()`) before its own unchanged copy, and the ✓ was withheld; reordering tests while wrapping did the same | yes for a spread assertion, from 0cbdd5d (round 22 made its first line comparable); the one-line form in every build | fixed |
| 2 | Spec (honest) | Minor | a call given an option with its spread expected value updated read as "the call was changed and its expected value kept": two unknown values were read as equal | yes, from 0cbdd5d | fixed |
| 3 | Spec | Minor | a Python condition that closes on its line, with only the message wrapped (`assert resp.status_code == HTTPStatus.OK, (`), lost its value comparison, so `OK` to `BAD_REQUEST` was not read | yes, from d5dc9e7 | fixed |
| 4 | Spec | Minor | a case dropped from a list on the first line of a spread assertion (`expect(parseAll(['a=1', 'b=2', 'c=='])).toEqual([`) was skipped as an assertion line: ✓ through the hooks. The one-line form is missed in every build while the README lists the rule without that exception | the spread form yes, from 0cbdd5d | the spread form fixed; the one-line form named in the README and the promise |
| 5 | Spec (honest), Standards | Minor | editing only the comment on a Python assert line (`== 4  # was 3` to `# checked by hand`) read as "an expected value was changed" | yes for a comment holding a bracket, from 0cbdd5d; a plain comment in every build | fixed |
| 6 | Spec | Minor | an always-true placeholder (`expect(true).toBe(true)`) moved from its own test in place of a failing test's only assertion was let off as moved: ✓ through the hooks | yes, from 0cbdd5d and d5dc9e7 | fixed |
| 7 | Standards | Nit | a boolean `open` in the RSpec branch shadowed the index `open` | no | renamed |

On the out-of-scope list, said once: "compared on its subject and matcher" covered two cases visible on the first line alone. A wrapped call's arguments dropped entirely (`rejects.toThrow(` to `rejects.toThrow()`) are now read as weakened, since a call that does not close always had arguments. An expected value wrapped in `expect.objectContaining(` is named in the promise.

Blocker: 0. Major: 1, on the Spec axis (honest work sent back), a regression from round 22. Round 23 is not clean under finish line B.

How we triaged: finding 1 is common honest work, so it is fixed where it starts, with the reviewer's tried fix: an assertion is paired first with its exact twin, and two lines that each only moved in the file are not compared with each other. Findings 2 to 6 are regressions or slips from rounds 21 and 22 and are fixed with the reviewer's suggested changes; finding 6's fix lets a moved always-true line off only when the file lost no assertion that did not also move. The one-line list case in finding 4 is not a regression, and reading inside a whole assertion line is new parsing that could send back a rewritten test, so under round 17's rule it is named, and the README's list of what is caught now says so.

## Fixes

Each change started as a failing check in the `R23` block (9 red on 9af23ae; one more, an expected value changed while another assertion is deleted in a wrap, passes there and guards finding 1's fix). e2e 936/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | noskip pairs each removed assertion with an exact twin first, and does not compare two lines whose texts both only moved in the file. | the wrap with a new test above, spread and one-line: no finding; the cheat in a wrap: found |
| 2 | "Call changed, expected kept" needs the old expected value known. | no finding |
| 3 | The Python parser decides whether a condition is open from the condition alone. | found |
| 4 | The list rule skips only an assertion whose arguments are known. | found |
| 5 | The Python assert is cut at a `#` outside strings before its value is read. | both comment edits: no finding |
| 6 | A moved line that cannot fail is read when the file lost an assertion that did not move. | found |
| note | A wrapped call whose arguments are dropped entirely is weakened. | found |

The reviewer's 38 cases, run again on the fix: 16 differ from 9af23ae, each the intended change (findings 1 to 6, and the dropped arguments); of the 22 unchanged, the cheats left quiet are the named ones (`expect.objectContaining(`, the one-line list, a list of names). Rounds 15 to 22's 460 cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
