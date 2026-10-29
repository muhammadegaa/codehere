#!/usr/bin/env node
// One scenario on a real agent, checked from the agent's own transcript (AGT-4).
//
//   node scripts/conformance.mjs --agent claude --model haiku
//   node scripts/conformance.mjs --agent codex --model qwen3.5:9b-q4_K_M --oss
//   node scripts/conformance.mjs --agent copilot --model qwen3.5:9b-q4_K_M --oss [--bin <path to copilot>]
//
// Everything happens in a scratch folder: the repo, the approvals (XDG_CONFIG_HOME) and, for
// Codex and Copilot, their own CODEX_HOME or COPILOT_HOME, so the developer's real config is
// never read or changed. The result goes to docs/conformance/<date>-<agent>-<version>.md.
//
// L1  the team rules are in the model's context at the start
// L2  after the tests fail, the teammate's lesson is in the model's context, once
// L3  after the agent breaks a test and stops, Codehere's failure reason is the next prompt, at most 3 times
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signature } from '../src/signals.js';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const agent = flag('agent');
const model = flag('model');
const oss = args.includes('--oss');
const copilotBin = flag('bin') || 'copilot';
// Copilot also runs .claude/settings.json: --hooks claude installs only those, the case of a team
// that never ran `init --agent copilot`; the default installs both, to check nothing runs twice.
const claudeHooksOnly = agent === 'copilot' && flag('hooks') === 'claude';
if (!['claude', 'codex', 'copilot'].includes(agent) || !model) {
  console.error('Usage: node scripts/conformance.mjs --agent claude|codex|copilot --model <model> [--oss] [--bin <path>]');
  process.exit(1);
}

const RULE = 'Prices are integer pence. Never use floats for money.';
const LESSON_HEAD = 'Codehere: a teammate solved a similar error before.';
const SENT_BACK = 'Codehere ran `npm test --silent` and it failed.';
const PROMPTS = [
  'Run `npm test`. One test fails. Fix src/price.js so both tests pass, then run `npm test` again and reply in one line.',
  'Change src/price.js so that parsePrice always returns 0. Do not run any tests. Reply in one line when done.',
];

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `codehere-conformance-${agent}-`)));
const repo = path.join(tmp, 'shop');
const env = { ...process.env, XDG_CONFIG_HOME: path.join(tmp, 'config'), PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}` };
delete env.ANTHROPIC_API_KEY; // claude -p uses the signed-in account
if (agent === 'codex') env.CODEX_HOME = path.join(tmp, 'codex-home');
if (agent === 'copilot') env.COPILOT_HOME = path.join(tmp, 'copilot-home');
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const write = (f, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), text);
};

// ---------- the repo: a failing test, a team rule, Ana's verified lesson ----------

fs.mkdirSync(path.join(tmp, 'bin'));
const calls = path.join(tmp, 'calls.tsv');
// For Copilot, every hook call is logged with the size of what it printed: Copilot also runs the
// Claude Code hooks, and those must print nothing. Other commands keep their terminal.
const bin = path.join(V2, 'bin', 'codehere.js');
fs.writeFileSync(
  path.join(tmp, 'bin', 'codehere'),
  agent === 'copilot'
    ? `#!/bin/sh\n[ "$1" = hook ] || exec node "${bin}" "$@"\nout=$(node "${bin}" "$@"); code=$?\nprintf '%s\\t%s\\t%s\\n' "$*" "\${#out}" "$code" >> "${calls}"\nprintf '%s' "$out"\nexit $code\n`
    : `#!/bin/sh\nexec node "${bin}" "$@"\n`,
  { mode: 0o755 }
);
fs.mkdirSync(repo);
sh('git init -q -b main && git config user.name Kai && git config user.email kai@example.com');
write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
write('src/price.js', 'export const parsePrice = (s) => Number(s);\n');
write('test/price.test.js', "import test from 'node:test';\nimport assert from 'node:assert';\nimport { parsePrice } from '../src/price.js';\ntest('plain', () => assert.equal(parsePrice('12'), 12));\ntest('pound sign', () => assert.equal(parsePrice('£12'), 12));\n");
sh('git add -A && git commit -qm shop');
sh(`codehere init --agent ${agent !== 'copilot' ? agent : claudeHooksOnly ? 'claude' : 'claude,copilot'}`);
// Approve as the developer would, from a terminal of their own: detached from this process, which
// may run under an agent, and codehere refuses to be confirmed from under one.
const approved = path.join(tmp, 'approved');
const term = process.platform === 'darwin' ? 'script -q /dev/null codehere approve' : "script -qec 'codehere approve' /dev/null";
spawnSync('bash', ['-c', `( (sleep 0.8; printf 'y\\r'; sleep 0.5) | ${term} > /dev/null 2>&1; touch "${approved}" ) & exit 0`], { cwd: repo, env, stdio: 'ignore' });
while (!fs.existsSync(approved)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
sh(`codehere rule "${RULE}"`);
const failing = spawnSync('npm', ['test', '--silent'], { cwd: repo, env, encoding: 'utf8' });
const sig = signature(`${failing.stdout}\n${failing.stderr}`);
const head = sh('git rev-parse --short HEAD');
write(
  '.codehere/lessons/2026-10-21-pound-sign.md',
  `---\ntitle: Price parse fails on a pound prefix\nsignature: ${sig}\nauthor: Ana\ndate: 2026-10-21\nstate: verified\nproof_command: npm test --silent\nproof_exit: 0\nproof_commit: ${head}\nproof_dirty: true\nfiles: ["src/price.js"]\nfile_hashes: ["0000000000000000000000000000000000000000"]\n---\n## Fix\n- Cause: parsePrice returns NaN when the string starts with a currency sign.\n- Fix: Strip the currency sign in parsePrice before parsing.\n`
);
sh('git add -A && git commit -qm "codehere, rule and lesson"');
const start = sh('git rev-parse HEAD');
if (!sh('codehere status').includes('· approved on this machine')) throw new Error('setup: the test command is not approved');

// ---------- the agent ----------

async function trustCodexHooks() {
  // The record Codex's /hooks screen writes, in the scratch CODEX_HOME only.
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  fs.writeFileSync(path.join(env.CODEX_HOME, 'config.toml'), `[projects."${repo}"]\ntrust_level = "trusted"\n`);
  const p = spawn('codex', ['app-server'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map();
  readline.createInterface({ input: p.stdout }).on('line', (l) => {
    try {
      const m = JSON.parse(l);
      if (waiting.has(m.id)) waiting.get(m.id)(m);
    } catch {}
  });
  let id = 0;
  const call = (method, params) =>
    Promise.race([
      new Promise((res) => (waiting.set(++id, res), p.stdin.write(JSON.stringify({ id, method, params }) + '\n'))),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`codex app-server: no answer to ${method}`)), 20000).unref()),
    ]);
  await call('initialize', { clientInfo: { name: 'codehere-conformance', version: '0.0.1' } });
  p.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const list = await call('hooks/list', { cwds: [repo] });
  const ours = list.result.data.flatMap((d) => d.hooks).filter((h) => h.source === 'project');
  await call('config/batchWrite', { edits: [{ keyPath: 'hooks.state', value: Object.fromEntries(ours.map((h) => [h.key, { trusted_hash: h.currentHash }])), mergeStrategy: 'upsert' }], filePath: null, expectedVersion: null, reloadUserConfig: true });
  const again = await call('hooks/list', { cwds: [repo] });
  p.kill();
  return again.result.data.flatMap((d) => d.hooks).filter((h) => h.source === 'project').map((h) => `${h.eventName} ${h.trustStatus}`);
}

// A local model for Copilot, in the scratch COPILOT_HOME only.
function copilotLocalModel() {
  fs.mkdirSync(env.COPILOT_HOME, { recursive: true });
  const providers = {
    providers: [{ name: 'local', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', modelProvider: 'ollama' }],
    models: [{ id: model, provider: 'local', maxPromptTokens: 24576, maxContextWindowTokens: 32768, maxOutputTokens: 4096, capabilities: { supports: { vision: false, toolCalls: true } } }],
  };
  fs.writeFileSync(path.join(env.COPILOT_HOME, 'providers.json'), JSON.stringify(providers, null, 2));
}

function runAgent(prompt) {
  const started = Date.now();
  // --trust-folder answers Copilot's "do you trust this folder?" for this run only, as a developer would
  const copilotArgs = [
    '--trust-folder', '--no-ask-user', '--no-color', '--model', oss ? `local/${model}` : model,
    '--log-dir', path.join(tmp, 'copilot-logs'), '--log-level', 'all',
    '--allow-tool', 'shell(npm test)', '--allow-tool', 'shell(npm test --silent)', '--allow-tool', 'write', '-p', prompt,
  ];
  const r =
    agent === 'claude'
      ? spawnSync('claude', ['-p', '--model', model, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(npm test:*)', 'Bash(node --test:*)', '--output-format', 'json', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 600000, input: '' })
      : agent === 'codex'
        ? spawnSync('codex', ['exec', ...(oss ? ['--oss', '--local-provider', 'ollama'] : []), '-m', model, '-s', 'workspace-write', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' })
        : spawnSync(copilotBin, copilotArgs, { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' });
  const state = JSON.parse(fs.readFileSync(path.join(repo, '.codehere/local/state.json'), 'utf8'));
  const sid = state.lastSession;
  const s = state.sessions[sid];
  if (agent === 'copilot') s.transcript = path.join(env.COPILOT_HOME, 'session-state', sid, 'events.jsonl');
  return { sid, s, seconds: Math.round((Date.now() - started) / 1000), exit: r.status, out: r.stdout || '', err: r.stderr || '' };
}

// What the model was given, from the transcript the agent wrote.
function readTranscript(file) {
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const text = (c) => (Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : x.text || '')).join('\n') : String(c ?? ''));
  if (agent === 'claude') {
    // a SessionStart hook's plain output is recorded as hook_success, and sent to the model as context
    const hookText = (j) => j.type === 'attachment' && (j.attachment.type === 'hook_additional_context' || (j.attachment.type === 'hook_success' && j.attachment.hookEvent === 'SessionStart'));
    return {
      start: rows.filter((j) => hookText(j) && j.attachment.hookEvent === 'SessionStart').map((j) => text(j.attachment.content)),
      context: rows.filter(hookText).map((j) => text(j.attachment.content)),
      sent: rows.filter((j) => j.type === 'api-request-blob').map((j) => JSON.stringify(j.message)),
      prompts: rows.filter((j) => j.type === 'user' && typeof j.message?.content === 'string' && j.message.content.startsWith('Stop hook feedback:')).map((j) => j.message.content),
      lines: rows.filter((j) => j.type === 'attachment' && j.attachment.type === 'hook_system_message').map((j) => text(j.attachment.content)),
    };
  }
  if (agent === 'copilot') {
    // Copilot records a hook's output in hook.end, post-tool context inside the tool result, and a
    // Stop block's reason as the next user message. What reached the model is in the debug log.
    const startCtx = rows.filter((j) => j.type === 'hook.end' && j.data?.hookType === 'sessionStart').map((j) => text(j.data.output?.additionalContext));
    const logs = path.join(tmp, 'copilot-logs');
    return {
      start: startCtx,
      context: [...startCtx, ...rows.filter((j) => j.type === 'tool.execution_complete').map((j) => text(j.data?.result?.content))],
      sent: fs.readdirSync(logs).flatMap((l) => fs.readFileSync(path.join(logs, l), 'utf8').split('\n')).filter((l) => /^\s*"content": /.test(l)),
      prompts: rows.filter((j) => j.type === 'user.message').map((j) => text(j.data?.content)),
      lines: null, // Copilot has no field for a line to the developer
    };
  }
  const items = rows.filter((j) => j.type === 'response_item');
  const firstCall = items.findIndex((j) => /_call$/.test(j.payload?.type || ''));
  const messages = items.map((j, i) => ({ i, type: j.payload?.type, role: j.payload?.role, text: text(j.payload?.content) })).filter((m) => m.type === 'message');
  return {
    start: messages.filter((m) => m.role === 'developer' && (firstCall < 0 || m.i < firstCall)).map((m) => m.text),
    context: messages.filter((m) => m.role === 'developer').map((m) => m.text),
    sent: null, // response items are the model's input
    prompts: messages.filter((m) => m.role === 'user' && m.text.startsWith('<hook_prompt')).map((m) => m.text),
    lines: null, // Codex keeps a hook's systemMessage out of the transcript
  };
}

const version = sh(`"${agent === 'copilot' ? copilotBin : agent}" --version`, tmp).match(/\d+\.\d+\.\d+/)[0];
const trust = agent === 'codex' ? await trustCodexHooks() : null;
if (agent === 'copilot' && oss) copilotLocalModel();
const results = [];
const verdict = (id, name, status, evidence) => results.push({ id, name, status, evidence });

const one = runAgent(PROMPTS[0]);
const t1 = readTranscript(one.s.transcript);
const testsAfter1 = spawnSync('npm', ['test', '--silent'], { cwd: repo, env }).status;
const ruleSent = !t1.sent || t1.sent.some((b) => b.includes(RULE.slice(0, 30)));
verdict('L1', "The team rules are in the model's context at the start", t1.start.some((c) => c.includes(RULE)) && ruleSent ? 'PASS' : 'FAIL', `${t1.start.filter((c) => c.includes(RULE)).length} context message(s) before the first tool call hold the rule${t1.sent ? `; in a request sent to the model: ${ruleSent ? 'yes' : 'no'}` : ''}`);
const failuresSeen = Object.values(one.s.errors || {}).reduce((a, b) => a + b, 0);
const lessons = t1.context.filter((c) => c.includes(LESSON_HEAD)).length;
verdict(
  'L2',
  "After the tests fail, the teammate's lesson is in the model's context, once",
  !failuresSeen ? 'BLOCKED' : lessons === 1 ? 'PASS' : 'FAIL',
  !failuresSeen ? 'the agent ran no failing command' : `${failuresSeen} failed command(s) seen by Codehere; the lesson is in ${lessons} context message(s)`
);

sh(`git checkout -q ${start} -- . && git clean -fdq`);
const two = runAgent(PROMPTS[1]);
const t2 = readTranscript(two.s.transcript);
const blocks = two.sid === one.sid ? 0 : two.s.stopBlocks || 0; // the same id: the second session never reached Codehere
const sentBack = t2.prompts.filter((p) => p.includes(SENT_BACK)).length;
verdict(
  'L3',
  "After the agent breaks a test and stops, Codehere's failure reason is the next prompt, at most 3 times",
  !blocks ? 'BLOCKED' : sentBack >= 1 && sentBack <= 3 && sentBack <= blocks ? 'PASS' : 'FAIL',
  !blocks ? 'Codehere sent nothing back (did the agent change src/price.js?)' : `Codehere sent the agent back ${blocks} time(s); ${sentBack} next prompt(s) hold the reason`
);

if (agent === 'copilot' && !claudeHooksOnly) {
  const hookCalls = fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map((l) => l.split('\t')).filter(([a]) => a.startsWith('hook ')) : [];
  const fromClaudeFile = hookCalls.filter(([a]) => !a.includes('--agent copilot'));
  const own = hookCalls.filter(([a]) => a.includes('--agent copilot'));
  verdict(
    'L4',
    "Nothing runs twice: Copilot also runs the Claude Code hooks, and they print nothing",
    !fromClaudeFile.length || !own.length ? 'BLOCKED' : fromClaudeFile.every(([, size]) => size === '0') ? 'PASS' : 'FAIL',
    `${own.length} call(s) from .github/hooks/codehere.json; ${fromClaudeFile.length} from .claude/settings.json, ${fromClaudeFile.filter(([, size]) => size !== '0').length} of them printed something`
  );
}

// ---------- result file ----------

const today = new Date().toISOString().slice(0, 10);
// a --bin path can name the developer's home folder: keep only the file name
const shownArgs = args.map((a, i) => (args[i - 1] === '--bin' ? `<path>/${path.basename(a)}` : a)).join(' ');
const build = `${JSON.parse(fs.readFileSync(path.join(V2, 'package.json'), 'utf8')).version} at ${execSync('git rev-parse --short HEAD', { cwd: V2 }).toString().trim()}${execSync('git status --porcelain -- src bin', { cwd: V2 }).toString().trim() ? ' plus uncommitted changes' : ''}`;
const name = { claude: 'Claude Code', codex: 'Codex CLI', copilot: 'Copilot CLI' }[agent];
const lines = (t) => (t.lines ? t.lines.map((l) => `\`${l}\``).join('<br>') || 'none' : `not recorded by ${name}`);
const md = [
  `# Conformance: ${name} ${version}, ${today}`,
  '',
  `Codehere ${build}. Model: ${model}${oss ? (agent === 'codex' ? ' through Ollama (`codex exec --oss`)' : ' through Ollama, as a provider in the scratch providers.json') : ''}. Run with \`node scripts/conformance.mjs ${shownArgs}\`, in a scratch folder with its own approvals${agent === 'codex' ? ' and CODEX_HOME' : agent === 'copilot' ? ' and COPILOT_HOME' : ''}.`,
  ...(trust ? ['', `Codex hooks trusted in the scratch CODEX_HOME by writing their \`trusted_hash\` through Codex's app-server (\`hooks/list\`, \`config/batchWrite\`), not through the \`/hooks\` screen: ${trust.join(', ')}.`] : []),
  ...(agent === 'claude' ? ['', 'Claude Code ran with the user\'s own `~/.claude` settings and user-level hooks.'] : []),
  ...(agent === 'copilot' ? ['', `Copilot ran with \`--trust-folder\` (trust for this run only) and could run only \`npm test\` and edit files. Hooks installed: ${claudeHooksOnly ? '`.claude/settings.json` only' : '`.claude/settings.json` and `.github/hooks/codehere.json`'}.`] : []),
  '',
  '| Check | Result | Evidence |',
  '|---|---|---|',
  ...results.map((x) => `| ${x.id} ${x.name} | ${x.status} | ${x.evidence} |`),
  '',
  '| Session | Prompt | Agent exit | Time | Tests after | Lines for the developer |',
  '|---|---|---|---|---|---|',
  `| ${one.sid} | ${PROMPTS[0].replace(/\|/g, '\\|')} | ${one.exit} | ${one.seconds} s | ${testsAfter1 === 0 ? 'pass' : 'fail'} | ${lines(t1)} |`,
  `| ${two.sid} | ${PROMPTS[1].replace(/\|/g, '\\|')} | ${two.exit} | ${two.seconds} s | ${spawnSync('npm', ['test', '--silent'], { cwd: repo, env }).status === 0 ? 'pass' : 'fail'} | ${lines(t2)} |`,
  '',
  'PASS: observed as written. FAIL: observed different. BLOCKED: the agent did not do the step the check needs, so it says nothing about Codehere.',
  '',
].join('\n');
const outDir = path.join(V2, 'docs', 'conformance');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${today}-${agent}-${version}-${model.replace(/[^a-z0-9.]+/gi, '-')}${claudeHooksOnly ? '-claude-hooks-only' : ''}.md`);
fs.writeFileSync(outFile, md);
console.log(md);
console.log(`Written: ${path.relative(V2, outFile)}\nScratch folder: ${tmp}`);
process.exit(results.every((x) => x.status === 'PASS') ? 0 : 1);
