# codehere audit held-out repos (frozen 13 Nov 2026, 19:43 UTC)

Frozen before any audit change measured on them, and before running any audit on them. The launch bar's row L5 measures audit precision on these 12; the dev set is the 12 repos in `2026-11-13-audit-precision.md`. These files are not edited after this commit; labels go in a separate file.

How they were picked:
1. GitHub search, same queries as the dev set, other dates: `gh search commits` for "Co-Authored-By: Claude", "Generated with Claude Code", "Co-authored-by: Copilot", "Co-authored-by: Codex" with committer dates 1 to 24 Oct and after 25 Oct 2026; `gh search prs --author app/copilot-swe-agent --created ">2026-10-15"`.
2. Same filters as the dev set: JavaScript, TypeScript, Python, Go, Vue or Svelte; not a fork; not archived; under 150 MB; not in the dev set; not Codehere.
3. Rule fixed before cloning: in order of stars (ties by name), clone, keep the first 12 with at least 20 non-merge commits in the last 90 days. 66 passed the filters; the first 14 in that order were checked to reach 12 (skipped: rodekruis/helpful-information 0 commits, JRLZ7/Fleure 18).

| # | Repo | Language | Stars | Commit read | Non-merge commits, last 90 days |
|---|---|---|---|---|---|
| 1 | microsoft/go | Go | 434 | 304b30d85ff2 | 238 |
| 2 | bigcommerce/catalyst | TypeScript | 249 | 22de59ae265a | 112 |
| 3 | ponjo-app/ponjo | JavaScript | 3 | 69e09ad1cd17 | 337 |
| 4 | ehojune/bioinfo-team-3d | Python | 2 | 16bd14f0177d | 2241 |
| 5 | hugorodgerbrown/snowdesk-data-pipeline | Python | 2 | 49cdebab46db | 904 |
| 6 | JMO-Labs/styx-portal | Python | 2 | 8cd0bcaa6aa1 | 462 |
| 7 | containerbase/tool-versions | TypeScript | 1 | 5a2983f306b2 | 482 |
| 8 | Elessiah/AppBlueGenji | TypeScript | 1 | 780359b2db6c | 2064 |
| 9 | erricoluigi17/kidville-web | TypeScript | 1 | 068fe9ac61e6 | 272 |
| 10 | kalebteccom/browxai | TypeScript | 1 | 5aa0a44992fd | 132 |
| 11 | Lisa-Gorewit-Decker/Angular2025-to-1-2-Quarter-2026 | TypeScript | 1 | ec9ff4028692 | 346 |
| 12 | lisagorewitdecker/FlowMatrix-MEAN-Enterprise-Resource-Hub | TypeScript | 1 | 8118145be9ee | 76 |

Measure with `codehere audit` and `noskip audit --last 2000 --since '90 days ago'` at these commits. The window is the 90 days before the run date, so write the run date with the results.
