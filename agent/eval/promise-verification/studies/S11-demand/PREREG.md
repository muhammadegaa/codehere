# S11: will a team merging AI-agent PRs pay for the PR receipt? Pre-registration

Written 2026-10-14, before any sample data was read. The git commit that adds this file is the timestamp.
Any later change to this file is a new commit with the reason, made before the sample is read, and the final report cites the commit hash it used.
The hold stays: no push, no publish, no deploy, no spend beyond free trials.

## What is already known (not new data)

- 0 real test weakenings in 302 held-out agent PRs (AIDev check, 2026-10-06, patch level). Those 302 PRs are excluded from the new sample. Wilson 95% upper bound for 0 of 302: 1.26%.
- The 22-task eval set (`agent/eval/false-done-corpus.mjs`) was built to fit codehere's detectors. It measures difference between tools, not how often the problem happens.
- groundtruth (MIT, 0 stars, last commit 2026-08-18) and cngx 0.2.0 (MIT, 4 stars, last commit 2026-08-15) were fetched on 2026-10-14. Neither has been run by us.
- CodeRabbit lists Essentials at $24/user/mo and reports 17,000+ customers (pages fetched 2026-10-14). Its docs mention Pre-Merge Checks and Custom Pre-Merge Checks, not yet read.

## Inputs (assumptions, to be replaced by measured values where noted)

- P = price per repo-month. £79 if the price recurs monthly. If it is one-off, P = £79 / 12 (assumption: a 12-month value window). Ega confirms which applies.
- C = cost of one missed false green = £100 (assumption: 2 hours of engineer time at £50/hour). Replaced by the median answer from buyer interviews once there are 5.
- V = agent PRs per active repo-month = the median over repos in the sample that have at least one agent PR in the window. No outside number.
- f* = (P / C) / V. With P = £79, C = £100, V = 20: f* = 3.95%. The formula is fixed; the numbers are recomputed when P, C or V change, and the report states the values used.

## Sample

- Public GitHub PRs opened 2026-09-01 to 2026-10-13 by an identifiable AI coding agent. The frame and how agent authorship was identified are written in the report before labeling starts.
- Exclude the 302 PRs from the 2026-10-06 check.
- n = 300, drawn with a fixed random seed recorded in the report. PRs from repos with no CI are kept and marked `no-ci`.
- A PR whose label cannot be decided from its patch, body and check results is marked `undecidable`, kept in the denominator, and counted as not failing.

## Labels (a PR is a failing claim if any of L1 to L5 holds)

- L1: the PR body, commit message or agent summary claims tests pass, and the test check-runs on the PR head ended in failure or were cancelled.
- L2: the summary names a test file that is not in the PR's final tree.
- L3: the diff removes, skips or neutralizes an assertion in an existing test, per the written rubric (assert-true, skip marker, commented assertion, early return above it).
- L4: CI logs show zero tests collected or run for a PR that claims tests pass.
- L5: a weakening of a test that does not match the L3 patterns. Counted separately to measure what the detector cannot see.

Labels come from the patch and the recorded CI results. Nothing is re-executed in this study.

## Labelers

- Labeler 1: Claude, using the rubric.
- Labeler 2: `qwen3-coder:30b` through ollama on this machine (a different model family), using the same rubric verbatim.
- Human anchor: 30 PRs labeled blind by Ega or a person he names. If no human anchor exists, D1 cannot reach GO.
- Report Cohen's kappa between the two models and between each model and the human.

## Decision rules

- D1 frequency. Pooled failing-claim rate with a Wilson 95% interval. GO if the lower bound is at least f*. NO-GO if the upper bound is below f*. Otherwise inconclusive. With n = 300 and f* = 3.95%: GO needs 19 or more failing PRs, NO-GO needs 5 or fewer, 6 to 18 is inconclusive.
- D2 reliability. If kappa is below 0.6 between the models, or below 0.6 against the human anchor, D1 is inconclusive whatever the count.
- D3 head to head. Tools: codehere built from commit f909289e, groundtruth and cngx at pinned versions. Tasks: the 22 eval tasks plus every runnable demo case in groundtruth's and cngx's own repos, listed before the first run. 3 runs per cell, code graders. Differentiation holds only if codehere catches at least 2 more false claims than the best competitor on the combined set with 0 false alarms on the honest controls. Otherwise the report says "no measurable difference". Every task where a competitor wins or ties is listed.
- D4 incumbent. Seed 3 cases in a PR on a CodeRabbit free trial with default settings: a weakened assertion, a named test file that is missing, and a body that claims pass while a test fails. The incumbent covers the job if it flags at least 2 of 3 without custom configuration. Open until Ega signs in.
- D5 open until a stranger confirms: a payment, a written yes for the same offer (the sprint rule is 3), and a backtest verdict on a prospect's repo. This study never marks these passed.

## Verdict mapping

- Evidence supports continuing offer A: D1 GO, D2 met, D3 differentiation holds, D4 does not cover it.
- Evidence against offer A: D1 NO-GO, or D4 covers it and D3 shows no measurable difference.
- Anything else: not decided by this study.
- The one number that flips the decision: the lower bound of the pooled failing-claim rate compared with f*.

## Known limits

- Public repos are not the buyers' repos. A buyer's own last 20 PRs (the backtest) is the measure that matters and stays open.
- Per-PR rate, not per-claim.
- L3 patterns are the ones the detector already knows; L5 is the only measure of its blind spot.
- Patch-level labels can miss failures that only show on execution.
- The 22 tasks fit the detectors, which is why D3 uses competitors' own demo cases as well.
- Choosing C and V changes f*. The report shows the verdict at C = £50 and C = £200 as well.

## Amendment 1 (2026-10-14, made before any sample PR was read)

- Price model: Ega was unsure whether £79 and £249 recur and asked which model works better. Working assumption for this study: monthly and recurring, P = £79 per repo-month. Reasons: the harm it prevents comes back with every PR; the Studio OS durability gate counts only recurring prices of £20 a month or more; the nearest paid product bills per user per month. This is an assumption, not a finding. Pricing stays Ega's call, and if it is one-off the report recomputes f* with P = £79 / 12.
- Human anchor: Ega labels the 30 PRs, blind to the model labels.
- Segment: Ega named the target user as the "product builder", one person who decides what to build and merges AI-agent code (a role that merges product and engineering, as the "builder" titles reported in the press and at some companies). That role cannot be read from public PR data. So D1 measures the general rate across agent PRs, and nothing in this study says anything about builders as a group. The builder segment stays open until three builder-run repos have been backtested on their own last 20 agent PRs, and any outreach or copy about builders says "open" until then.
- Buyer: the user and the buyer may be different people (the builder on a card, a head of product or engineering approving spend). The study does not decide who the buyer is; the interview question "who approved the spend" is how it gets answered.

## Amendment 2 (2026-10-16, made before the human anchor was labeled and before any human label was seen)

What I had seen when I wrote this: Claude's labels and counts on all 299 PRs, qwen's labels and counts on all 299, the agreement between them, and the text of 8 PRs that qwen flagged and Claude did not. I had seen no human label.

- Sample: n = 299, not 300. `cantierihub/cantierihub-com#53` returns 404 now. Thresholds at n = 299 do not change: at C = £100 GO needs 19 or more failing PRs, NO-GO needs 5 or fewer, 6 to 18 is inconclusive.
- Process incident: the first qwen pass returned empty output for 122 PRs. The Ollama server log shows a Metal GPU out-of-memory error, after which the runner kept failing until it was restarted. I deleted those 122 empty outputs (every one had an empty response, none was a judgment) and reran only those PRs after restarting the model. No other qwen output was edited or removed. Settings stayed temperature 0, seed 7, num_ctx 16384.
- Model agreement on all 299: both flag 9, only Claude flags 2, only qwen flags 98, neither 190; agreement 66.6%, kappa 0.092. Claude flags 11, qwen flags 107. Under D2 as registered (kappa below 0.6 between the models), D1 is inconclusive whatever the count. That stays the registered result of the study.
- Rubric: not rewritten. A rewrite after seeing these results would be tuned on the same PRs.
- Human anchor design, replacing the single mixed list: 30 PRs in three groups of 10, drawn with seed 20261015 by `agree.mjs anchor`: flagged by Claude, flagged by qwen only, flagged by neither. Short groups are topped up from "neither". Ega sees the rubric and the packets, no model labels, and answers in `answers.json`. Report per group: how many of the 10 the human labels as failing. Kappa against the human on this stratified 30 is reported too, but it is not a population kappa, so D2 against the human is judged on the per-group counts and the kappa together, and the report says which.
- Secondary estimate, exploratory and not a verdict: after the anchor, estimate the population rate as (Claude-flagged count × share confirmed in group 1 + qwen-only count × share confirmed in group 2 + unflagged count × share found in group 3) / 299, with a range from the Wilson interval of each group's share. It is shown beside the registered D1 result and does not replace it.
- Sensitivity: report the D1 verdict at C = £50, £100 and £200 (f* 7.9%, 3.95%, 1.98%). With Claude's 11 of 299 (3.68%, Wilson 2.07% to 6.47%) the verdicts are NO-GO, inconclusive and GO at the minimum count.
- Cloud-hosted models through Ollama (`glm-5.2:cloud`, `kimi-k2.7-code:cloud`) returned empty in 0.3 s and were dropped. Codex is not usable on this machine. The second labeler stays qwen, one model family.

## Amendment 3 (2026-10-16, made before any human label was seen; `answers.json` did not exist when this was written)

Ega asked for two records. The original text above is not edited.

- Exclusion of the 302 PRs was not applied. The line "Exclude the 302 PRs from the 2026-10-06 check" is in the Sample section, but `sample.mjs` has no exclusion step, and the list of the 302 was kept in a scratchpad that is now empty. What can be said instead:
  - The 302 were drawn from the public `hao-li/AIDev` dataset (`pull_request.parquet`, 71,677 PRs, 6 agents), per the 2026-10-06 study protocol and amendment. I read that protocol and amendment in the transcript of the session that ran the study; the study's own files no longer exist.
  - I downloaded the current `pull_request.parquet` on 2026-10-16 (57,572,515 bytes; the dataset page lists last modified 2026-10-09 and sha 7840b6e61a5828461cd96806c52c20194ef57979). It still has 71,677 rows, and `created_at` runs from 2024-12-24 to 2025-10-24.
  - The 299 sampled S11 PRs were all opened between 2026-09-01T08:03:43Z and 2026-10-13T22:44:34Z. Matching the 300 sampled `repo#number` ids (the 299 usable PRs plus the one that now returns 404) against the dataset's `html_url` gives 0 overlaps.
  - Limit: this checks the current version of the dataset, which was modified after the 2026-10-06 study. The 302 themselves cannot be listed, so the check relies on the dataset's date range and on the 302 having come from the dataset. No overlap was found; it is not shown independently of those two facts.
- The "already known" bullet "0 real test weakenings in 302 held-out agent PRs" is marked: not reproducible, source data lost. It also had one labeler. It is not used as an input to any threshold in this study, and it is not cited in the README, the article or any post until it is re-run. Re-running is possible in principle: the dataset is still public and the sampling used a fixed seed (7), but the GitHub patch fetch and the blind labeling would have to be redone.

## Amendment 4 (2026-10-16, made before any human label was seen; `answers.json` did not exist when this was written)

- The human anchor question changes from "which of L1 to L5 apply" to one question per PR: "Failing claim? Yes / No / Can't tell". Yes means at least one of L1 to L5 in the rubric applies. No means none applies. Can't tell means the packet lacks the data to decide (the rubric's `undecidable`).
- Why: D1 and D2 use only failing versus not failing. Kappa is computed on that yes/no, and `undecidable` counts as not failing. A five-label choice on 30 PRs adds effort and gives per-label human counts too small to use. The rubric text, with its definitions of L1 to L5, stays on the page unchanged.
- Consequence: per-label counts and the five-label kappa are not computed against the human. They remain for Claude versus qwen.
- Each card pulls three things out of the packet with code, using text matching only, with no model and no model label involved: the sentence in the title or body that claims tests or CI pass, the CI check conclusions, and the changed assertion lines in test-file diffs. These are reading aids. The full packet, the same text the models read, stays on each card. The matching can miss a claim or an assertion line. A card where nothing was found says so and does not imply "No".
- Difference in conditions: the models read only the full packet, and the human gets the same packet plus these highlights. That can raise human-versus-model agreement compared with the models' agreement with each other. The report states it.
- Unchanged: the same 30 PRs, the same random order, the same seed (20261015), the same three groups, the scoring in `agree.mjs score`.

## Amendment 5 (2026-10-16, made before any human label exists; `answers.json` did not exist when this was written)

- The human anchor is postponed, not dropped. Ega is not labeling now. The anchor sheet, the labeling page (`make-label-page.mjs`, one yes/no/can't-tell question per PR per Amendment 4) and the scorer (`agree.mjs score`) stay in place and unchanged, so the anchor can be labeled later and scored the registered way.
- Meanwhile the registered result is reported as the pre-registration defines it. D2 says that if kappa between the two models is below 0.6, D1 is inconclusive whatever the count. Kappa between Claude and qwen on the 299 PRs is 0.092, so D1 is inconclusive.
- `REPORT.md` is written on that basis. The model disagreement is its main finding. It describes the PRs that qwen flagged and Claude did not, and it does not label any of them. The exploratory population estimate in Amendment 2 needs the human anchor and is therefore not produced.
- If the anchor is labeled later, its result is added to the report as a dated addendum, and the registered D1 result above is not rewritten.
