#!/usr/bin/env node
// Builds the throwaway repo locally (main plus one branch per pull-request scenario) and the push script the owner runs.
// Nothing here talks to GitHub. The Action files and the 1.0.2 tarball are copied from the frozen build.
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Campaign scratch folder. Set CAMPAIGN_SCRATCH to use another location.
const SC = process.env.CAMPAIGN_SCRATCH || path.join(os.tmpdir(), 'promise-verification');
const OUT = SC + '/throwaway';
const REPO = OUT + '/codehere-receipt-test';
const NAME = 'codehere-receipt-test';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(REPO + '/.github/workflows', { recursive: true });
fs.mkdirSync(REPO + '/vendor', { recursive: true });
fs.mkdirSync(REPO + '/action', { recursive: true });
fs.mkdirSync(OUT + '/pr-bodies', { recursive: true });

const sh = (cmd, cwd = REPO) => cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const git = (args) => sh(`git -c user.name="codehere test" -c user.email=test@example.invalid ${args}`);
const w = (rel, body) => {
  fs.mkdirSync(path.dirname(path.join(REPO, rel)), { recursive: true });
  fs.writeFileSync(path.join(REPO, rel), body);
};

// ---- main ----
w('package.json', JSON.stringify({ name: 'receipt-test', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
w('app.js', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n');
w(
  'app.test.js',
  "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, sub } from './app.js';\n\ntest('add', () => assert.equal(add(1, 2), 3));\ntest('sub', () => assert.equal(sub(5, 2), 3));\n",
);
w('README.md', '# codehere receipt test\n\nA throwaway repository for trying the codehere pull request receipt. Safe to delete.\n');
for (const f of ['action.yml', 'summarize.mjs', 'post-receipt.mjs']) fs.copyFileSync(`${SC}/target/head/action/${f}`, `${REPO}/action/${f}`);
fs.copyFileSync(`${SC}/target/codehere-1.0.2.tgz`, `${REPO}/vendor/codehere-1.0.2.tgz`);
const workflow = (version) => `name: codehere
on: pull_request
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  receipt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: ./action
        with:
          version: ${version}
`;
const TARBALL_URL = 'https://raw.githubusercontent.com/${{ github.repository }}/main/vendor/codehere-1.0.2.tgz';
w('.github/workflows/codehere.yml', workflow(TARBALL_URL));
git('init -q -b main');
git('add -A');
git('commit -q -m "base: a tiny project, the Action and the 1.0.2 tarball"');

// ---- scenario branches ----
const branch = (name, body, edit) => {
  git(`checkout -q -b ${name} main`);
  edit();
  git('add -A');
  git(`commit -q -m "${name}"`);
  git('checkout -q main');
  fs.writeFileSync(`${OUT}/pr-bodies/${name}.md`, body);
};
branch('clean-change', 'Added a multiply function with its own test. All tests pass.', () => {
  w('app.js', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\nexport const mul = (a, b) => a * b;\n');
  w(
    'app.test.js',
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, sub, mul } from './app.js';\n\ntest('add', () => assert.equal(add(1, 2), 3));\ntest('sub', () => assert.equal(sub(5, 2), 3));\ntest('mul', () => assert.equal(mul(2, 3), 6));\n",
  );
});
branch('weakened-test', 'done, all tests pass', () => {
  w(
    'app.test.js',
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, sub } from './app.js';\n\ntest('add', () => assert.equal(add(1, 2), 3));\ntest('sub', () => assert.ok(true));\n",
  );
});
branch('claims-missing-file', 'Added the payment feature and its tests in tests/payment.test.js. All 14 tests pass.', () => {
  w('app.js', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\nexport const pay = (n) => n * 100;\n');
});
const hostile = '`$(touch /tmp/codehere-pwned)` ; rm -rf ~ ; `id`\n--base evil $(whoami) \'"; echo hacked\n--claim=--help';
branch('hostile-body', hostile, () => {
  w('README.md', '# codehere receipt test\n\nA throwaway repository for trying the codehere pull request receipt. Safe to delete.\n\nTouched by the hostile-body branch.\n');
});
branch('latest-default', 'done, all tests pass', () => {
  w('.github/workflows/codehere.yml', workflow('latest'));
  w('README.md', '# codehere receipt test\n\nA throwaway repository for trying the codehere pull request receipt. Safe to delete.\n\nThis branch runs the Action with the default version, which is the published latest.\n');
});

// ---- the push script (the owner runs this) ----
const script = `#!/usr/bin/env bash
# Creates the public throwaway repo under your GitHub account and opens five test pull requests.
# Read it first. It only touches the new repository "${NAME}". Delete the repo when the test is done.
set -euo pipefail
cd "$(dirname "$0")/${NAME}"
gh repo create ${NAME} --public --source=. --remote=origin --push --description "Throwaway test repo for the codehere PR receipt"
for b in clean-change weakened-test claims-missing-file hostile-body latest-default; do
  git push -q origin "$b"
  gh pr create --base main --head "$b" --title "$b" --body-file "../pr-bodies/$b.md"
done
echo
echo "Done. Wait about a minute, then open each pull request and read the receipt comment:"
echo "  clean-change         expect: tests pass"
echo "  weakened-test        expect: 1 weakened, and a red X on the check"
echo "  claims-missing-file  expect: 1 claimed test file not found, and a red X"
echo "  hostile-body         expect: tests pass, and nothing executed"
echo "  latest-default       expect: could not run the check (unknown option --base), and a GREEN check"
echo
echo "Two more checks by hand, then tell me what you see:"
echo "  1. Push one more commit to clean-change. The same comment should update, not a second one."
echo "  2. On any PR add a comment of your own containing <!-- codehere-receipt --> and push a commit."
echo "     Does the receipt fail to post, or does it overwrite your comment?"
`;
fs.writeFileSync(`${OUT}/push-and-open-prs.sh`, script, { mode: 0o755 });
console.log('built', REPO);
console.log(sh('git branch --list', REPO).trim());
console.log('files on main:', sh('git ls-files', REPO).trim().split('\n').join(' '));
