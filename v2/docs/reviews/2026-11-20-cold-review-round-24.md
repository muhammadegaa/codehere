# Cold review, round 24 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on fbd8b88, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on fbd8b88, 9af23ae, 0cbdd5d and d5dc9e7 with real `git diff -U0` output and the file read; findings 1 to 3 also through the real hooks in throwaway repos with node:test. It fuzzed 224 honest layouts (tests wrapped, reordered or moved into a class, with a new test at each position, with and without blank lines), marked each finding as a regression or not, and tried a fix for findings 1, 2, 3 and 5 in a scratch copy.
- Our reproduction: each finding we changed code for is a check in the `R24` block of `test/e2e.mjs`, run on fbd8b88 first.

## Findings

No Blocker: since 9af23ae only the weakened-test rules changed, so the record and read path is the same.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | two tests that check the same text another way get their expected values swapped (the code under test inverted): round 23's rule that two lines which each only moved are not compared let both through, and the moved-line rule let both off: `codehere ✓ … 2 passed` through the hooks, in vitest, pytest, node:assert and `assert.ok` forms, in place or while wrapping, and three status codes rotated | yes, from 9af23ae and d5dc9e7 | fixed |
| 2 | Spec (honest) | Major | tests wrapped with a new test above whose list is shorter (`stats([1])` above `stats([1, 2, 3])`): the old line was paired with the new test's line, read as "a case was removed", ✓ withheld through the hooks | yes for a spread assertion, from 9af23ae and d5dc9e7; a plain line and a call-style spread in every build | fixed |
| 3 | Spec (honest) | Major | round 23's fix for wrapping with a new test failed when blank lines between tests split git's diff: 9 of 84 JS layouts and 5 of 18 Python layouts sent back | no (9af23ae sent back 34 and 11) | fixed |
| 4 | Spec | Minor | a spread assertion's call changed with its value kept (`expect(total(items)).toEqual({` to `total(items, { skipTax: true })`) is no longer read, since round 23 stopped reading two unknown values as equal | yes, from 9af23ae and d5dc9e7 | named in the promise and the README |
| 5 | Spec | Minor | a value changed in a wrapped test while a new test repeats the old line: round 23's copy-first pairing took the other test's copy, so `toBe(3)` to `toBe(4)` was not compared | yes, from 9af23ae and d5dc9e7; without the wrap git shows only added lines and every build misses it | fixed; the unwrapped form named |
| 6 | Standards | Minor | the rule that two lines which each only moved are not compared had no check either way | no | the rule removed; checks for the swap and a reorder with blank lines added |
| 7 | Spec (honest) | Nit | a deleted comment naming an assertion counted as a lost assertion, so a wrapped always-true placeholder was sent back | yes, from 9af23ae | fixed |

On the out-of-scope list, said once: finding 4 made "compared on its subject and matcher" wider than the README said. The README and the promise now say a spread assertion is compared on its matcher only, flipped or weakened.

Blocker: 0. Major: 3. Finding 1 is a Spec-axis regression from round 23 that gives ✓ to a common cheat; findings 2 and 3 are honest work sent back. Round 24 is not clean under finish line B.

How we triaged: finding 1 came from a rule written to spare honest work that opened a hole, as in rounds 18 and 21, so under round 18's approach that rule is removed. Its job and that of round 23's copy-first pairing are done by one exact rule in its place: a removed line pairs only with an added line in the same test, named by the nearest line at or above it that names a test, and first with its exact copy there. A test that only moved keeps its lines; a value changed or swapped between tests stays inside its test and is compared. The same rule pairs lines for dropped list cases (finding 2). This is the reviewer's tried fix made stricter: its version skipped a pair across tests only when the removed text came back elsewhere. Without the file read (the audit, or a file over 1 MiB), a copy is looked for in the line's own hunk, as before. Finding 4 cannot be told from round 23's honest case without joining an assertion's lines, which is new parsing, so under round 17's rule it is named.

## Fixes

Each change started as a failing check in the `R24` block (10 red on fbd8b88; one more, tests reordered inside a new describe with blank lines, passes there and guards the removed rule). A first version of the fix compared every pair of lines when it looked for copies without the file read, and the 3,000-line timing check took 1.9 s; each hunk is now indexed once. e2e 947/0 and all 8 CI steps on a clean clone after. The first clean-clone run of e2e failed three checks that wait on child processes (a Rust timing check timed out at 195 s) while the machine's load average was 10.8; they had passed in two runs of the same code, the Rust input takes 120 ms in-process (fbd8b88: 112 ms), and the re-run passed 947/0.

| # | Fix | Check |
|---|---|---|
| 1, 3, 5 | noskip pairs a removed assertion only with an added one in the same test, first with its exact copy there; the moved-only rule is gone. | the swaps in place and while wrapping, and in Python: found; the wrap with a new test at 2 and at 0, blank lines between: no finding; the value hidden by a copy in a new test: found |
| 2 | The list rule pairs the same way. | the shorter list in a new test above, in JS and Python: no finding; a case dropped while the old line moves to a new test: found |
| 7 | A lost assertion is counted only outside comments and strings, as the main reading does. | no finding |

The reviewer's cases, run again on the fix: the six swap and rotation cheats and the wrapped copy case are found; the seven shorter-list cases are quiet; its 224 honest layouts send none back (fbd8b88: 14); the two spread call-changed cheats and the unwrapped copy case are quiet and named; its Python comment probes are unchanged. Its 500 by 500 hunk of 9,000-character lines takes 335 ms (fbd8b88: 678 ms). Rounds 15 to 23's 498 cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
