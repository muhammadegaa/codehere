# Security policy

Codehere's hooks run inside Claude Code, Codex CLI and Copilot CLI: when the agent says it is finished, Codehere runs the test command you approved on your machine and reads the session's git diff. `codehere audit` reads your git history. A vulnerability in Codehere can make its report wrong, or run or read something you did not intend. Reports are welcome.

## Supported versions

Security fixes land on the latest released version of the `codehere` npm package.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.**

Contact: `security@codehere.uk`

Include:
- Affected version(s) and git commit (if reproducible against a specific commit)
- Minimal reproduction (steps or proof-of-concept code)
- Impact assessment (what does the vulnerability enable?)
- Your contact details (reporters are credited unless anonymity is requested)

## Response targets (best effort, one maintainer)

| Severity | Acknowledge | Patch target |
|---|---|---|
| Critical (CVSS ≥ 9.0) | 24 hours | 7 days |
| High (7.0 – 8.9) | 48 hours | 14 days |
| Medium (4.0 – 6.9) | 5 business days | 30 days |
| Low (< 4.0) | 10 business days | next release |

## Disclosure

- Coordinated disclosure: the fix ships before the details go public, with a reasonable embargo (typically 30 days for critical, 90 days for non-critical).
- Reporters are credited in the CHANGELOG entry for the release that fixes the issue, unless they ask not to be.
- There is no bug bounty.

## Scope

In scope:
- The `codehere` npm package, 2.0.0 and later: the code under `v2/`
- What arrives through git and can be hostile: team rules, lessons, help cards and a teammate's `.codehere/config.json`, which must never run a command you did not approve
- The `codehere check` package (1.x) and the GitHub Action in `action/` while 1.x is on npm

Out of scope (still worth reporting upstream):
- Vulnerabilities in upstream dependencies
- Attacks that need local privilege the attacker already has
- Code that the project's own test command runs: the finish check executes the command you approved, by design. Whoever controls that command controls the result, so approve only a command you would run yourself.

## Known historical issues

| Date | Issue | Status |
|---|---|---|
| Pre-v0.3.0 stable | Sensitive credentials (OpenAI, OpenRouter, Cohere, Google Cloud API keys) were committed to git history in test fixtures and development scripts. Identified Apr 25, 2026 during pre-publish audit via `gitleaks`. Affected commits predate v0.3.0 public release. All affected credentials have been rotated. | Rotated · git history cleanup on 2026-04-26 |

## Supply chain

- The `codehere` package has no runtime dependencies (`v2/package.json`).
- A `gitleaks` pre-commit hook blocks accidental secret commits.
- Releases are published by the maintainer from a clean clone after every CI step passes, without npm provenance.
