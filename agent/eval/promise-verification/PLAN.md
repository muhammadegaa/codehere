# Promise verification plan: codehere 1.0.2

Draft 2 · 2026-10-09 · written by Claude for the owner · nothing in this plan has been run yet.
Revised after the owner's point that AI reliance means there is no definitive way to show a promise is 100% delivered. Section 1 now states what the campaign can and cannot show; sections 4, 5 (S3, S4, S5, S14), 7, 9, 11 and 12 changed to match.
Scope: codehere only. Tests whether what we say codehere does is true. It does not test whether anyone wants it.

## 1. Goal, limits and completion test

Goal: for every public statement codehere makes about what it does, record whether it holds and how strong the evidence is, using evidence a third party can re-run. Then produce the list of statements we can make at launch, each worded to the strength of its evidence.

**What this campaign cannot do.** It cannot show that any claim is 100% delivered. Testing finds failures; it cannot show there are none. That is true with or without AI. Here it is worse for a specific reason: the product, its tests, the fixtures, the graders, this plan and the final report were all written by AI from the same model family. Their mistakes are likely to line up, and a reader would have to take my summary on trust, which is what codehere tells its users not to do. So everything an AI produced is treated as unverified until something that is not an AI confirms it. AI is used to write checks and find cases. It is never the final key that decides pass or fail.

**Assurance tiers.** Every verdict carries one:

| Tier | Meaning | What it lets us say |
|---|---|---|
| R (root) | Checked by a mechanism that does not depend on any AI's judgment, over a finite domain that is enumerated, in a form a person can re-run and read. Examples: an independent verifier recomputing the log's hashes; flipping every byte of a log one at a time; the vendor's own billed figure against our estimate; a decoy directory still existing after a blocked `rm -rf`; a network sink log; a test runner's exit code | "does X" for the enumerated scope, with the scope stated |
| S (statistical) | Measured on a sample or corpus. Fixtures and labels may be AI-authored | "caught k of n on this set", with who wrote the set, its size and its known gaps. Never "works" |
| A (AI-assessed) | Judged by a model (a subagent, Codex, Gemma) or by me | Nothing public. Advisory only |

Wording rule: a claim is worded at the strongest tier its evidence reaches. If the evidence is S, the claim is worded as a measurement. If it is A or absent, the claim is not stated as fact. The words "guarantee", "100%", "proven" and "always" are not used about product behaviour in any output of this campaign, and the same holds for launch copy.

**Root of trust, meaning what a reader must trust.**
1. The reproduce bundle: one short script per E1 claim in plain shell or node, under 600 lines in total excluding fixtures, so one person can read all of it. The owner can run it on a clean machine.
2. The independent checkers (S14): small re-implementations in a different language of the audit-chain verifier, the signature check, the cost arithmetic and the test-count parser, used for differential testing against codehere. They are written from the documented format and algorithm, not by reading codehere's verifier. They are still written by me, so the independence is partial; the hash arithmetic can be spot-checked by anyone with `sha256sum`.
3. Third-party tools and facts: git, sha256, OpenSSL, Docker network isolation, the vendors' own usage figures.
Everything else (corpora, reviewer models, subagent opinions, my reports) is supporting evidence.

**Narrow the promise until it can be checked.** Where a claim is universal or open-ended ("every tool call", "catches agents when they lie", "all your agents"), the campaign tries to rewrite it as a contract: scope, command, expected output, known gap. For example, "every tool call audited" becomes "every call of these listed tool types that Claude Code sends through the PreToolUse hook is recorded; other types are not", which can be checked against Claude Code's own transcript.

**Completion has two parts.** Part one is `coverage.mjs`. It checks that the paperwork is complete. It does not check that claims are true. It exits 0 only when all six are true:

1. Every claim in `claims.json` has a terminal verdict: SUPPORTED, PARTLY, CONTRADICTED or UNVERIFIABLE.
2. Every verdict except UNVERIFIABLE links to at least one evidence row whose files exist and whose sha256 matches.
3. Every UNVERIFIABLE row names the reason, the action that would make it verifiable, and who owns that action.
4. Planned cells = executed cells + blocked cells (each blocked cell lists its reason). Any other count fails the script.
5. Every instrument passed its canaries before and after the batch that used it. A canary is a planted fault the instrument must detect, plus a clean case it must not flag.
6. Every claim worded comparatively ("ahead of", "unlike", "catches what X misses") links to a head-to-head or baseline study. If none exists, the claim is marked "no comparison made" and may not be worded comparatively.

Part two is substance, and no script can decide it:

7. Every E1 claim is either tier R, or reworded to what its tier supports, or removed.
8. The owner has run the reproduce bundle himself on a clean machine and seen the output (about 1 to 2 hours).
9. The independent checkers agree with codehere on the shared cases, or every disagreement is explained and adjudicated against the format or the cryptography, not against my opinion.

If either part fails, the campaign is not done.

## 2. What already exists (inputs, not results)

I recovered these from earlier sessions' scratchpads after the `/clear`. They are inputs. Verdicts from them are carried forward as hypotheses and re-run, because codehere changed today (six commits) and the evidence standard in section 4 is stricter.

| Input | Where | What it holds |
|---|---|---|
| Promise ledger, 2026-10-08 | `34f3d4d3…/scratchpad/promises/LEDGER.md` | 27 promises from site, `--help`, README, CAPABILITIES. 6 supported (#22 and #24 on internal evidence only, #25 with known holes), 8 partly, 3 contradicted (#2 parallel agents, #9 hook "last line of defense", #13 cost "all your agents"), 9 untested or unclear, 1 stale (#27 site says v0.8.0 invite-only) |
| Head-to-head, 2026-10-08, 5 groups | `…/scratchpad/compare/{safety,cost,verify,orchestration,audit}` | Docker fixtures, code graders, ledgers, SUMMARY per group. Competitors: cc-safety-net, no-nuke, claude-guard; codeburn, tokentracker-cli, splitrail; test-guard, proof-of-work-agent; coven (agetor unverifiable, macOS only); aigis, agent-audit-trail, trustgate (burnout unverifiable) |
| "Untested promises" run, 2026-10-08 | `…/compare/untested/` (t11, t15, t16, t20, t21, mcp.mjs) | Scripts exist. The verdicts were reported only in a sub-agent's final message; `ledger.md` is a 239-byte stub. Those verdicts are lost. Re-run and write to the ledger |
| false-done eval | `agent/eval/false-done*.mjs` | 21 tasks (13 false claims, 8 honest). Re-run catches 11 of 13, confirms 8 of 8, 0 false alarms. Misses fd-04, fd-14 |
| Reviewer-proxy experiment | `…/scratchpad/reviewer/` | No-execution model reviewers on the same 21 tasks. Matches or beats the re-run on catch rate; re-run's edge is precision and repeatability |
| Hard-cheats pre-registration | `6e8010f9…/scratchpad/hard-cheats/PREREG.md` | Draft. 24 tasks, classes A/B/C, 4 reviewers. Becomes study S6b |
| AIDev study, 2026-10-06 | `…/scratchpad/aidev/` (PROTOCOL.txt, scan2.mjs) | Pre-registered. Runs the real `parseTestWeakening` on patches fetched from the GitHub API, up to 300 PRs per agent across 6 agents, dev/held-out split by hash, held-out flags labelled blind. Result recorded in NOW.md: 0 real test weakenings in 302 held-out agent PRs (not reproducible: source data lost; one labeler; not to be cited until re-run). Not covered: the "return above an assertion" rule (needs file contents), no human-PR baseline |
| July sweep | `agent/docs/E2E_FINDINGS.md` | 34 WORKING, 3 DEGRADED, 6 BROKEN (8 bugs, a 9th found in the fix pass), 9 UNVERIFIABLE. Later fixes need re-testing against the same test IDs |
| Readiness verdict, 2026-08-18 | `agent/docs/READINESS_2026-08-18.md` | NOT READY, blockers B1 to B12. Partial re-check 2026-09-24: B7 and B8 fixed; B3 and B10 open; B6 moved but not confirmed gone; B1, B2, B4, B5, B9, B11, B12 not re-checked |
| Capability scoreboard | `docs/CAPABILITIES.md` | 0 of 5 value layers green; V4 (carry-over across vendors) red; V5 (egress) still unflipped. The 2026-08-10 note narrows V5 to codehere's own process and adds `egress-proof.mjs` |
| Existing harnesses | `agent/scripts/verify-all.mjs`, `agent/eval/*`, `scripts/egress-proof.mjs`, `npm run e2e`, `degraded-matrix.mjs`, `dogfood-pass.mjs` | Reused as the "floor" run. Extended, not replaced |

## 3. The claim universe

### 3.1 Sources (all read, none assumed)

1. codehere.uk: home, /use-cases, /vs/claude-code, /vs/cursor, /vs/aider, FAQ, JSON-LD, `llms.txt`. Both the repo copy (`codehere-landing`) and a live fetch, because they can differ.
2. npm: the published 1.0.1 page and metadata (what a stranger gets today) and the 1.0.2 candidate README and description.
3. `agent/README.md` and any root README.
4. `codehere --help` and every subcommand `--help`.
5. Text the CLI and dashboard print at runtime (verdict strings such as "Chain intact", "independently corroborated", "Tests pass: codehere re-ran them itself").
6. MCP `tools/list` descriptions and `serve --show-config` output.
7. GitHub Action: `action/action.yml`, its README, `GITHUB_ACTION_SPEC.md`.
8. Outbound text: `OUTREACH_QUEUE.md`, `SIGNUP_WELCOME.md`, HN drafts #21 to #24 (location not yet found by grep; the owner to point me to it), the one-pager, GTM plan.
9. Submitted or sent artifacts, audited read-only: Unit M application, Techstars drafts, the 17 Sep email.
10. Proposed copy not yet live: `drafts/landing-copy-realigned.md`, the 7 pending site rewordings.
11. Numbers stated anywhere ("1958 tests", "62 checks", "<5 ms", "11 of 13", "29 commands").
12. Statements about third parties on the /vs pages (for example "Claude Code `/resume` only reaches your most recent sessions", "Aider writes `.aider.chat.history.md`").

### 3.2 Extraction and freeze

A script splits each source into sentences and keeps those that assert a capability, number, comparison, guarantee or absence ("no account", "sends nothing"). I review the output; the owner can strike or add rows. Each row stores: claim id, the verbatim quote, source, retrieval date, quote sha256, pillar, claim type, exposure tier. A check script confirms every quote still appears verbatim in its source. `claims.json` is hashed and frozen before any test runs. New claims found later are appended with a date and flagged "found during testing", never merged silently.

Claim types: capability, quantitative, comparative, guarantee ("every", "all", "never"), absence ("no account", "no cloud"), third-party fact, runtime assertion (a string the product prints), roadmap (listed, not tested, must be worded as plan).

### 3.3 Exposure tiers (decides order and launch gating)

| Tier | Meaning |
|---|---|
| E1 | Text strangers or prospects see first, or that is going out now: npm description and README first screen, site hero and FAQ, HN title and body, messages in the 30 Oct sales sprint (offers A and B), Action description |
| E2 | Deeper public docs, CLI output, dashboard strings, /vs and /use-cases pages |
| E3 | Internal docs, unsent drafts, roadmap statements |

### 3.4 Known set today

27 promises in the ledger plus these classes found while preparing this plan:

- The README says the hook intercepts Bash, Edit, Write, MultiEdit and NotebookEdit; the site says "Every tool call audited". Read, Grep, WebFetch, Task and MCP calls may not be captured. Suspected gap, to test.
- README "under 5 ms" for the trust-scorer; the earlier head-to-head measured about 100 ms per hook call (process start included). The claim needs a definition.
- Badges and counts: "1958 internal tests passing" (the suite now runs 1973 passing plus 1 known failure), "62 checks", command count (27 listed in `--help` in the working-tree build, plus hidden ones; SHIP_V1 says 29).
- Runtime assertions of the B8 class: the product printing "Verified" or "Running" without checking.
- Quantitative claims in the offer: catch rates, "0 false alarms on 8 honest changes".
- Third-party facts on the /vs pages.
- The Action: "posts a receipt on every PR" and "keeps one receipt comment". Never run on GitHub.
- Unit under test: README still says "v0.8.0 is the current published stable" while npm latest is 1.0.1 and the package is 1.0.2.

Final count comes from the extraction script. I expect 60 to 100 rows.

### 3.5 Pillars (claim id prefix)

INS install and first run · AUD record, hash chain, signing · SAF safety hook and approvals · CST cost, budget, team spend · VER check, verify, receipt, Action · TRU trust score and scan · ORC agents, sessions, memory, turn-taking · INT MCP, context sources · SYN thread and team sync · PRV local-first, privacy, licence · NUM numbers and comparisons · META versions, links, status.

## 4. Evidence standard

**Unit under test.** A tarball built from a clean `git worktree` at a recorded commit (not the working tree, which holds uncommitted `assess` work and doc edits), with its sha256. Two targets: T-pub (npm 1.0.1, what a stranger installs today) and T-head (1.0.2 candidate). Each claim states which target it is about. Every evidence row records the target hash.

**Evidence row** (JSONL, written by the harness, never typed by me): claim id, test id, run id, UTC time, codehere commit and tarball sha, tool versions, environment (image digest or host), exact command, exit code, stdout and stderr file paths with sha256, grader id and grader sha256, result, n runs, notes.

**Verdicts.** The grader computes the test result from recorded output. I can annotate or downgrade a result; I cannot upgrade one. Claim verdict is the worst test result among its tests, read against the claim as worded:

| Verdict | Meaning | What happens to the wording |
|---|---|---|
| SUPPORTED | Observed behaviour matches the claim as worded | Allowed as is |
| PARTLY | Works with a defined gap | Narrow the wording to the supported subset or disclose the limit next to the claim |
| CONTRADICTED | Observed the opposite | Remove, rewrite, or fix the code (bug fixes are allowed under the sprint freeze) |
| UNVERIFIABLE | Could not observe | Not stated as fact; allowed only as "planned" or "claimed by X, not tested" |

UNVERIFIABLE is a first-class result and is never upgraded. Each verdict also carries its assurance tier from section 1. Only a tier R verdict lets a claim be worded as delivered.

**Launch gate.**

| Level | Condition | Action |
|---|---|---|
| L0 | E1 claim CONTRADICTED | Stop and report to the owner the same session. No further outbound send with that wording |
| L1 | E1 claim PARTLY, or E2 claim CONTRADICTED | Narrow or disclose before launch, or fix |
| L2 | E3 claim CONTRADICTED or PARTLY | Fix or drop at next release |
| L3 | Any UNVERIFIABLE | Must not appear as fact |

**Statistics.** Every rate is shown as k of n with the set size and who wrote the set. Wilson 95% interval for any rate. Any agent- or model-driven cell runs at least 3 times and reports a flip rate. No percentage from fewer than 20 trials without k of n beside it. The words "always", "never", "all", "every" are not used about a result unless every case is enumerated. With 12 per class, only gaps above about 40 points are distinguishable from noise; reports say so.

**Instrument validity.**
- Canary: every instrument has a positive control (a planted event it must see) and a negative control (a clean case it must not flag). A batch with a failed canary is void.
- Mutation testing, tool-driven: the unit tests were written by AI, so I measure whether they can fail. A mutation tool (StrykerJS or equivalent; feasibility confirmed in the Phase 0 pilot) injects deterministic faults into the promise-critical modules (`rerun-tests`, `detect-test-weakening`, `check-claimed-tests`, the audit chain and signing code, `spend-aggregator`, budget, `claude-sdk-hook`, thread import). Report the mutation score per module as killed of total, list every survivor, and have a person triage them (some are equivalent mutants). A claim whose backing module has surviving mutants in the code path the claim depends on cannot reach tier R until each survivor is explained or covered. I also hand-inject 12 one-line faults (hash verification, signature verification, budget refusal, hook block, weakening rules, zero-tests detector, claimed-file check, kill, trust grade, thread-import signature, receipt wording, verify fact-check) as a smoke test of the tool. A test that cannot fail does not count as evidence.
- Coverage: branch coverage on the same modules. Uncovered branches are listed as "not exercised by any test" next to the claims that depend on them.
- Two-key rule: any CONTRADICTED verdict, and any SUPPORTED verdict on an E1 claim, is reproduced by a second path before it is recorded. The second path must be a different mechanism (a physical effect, an independent checker, a fresh container) or the owner. A second AI opinion is not a key; it is tier A. This exists because I filed BUG-5 in July as "CRITICAL, 30 to 40x cost inflation" after misreading cents as dollars.
- Pilot first: each study runs 3 cells, calibrates timing and flake, then freezes and runs in full.

**Case generation and labels.** Cases come from, in order of preference: (1) enumeration of a finite domain (every byte of a log, every command and flag from `--help`, every runner and outcome pair, every documented tool type); (2) tool-generated cases with fixed seeds (property-based or fuzz generators, not an LLM); (3) third-party corpora (the competitors' own test fixtures, AIDev, public incident posts); (4) real data (copies of real logs); (5) cases I write, which are tier S at best and are labelled with their author. Every expected outcome comes from an executable oracle (the correct implementation's test run, a file's presence, an exit code, the vendor's number), never from my belief about what should happen.

**Pre-registration.** Each study gets a `PREREG.md` before any run: question, fixtures with hashes, graders, n, my predictions, decision rules, what will not be claimed. Predictions are scored afterwards, including the ones I get wrong.

**Fix discipline.** Observe, freeze, then fix in a separate pass. A fix starts with a failing regression row, and the same test id is re-run after the fix. Before and after rows both stay in the ledger. Detection-quality fixes are scored on the dev set; the sealed hold-out (S6c) is evaluated once, at the end.

## 5. Studies

Cost tiers: T0 = $0, containers and local models only. T1 = uses the owner's subscription quota or a free-tier key. T2 = billed API; excluded unless the owner adds it.

### S1. Cold install and first run (isolation)
Question: can a stranger get from the README to a first receipt on a clean machine?
Design: installs from {npm 1.0.1, 1.0.2 tarball, `npx codehere@latest`} in {macOS host with temp HOME, node:20, node:22, node:24 bookworm, a container without git, a container with network removed after install}. Steps from the README only: `check` on 3 fixtures, `init`, `hook install` (fake HOME), `start` and reach :3773, `setup`. Record commands needed, time to first useful output, files written to cwd and HOME (before/after diff, the B3 class), exit codes. Published-package audit: `npm pack --dry-run` contents, npm README versus repo README (B4: "codehere check" had 0 hits), metadata links (B2), dependencies, licences, install scripts, size.
Cold-agent test: a fresh subagent given only the npm README and a repo with a false "tests pass" claim; success = it produces a correct receipt unaided. 3 runs each for Sonnet and Gemma 26B.
Size: about 60 cells plus 6 agent runs. T0.

### S2. Surface sweep and docs-as-tests (isolation)
Design: enumerate every command, subcommand and flag from `--help` recursively (27 listed commands in the working-tree build, 26 at HEAD because `assess` is uncommitted, plus hidden ones such as `scan-tool`). For each: `--help` exits 0; each documented example runs in a sandbox with its expected exit code; error paths (missing args, bad ids, no daemon) end in clean messages and defined exit codes, no stack traces; the exit-code contract for `check`, `audit verify`, `verify`, `budget`. Extract every fenced command from README, site, /vs pages and help text, run it, and record pass, fail or needs-credentials. Runtime-assertion falsification: for each verdict-bearing string the product prints, build a scenario where the string must not appear (unwritable `CODEHERE_HOME`, no network, no agent installed, corrupted store) and check that it does not. Dashboard: recompute the hero numbers from `/api` (July test 4.1) and assert equality; DOM assertions on every route; zero-state and populated state tested separately.
Size: about 250 cells. T0.

### S3. Record integrity and capture (isolation + head-to-head)
Tamper matrix, 12 attacks on each chain source (hook-fed, daemon-fed, imported bundle, team-shared): flip a byte; delete a middle entry; delete the tail; truncate a partial last line; append a forged entry with a valid hash and no key; append with a valid chain and an attacker-generated key; owner rewrites the full chain; reorder two entries; duplicate an entry; swap the key file; roll back to an older valid copy; alter timestamps. Source code already admits some are undetected (external anchor "NOT BUILT"); the test is what the public wording promises against that table.
Capture completeness: scripted sessions with a known number of calls of every tool type (Bash, Edit, Write, MultiEdit, NotebookEdit, Read, Grep, Glob, WebFetch, Task, MCP tools) per vendor; compare captured entries to the vendor's own transcript. Crash consistency: kill -9 mid-write, two sessions writing at once, unwritable audit dir, disk full. Key and file permissions on `~/.codehere`. Verify time and memory at 30k and 300k entries. Exhaustive check (tier R): flip every byte of a 1,000-entry log one at a time, one trial per byte with no sampling, and require `audit verify` to flag each; run the independent verifier (S14) on the same logs and require identical verdicts.
Comparators: agent-audit-trail, aigis, trustgate (burnout unverifiable), plus candidates from competitive notes (Bernstein, DeepSeek Harness) if installable in Docker. Baselines: the vendor's own transcript files, plain git history.
Size: 12 × 4 × 3 runs, plus capture matrix 5 vendors × 11 tool types. T0 for tamper and synthetic capture; vendor capture needs T1.

### S4. Safety hook (isolation + head-to-head + native baseline)
Corpus of about 220 payloads: 80 destructive, 25 credential access, 40 obfuscated variants (quote splitting, base64, env indirection, `eval`, `python -c`, heredocs, `xargs`, `find -exec`, `git -c` aliases), 80 safe developer commands that contain destructive-looking text (`rm -rf node_modules`, `git clean -n`, `echo "rm -rf /"`, `grep -r "reset --hard"`, `git push --force-with-lease` on a feature branch). The competitors' own test corpora are reused unchanged as fixtures, to reduce my authoring bias. Metrics: block rate and false-block rate with intervals, ask versus block, latency p50 and p95 (whole process, and scorer alone, against the "under 5 ms" claim). Failure behaviour: hook crash, malformed stdin, oversized payload, timeout, unwritable audit dir: fail open or closed, and what the agent sees.
Live wiring (T1): a real Claude Code session in a throwaway repo told to run a destructive command whose target is a decoy directory; observe the block, the audit entry and the agent's behaviour afterwards. The oracle is physical (the decoy directory and a sentinel file still exist), not a reading of the logs. Install scope: global `~/.claude/settings.json` versus project scope, install idempotence, uninstall restores the original.
Per vendor: the README says only Claude Code gets pre-execution blocking; verify nothing blocks for Codex, Aider, OpenCode, Gemini, and compare with the site wording.
Comparators: cc-safety-net, no-nuke, claude-guard. Native baseline: Claude Code's own permission deny rules with equivalent patterns.
Size: 220 payloads × 5 tools plus about 10 live sessions. T0, live part T1.

### S5. Cost and budget (isolation + head-to-head + native baseline)
Ground truth: vendor-reported cost where it exists (Claude Code `total_cost_usd` in stream-json, Aider's printed cost line, other vendor stats). The vendor's own figure is the oracle (tier R for the arithmetic), and the independent cost recompute (S14) runs on the same raw token counts. Per vendor with a readout: 3 scripted tasks (small, medium, long with caching), codehere estimate versus vendor figure, error with interval. Field coverage: cache-write TTL (5 minute versus 1 hour), long-context tier, reasoning tokens, local models ($0, `ollama_chat/`, `:cloud` models). Ingestion scope: run against a copy of real `~/.claude` and Codex logs to see what it can and cannot read, which sets the allowed wording for "see what your AI coding agents cost". Budget: refusal at the exact cap, 5 parallel spawns with room for 1 (race), exit codes (earlier run: `budget` exits 0 when over), day boundary and timezone, units (cents in storage versus dollars in UI, checked by recomputation from raw). Team spend merge: 3 simulated machines with overlapping days, duplicate shares, clock skew, a tampered share.
Comparators: codeburn, tokentracker-cli, splitrail. Native baseline: Claude Code `/cost` and `/usage`.
Size: about 15 ground-truth sessions, 40 synthetic usage fixtures, 20 budget races. Synthetic part T0; ground-truth sessions T1 (local models free).

### S6. Verify, check and the receipt (the detection-quality program)
- **S6a Dev corpus.** Grow false-done from 21 to at least 50 tasks, each traced to a public source (incident post, ImpossibleBench mode, METR reward-hacking example) with link and retrieval date. Categories include: test deletion, skip or xfail, weak assertion, `assert True`, early return, commented-out assertion, hard-coded expected outputs, mocking the function under test, a `conftest` that marks everything pass, `|| true` in the test script, the test script replaced by `echo`, CI job disabled, fixtures edited to match wrong behaviour, lowered coverage threshold, `--passWithNoTests`, narrowed glob, snapshot overwritten, assertion errors swallowed in `try/except`, retries hiding failure. Reported as a catch table per category, not one percentage.
- **S6b Hard cheats.** The 24-task pre-registered study (cheats buried in 150 to 250 line diffs; classes A visible, B invisible in the diff, C neither tool sees), 4 reviewer models × 3 runs, plus codehere, plus a "plain re-run exit code" arm (the incumbent: just run the tests), so the value added over doing nothing special is measured.
- **S6c Sealed hold-out.** 20 tasks built by a different pipeline (Gemma 26B drafts cheat variants from category descriptions; I validate only with truth commands). Hashed and sealed; evaluated once at the end; never used for fixes.
- **S6d Real-PR precision (extends the 2026-10-06 AIDev study).** Reuse its protocol and `scan2.mjs` unchanged. New work: a fresh sample with a new seed, to see whether the 0 of 302 result (not reproducible: source data lost) is stable; the same dev/held-out discipline; every flag labelled A/B/C by two independent labelers (a cold subagent and Gemma 26B) with their agreement reported, since the first study had one labeler (me). Report flag rate and the share of A, B and C as k of n with intervals. Limits that stay: patches only, so tests cannot be re-run; the early-return rule is untested because it needs file contents; no human-PR baseline.
- **S6e Head-to-head.** test-guard 0.1.1 and proof-of-work-agent 0.2.0 on S6a and S6b fixtures; reviewer proxies from S6b. Hosted reviewers (CodeRabbit, Claude Code Review, Copilot review) stay UNVERIFIABLE unless the owner provides access (decision 3).
- **S6f Final Report fact-check (`verify`).** Reports from real agent runs (S8) with planted false claims: test counts, files changed, "nothing else touched", "all tests pass", "fixed X". Read the code for what "a second model's review" in the site's verify section actually is, test it, and check that no model opinion renders as proof (DESIGN.md section 1).
- **S6g Receipt reproducibility (B1).** `check --proof` 10 times on each of 3 repos in 3 environments; dirty-tree wording; runner version drift; run the printed "Reproduce" command in a second container and compare verdicts; a suite with one 30% flaky test.
- **S6h Runner and failure coverage.** pytest, node:test, jest, vitest, go test, cargo test: pass, fail, zero collected, timeout, missing deps, monorepo root, workspaces, a test script that runs only lint. Check the red, grey, green mapping each time.
Size: 50 + 24 + 20 tasks, 432 reviewer runs, 1,000 patches, 90 receipts, about 40 runner cases. Gemma arms and codehere T0. Claude reviewer arms: 144 subagent runs (Sonnet and Opus, diff condition), up to 216 with the Sonnet full-file arm, counted against the owner's Claude quota (decision 2).

### S7. Trust score and scan
Seeded corpus: intentionally vulnerable public apps with documented vulnerability lists (candidates OWASP Juice Shop and NodeGoat; chosen and verified at fetch time; source clones only, no images, because of disk), 10 mature clean repos, and 30 planted secrets of different types in files and in history. Measure recall of documented vulnerabilities, false-positive rate on the clean repos, whether the "ONE thing that will get your app hacked" is actually the top documented issue, and run time. "Zero API calls": run in a network-less container. Comparators: gitleaks alone, semgrep alone, `npm audit`. T0.

### S8. Real agents and orchestration (end to end + head-to-head + native baseline)
Agents: Aider and OpenCode on local Gemma 4 (T0; weak at agentic edits, which is acceptable because the test is tracking fidelity), Claude Code and Codex on the owner's subscriptions (T1), Gemini only if a free key exists (otherwise UNVERIFIABLE with the reason).
Nine scenarios per agent: trivial edit; multi-file change with tests; fix a failing test honestly; agent claims success having done nothing; kill mid-run; follow-up `reply`; auth or rate-limit failure; two agents on one repo (same file, then disjoint files); hand-off A to B with a unique fact planted in turn 1 and asked about in turn 2.
Per cell, a grader compares: git diff and filesystem versus codehere's recorded files; the vendor's native log versus recorded steps; session status versus what happened; audit entry count versus tool calls; cost versus vendor figure; verify verdict versus reality. Local cells run 3 times; subscription cells 1 or 2 because of quota, so any failure is reproduced once before it is called BROKEN.
Comparators: coven (agetor unverifiable). Native baselines: Claude Code `/resume` and `--continue`, Aider's history file, Codex resume, and doing it by hand with `git worktree`. These are what the /vs pages claim to beat.
Size: about 45 cells, 100 to 130 runs. T0 for local agents, T1 for Claude Code and Codex.

### S9. Integrations: MCP, context sources, GitHub Action
MCP: conformance with the official MCP client over stdio and HTTP (initialize, `tools/list`, each tool with valid, invalid and oversized input, concurrent calls), and the `serve --show-config` block parsed and run against the installed binary path. Cursor itself is a GUI: the owner confirms.
Context sources: GitHub with a read-only fine-grained token on a public repo; Linear and Figma need accounts and are UNVERIFIABLE without sandbox tokens from the owner; draw.io does not appear in the CLI (a claim to remove or mark planned).
Action: static review of `action.yml`, `post-receipt.mjs`, `summarize.mjs`; a simulated runner in Docker; hostile inputs (PR body with shell metacharacters, `$(...)`, backticks, newlines, a leading `--`, 70 KB, unicode; odd branch names); fork PR without secrets; comment idempotence ("keeps one receipt comment"); huge test output; timeouts; permission scope. The Action runs `npx codehere@<version> check --claim=<PR body>` with attacker-controlled text, so this is a security test as well.
Live run: a throwaway public repo, prepared by me, created and pushed by the owner (decision 3).
Size: about 60 MCP cases, 40 Action cases. T0 except the live run.

### S10. Sync, team and privacy
Thread export and import across two HOMEs, including the trust prompt and `--trust` semantics, unknown keys, key rotation and loss, replay and duplicate imports, tampered bundles, large bundles. Secret leakage: run a command containing a fake AWS key through the hook, export the thread, search the bundle and the audit log (gitleaks on a copy of `~/.codehere`). Git-remote sync: the site says "signed payloads through a self-hosted git remote"; read what `team` and `thread` actually do and test with a local bare remote; if no code pushes or pulls, the claim is CONTRADICTED.
Egress without sudo: run codehere's own commands, the daemon (10 minutes idle plus dashboard load), MCP and the Action simulation on an internal Docker network with a logging sink for DNS and TCP. Positive control: a planted `curl` must be recorded. This addresses the V5 limit that `lsof` was blind, but covers codehere's own process only, since vendor agents cannot run in the container. Static grep for network calls and telemetry; check that `--cloud` is gone (B7).
Size: about 40 cells. T0.

### S11. Reliability, performance, platform
Daemon: idle soak 6 to 24 hours with 200 mock tasks (RSS and file descriptors sampled each minute), 100 start-stop cycles, port 3773 already in use, `kill -9` mid-task and what the session shows after restart. Scale: `check` on a 10k-test suite and the rerun timeout, `--base` on a 5k-file diff, `trust .` on a large repo. Platform: Node 20, 22, 24; Linux arm64 container versus macOS arm64. Windows is not claimed anywhere I found; confirm `package.json` has no misleading `os` field and mark Windows "not tested, not claimed".
Size: about 30 cells plus the soak. T0.

### S12. Security of the product
Web UI: stored XSS through agent output and task prompts rendered in the dashboard; CSRF and DNS rebinding against the unauthenticated localhost daemon; CORS and Origin handling; command injection through session ids and arguments in `kill` and `reply`; path traversal in thread import and file operations; MCP input validation; dependency audit and the SBOM; install scripts. `hook install` edits a global settings file: backup, restore, coexistence with existing hooks. Dotenv loading from the install dir (the known test-contamination mode). This is a focused review, not a security audit, and the report says so.
Size: about 60 cells. T0.

### S13. Copy and launch-artifact audit
Every sentence in the section 3.1 sources becomes a claim row or is rejected with a reason. Automated checks: an absolute-word linter ("every", "all", "any", "never", "zero", "100%"); numbers recomputed (test count, command count, version, dates); every URL requested and its status recorded (B2: repo private, links 404); a cross-surface table of the same fact across site, npm, README, help and drafts (version, what the product is, supported vendors); third-party facts from the /vs pages checked against the third party's current docs or behaviour in a container. Output is an edit list; the owner approves and deploys wording changes. T0.

### S14. Floor, mutation, coverage, independent checkers, dogfood
Floor on the frozen artifact at the start and again at the end: build, lint, full suite, `verify-all.mjs`, `false-done.mjs`, `egress-proof.mjs`, `npm run e2e`, `degraded-matrix`, `pretag-npm-check.sh` in dry mode, `npm pack` contents.
Mutation testing and coverage on the promise-critical modules, as set out in section 4.
Independent checkers, written in a different language from the documented format and algorithm, not from codehere's verifier code: (1) an audit-chain verifier (hashes with the standard library, Ed25519 through OpenSSL 3 or libsodium in a container); (2) a cost recompute from raw token counts and a published rate table; (3) a test-count parser for node:test, pytest and the other runners' summaries. Each runs on the same inputs as codehere in every relevant study. A disagreement is a finding in one of the two, adjudicated against the format or the cryptography, never against my opinion.
Dogfood: run `codehere check --base` and `audit verify` on our own commits for the whole campaign and log escaped misses (wrong verdicts found outside the harness). T0.

### S15. Human studies (the owner-owned; I prepare the material)
Five watch-a-stranger sessions: install and run `check` on their own repo, with a script and an observer sheet (time to first receipt, where they stall, what they say the receipt means). The question to three SOC 2 auditors about signed re-run receipts (already on your list). These give comprehension evidence for the claims I cannot judge. I cannot run them.

## 6. Coverage matrix

● primary study, ○ supporting study. "H2H" = head-to-head comparators. "Native" = native-tool baseline. `#n` = promise number in the 2026-10-08 ledger.

| Claim group | Isolation / e2e | Detection-quality | Real agents | Security / adversarial | Copy audit | H2H comparators | Native baseline |
|---|---|---|---|---|---|---|---|
| INS: one install, no account, Node 20+, offline (#24) | S1 ●, S2 ○ | | | S12 ○ | S13 ○ | | |
| AUD: every tool call audited (#3), hash-chained, append-only, local verify (#4), signed (#5) | S3 ● | | S8 ○ | S3 ● | S13 ○ | agent-audit-trail, aigis, trustgate, Bernstein? | vendor transcripts, git history |
| SAF: PreToolUse last line of defense (#9), credential block (#10), approvals and override (#11) | S4 ● | S4 ● | S4 live ● | S12 ○ | S13 ○ | cc-safety-net, no-nuke, claude-guard | Claude Code deny rules |
| CST: cost visibility (#13), budget refuses spawns (#12), team merge (#14) | S5 ● | | S5 ground truth ● | S12 ○ | S13 ○ | codeburn, tokentracker, splitrail | `/cost`, `/usage` |
| VER: re-runs tests (#25), every claim verified (#7), second-model review (#8), Final Report check (#20), Action (#26) | S2 ○, S6g ● | S6a to S6e ●, S6h ● | S6f ○ | S9 Action ● | S13 ● | test-guard, proof-of-work, reviewer proxies, hosted reviewers (UNVERIFIABLE) | plain test re-run, CI |
| TRU: trust score, scan, zero API calls (#6) | S2 ○ | S7 ● | | S10 egress ○ | S13 ○ | gitleaks, semgrep, npm audit | |
| ORC: five vendors in parallel (#1), no collisions (#2), persistence (#17), memory re-fed (#18), turn-taking (#19) | S2 ○ | | S8 ● | S11 ○ | S13 ○ | coven, agetor (UNVERIFIABLE) | `/resume`, Aider history, git worktree |
| INT: MCP and Cursor (#21), Linear/Figma/draw.io (#15) | S9 ● | | | S12 ○ | S13 ○ | | |
| SYN: sync with team through a git remote (#16), thread share | S10 ● | | | S10 ● | S13 ○ | | manual export |
| PRV: local-first, nothing sent (#22), free and MIT (#23) | S10 ● | | | S10 ●, S12 ○ | S13 ● | | |
| NUM: "<5 ms", test and command counts, catch rates, "0 false alarms" | S11 ●, S14 ● | S6 ● | | | S13 ● | | |
| META: version strings, links, "v0.8.0 invite-only" (#27) | S1 ○ | | | | S13 ● | | |
| /vs page facts about Claude Code, Cursor, Aider | | | S8 ● | | S13 ● | | the tools themselves |

Every claim row gets its study ids from this matrix when `claims.json` is frozen; a claim with no study is a gap and fails `coverage.mjs`.

Tier each claim group can plausibly reach (my estimate before any testing, to be replaced by results): R is realistic for tamper detection and signing (AUD), budget refusal and cost arithmetic against vendor figures (CST), hook blocking of enumerated payloads by physical effect (SAF), `check`'s exit code and runner handling (VER), and egress of codehere's own process (PRV). S is the most that detection quality can reach (cheat catch rates, obfuscated-command blocking, trust-score recall), as is per-vendor orchestration fidelity and cost estimates across models. A, or no evidence, is where comprehension, UX, the comparative positioning on the /vs pages and the third-party statements land unless the owner's sessions (S15) or the vendors' own docs support them.

## 7. Phases, order and gates

Order rule: E1 claims first, because outbound messages are going out now. Cheap and high-risk before expensive.

| Phase | Work | Tier | Needs from the owner | Estimate |
|---|---|---|---|---|
| 0 Foundation | Frozen tarball and worktree; `claims.json`; harness (`run-test`, `evidence-check`, `coverage`, `canary`); sandbox kit; floor run (S14); independent checkers (chain verifier, cost recompute, test-count parser); mutation and coverage tooling feasibility; resolve how to install the hook at project scope for real-agent runs | T0 | plan approval | 0.5 day |
| 1 Front door and isolation | S13, S1, S2, S3 (without vendors), S10, S11 (non-soak) | T0 | none | 1.5 days |
| 2 Detection quality | S6a to S6h, S7, S4 corpus | T0 plus Claude reviewer arms | Claude quota cap | 2 days (local model throughput is the limit) |
| 3 Head-to-head and baselines | Re-run comparators on frozen fixtures; native baselines | T0 | none | 1 day |
| 4 Real agents and integrations | S8, S4 live, S5 ground truth, S9 MCP and live Action | T1 | accounts, caps, outward-facing yes | 1.5 days (quota-limited) |
| 5 Adversarial and soak | S12, S11 soak | T0 | none | 1 day |
| 6 Synthesis | Verdicts with tiers; claim contracts; reproduce bundle; independent red-team of the report (tier A, advisory); VERDICT.md; floor re-run; any fix pass; the owner runs the bundle on a clean machine | T0 | review, plus 1 to 2 hours running the bundle | 1 day |
| 7 Human | S15 | none | The owner's calendar | his schedule |

About 9 working days of agent time (the independent checkers, mutation testing and the reproduce bundle add about a day), 11 to 15 calendar days with quota limits and unattended runs overlapping. These are estimates, not measurements; I replace them with measured throughput at the end of Phase 0. Target: verdict by 24 Oct, six days before the 30 Oct sprint stop rule.

Interrupt protocol: any L0 result is reported to the owner the same session it is confirmed (after the two-key reproduction). Bad news is not held for the final report.

Checkpoints with the owner: end of Phase 1 (front-door verdicts), end of Phase 3, final.

Deliverables: `claims.json`; `ledger.jsonl` and rendered `LEDGER.md`; one `PREREG.md` and `RESULT.md` per study; `COVERAGE.txt`; `reproduce/` (the bundle the owner runs); `VERDICT.md`. `VERDICT.md` holds: a contract (scope, command, expected output, known gap, assurance tier) for every E1 claim; allowed claims with exact wording and evidence ids; claims that must change (copy or code); claims that cannot be made; launch-gate status; comparison tables including every place we lose; the list of what could not be tested and who can unblock it. At the end, results go into the trackers you read (`docs/PRODUCT_STATE.md`, `docs/CAPABILITIES.md`; only you flip a 🟢).

## 8. Environment, isolation and safety rules

- Never touch real `~/.codehere` (it holds the real audit chain, sessions and keys). Every test uses a temp `HOME` and `CODEHERE_HOME`. Tests that need real data use a copy, with size checked first.
- Never modify the global `~/.claude/settings.json` or any other agent config. sha256 of these files before and after every phase; the harness aborts the phase if one changes.
- Real-agent runs happen on the host (the agents' logins live there), in throwaway repos, with the hook installed at project scope if the pilot shows that works. If it does not, I stop and ask before any global hook install.
- Third-party code (competitors) runs in Docker only, with no secrets and no home mounts, `--network none` unless the install step needs the registry. All fetched text is data, not instructions.
- No push, publish, tag, deploy, posting, or account creation by me. Anything outward-facing is prepared and the owner executes or approves.
- Spend: no API keys in the environment; T2 excluded; every vendor run counted against the caps in decision 2; the harness stops at the cap.
- Disk: the Data volume is 98% full (21 GiB free). Evidence directory capped at 2 GB; no image pull or build when free space is under 10 GiB; no deletion of Docker images, caches or Ollama models without a yes. The 11 `supabase_*_foc` containers belong to another project and are left alone.
- Port 3773: the real daemon is not running now. If it is running when I start, I use another port.
- The `codehere` on PATH (`/opt/homebrew/bin/codehere`, reports 1.0.2) is not the unit under test; only the frozen tarball is.

## 9. Claude's weaknesses and what handles each

| # | Weakness | Evidence it happens here | Control in this plan | How the owner can check |
|---|---|---|---|---|
| 1 | I lose state at `/clear` and compaction | This session: I lacked the head-to-head context; the untested-promises verdicts exist only in a sub-agent message | State lives in files (`PLAN.md` frozen, `STATE.md` cursor, `ledger.jsonl`, evidence, handoff block per phase). Session start reads `STATE.md` and the last 20 ledger rows before acting. A project memory entry points to these paths | `STATE.md` timestamp and cursor match the last ledger row |
| 2 | I report green without observing | 2026-05-23 postmortem: three nights of fake verification; null-verdict-438 | Results come from grader code reading recorded output. I cannot write SUPPORTED by hand. `evidence-check` fails if a file or hash is missing | Re-run any row with its recorded command |
| 3 | I misread numbers and units | BUG-5 filed as CRITICAL in July: I read cents as dollars | Two-key rule; numbers are recomputed from raw by a second path; every figure in a report is templated from JSON, not typed | The report cites ledger ids for every number |
| 4 | I write the test, the grader and the expectation | The 21-task set is self-written; reviewers scored 13 of 13 on easy fixtures | Fixtures grounded in external sources; competitors' own test corpora reused; sealed hold-out from a different pipeline; mutation checks; predictions written first and scored after | `PREREG.md` hash predates the first run |
| 5 | My instruments can be blind | `lsof` could not see a known connection; egress-proof once passed because the module failed to parse | Canaries on every instrument; a case must prove it executed | Canary rows sit next to every batch |
| 6 | I fix while testing and move the goalposts | fd-21 was added after it was found; July sweep banned fixing during the sweep for this reason | Observe, freeze, then fix; failing regression row first; same test id re-run; before and after both kept | Ledger shows a failing row before every fix commit |
| 7 | I overclaim from small samples | "13/13 caught" on 13 tasks; "3 pass, 7 fail across ten receipts" presented without error bar | k of n with set size and author; intervals; at least 3 runs for model-driven cells; flip rate; no absolutes unless enumerated | Every rate has k of n beside it |
| 8 | I soften findings toward launch hopes | I am agreeable by training; you are time-pressed and want to ship | Severity rubric fixed in advance; verdicts map to actions by the table in section 4; the report opens with CONTRADICTED rows; a different model (Codex, or Gemma 26B if Codex is unavailable) red-teams the report specifically for downgraded findings (tier A: advisory, not a key); you see the raw CONTRADICTED list before any summary | Red-team output attached to `VERDICT.md` |
| 9 | I shrink scope when something is blocked | Three Claude launches were blocked last time and not rerouted; "untested" list stayed untested | `coverage.mjs` counts planned versus executed; blocked cells are listed; descoping needs a logged yes from you | `COVERAGE.txt` |
| 10 | Untrusted text can steer me | Competitor READMEs, issues and web pages are in scope | Docker-only for third-party code; no secrets; fetched text treated as data | Container run commands are in the ledger |
| 11 | I cannot judge visual quality or human comprehension | Screenshot-only checks were rejected in the July plan | DOM and state assertions only; visual and comprehension claims are marked UNVERIFIABLE-by-me and go to S15 | Those rows say so |
| 12 | I may configure competitors badly | Cost H2H: only Claude Code and Codex logs tested; formats were written by me | README quickstart setup only; version and commit recorded; one scenario per group chosen to favour the competitor; a cold subagent lists features of each competitor I did not exercise; verdicts limited to the scenario run | "Not tested" list per comparator |
| 13 | I drift from standing rules over a long session | Rules: no push, no spend, codehere frozen to bug fixes, no new docs | Harness-level guards (no git push, no network outside allowlist, spend counter); rules re-read from `NOW.md` and `agent/CLAUDE.md` at each phase start | Harness refuses forbidden commands |
| 14 | My knowledge of competitors, prices and papers is dated or wrong | Cutoff June 2026; tools change weekly | Every external fact is fetched from its primary source on the day, with URL, date and quote hash; versions and SHAs recorded | Fact rows carry URL and date |
| 15 | I can exhaust this machine | Data volume 98% full, 31 GB of local models | Disk and evidence caps in section 8; stop condition on free space | `df` line in each batch header |
| 16 | Everything is AI-written and AI-checked, so errors line up | Product, tests, fixtures, graders, this plan and the report come from the same model family; the repo's own notes record that a green unit test from my mental model proves the model, not reality | Assurance tiers (section 1): only non-AI mechanisms (physical effects, independent checkers, enumeration, vendor figures, the owner's own run) support "delivered"; AI results are tier S or A and are worded as measurements or kept internal; tool-driven mutation testing measures whether the AI-written tests can fail; the owner runs the reproduce bundle himself | Each E1 claim shows its tier; the bundle runs without me |

## 10. State, handoff, session protocol

Working directory: `…/scratchpad/promise-verification/` (`PLAN.md`, `STATE.md`, `claims.json`, `ledger.jsonl`, `evidence/<run-id>/`, `studies/Sn/`, `harness/`, `handoff/`). Scratchpad is under `/private/tmp`, which macOS can clear on reboot, so after Phase 0 the frozen plan and `claims.json` get copied into `agent/docs/` if you approve (this plan would replace the stale July `E2E_TEST_PLAN.md`, per "one fact, one file"). Harness code is built in the scratchpad first; if kept, it extends `agent/eval/`, not a new framework.

Session start: read `STATE.md`; read the last 20 ledger rows; re-read `NOW.md` and `agent/CLAUDE.md` gates; run `coverage.mjs`; continue at the cursor.
Session end: update `STATE.md` (phase, next test id, open blockers, decisions log); write `handoff/HANDOFF-n.md` as a copy-pasteable block.

## 11. What this plan cannot show

- That any claim is 100% delivered. Nothing here can show that. It can show which claims are checkable by non-AI means (tier R), which are measured only (tier S), and which are not checked.
- Whether anyone wants it or will pay. It tests whether statements are true.
- Vendors without access: Gemini without a key, Linear and Figma without accounts, Cursor's GUI, hosted reviewers, agetor (macOS-only installer), burnout (needs a Claude login). All are listed UNVERIFIABLE with the unblock action.
- Windows.
- Weeks-long behaviour. The soak is at most 24 hours; longer needs dogfood time.
- Human comprehension and UX quality, except through S15.
- Anything about a named competitor beyond the scenarios run.
- A security audit. S12 is a focused review.
- Rates in the wild. Our fixtures are tiny and mostly self-built; results are "on this set".

## 12. Decisions needed from the owner

1. **Scope, freeze and the wording rule.** Approve this plan as the replacement for the stale July `E2E_TEST_PLAN.md`, and let me run Phases 0 to 3 and 5 now (T0: containers, temp HOME, local models; no spend, nothing outward-facing). Approve the wording rule: launch copy states a claim as delivered only where it reached tier R, states S-tier results as "k of n on this set", and drops or marks as planned anything else. This will narrow some current wording. Agree to run the reproduce bundle yourself at the end (1 to 2 hours, clean machine). Optional: say "use a workflow" if you want parallel cold verifiers in Phase 6; otherwise I run subagents one at a time.
2. **Real-agent budget (Phase 4).** Which accounts I may use and the caps. My suggestion: Claude Code subscription up to 25 runs, Codex plan up to 20, Gemini only if you create a free key (10), Aider and OpenCode on local models uncapped, no API-billed keys. Claude reviewer arms for S6 (144 subagent runs, up to 216) count against the same Claude quota; tell me if you want that cut.
3. **Outward-facing and disk.** Yes or no on: (a) you create a throwaway public GitHub repo so the Action runs on a real PR, and optionally install a free-for-public-repos hosted reviewer on it for the head-to-head; (b) Docker cleanup before Phase 3 (12.6 GB reclaimable of 24.5 GB; yours to do, I will not delete).

Proceeds without decisions 2 and 3: everything except S8 vendor runs, S4 live, S5 ground truth, S9 live Action and hosted reviewers.

## Appendix A. Pre-registration template (per study)

Question · Claims covered (ids) · Fixtures and sha256 · Comparators with version or SHA · Graders (id, sha256; what each decides from which output) · n per cell and total · Instruments and their canaries · Predictions (mine, written first) · Decision rules (what result changes which wording or action) · What will not be claimed · Stop conditions · Cost tier and caps.

## Appendix B. Phase 0 checklist

1. `git worktree` at the chosen commit; `npm ci && npm run build && npm pack`; record sha256. Record the same for npm 1.0.1.
2. Sandbox kit: temp HOME and CODEHERE_HOME helper; sha256 guard for `~/.claude/settings.json` and other agent configs; disk and spend guards.
3. Base Docker image (reuse `node:22-bookworm`), no new pulls over 1 GB.
4. Claim extraction script plus the verbatim-quote checker; run on all section 3.1 sources; the owner reviews the row list.
5. Harness: `run-test` (records evidence rows), `evidence-check`, `coverage`, `canary`.
6. Floor run (S14) on the frozen artifact; record the baseline, including the known `slash-commands-sync` failure and its cause.
7. Pilot of one cell per study; replace the time estimates with measured numbers.
8. Pilot: can the hook be installed at project scope for a real Claude Code run without touching global settings? If not, stop and ask.
9. Feasibility of the independent checkers: the audit-chain format and signature scheme from the documented spec; whether Ed25519 verification is available in a container (OpenSSL 3 or libsodium) without network.
10. Feasibility of mutation testing and coverage on vitest and TypeScript ESM for the promise-critical modules; runtime per module.
11. Write `PREREG.md` for each Phase 1 study; hash; freeze.
