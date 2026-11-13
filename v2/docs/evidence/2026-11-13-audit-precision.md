# codehere audit on 12 public repos, before and after the rc.3 fixes (13 Nov 2026)

Question: when `codehere audit` lists a commit as one that weakened tests, how often is that true?

Method:
- Repos: found by GitHub search for agent markers in commits since September 2026 (`gh search commits` for "Co-Authored-By: Claude", "Generated with Claude Code", "Claude-Session", "Co-authored-by: Copilot"; `gh search prs --author app/copilot-swe-agent`). Kept: JavaScript, TypeScript, Python or Go, not a fork, under 150 MB. Full clones, read on 13 Nov.
- Builds: npm `codehere@2.1.0-rc.2`, and branch `fix/2.1.0-rc.3` (working tree, based on aa365d7). Both run with `codehere audit` from inside each clone, so both read the same 90 days.
- Labels: each commit the rc.3 build lists was read (the lines that matched, the files deleted, the commit message) and marked real, unclear or false. Real means the commit left the tests checking less while the code they tested stayed. One reader (Claude), not checked by a second person, so the counts are an estimate.

## Results

| Repo | Commits read | rc.2 listed | rc.3 listed | Real | Unclear | False |
|---|---|---|---|---|---|---|
| antvis/AVA | 105 | 7 | 6 | 0 | 1 | 5 |
| centrifuge/protocol-registry | 37 | 0 | 0 | 0 | 0 | 0 |
| future-architect/vuls | 28 | 0 | 0 | 0 | 0 | 0 |
| Hugo-Grellier/ballast | 168 | 14 | 1 | 0 | 0 | 1 |
| Hugo-Grellier/SecondChair | 175 | 4 | 1 | 0 | 0 | 1 |
| locustio/aiolocust | 219 | 11 | 8 | 6 | 1 | 1 |
| MaineK00n/vuls2 | 17 | 0 | 0 | 0 | 0 | 0 |
| microsoft/rnx-kit | 139 | 7 | 4 | 0 | 0 | 4 |
| rknall/steward | 79 | 1 | 1 | 0 | 0 | 1 |
| sirosfoundation/wallet-frontend | 491 | 14 | 14 | 2 | 1 | 11 |
| tojemoc/foodie | 18 | 0 | 0 | 0 | 0 | 0 |
| xadupre/arranged-agents | 64 | 0 | 0 | 0 | 0 | 0 |
| **12 repos** | **1,540** | **58** | **35** | **8** | **3** | **24** |
| Codehere's own repo, at 273b728 | 68 | 15 | 0 | 0 | 0 | 0 |

- rc.3 listed 35 commits; 8 are real, so about 1 in 4 (8 of 35; 11 of 35 if every unclear one is real).
- The planted-commit repo from the 13 Nov test run still gives 4 of 4.
- 3 of the 35 carry an agent marker, and all 3 are false. None of the 8 real ones carries a marker.

## What rc.3 removed (23 of the 58 rc.2 listed in these repos)

- 20: a Python test that skips itself where it cannot run (`skipUnless(shutil.which("uv"))`, `skipIf(os.name == "nt")`, `skipif(not shutil.which("pdftotext"))`). Now only `skip`, and `skipif`/`skipIf`/`skipUnless` with a literal condition, count, as `{ skip: process.platform === 'win32' }` already did not in JavaScript.
- 2: deleted fixtures under `test/__fixtures__/`. Files under fixtures, snapshots, mocks and testdata folders are not tests.
- 1: a skip written inside a string. On Codehere's own repo this was all 15.

## The 8 real ones

| Repo | Commit | What it did |
|---|---|---|
| aiolocust | 298a6f12 "remove flaky test" | 3 assertions removed |
| aiolocust | b78c77cb "simplify test_desired_user_count…" | 37 assertions down to 2 |
| aiolocust | 21f557d2 "…remove a few ai-generated tests that were unnecessary" | 11 assertions removed |
| aiolocust | 0848a21c | an assertion commented out |
| aiolocust | 67e0eec2 "remove unnecessary test" | 2 assertions removed |
| aiolocust | b1d647f8 "fix circular dependency" | an assertion commented out |
| wallet-frontend | 9c850d87 "feat: issue, verify and present W3C VCDM 2.0 credentials" | 3 tests added as `it.skip` |
| wallet-frontend | 4093e941 "fix: stray fixes" | a test file and 18 assertions removed, the code kept |

Most say so in the subject: a person chose to remove the test.

Unclear: AVA 8d57aa27 (a test rewrite, 3 assertions fewer), aiolocust c4429514 ("fix wrongly staged lines", 2 assertions removed), wallet-frontend 40e8020b (a client change, 5 assertions fewer).

## The 24 false ones that remain

- 18: the test went with the code it tested (a feature removed, replaced or reverted).
- 3: the test moved into another file (SecondChair b54b1642, wallet-frontend 40f00294 and 57642f15).
- 2: tests moved from jest's `expect` to `node:assert` functions imported by name (rnx-kit b58118c6, b3ec6d41), so the old assertions count as removed and the new ones are not seen.
- 1: a temporary file named `test_temp.py` that an agent added and removed (aiolocust b9f8915d).

## Agent markers

Squash merges drop `Co-Authored-By`, so rc.2 read 0 markers in ballast (168 commits) and SecondChair (175), though 142 and 172 of their commits carry Claude Code's "Generated with Claude Code" footer. rc.3 reads that footer as a marker.

## Not checked

Repos in other languages; private repos; whether the 8 real ones were made with an agent (none is marked); a second reader for the labels.
