// The team brain: plain markdown files in .codehere/, committed to git.
// Local, per-machine state lives in .codehere/local/ (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, '.codehere'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function paths(root) {
  const base = path.join(root, '.codehere');
  return {
    base,
    config: path.join(base, 'config.json'),
    rules: path.join(base, 'rules.md'),
    lessons: path.join(base, 'lessons'),
    help: path.join(base, 'help'),
    briefs: path.join(base, 'briefs'),
    local: path.join(base, 'local'),
    state: path.join(base, 'local', 'state.json'),
  };
}

export function ensureDirs(root) {
  const p = paths(root);
  for (const d of [p.base, p.lessons, p.help, p.briefs, p.local]) {
    fs.mkdirSync(d, { recursive: true });
  }
  return p;
}

const DEFAULT_CONFIG = {
  testCommand: null,
  verifyOnStop: true,
  loopThreshold: 3,
  testTimeoutSeconds: 120,
  longSessionTokens: 120000,
  gemmaModel: 'gemma4:e4b',
};

export function readConfig(root) {
  const p = paths(root);
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(p.config, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(root, cfg) {
  fs.writeFileSync(paths(root).config, JSON.stringify(cfg, null, 2) + '\n');
}

// ---------- local session state ----------

export function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(paths(root).state, 'utf8'));
  } catch {
    return { sessions: {}, lastSession: null, lastGreen: null, pendingBrief: null };
  }
}

export function writeState(root, state) {
  const p = paths(root);
  fs.mkdirSync(p.local, { recursive: true });
  fs.writeFileSync(p.state, JSON.stringify(state, null, 2));
}

export function session(state, id) {
  const key = id || 'default';
  if (!state.sessions[key]) {
    state.sessions[key] = {
      errors: {},
      rawErrors: {},
      shownLessons: [],
      stopBlocks: 0,
      lessonAsked: false,
      startedAt: new Date().toISOString(),
      transcript: null,
    };
  }
  state.lastSession = key;
  state.sessions[key].lastActive = new Date().toISOString();
  // keep the state file small: drop sessions older than the 20 most recent
  const keys = Object.keys(state.sessions);
  if (keys.length > 20) {
    keys
      .sort((a, b) => (state.sessions[a].startedAt || '').localeCompare(state.sessions[b].startedAt || ''))
      .slice(0, keys.length - 20)
      .forEach((k) => delete state.sessions[k]);
  }
  return state.sessions[key];
}

// ---------- markdown with simple frontmatter ----------

export function parseDoc(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

export function renderDoc(meta, body) {
  const head = Object.entries(meta)
    .map(([k, v]) => `${k}: ${String(v).replace(/\n/g, ' ')}`)
    .join('\n');
  return `---\n${head}\n---\n${body.trimEnd()}\n`;
}

export function listDocs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const { meta, body } = parseDoc(fs.readFileSync(file, 'utf8'));
      return { id: f.replace(/\.md$/, ''), file, meta, body };
    });
}

export function slug(text, max = 40) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'note'
  );
}

export function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- rules ----------

export function readRules(root) {
  const file = paths(root).rules;
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

// ---------- git helpers (all fail-safe) ----------

export function git(root, args) {
  try {
    return execSync(`git ${args}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export function isGitRepo(root) {
  return git(root, 'rev-parse --is-inside-work-tree') === 'true';
}

export function me(root) {
  return git(root, 'config user.name') || process.env.USER || 'someone';
}
