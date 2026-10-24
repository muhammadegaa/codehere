// Talk demo: two vibe coders, one repo, no Claude account needed.
// It feeds Codehere the same JSON events Claude Code sends, and prints
// exactly what the agent (and the human) would see.
//
//   node demo/demo.mjs          run straight through
//   node demo/demo.mjs --step   pause after each scene (press Enter)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'codehere.js');
const STEP = process.argv.includes('--step');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codehere-demo-'));

const c = { dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m', off: '\x1b[0m' };
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const ch = (args, cwd, input) =>
  spawnSync('node', [BIN, ...args], { cwd, input: input ? JSON.stringify(input) : '', encoding: 'utf8' });

async function pause() {
  if (!STEP) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question(`${c.dim}  [Enter]${c.off}`, () => r(rl.close())));
}
function scene(n, title, line) {
  console.log(`\n${c.bold}${c.cyan}${n}. ${title}${c.off}`);
  if (line) console.log(`${c.dim}${line}${c.off}`);
}
function agentSees(text) {
  console.log(`${c.yellow}  agent sees ▸${c.off}`);
  console.log(text.trim().split('\n').map((l) => `    ${l}`).join('\n'));
}
function humanSees(text) {
  console.log(`${c.green}  human sees ▸${c.off}`);
  console.log(text.trim().split('\n').map((l) => `    ${l}`).join('\n'));
}
function nothing(who = 'agent') {
  console.log(`${c.dim}  ${who} sees ▸ nothing (Codehere stays quiet)${c.off}`);
}

// ---------- setup ----------
const remote = path.join(tmp, 'team.git');
sh(`git init -q --bare -b main "${remote}"`, tmp);
sh(`git clone -q "${remote}" ana`, tmp);
const ana = path.join(tmp, 'ana');
sh('git checkout -q -b main && git config user.name Ana && git config user.email ana@x.dev', ana);
fs.mkdirSync(path.join(ana, 'test'));
fs.writeFileSync(path.join(ana, 'package.json'), JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node test/cart.test.js' } }, null, 2));
fs.writeFileSync(path.join(ana, 'cart.js'), 'export const total = (items) => items.reduce((s, i) => s + i.price, 0);\n');
fs.writeFileSync(
  path.join(ana, 'test', 'cart.test.js'),
  "import { total } from '../cart.js';\nconst got = total([{ price: 10, qty: 2 }]);\nif (got !== 20) { console.error(`AssertionError: expected 20 but got ${got}`); process.exit(1); }\nconsole.log('cart tests passed');\n"
);
sh('git add -A && git commit -qm "shop app" && git push -q -u origin main', ana);

const transcript = path.join(tmp, 'ana.jsonl');
fs.writeFileSync(
  transcript,
  [
    'Fix the cart total so quantity is counted',
    'still wrong',
    'wtf still broken just fix it',
  ]
    .map((t) => JSON.stringify({ type: 'user', message: { role: 'user', content: t } }))
    .join('\n')
);
const S = { session_id: 'ana-1', transcript_path: transcript, cwd: ana };

console.log(`${c.bold}Codehere demo${c.off} ${c.dim}(temp repo: ${tmp})${c.off}`);

scene(1, 'Ana sets it up once', '$ codehere init   then   $ codehere rule "Prices are in cents. Never use floats for money."');
let r = ch(['init'], ana);
humanSees(r.stdout.split('\n').slice(0, 4).join('\n'));
ch(['rule', 'Prices are in cents. Never use floats for money.'], ana);
sh('git add -A && git commit -qm "codehere" && git push -q', ana);
await pause();

scene(2, 'Ana opens Claude Code as usual', 'SessionStart hook');
r = ch(['hook', 'session-start'], ana, { ...S, hook_event_name: 'SessionStart', source: 'startup' });
agentSees(r.stdout);
await pause();

scene(3, 'Ana asks for a new feature, with no way to check it', 'UserPromptSubmit hook, before any code is written');
console.log(`${c.dim}  Ana: "Add a discount code feature to the checkout page"${c.off}`);
r = ch(['hook', 'prompt'], ana, { ...S, hook_event_name: 'UserPromptSubmit', prompt: 'Add a discount code feature to the checkout page' });
agentSees(JSON.parse(r.stdout).hookSpecificOutput.additionalContext);
console.log(`${c.dim}  (The agent asks Ana first. Her answer becomes a test before any code.)${c.off}`);
await pause();

scene(4, 'The agent hits the same failing test again and again', 'PostToolUse hook after each `npm test`');
const fail = (got) => ({ ...S, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stderr: `AssertionError: expected 20 but got ${got}` } });
for (const got of [10, 12, 10]) {
  r = ch(['hook', 'post-tool'], ana, fail(got));
  console.log(`${c.dim}  npm test → AssertionError: expected 20 but got ${got}${c.off}`);
  if (r.status === 2) agentSees(r.stderr);
  else nothing();
}
console.log(`${c.dim}  (Ana typed nothing. The agent was stopped from guessing a 4th time.)${c.off}`);
await pause();

scene(5, 'Ana is tired and types only "masih error, benerin dong"', 'UserPromptSubmit hook');
r = ch(['hook', 'prompt'], ana, { ...S, hook_event_name: 'UserPromptSubmit', prompt: 'masih error, benerin dong' });
agentSees(JSON.parse(r.stdout).hookSpecificOutput.additionalContext);
console.log(`${c.dim}  (Her four words now reach the agent with the real error and how often it came back.)${c.off}`);
await pause();

scene(6, 'The agent says "Done!" but the tests still fail', 'Stop hook runs the tests itself');
fs.writeFileSync(path.join(ana, 'cart.js'), 'export const total = (items) => items.reduce((s, i) => s + i.price * 1, 0);\n');
r = ch(['hook', 'stop'], ana, { ...S, hook_event_name: 'Stop', stop_hook_active: false });
agentSees(JSON.parse(r.stdout).reason);
await pause();

scene(7, 'Still stuck: Ana asks a teammate with one command', '$ codehere help "Cart total ignores quantity"');
r = ch(['help', 'Cart total ignores quantity'], ana);
humanSees(r.stdout.split('---')[0]);
sh('git add -A && git commit -qm "help: cart total" && git push -q', ana);
await pause();

scene(8, 'Budi, on his own laptop, starts his day', 'git pull, then Claude Code SessionStart');
sh(`git clone -q -b main "${remote}" budi`, tmp);
const budi = path.join(tmp, 'budi');
sh('git config user.name Budi && git config user.email budi@x.dev', budi);
r = ch(['hook', 'session-start'], budi, { session_id: 'budi-1', cwd: budi, hook_event_name: 'SessionStart', source: 'startup' });
agentSees(r.stdout);
r = ch(['inbox'], budi);
humanSees(r.stdout);
await pause();

scene(9, 'Budi answers in 30 seconds and marks it solved', '$ codehere reply <id> "..." --solved');
const id = r.stdout.split('\n')[0].trim();
r = ch(['reply', id, 'total must use price * qty; we had the same bug in checkout.js', '--solved'], budi);
humanSees(r.stdout);
sh('git add -A && git commit -qm "answer cart help" && git push -q', budi);
await pause();

scene(10, 'Next week, Citra hits the same bug. Her agent gets the fix on the first failure.', 'git pull, then PostToolUse on the first failure');
sh(`git clone -q -b main "${remote}" citra`, tmp);
const citra = path.join(tmp, 'citra');
sh('git config user.name Citra && git config user.email citra@x.dev', citra);
r = ch(['hook', 'post-tool'], citra, { session_id: 'citra-1', cwd: citra, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stderr: 'AssertionError: expected 45 but got 15' } });
agentSees(JSON.parse(r.stdout).hookSpecificOutput.additionalContext);
await pause();

scene(11, 'The fix lands; "done" is checked, not claimed', 'Stop hook');
fs.writeFileSync(path.join(ana, 'cart.js'), 'export const total = (items) => items.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);\n');
r = ch(['hook', 'stop'], ana, { ...S, hook_event_name: 'Stop', stop_hook_active: true });
let j = JSON.parse(r.stdout || '{}');
if (j.decision === 'block') {
  agentSees(j.reason.split('\n').slice(0, 3).join('\n') + '\n    …');
  r = ch(['hook', 'stop'], ana, { ...S, hook_event_name: 'Stop', stop_hook_active: true });
  j = JSON.parse(r.stdout || '{}');
}
humanSees(j.systemMessage || '(tests passed)');

console.log(`\n${c.bold}${c.magenta}What the humans did: 1 setup, 1 rule, 1 answer to \"how will you know it works?\", 1 help card, 1 reply.${c.off}`);
console.log(`${c.magenta}Everything else happened inside the agent, from plain files in git.${c.off}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
