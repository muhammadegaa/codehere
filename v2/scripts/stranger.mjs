// Launch bar L10: a stranger's first run on a public repo, following the README.
// npm install -g codehere@next into a scratch prefix (first on PATH), a fresh clone, the repo's own setup,
// codehere init --agent claude at a terminal detached from any agent (answering y to the approval), then one
// Claude Code session told to break the code. Measures the time from the install to the first ✕ line.
// Usage: node v2/scripts/stranger.mjs <work dir> <git url> <setup command or ""> <prompt> <allowed Bash tool>
// It clones a public repo and runs its tests and a Claude Code session in it: downloaded code, so a person starts it.
import { spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [W, URL, SETUP, PROMPT, TOOL] = process.argv.slice(2);
fs.rmSync(W, { recursive: true, force: true });
for (const d of ['prefix', 'config', 'tmp']) fs.mkdirSync(path.join(W, d), { recursive: true });
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const bin = (c) => path.dirname(execSync(`command -v ${c}`).toString().trim());
const env = {
  HOME: os.homedir(), // Claude Code's own login; Codehere's state goes to XDG_CONFIG_HOME below
  USER: process.env.USER,
  SHELL: process.env.SHELL,
  LANG: process.env.LANG || 'en_US.UTF-8',
  TERM: 'xterm-256color',
  XDG_CONFIG_HOME: path.join(W, 'config'),
  TMPDIR: path.join(W, 'tmp'),
  npm_config_prefix: path.join(W, 'prefix'),
  npm_config_cache: path.join(W, 'tmp', 'npm-cache'),
  PATH: [path.join(W, 'prefix', 'bin'), bin('claude'), bin('node'), bin('python3'), '/usr/bin', '/bin'].join(':'),
};
const sh = (cmd, cwd = W) => {
  const r = spawnSync('bash', ['-c', cmd], { cwd, env, encoding: 'utf8' });
  console.log(`[${at()}] $ ${cmd}  -> exit ${r.status}`);
  if (r.status !== 0) console.log((r.stdout + r.stderr).split('\n').slice(-6).join('\n'));
  return r;
};
const terminal = (cmd, cwd, answer) => {
  const f = path.join(W, 'tmp', `term-${Date.now()}`);
  fs.writeFileSync(`${f}.sh`, `${cmd}\n`);
  spawnSync('bash', ['-c', `( (sleep 1.5; printf '${answer}\\r'; sleep 1) | script -q /dev/null bash "${f}.sh" > "${f}.out" 2>&1; echo $? > "${f}.code" ) & exit 0`], { cwd, env, stdio: 'ignore' });
  while (!(fs.existsSync(`${f}.code`) && fs.readFileSync(`${f}.code`, 'utf8').endsWith('\n'))) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  const out = fs.readFileSync(`${f}.out`, 'utf8').replace(/\r/g, '');
  console.log(`[${at()}] $ ${cmd}  (at a terminal, answering ${answer})  -> exit ${fs.readFileSync(`${f}.code`, 'utf8').trim()}`);
  console.log(out.split('\n').filter((l) => /set up|Test check|Approved|on PATH|not approved/i.test(l)).map((l) => `    ${l.trim()}`).join('\n'));
};

sh('npm install -g codehere@next --no-audit --no-fund');
sh('codehere --version; command -v codehere');
const repo = path.join(W, 'repo');
sh(`git clone -q --depth 1 ${URL} repo`);
if (SETUP) sh(SETUP, repo);
sh('git config user.email stranger@example.com && git config user.name Stranger', repo);
terminal('codehere init --agent claude', repo, 'y');
console.log(`[${at()}] config: ${fs.readFileSync(path.join(repo, '.codehere/config.json'), 'utf8').replace(/\s+/g, ' ')}`);
const before = sh('codehere status', repo);
console.log(before.stdout.split('\n').filter((l) => /Test check/.test(l)).join('\n'));

const baseline = sh(JSON.parse(fs.readFileSync(path.join(repo, '.codehere/config.json'), 'utf8')).testCommand, repo);
console.log(`baseline tests before the session: exit ${baseline.status}`);
const started = Date.now();
const r = spawnSync('claude', ['-p', '--model', 'haiku', '--permission-mode', 'acceptEdits', '--allowedTools', TOOL, '--output-format', 'json', PROMPT], { cwd: repo, env, encoding: 'utf8', timeout: 600000, input: '' });
let sid = '';
try {
  sid = JSON.parse(r.stdout).session_id;
} catch {}
console.log(`[${at()}] claude -p exit ${r.status}, session ${sid}, ${Math.round((Date.now() - started) / 1000)} s`);
const slug = fs.realpathSync(repo).replace(/[^A-Za-z0-9]/g, '-');
const tf = path.join(os.homedir(), '.claude', 'projects', slug, `${sid}.jsonl`);
const rows = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return {}; } }) : [];
const lines = rows.filter((j) => j.type === 'attachment' && j.attachment?.type === 'hook_system_message').map((j) => ({ ts: j.timestamp, text: String(j.attachment.content) }));
const sentBack = rows.filter((j) => j.type === 'user' && typeof j.message?.content === 'string' && j.message.content.startsWith('Stop hook feedback:')).length;
console.log(`transcript: ${fs.existsSync(tf) ? 'found' : 'missing'}; send-backs as next prompt: ${sentBack}`);
for (const l of lines) console.log(`  ${l.ts}  ${l.text}`);
const firstCross = lines.find((l) => l.text.startsWith('codehere ✕'));
console.log(firstCross ? `FIRST ✕ LINE at ${((Date.parse(firstCross.ts) - t0) / 1000).toFixed(1)} s after the install started` : 'NO ✕ LINE');
console.log(`tests after the session: exit ${spawnSync('bash', ['-c', JSON.parse(fs.readFileSync(path.join(repo, '.codehere/config.json'), 'utf8')).testCommand], { cwd: repo, env }).status}`);
