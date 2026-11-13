// Upgrade check (launch bar L12): a repo set up with the published 2.0.4, then used with this build.
// A 2.0.4 user runs init, approves the test command, adds a team rule and a lesson, and has one session;
// then the package is upgraded, nothing is re-run, and the next sessions use this build in the same repo
// and the same HOME. Prints one line per check; exit 1 if any fails.
// Usage: node v2/scripts/upgrade-from-2.0.4.mjs <scratch dir> <2.0.4 bin/codehere.js> <this build's bin/codehere.js>
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [S, OLD, NEW] = process.argv.slice(2);
const home = path.join(S, 'home-upgrade');
const repo = path.join(S, 'repo-upgrade');
const tmp = path.join(S, 'tmp-upgrade');
for (const d of [home, repo, tmp]) fs.rmSync(d, { recursive: true, force: true }), fs.mkdirSync(d, { recursive: true });
const git = execSync('command -v git').toString().trim();
const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: tmp, PATH: [path.dirname(process.execPath), path.dirname(git), '/usr/bin', '/bin'].join(':') };
const sh = (cmd) => execSync(cmd, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const write = (f, s) => (fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }), fs.writeFileSync(path.join(repo, f), s));
const run = (bin, args, input) => spawnSync('node', [bin, ...args], { cwd: repo, env, input: input === undefined ? '' : JSON.stringify({ cwd: repo, ...input }), encoding: 'utf8' });
const hook = (bin, event, input) => {
  const r = run(bin, ['hook', event], input);
  let j = {};
  try { j = r.stdout.trim() && event !== 'session-start' ? JSON.parse(r.stdout) : {}; } catch {}
  return { ...r, j };
};

const TEST = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { total } from '../cart.js';\n\ntest('total multiplies price by quantity', () => {\n  assert.equal(total([{ price: 250, qty: 2 }]), 500);\n});\n";
const BUG = 'export const total = (items) => items.reduce((sum, i) => sum + i.price, 0);\n';
const FIX = 'export const total = (items) => items.reduce((sum, i) => sum + i.price * i.qty, 0);\n';
sh('git init -q -b main && git config user.email dev@example.com && git config user.name Dev');
write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
write('cart.js', BUG);
write('test/cart.test.js', TEST);
sh('git add -A && git commit -qm "cart total, with a failing test"');

// ---- the 2.0.4 user ----
const init = run(OLD, ['init', '--agent', 'claude']);
const f = path.join(tmp, 'approve');
spawnSync('bash', ['-c', `( (sleep 0.8; printf 'y\\r'; sleep 0.8) | script -q /dev/null node "${OLD}" approve > "${f}.out" 2>&1; echo $? > "${f}.code" ) & exit 0`], { cwd: repo, env, stdio: 'ignore' });
while (!(fs.existsSync(`${f}.code`) && fs.readFileSync(`${f}.code`, 'utf8').endsWith('\n'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
const rule = run(OLD, ['rule', 'Prices are in cents; never round them.']);
const lesson = run(OLD, ['lesson', 'Cart total ignores quantity', '--fix', 'multiply price by qty', '--sig', 'AssertionError: Expected values to be strictly equal']);
sh('git add -A && git commit -qm "add codehere, a rule and a lesson"');
hook(OLD, 'session-start', { session_id: 'old1', hook_event_name: 'SessionStart', source: 'startup' });
write('cart.js', BUG + '// tried rounding\n');
const oldStop = hook(OLD, 'stop', { session_id: 'old1', hook_event_name: 'Stop', stop_hook_active: false });
sh('git checkout -q -- .');

// ---- upgraded: this build, same repo, same HOME, nothing re-run ----
const start = hook(NEW, 'session-start', { session_id: 'new1', hook_event_name: 'SessionStart', source: 'startup' });
write('test/cart.test.js', TEST.replace("test('total", "test.skip('total"));
const skipStop = hook(NEW, 'stop', { session_id: 'new1', hook_event_name: 'Stop', stop_hook_active: false });
sh('git checkout -q -- .');
hook(NEW, 'session-start', { session_id: 'new2', hook_event_name: 'SessionStart', source: 'startup' });
write('cart.js', FIX);
const fixStop = hook(NEW, 'stop', { session_id: 'new2', hook_event_name: 'Stop', stop_hook_active: false });
const status = run(NEW, ['status']);
sh('git checkout -q -- .');

const checks = [
  ['2.0.4: init, approve, rule and lesson succeed', init.status === 0 && Number(fs.readFileSync(`${f}.code`, 'utf8')) === 0 && rule.status === 0 && lesson.status === 0, `${init.status} ${fs.readFileSync(`${f}.code`, 'utf8').trim()} ${rule.status} ${lesson.status} ${lesson.stderr}`],
  ['2.0.4: a failing run sends the agent back', oldStop.j.decision === 'block', oldStop.stdout.slice(0, 200)],
  ['upgraded: session start still gives the agent the team rule', start.stdout.includes('Prices are in cents; never round them.'), start.stdout.slice(0, 400)],
  ['upgraded: a skipped test is sent back, with the person\'s line', skipStop.j.decision === 'block' && (skipStop.j.systemMessage || '').startsWith('codehere ✕ a check was weakened'), skipStop.stdout.slice(0, 300)],
  ['upgraded: the test command approved under 2.0.4 still runs, and the fix gets ✓', !fixStop.j.decision && /^codehere ✓ npm test --silent · 1 passed · re-run here/.test(fixStop.j.systemMessage || ''), fixStop.stdout.slice(0, 300)],
  ['upgraded: status works on the 2.0.4 state', status.status === 0, status.stdout.slice(0, 200) + status.stderr],
];
let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) (failed++, console.log(`     ${detail}`));
}
process.exit(failed ? 1 : 0);
