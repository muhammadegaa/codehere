# Changelog

All notable changes to Codehere will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 – The team record

**Release Date:** 2026-07-02

Your team's AI coding agents, one shared record you own.

### The record
- **One signed record per team.** Every member's agents (Claude Code, Codex, Aider, Gemini, OpenCode) write into a shared record, synced through a git repo you control. No cloud service. What each agent did, file by file, and what it cost.
- **Tamper-evident by default.** Each machine cryptographically signs its share (ed25519), so edits are detectable. A share that was altered, re-signed with a different key, or doesn't add up against the recorded totals is called out, not silently accepted.
- **Cost across every agent and machine.** Per agent, per project, per machine, per day. An estimate built from recorded tokens and rates, never a guess. `codehere team budget <amount>` sets the line you watch.
- **Agent-native first.** The full record is queryable from the terminal (`codehere team`, `codehere budget`) and by your agents over MCP (`codehere_spend`, `codehere_team`, `codehere_audit`). The dashboard renders the same record for whoever runs the team.

### The dashboard, redesigned
- The room reads as a conversation: the ask, what the agent actually did step by step, and its report. Internal tool ids and raw permission errors are rewritten into plain language on the summary line; the raw evidence stays one click or hover away.
- Steps say what happened ("+59 lines · change applied", "18 of 18 passed"), not just how long they took.
- Re-runs of the same task fold into one thread with a runs strip; cross-agent hand-offs are marked where the baton changes hands.
- Honest states everywhere: nothing renders a green check without verified state behind it. Agent readiness now distinguishes installed from actually able to run (an expired or retired login shows "needs auth" with the fix named, instead of a false "ready").
- Wide screens get a real working column; the composer sits under the content it feeds.

### Verified before it shipped
- The whole surface is probed by 15 honesty checks (each one fails when the UI shows state it can't prove) plus per-feature coverage on `/verify`, recorded to a watchable replay. An independent cold review (Claude in a fresh context, standing in for the usual cross-vendor seat) found 10 issues in the batch; all 10 were fixed before this release. Ships with 1709 tests green.

## 0.2.0 – Safety-First AI Coding Agent

**Release Date:** 2026-04-14

### Highlights

- **Complete security scanner rewrite**: 60+ patterns covering SQL injection, XSS, SSRF, path traversal, command injection, weak crypto, JWT bypass, hardcoded secrets, open redirect, eval injection
- **PreToolUse hook**: Intercepts every Claude Code tool call (Bash, Edit, Write, MultiEdit, NotebookEdit) before execution
- **LLM provider switch**: Migrated from Cohere to Anthropic Claude Sonnet via direct fetch
- **Fix command**: AI-powered code fixes with before/after security comparison (won't introduce new vulnerabilities)
- **CI gate**: `codehere trust --ci` exits 1 on critical findings or score < 60
- **Report command**: Generates shareable markdown security audit reports with badge support
- **Three-pass SAST scanning**: Pass 1 (raw for secrets/XSS), Pass 2 (stripped for structural), Pass 3 (hook patterns)

### Fixed

- Fix command no longer blocks itself when fixing security vulnerabilities
- Policy-as-Code bypass for pre-existing vulnerabilities (edit didn't add them)
- SAST fallback path uses before/after comparison
- Orchestrate "Missing required parameter: query" for review sub-plans
- CI exit code no longer swallowed by Commander.js async handlers
- `[object Object]` no longer printed after fix command output
- `--diff` and directory scans now skip `.codehere/` and `.codehere-cache/` directories
- Grammar: "needs" singular/plural in report output
- **Health command**: now checks all API providers (Anthropic/OpenAI/Cohere/OpenRouter), not just COHERE_API_KEY
- **MCP server version**: changed from 0.5.0 to 0.2.0 in initialize and health endpoints
- **`--help`**: shows 13 core commands (was 35+), `help --all` for everything
- **Global `--review` option**: removed from root program (only on specific commands)
- **Duplicate description**: removed from `--help` output
- **Disclaimer wall**: removed "AI Assistant Notice" block from ask command
- **Safety note**: removed "AI output may be inaccurate" from ask output
- **"Cost router" jargon**: removed from trust and status output
- **"orchestrate"/"Cohere" references**: removed from no-args quick start
- **Raw markdown in output**: `**bold**`, `### headers`, `` `code` `` now rendered as terminal formatting (bold, colored headers, cyan code) across smart command, ask, explain, and REPL
- **REPL plain language routing**: "this project" and "what is this doing" now route to AI (was: "Not found" error)
- **REPL `/exi`**: fuzzy matches to `/exit` instead of "Unknown"
- **Smart command**: removed heavy `═══` banner, redundant query echo, summary table with escape codes — now compact `codehere ▸ query` + answer + timing
- **Help command**: replaced `═══` separators and table borders with clean plain text layout
- **Intelligent router**: only routes to explain/edit when explicit file path found in query — all other queries default to ask (LLM answers)

### Added

- 11 new scanner patterns: XSS (template + concat), SSRF, path traversal (x2), command injection, weak crypto (MD5, SHA1), JWT none algorithm
- `scanRaw` flag for patterns that need to match on unstripped code (Pass 1)
- Cost router with tier-based API routing (~83% savings)
- Product brain context for trust recommendations
- MCP server mode (`codehere serve`)
- **`formatMarkdownForTerminal()`** in `stream-markdown.ts` — renders markdown to terminal formatting (bold, cyan code, headers, bullets, code blocks with `┌/│/└` borders)
- **Full REPL command palette**: 27 commands (was 8) — ask, explain, fix, review, plan, suggest, test, docs, refactor, orchestrate, run, git-review, trust, report, hook, status, health, index, serve, setup, config, cost, models, undo, help, clear, exit
- **Dynamic palette height**: caps to terminal rows with `... +N more (type to filter)` overflow indicator
- **Bare command names in REPL**: `trust .`, `status`, `explain src/auth.js` work without `/` prefix
- **`/health`**: runs health check in REPL
- **`/setup`**: runs setup wizard in REPL
- **`/suggest`**, `/docs`, `/orchestrate`, `/run`, `/git-review`, `/serve`, `/config`, `/cost`, `/models`, `/undo`: all accessible from REPL

---

## 0.1.1 – Task System & CLI Commands (npm)

**Status:** Published to npm

### Fixed

- **Per-repo embeddings database**: Fixed critical bug where embeddings were stored in a global database, causing cross-repo contamination in search results
  - Each codebase now has its own `.codehere-cache/embeddings.sqlite` database
  - Repo root detection based on git/package.json or current directory
  - Full isolation: queries in one repo cannot return context from another
  - Integration test added to verify multi-repo isolation

### Added

- **Task System**:
  - `CodehereTask` domain entity with task lifecycle management
  - JSONL-based task storage in `.codehere/tasks.jsonl`
  - Task repository and helper functions for task creation/updates

- **Environment Mode & Risk Tier**:
  - Environment mode awareness (`LOCAL`, `ORG`, `INTERNET`) - advisory only
  - Risk tier detection (`T1`, `T2`, `T3`) based on file patterns - advisory warnings only

- **New CLI Commands**:
  - `codehere suggest` - Read-only assistant mode for Q&A with task tracking
  - `codehere run` - Unified agentic execution with task-driven workflow and env/risk advisory
  - `codehere review` - Task review and approval interface

- **Infrastructure Modules**:
  - Conversation context and session management
  - Progress indicators, syntax highlighting, review checkpoints
  - Validation helpers, trace summaries, agent feedback
  - Cache modules for query results, responses, and security scans
  - Shell completion scripts (bash, zsh, fish)

### Improved

- **CLI UX improvements**:
  - `setup` command now shows clear message when run in non-interactive environment
  - `index` command shows progress feedback ("Indexing codebase..." and "Indexing complete")
  - `run` command displays explicit T3 risk warning with file list
  - Planning errors now show user-friendly messages instead of raw JSON parse errors
  - `review-file` output is structured with "Review: <file>" and "Findings:" sections
  - `ask` and `suggest` commands now detect missing embeddings and prompt user to run `codehere index`
  - `health` command uses per-repo database path and treats missing embeddings DB as a warning (non-fatal)

### Technical Details

- Task repository uses append-only JSONL format at `.codehere/tasks.jsonl`
- Risk tier detection uses rule-based approach from file patterns
- Environment mode read from `CODEHERE_ENV_MODE` environment variable
- All task system operations are non-blocking (silent failures)
- Embeddings stored per-repo at `<repo-root>/.codehere-cache/embeddings.sqlite`
- Missing embeddings detection: `ask` and `suggest` check for embeddings before execution and show clear guidance
- Health command uses per-repo database path and treats missing embeddings DB as a warning (non-fatal)
- Test framework fixes: removed unsupported `.timeout()` calls, fixed `expect().not.toBe()` usage

### Notes

- This is an **alpha version** - behavior and APIs may change
- Task system is additive and does not affect existing command behavior
- Existing commands remain fully backward compatible
- **Upgrading from older versions**: Users should re-run `codehere index` in each repo to create per-repo embeddings databases. The old global `agent/data/embeddings.sqlite` is no longer used for normal CLI operations.

---

## 0.4.0 – Provider abstraction & model freedom

**Release Date:** 2025-01-02

### Added

- **Multi-provider architecture**: Support for multiple AI providers through a clean abstraction layer
  - **Cohere** (default provider, backward compatible)
  - **OpenAI** (opt-in via `CODEHERE_AI_PROVIDER=openai`)
  - **Local LLM** (OpenAI-compatible endpoints like Ollama, LM Studio)
  - **Fake provider** (for testing and demos, `CODEHERE_FAKE_AI=1`)

- **Per-operation provider routing**: Route different operations (chat, embedding, rerank) to different providers
  - Internal operation-aware routing (Phase 4F)
  - User-facing config file support (Phase 4G)

- **Provider config files**: Optional `.codehere/providers.json` for fine-grained provider selection
  - Default path: `.codehere/providers.json` (auto-detected from codebase root)
  - Override path: `CODEHERE_PROVIDER_CONFIG_PATH` environment variable
  - Supports per-operation routing and default provider selection

- **Provider verification & smoke tests**: Automated testing for provider integration
  - `npm run smoke:cohere` - Live Cohere provider verification
  - `npm run smoke:openai` - Live OpenAI provider verification
  - Test matrix documentation (`docs/TEST_MATRIX_PROVIDERS.md`)

- **Provider documentation**:
  - `docs/PROVIDERS_QUICKSTART.md` - Quick setup guide for all providers
  - `docs/PROVIDER_ABSTRACTION.md` - Complete provider architecture documentation
  - `.codehere/providers.example.json` - Example config file template

### Changed

- **Provider selection precedence**:
  1. `CODEHERE_FAKE_AI=1` → FakeProvider (highest priority)
  2. Config file operation override (if present)
  3. Config file default provider (if set)
  4. Global provider env (`CODEHERE_AI_PROVIDER`)
  5. Registry default (Cohere)

- **Backward compatibility**: Default behavior unchanged - Cohere remains the default provider when no configuration is provided

### Technical Details

- **Provider layer architecture**:
  - `IModelProvider` interface for provider abstraction
  - `ProviderRegistry` for provider management
  - `ProviderAIService` adapter bridging providers to existing `IAIService`
  - `OperationProviderResolver` for operation-aware routing
  - `ProviderConfigLoader` for config file support

- **Capability-aware fallbacks**: Gracefully handles provider capability differences
  - Rerank: Falls back to original order if provider doesn't support rerank
  - Query embeddings: Falls back to regular embeddings if provider doesn't support separate query embeddings
  - Streaming: Falls back to non-streaming chat if provider doesn't support streaming

### Documentation

- Added comprehensive provider documentation
- Updated README with provider quickstart section
- Added provider examples and troubleshooting guides
- Test matrix documentation for provider coverage

---

## 0.3.0 – Reliability & Trust

**Release Date:** 2025-01-02

### Added

- **Validation Mode**: Review & approve changes before applying (`--review` flag)
- **Trust Scores**: Per-agent reliability metrics via `codehere status` and `npm run analyze:feedback`
- **AgentFeedback Logging**: Structured feedback capture in local JSONL format
- **CI Trust Gate**: Enforce minimum trust thresholds via `npm run check:trust`
- **JSON Exports**: Machine-readable output for CI/dashboards (`--json` flag)
- **Trace Summaries**: Structured summaries of every agent run
- **Trust Thresholds**: Configurable minimum trust per agent via `config/trust-config.json`
- **Command Autocompletion**: Bash/zsh/fish shell completion
- **Performance Optimizations**: Context compression, query caching, parallel execution

---


