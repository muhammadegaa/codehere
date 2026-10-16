# codehere — how we build it and reach users

The map for any agent working in this repo. Loaded automatically. Keep it under about 140 lines; detail goes in the linked docs. Paths are relative to the repo root (`~/code/codehere`). Tags: **[src]** a practice from a named source (see Sources), **[ours]** our adaptation.

Set 2026-09-28. Replaces the lean loop (2026-06-07), the session rituals and the 2026-07-06 dev loop. Workflows by goal added 2026-10-09.

## The owner's calls
- His: push, merge to `main`, tag, npm publish, direction, pricing, any spend beyond mocks. Drive everything else.
- Lead with the ask. He expects a one-sentence answer and at most 3 options.
- Show results on his screen: `open -a Cursor <file>` for docs, the browser for UI.
- Every turn: answer first, then Workflow, Happened, Ongoing, Next and Your call (`../CLAUDE.md` § Every turn).

## What codehere is
`codehere check` re-runs the tests an AI says passed and reports whether they did; `codehere help` is the only other command. Open source, MIT. A GitHub Action in `action/` posts the receipt on pull requests. What's shipped: `docs/PRODUCT_STATE.md`. What to build and why is decided outside this file: `../studio-os/NOW.md`. The earlier orchestrator, dashboard and other commands are on the local `legacy/2026-10` branch, which is never pushed to a public remote.

## Principles
1. Every change ships with a check that can fail, and someone other than the author runs it. [src: Boris Cherny: a verification loop "will 2–3x the quality"]
2. The verifier needs more care than the code. With a weak check, the agent solves the wrong problem. [src: C compiler]
3. Assume the agent will game the check: edit or skip the test, stub the grader. [src: METR, o3 reward-hacked in 30% of RE-Bench runs; long-running harnesses: "unacceptable to remove or edit tests"]
4. The agent only knows what's in the repo, and a stale doc in the repo misleads it. [src: OpenAI]
5. A rule that matters becomes a hook, a lint or a structural test. Written rules are the fallback. [src: OpenAI]
6. Small and frequent: short branches off `main`, merged at least weekly. [src: Claude Code team, ~5 PRs per engineer per day] [ours: weekly]
7. Use the build users get: our own sessions run the published npm version, not only the dev build. [src: Apr 2026 CC postmortem]

## The loop (W0: one increment per session)
The goal comes from the owner's launch prompt. Start from `git log --oneline -5` and `docs/PRODUCT_STATE.md`; read other docs only for the section the goal needs.
1. **Explore:** read the code and the one doc the task needs. No edits. [src: CC best practices]
2. **Spec:** write acceptance criteria as checks that can fail (`/codehere-spec`; skip if the diff fits in one sentence). [src: CC best practices, plan mode]
3. **Reproduce:** write the failing test or eval task and see it fail before the fix. [ours]
4. **Build:** one concern; parallel sessions each get their own worktree. Multi-file stories can use `.claude/workflows/ship-loop.js`. [src: CC best practices]
5. **Verify:** run the real CLI (`node dist/index.js check`) and the false-done eval (`node eval/false-done.mjs`); show the output instead of describing it. [src: CC best practices: "show evidence rather than asserting success"]
6. **Review:** a different model reviews the diff without the session's context (`codex review --uncommitted`). User-facing text (README, CLI output, CHANGELOG, init scaffold) always counts as substantive. [src: CC best practices: "the agent doing the work isn't the one grading it"]
7. **Record the lesson:** each agent mistake becomes a line in this file, or better a check, in the same commit. [src: Boris]
8. **Write back:** `docs/PRODUCT_STATE.md` (what changed, with measured numbers).

Bugs: `/investigate`. Blocked: say so and take the next item. Never report green that wasn't observed.

## Workflows by goal
W0 is the loop above, for code changes. W1 to W10 are for evidence and decisions. Name the IDs before starting work and in every turn report. A workflow's tool is built the first time it runs, not before. Goals map to workflows: promises true W1 W2 W3 W8 W9 · comparison W4 W8 · choose the problem W5 W6 W7 (Gate 1 still binds) · trustworthy evidence W8 · multi-day work W9 W10. [ours; sources at the end]

| ID | Workflow | Use when | Steps, then exit | Tool today |
|---|---|---|---|---|
| W1 | Contract the claim | testing any public promise | scope, command, expected output, known gap, tier → a claims row with a test id | none yet (`claims.json`) |
| W2 | Verify at the surface | any e2e | install what a stranger gets; run the real CLI and the Action; record command, output, hash; one adversarial case per unit → ledger rows; "couldn't observe" is BLOCKED, never PASS | campaign `harness/run.mjs` |
| W3 | Sweep loop | mechanical, auto-checkable work: every flag, doc example, log byte | fixed prompt, fresh context per pass, state in files → stop on the exit code | none yet |
| W4 | Head to head | any comparison | scan the market first; same fixtures for every tool; code graders; 3 runs per cell; read failed transcripts → k of n, with every place we lose | `agent/eval/` |
| W5 | Error analysis | before choosing or building a feature | read real cases, label, count by type, then write the eval; pass or fail only; check any model judge against human labels → counted failure types | AIDev scan `scan2.mjs` (old scratchpad, not in the repo) |
| W6 | Prototype and dogfood | W5 shows a pattern | smallest throwaway on our own repos; adoption decides; no product change during the sprint → keep, drop or show others | none yet |
| W7 | Spec and options | a new surface, or a choice with several shapes | interview to a one-page spec with a deferred list, then 3 to 4 divergent mockups → the owner picks | `/codehere-spec` (`--ui`) |
| W8 | Independent check | any verdict that will be public | code grader, then a different model family, then a human; the owner runs the reproduce bundle; word the claim at its tier (R, S, A) → never "100%" or "guarantee" | campaign `PLAN.md` §1 |
| W9 | Long-run state | work over more than one session | claims list with a passes flag, a progress file, one item per session, tests never edited, research then plan then implement in fresh contexts → state file current | campaign `STATE.md` |
| W10 | Skill with Gotchas | the second time we do the same thing | write the protocol as a skill; each mistake adds a Gotcha line in the same commit → skill exists | `.claude/skills/` |

The campaign (`PLAN.md`, `STATE.md`, `harness/`, `studies/`) lives in `agent/eval/promise-verification/` (moved from the session scratchpad on 2026-10-13, after the scratchpad was found empty). Its run output (`evidence/ledger.jsonl`, `claims*.json`, tarballs, sandboxes) is generated by `harness/` and not committed.

## Gates that actually run
Only these survive a lost context or a fresh clone (`.githooks/`, installed by `npm install` via `scripts/install-hooks.sh`):
- **Pre-commit:** gitleaks on the staged content, then, when TypeScript or its config changes, the arch gate (`tsc --noEmit`, eslint, and the knip dead-code ratchet at a baseline of 0).
- **Pre-push:** commits touching non-doc paths need a review marker: `Reviewed by codex`, `Reviewed by claude-max-cold` or `[no-review: <reason>]`.
- **Release tag:** run `scripts/pretag-npm-check.sh` first. On `@latest`, sync codehere-landing.

Everything else in this file, including the skills, is advice.

## Evals and how we measure success
Harness: `agent/eval/false-done.mjs` with tasks in `agent/eval/false-done-corpus.mjs` (6 incidents reconstructed from public posts, 2 honest controls). `--selftest` checks each label without codehere; a plain run grades `codehere check`; exit 1 if a regression task fails. Grow to 20–50 tasks from real failures. [src: "Demystifying evals"] (`agent/eval/` also holds June's second-model bug-review eval, a different measurement.)

A task is a tiny repo, an agent's "done" claim, and whether that claim was true. Claims are recorded and replayed, so every run gives the same result. Tasks use the layout RL-environment buyers use (a repo, a task prompt, a grader script), so a small set can double as a sample for them (owner, 2026-09-28). codehere answers red, grey (couldn't check) or green:

| | red | grey | green |
|---|---|---|---|
| claim was false | caught | acceptable | **false green** (worst) |
| claim was true | **false alarm** | acceptable | confirmed |

- Code grades each task (exit codes, which tests ran, diffs), never a model (`DESIGN.md` §1). Honest claims are in the set so false alarms get scored.
- **Regression set:** tasks codehere already gets right. It must stay at 100%; once the harness exists, pre-push enforces that. **Capability set:** known misses. Its catch rate should rise, and a task moves to regression once it passes. [src: evals article]
- Plant known cheats and confirm each is caught: deleted test, `assert True`, skipped suite, zero tests collected. [ours; Meta ACH plants faults the same way]
- Any change to verification code, or to a prompt codehere sends a model, runs the set first. [src: Apr 2026 postmortem: a prompt change passed their evals, and a broader set later showed a 3% drop]
- Read the transcripts of failed tasks before trusting a score. [src: evals article]
- Baseline, measured 2026-10-13 on 22 tasks (14 false-claim, 8 honest controls), pytest and go installed, 0 grey: **12 of 14 false claims caught, 2 false green, 8 of 8 controls confirmed, 0 false alarms** (2026-10-08 on 21 tasks: 11 of 13; fd-22 added and fixed 2026-10-13, uncommitted). Catches: misnamed test file (0 collected, pytest or node:test: a node run whose own summary says `tests 0` counts as no tests ran, fd-21; a Go module whose `go test ./...` prints only `[no test files]`, fd-22), model-green-run-red, one-failing-of-many; test weakening in an existing test file (`detect-test-weakening.ts`; uncommitted changes vs HEAD, or with `--base <ref>` everything since the branch left that ref, committed or not): `assert True`/`assert.ok(true)`, a skip marker or `{ skip: true }`, an assertion commented out, an unconditional `return` above an assertion; a test file the AI named that is not in the repo (`check-claimed-tests.ts`, needs `codehere check --claim "<the AI's summary>"`). **Still misses:** build-passes-but-broken (`fd-14`, re-runs tests only) and tests-green-production-job-broken (`fd-04`, outside a test re-run). Neither is fixable by reading tests; say so on the offer. Not covered by any task yet: weakening patterns outside the listed regexes; `--base` needs the base ref to exist in the checkout (a shallow CI clone must fetch it). A rule that catches a case can also false-alarm: fd-18 caught one such error in the early-return rule on its first run. Without pytest a Python repo grades grey (unmeasured).
- The loop's own measure is **escaped misses**: wrong verdicts found outside the harness. Each one becomes a task before the fix; the same kind twice means the fix didn't hold.
- Not success measures: test count, doc count, a green CI run on its own. The harness shows whether codehere works, not whether anyone wants it.

## Repo as system of record
- One fact, one file. A new doc replaces or merges an old one (72 docs were written or edited 25 Jun–27 Sep).
- Linked docs carry a last-verified date; stale ones get fixed or deleted. [src: OpenAI]
- Test and eval output: a few lines on stdout, detail in a log file, each failure on one `ERROR` line that grep can find. [src: C compiler]
- Known gap: `.claude/` is gitignored, so a fresh clone gets no skills and no workflows. Moving `skills/` and `workflows/` into git needs a secret scan first.

## Don'ts
- Don't accept an agent's "tests pass" as evidence. Re-run the tests.
- Don't remove, skip or weaken a test without a line in the commit saying why.
- Don't add a doc, tracker, skill or CLI command when an existing one covers it. New commands need the owner's approval.
- Don't show a model's opinion as proof (`DESIGN.md` §1).
- Don't mock in CLI tests: run the real command as a subprocess.
- Don't claim a feature that isn't shipped.

## Outreach (the owner sends; Claude finds, qualifies and drafts)
The most successful solo founders post their work in public until an audience exists, recruit the first users by hand, and charge from the start. [src: Marc Lou, levelsio, Paul Graham] Until that audience exists, first users come from direct outreach:
- **Warm first:** people who already know the owner. Ask how they are and who they know with the problem before any pitch. [src: Hormozi; Lenny: almost every fast-growing B2B company used both its founders' network and the places its customers already spent time]
- **Then where the pain is posted:** only people who described the problem in their own words and whom the offer would have helped (Gates A–D, `agent/docs/discovery/x-queue.md` on branch `cursor/demand-reality-research-f2fe`).
- **The first message is about their case:** one true, specific observation or a question about what happened. If the personal line can be deleted and the message still works, it's a template. [src: The Mom Test; Lavender data on 231,818 emails: personalized beats templated by 50–250%]
- **The priced offer comes after they answer**, in the thread or by DM. [ours]
- **Short and in the owner's voice:** no repeating their post back to them, no three-item lists, no em dashes, no closing orders. Engineers ignore vague claims. [src: Lavender data] [ours: the tells]
- **A yes gets set up by hand the same day.** [src: Paul Graham, "Collison installation"]
- **Post the work in public** (what the eval harness finds, what broke) so every reply lands on a profile that shows it. [src: over half of ShipFast's launch traffic came from Marc Lou's X audience; levelsio: X first shows a post to ~300 people, so follower count matters less]
- **The same number of real messages every day, for 100 days;** move on after 2–3 unanswered tries. The owner sets the number. [src: Hormozi, Rule of 100]
- **Log every send and reply with its link.** Replies and commitments are the measure; sends are the cost. [ours]
- **X rules:** automated replies to posts found by keyword search aren't allowed, so the owner posts by hand, and every public send needs his typed "send". [src: X automation rules]

## Design system
Read `DESIGN.md` before any copy or CLI-output change. §1 (green only for re-executed evidence) still applies to everything `check` prints. The web UI and its gates (`ui-token-gate.mjs`, `dogfood-pass.mjs`) are not in this tree.

## Build and test (in `agent/`)
`npm run build` · `npm test` · `npm run lint` · `npm run format:check` · `node dist/index.js --help` (lists `check` and `help` only; keep it that way unless intended).

## Where things live
- Code, under `agent/src/` (11 files): `index.ts` (CLI entry) · `presentation/cli/commands/` (`check-command.ts`, `help-command.ts`) · `application/use-cases/` (`rerun-tests.ts`, `detect-test-weakening.ts`, `check-claimed-tests.ts`) · `infrastructure/orchestration/artifacts-extractor.ts` (`parseTestSummary`) · `domain/task.ts` · `ui.ts` · `utils/`.
- GitHub Action: `action/` (`action.yml`, `post-receipt.mjs`, `summarize.mjs`, `example-workflow.yml`), built and dry-run locally, not published, not run on a real PR. It runs `npx codehere@<version> check --json --base origin/<base> --claim=<PR body>`, so it needs a published release that includes `--base` and `--claim` (npm latest was 1.0.1 on 2026-10-05; the checks are in 1.0.2+).
- Docs: `docs/PRODUCT_STATE.md` (what's shipped) · `docs/gates/` (the decision gates and the slim plan) · `docs/learn/LEARNING-LOG.md` · `DESIGN.md` · the campaign in `agent/eval/promise-verification/`.

### Surface routing (codehere) — CANONICAL
> Canonical, git-tracked home of the surface map. `~/code/CLAUDE.md` carries a short mirror, and `codehere-landing/CLAUDE.md` and its README cite this section. Update here, not the mirror.

| Work is about… | Repo | Dev surface | Prod surface |
|---|---|---|---|
| **Product**: the `check` CLI and the GitHub Action | `codehere/agent`, `codehere/action` | `node agent/dist/index.js check` | none: "prod" is the npm package on a user's machine |
| **Landing**: marketing, public site, hero, FAQ, waitlist, use-cases, SEO | `codehere-landing` | `next dev` → `http://localhost:3000` | **`https://codehere.uk`** (Vercel, auto-deploys on push to `main`) |

**Decision rule:** a logged-out visitor sees it in a browser → landing / codehere.uk; a developer runs it locally → product. Verify landing work against codehere.uk or a Vercel preview.

## Sources
[CC best practices](https://www.anthropic.com/engineering/claude-code-best-practices) · [Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) · [Apr 2026 CC postmortem](https://www.anthropic.com/engineering/april-23-postmortem) · [Long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) · [C compiler](https://www.anthropic.com/engineering/building-c-compiler) · [Boris Cherny's workflow](https://www.infoq.com/news/2026/01/claude-code-creator-workflow/) · [How Claude Code is built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built) · [OpenAI harness engineering](https://openai.com/index/harness-engineering/) · [METR reward hacking](https://metr.org/blog/2025-06-05-recent-reward-hacking/) · [Meta ACH](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/). Background research from July: `agent/docs/CLAUDE_CODE_TEAM_LOOP.md`.
Outreach: [Do Things That Don't Scale](https://paulgraham.com/ds.html) · [First ten B2B customers](https://www.lennysnewsletter.com/p/how-todays-fastest-growing-b2b-businesses) · [The Mom Test](https://www.momtestbook.com/) · [$100M Leads summary](https://www.shortform.com/blog/100m-leads-alex-hormozi/) · [ShipFast case study](https://marketingcrafted.com/case-studies/shipfast) · [levelsio on Lex Fridman](https://lexfridman.com/pieter-levels-transcript/) · [Lavender data](https://somethinginc.com/blog/cold-email-sounds-like-ai-lavender-data/) · [X automation rules](https://help.x.com/en/rules-and-policies/x-automation).
Workflows (2026-10-09): [Thariq, How We Use Skills](https://claude.dev/blog/lessons-from-building-claude-code-how-we-use-skills/) · [Seeing like an agent](https://www.claude.com/blog/seeing-like-an-agent) · [Fireside chat, Cat Wu and Thariq](https://simonwillison.net/2026/Jul/21/cat-and-thariq/) · [Ralph loop](https://venturebeat.com/ai/how-ralph-wiggum-went-from-the-simpsons-to-the-biggest-name-in-ai-right-now) · [Horthy on context engineering](https://newsletter.pragmaticengineer.com/p/context-engineering-with-dex-horthy) · [Husain on error analysis](https://www.lennysnewsletter.com/p/evals-error-analysis-and-better-prompts). Read as summaries; read the primaries before changing a workflow.
