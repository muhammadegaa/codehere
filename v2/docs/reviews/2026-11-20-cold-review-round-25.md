# Cold review, round 25 (launch bar L13)

- Date: 20 Nov 2026
- Reviewer: the `cold-reviewer` agent on 550cad4, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on 550cad4, fbd8b88, 9af23ae and d5dc9e7 with real `git diff -U0` output and the file read; findings 2 and 3 also through the real hooks in throwaway repos with node:test. It fuzzed 1,672 honest layouts and 288 cheat layouts in JS and Python, marked each finding as a regression or not, and tried a fix for findings 1 to 3 in a scratch copy. Once, a malformed command of its own handed a patch to `python3`, which failed and wrote nothing; the brief allows no programs but node and git.
- Our reproduction: each finding we changed code for is a check in the `R25` block of `test/e2e.mjs`, built from the reviewer's own inputs, run on 550cad4 first.

## Findings

No Blocker: since fbd8b88 only the weakened-test rules changed, so the record and read path is the same.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec | Major | round 24's swap fix did not reach JUnit, Kotlin, xUnit or Rust: their test names sit a line below the annotation, so reading names line by line found none, and a line in no test then took its copy from anywhere in the file. Two tests' values swapped, or a value changed while another test repeats the old line, gave no finding | yes, from 9af23ae and d5dc9e7 (the second form from fbd8b88 too) | fixed |
| 2 | Spec | Major | two tests of one name in two describes or classes shared one key, so swapping their values gave `codehere ✓ … 2 passed` through the hooks | yes, from 9af23ae and d5dc9e7 | fixed |
| 3 | Spec | Major | a line outside any test (a pytest parametrize list, a `for (const x of [...])` around tests, a helper below them, a Go table's check) belongs to the test above it; a new test added between moved it, and the pairing refused the pair. A case dropped from a for-of list gave `✓ … 4 passed` through the hooks; the others gave no finding in the scan | yes, from fbd8b88, 9af23ae and d5dc9e7 | fixed |
| 4 | Spec | Major | an expected value changed in a table row written on one line (`("C5-66", True),` in a parametrize, a `test.each` row, a Go row with `want:`, a JS object row) is read by no build, while the README lists a changed `want` as caught | no, in every build | named in the promise and the README |
| 5 | Spec | Minor | pairing is per hunk, so an assertion whose old and new lines git puts in different hunks (tests wrapped with a new test) is not compared; the older builds sent these back only by pairing with the new test's line | no | named in the promise and the README |
| 6 | Spec (honest) | Minor | a value set outside any test (`const expected = 42;`) moved into its test while a new test above sets the same name is sent back | no, in every build | named as a false send-back |
| 7 | Standards | Minor | the list rule read each added line's list shape again for every removed line: a rewrite of 4,000 list lines took 10.4 s | no, in every build | fixed |

Blocker: 0. Major: 4. Findings 1 to 3 are Spec-axis regressions from round 24 that give ✓ to cheats; finding 4 is a gap in every build that the README claimed was caught. Round 25 is not clean under finish line B.

How we triaged: findings 1 to 3 are holes in round 24's rule, and the reviewer's trial fix closed them with 0 honest send-backs on its fuzz, so it is applied with the same three changes. Test names are read over the whole text and mapped to their lines, keyed by name and occurrence. A line in no test looks for its copy in its own hunk, as before round 24. A removed line may pair across tests when its text is left nowhere in the new file, as every build before round 24 did. Finding 4 needs a reader that pairs table rows and compares their values, which is new parsing, so under round 17's rule it is named, and the README's list of what is caught now says so. Finding 5 needs pairing across hunks within a test, also new; finding 6 is the same in every build.

## Fixes

Each change started as a failing check in the `R25` block, built from the reviewer's inputs (14 red on 550cad4; three honest layouts from its cases pass there and guard the fix). e2e 964/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1, 2 | Each line's test is the last test name matched at or above it over the whole text, keyed by name and how many tests of that name came before; a line in no test looks for its copy in its hunk. | the Rust, JUnit 5 and xUnit swaps, Java's `assertTrue`/`assertFalse` swap, a Java and a Rust value changed while a new test repeats the old line, and two same-named tests swapped in JS and Python: found |
| 3 | A removed line whose text is left nowhere in the file pairs across tests. | a case dropped from a parametrize or for-of list with a test added above, a helper flipped with a test added, a Go table's check flipped with a row added: found; Java reordered with a new test, Python wrapped with a new parametrized test, JS wrapped with a new for-of test: no finding |
| 7 | Each added line's list shape is read once. | a 4,000-line list rewrite in under 3 s |

The reviewer's 42 cases, run again on the fix: every case in findings 1 to 3 is found; the cases left quiet are findings 4 and 5, now named; finding 6's honest case is sent back as in every build. Its fuzz: 0 of 1,672 honest layouts sent back (fbd8b88: 74); 213 of 288 cheat layouts found, the same as its trial fix (550cad4: 208). The 7 layouts fbd8b88 found and the fix does not were all found by pairing with the new test's line ("1 → 7"), finding 5's form. Speed: the 4,000-line list rewrite takes 0.66 s (550cad4: 10.6 s); its 8,000-test file 37 ms and its worst long line 644 ms (550cad4: 41 ms and 694 ms).

Rounds 15 to 23's 498 cases, round 24's 36 cases and its 224 honest layouts: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
