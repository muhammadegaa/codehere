// The team brain: plain markdown files in .codehere/, committed to git.
// Local, per-machine state lives in .codehere/local/ (git-ignored).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

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
    const state = JSON.parse(fs.readFileSync(paths(root).state, 'utf8'));
    // state.json can arrive through git: a file of the wrong shape counts as empty
    if (state && state.sessions && typeof state.sessions === 'object') return state;
  } catch {}
  return { sessions: {}, lastSession: null, lastGreen: null, pendingBrief: null };
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

// ---------- approved test commands (this machine only) ----------
// config.json travels through git, so a teammate's commit can change the test
// command. The finish check runs only a command approved on this machine. The
// approvals live outside the repo: any file in .codehere/, even a git-ignored one
// (git add -f), can arrive through a pull.

// The real path of p, for a p that may not exist yet.
function realish(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(realish(parent), path.basename(p));
  }
}

function repoKey(root) {
  return realish(path.resolve(root));
}

// null when the file would be inside the repo: settings committed to the repo can set
// XDG_CONFIG_HOME or HOME for the agent's processes, and so for these hooks.
function approvalsFile(root) {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.config');
  const file = path.join(base, 'codehere', 'approvals.json');
  return realish(file).startsWith(repoKey(root) + path.sep) ? null : file;
}

function readAllApprovals(root) {
  try {
    const all = JSON.parse(fs.readFileSync(approvalsFile(root), 'utf8'));
    return all && all.repos && typeof all.repos === 'object' ? all : { repos: {} };
  } catch {
    return { repos: {} };
  }
}

export function readApprovals(root) {
  const list = readAllApprovals(root).repos[repoKey(root)]?.commands;
  return Array.isArray(list) ? list : [];
}

export function isApproved(root, command) {
  return readApprovals(root).some((a) => a.command === command);
}

// false when the approvals file would be inside the repo
export function addApproval(root, command) {
  const file = approvalsFile(root);
  if (!file) return false;
  const all = readAllApprovals(root);
  const list = readApprovals(root).filter((a) => a.command !== command);
  list.push({ command, by: me(root), at: new Date().toISOString() });
  all.repos[repoKey(root)] = { commands: list };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  return true;
}

// Control, format (bidi, zero-width), filler and variation characters escaped, so text from the repo cannot print a fake
// line, move the cursor or hide part of a command.
const ESCAPES = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
export function printable(text) {
  return String(text).replace(
    /[\p{Cc}\p{Cf}\u034f\u115f\u1160\u2028\u2029\u3164\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu,
    (c) => {
      const n = c.codePointAt(0).toString(16);
      return ESCAPES[c] || (n.length > 4 ? `\\u{${n}}` : `\\u${n.padStart(4, '0')}`);
    }
  );
}

// ---------- git helpers (all fail-safe) ----------

// Pass an array whenever an argument comes from the repo or the state file: it never
// goes through a shell, so a file name such as a$(cmd).js stays a file name.
// raw keeps the output as git wrote it: -z lists, and porcelain lines whose first character is a space.
export function git(root, args, raw = false) {
  try {
    const opts = { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] };
    const out = (Array.isArray(args) ? execFileSync('git', ['--literal-pathspecs', ...args], opts) : execSync(`git ${args}`, opts)).toString();
    return raw ? out : out.trim();
  } catch {
    return '';
  }
}

// Files with uncommitted changes, relative to root, which may be a subfolder of the repo.
export function statusFiles(root) {
  const prefix = git(root, ['rev-parse', '--show-prefix']);
  const entries = git(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'], true).split('\0');
  const files = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    if (e.slice(3).startsWith(prefix)) files.push(e.slice(3 + prefix.length));
    if (e[0] === 'R' || e[0] === 'C') i++; // the old name of a rename or copy
  }
  return files;
}

// What `git hash-object` gives for each file (git's filters applied), 'deleted' for a missing
// file, null when git cannot say. One git call for all of them; absolute paths, because
// --stdin-paths ignores the subfolder git was started in.
export function gitHashes(root, files) {
  const present = files.filter((f) => !f.includes('\n') && fs.existsSync(path.join(root, f)));
  let out = [];
  try {
    if (present.length) {
      out = execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: root, input: present.map((f) => path.resolve(root, f)).join('\n') + '\n', stdio: ['pipe', 'pipe', 'ignore'] })
        .toString()
        .trim()
        .split('\n');
    }
  } catch {}
  return files.map((f) => {
    const i = present.indexOf(f);
    if (i >= 0) return out[i] || null;
    return f.includes('\n') ? null : 'deleted';
  });
}

// A tick is Codehere's mark for a run it made on this machine (DESIGN.md §1). Text from the
// repo or from a teammate never brings its own.
export function noTick(text) {
  return String(text).replace(/[✓✔☑✅]/g, '?');
}

// A commit id read back from state.json, or null. The state file can arrive through git,
// so anything else (such as --output=<file>) must never reach git as an argument.
export function commitId(x) {
  return typeof x === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(x) ? x : null;
}

export function isGitRepo(root) {
  return git(root, 'rev-parse --is-inside-work-tree') === 'true';
}

export function me(root) {
  return git(root, 'config user.name') || process.env.USER || 'someone';
}
