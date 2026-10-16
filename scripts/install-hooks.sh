#!/bin/sh
#
# Install codehere git hooks.
#
# Run once after cloning the repo: `bash scripts/install-hooks.sh`

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"

if [ -z "$REPO_ROOT" ]; then
  echo "✗  Not inside a git repository. Run this from the codehere repo." >&2
  exit 1
fi

cd "$REPO_ROOT"

if [ ! -d ".githooks" ]; then
  echo "✗  .githooks/ directory missing. Are you in the codehere repo root?" >&2
  exit 1
fi

# Make hooks executable
chmod +x .githooks/*

# Point git at the in-repo hooks directory
git config core.hooksPath .githooks

echo "✓  git hooks installed (core.hooksPath = .githooks)"
echo ""
echo "Hooks active:"
echo "  pre-commit · runs gitleaks on staged content, then the arch gate (tsc, eslint, knip) when TypeScript changes"
echo "  pre-push   · enforces multi-tier dogfood-loop review on substantive commits"
echo "               (cosmetic-only commits are exempt; full rules in .githooks/pre-push header)"
echo ""

if ! command -v gitleaks > /dev/null 2>&1; then
  echo "⚠  gitleaks is not installed. Install it before committing:"
  echo "     macOS:           brew install gitleaks"
  echo "     Debian/Ubuntu:   apt install gitleaks (may need backports)"
  echo "     Other:           https://github.com/gitleaks/gitleaks/releases"
  echo ""
  echo "  Without gitleaks, the pre-commit hook will skip the scan and warn."
fi
