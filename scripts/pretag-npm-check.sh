#!/usr/bin/env bash
# Pre-tag npm-versions check — MANDATORY before pushing any release tag.
#
# Per `feedback_pretag_npm_check.md` (locked Apr 27 2026 after 2 tombstone
# collisions in 2 versions cost ~30min each). The check itself takes 2s. Ratio
# 900:1.
#
# Three outcomes:
#   exit 0  — slot is FREE, safe to tag + push
#   exit 1  — slot is ALREADY PUBLISHED on npm (E409 awaits)
#   exit 2  — slot is TOMBSTONED (was published, then unpublished, slot
#             permanently reserved — npm rejects with E400)
#
# Usage:
#   ./scripts/pretag-npm-check.sh                 # reads agent/package.json
#   ./scripts/pretag-npm-check.sh 0.5.0-alpha.2   # explicit target
#   ./scripts/pretag-npm-check.sh --quiet 0.5.0   # CI-friendly (no banner)
#
# Used by:
#   - Local dev pre-tag ritual (this file is the authoritative check)
#   - .github/workflows/publish.yml as a fail-fast gate before npm publish
#
# Verified-tombstoned versions on `codehere` as of Apr 27 2026 (cited from
# memory for context — actual check is live, doesn't trust this list):
#   0.2.0 · 0.3.0 · 0.4.0 · 0.5.0-alpha · 0.5.3-alpha

set -e

PKG_NAME="codehere"
QUIET=0
TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --quiet|-q) QUIET=1; shift ;;
    --pkg) PKG_NAME="$2"; shift 2 ;;
    --pkg=*) PKG_NAME="${1#--pkg=}"; shift ;;
    -h|--help)
      sed -n '2,/^set -e/p' "$0" | sed -e '$d' -e 's/^# \?//'
      exit 0
      ;;
    *) TARGET="$1"; shift ;;
  esac
done

# Default: read agent/package.json (resolved relative to repo root, where this
# script lives in scripts/). Falls back to `package.json` for monorepo-flat use.
if [ -z "$TARGET" ]; then
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  if [ -f "$REPO_ROOT/agent/package.json" ]; then
    TARGET=$(node -p "require('$REPO_ROOT/agent/package.json').version" 2>/dev/null || true)
  elif [ -f "$REPO_ROOT/package.json" ]; then
    TARGET=$(node -p "require('$REPO_ROOT/package.json').version" 2>/dev/null || true)
  fi
fi

if [ -z "$TARGET" ]; then
  echo "ERROR: no target version provided and no package.json found." >&2
  echo "Usage: $0 [--quiet] <version>" >&2
  exit 64  # EX_USAGE
fi

log() { [ "$QUIET" -eq 0 ] && echo "$@" || true; }

log "pretag-npm-check  ·  pkg=$PKG_NAME  target=$TARGET"

# Fetch both manifests in parallel — `versions --json` is the source of truth
# for "currently published," `time --json` is the source of truth for "ever
# published" (tombstoned slots show up here but not in versions).
VERSIONS_JSON=$(npm view "$PKG_NAME" versions --json 2>/dev/null || true)
TIME_JSON=$(npm view "$PKG_NAME" time --json 2>/dev/null || true)

if [ -z "$VERSIONS_JSON" ] || [ -z "$TIME_JSON" ]; then
  echo "ERROR: failed to fetch npm manifest for $PKG_NAME (network? wrong pkg name?)" >&2
  exit 65  # EX_DATAERR
fi

# Use node for JSON parsing — grep against quoted strings is fragile when
# version slots contain dots and dashes (e.g. "0.5.0-alpha.1" is a valid
# substring of "10.5.0-alpha.10"). Node's JSON parser handles this cleanly.
STATE=$(node -e "
  const target = process.argv[1];
  const versions = JSON.parse(process.argv[2] || '[]');
  const times = JSON.parse(process.argv[3] || '{}');
  const arr = Array.isArray(versions) ? versions : [versions];
  const isPublished = arr.includes(target);
  const isInTime = Object.prototype.hasOwnProperty.call(times, target);
  if (isPublished) console.log('PUBLISHED');
  else if (isInTime) console.log('TOMBSTONED');
  else console.log('FREE');
" "$TARGET" "$VERSIONS_JSON" "$TIME_JSON")

case "$STATE" in
  FREE)
    log "  state: FREE"
    log "  ok: $TARGET is unclaimed on npm — safe to tag + publish"
    exit 0
    ;;
  PUBLISHED)
    echo "ABORT: $TARGET is ALREADY PUBLISHED on npm (E409 — cannot republish)" >&2
    echo "       view: https://www.npmjs.com/package/$PKG_NAME/v/$TARGET" >&2
    echo "       fix:  bump to the next patch / prerelease and re-tag" >&2
    exit 1
    ;;
  TOMBSTONED)
    echo "ABORT: $TARGET is TOMBSTONED on npm (E400 — slot permanently reserved)" >&2
    echo "       this version was published once and unpublished — npm forbids reuse" >&2
    echo "       fix:  bump to the next patch / prerelease and re-tag" >&2
    echo "       see:  feedback_pretag_npm_check.md (memory) for tombstone history" >&2
    exit 2
    ;;
  *)
    echo "ERROR: unexpected state=$STATE — bug in pretag-npm-check" >&2
    exit 70  # EX_SOFTWARE
    ;;
esac
