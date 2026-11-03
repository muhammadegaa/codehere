// What the live runs share: a scratch repo and agent homes, a `codehere` wrapper that logs every
// call, a real terminal for what the person types, Codex hook trust, Copilot's local model and
// folder trust, and one resumable turn of each agent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(V2, 'bin', 'codehere.js');
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');

// The repo, the approvals (XDG_CONFIG_HOME) and the agent's own home live in a scratch folder, so
// the developer's real config is never read or changed. Codex also gets a scratch HOME: it runs
// commands in a login shell, and the developer's profile would put a global `codehere` first.
export function scratch(agent, label) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `codehere-${label}-${agent}-`)));
  const repo = path.join(tmp, 'shop');
  const log = path.join(repo, '.codehere', 'local', 'calls'); // inside the repo: Codex's sandbox writes only there
  const env = { ...process.env, XDG_CONFIG_HOME: path.join(tmp, 'config'), PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}` };
  delete env.ANTHROPIC_API_KEY; // claude -p uses the signed-in account
  delete env.CODEHERE_TEST_AGENT;
  if (agent === 'codex') Object.assign(env, { CODEX_HOME: path.join(tmp, 'codex-home'), HOME: path.join(tmp, 'home') });
  if (agent === 'copilot') env.COPILOT_HOME = path.join(tmp, 'copilot-home');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'home'), { recursive: true });
  // Codex's login shell runs /etc/zprofile, whose path_helper puts /opt/homebrew/bin (and a global
  // codehere) first; the scratch profile puts the wrapper back in front.
  for (const f of ['.zprofile', '.zshrc', '.bash_profile', '.bashrc']) fs.writeFileSync(path.join(tmp, 'home', f), `export PATH="${path.join(tmp, 'bin')}:$PATH"\n`);
  fs.mkdirSync(path.join(tmp, 'bin'));
  fs.writeFileSync(
    path.join(tmp, 'bin', 'codehere'),
    `#!/bin/sh
L="${log}"
mkdir -p "$L" 2>/dev/null
if [ "$1" != hook ]; then
  printf '%s\\n' "$*" >> "$L/cli.log"
  exec node "${BIN}" "$@"
fi
id="$$-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')"
in=$(cat)
out=$(printf '%s' "$in" | node "${BIN}" "$@"); code=$?
printf '%s' "$in" > "$L/in.$id"; printf '%s' "$out" > "$L/out.$id"
printf '%s\\t%s\\t%s\\n' "$*" "$id" "$code" >> "$L/hooks.tsv"
printf '%s' "$out"
exit $code
`,
    { mode: 0o755 }
  );
  const sh = (cmd) => execSync(cmd, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  return { agent, tmp, repo, log, env, sh };
}

// A line the person types in their own terminal: a detached shell, so no agent is above it.
export function atTerminal(ctx, line, answer = '') {
  const f = path.join(ctx.tmp, `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(`${f}.sh`, `${line}\n`);
  const term = process.platform === 'darwin' ? `script -q /dev/null sh "${f}.sh"` : `script -qec 'sh "${f}.sh"' /dev/null`;
  spawnSync('bash', ['-c', `( (sleep 0.8; printf '${answer}\\r'; sleep 0.5) | ${term} > "${f}.out" 2>&1; echo $? > "${f}.code" ) & exit 0`], { cwd: ctx.repo, env: ctx.env, stdio: 'ignore' });
  while (!read(`${f}.code`).endsWith('\n')) wait(100);
  return read(`${f}.out`).replace(/\r/g, '');
}

export function hookCalls(ctx) {
  return read(path.join(ctx.log, 'hooks.tsv')).split('\n').filter(Boolean).map((l) => {
    const [args, id, code] = l.split('\t');
    let input = {};
    try {
      input = JSON.parse(read(path.join(ctx.log, `in.${id}`)));
    } catch {}
    return { event: args.split(' ')[1], code: Number(code), input, out: read(path.join(ctx.log, `out.${id}`)) };
  });
}
export const cliCalls = (ctx) => read(path.join(ctx.log, 'cli.log')).split('\n').filter(Boolean);
export const sessionOf = (c) => c.input?.session_id || c.input?.sessionId || null;
// The shell command an after-tool hook saw, in each agent's shape.
export function commandOf(input) {
  if (input?.tool_input?.command) return String(input.tool_input.command);
  let a = input?.toolArgs;
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a);
    } catch {}
  }
  return a?.command ? String(a.command) : '';
}

// The record Codex's /hooks screen writes, in the scratch CODEX_HOME only.
export async function trustCodexHooks(ctx) {
  const { env, repo } = ctx;
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
  try {
    await call('initialize', { clientInfo: { name: 'codehere-live', version: '0.0.1' } });
    p.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const list = await call('hooks/list', { cwds: [repo] });
    const ours = list.result.data.flatMap((d) => d.hooks).filter((h) => h.source === 'project');
    await call('config/batchWrite', { edits: [{ keyPath: 'hooks.state', value: Object.fromEntries(ours.map((h) => [h.key, { trusted_hash: h.currentHash }])), mergeStrategy: 'upsert' }], filePath: null, expectedVersion: null, reloadUserConfig: true });
  } finally {
    p.kill();
  }
}

// Copilot: the local model as a provider, and the folder trust a developer saves once. --trust-folder
// covers one new session only and is refused with --resume, where the repo's hooks would not run.
export function setUpCopilot(ctx, model, oss) {
  const home = ctx.env.COPILOT_HOME;
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ trustedFolders: [ctx.repo] }, null, 2));
  if (!oss) return;
  const providers = {
    providers: [{ name: 'local', type: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', modelProvider: 'ollama' }],
    models: [{ id: model, provider: 'local', maxPromptTokens: 24576, maxContextWindowTokens: 32768, maxOutputTokens: 4096, capabilities: { supports: { vision: false, toolCalls: true } } }],
  };
  fs.writeFileSync(path.join(home, 'providers.json'), JSON.stringify(providers, null, 2));
}

export function agentVersion(ctx, copilotBin) {
  const bin = ctx.agent === 'copilot' ? copilotBin : ctx.agent;
  return (spawnSync(bin, ['--version'], { env: ctx.env, encoding: 'utf8' }).stdout || '').match(/\d+\.\d+\.\d+/)?.[0] || 'unknown';
}

// One turn. Codex: the default workspace-write sandbox, with the temp folders not writable.
export function runAgent(ctx, { model, oss, copilotBin }, prompt, sid) {
  const { agent, repo, env } = ctx;
  const codexConfig = ['-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.exclude_tmpdir_env_var=true', '-c', 'sandbox_workspace_write.exclude_slash_tmp=true', ...(oss ? ['-c', 'model_provider="ollama"'] : [])];
  const started = Date.now();
  const r =
    agent === 'claude'
      ? spawnSync('claude', ['-p', ...(sid ? ['--resume', sid] : []), '--setting-sources', 'project,local', '--model', model, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(codehere:*)', 'Bash(npm test:*)', '--output-format', 'json', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 600000, input: '' })
      : agent === 'codex'
        ? spawnSync('codex', ['exec', ...(sid ? ['resume', sid] : oss ? ['--oss', '--local-provider', 'ollama'] : []), ...codexConfig, '-m', model, prompt], { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' })
        : spawnSync(copilotBin, [...(sid ? ['--resume', sid] : []), '--no-ask-user', '--no-color', '--disable-builtin-mcps', '--model', oss ? `local/${model}` : model, '--allow-tool', 'shell(codehere:*)', '--allow-tool', 'shell(npm test)', '--allow-tool', 'write', '-p', prompt], { cwd: repo, env, encoding: 'utf8', timeout: 900000, input: '' });
  const out = r.stdout || '';
  let reply = out;
  if (agent === 'claude') {
    try {
      reply = String(JSON.parse(out).result || '');
    } catch {}
  }
  return { seconds: Math.round((Date.now() - started) / 1000), exit: r.status, reply, err: (r.stderr || '').slice(-1500) };
}
