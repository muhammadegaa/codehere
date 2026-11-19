#!/bin/bash
# Reproduces the cold review's round-7 findings on the real CLI. Each case: a repo, `codehere init`, the test
# command approved, session start, the agent's change, the finish check. "✓" in the output is the false proof.
# Usage: bash 2026-11-19-round-7-repro.sh <empty scratch dir>
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
# 1: git lists the file, but its diff is of the index, not the work tree
run 1-staged-then-hidden 'honest; git add test/cart.test.mjs; git update-index --assume-unchanged test/cart.test.mjs; gut'
run 1-committed-then-hidden 'honest; git commit -qam honest; git update-index --assume-unchanged test/cart.test.mjs; gut'
run 1-renamed-then-hidden 'git mv test/cart.test.mjs test/basket.test.mjs; git update-index --assume-unchanged test/basket.test.mjs; gut test/basket.test.mjs'
# 2: a post-index-change hook puts the honest test back while git runs inside the check, then the skip again
run 2-index-hook 'printf "export const x = 1;\n" > src.js; printf "import { it } from \"node:test\"; import assert from \"node:assert\"; import { x } from \"../src.js\";\nit(\"x\", () => assert.equal(x, 2));\n" > .git/honest.mjs; cp .git/honest.mjs test/cart.test.mjs; git add -A; git commit -qm x; start; sed "s/^it(/it.skip(/" .git/honest.mjs > .git/gutted.mjs; cp .git/gutted.mjs test/cart.test.mjs; echo ${DELAY:-120} > .git/delay; printf "#!/usr/bin/env node\nconst fs=require(\"fs\"),p=require(\"path\"),cp=require(\"child_process\");const r=process.cwd(),f=p.join(r,\".git\",\"swapdone\");if(!fs.existsSync(f)){fs.writeFileSync(f,\"1\");const t=p.join(r,\"test\",\"cart.test.mjs\");fs.copyFileSync(p.join(r,\".git\",\"honest.mjs\"),t);cp.spawn(process.execPath,[\"-e\",\"setTimeout(()=>require(\\\\\"fs\\\\\").copyFileSync(\"+JSON.stringify(p.join(r,\".git\",\"gutted.mjs\"))+\",\"+JSON.stringify(t)+\"),\"+fs.readFileSync(p.join(r,\".git\",\"delay\"),\"utf8\").trim()+\")\"],{detached:true,stdio:\"ignore\",cwd:\"/\"}).unref();}\n" > .git/hooks/post-index-change.cjs; printf "#!/bin/sh\nexec node \"\$(dirname \"\$0\")/post-index-change.cjs\"\n" > .git/hooks/post-index-change; chmod +x .git/hooks/post-index-change; touch package.json' '' nostart
# 3: a new untracked config is read only to 1 MiB
run 3-big-new-config '{ echo "[pytest]"; for i in $(seq 200000); do echo "# pad"; done; echo "addopts = --deselect tests/test_cart.py::test_adds"; } > pytest.ini'
# 4: a skip after 10,000 characters on one line
run 4-long-line "sed -i '' \"s/^  it('adds'/  \$(printf '%10000s' '')it.skip('adds'/\" test/cart.test.mjs"
# 5: no record (a session Codehere never saw start), then core.bare
run 5-bare-no-record 'gut; git config core.bare true' '' nostart
# 6: a test path holding a quote, hidden by an index flag
run 6-quoted-path 'git update-index --assume-unchanged "test/cart\"x.test.mjs"; gut "test/cart\"x.test.mjs"' 'test/cart"x.test.mjs'
# 7: honest work: a library test inside an ignored virtual env, and a worktree added inside the repo
run 7-ignored-env 'echo "env/" > .gitignore; git add .gitignore; git commit -qm ignore; start; mkdir -p env/lib/python3.12/site-packages/pkg/tests; touch env/pyvenv.cfg; printf "import pytest\n@pytest.mark.skip\ndef test_a():\n    pass\n" > env/lib/python3.12/site-packages/pkg/tests/test_a.py' '' nostart
run 7-worktree 'printf "import { it } from \"node:test\";\nit.skip(\"slow\", () => {});\n" > test/slow.test.mjs; git add -A; git commit -qm slow; start; git worktree add -q .claude/worktrees/w1' '' nostart
# 10: test names the runners collect that Codehere does not take for tests
run 10-underscore-test 'gut cart_test.mjs' 'cart_test.mjs'
run 10-dash-test 'gut cart-test.mjs' 'cart-test.mjs'
