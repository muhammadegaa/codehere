// The team brain: plain markdown files in .codehere/, committed to git.
// Local, per-machine state lives in .codehere/local/ (git-ignored).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
    drafts: path.join(base, 'local', 'drafts'),
  };
}

// No folder is made through a committed link (init refuses one outright).
export function ensureDirs(root) {
  const p = paths(root);
  for (const d of [p.base, p.lessons, p.help, p.briefs, p.local]) {
    if (ownPath(root, d)) fs.mkdirSync(d, { recursive: true });
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

// What a teammate can commit is read only as a plain file: git can commit a symlink (mode 120000),
// and one to /dev/zero would hang the hook that reads it. The file is opened without following a
// final link and without blocking, checked on the open file, and read up to max bytes: a linked
// folder can still reach a file such as /proc/self/pagemap, which says it is plain and never ends.
// encoding null gives a Buffer.
export function readPlain(file, encoding = 'utf8', max = 8 * 1024 * 1024) {
  const notPlain = () => Object.assign(new Error(`not a plain file: ${file}`), { code: 'ENOTPLAIN' });
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (e) {
    throw e.code === 'ELOOP' ? notPlain() : e;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw notPlain();
    const chunks = [];
    const buf = Buffer.alloc(64 * 1024);
    for (let total = 0, n; total < max && (n = fs.readSync(fd, buf, 0, Math.min(buf.length, max - total), null)) > 0; total += n) {
      chunks.push(Buffer.from(buf.subarray(0, n)));
    }
    const data = Buffer.concat(chunks);
    return encoding ? data.toString(encoding) : data;
  } finally {
    fs.closeSync(fd);
  }
}

export function readConfig(root) {
  const p = paths(root);
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readPlain(p.config)) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(root, cfg) {
  writePlain(root, paths(root).config, JSON.stringify(cfg, null, 2) + '\n');
}

// ---------- local session state ----------

export function readState(root) {
  try {
    const state = JSON.parse(readPlain(paths(root).state));
    // state.json can arrive through git: a file of the wrong shape counts as empty
    if (state && state.sessions && typeof state.sessions === 'object') return state;
  } catch {}
  return { sessions: {}, lastSession: null, lastGreen: null, pendingBrief: null };
}

// Written to a temporary file and renamed into place: a reader never sees half a file (which
// readState would take as empty, erasing every session), and a committed symlink is replaced,
// not followed.
// Nothing is written when local/ is a committed symlink, and the temporary file has a random name
// made with exclusive create, so no planted link at that name is followed. Never throws: false when
// nothing was saved, and a caller that needs the state kept (the finish check's send-back count)
// then holds back, while what it reports still goes out.
export function writeState(root, state) {
  const p = paths(root);
  if (!ownPath(root, p.local)) return false;
  const tmp = `${p.state}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(p.local, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { flag: 'wx' });
    fs.renameSync(tmp, p.state);
    return true;
  } catch {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {} // local/ may be a file: there is no temporary file to remove
    return false;
  }
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
    .flatMap((f) => {
      const file = path.join(dir, f);
      try {
        const { meta, body } = parseDoc(readPlain(file));
        return [{ id: f.replace(/\.md$/, ''), file, meta, body }];
      } catch {
        return []; // a link or a folder named like a lesson or card
      }
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
  let text = '';
  try {
    text = readPlain(file);
  } catch {
    return [];
  }
  return text
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

export function removeApprovals(root) {
  const file = approvalsFile(root);
  const all = readAllApprovals(root);
  if (!file || !(repoKey(root) in all.repos)) return;
  delete all.repos[repoKey(root)];
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
}

// uninstall leaves a note here, outside the repo. A session that was open when it ran still has
// its hooks loaded, but its state and maybe .codehere/ are gone: its finish check reads the note.
export function markRemoved(root, removed = true) {
  const file = approvalsFile(root);
  const all = readAllApprovals(root);
  const notes = all.removed && typeof all.removed === 'object' ? all.removed : {};
  if (!file || (!removed && !(repoKey(root) in notes))) return;
  if (removed) notes[repoKey(root)] = new Date().toISOString();
  else delete notes[repoKey(root)];
  all.removed = notes;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
}

// When uninstall ran for dir or a folder above it, else null.
export function removedAt(dir) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    const at = readAllApprovals(d).removed?.[repoKey(d)];
    if (typeof at === 'string') return at;
    if (path.dirname(d) === d) return null;
  }
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

// A diff can be far larger than execFileSync's 1 MiB default, and an unread diff must never look
// like an empty one: this reads it whole and returns null when git fails.
export function gitDiff(root, args) {
  try {
    return execFileSync('git', ['--literal-pathspecs', ...args], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 * 1024 * 1024 }).toString();
  } catch {
    return null;
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
export function noTick(text, mark = '?') {
  return String(text).replace(/[✓✔☑✅√🗸🗹\u{10102}\u{1FBB1}]/gu, mark);
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

// ---------- records: what rule, lesson, help and reply save ----------
// A writing command builds its record once. Typed by the developer it is saved at once; run by an
// agent it becomes a draft, which the prompt hook saves only after the person's plain yes.

// True when no part of p below root is a symlink, so a write to p lands at p. A teammate can
// commit a symlink anywhere in .codehere/, dangling or not; git writes it on pull.
export function ownPath(root, p) {
  let at = path.resolve(root);
  for (const part of path.relative(at, path.resolve(p)).split(path.sep)) {
    if (!part || part === '..') return false;
    at = path.join(at, part);
    try {
      if (fs.lstatSync(at).isSymbolicLink()) return false;
    } catch (e) {
      return e.code === 'ENOENT'; // from here on nothing exists yet, and mkdir makes plain folders
    }
  }
  return true;
}

// A write into the repo that a committed symlink cannot redirect: no link on the path (the final
// name refused without a race by O_NOFOLLOW). mode 'w' replaces, 'a' appends.
const linkedError = (root, file) => Object.assign(new Error(`${path.relative(root, file)} is a link or under one, so Codehere will not write it.`), { code: 'ENOTPLAIN' });
export function writePlain(root, file, data, mode = 'w') {
  if (!ownPath(root, file)) throw linkedError(root, file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { O_WRONLY, O_CREAT, O_TRUNC, O_APPEND, O_NOFOLLOW } = fs.constants;
  const fd = fs.openSync(file, O_WRONLY | O_CREAT | O_NOFOLLOW | (mode === 'a' ? O_APPEND : O_TRUNC), 0o666); // the umask applies, as with writeFileSync
  try {
    fs.writeFileSync(fd, data);
  } finally {
    fs.closeSync(fd);
  }
}
export function removePlain(root, file) {
  if (!ownPath(root, file)) throw linkedError(root, file);
  fs.rmSync(file, { force: true });
}

// A new file, never over an existing one or through a link: name.md, then name-2.md, ...
// 'wx' fails on any existing path, a dangling symlink included, and on a race with another save.
function writeNew(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; ; i++) {
    const base = i === 1 ? name : `${name}-${i}`;
    try {
      fs.writeFileSync(path.join(dir, `${base}.md`), text(base), { flag: 'wx' });
      return path.join(dir, `${base}.md`);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

const day = (d) => (/^\d{4}-\d\d-\d\d$/.test(String(d)) ? d : today());
const line = (s) => String(s).replace(/\s*[\r\n]+\s*/g, ' ');
// The front matter a record may set. Proof fields come only from the finish check's proof, never
// from a record: a draft is a file the agent could have edited.
const LESSON_KEYS = ['title', 'signature', 'author', 'date', 'test', 'from'];
const HELP_KEYS = ['id', 'author', 'date', 'status', 'signature', 'test'];
const PROOF_KEYS = ['signature', 'test', 'state', 'proof_command', 'proof_exit', 'proof_commit', 'proof_dirty', 'files', 'file_hashes'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && obj[k] != null).map((k) => [k, line(obj[k])]));
const isText = (s) => typeof s === 'string';

// The folder comes from the kind and the file name is built here from slugs and a checked date,
// so no record field becomes a path. Never throws or exits: what cannot be saved comes back as
// { error }, for the CLI to print and for a hook to tell the agent.
export function saveRecord(root, rec, proof = null) {
  try {
    return save(root, rec || {}, proof);
  } catch (e) {
    return { error: `Codehere could not save it: ${e.message}` };
  }
}

export const isMap = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Lessons and help cards as hashes by path, for the finish check: one the agent writes itself is
// listed for the person. A link is not followed, and a linked folder is not read: it stands for
// itself, so swapping a folder for a link is a change too.
export function teamSnapshot(root) {
  const snap = {};
  for (const d of ['.codehere/lessons', '.codehere/help']) {
    const dir = path.join(root, d);
    if (!ownPath(root, dir)) {
      let target = '';
      try {
        target = fs.readlinkSync(dir);
      } catch {}
      snap[d] = `link:${target}`;
      continue;
    }
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {}
    for (const n of names) {
      const f = path.join(dir, n);
      try {
        const st = fs.lstatSync(f);
        const text = st.isSymbolicLink() ? `link:${fs.readlinkSync(f)}` : st.isFile() ? readPlain(f, null) : null;
        if (text != null) snap[`${d}/${n}`] = crypto.createHash('sha256').update(text).digest('hex');
      } catch {}
    }
  }
  return snap;
}

// Before a save: the team files' hashes, and which files git sees as changed.
export function teamMark(root) {
  return { hashes: teamSnapshot(root), dirty: new Set(statusFiles(root).map((f) => f.normalize('NFC'))) };
}

// A save Codehere made is not the agent's change: what it changed moves into the session's
// snapshot, unless that file had an uncommitted change made earlier in the session, which stays
// visible. A change that came committed (a pull) is not the agent's. True if anything moved.
export function keepSaved(s, mark, after) {
  let moved = false;
  if (!s || !isMap(s.team)) return moved;
  const before = mark.hashes;
  for (const f of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[f] === after[f] || (s.team[f] !== before[f] && mark.dirty.has(f.normalize('NFC')))) continue;
    if (after[f] === undefined) delete s.team[f];
    else s.team[f] = after[f];
    moved = true;
  }
  return moved;
}

function save(root, rec, proof) {
  const p = paths(root);
  const rel = (f) => path.relative(root, f);
  const linked = (f) => (ownPath(root, f) ? null : { error: `Codehere: ${rel(f)} is a link, so nothing was saved.` });
  const bad = { error: 'Codehere: this draft is not one Codehere wrote, so nothing was saved.' };
  if (rec.kind === 'rule') {
    if (!isText(rec.line) || !rec.line.startsWith('- ')) return bad;
    if (linked(p.rules)) return linked(p.rules);
    fs.appendFileSync(p.rules, `${line(rec.line)}\n`);
    return { file: rel(p.rules) };
  }
  if (rec.kind === 'lesson') {
    // with a proof, the error's signature and failing test come from it alone, present or not
    const meta = { ...pick(rec.meta, proof ? LESSON_KEYS.filter((k) => k !== 'signature' && k !== 'test') : LESSON_KEYS), ...pick(proof, PROOF_KEYS) };
    if (!meta.title || !isText(rec.body)) return bad;
    if (linked(p.lessons)) return linked(p.lessons);
    return { file: rel(writeNew(p.lessons, `${day(meta.date)}-${slug(meta.title)}`, () => renderDoc(meta, rec.body))) };
  }
  if (rec.kind === 'help') {
    const meta = pick(rec.meta, HELP_KEYS);
    if (!meta.id || !isText(rec.text)) return bad;
    if (linked(p.help)) return linked(p.help);
    return { file: rel(writeNew(p.help, slug(meta.id, 80), (id) => renderDoc({ ...meta, id, status: 'open' }, rec.text))) };
  }
  if (rec.kind !== 'reply' || !isText(rec.card) || !isText(rec.line) || !rec.line.startsWith('- ')) return bad;
  const lessonMeta = rec.lesson ? pick(rec.lesson.meta, LESSON_KEYS) : null;
  if (rec.lesson && (!lessonMeta.title || !isText(rec.lesson.body))) return bad;
  // a reply goes into the card as it is now (a pull may have added replies since the draft),
  // and only into the card the draft named
  const d = listDocs(p.help).find((x) => x.id === rec.card);
  if (!d) return { error: `No help card "${rec.card}" any more, so the reply was not saved.` };
  if (linked(d.file) || (rec.lesson && linked(p.lessons))) return linked(d.file) || linked(p.lessons);
  const { meta, body } = parseDoc(readPlain(d.file));
  let lesson = null;
  if (rec.lesson) {
    meta.status = 'resolved';
    meta.resolvedBy = lessonMeta.author;
    lesson = rel(writeNew(p.lessons, `${day(lessonMeta.date)}-${slug(lessonMeta.title)}`, () => renderDoc(lessonMeta, rec.lesson.body)));
  }
  const replies = body.includes('## Replies') ? body.trimEnd() : `${body.trimEnd()}\n\n## Replies`;
  fs.writeFileSync(d.file, renderDoc(meta, `${replies}\n${line(rec.line)}\n`));
  return { file: rel(d.file), lesson, author: meta.author };
}

// null when .codehere/local/drafts/ is not a plain folder in this repo: a committed symlink must
// not move drafts elsewhere, nor let expiry delete files there; a committed file must not be mistaken
// for the folder.
function draftsHere(root) {
  const dir = paths(root).drafts;
  if (!ownPath(root, dir)) return null;
  try {
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch (e) {
    return e.code === 'ENOENT' ? dir : null;
  }
}

// The id is new each time, so a draft file a teammate planted through git is never reused.
export function writeDraft(root, rec) {
  const dir = draftsHere(root);
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  for (;;) {
    const id = crypto.randomBytes(4).toString('hex');
    try {
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, created: new Date().toISOString(), ...rec }, null, 2) + '\n', { flag: 'wx' });
      return id;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

export function draftFile(root, id) {
  const dir = draftsHere(root);
  return dir && /^[0-9a-f]{8}$/.test(String(id)) ? path.join(dir, `${id}.json`) : null;
}

// Runs at every session start, so it never throws: whatever a teammate committed under drafts/,
// session start goes on. Only plain files named like drafts are removed.
export function expireDrafts(root, days = 7) {
  try {
    const dir = draftsHere(root);
    if (!dir || !fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) return;
    const cutoff = Date.now() - days * 864e5;
    for (const f of fs.readdirSync(dir).filter((x) => /^[0-9a-f]{8}\.json$/.test(x))) {
      const file = path.join(dir, f);
      try {
        if (!fs.lstatSync(file).isFile()) continue;
        // the older of its own date and the file's: a date written into the file cannot keep it forever
        let created = NaN;
        try {
          created = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).created);
        } catch {}
        if (!(Math.min(created, fs.lstatSync(file).mtimeMs) >= cutoff)) fs.rmSync(file, { force: true });
      } catch {}
    }
  } catch {}
}
