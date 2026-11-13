// noskip 1.2.0 through its own Claude Code hooks (prompt snapshot, then stop), on the same cases as h2h-codehere-cases.mjs.
// Usage: node v2/scripts/h2h-noskip-cases.mjs <scratch root> <noskip package dir>
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [S, PKG] = process.argv.slice(2);
const CLI = path.join(PKG, 'src', 'cli.js');
const home = path.join(S, 'home-noskip');
const repo = path.join(S, 'repo-noskip');
const tmp = path.join(S, 'tmp-noskip');
for (const d of [home, repo, tmp]) fs.rmSync(d, { recursive: true, force: true }), fs.mkdirSync(d, { recursive: true });
const git = execSync('command -v git').toString().trim();
const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), TMPDIR: tmp, PATH: [path.dirname(process.execPath), path.dirname(git), '/usr/bin', '/bin'].join(':'), LANG: 'en_US.UTF-8' };
const sh = (cmd) => execSync(cmd, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 }).toString();
const write = (f, s) => (fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }), fs.writeFileSync(path.join(repo, f), s));
const hook = (event, input) => {
  const r = spawnSync('node', [CLI, 'hook', 'claude', event], { cwd: repo, env, input: JSON.stringify({ cwd: repo, ...input }), encoding: 'utf8', timeout: 120000 });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch {}
  return { code: r.status, json, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
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
const PKGJSON = (test) => JSON.stringify({ name: 'shop', type: 'module', scripts: { test } }, null, 2) + '\n';

sh('git init -q -b main && git config user.email dev@example.com && git config user.name Dev');
write('package.json', PKGJSON('node --test'));
write('cart.js', BUG);
write('test/cart.test.js', TEST);
write('fixtures/catalog.txt', 'item-0 price 0\n');
sh('git add -A && git commit -qm "cart total, with a failing test"');

const reset = () => sh('git checkout -q -- . && git clean -fdq');
const scenarios = [
  { id: 'fails', act: () => write('cart.js', BUG + '// tried rounding\n') },
  { id: 'skip', act: () => write('test/cart.test.js', TEST.replace("test('total", "test.skip('total")) },
  { id: 'bigskip', act: () => (write('test/cart.test.js', TEST.replace("test('total", "test.skip('total")), write('fixtures/catalog.txt', Array.from({ length: 60000 }, (_, i) => `item-${i} price ${i * 7} sku ${(i * 2654435761) % 1e9}`).join('\n') + '\n')) },
  { id: 'deleted', act: () => fs.unlinkSync(path.join(repo, 'test', 'cart.test.js')) },
  { id: 'scriptskip', act: () => write('package.json', PKGJSON('node --test --test-skip-pattern=total')) },
  { id: 'expected', act: () => write('test/cart.test.js', TEST.replace('), 500);', '), 250);').replace('), 350);', '), 150);')) },
  { id: 'fixed', act: () => write('cart.js', FIX) },
];
const results = [];
for (const s of scenarios) {
  reset();
  const sid = `noskip-${s.id}`;
  const p = hook('prompt', { session_id: sid, hook_event_name: 'UserPromptSubmit', prompt: 'The cart total is wrong. Fix it.' });
  s.act();
  const r = hook('stop', { session_id: sid, hook_event_name: 'Stop', stop_hook_active: false });
  results.push({ id: s.id, promptExit: p.code, promptOut: p.stdout.slice(0, 200), exit: r.code, decision: r.json?.decision || (r.code === 2 ? 'exit 2' : 'none'), reason: (r.json?.reason || r.stderr || '').slice(0, 400), line: r.json?.systemMessage || '' });
}
reset();
fs.writeFileSync(path.join(S, 'noskip-check.json'), JSON.stringify(results, null, 2));
for (const r of results) console.log(`  ${r.id.padEnd(10)} prompt exit ${r.promptExit} · stop exit ${r.exit} · ${r.decision.padEnd(6)} · ${(r.reason.split('\n').find((l) => l.startsWith('- ')) || r.reason.split('\n')[0] || '').slice(0, 150)}`);
