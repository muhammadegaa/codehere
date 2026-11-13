# codehere audit on the held-out repos (13 Nov 2026, 23:03 UTC) — launch bar L5

Repos and commits: `2026-11-13-audit-heldout.md` (frozen at 19:43 UTC, before any audit ran on them). Code: `fix/2.1.0-rc.3` at 5137a10 (audit headline as in rc.3; the L4 wording draft is not merged). Window: the 90 days before 13 Nov 2026, 23:03 UTC.

Labels: each listed commit read by one reader (Claude), by its subject, message, files deleted and assertion counts, with the diff where those were not enough. Real: the tests check less while the code they tested stays, including on purpose. False: the tests went with code that was removed or replaced, were moved, rewritten for a changed feature or migrated, or the skip is conditional or in a comment. Unclear: could not be settled without a deeper read. One reader, so an estimate.

| Repo | Commits read | Listed | Real | Unclear | False |
|---|---|---|---|---|---|
| Elessiah/AppBlueGenji | 2064 | 25 | 0 | 1 | 24 |
| JMO-Labs/styx-portal | 462 | 12 | 0 | 0 | 12 |
| Lisa-Gorewit-Decker/Angular2025-to-1-2-Quarter-2026 | 346 | 1 | 0 | 0 | 1 |
| bigcommerce/catalyst | 112 | 4 | 0 | 2 | 2 |
| containerbase/tool-versions | 482 | 4 | 0 | 0 | 4 |
| ehojune/bioinfo-team-3d | 2241 | 5 | 0 | 1 | 4 |
| erricoluigi17/kidville-web | 272 | 16 | 0 | 0 | 16 |
| hugorodgerbrown/snowdesk-data-pipeline | 904 | 60 | 0 | 1 | 59 |
| kalebteccom/browxai | 132 | 4 | 3 | 1 | 0 |
| lisagorewitdecker/FlowMatrix-MEAN-Enterprise-Resource-Hub | 76 | 0 | 0 | 0 | 0 |
| microsoft/go | 238 | 3 | 2 | 1 | 0 |
| ponjo-app/ponjo | 337 | 14 | 1 | 0 | 13 |
| **12 repos** | | **148** | **6** | **7** | **135** |

Precision: 6 of 148 (about 4%), at most 13 of 148 if every unclear one is real. The launch bar's target was at least 1 in 2; L5 fails. On the dev repos it was 8 of 35.

## Real
- 3d71e959: microsoft/go "Remove fragile pipeline yml parse tests": a test file removed, the code kept
- beae3725: microsoft/go "crypto: remove backend-local KDF tests": two test files removed, the code kept
- 9ac1f88b: kalebteccom/browxai "test: second test-diet round, 3422 to 2959 executed tests"
- 91d23141: kalebteccom/browxai "... pruning, test diet": 1,098 assertions removed
- ac8b8c85: kalebteccom/browxai "... dead tests out": 4 test files and 37 assertions removed
- 569372ab: ponjo-app/ponjo "Delete the design-system and no-server tests": tests removed, the code kept

## Unclear
- ab046562: microsoft/go (Copilot) "Adjust stage-0 retry review feedback": a test file deleted, no code file deleted
- 3b367564: kalebteccom/browxai "split browser CI ... release 0.14.0": a test file and 260 assertions removed in a release commit
- 292e079d: snowdesk "Speed up the test suite: 84s to 31s": 4 assertions removed, says coverage is unchanged
- 9f2e2574: Elessiah/AppBlueGenji "address review findings": 3 assertions removed
- f5991b7b: bigcommerce/catalyst "Give each E2E run its own customer": 7 assertions down to 1 in one spec
- 75aa7099: bigcommerce/catalyst "Refresh the cart shipping form": 17 assertions down to 8
- 7e50df4d: ehojune/bioinfo-team-3d "Windows CI flaky tests": time checks replaced by condition waits

## Why so many false ones

- Most listed commits are squash-merged feature pull requests in repos where an agent writes most of the code (snowdesk-data-pipeline 60, AppBlueGenji 25, kidville-web 16, ponjo 14, styx-portal 12): a test file or a few assertions go away while the feature they covered is rewritten, often with hundreds of assertions added elsewhere in the same commit. The audit counts the removal per commit and cannot see that the feature changed.
- Playwright's conditional skip, `test.skip(page.viewportSize().width >= 1024, '...')` or `test.skip(!process.env.E2E_AUTH_USER, ...)`, is listed as a skip; it is the JS form of `skipUnless`.
- `test.skip()` named inside a code comment is listed (kidville-web, two commits).
- A move of all Angular workspaces to Vitest counts the old assertions as removed.

## noskip's audit on the same repos

`noskip audit --last 3000 --since '90 days ago' --json`, 5 minutes per repo (earlier runs did not finish in 7 hours):

- It finished 9 of the 12. bioinfo-team-3d (2,241 commits), snowdesk-data-pipeline (904) and styx-portal (462) did not finish in 5 minutes; `codehere audit` reads each in under 2 seconds.
- On those 9 it lists 938 commits (high or medium), 201 of them high; `codehere audit` lists 148 on all 12.
- All 6 commits labelled real above are among noskip's high findings. Its other high findings are not labelled; at most 8 of its 201 are real or unclear by the labels above.
- It recognised 2,948 agent commits on the 9 (AppBlueGenji: 1,815 of 2,064), from trailers, footers and bot accounts. `codehere audit` prints a marker only for listed commits, so the two are not compared here (launch bar L6).

## Speed (launch bar L7), 13 Nov 23:36 UTC, load average about 10

`codehere audit` at 7911898, wall time per held-out repo: microsoft/go 238 commits 0.5 s · catalyst 112, 0.3 s · ponjo 337, 0.5 s · bioinfo-team-3d 2,241, 5.3 s · snowdesk-data-pipeline 904, 3.6 s · styx-portal 462, 0.6 s · tool-versions 482, 0.3 s · AppBlueGenji 2,064, 3.6 s · kidville-web 272, 6.0 s · browxai 132, 0.7 s · Angular2025 346, 1.5 s · FlowMatrix 76, 0.1 s. All under the bar's 10 s; noskip did not finish three of these in 5 minutes.
