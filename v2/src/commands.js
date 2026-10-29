import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import {
  findRoot, paths, ensureDirs, readConfig, writeConfig, readState, writeState,
  readRules, listDocs, parseDoc, renderDoc, slug, stamp, today, git, isGitRepo, me,
  readApprovals, isApproved, addApproval, removeApprovals, markRemoved, printable, commitId,
} from './brain.js';
import { redact } from './signals.js';
import { summarize } from './gemma.js';
import { transcriptTokens } from './hooks.js';

const HOOK_EVENTS = {
  SessionStart: { cmd: 'codehere hook session-start' },
  UserPromptSubmit: { cmd: 'codehere hook prompt', timeout: 10 },
  PostToolUse: { cmd: 'codehere hook post-tool', matcher: 'Bash' },
  PostToolUseFailure: { cmd: 'codehere hook post-tool', matcher: 'Bash' },
  Stop: { cmd: 'codehere hook stop', timeout: 180 },
};

// Keep these strings stable: Codex asks every developer to trust a hook again when its definition changes.
const CODEX_HOOK_EVENTS = {
  SessionStart: { cmd: 'codehere hook session-start --agent codex' },
  UserPromptSubmit: { cmd: 'codehere hook prompt --agent codex', timeout: 10 },
  PostToolUse: { cmd: 'codehere hook post-tool --agent codex', matcher: 'Bash' },
  Stop: { cmd: 'codehere hook stop --agent codex', timeout: 180 },
};

// Copilot's own format: camelCase events, hooks listed directly under each event, timeout as
// timeoutSec. Its prompt output is dropped, so that hook only counts the turn.
const COPILOT_HOOK_EVENTS = {
  sessionStart: { cmd: 'codehere hook session-start --agent copilot' },
  userPromptSubmitted: { cmd: 'codehere hook prompt --agent copilot', timeout: 10 },
  postToolUse: { cmd: 'codehere hook post-tool --agent copilot', matcher: 'bash' },
  agentStop: { cmd: 'codehere hook stop --agent copilot', timeout: 180 },
};

const AGENTS = {
  claude: { name: 'Claude Code', file: '.claude/settings.json', events: HOOK_EVENTS },
  codex: { name: 'Codex CLI', file: '.codex/hooks.json', events: CODEX_HOOK_EVENTS },
  copilot: { name: 'Copilot CLI', file: '.github/hooks/codehere.json', events: COPILOT_HOOK_EVENTS, flat: true },
};

const ours = (h) => typeof h?.command === 'string' && h.command.startsWith('codehere hook ');
// Claude Code and Codex wrap hooks in groups; Copilot lists each hook directly.
const hooksOf = (g) => (Array.isArray(g?.hooks) ? g.hooks : [g]);

function requireRoot() {
  const root = findRoot();
  if (!root) {
    console.error('No .codehere folder here. Run `codehere init` in your project first.');
    process.exit(1);
  }
  ensureDirs(root); // git does not keep empty folders, so a fresh clone may lack some
  return root;
}

function detectTestCommand(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const t = pkg.scripts && pkg.scripts.test;
    if (t && !/no test specified/.test(t)) return 'npm test --silent';
  } catch {}
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'pytest.ini'))) return 'pytest -q';
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test ./...';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test --quiet';
  return null;
}

function mergeHooks(root, agent) {
  const file = path.join(root, agent.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  if (agent.flat) settings = { version: 1, ...settings };
  settings.hooks = settings.hooks || {};
  for (const [event, spec] of Object.entries(agent.events)) {
    const list = (settings.hooks[event] = settings.hooks[event] || []);
    const already = list.some((g) => hooksOf(g).some((h) => h?.command === spec.cmd));
    if (already) continue;
    const hook = { type: 'command', command: spec.cmd };
    if (agent.flat) {
      if (spec.matcher) hook.matcher = spec.matcher;
      if (spec.timeout) hook.timeoutSec = spec.timeout;
      list.push(hook);
      continue;
    }
    if (spec.timeout) hook.timeout = spec.timeout;
    const group = { hooks: [hook] };
    if (spec.matcher) group.matcher = spec.matcher;
    list.push(group);
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
}

// Takes Codehere's hooks out of the agent's settings file, keeping everything else.
// A file left with nothing in it is removed, and its folders up to the repo if they are then empty.
function removeHooks(root, agent) {
  const file = path.join(root, agent.file);
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  let found = false;
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event]
      .filter((g) => g && typeof g === 'object')
      .flatMap((g) => {
        if (!Array.isArray(g.hooks)) return ours(g) ? ((found = true), []) : [g];
        const kept = g.hooks.filter((h) => !ours(h));
        if (kept.length !== g.hooks.length) found = true;
        return kept.length ? [{ ...g, hooks: kept }] : [];
      });
    if (!hooks[event].length) delete hooks[event];
  }
  if (!found) return false;
  if (!Object.keys(hooks).length) delete settings.hooks;
  if (Object.keys(settings).some((k) => !(agent.flat && k === 'version'))) {
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  } else {
    fs.rmSync(file);
    for (let d = path.dirname(file); d !== root; d = path.dirname(d)) {
      try {
        fs.rmdirSync(d);
      } catch {
        break; // not empty: something else lives there
      }
    }
  }
  return true;
}

function installedAgents(root) {
  return Object.values(AGENTS).filter((a) => {
    try {
      const hooks = JSON.parse(fs.readFileSync(path.join(root, a.file), 'utf8')).hooks || {};
      return Object.values(hooks).some((gs) => Array.isArray(gs) && gs.some((g) => hooksOf(g).some(ours)));
    } catch {
      return false;
    }
  });
}

function addGitignore(root) {
  const file = path.join(root, '.gitignore');
  const line = '.codehere/local/';
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!cur.split('\n').includes(line)) {
    fs.writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + line + '\n');
  }
}

// ---------- approving the test command (this machine only) ----------

// Approving and uninstalling need the developer's own terminal: a terminal on stdin and stdout,
// and no agent among the processes above this one. An agent's commands run under its process,
// even in a terminal it opens (Codex can). Inside Codex's sandbox ps is not allowed, so the
// parents cannot be read, which counts as under an agent. An agent that detaches its terminal
// on purpose can still answer, so the finish check reports an approval or an uninstall.
const AGENT_PROCESSES = new Set(['claude', 'codex', 'copilot', 'opencode']);
const PS = fs.existsSync('/bin/ps') ? '/bin/ps' : '/usr/bin/ps';
function underAgent() {
  let pid = process.ppid;
  for (let i = 0; i < 100 && pid > 1; i++) {
    let line;
    try {
      line = execFileSync(PS, ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return true;
    }
    const m = /^(\d+)\s+(.+)$/.exec(line);
    if (!m || AGENT_PROCESSES.has(path.basename(m[2]).toLowerCase())) return true;
    pid = Number(m[1]);
  }
  return pid > 1;
}
const atTerminal = () => !!(process.stdin.isTTY && process.stdout.isTTY) && !underAgent();

async function askApproval(root, command) {
  const last = git(root, 'log -1 --format="%an on %ad (%h)" --date=short -- .codehere/config.json');
  const uncommitted = git(root, 'status --porcelain -- .codehere/config.json');
  const prev = readApprovals(root).at(-1);
  console.log('When the agent says it is done, Codehere runs this command on this machine:');
  console.log(`  ${printable(command)}`);
  if (last) console.log(`Last changed in git by ${printable(last)}.`); // a teammate picks their own author name
  if (uncommitted) console.log('.codehere/config.json also has uncommitted changes on this machine.');
  if (prev) console.log(`Last approved here: ${printable(prev.command)}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Approve it? [y/N] ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log('Not approved. The finish check will not run it.');
    return;
  }
  if (!addApproval(root, command)) {
    console.error('Not approved: HOME or XDG_CONFIG_HOME points inside this repo, where a teammate could write approvals.');
    process.exit(1);
  }
  console.log('Approved on this machine.');
}

export async function approve() {
  const root = requireRoot();
  const command = readConfig(root).testCommand;
  if (!command) return console.log('No test command set. Set one: codehere init --test "npm test"');
  if (isApproved(root, command)) return console.log(`Already approved on this machine: ${printable(command)}`);
  if (!atTerminal()) {
    console.error('codehere approve asks you to confirm in your own terminal, not through an agent. Run it there.');
    process.exit(1);
  }
  await askApproval(root, command);
}

// ---------- init ----------

const RULES_MD = '# Team rules\n\nOne rule per line, starting with "- ". Written by people, not by the agent.\nEvery agent session on this repo loads these.\n\n';
const README_MD = [
  '# .codehere — this team\'s brain',
  '',
  'Plain markdown, shared through git. Commit and push it like code.',
  '',
  '- `rules.md`: team rules every agent session loads',
  '- `lessons/`: errors someone already solved; shown to the agent only when the same error appears',
  '- `help/`: help cards; teammates see them with `codehere inbox`',
  '- `briefs/`: restart briefs for fresh sessions',
  '- `local/`: this machine only (git-ignored)',
  '',
].join('\n');

export async function init(flags) {
  const names = flags.agent === undefined ? ['claude'] : String(flags.agent === true ? '' : flags.agent).split(',').map((x) => x.trim().toLowerCase());
  if (!names.every((n) => Object.hasOwn(AGENTS, n))) {
    console.error(`Unknown agent "${printable(flags.agent === true ? '' : flags.agent)}". Use --agent with claude, codex or copilot, or several: --agent claude,codex,copilot.`);
    process.exit(1);
  }
  const agents = [...new Set(names)].map((n) => AGENTS[n]);
  const root = process.cwd();
  const p = ensureDirs(root);
  const cfg = readConfig(root);
  if (flags.test) cfg.testCommand = flags.test;
  else if (!cfg.testCommand) cfg.testCommand = detectTestCommand(root);
  writeConfig(root, cfg);

  if (!fs.existsSync(p.rules)) fs.writeFileSync(p.rules, RULES_MD);
  fs.writeFileSync(path.join(p.base, 'README.md'), README_MD);
  for (const d of [p.lessons, p.help, p.briefs]) {
    const keep = path.join(d, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
  addGitignore(root);
  for (const a of agents) mergeHooks(root, a);
  markRemoved(root, false);

  console.log('Codehere is set up.');
  console.log(`- Team brain: ${path.relative(root, p.base)}/`);
  for (const a of agents) console.log(`- ${a.name} hooks: ${a.file}`);
  console.log(`- Test check on "done": ${cfg.testCommand ? printable(cfg.testCommand) : 'none found (set one with: codehere init --test "npm test")'}`);
  console.log('');
  if (cfg.testCommand && !isApproved(root, cfg.testCommand)) {
    if (atTerminal()) await askApproval(root, cfg.testCommand);
    else console.log('The test command runs only after you approve it on this machine: codehere approve');
    console.log('');
  }
  if (agents.includes(AGENTS.codex)) {
    console.log("Codex runs a repo's hooks only after each developer trusts them. Open Codex here, trust the project if asked,");
    console.log('then type /hooks and trust the four Codehere hooks. Until then Codex skips them, and `codex exec` does not warn.');
    console.log('');
  }
  if (agents.includes(AGENTS.copilot)) {
    console.log("Copilot runs a repo's hooks only in a folder you trust. Answer yes when Copilot asks on its first start here.");
    console.log('');
  }
  console.log(`Next: commit .codehere/ and ${agents.map((a) => a.file).join(' and ')} so your team gets it too.`);
  console.log(`Then just use ${agents.map((a) => a.name).join(' or ')} as usual. Codehere stays quiet unless it helps.`);
}

// ---------- uninstall ----------

function removeGitignoreLine(root) {
  const file = path.join(root, '.gitignore');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const kept = lines.filter((l) => l !== '.codehere/local/');
  if (kept.length === lines.length) return;
  if (kept.join('\n').trim()) fs.writeFileSync(file, kept.join('\n'));
  else fs.rmSync(file);
}

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? filesIn(f) : [f];
  });
}

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Like approve, it needs the developer's own terminal, so the agent cannot switch Codehere off.
// .codehere/ goes only when it holds nothing but what init wrote.
export async function uninstall() {
  const root = findRoot();
  if (!root) {
    console.error('No .codehere folder here. Nothing to remove.');
    process.exit(1);
  }
  // findRoot walks up: from a folder with no .codehere/ it can reach the home folder
  const home = fs.realpathSync(root) === fs.realpathSync(os.homedir());
  if (home || !isGitRepo(root)) {
    console.error(`The nearest .codehere/ is in ${printable(root)}, ${home ? 'your home folder' : 'which is not a git repo'}. Nothing removed.`);
    process.exit(1);
  }
  if (!atTerminal()) {
    console.error('codehere uninstall asks you to confirm in your own terminal, not through an agent. Run it there.');
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Remove Codehere from ${printable(root)}? [y/N] `);
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) return console.log('Nothing removed.');

  for (const a of Object.values(AGENTS)) {
    if (removeHooks(root, a)) console.log(`- Removed Codehere's hooks from ${a.file}`);
  }
  removeApprovals(root);
  markRemoved(root);
  const p = paths(root);
  fs.rmSync(p.local, { recursive: true, force: true });
  const readme = path.join(p.base, 'README.md');
  const written = [p.config, p.rules, readme, ...[p.lessons, p.help, p.briefs].map((d) => path.join(d, '.gitkeep'))];
  const rules = readRules(root).length;
  const docs = [p.lessons, p.help, p.briefs].map((d) => listDocs(d).length);
  const other = filesIn(p.base).filter((f) => !written.includes(f)).length - docs.reduce((a, b) => a + b, 0);
  const edited = [[p.rules, RULES_MD], [readme, README_MD]].filter(([f, text]) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') !== text).map(([f]) => path.basename(f));
  const held = [[rules, 'rule'], [docs[0], 'lesson'], [docs[1], 'help card'], [docs[2], 'brief'], [other, 'other file']].filter(([n]) => n).map(([n, w]) => count(n, w));
  if (!rules) held.push(...edited.map((f) => `an edited ${f}`));
  else if (edited.includes('README.md')) held.push('an edited README.md');
  if (!held.length) {
    fs.rmSync(p.base, { recursive: true, force: true });
    removeGitignoreLine(root); // kept otherwise: a session still open would write local/ again
    console.log('- Removed .codehere/');
  } else {
    console.log(`- Kept .codehere/: it holds ${held.join(', ')}. Delete it yourself if the team no longer needs it.`);
  }
  console.log('Codehere is removed from this repo on this machine. Commit the changes so your team gets them too.');
}

// ---------- rules ----------

export function rule(text) {
  const root = requireRoot();
  if (!text) {
    const rules = readRules(root);
    console.log(rules.length ? rules.map((r) => `- ${r}`).join('\n') : 'No team rules yet. Add one: codehere rule "Never edit migrations by hand"');
    return;
  }
  fs.appendFileSync(paths(root).rules, `- ${text} (${me(root)}, ${today()})\n`);
  console.log('Rule added. Every new agent session will follow it. Commit .codehere/rules.md to share it.');
}

// ---------- lessons ----------

export function lesson(title, flags) {
  const root = requireRoot();
  const dir = paths(root).lessons;
  if (!title) {
    const docs = listDocs(dir);
    if (!docs.length) return console.log('No lessons yet. They are created when someone solves a repeated error.');
    for (const d of docs) console.log(`- ${d.meta.title || d.id}  (${d.meta.author || '?'}, ${d.meta.date || ''})`);
    return;
  }
  if (!flags.fix) {
    console.error('Add the fix: codehere lesson "<problem>" --fix "<what fixed it>" [--sig "<error text>"]');
    process.exit(1);
  }
  const file = path.join(dir, `${today()}-${slug(title)}.md`);
  fs.writeFileSync(
    file,
    renderDoc(
      { title, signature: flags.sig || title, author: me(root), date: today() },
      `## Fix\n- ${flags.fix}\n`
    )
  );
  console.log(`Lesson saved: ${path.relative(root, file)}. Commit it to share with your team.`);
}

// ---------- transcript reading ----------

function userPrompts(transcript) {
  if (!transcript || !fs.existsSync(transcript)) return [];
  const prompts = [];
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== 'user' || !rec.message) continue;
    const c = rec.message.content;
    let text = '';
    if (typeof c === 'string') text = c;
    else if (Array.isArray(c)) text = c.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
    text = text.trim();
    if (!text || text.startsWith('<') || text.startsWith('Caveat:')) continue;
    prompts.push(text);
  }
  return prompts;
}

// The most recent session that actually has something in it
// (a transcript or errors), not just a stray hook call.
function lastSession(root) {
  const state = readState(root);
  const meaningful = (x) => x && (x.transcript || Object.keys(x.errors || {}).length);
  let s = state.sessions[state.lastSession];
  if (!meaningful(s)) {
    s =
      Object.values(state.sessions)
        .filter(meaningful)
        .sort((a, b) => (b.lastActive || b.startedAt || '').localeCompare(a.lastActive || a.startedAt || ''))[0] || null;
  }
  return { state, s };
}

const times = (n) => (n === 1 ? 'once' : `${n} times`);

function repeatedErrors(s) {
  if (!s) return [];
  return Object.entries(s.errors || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sig, n]) => ({ sig, n, raw: (s.rawErrors || {})[sig] || [] }));
}

function gitSummary(root, base) {
  if (!isGitRepo(root)) return { branch: '', stat: '', head: '' };
  return {
    branch: git(root, 'rev-parse --abbrev-ref HEAD'),
    head: git(root, 'log -1 --format="%h %s"'),
    stat: git(root, ['diff', commitId(base) || 'HEAD', '--stat']).split('\n').slice(-12).join('\n'),
  };
}

// ---------- brief ----------

export async function brief(flags) {
  const root = requireRoot();
  const cfg = readConfig(root);
  const { state, s } = lastSession(root);
  const prompts = userPrompts(s && s.transcript);
  const goal = flags.goal || prompts[0] || '(write the goal here)';
  const corrections = prompts.slice(1).slice(-5);
  const errs = repeatedErrors(s);
  const g = gitSummary(root, s && s.startHead);
  const rules = readRules(root);

  const lines = [`# Restart brief (${today()})`, '', '## Goal', goal, ''];
  if (corrections.length) {
    lines.push('## What the user clarified or corrected along the way');
    corrections.forEach((c) => lines.push(`- ${c.replace(/\s+/g, ' ').slice(0, 300)}`));
    lines.push('');
  }
  if (rules.length) {
    lines.push('## Team rules');
    rules.forEach((r) => lines.push(`- ${r}`));
    lines.push('');
  }
  if (errs.length) {
    lines.push('## What kept failing (do not repeat these attempts)');
    errs.forEach((e) => lines.push(`- ${e.sig} (seen ${times(e.n)})`));
    lines.push('');
  }
  lines.push('## Current state');
  if (g.branch) lines.push(`- Branch: ${g.branch}, last commit: ${g.head}`);
  if (state.lastGreen) lines.push(`- Last time tests passed: commit ${state.lastGreen.commit.slice(0, 8)} (${state.lastGreen.at.slice(0, 16)})`);
  if (g.stat) lines.push('- Changed files:', '```', g.stat, '```');
  lines.push('', '## How to work', '- Start by stating your root-cause hypothesis before editing.', '- Make one small change, then run the tests.');

  let text = redact(lines.join('\n'));
  if (flags.gemma) {
    const summary = await summarize(
      `Rewrite this into one clear, complete instruction for a coding agent. Keep every requirement and constraint. Plain English, max 120 words.\n\n${text}`,
      cfg.gemmaModel
    );
    if (summary) text = text.replace('## Goal', `## In one paragraph (written by ${summary.model} on this machine; an opinion, check it)\n${summary.text}\n\n## Goal`);
    else console.error('(Gemma not reachable through Ollama; using the plain brief.)');
  }

  const file = path.join(paths(root).briefs, `${stamp()}.md`);
  fs.writeFileSync(file, text + '\n');
  state.pendingBrief = file;
  writeState(root, state);
  console.log(text);
  console.log('');
  console.log(`Saved to ${path.relative(root, file)}.`);
  console.log('Edit it if needed, then start a fresh session (/clear or a new terminal). Codehere loads it automatically.');
}

// ---------- help cards ----------

export async function help(question, flags) {
  const root = requireRoot();
  const cfg = readConfig(root);
  const { s } = lastSession(root);
  const prompts = userPrompts(s && s.transcript);
  const errs = repeatedErrors(s);
  const g = gitSummary(root, s && s.startHead);
  const ask = question || (errs[0] ? `Stuck on: ${errs[0].sig}` : 'I am stuck and could use a second pair of eyes');

  const body = ['## Question', ask, ''];
  if (prompts[0]) body.push('## What I am trying to build', prompts[0].slice(0, 600), '');
  if (errs.length) {
    body.push('## The error');
    errs.slice(0, 2).forEach((e) => {
      body.push(`Seen ${times(e.n)}: \`${e.sig}\``);
      if (e.raw.length) body.push('```', ...e.raw.slice(0, 6), '```');
    });
    body.push('');
  }
  const tried = prompts.slice(1).slice(-4);
  if (tried.length) {
    body.push('## What I already tried (my prompts to the agent)');
    tried.forEach((t) => body.push(`- ${t.replace(/\s+/g, ' ').slice(0, 200)}`));
    body.push('');
  }
  if (g.stat) body.push('## Files changed', '```', g.stat, '```', '');
  body.push('## Setup', `- ${os.platform()} ${os.arch()}, Node ${process.version}${g.branch ? `, branch ${g.branch}` : ''}`, '');

  let text = redact(body.join('\n'));
  if (flags.gemma) {
    const summary = await summarize(
      `Summarise this help request for a busy teammate in 2 sentences: what is wrong and what you need from them.\n\n${text}`,
      cfg.gemmaModel
    );
    if (summary) text = `## In short (written by ${summary.model} on this machine; an opinion, check it)\n${summary.text}\n\n${text}`;
    else console.error('(Gemma not reachable through Ollama; using the plain help card.)');
  }

  const id = `${stamp()}-${slug(ask, 30)}`;
  const file = path.join(paths(root).help, `${id}.md`);
  fs.writeFileSync(
    file,
    renderDoc(
      { id, author: me(root), date: today(), status: 'open', signature: errs[0] ? errs[0].sig : '' },
      text
    )
  );
  console.log(text);
  console.log('---');
  console.log(`Help card saved: ${path.relative(root, file)} (secrets and emails redacted, please still check).`);
  console.log('Share it one of two ways:');
  console.log('  1. Commit and push. Teammates see it with `codehere inbox` and answer with `codehere reply`.');
  console.log('  2. Copy the text above into WhatsApp, Discord or Slack.');
}

export function inbox(flags) {
  const root = requireRoot();
  const mine = me(root);
  const docs = listDocs(paths(root).help).filter(
    (d) => (flags.all || d.meta.author !== mine) && (flags.all || d.meta.status === 'open')
  );
  if (!docs.length) return console.log('No open help requests from teammates. (Did you `git pull`?)');
  for (const d of docs) {
    const q = (d.body.match(/## Question\n(.+)/) || [null, ''])[1];
    const replies = (d.body.match(/^- .+ \(\d{4}-\d\d-\d\d\): /gm) || []).length;
    console.log(`${d.id}\n  ${d.meta.author} · ${d.meta.date} · ${d.meta.status} · ${replies} repl${replies === 1 ? 'y' : 'ies'}\n  ${q}\n`);
  }
  console.log('Read one: codehere show <id>   Answer: codehere reply <id> "your answer" [--solved]');
}

function findHelp(root, id) {
  const docs = listDocs(paths(root).help);
  const d = docs.find((x) => x.id === id) || docs.find((x) => x.id.startsWith(id));
  if (!d) {
    console.error(`No help card matching "${id}". Run codehere inbox --all to see them.`);
    process.exit(1);
  }
  return d;
}

export function show(id) {
  const root = requireRoot();
  const d = findHelp(root, id);
  console.log(fs.readFileSync(d.file, 'utf8'));
}

export function reply(id, text, flags) {
  const root = requireRoot();
  if (!id || !text) {
    console.error('Usage: codehere reply <id> "your answer" [--solved]');
    process.exit(1);
  }
  const d = findHelp(root, id);
  const { meta, body } = parseDoc(fs.readFileSync(d.file, 'utf8'));
  const who = me(root);
  let newBody = body.includes('## Replies') ? body.trimEnd() : `${body.trimEnd()}\n\n## Replies`;
  newBody += `\n- ${who} (${today()}): ${text}\n`;
  if (flags.solved) {
    meta.status = 'resolved';
    meta.resolvedBy = who;
    const q = (body.match(/## Question\n(.+)/) || [null, meta.id])[1];
    const lessonFile = path.join(paths(root).lessons, `${today()}-${slug(q)}.md`);
    fs.writeFileSync(
      lessonFile,
      renderDoc(
        { title: q, signature: meta.signature || q, author: who, date: today(), from: `help/${d.id}` },
        `## Fix\n- ${text}\n`
      )
    );
    console.log(`Marked solved and saved as a team lesson: ${path.relative(root, lessonFile)}`);
    console.log('From now on, any teammate\'s agent that hits this error gets your fix automatically.');
  }
  fs.writeFileSync(d.file, renderDoc(meta, newBody));
  console.log(`Reply added to ${path.relative(root, d.file)}. Commit and push so ${meta.author} sees it.`);
}

// ---------- status ----------

export function status() {
  const root = requireRoot();
  const cfg = readConfig(root);
  const { state, s } = lastSession(root);
  const p = paths(root);
  console.log('Codehere status');
  console.log(`- Agents: ${installedAgents(root).map((a) => a.name).join(', ') || 'none (codehere init --agent claude,codex)'}`);
  console.log(`- Team rules: ${readRules(root).length}`);
  console.log(`- Team lessons: ${listDocs(p.lessons).length}`);
  console.log(`- Open help requests: ${listDocs(p.help).filter((d) => d.meta.status === 'open').length}`);
  const approval = isApproved(root, cfg.testCommand) ? 'approved on this machine' : 'not approved on this machine (codehere approve)';
  console.log(`- Test check on "done": ${cfg.testCommand && cfg.verifyOnStop ? `${printable(cfg.testCommand)} · ${approval}` : 'off'}`);
  if (state.lastGreen) console.log(`- Last green: ${state.lastGreen.commit.slice(0, 8)} at ${state.lastGreen.at.slice(0, 16)}`);
  if (s) {
    const errs = repeatedErrors(s);
    console.log(`- This session: ${errs.length ? errs.map((e) => `${e.n}x "${e.sig}"`).join('; ') : 'no repeated errors'}`);
  }
}

// ---------- stats ----------

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const k = (n) => `${Math.round(n / 1000)}k`;
const fixes = (n) => (n === 1 ? '1 fix' : `${n} fixes`);

export function stats() {
  const root = requireRoot();
  const state = readState(root);
  const sessions = Object.values(state.sessions || {}).filter(
    (x) => x.prompts || x.transcript || Object.keys(x.errors || {}).length
  );
  const greens = sessions.map((x) => x.firstGreenAt).filter((n) => n > 0);
  const loops = sessions.reduce((n, x) => n + (x.loopsStopped || 0), 0);
  const sizes = sessions.map(transcriptTokens).filter(Boolean);
  const turns = (kind) => (state.episodes || []).filter((e) => e.kind === kind).map((e) => e.turns);
  const detail = turns('with-detail');
  const short = turns('still-broken');

  console.log(`Codehere stats · ${sessions.length} recent sessions on this machine`);
  console.log(
    `- Turns to green: ${greens.length ? `median ${median(greens)} prompts · ${greens.length} of ${sessions.length} sessions reached green` : 'no session has reached green yet'}`
  );
  console.log(`- Loops stopped: ${loops}`);
  console.log(
    `- Context size: ${sizes.length ? `largest ${k(Math.max(...sizes))} tokens · median ${k(median(sizes))} (last request of each session)` : 'no transcripts yet'}`
  );
  console.log(
    `- Turns to fix a failure: ${detail.length ? `${median(detail)} when the prompt gave details (${fixes(detail.length)})` : 'no fix after a detailed prompt yet'} · ${short.length ? `${median(short)} after a short "still broken" (${fixes(short.length)})` : 'no fix after a short "still broken" yet'}`
  );
}
