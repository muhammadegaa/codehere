---
name: Wrong verdict or crash
about: codehere check missed a false claim, raised a false alarm, or failed to run
title: "[check] <short summary>"
labels: bug
assignees: ''
---

## What you ran

<The exact command, for example `codehere check --base origin/main --claim "..."`.>

## What it printed

<Paste the output. `codehere check --json` is the most useful form.>

## What you expected

<For a missed false claim: what was wrong with the agent's claim. For a false alarm: why the test is fine.>

## Repository

- Test runner (npm test, pytest, go test, cargo test, vitest, jest, node --test):
- Does the repository have the test file or change that is involved? A small public example is best.

## Environment

- `codehere --version`:
- Node version:
- OS:

- [ ] This is not a security vulnerability (those go to the contact in [SECURITY.md](../../SECURITY.md)).
