import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  findRoot, paths, ensureDirs, readConfig, writeConfig, readState, writeState,
  readRules, listDocs, parseDoc, renderDoc, slug, stamp, today, git, isGitRepo, me,
} from './brain.js';
import { redact } from './signals.js';
import { summarize } from './gemma.js';

const HOOK_EVENTS = {
  SessionStart: { cmd: 'codehere hook session-start' },
  PostToolUse: { cmd: 'codehere hook post-tool', matcher: 'Bash' },
  PostToolUseFailure: { cmd: 'codehere hook post-tool', matcher: 'Bash' },
  Stop: { cmd: 'codehere hook stop', timeout: 180 },
};

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

function mergeClaudeSettings(root) {
  const dir = path.join(root, '.claude');
  const file = path.join(dir, 'settings.json');
  fs.mkdirSync(dir, { recursive: true });
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  settings.hooks = settings.hooks || {};
  for (const [event, spec] of Object.entries(HOOK_EVENTS)) {
    const list = (settings.hooks[event] = settings.hooks[event] || []);
    const already = list.some((g) => (g.hooks || []).some((h) => h.command === spec.cmd));
    if (already) continue;
    const hook = { type: 'command', command: spec.cmd };
    if (spec.timeout) hook.timeout = spec.timeout;
    const group = { hooks: [hook] };
    if (spec.matcher) group.matcher = spec.matcher;
    list.push(group);
  }
  fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  return file;
}

function addGitignore(root) {
  const file = path.join(root, '.gitignore');
  const line = '.codehere/local/';
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!cur.split('\n').includes(line)) {
    fs.writeFileSync(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + line + '\n');
  }
}

// ---------- init ----------

export function init(flags) {
  const root = process.cwd();
  const p = ensureDirs(root);
  const cfg = readConfig(root);
  if (flags.test) cfg.testCommand = flags.test;
  else if (!cfg.testCommand) cfg.testCommand = detectTestCommand(root);
  writeConfig(root, cfg);

  if (!fs.existsSync(p.rules)) {
    fs.writeFileSync(
      p.rules,
      '# Team rules\n\nOne rule per line, starting with "- ". Written by people, not by the agent.\nEvery agent session on this repo loads these.\n\n'
    );
  }
  fs.writeFileSync(
    path.join(p.base, 'README.md'),
    [
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
    ].join('\n')
  );
  for (const d of [p.lessons, p.help, p.briefs]) {
    const keep = path.join(d, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
  addGitignore(root);
  const settingsFile = mergeClaudeSettings(root);

  console.log('Codehere is set up.');
  console.log(`- Team brain: ${path.relative(root, p.base)}/`);
  console.log(`- Claude Code hooks: ${path.relative(root, settingsFile)}`);
  console.log(`- Test check on "done": ${cfg.testCommand ? cfg.testCommand : 'none found (set one with: codehere init --test "npm test")'}`);
  console.log('');
  console.log('Next: commit .codehere/ and .claude/settings.json so your team gets it too.');
  console.log('Then just use Claude Code as usual. Codehere stays quiet unless it helps.');
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
    stat: git(root, `diff ${base || 'HEAD'} --stat`).split('\n').slice(-12).join('\n'),
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
    errs.forEach((e) => lines.push(`- ${e.sig} (seen ${e.n} times)`));
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
    if (summary) text = text.replace('## Goal', `## In one paragraph (written by local Gemma, check it)\n${summary}\n\n## Goal`);
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
      body.push(`Seen ${e.n} times: \`${e.sig}\``);
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
    if (summary) text = `## In short (written by local Gemma, check it)\n${summary}\n\n${text}`;
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
  console.log(`- Team rules: ${readRules(root).length}`);
  console.log(`- Team lessons: ${listDocs(p.lessons).length}`);
  console.log(`- Open help requests: ${listDocs(p.help).filter((d) => d.meta.status === 'open').length}`);
  console.log(`- Test check on "done": ${cfg.testCommand || 'off'}`);
  if (state.lastGreen) console.log(`- Last green: ${state.lastGreen.commit.slice(0, 8)} at ${state.lastGreen.at.slice(0, 16)}`);
  if (s) {
    const errs = repeatedErrors(s);
    console.log(`- This session: ${errs.length ? errs.map((e) => `${e.n}x "${e.sig}"`).join('; ') : 'no repeated errors'}`);
  }
}
