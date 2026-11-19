# Cold review, round 6 (launch bar L13)

- Date: 19 Nov 2026
- Reviewer: the `cold-reviewer` agent (no session history, no CLAUDE.md) on `main...5efe2bc -- v2/src v2/bin`, starting from the fixes since 06ec0b8. Codex is out of usage until 18 Dec. This time the reviewer was allowed to run the CLI in throwaway repos, with HOME, XDG_CONFIG_HOME and TMPDIR inside its scratch folder, and the test command approved there.
- Our reproduction: `2026-11-19-round-6-repro.sh` (self-contained; the Blockers plus a control). Every case below marked "reproduced" gave the same result in it.

## Two kinds of finding

- **A: the agent reconfigures git itself** (index flags, replace objects, `core.bare`, ctime trust, fsmonitor, filters). Each knob makes git show a changed test as unchanged, so the scan sees nothing and an approved run can print ✓.
- **B: ordinary agent work** that the scan misses, or honest work it sends back.

## Findings

| # | Kind | Reviewer | Finding | Our check | Our rating |
|---|---|---|---|---|---|
| B1 | A | Blocker | `git update-index --assume-unchanged` or `--skip-worktree` on a gutted test, or `sparse-checkout` dropping a failing one: ✓ | assume-unchanged and skip-worktree reproduced (✓); sparse-checkout not rerun | Blocker |
| B2 | A | Blocker | `git config core.bare true` (or `core.worktree` elsewhere): the finish check prints nothing | reproduced (no output) | Blocker |
| B3 | A | Blocker | `git replace` of the session-start commit with one holding the gutted test: ✓ | reproduced (✓) | Blocker |
| B4 | B | Blocker | new files left unstaged are never scanned (`git diff <base> -- paths` leaves out untracked files); for example a new `pytest.ini` with `--deselect`, or a new test with `it.skip`. Same on main (2.0.3), per the reviewer | reproduced: unstaged `it.skip` file gets ✓, the same file staged is sent back | Blocker (pre-existing) |
| B5 | B | Blocker | `git mv test/cart.test.mjs test/cart.mjs` or `tests/test_cart.py tests/cart.py`: the test name is dropped inside a test folder, not reported; pytest, jest and vitest stop collecting it | reproduced (not reported; node's own runner still ran it, so the ✓ there was earned) | Major |
| M1 | A | Major | `core.trustctime false`, then a same-length edit with the old mtime put back: ✓ | not reproduced in one try (git rechecked the content); reviewer ran it | Major |
| M2 | A | Major | the agent's `core.fsmonitor` program runs inside the hook before the settings check: a `kill -9` of the hook gives no output; a sleeping one stretches the hook past its timeout | not rerun (kills processes) | Major |
| M3 | B | Major | two noskip name patterns still quadratic (Java name part, Rust `pub(...)`); a 200 KB Java test took 67 s in the stop hook | not rerun | Major |
| M4 | A | Major | a resumed session takes a new settings snapshot, so a filter that still hides a change gets ✓ after resume | not rerun | Major |
| m1 | B | Minor | audit: a lone `\r` (readline splits on it) or `diff.suppressBlankEmpty` puts the hunk reader out of step; the `++ n;` case is missed again in the audit | not rerun | Minor |
| m2 | B | Minor | honest: in a repo whose `.gitattributes` already has `filter=lfs`, any edit to that file sends the agent back (ours, 08d7070) | not rerun | Major (honest work sent back, ours) |
| m3 | A | Minor | an ignored `test/.gitattributes`, or a filter line past 1 MiB in `.git/info/attributes`: ✓ | not rerun | Minor |
| m4 | B | Minor | a regex literal after `return`, `typeof`, `void` or a `)`: `typeof /'/; it.skip(` hides the skip (round-5 F1 class) | not rerun | Minor |
| m5 | B | Minor | fix 5 narrowed the hardcoded-answer rule: `[15].includes(n)`, Python `in (250,)`, `Object.is(n, 15)`, `n === 15 /* edge */` reported at 06ec0b8, missed now | not rerun | Major (a regression, ours) |
| m6 | A | Minor | an empty untracked `test/zz.test.ts` makes a lone `.mjs` to `.ts` rename count as a migration | not rerun | Minor |

Blocker: 4 open (B1 to B4). Major: 8 open. Round 6 is not clean.

## What it means

Kind A keeps growing because git has many settings that change what it reports, and the threat model gives the agent the whole repo, `.git` included. Fixing each setting one at a time (rounds 5 and 6 so far: textconv, external diff, `-diff`, color, filters, fsmonitor, a linked attributes file, and now index flags, replace objects, `core.bare`, ctime) does not converge. One check that does not ask git would: Codehere's own record of the test files' bytes at session start, compared at stop; a test file whose bytes changed while git shows no change is itself the finding.

Kind B are ordinary gaps: B4 is the most likely to happen, as agents often leave new files unstaged.
