# S11 report: how often do AI-agent PRs carry a failing claim, and do two labelers agree?

Date: 2026-10-16. Pre-registration used: `PREREG.md` at commit `a6b736cc` (original `57614440`, Amendments 1 to 5: `f2e2c98c`, `c1f24b0d`, `162db010`, `d7393845`, `a6b736cc`). Commands to reproduce every number are in the last section.

## Registered result

- D1 (frequency): **inconclusive**, because D2 is not met.
- D2 (reliability): the pre-registration says that if kappa between the two models is below 0.6, D1 is inconclusive whatever the count. Cohen's kappa between Claude and `qwen3-coder:30b` on the 299 PRs is **0.092** (agreement 66.6%; the agreement expected by chance at these flag rates is 63.2%).
- D3 (head to head with groundtruth and cngx): not run. Both repos are cloned and pinned (groundtruth `c3aa4a72`, cngx `d36d8a19`); no case has been run.
- D4 (CodeRabbit seeded PR): open. It needs a free-trial sign-in.
- D5 (a payment, a written yes, a backtest on a stranger's repo): open. This study cannot mark it passed.
- Human anchor: postponed, not dropped (Amendment 5). The sheet, labeling page and scorer are in place.
- Exploratory population estimate (Amendment 2): not produced; it needs the human anchor.

## Main finding: the two labelers disagree about almost everything that matters

Both labelers read the same 299 packets (title, body, check runs, file list, diffs) with the same rubric text. Claude labeled in 10 fresh contexts with no codehere knowledge. qwen ran locally at temperature 0, seed 7, 16,384 context (largest prompt 12,442 tokens, so nothing was cut).

| | PRs |
|---|---|
| both flag a failing claim | 9 |
| only Claude flags | 2 |
| only qwen flags | 98 |
| neither flags | 190 |

- Claude flags 11 of 299 (3.68%, Wilson 95% 2.07% to 6.47%). qwen flags 107 of 299 (35.79%, 30.56% to 41.37%). The two intervals do not touch.
- The same pattern holds in each agent group. Copilot (n=100): Claude 2, qwen 20. Codex (n=100): Claude 6, qwen 48. Claude-authored (n=99): Claude 3, qwen 39.
- The break-even rate depends on the cost of a miss: f* is 7.90%, 3.95% and 1.98% at £50, £100 and £200 per miss (P = £79 per repo-month, V = 20 agent PRs per repo-month, both assumptions). Applying the count rule to Claude's labels gives NO-GO, inconclusive and GO. Applying it to qwen's labels gives GO at all three, since the lower bound is 30.56%. The verdict flips with the choice of labeler. D2 was registered for this situation.

### What the disagreement looks like when checked against the packets

This section compares each model's stated label with what the rubric's own conditions need, using code on the packet text. It labels no PR.

- L1 needs a check run on the PR head that ended in failure, timed_out or cancelled, and the rubric says a deploy-preview job does not count. All 8 of Claude's L1 labels sit on PRs with a failing check run. For qwen, 23 of its 61 L1 labels do. The other 38 are on PRs where check data exists and no run failed. Of the 23, 3 have only deploy-preview-like failures (Cloudflare Pages and similar).
- Of the 98 qwen-only flags, 64 are on PRs where every check run succeeded, 16 have no check data, and 18 have a failing check run.
- qwen's L4 label (zero tests ran) accounts for 35 of the 98. Ten of those PRs have no check data and 20 have only successful or skipped runs. The rubric says what to do with no check data for L1 (rule 3) but is silent for L4. qwen read the absence of check data as evidence for L4. Claude read it as no label. This is a gap in the rubric as written, not only a difference between the models.
- Putting the two together (`node disagreement.mjs`): 67 of the 98 qwen-only PRs carry only labels that the check data does not support. 38 of them are L1 with no failing run, which contradicts the L1 definition. 10 are L4 on a PR with no check data, which is the rubric gap. 19 are L4 where every check run succeeded or was skipped. A further 1 PR has a mix. The other 30 of the 98 rest on diff reading or on a failing run, and only a human can settle them. So most of the gap is a labeler not following the rubric's L1 definition plus L4 read from check names; the rubric gap proper accounts for 10 PRs, or about 29 with the all-success L4 cases. The test covers check data only; an L4 label that rests on the diff alone cannot be tested by code.
- These checks show where qwen's labels conflict with the L1 definition. They do not show that Claude's low count is right. L3 and L5 labels depend on reading diffs, and neither model has been checked against a human.

### The eight PRs qwen flagged and Claude did not

These are the first eight qwen-only flags in file-name order among the first 177 labeled (an alphabetical slice, not a random draw), read on 2026-10-15 before the other 122 qwen labels existed. All eight are still qwen-only in the final labels. Nothing here says whether any of them has a failing claim.

| PR | qwen label and stated reason | What the packet shows | Claude's recorded reason |
|---|---|---|---|
| [PR 1](https://github.com/Bittrees-Technology/ai/pull/202) | L4: the diff shows no test files that indicate tests ran; the successful checks are not test jobs | 10 check runs, all success | all listed checks succeeded; the spec edit adds assertions |
| [PR 2](https://github.com/Brian910cpr/910cpr-class-landers/pull/137) | L1: the Cloudflare Pages check failed, contradicting "8 tests pass" | 1 check run, Cloudflare Pages, failure | that job is a deploy preview, which the rubric excludes; the test file is new |
| [PR 3](https://github.com/ClubAmigosTT/marcelito-finanzas/pull/78) | L4: neither check run looks like a test job for the claimed test files | 2 check runs, both success | both succeed; test edits add assertions |
| [PR 4](https://github.com/DSTech-876/PRMSv3/pull/212) | L4: no check runs to show tests ran ("Focused unit coverage") | 0 check runs | the body lists added assertions and does not say tests pass; two new tests, none removed |
| [PR 5](https://github.com/DennisHengShuYi/Codenection/pull/28) | L1: says tests fail on main and pass here, but the checks passed | 3 check runs, all success | checks succeed; patch cut at 3,500 of 10,556 characters, so a hidden weakening cannot be ruled out; labeled none under rule 5 |
| [PR 6](https://github.com/Donovoi/triage-with-rclone/pull/21) | L1: the two Test jobs succeeded but do not validate the specific claim | 4 check runs, success and skipped | both Test jobs succeed; the test added in main.rs is new |
| [PR 7](https://github.com/DwennK/Plezy-SubtitleFix/pull/20) | L4: no check runs, and the diff does not show the 373 claimed tests | 0 check runs | no check runs so L1 cannot apply; the diff adds a string to a list and a new test |
| [PR 8](https://github.com/JRDN-R/vision/pull/39) | L1: no test-related job among the checks | 7 check runs, all success | all succeed; the test files are new |

In 7 of the 8 packets no check run failed. In the eighth the only check run is a deploy job. In 4 of the 8, qwen's reason is that the check names do not show the claimed tests ran. The rubric's L4 asks for a job that ran 0 tests or a test file the runner does not pick up, which is a different condition. PR 5 is the closest case: the patch is cut, and Claude's labeling note says it cannot rule out a hidden weakening.

## What this result does not say

- It does not give a rate of failing claims. Claude's 3.68% and qwen's 35.79% cannot both be right, and without the human anchor this study cannot say which is closer. The registered result is that the count does not decide D1.
- It is not evidence about demand. Nobody has paid, signed or run a backtest.
- It does not show that the rubric works. A rubric read two ways by two labelers is a rubric that needs to be tightened or checked against a human, and the registered rule is not to rewrite it after seeing these results (Amendment 2).

## Limits

- Public repos, not buyers' repos. A buyer's own last 20 agent PRs stays the measure that matters.
- Labels come from the patch and the check runs as recorded on 2026-10-15; nothing was re-executed. A run fixed after the PR was opened shows as fixed (rubric rule 6).
- Per PR, not per claim. 224 of 299 packets have check data; only 22 name a test file.
- Agent authorship was identified by the Copilot coding agent's author account, the `codex/` branch prefix, and the "Generated with Claude Code" text in the body, so the three groups are not the same kind of selection.
- Sample: 300 drawn, 299 usable (one PR now returns 404). No overlap with the AIDev dataset by repository and number (Amendment 3).
- Process incident: 122 of qwen's first-pass outputs were empty after a GPU out-of-memory error in the local runner. They were deleted and rerun after restarting the model; no other output was edited (Amendment 2).
- One model pair, one rubric, one prompt, one run each. The 0-of-302 result from the earlier AIDev check is not reproducible and is not used here.

## Pre-registration provenance

The commit hashes cited in this report (and in the amendments inside `PREREG.md`) are from the repository's original history. This repository starts from a fresh history, so those commits are not in it. What a reader can check here instead is the content: `PREREG.md`, `RUBRIC.md` and `sample-ids.json` in this repository are byte-identical to the versions below, and the original commit dates are the order in which they were written. Verifying the dates themselves needs the original history, which the author keeps as a private archive; the hashes below let anyone confirm that the files were not changed afterwards.

| original commit | commit date | file | sha256 |
|---|---|---|---|
| `57614440` | 2026-10-14 15:59 +0100 | PREREG.md (original) | `05e1abf7b515b9dafe4355c8d0a3e85f250c5d89c7c4d7494ebe6c631474991d` |
| `f2e2c98c` | 2026-10-14 16:06 +0100 | PREREG.md after Amendment 1 | `d13daf5a62bbbabccec504a9754e23410d7efb3ec744e58b1b02521805515460` |
| `c1f24b0d` | 2026-10-16 00:18 +0100 | PREREG.md after Amendment 2 | `adbaf3813abe07710692efe3975203de8adb81726aaea9af14fcf0eab7b15694` |
| `162db010` | 2026-10-16 19:33 +0100 | PREREG.md after Amendment 3 | `83919a19ed14ba352ae5d6c2c062e61ad0b4b264541d02a976942306b4cec6ec` |
| `d7393845` | 2026-10-16 19:51 +0100 | PREREG.md after Amendment 4 | `c6127187573bd5bc872a1393e38f2dc81460c2e78e4af0eaaee4309adc22b34d` |
| `a6b736cc` | 2026-10-16 20:06 +0100 | PREREG.md after Amendment 5 | `a9ade067bfe5b0252232c27167daf9de2dbd95a027ed042be5a7e783dfa5b17b` |
| `8939aab9` | 2026-10-15 21:28 +0100 | sample-ids.json (the 300 sampled PRs, before any PR was read) | `63f0d0b037b9e1f321c13bf53102a5dfafd954bc1539a90d2d763e6b4e7011f7` |
| `78f4b5bf` | 2026-10-15 21:37 +0100 | RUBRIC.md (before any PR was labeled) | `81b46238c01825726d92558b4612f86776e906c3bdd5f4c67e9f1713cfeb1ca0` |

The current `PREREG.md`, `RUBRIC.md` and `sample-ids.json` hash to the Amendment 5, `RUBRIC.md` and `sample-ids.json` rows respectively (`shasum -a 256 <file>`). The amendments that follow the original text are dated in the file itself.

## Reproduce

From `agent/eval/promise-verification/studies/S11-demand/`:

- `node agree.mjs report` for the agreement table and label counts.
- `node disagreement.mjs --prs` for the by-agent counts, the L1 and L4 checks, and the facts on the eight PRs.
- The Wilson intervals and f* values come from the formula in `agree.mjs score` (`wilson`, f* = (79 / C) / 20).
- Raw PRs, packets and both labelers' outputs are in `agent/eval/promise-verification/evidence/S11/` (gitignored; third-party text).
