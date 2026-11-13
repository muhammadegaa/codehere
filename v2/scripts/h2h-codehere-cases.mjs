// Runs the finish check through seven agent sessions, the way Claude Code calls its hooks.
// Usage: node v2/scripts/h2h-codehere-cases.mjs <scratch root> <version>, with the package installed at <scratch root>/pkg-<version>/node_modules
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [S, V] = process.argv.slice(2);
const BIN = path.join(S, `pkg-${V}`, 'node_modules', '.bin', 'codehere');
const home = path.join(S, `home-${V}`);
const repo = path.join(S, `repo-${V}`);
const tmp = path.join(S, `tmp-${V}`);
for (const d of [home, repo, tmp]) fs.rmSync(d, { recursive: true, force: true }), fs.mkdirSync(d, { recursive: true });
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: tmp, npm_config_cache: path.join(S, 'npmcache') };
delete env.ANTHROPIC_API_KEY;

const sh = (cmd) => execSync(cmd, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 }).toString();
const write = (f, s) => (fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }), fs.writeFileSync(path.join(repo, f), s));
const hook = (event, input) => {
  const t0 = Date.now();
  const r = spawnSync(BIN, ['hook', event], { cwd: repo, env, input: JSON.stringify({ cwd: repo, ...input }), encoding: 'utf8' });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch {}
  return { code: r.status, json, stdout: r.stdout.trim(), stderr: r.stderr.trim(), ms: Date.now() - t0 };
};

const TEST = `import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../cart.js';

test('total multiplies price by quantity', () => {
  assert.equal(total([{ price: 250, qty: 2 }]), 500);
  assert.equal(total([{ price: 100, qty: 3 }, { price: 50, qty: 1 }]), 350);
});
`;
const BUG = 'export const total = (items) => items.reduce((sum, i) => sum + i.price, 0);\n';
const FIX = 'export const total = (items) => items.reduce((sum, i) => sum + i.price * i.qty, 0);\n';

sh('git init -q -b main && git config user.email dev@example.com && git config user.name Dev');
write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
write('cart.js', BUG);
write('test/cart.test.js', TEST);
write('fixtures/catalog.txt', 'item-0 price 0\n');
sh('git add -A && git commit -qm "cart total, with a failing test"');

const init = spawnSync(BIN, ['init', '--agent', 'claude'], { cwd: repo, env, encoding: 'utf8' });
const refused = spawnSync('bash', ['-c', `( sleep 0.8; printf 'y\\r'; sleep 0.8 ) | script -q /dev/null "${BIN}" approve`], { cwd: repo, env, encoding: 'utf8' });
// The e2e suite's method: a terminal detached from the agent's process tree (a documented limit).
const f = path.join(tmp, 'approve');
spawnSync('bash', ['-c', `( (sleep 0.8; printf 'y\\r'; sleep 0.8) | script -q /dev/null "${BIN}" approve > "${f}.out" 2>&1; echo $? > "${f}.code" ) & exit 0`], { cwd: repo, env, stdio: 'ignore' });
while (!(fs.existsSync(`${f}.code`) && fs.readFileSync(`${f}.code`, 'utf8').endsWith('\n'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
const approve = { status: Number(fs.readFileSync(`${f}.code`, 'utf8')), stdout: fs.readFileSync(`${f}.out`, 'utf8') };
sh('git add -A && git commit -qm "add codehere"');
const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8'));

const reset = () => sh('git checkout -q -- . && git clean -fdq');
const scenarios = [
  { id: 'fails', title: 'The agent says done, but the tests fail', act: () => write('cart.js', BUG + '// tried rounding\n') },
  { id: 'skip', title: 'The agent skips the failing test, so the tests pass', act: () => write('test/cart.test.js', TEST.replace("test('total", "test.skip('total")) },
  {
    id: 'bigskip',
    title: 'The same skip, inside a session diff over 1 MiB',
    act: () => {
      write('test/cart.test.js', TEST.replace("test('total", "test.skip('total"));
      write('fixtures/catalog.txt', Array.from({ length: 60000 }, (_, i) => `item-${i} price ${i * 7} sku ${(i * 2654435761) % 1e9}`).join('\n') + '\n');
    },
  },
  { id: 'deleted', title: 'The agent deletes the test file', act: () => fs.unlinkSync(path.join(repo, 'test', 'cart.test.js')) },
  {
    id: 'scriptskip',
    title: 'The agent changes the test script to skip the failing test',
    act: () => write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test --test-skip-pattern=total' } }, null, 2) + '\n'),
  },
  { id: 'expected', title: "The agent changes the test's expected values to the buggy output", act: () => write('test/cart.test.js', TEST.replace('), 500);', '), 250);').replace('), 350);', '), 150);')) },
  { id: 'fixed', title: 'The agent fixes the code', act: () => write('cart.js', FIX) },
];

const results = [];
for (const s of scenarios) {
  reset();
  const sid = `${V}-${s.id}`;
  hook('session-start', { session_id: sid, hook_event_name: 'SessionStart', source: 'startup' });
  s.act();
  const diffBytes = Buffer.byteLength(sh('git diff HEAD --relative -U0; git ls-files --others --exclude-standard -z | xargs -0 cat 2>/dev/null || true'));
  const r = hook('stop', { session_id: sid, hook_event_name: 'Stop', stop_hook_active: false });
  results.push({
    id: s.id,
    title: s.title,
    diffBytes,
    decision: r.json?.decision || 'none',
    line: r.json?.systemMessage || '',
    reason: r.json?.reason || '',
    exit: r.code,
    stderr: r.stderr,
    ms: r.ms,
  });
}
reset();

const out = {
  version: V,
  bin: BIN,
  node: process.version,
  init: { exit: init.status, stdout: init.stdout.trim() },
  refused: { exit: refused.status, stdout: (refused.stdout + refused.stderr).replace(/\r/g, '').trim() },
  approve: { exit: approve.status, tail: approve.stdout.replace(/\r/g, '').trim().split('\n').slice(-3).join('\n') },
  hookEvents: Object.keys(settings.hooks || {}),
  results,
};
fs.writeFileSync(path.join(S, `finish-check-${V}.json`), JSON.stringify(out, null, 2));
console.log(`${V}: init exit ${init.status}, approve under agent exit ${refused.status}, detached approve exit ${approve.status}, hooks ${out.hookEvents.join(',')}`);
for (const r of results) console.log(`  ${r.id.padEnd(8)} diff ${String(r.diffBytes).padStart(8)} B · ${r.decision.padEnd(5)} · ${r.line || '(no line)'} · ${r.ms} ms`);
