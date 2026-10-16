# Security policy

`codehere check` runs your project's own test command and reports what it did. A vulnerability in codehere can make that report wrong or run code you did not intend to run. Reports are welcome.

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
- The `codehere` npm package and the code under `agent/src/`
- The GitHub Action in `action/`: how it handles pull request text, which can be hostile, and what it posts

Out of scope (still worth reporting upstream):
- Vulnerabilities in upstream dependencies
- Attacks that need local privilege the attacker already has
- Code that the project's own test command runs: `codehere check` executes that command by design, so run it only on repositories you would run `npm test` or `pytest` on. Whoever controls that command controls the result, so a receipt is not evidence against a hostile pull request author.

## Known historical issues

| Date | Issue | Status |
|---|---|---|
| Pre-v0.3.0 stable | Sensitive credentials (OpenAI, OpenRouter, Cohere, Google Cloud API keys) were committed to git history in test fixtures and development scripts. Identified Apr 25, 2026 during pre-publish audit via `gitleaks`. Affected commits predate v0.3.0 public release. All affected credentials have been rotated. | Rotated · git history cleanup on 2026-04-26 |

## Supply chain

- `agent/package-lock.json` is committed for reproducible builds.
- A `gitleaks` pre-commit hook blocks accidental secret commits.
- The publish workflow generates an SBOM with `npm sbom`. It does not publish with npm provenance while the source repository is private.
