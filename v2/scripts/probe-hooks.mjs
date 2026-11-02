#!/usr/bin/env node
// What a real agent sends Codehere's hooks in the situations 2.1.0 depends on (its stage 2 probes).
//
//   node scripts/probe-hooks.mjs --agent claude --model haiku
//   node scripts/probe-hooks.mjs --agent codex --model qwen3.5:9b-q4_K_M --oss
//   node scripts/probe-hooks.mjs --agent copilot --model qwen3.5:9b-q4_K_M --oss --bin <path to copilot>
//
// P1  a `codehere` command that succeeds reaches the after-tool hook, with its command line and its output
// P2  when the finish check sends the agent back, whether the prompt hook runs, and with what text
// P3  a resumed session keeps its session id, so the person's next message reaches the same session
// P4  whether a `codehere` command the agent runs can write outside the repo, and inside .codehere/local/
//
// Three turns in one scratch repo: T1 runs `codehere status`, T2 resumes with "yes", T3 resumes and breaks
// a test. A wrapper around `codehere` logs each hook call. The inputs go to
// test/fixtures/payloads/<agent>-<version>-probe.jsonl and the findings to docs/evidence/<date>-probe-<agent>-<version>.md.
// As in conformance.mjs, the approvals and the agent's own home are in the scratch folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const agent = flag('agent');
const model = flag('model');
const oss = args.includes('--oss');
const copilotBin = flag('bin') || 'copilot';
if (!['claude', 'codex', 'copilot'].includes(agent) || !model) {
  console.error('Usage: node scripts/probe-hooks.mjs --agent claude|codex|copilot --model <model> [--oss] [--bin <path>]');
  process.exit(1);
}

const PROMPTS = [
  'Run the shell command `codehere status` once. Then reply with the first line it printed, and nothing else.',
  'yes',
  'Change src/price.js so that parsePrice always returns 0. Do not run any tests. Reply in one line when done.',
];
const STATUS_LINE = 'approved on this machine';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `codehere-probe-${agent}-`)));
const repo = path.join(tmp, 'shop');
const probe = path.join(repo, '.codehere', 'local', 'probe');
const env = { ...process.env, XDG_CONFIG_HOME: path.join(tmp, 'config'), PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}` };
delete env.ANTHROPIC_API_KEY; // claude -p uses the signed-in account
if (agent === 'codex') env.CODEX_HOME = path.join(tmp, 'codex-home');
if (agent === 'copilot') env.COPILOT_HOME = path.join(tmp, 'copilot-home');
const sh = (cmd, cwd = repo) => execSync(cmd, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const write = (f, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
  fs.writeFileSync(path.join(repo, f), text);
};

// ---------- the wrapper: every hook call is logged; every other call tries two writes first (P4) ----------

fs.mkdirSync(path.join(tmp, 'bin'));
const bin = path.join(V2, 'bin', 'codehere.js');
const outside = path.join(tmp, 'config', 'codehere');
fs.writeFileSync(
  path.join(tmp, 'bin', 'codehere'),
  `#!/bin/sh
P="${probe}"
mkdir -p "$P" 2>/dev/null
id="$$-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')"
if [ "$1" != hook ]; then
  o=no; mkdir -p "${outside}" 2>/dev/null && touch "${outside}/probe-$id" 2>/dev/null && o=yes
  i=no; touch "$P/cli-$id" 2>/dev/null && i=yes
  printf '%s\\t%s\\t%s\\n' "$*" "$o" "$i" >> "$P/cli.tsv"
  exec node "${bin}" "$@"
fi
in=$(cat)
out=$(printf '%s' "$in" | node "${bin}" "$@"); code=$?
printf '%s' "$in" > "$P/in.$id"; printf '%s' "$out" > "$P/out.$id"
printf '%s\\t%s\\t%s\\n' "$*" "$id" "$code" >> "$P/hooks.tsv"
printf '%s' "$out"
exit $code
`,
  { mode: 0o755 }
);

// ---------- the repo: passing tests, the test command approved ----------

fs.mkdirSync(repo);
sh('git init -q -b main && git config user.name Kai && git config user.email kai@example.com');
write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
write('src/price.js', "export const parsePrice = (s) => Number(String(s).replace(/^£/, ''));\n");
write('test/price.test.js', "import test from 'node:test';\nimport assert from 'node:assert';\nimport { parsePrice } from '../src/price.js';\ntest('plain', () => assert.equal(parsePrice('12'), 12));\ntest('pound sign', () => assert.equal(parsePrice('£12'), 12));\n");
sh('git add -A && git commit -qm shop');
sh(`codehere init --agent ${agent}`);
const approved = path.join(tmp, 'approved');
const term = process.platform === 'darwin' ? 'script -q /dev/null codehere approve' : "script -qec 'codehere approve' /dev/null";
spawnSync('bash', ['-c', `( (sleep 0.8; printf 'y\\r'; sleep 0.5) | ${term} > /dev/null 2>&1; touch "${approved}" ) & exit 0`], { cwd: repo, env, stdio: 'ignore' });
while (!fs.existsSync(approved)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
sh('git add -A && git commit -qm codehere');
if (!sh('codehere status').includes(STATUS_LINE)) throw new Error('setup: the test command is not approved');
fs.rmSync(probe, { recursive: true, force: true }); // only the agent's calls from here on

// ---------- the agent ----------

async function trustCodexHooks() {
  // The record Codex's /hooks screen writes, in the scratch CODEX_HOME only (as in conformance.mjs).
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
  await call('initialize', { clientInfo: { name: 'codehere-probe', version: '0.0.1' } });
  p.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const list = await call('hooks/list', { cwds: [repo] });
  const ours = list.result.data.flatMap((d) => d.hooks).filter((h) => h.source === 'project');
  await call('config/batchWrite', { edits: [{ keyPath: 'hooks.state', value: Object.fromEntries(ours.map((h) => [h.key, { trusted_hash: h.currentHash }])), mergeStrategy: 'upsert' }], filePath: null, expectedVersion: null, reloadUserConfig: true });
  p.kill();
}

function copilotLocalModel() {
  fs.mkdirSync(env.COPILOT_HOME, { recursive: true });
  const providers = {
    providers: [{ name: 'local', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', modelProvider: 'ollama' }],
    models: [{ id: model, provider: 'local', maxPromptTokens: 24576, maxContextWindowTokens: 32768, maxOutputTokens: 4096, capabilities: { supports: { vision: false, toolCalls: true } } }],
  };
  fs.writeFileSync(path.join(env.COPILOT_HOME, 'providers.json'), JSON.stringify(providers, null, 2));
}

// Codex: the default workspace-write sandbox, except that the temp folders are not writable, so the
// scratch config folder stands where ~/.config would be: outside the repo and outside the sandbox.
const codexConfig = [
  '-c', 'sandbox_mode="workspace-write"',
  '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true',
  '-c', 'sandbox_workspace_write.exclude_slash_tmp=true',
  ...(oss ? ['-c', 'model_provider="ollama"'] : []),
];

function runAgent(prompt, sid) {
  const started = Date.now();
  const r =
    agent === 'claude'
      ? spawnSync('claude', ['-p', ...(sid ? ['--resume', sid] : []), '--setting-sources', 'project,local', '--model', model, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(codehere:*)', 'Bash(npm test:*)', '--output-format', 'json', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 600000, input: '' })
      : agent === 'codex'
        ? spawnSync('codex', ['exec', ...(sid ? ['resume', sid] : oss ? ['--oss', '--local-provider', 'ollama'] : []), ...codexConfig, '-m', model, prompt], { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' })
        : spawnSync(copilotBin, [...(sid ? ['--resume', sid] : []), '--no-ask-user', '--no-color', '--disable-builtin-mcps', '--model', oss ? `local/${model}` : model, '--allow-tool', 'shell(codehere:*)', '--allow-tool', 'shell(npm test)', '--allow-tool', 'write', '-p', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' });
  return { seconds: Math.round((Date.now() - started) / 1000), exit: r.status, out: (r.stdout || '').slice(-600), err: (r.stderr || '').slice(-600) };
}

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
function hookCalls() {
  return read(path.join(probe, 'hooks.tsv')).split('\n').filter(Boolean).map((l) => {
    const [a, id, code] = l.split('\t');
    let input = null;
    try {
      input = JSON.parse(read(path.join(probe, `in.${id}`)));
    } catch {}
    return { event: a.split(' ')[1], input, out: read(path.join(probe, `out.${id}`)), code: Number(code) };
  });
}
const sessionOf = (c) => c.input?.session_id || c.input?.sessionId || null;

const version = sh(`"${agent === 'copilot' ? copilotBin : agent}" --version`, tmp).match(/\d+\.\d+\.\d+/)[0];
if (agent === 'codex') await trustCodexHooks();
if (agent === 'copilot' && oss) copilotLocalModel();
// The folder trust a developer saves once. --trust-folder covers one new session only, and Copilot
// refuses it with --resume; a resumed session in an untrusted folder runs none of the repo's hooks.
if (agent === 'copilot') {
  fs.mkdirSync(env.COPILOT_HOME, { recursive: true });
  fs.writeFileSync(path.join(env.COPILOT_HOME, 'config.json'), JSON.stringify({ trustedFolders: [repo] }, null, 2));
}

const turns = [];
let sid = null;
for (const [i, prompt] of PROMPTS.entries()) {
  const before = hookCalls().length;
  const run = runAgent(prompt, sid);
  const calls = hookCalls().slice(before);
  sid = sid || calls.map(sessionOf).find(Boolean) || null;
  turns.push({ prompt, run, calls });
  console.error(`T${i + 1}: exit ${run.exit}, ${run.seconds}s, ${calls.length} hook call(s): ${calls.map((c) => c.event).join(' ')}`);
  if (!sid) break;
}

// ---------- findings ----------

// Where in a payload a piece of text sits, as dotted paths.
function pathsOf(value, needle, at = '') {
  if (typeof value === 'string') return value.includes(needle) ? [at || '.'] : [];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => pathsOf(v, needle, at ? `${at}.${k}` : k));
  return [];
}
const all = turns.flatMap((t, i) => t.calls.map((c) => ({ ...c, turn: i + 1 })));
const blocked = (c) => c.event === 'stop' && (c.code === 2 || /"decision"\s*:\s*"block"/.test(c.out));
const rows = [];
const row = (id, question, answer) => rows.push({ id, question, answer });

const t1 = all.filter((c) => c.turn === 1);
const statusCalls = t1.filter((c) => c.event === 'post-tool' && pathsOf(c.input, 'codehere status').length);
const cli = read(path.join(probe, 'cli.tsv')).split('\n').filter(Boolean).map((l) => l.split('\t'));
// The agent's shell may find another `codehere` before the wrapper (Codex runs a login shell, which
// rebuilds PATH from the developer's profile), so a call can reach the hooks without reaching cli.tsv.
const ranCodehere = all.some((c) => c.event === 'post-tool' && pathsOf(c.input, 'codehere ').length);
row(
  'P1',
  'A `codehere` command that succeeds reaches the after-tool hook, with its command and output',
  !cli.length && !ranCodehere
    ? 'BLOCKED: the agent ran no `codehere` command'
    : statusCalls.length
      ? statusCalls.map((c) => `yes: command at \`${pathsOf(c.input, 'codehere status').join(', ')}\`; output ${pathsOf(c.input, STATUS_LINE).length ? `at \`${pathsOf(c.input, STATUS_LINE).join(', ')}\`` : 'not in the input'}`).join('; ')
      : `no: ${cli.length} \`codehere\` call(s) ran, and no after-tool input holds the command (after-tool calls in T1: ${t1.filter((c) => c.event === 'post-tool').length})`
);

const t3 = all.filter((c) => c.turn === 3);
const firstBlock = t3.findIndex(blocked);
const afterBlock = firstBlock < 0 ? [] : t3.slice(firstBlock + 1);
const nextStop = afterBlock.findIndex((c) => c.event === 'stop');
const between = nextStop < 0 ? afterBlock : afterBlock.slice(0, nextStop);
const promptsBetween = between.filter((c) => c.event === 'prompt');
const promptText = (c) => String(c.input?.prompt ?? c.input?.userPrompt ?? c.input?.initialPrompt ?? '');
row(
  'P2',
  'After the finish check sends the agent back, the prompt hook runs, and with what text',
  firstBlock < 0
    ? `BLOCKED: no stop in T3 sent the agent back (stops in T3: ${t3.filter((c) => c.event === 'stop').length})`
    : promptsBetween.length
      ? `yes, ${promptsBetween.length} time(s); the text starts: ${promptsBetween.map((c) => `\`\` ${promptText(c).slice(0, 80).replace(/\n/g, '⏎')} \`\``).join(', ')}`
      : `no: ${between.length} hook call(s) between the send-back and the next stop (${between.map((c) => c.event).join(' ') || 'none'}), none of them the prompt hook`
);

const ids = turns.map((t) => [...new Set(t.calls.map(sessionOf).filter(Boolean))]);
const starts = all.filter((c) => c.event === 'session-start').map((c) => `T${c.turn} ${c.input?.source ?? '?'}`);
const t2prompt = all.find((c) => c.turn === 2 && c.event === 'prompt');
row(
  'P3',
  'A resumed session keeps its session id',
  turns.length < 3
    ? `BLOCKED: stopped after T${turns.length}`
    : `${ids.every((x) => x.length === 1 && x[0] === ids[0][0]) ? 'yes' : 'no'}: session ids by turn ${ids.map((x, i) => `T${i + 1} ${x.length ? x.map((s) => s.slice(0, 8)).join('/') : 'none'}`).join(', ')}; session-start: ${starts.join(', ') || 'none'}; T2 prompt hook text: ${t2prompt ? `\`${promptText(t2prompt)}\`` : 'none'}`
);

// Codex: the same writes straight through its sandbox, with the settings the turns used
if (agent === 'codex') {
  const box = codexConfig.slice(0, 6); // the three sandbox settings, without the model provider
  fs.mkdirSync(outside, { recursive: true });
  const sbx = (f) => spawnSync('codex', ['sandbox', ...box, '--', 'touch', f], { cwd: repo, env, input: '' }).status === 0 ? 'yes' : 'no';
  row('P4b', 'Under `codex sandbox` with the turns\' settings, `touch` outside the repo / inside .codehere/local/', `outside ${sbx(path.join(outside, 'sandbox-probe'))}, inside ${sbx(path.join(probe, 'sandbox-probe'))}`);
}
row(
  'P4',
  'A `codehere` command the agent runs can write outside the repo / inside .codehere/local/',
  cli.length
    ? cli.map(([a, o, i]) => `\`codehere ${a}\`: outside ${o}, inside ${i}`).join('; ')
    : ranCodehere
      ? "BLOCKED: the agent's `codehere` call did not go through the probe's wrapper (its shell found another `codehere` first)"
      : 'BLOCKED: the agent ran no `codehere` command'
);

// ---------- recordings and result file ----------

const scrub = (s) => s.split(repo).join('<repo>').split(tmp).join('<tmp>').split(os.homedir()).join('<home>');
const name = { claude: 'claude-code', codex: 'codex', copilot: 'copilot-cli' }[agent];
const fixture = path.join(V2, 'test', 'fixtures', 'payloads', `${name}-${version}-probe.jsonl`);
fs.writeFileSync(fixture, all.map((c) => scrub(JSON.stringify({ event: c.event, turn: c.turn, input: c.input, blocked: blocked(c) || undefined }))).join('\n') + '\n');

const today = new Date().toISOString().slice(0, 10);
const shownArgs = args.map((a, i) => (args[i - 1] === '--bin' ? `<path>/${path.basename(a)}` : a)).join(' ');
const build = `${JSON.parse(fs.readFileSync(path.join(V2, 'package.json'), 'utf8')).version} at ${execSync('git rev-parse --short HEAD', { cwd: V2 }).toString().trim()}`;
const title = { claude: 'Claude Code', codex: 'Codex CLI', copilot: 'Copilot CLI' }[agent];
const md = [
  `# Probe: ${title} ${version}, ${today}`,
  '',
  `Codehere ${build}. Model: ${model}. Run with \`node scripts/probe-hooks.mjs ${shownArgs}\`.`,
  agent === 'codex' ? '\nCodex ran in its workspace-write sandbox with the temp folders not writable, so the scratch config folder stands where `~/.config` would be.' : '',
  agent === 'copilot' ? "\nThe folder's trust was saved in the scratch `COPILOT_HOME/config.json` (`trustedFolders`), as a developer's own trust is. `--trust-folder` covers one new session only, and Copilot refuses it with `--resume`." : '',
  '',
  '| Turn | Prompt | Exit | Seconds | Hook calls, in order |',
  '|---|---|---|---|---|',
  ...turns.map((t, i) => `| T${i + 1} | ${t.prompt.replace(/\|/g, '\\|')} | ${t.run.exit} | ${t.run.seconds} | ${t.calls.map((c) => c.event + (blocked(c) ? ' (sent back)' : '')).join(', ') || 'none'} |`),
  '',
  '| | Question | Answer |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.question} | ${scrub(r.answer).replace(/\|/g, '\\|')} |`),
  '',
  `Inputs: \`test/fixtures/payloads/${path.basename(fixture)}\`.`,
  '',
].join('\n');
const out = path.join(V2, 'docs', 'evidence', `${today}-probe-${agent}-${version}.md`);
fs.writeFileSync(out, md);
console.log(md);
