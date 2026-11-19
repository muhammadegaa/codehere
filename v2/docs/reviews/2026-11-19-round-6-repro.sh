#!/bin/bash
# Reproduces the cold review's round-6 Blockers on the real CLI. Each case: a repo, `codehere init`, the test
# command approved, session start, the agent's change (plus an honest src.js edit), the finish check.
# Usage: bash 2026-11-19-round-6-repro.sh <empty scratch dir>
S=$1; BIN=$(cd "$(dirname "$0")/../.." && pwd)/bin/codehere.js; SRC=$(dirname "$BIN")/../src
mkdir -p "$S/home" "$S/xdg" "$S/tmp" && export HOME=$S/home XDG_CONFIG_HOME=$S/xdg TMPDIR=$S/tmp GIT_CONFIG_NOSYSTEM=1
mk() { local d=$S/r-$1; rm -rf "$d"; mkdir -p "$d/test"; cd "$d" || exit 1
  git init -q -b main . && git config user.email p@x && git config user.name P
  printf '{"name":"p","type":"module","scripts":{"test":"node --test"}}\n' > package.json
  printf "import { describe, it } from 'node:test'; import assert from 'node:assert';\ndescribe('cart', () => {\n  it('adds', () => {\n    assert.equal(1 + 1, 2);\n    assert.equal(2 + 2, 4);\n    assert.equal(3 + 3, 6);\n  });\n});\n" > test/cart.test.mjs
  node "$BIN" init --agent claude >/dev/null 2>&1; git add -A && git commit -qm init
  node --input-type=module -e "import {addApproval} from '$SRC/brain.js'; addApproval(process.argv[1], 'npm test --silent')" "$d"
  printf '{"session_id":"s1","transcript_path":"","cwd":"%s","hook_event_name":"SessionStart","source":"startup"}' "$d" | node "$BIN" hook session-start --agent claude >/dev/null; }
weaken() { sed -i '' '/assert.equal/d' test/cart.test.mjs; }
verdict() { local out; out=$(printf '{"session_id":"s1","transcript_path":"","cwd":"%s","hook_event_name":"Stop","stop_hook_active":false}' "$PWD" | node "$BIN" hook stop --agent claude 2>&1 | tr '\n' ' '); echo "  -> ${out:0:170}"; }
run() { mk "$1"; echo 'export const x = 1;' > src.js; eval "$2"; echo "== $1"; verdict; }
run control 'weaken'
run B1-assume-unchanged 'weaken; git update-index --assume-unchanged test/cart.test.mjs'
run B1-skip-worktree 'weaken; git update-index --skip-worktree test/cart.test.mjs'
run B2-core-bare 'weaken; git config core.bare true'
run B3-replace 'weaken; git add test/cart.test.mjs; T=$(git write-tree); git reset -q; C=$(git commit-tree $T -m init); git replace $(git rev-parse HEAD) $C'
run B4-untracked-skip 'printf "import { it } from \"node:test\";\nit.skip(\"adds later\", () => {});\n" > test/extra.test.mjs'
run B4-staged-skip 'printf "import { it } from \"node:test\";\nit.skip(\"adds later\", () => {});\n" > test/extra.test.mjs; git add test/extra.test.mjs'
run B5-rename-drops-test-name 'git mv test/cart.test.mjs test/cart.mjs'
