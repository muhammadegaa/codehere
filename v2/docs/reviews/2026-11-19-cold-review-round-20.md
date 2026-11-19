# Cold review, round 20 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent on fe07eb4, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every scan case ran on fe07eb4, 6af1a11 and d5dc9e7 with real `git diff -U0` output; the key cases through the real hooks in throwaway repos with `node --test` approved. It marked each finding as a regression or not.
- Our reproduction: each finding we changed code for is a check in the `R20` block of `test/e2e.mjs`, run on fe07eb4 first.

## Findings

No Blocker: the record and reading code is unchanged since 6af1a11.

| # | Axis | Reviewer | Finding | Regression? | Done |
|---|---|---|---|---|---|
| 1 | Spec (honest) | Major | tests wrapped in a `describe` re-indent their assertions; two same-shape assertions then read as "an expected value was changed" (2 → 1), and the ✓ is withheld | no, in every build | fixed |
| 2 | Spec | Minor | a list declared after another statement on its line (`const { defaults } = require(...); const ignored = [`) was not read | yes, from 6af1a11 | fixed |
| 3 | Spec (honest) | Minor | a conftest hook that adds a skip marker unless an option is given (pytest's opt-in pattern) was sent back, while the documented form `item.add_marker(skip_slow)` was missed | yes, from 6af1a11 | the `add_marker` rule removed; named in the promise |
| 4 | Spec | Minor | skip and only forms still missed: `test.skip.concurrent`, `.only.concurrent`, `it.skip.each<Case>`, `fit.each`, `fdescribe.each`, `.skip.for`, `.only.for`, `test.skip.failing`, `specify.only` | no | fixed |
| 5 | Spec | Minor | node:test's `it.todo(name, fn)` runs the test and does not fail on it | no | fixed |
| 6 | Spec (honest) | Minor | an existing skip on a line the agent edits or re-indents counts as a new skip | no for old forms | a re-indented line fixed with finding 1; an edited one named |
| 7 | Spec (honest) | Minor | any narrowed filter is sent back, not only a narrowed `-k` | no | the promise names them |
| 8 | Standards | Nit | the `pytestmark` pattern ran `.*` to the line's end and into a trailing comment | yes, speed | fixed |
| 9 | Standards | Nit | a `[` inside a quoted string counted as a list opening | no | fixed |
| 10 | Standards | Nit | the `-k` term sorting applied only to the whole-file reading | no | fixed |

On the definitions, said once: Cypress specs (`*.cy.js`, `*.cy.ts`) are not test files. The promise now says so.

Blocker: 0. Major: 1, on the Spec axis (honest work sent back), not a regression: every build since d5dc9e7 had it. Round 20 is not clean under finish line B.

How we triaged: finding 1 is common honest work, so it is fixed, by a rule that is exact rather than lenient: a line whose exact text is both removed and added in a file only moved, and neither side is judged. A Python decorator does not name its test, so a moved decorator is still judged (and its re-indent is a named false send-back), and a line with no word in it (a closing brace) still takes part in the patterns that span lines, such as an assertion wrapped in a `try` that swallows it. Finding 3 is a rule added in round 19 that sent back an honest pattern and missed the documented one, so it is removed and named. The skip and only forms in finding 4 are the modifiers the README already claims.

## Fixes

Each change started as a failing check in the `R20` block (18 red on fe07eb4; three more checks guard the behaviour and pass there: an expected value changed in place, a skip decorator moved to another test, and jest's `test.todo` placeholder). Round 19's `add_marker` check was taken out, since that form is now a named gap. e2e 908/0 and all 8 CI steps on a clean clone after.

| # | Fix | Check |
|---|---|---|
| 1 | A line whose exact trimmed text is removed and added in the same file is not judged on either side, except a decorator or a line with no word. | the describe wrap and a re-indented `it.skip`: no finding; an expected value changed in place and a moved decorator: found |
| 2 | A declaration may follow `;`, `{` or `}` on its line; the type before `=` stops at a `;`, so the search stays linear. | found |
| 3, 8 | The `add_marker` alternative is gone; `pytestmark` reads up to 500 characters and stops at `#`. | both honest cases quiet |
| 4 | `.skip` and `.only` take `concurrent`, `sequential`, `shuffle`, `fails`, `failing`, `each` and `for` after them, and a TypeScript generic before the call; `specify.only`, `fit.each` and `fdescribe.each`. | eleven forms found |
| 5 | `it.todo` (and `test`, `describe`, `suite`) with a quoted name followed by a comma is a skip, in test files. | found; jest's `test.todo('name')` quiet |
| 9 | Brackets are counted outside quoted strings, in one pass; a quote with no closing quote on the line is a plain character. | no finding |
| 10 | The `-k` term sorting is in the argument reader, so every reading uses it. | the audit's reading: no finding |

The reviewer's 82 scan cases, run again on the fix: 27 differ from fe07eb4, all gains or the removed `add_marker` rule; 6 give a result the reviewer did not expect, each the same on fe07eb4 and each a named false send-back (a filter narrowed or reordered inside brackets) or a new filter key the case also adds. Rounds 15 to 18's cases: unchanged; round 19's: one changed, `add_marker`, now a named gap. Round 14's cases: unchanged.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
