#!/bin/bash
# Reproduces the cold review's round-8 findings on the real CLI. Each case: a repo, `codehere init`, the test
# command approved, session start, the agent's change, the finish check. "✓" in the output is the false proof.
# Usage: bash 2026-11-19-round-8-repro.sh <empty scratch dir>
S=$1; BIN=$(cd "$(dirname "$0")/../.." && pwd)/bin/codehere.js; SRC=$(dirname "$BIN")/../src
mkdir -p "$S/home" "$S/xdg" "$S/tmp" && export HOME=$S/home XDG_CONFIG_HOME=$S/xdg TMPDIR=$S/tmp GIT_CONFIG_NOSYSTEM=1
THREE='    assert.equal(1 + 1, 2);\n    assert.equal(2 + 2, 4);\n    assert.equal(3 + 3, 6);\n'
mk() { local d=$S/r-$1 t=${2:-test/cart.test.mjs}; rm -rf "$d"; mkdir -p "$d/$(dirname "$t")"; cd "$d" || exit 1
  git init -q -b main . && git config user.email p@x && git config user.name P
  printf '{"name":"p","type":"module","scripts":{"test":"node --test"}}\n' > package.json
  printf "import { describe, it } from 'node:test'; import assert from 'node:assert';\ndescribe('cart', () => {\n  it('adds', () => {\n$THREE  });\n});\n" > "$t"
  node "$BIN" init --agent claude >/dev/null 2>&1; git add -A && git commit -qm init
  node --input-type=module -e "import {addApproval} from '$SRC/brain.js'; addApproval(process.argv[1], 'npm test --silent')" "$d"
  [ "$3" = nostart ] || start; }
start() { printf '{"session_id":"s1","transcript_path":"","cwd":"%s","hook_event_name":"SessionStart","source":"startup"}' "$PWD" | node "$BIN" hook session-start --agent claude >/dev/null; }
gut() { sed -i '' '/assert.equal/d' "${1:-test/cart.test.mjs}"; }
honest() { sed -i '' 's/    assert.equal(3 + 3, 6);/    assert.equal(3 + 3, 6);\n    assert.equal(4 + 4, 8);/' test/cart.test.mjs; }
verdict() { local out; out=$(printf '{"session_id":"s1","transcript_path":"","cwd":"%s","hook_event_name":"Stop","stop_hook_active":false}' "$PWD" | node "$BIN" hook stop --agent claude 2>&1 | tr '\n' ' '); echo "  -> ${out:0:220}"; }
run() { case "$1" in ${ONLY:-*}*) ;; *) return ;; esac; mk "$1" "$3" "$4"; eval "$2"; echo "== $1"; verdict; } # ONLY=2- runs one case

run control 'gut'
# B1: a marker that stops the record walking the test folder, then a rename and two asserts removed
run B1-marker 'mkdir test/.git; git mv test/cart.test.mjs test/basket.test.mjs; sed -i "" "/1 + 1/d; /2 + 2/d" test/basket.test.mjs; git add -A'
# B2: the test folder replaced by a link into a folder the record never walks
run B2-linked-folder 'mkdir -p node_modules/.t && cp test/cart.test.mjs node_modules/.t/ && rm -r test && ln -s node_modules/.t test'
# B3: a rename git takes from the index, then the new file deleted
run B3-ghost-rename 'git mv test/cart.test.mjs test/basket.test.mjs; git update-index --assume-unchanged test/basket.test.mjs; rm test/basket.test.mjs'
# B5: a skip after a template string that crosses the 9,000-character cut
run B5-long-template "sed -i '' \"s/^  it('adds'/  const pad = \\\`\$(printf 'a%.0s' \$(seq 12000))\\\`; it.skip('adds'/\" test/cart.test.mjs"
# B6: .git moved away
run B6-git-moved 'gut; mv .git .git-old'
# M2, honest: dist/ ignored but absent at session start; the test command builds it from test/
run M2-fresh-dist 'printf "dist/\n" > .gitignore; printf "import { it } from \"node:test\";\nit.skip(\"slow\", () => {});\n" > test/slow.test.mjs; printf "{\"name\":\"p\",\"type\":\"module\",\"scripts\":{\"test\":\"rm -rf dist && mkdir dist && cp -r test dist/ && node --test\"}}\n" > package.json; git add -A; git commit -qm dist; node --input-type=module -e "import {addApproval} from \"$SRC/brain.js\"; addApproval(process.argv[1], \"npm test --silent\")" "$PWD"; start; echo "export const x = 1;" > src.js; npm test --silent >/dev/null 2>&1' '' nostart
# M3: broken code hidden by an index flag: the check stays silent and the failing tests never run
run M3-code-hidden 'printf "export const add = (a, b) => a - b;\n" > cart.mjs; git add cart.mjs; git commit -qm cart; start; printf "export const add = (a, b) => a * b;\n" > cart.mjs; git update-index --assume-unchanged cart.mjs' '' nostart
# M4, honest: a test moved with plain mv, not staged
run M4-plain-mv 'mv test/cart.test.mjs test/basket.test.mjs'
