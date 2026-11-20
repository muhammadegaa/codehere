# Cold review, round 22 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on 0cbdd5d, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 0cbdd5d, 945433e and d5dc9e7 with real `git diff -U0` output and the file read; the key cases through the real hooks in throwaway repos. It marked each finding as a regression or not, and tried its suggested fix for finding 1 in a scratch copy.
- Our reproduction: each finding we changed code for is a check in the `R22` block of `test/e2e.mjs`, run on 0cbdd5d first.

## Findings

No Blocker: since 945433e only `noskip.js`, `signals.js` and the promise changed.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | round 21's formatter fix dropped a whole line whose call does not close, subject and matcher with it, so weakening or flipping the first line of a spread assertion was not compared: `toHaveBeenCalledWith(` to `toHaveBeenCalled()`, `toEqual({` to `not.toEqual({`, `toThrow(` to `not.toThrow()`, a Python `== {` to `!= {`: ✓ through the hooks | yes, from 945433e and d5dc9e7 | fixed |
| 2 | Spec | Major | a call-style assertion spread over lines (`assert.deepStrictEqual(result, {`, `self.assertEqual(`) is never compared, so weakening it to `assert.ok(result)` gets ✓ | no, in every build | named in the promise and the README |
| 3 | Spec (honest) | Minor | an always-true assertion that only moved (`expect(true).toBe(true)` re-indented) was sent back as added | yes, from 945433e | fixed |
| 4 | Spec (honest) | Minor | an assertion made stronger (`toBeTruthy()` to `toBe(true)`, `toEqual` to `toStrictEqual`) is read as changed | no | named as a false send-back |
| 5 | Spec (honest) | Minor | RSpec's `to eq(` spread over lines read as a weakened assertion | no | fixed |
| 6 | Standards | Nit | a comment's wording, and a `#` comment holding a bracket made a Python assert look unbalanced | no | fixed |

Blocker: 0. Major: 2, both on the Spec axis: finding 1 a regression from round 21, finding 2 a gap in every build. Round 22 is not clean under finish line B.

How we triaged: finding 1 came from cutting too much in round 21. The reviewer's fix keeps the subject and matcher of a line whose call does not close and skips only the argument comparison; we checked its scratch patch line by line and applied it, with the same handling for RSpec (finding 5). Finding 2 needs a reader that joins an assertion's lines, which is new parsing, so under round 17's rule it is named instead. The strengthening false send-back (finding 4) is named rather than fixed, since letting a matcher change pass needs a rule that could let a weakening through.

## Fixes

Each change started as a failing check in the `R22` block (6 red on 0cbdd5d; one more, a Python value changed beside a comment holding a bracket, passes there through signals' own shape check and guards the noskip change). e2e 926/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | noskip's expect-style parser returns the subject and matcher with no arguments when the matcher's call does not close; its Python parser does the same when the condition's brackets do not balance; the comparison skips arguments when either side has none. | the four weakenings and flips found; round 21's honest formatter cases still quiet |
| 3 | The "cannot fail" rules let off a line that only moved, as every moved assertion is. | no finding |
| 5 | RSpec's `to eq(` that does not close on the line has no arguments to compare. | no finding |
| 6 | The Python bracket check stops at a `#` outside strings. | found |

The reviewer's 38 cases, run again on the fix: every weakening and flip is found; the honest formatter, re-indent and RSpec cases are quiet; the honest strengthening cases and the call-style spread cases are the two items now named. Rounds 15 to 20's 422 cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
