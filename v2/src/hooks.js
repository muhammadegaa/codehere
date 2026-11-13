// Hook handlers for Claude Code, Codex CLI (--agent codex) and Copilot CLI (--agent copilot).
// Every handler fails open: if anything goes wrong, it exits 0 and the agent carries on as if
// Codehere were not installed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  findRoot, paths, readConfig, readState, writeState, session, readRules, renderDoc,
  listDocs, git, gitDiff, isGitRepo, me, isApproved, readApprovals, printable, commitId, statusFiles, gitHashes, noTick,
  removedAt, expireDrafts, draftFile, saveRecord, readPlain, ownPath, teamSnapshot, teamMark, keepSaved, isMap,
} from './brain.js';
import {
  responseText, signature, errorLines, similarity, tamperFindings, failingTest, lowInfoPrompt, vagueFeature, testCounts, redact, plainYes,
} from './signals.js';

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emitJson(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function toAgent(message) {
  // exit 2: stderr is shown to the agent (PostToolUse) / blocks stopping (Stop)
  process.stderr.write(message);
  process.exit(2);
}

// A note for the agent that goes out only when the hook has nothing else to say.
let quietNote = null;
const quiet = () => (quietNote ? emitJson(quietNote) : process.exit(0));

// Copilot's inputs: camelCase from its own hook file, snake_case from .claude/settings.json.
// Map them to the names the handlers read. A failed command arrives as a successful tool
// call; only its output shows the failure.
function fromCopilot(i) {
  const tool = i.toolName ?? i.tool_name;
  return {
    ...i,
    session_id: i.sessionId ?? i.session_id,
    tool_name: tool === 'bash' ? 'Bash' : tool,
    tool_input: i.toolArgs ?? i.tool_input,
    tool_response: i.toolResult?.textResultForLlm ?? i.tool_result?.text_result_for_llm,
  };
}

const COPILOT_EVENT = { 'session-start': 'sessionStart', prompt: 'userPromptSubmitted', 'post-tool': 'postToolUse', stop: 'agentStop' };

// Whether Copilot's own hook file runs Codehere for this event.
function copilotFileRuns(root, event) {
  try {
    const hooks = JSON.parse(readPlain(path.join(root, '.github/hooks/codehere.json'))).hooks;
    return (hooks?.[COPILOT_EVENT[event]] || []).some((h) => h?.command === `codehere hook ${event} --agent copilot`);
  } catch {
    return false;
  }
}

export async function runHook(event, agent) {
  let input = readStdin();
  const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const root = findRoot(start);
  // Copilot also runs the hooks in .claude/settings.json, adding a `timestamp` Claude Code does
  // not send. When Copilot's own file runs Codehere for this event, these stay quiet so nothing
  // runs twice. Otherwise they are all Copilot has, and answer in its format.
  if (agent !== 'copilot' && process.env.COPILOT_CLI && 'timestamp' in input) {
    if (root && copilotFileRuns(root, event)) quiet();
    agent = 'copilot';
  }
  if (agent === 'copilot') input = fromCopilot(input);
  if (!root) {
    // uninstall ran while this session was open: its hooks still run, .codehere/ is gone
    const at = event === 'stop' && removedAt(start);
    if (at) emitJson({ systemMessage: removedLine(at) });
    quiet();
  }
  try {
    if (event === 'session-start') return sessionStart(root, input, agent);
    if (event === 'prompt') return promptSubmit(root, input);
    if (event === 'post-tool') return postTool(root, input, agent === 'codex' || agent === 'copilot' ? agent : 'claude');
    if (event === 'stop') return stop(root, input);
  } catch (err) {
    if (process.env.CODEHERE_DEBUG) console.error(err);
  }
  quiet();
}

// ---------- SessionStart: load only human-confirmed context ----------

// How the agent learns the chores (spec 3.2). It comes after the team rules at every session start.
const CHORES_NOTE = [
  'Codehere is set up in this repo. When the user asks for one of these, or Codehere asks you to offer one, run the command:',
  '- add a team rule: codehere rule "<rule>"',
  '- save a fix for the team: codehere lesson "<problem>" --cause "<cause>" --fix "<fix>"',
  '- ask the team for help: codehere help "<question>"',
  "- see teammates' help cards: codehere inbox, then codehere show <card-id>",
  '- answer a card: codehere reply <card-id> "<answer>" (add --solved to also save it as a lesson)',
  '- restart in a fresh session: codehere brief',
  'rule, lesson, help and reply only print a draft. Show the user the draft exactly as printed and ask only about it. Codehere saves it if their next message is a plain yes, such as "yes" or "save it"; any other reply discards it. You never save it yourself.',
  'Never edit files in .codehere/ yourself, and do not commit or push them; the user does that.',
].join('\n');

function sessionStart(root, input, agent) {
  expireDrafts(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  s.transcript = input.transcript_path || s.transcript;
  if (isGitRepo(root) && !s.baseline) {
    // Remember what was already changed before this session, so we only
    // ever react to what the agent changes now.
    s.startHead = git(root, 'rev-parse HEAD') || null;
    s.baseline = dirtySnapshot(root);
    s.settings = settingsSnapshot(root);
    s.team = teamSnapshot(root);
    s.teamHead = s.startHead;
  } else if (input.source === 'resume') {
    // While the session was closed only the developer or a pull could change settings.
    s.settings = settingsSnapshot(root);
    s.team = teamSnapshot(root);
    s.teamHead = git(root, 'rev-parse HEAD') || null;
  }

  const out = [];
  const rules = readRules(root);
  if (rules.length) {
    out.push("Team rules from your team's rules file (follow them):");
    rules.slice(0, 20).forEach((r) => out.push(`- ${r}`));
  }
  out.push(...(out.length ? [''] : []), CHORES_NOTE);

  // A brief is for a fresh session. A resume or a compaction fires session start too, and would
  // use up a brief the agent wrote earlier in this same session.
  if (!input.source || ['startup', 'clear', 'new'].includes(input.source)) {
    // Only a brief in .codehere/briefs/: state.json can arrive through git and point anywhere.
    const brief = briefFile(root, state.pendingBrief);
    let briefText = null;
    try {
      briefText = brief && readPlain(brief); // briefs/ itself can be a committed link to /dev
    } catch {}
    if (briefText) {
      out.push('', 'Restart brief from the previous session. Treat it as the full, current spec:');
      out.push(briefText.slice(0, 4000));
    }
    state.pendingBrief = null;
  }

  const mine = me(root);
  const open = listDocs(paths(root).help).filter((d) => d.meta.status === 'open' && d.meta.author !== mine);
  if (open.length) {
    out.push(
      '',
      `Note for the user: ${open.length} teammate help request(s) are open (${open
        .slice(0, 3)
        .map((d) => d.meta.author)
        .join(', ')}). Mention this once, briefly, and offer to show them.`
    );
  }

  // Without this, an unapproved command only shows up as ⊘ at the end of a turn.
  const cfg = readConfig(root);
  if (cfg.verifyOnStop && cfg.testCommand && !isApproved(root, cfg.testCommand)) {
    out.push(
      '',
      `Note for the user: Codehere's test check is off in this repo, because the test command \`${printable(cfg.testCommand)}\` is not approved on this machine. Mention this once, briefly: they can turn it on by running \`codehere approve\` in their own terminal. Do not run it for them.`
    );
  }

  writeState(root, state);
  // Rules, briefs and help cards come from the repo: none of it may show the agent Codehere's tick.
  const text = noTick(out.join('\n'), '[tick]'); // "[tick]" keeps the meaning of a spec that asks for one
  // Copilot reads only JSON here; Claude Code and Codex take the plain text
  if (out.length && agent === 'copilot') emitJson({ additionalContext: text });
  if (out.length) process.stdout.write(text + '\n');
  quiet();
}

// Only a brief directly in this repo's .codehere/briefs/, with no link on the way. state.json and
// briefs/ can both arrive through git: a resolved path would follow a committed briefs/ link out
// of the repo. The final name is refused if it is a link when it is read (readPlain).
function briefFile(root, file) {
  const name = typeof file === 'string' ? path.basename(file) : '';
  if (!/^[\w-]+\.md$/.test(name)) return null;
  const brief = path.join(paths(root).briefs, name);
  return ownPath(root, brief) ? brief : null;
}

// ---------- what changed in THIS session ----------

const IGNORE = (f) => ['.codehere/', '.claude/', '.codex/', '.github/copilot/', '.github/hooks/'].some((d) => f.startsWith(d));

export function dirtySnapshot(root) {
  const files = statusFiles(root).filter((f) => !IGNORE(f));
  const hashes = gitHashes(root, files);
  return Object.fromEntries(files.map((f, i) => [f, hashes[i] || 'x']));
}

function changedThisSession(root, s) {
  const now = dirtySnapshot(root);
  const before = s.baseline || null;
  const changed = new Set();
  if (!before) {
    Object.keys(now).forEach((f) => changed.add(f));
  } else {
    for (const f of new Set([...Object.keys(now), ...Object.keys(before)])) {
      if (now[f] !== before[f]) changed.add(f);
    }
  }
  if (commitId(s.startHead)) {
    git(root, ['diff', s.startHead, 'HEAD', '--name-only', '--relative', '-z'], true)
      .split('\0')
      .filter((f) => f && !IGNORE(f))
      .forEach((f) => changed.add(f));
  }
  return [...changed];
}

// Files that decide what Codehere runs and tells every agent, and the agents' own hook
// settings. Claude Code and Codex load hooks at session start, so a hook removed mid-session
// still runs at this session's finish check and can report it. Copilot runs every file in
// .github/hooks/, so that folder counts as one.
const PROTECTED = [
  '.codehere/config.json', '.codehere/rules.md', '.claude/settings.json', '.claude/settings.local.json', '.codex/hooks.json', '.codex/config.toml',
  '.github/hooks/', '.github/copilot/settings.json', '.github/copilot/settings.local.json',
];

// A symlink is not followed (one to /dev/zero would hang the hook); its target stands for it, so a
// change is still seen.
function readProtectedFile(file) {
  return fs.lstatSync(file).isSymbolicLink() ? `link:${fs.readlinkSync(file)}` : readPlain(file);
}
function readProtected(root, f) {
  if (!f.endsWith('/')) return readProtectedFile(path.join(root, f));
  const files = fs.readdirSync(path.join(root, f)).filter((n) => n.endsWith('.json')).sort();
  if (!files.length) return null;
  return files.map((n) => `${n}\0${readProtectedFile(path.join(root, f, n))}`).join('\0');
}

function settingsSnapshot(root) {
  const snap = {};
  for (const f of PROTECTED) {
    let text = null;
    try {
      text = readProtected(root, f);
    } catch {}
    // In .claude/ only the hook and env settings count: Claude Code also saves permission
    // rules there when the developer picks "don't ask again". env can move HOME or
    // XDG_CONFIG_HOME, where approvals are kept. A missing file has none of them.
    // Codex keeps what it saves in the user's own config, so .codex/ files count whole.
    // Copilot's settings files in .github/copilot/ count like .claude/; its hooks file is ours.
    if (f.startsWith('.claude/') || f.startsWith('.github/copilot/')) {
      try {
        const j = JSON.parse(text ?? '{}');
        text = JSON.stringify([j.hooks ?? null, j.disableAllHooks ?? null, j.env ?? null]);
      } catch {}
    }
    snap[f] = text == null ? null : crypto.createHash('sha256').update(text).digest('hex');
  }
  return snap;
}

// Lessons and help cards changed since the snapshot. A file with an uncommitted change is listed.
// Otherwise it is listed only if no commit since the snapshot touched it: a pull, or the person's
// own commit, changes files through commits, while an uncommitted save undone by `git stash` or
// `git checkout`, or an untracked file deleted, leaves no commit. What Codehere saved was moved
// into the snapshot (keepSaved).
function teamChanged(root, s) {
  if (!isMap(s.team)) return [];
  const now = teamSnapshot(root);
  const diff = [...new Set([...Object.keys(now), ...Object.keys(s.team)])].filter((f) => now[f] !== s.team[f]);
  if (!diff.length) return [];
  const nfc = (f) => f.normalize('NFC');
  const dirty = new Set(statusFiles(root).map(nfc));
  let byCommit = null;
  const committed = (f) => {
    if (!byCommit) {
      // the commits since the snapshot, and the trees' difference (a reset or a branch switch); a
      // rename counts as a removal and an addition
      const from = commitId(s.teamHead === undefined ? s.startHead : s.teamHead);
      const paths = ['--', '.codehere/lessons', '.codehere/help'];
      const names = (out) => out.split('\0').map((x) => nfc(x.replace(/^\n+/, ''))).filter(Boolean);
      const log = names(git(root, ['log', '--name-only', '--no-renames', '--relative', '-z', '--format=', from ? `${from}..HEAD` : 'HEAD', ...paths], true));
      const trees = from ? names(git(root, ['diff', '--name-only', '--no-renames', '--relative', '-z', from, 'HEAD', ...paths], true)) : [];
      byCommit = new Set([...log, ...trees]);
    }
    return byCommit.has(nfc(f));
  };
  return diff.filter((f) => dirty.has(nfc(f)) || !committed(f)).sort();
}

function settingsChanged(root, s) {
  if (!s.settings) return []; // no snapshot from session start: cannot tell
  const now = settingsSnapshot(root);
  // a session that started before a file was protected has no hash for it
  return PROTECTED.filter((f) => f in s.settings && now[f] !== s.settings[f]);
}

// ---------- PostToolUse (Bash): loop breaker + just-in-time team lessons ----------

// Commands that only read files. Their output may contain the word "error"
// (source code, logs) without anything having failed. A chain such as
// `cd x && cat a; ls b` is read-only only if every part is. Quoted text is
// emptied first so `grep "error|fail"` stays one part, and a part that runs
// another command ($(...), backticks, <(...)) is never read-only.
const READ_ONLY = /^\s*(cd|pwd|echo|cat|head|tail|less|more|grep|rg|ag|sed\s+-n|awk|ls|find|tree|wc|git\s+(diff|show|log|blame|grep|status))(\s|$)/;
// Read-only commands that can still run another: awk's system(), a pipe or a file of awk code;
// find's -exec; git grep -O; rg --pre; GNU sed's e command. Read on the part with its quote marks
// removed, so quoting cannot hide them, and only on read-only parts, so a codehere argument that
// mentions system() is still Codehere's own output.
function runsInside(plain) {
  if (/^\s*awk(\s|$)/.test(plain)) return /system\s*\(|\||\s-[fEil]|\s--(file|exec|include|load)|@include|@load/.test(plain);
  if (/^\s*find(\s|$)/.test(plain)) return /\s-(exec|execdir|ok|okdir|delete)(\s|$)/.test(plain);
  if (/^\s*git\s+grep(\s|$)/.test(plain)) return /\s(-O|--open-files-in-pager)/.test(plain);
  if (/^\s*rg(\s|$)/.test(plain)) return /\s--pre(\s|=|$)/.test(plain);
  // GNU sed's e command, or e among the flags after s/.../.../
  if (/^\s*sed(\s|$)/.test(plain)) return /(^|[\s;{}0-9/$])e(\s|;|$)|\/[a-zA-Z0-9]*e[a-zA-Z0-9]*(\s|;|$)/.test(plain.replace(/^\s*sed\s+-n/, ''));
  return false;
}
const readOnlyPart = (p) => READ_ONLY.test(p.bare) && !runsInside(p.plain);

// The parts of a shell command, each as { bare, plain }: bare has quoted text emptied (to see the
// command), plain has only the quote marks removed (to see what it runs). Quotes and backslashes are
// read as the shell reads them: nothing quoted or escaped separates parts, and single quotes hold
// plain text. null when a part runs another command or the command cannot be split for sure: $( and
// backticks (also inside double quotes); <( >( $'...' ( ) a comment or a here-doc outside quotes;
// an unclosed quote. A lone & separates parts, but not in 2>&1 or &>file.
function commandParts(command) {
  const parts = [];
  let bare = '';
  let plain = '';
  let quote = null;
  const cut = () => {
    if (bare.trim()) parts.push({ bare, plain });
    bare = plain = '';
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    const prev = command[i - 1];
    if (quote === "'") {
      if (c === "'") (quote = null), (bare += "''");
      else plain += c;
      continue;
    }
    if (c === '\\') {
      i++; // the next character is literal; a backslash-newline is removed, as the shell does
      if (next !== '\n' && next !== undefined) (bare += quote ? '' : '_'), (plain += next);
      continue;
    }
    if (c === '`' || (c === '$' && (next === '(' || next === '['))) return null; // $[ ] arithmetic expands its text again
    if (quote === '"') {
      if (c === '"') (quote = null), (bare += "''");
      else plain += c;
      continue;
    }
    if (c === '(' || c === ')' || (c === '$' && next === "'") || (c === '<' && next === '<')) return null;
    if (c === '#' && (i === 0 || /[\s;&|]/.test(prev))) return null;
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === ';' || c === '\n') {
      cut();
      continue;
    }
    if (c === '|') {
      if (next === '|' || next === '&') i++;
      cut();
      continue;
    }
    if (c === '&' && next === '&') {
      i++;
      cut();
      continue;
    }
    if (c === '&' && prev !== '<' && prev !== '>' && next !== '>') {
      cut();
      continue;
    }
    bare += c;
    plain += c;
  }
  if (quote) return null;
  cut();
  return parts;
}
export function readOnly(command) {
  return !!commandParts(command)?.every(readOnlyPart);
}

// Codehere's own commands print error text by design (status, help cards, briefs), so their output
// is not read for errors. A chain that also runs something else still is.
// codehere on the PATH, through npx (with -y and a version), or the project's own copy, with flags
// before the subcommand (only the CLI's on/off flags: a flag that takes a value would swallow the
// subcommand). Not any program named codehere, and no VAR=value in front: PATH= could
// point to another codehere.
const CALL = String.raw`^\s*(npx\s+((-y|--yes)\s+)*codehere(@[\w.^~-]+)?|((\.\/)?node_modules\/\.bin\/)?codehere)(\s+--(gemma|all|solved))*`;
const CODEHERE = new RegExp(`${CALL}(\\s|$)`);
const ownOrReadOnly = (command) => !!commandParts(command)?.every((p) => CODEHERE.test(p.bare) || readOnlyPart(p));

// ---------- drafts: tie the draft a writing command printed to this session ----------

const WRITING = new RegExp(`${CALL}\\s+(rules?|lessons?|help|reply)(\\s|$)`);
const MARKER = /^Codehere draft id: ([0-9a-f]{8})$/;

// 'bound', 'refused' (a draft was printed but cannot be tied to the session), or null (no draft).
// Only the writing call itself may print the last line: it must come last, after nothing but cd.
// A draft git tracks came through git (a teammate force-added it), so it is never bound.
function bindDraft(root, input, command, text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (/^<shellId: .*>$/.test(lines.at(-1) || '')) lines.pop(); // Copilot's own last line
  const m = MARKER.exec(lines.at(-1) || '');
  if (!m) return null;
  const parts = commandParts(command);
  // only a writing call makes a draft: other output that ends in a marker is not Codehere's to explain
  const wrote = parts ? parts.some((p) => WRITING.test(p.bare)) : /(^|[\s;&|])codehere\s+(rules?|lessons?|help|reply)(\s|$)/.test(command);
  if (!wrote) return null;
  const file = draftFile(root, m[1]);
  const callOk = !!parts?.length && WRITING.test(parts.at(-1).bare) && parts.slice(0, -1).every((p) => /^\s*cd(\s|$)/.test(p.bare));
  // by exact name, and git's list compared without case: on macOS ABCDEF12.json opens as abcdef12.json
  const exact = !!file && fs.existsSync(path.dirname(file)) && fs.readdirSync(path.dirname(file)).includes(`${m[1]}.json`);
  const rel = path.relative(root, file || '').toLowerCase();
  const tracked = git(root, ['ls-files', '-z']).split('\0').some((x) => x.toLowerCase() === rel); // .CODEHERE/... too
  if (!callOk || !exact || tracked) return 'refused';
  const content = readPlain(file, null);
  let rec = null;
  try {
    rec = JSON.parse(content);
  } catch {}
  // the file must still say what the person was shown: every line of it was in the output
  if (!rec || !shownIn(rec, text)) return 'refused';
  const kind = rec.kind;
  const state = readState(root);
  if (!input.session_id) return 'refused';
  const s = session(state, input.session_id);
  const entry = { id: m[1], kind, hash: crypto.createHash('sha256').update(content).digest('hex') };
  // the lesson the agent drafts after the finish check's offer takes the proof kept for it
  if (kind === 'lesson' && s.pendingLesson && typeof s.pendingLesson === 'object') {
    entry.proof = s.pendingLesson;
    delete s.pendingLesson;
  }
  s.drafts = [...(Array.isArray(s.drafts) ? s.drafts : []), entry];
  delete s.lastSendBack; // any send-back came before this draft, so it cannot be the answer to it
  return writeState(root, state) ? { proof: entry.proof || null } : 'refused'; // a binding that was not kept is not one
}

// The lines the CLI printed for this record (commands.js draft()), each indented by two spaces.
function shownIn(rec, text) {
  const doc = (x) => (x && typeof x === 'object' ? renderDoc(x.meta || {}, String(x.body ?? x.text ?? '')).split('\n') : []);
  const lines = rec.kind === 'rule' ? [rec.line] : rec.kind === 'lesson' ? doc(rec) : rec.kind === 'help' ? doc({ meta: rec.meta, text: rec.text }) : rec.kind === 'reply' ? [rec.line, ...doc(rec.lesson)] : [];
  const shown = lines.map((l) => String(l ?? '')).filter((l) => l.trim());
  // whole printed lines, and for a reply the card it is for
  const out = new Set(text.split('\n').map((l) => l.replace(/\r$/, '')));
  const card = rec.kind !== 'reply' || out.has(printable(`Not saved yet. Draft of a reply to help card ${rec.card}:`));
  return card && shown.length > 0 && shown.every((l) => out.has(`  ${printable(l)}`));
}

const NOT_BOUND = 'Codehere could not tie this draft to the session, so a yes will not save it. Run the codehere command again on its own, with nothing before it but cd and nothing after it.';
const noteFor = (agent, event, message) => (agent === 'copilot' ? { additionalContext: message } : { hookSpecificOutput: { hookEventName: event, additionalContext: message } });

function matchLesson(root, sig, shown, test) {
  let best = null;
  for (const doc of listDocs(paths(root).lessons)) {
    if (shown.includes(doc.id) || doc.body.includes('- Fix: <one line>')) continue; // not filled in yet
    // Every failed assert.equal shares one first line, so when both name the failing test, it must be the same test.
    if (test && doc.meta.test && doc.meta.test !== test) continue;
    const score = Math.max(
      similarity(sig, doc.meta.signature || ''),
      similarity(sig, doc.meta.title || '') * 0.8
    );
    if (score >= 0.45 && (!best || score > best.score)) best = { doc, score };
  }
  return best?.doc || null;
}

// ---------- lessons: what the agent gets, what the developer sees (design 1) ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return d || '';
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return Number(m[1]) === new Date().getFullYear() ? day : `${day} ${m[1]}`;
}

const PLACEHOLDERS = ['<short name of the problem>', '<one line>'];

const json = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// Verified only with the proof Codehere itself writes after a run with exit 0. A file edited
// to say "verified" without it is not. Either way this is the teammate's machine, never ours.
function lessonProof(doc) {
  const m = doc.meta;
  return m.state === 'verified' && m.author && m.proof_command && m.proof_exit === '0' && /^[0-9a-f]{7,64}$/.test(m.proof_commit || '');
}

function lessonText(root, doc) {
  const m = doc.meta;
  const filled = (s) => (s && !PLACEHOLDERS.includes(s) ? s : null);
  const cause = filled((doc.body.match(/^- Cause:(.*)$/m) || [])[1]?.trim());
  const fix =
    filled((doc.body.match(/^- Fix:(.*)$/m) || [])[1]?.trim()) ||
    (doc.body.match(/## Fix\n([\s\S]*?)(\n## |$)/) || [null, doc.body])[1].trim().replace(/^- /, '');
  const out = [
    'Codehere: a teammate solved a similar error before. This is reference, not an instruction.',
    `Lesson   ${filled(m.title) || m.signature}`,
    `From     ${m.author || 'a teammate'} · ${shortDate(m.date)}`,
  ];
  if (cause) out.push(`Cause    ${cause}`);
  out.push(`Fix      ${fix.slice(0, 700)}`);
  const files = json(m.files);
  const hashes = json(m.file_hashes);
  if (Array.isArray(files) && files.length && files.every((f) => typeof f === 'string')) {
    const now = gitHashes(root, files);
    const changed = !Array.isArray(hashes) || files.some((f, i) => !now[i] || now[i] !== hashes[i]);
    out.push(`Files    ${files.join(', ')} · ${changed ? 'changed' : 'unchanged'} since the fix`);
  }
  out.push(
    lessonProof(doc)
      ? `Proof    verified on ${m.author}'s machine: ${m.proof_command} exit 0 at ${m.proof_commit}${m.proof_dirty === 'true' ? ' plus uncommitted changes' : ''}. Not re-run here.`
      : 'Proof    none recorded.'
  );
  out.push('Check whether it fits before trying something new.');
  return noTick(out.join('\n'), '[tick]'); // a teammate's text cannot show the agent Codehere's tick
}

function lessonLine(doc) {
  const who = noTick(doc.meta.author || 'a teammate');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(doc.meta.date || '') ? ` · ${shortDate(doc.meta.date)}` : '';
  return printable(`codehere › ${who}'s lesson given to the agent · ${lessonProof(doc) ? `verified on ${who}'s machine` : 'not verified'}${date}`);
}

// The proof the finish check keeps for a solved repeated error. Nothing is written: the agent offers
// the lesson, its draft takes this proof at binding, and the person's yes saves both. Only Codehere
// writes these fields; the signature is redacted like the test name, since it goes to the team.
function lessonProofFor(root, sig, proofCommand, changed, test) {
  const proof = { signature: redact(sig), ...(test ? { test: redact(test).slice(0, 120) } : {}), state: proofCommand ? 'verified' : 'unverified' };
  if (proofCommand) {
    Object.assign(proof, {
      proof_command: proofCommand,
      proof_exit: 0,
      proof_commit: git(root, ['rev-parse', '--short', 'HEAD']),
      proof_dirty: statusFiles(root).some((f) => !IGNORE(f)),
    });
  }
  proof.files = JSON.stringify(changed);
  proof.file_hashes = JSON.stringify(gitHashes(root, changed));
  return proof;
}

// What the agent and the person are shown when an offered lesson's draft takes its proof. The
// person's line names the error, so a yes after a declined offer cannot attach it to another lesson unseen.
function proofNote(agent, event, proof) {
  const line = proof.state === 'verified' ? `proof: ${noTick(proof.proof_command)} passed here at ${noTick(proof.proof_commit)}` : 'not verified: no passing test run here this session';
  const context = `Codehere will add this to the lesson: the error "${noTick(proof.signature)}" and ${line}. Show the user this line with the draft.`;
  if (agent === 'copilot') return { additionalContext: printable(context) };
  return { systemMessage: printable(`codehere › lesson draft for "${short(noTick(String(proof.signature)))}" · ${line}`), hookSpecificOutput: { hookEventName: event, additionalContext: printable(context) } };
}

function postTool(root, input, agent) {
  if (input.tool_name && input.tool_name !== 'Bash') quiet();
  const command = (input.tool_input && input.tool_input.command) || '';
  const text = responseText(input.tool_response) + '\n' + (input.error || '');
  // a refused draft never stops the error count: the note waits for a hook that has nothing else to say
  const bind = bindDraft(root, input, command, text);
  if (bind === 'refused') quietNote = noteFor(agent, input.hook_event_name || 'PostToolUse', NOT_BOUND);
  else if (bind?.proof) quietNote = proofNote(agent, input.hook_event_name || 'PostToolUse', bind.proof);
  if (ownOrReadOnly(command)) quiet();
  const sig = signature(text);
  if (!sig) {
    // the command that failed last now runs clean: that failure is over
    const state = readState(root);
    const s = state.sessions[input.session_id || 'default'];
    if (s && s.lastFailure && s.lastFailure.command === command) {
      s.lastFailure = null;
      writeState(root, state);
    }
    quiet();
  }

  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  s.errors[sig] = (s.errors[sig] || 0) + 1;
  s.rawErrors[sig] = errorLines(text, 8);
  const test = failingTest(text);
  // A lesson names the failing test only if every failure on this line was that test.
  const tests = s.tests && typeof s.tests === 'object' ? s.tests : {};
  s.tests = { ...tests, [sig]: Object.hasOwn(tests, sig) && tests[sig] !== test ? '' : test || '' };
  s.lastFailure = { sig, command, test, lines: errorLines(text, 3), prompt: s.prompts || 0 };
  const count = s.errors[sig];

  const lesson = matchLesson(root, sig, s.shownLessons, test);
  if (lesson) s.shownLessons.push(lesson.id);
  writeState(root, state);

  const threshold = cfg.loopThreshold;
  if (count === threshold || count === threshold + 2) {
    s.loopsStopped = (s.loopsStopped || 0) + 1;
    writeState(root, state);
    const msg = [
      `Codehere: the same error has come back ${count} times this session:`,
      `  ${sig}`,
      'Stop patching. Do this instead:',
      '1. Write one sentence with your root-cause hypothesis.',
      '2. Check it with one small command before editing any file.',
      '3. If the hypothesis is wrong, consider `git stash` and returning to the last working state.',
    ];
    if (lesson) msg.push('', lessonText(root, lesson));
    if (count > threshold) {
      msg.push(
        '',
        'You are still stuck. Stop now. In one short line, offer to write a help card for the team or a restart brief for a fresh session. Then wait for the user.'
      );
    }
    // Codex replaces the command's output with a block's text (or exit 2's), so the agent
    // would lose the error. There it goes in as context next to the output. Copilot shows
    // exit 2 to the developer, not the agent, and takes context only in its own format.
    if (agent === 'copilot') emitJson({ additionalContext: msg.join('\n') });
    if (agent === 'codex') {
      emitJson({
        ...(lesson ? { systemMessage: lessonLine(lesson) } : {}),
        hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg.join('\n') },
      });
    }
    // with a lesson, JSON instead of exit 2, so the developer also gets its line
    if (lesson) emitJson({ decision: 'block', reason: msg.join('\n'), systemMessage: lessonLine(lesson) });
    toAgent(msg.join('\n') + '\n');
  }

  if (lesson && agent === 'copilot') emitJson({ additionalContext: lessonText(root, lesson) });
  if (lesson) {
    emitJson({
      systemMessage: lessonLine(lesson),
      hookSpecificOutput: {
        hookEventName: input.hook_event_name || 'PostToolUse',
        additionalContext: lessonText(root, lesson),
      },
    });
  }
  quiet();
}

// ---------- UserPromptSubmit: restore what a short prompt leaves out ----------
// One message at most, only about this session, under 300 tokens. Silent on normal turns.

// ---------- the person's answer to a draft ----------
// A draft is decided by the person's very next message: a plain yes saves it, anything else
// discards it. Notes go to the agent, lines to the person.
const RULES = '.codehere/rules.md';
function gist(rec) {
  if (rec.kind === 'rule') return String(rec.line).replace(/^- /, '').replace(/ \([^()]*\)$/, '');
  if (rec.kind === 'lesson') return String(rec.meta?.title ?? '');
  if (rec.kind === 'help') return (/## Question\n(.+)/.exec(String(rec.text)) || [])[1] || '';
  return String(rec.line).replace(/^- [^:]*\): /, '');
}
const short = (t) => (t.length > 60 ? `${t.slice(0, 60)}…` : t);

function decideDrafts(root, state, s, prompt) {
  const notes = [];
  const lines = [];
  // Copilot passes a send-back to this hook as if the person typed it: that is not their answer
  // used once: a later message that happens to start the same way is the person's
  const skip = s.lastSendBack && prompt.startsWith(s.lastSendBack);
  delete s.lastSendBack;
  if (skip) return { notes, lines };
  // since this session's previous prompt, or its start: an older draft is not this answer's
  const since = Date.parse(s.lastPromptAt || s.startedAt || '') || Date.now();
  s.lastPromptAt = new Date().toISOString();
  const bound = (Array.isArray(s.drafts) ? s.drafts : []).filter((d) => d && typeof d === 'object' && /^[0-9a-f]{8}$/.test(String(d.id)));
  const yes = plainYes(prompt);
  let proofBack = null;
  for (const d of bound) {
    const file = draftFile(root, d.id);
    // Taken by a rename, which only one of two hooks running at the same moment can win (two unlinks
    // of one file both succeeded in a test on macOS); the other finds it gone and saves nothing.
    let content = null;
    try {
      const taken = `${file}.${crypto.randomBytes(4).toString('hex')}.taken`;
      fs.renameSync(file, taken);
      content = readPlain(taken, null);
      fs.rmSync(taken, { force: true });
    } catch {
      continue;
    }
    if (!yes) {
      proofBack = d.proof || proofBack; // "change the title": the redraft keeps the proof
      continue;
    }
    if (!content || crypto.createHash('sha256').update(content).digest('hex') !== d.hash) {
      notes.push('Codehere did not save a draft: its file changed after it was shown to the user.');
      lines.push('codehere ✕ not saved · the draft changed after it was shown');
      continue;
    }
    let rec = null;
    try {
      rec = JSON.parse(content);
    } catch {}
    const before = settingsSnapshot(root)[RULES];
    const teamBefore = teamMark(root);
    const saved = saveRecord(root, rec, d.proof || null);
    if (saved.error) {
      notes.push(`Codehere could not save the draft: ${saved.error}`);
      lines.push(`codehere ✕ not saved · ${noTick(saved.error)}`);
      continue;
    }
    // a saved rule is not a settings change, unless rules.md had already changed this session
    if (rec.kind === 'rule' && s.settings && s.settings[RULES] === before) s.settings[RULES] = settingsSnapshot(root)[RULES];
    const teamAfter = teamSnapshot(root);
    for (const x of Object.values(state.sessions)) keepSaved(x, teamBefore, teamAfter); // every open session: the save is not its agent's either
    notes.push(`Codehere saved the draft after the user's yes: ${saved.file}${saved.lesson ? `, and the team lesson ${saved.lesson}` : ''}. Tell them it is saved. Teammates get it once the user commits and pushes it.`);
    // the agent's own words: never a tick in a codehere line (DESIGN.md §1)
    lines.push(`codehere › saved after your yes · ${rec.kind} · ${short(noTick(gist(rec)))}`);
  }
  if (bound.length && !yes) {
    notes.push("Codehere discarded the draft because the user's reply was not a plain yes. If they still want it, draft it again.");
    lines.push('codehere › draft not saved · your reply was not a plain yes'); // so a near-yes such as "yes, save it" is not lost unseen
  }
  // a yes that a draft made this turn did not reach (for example a binding lost to a parallel call)
  if (yes && draftMadeSince(root, state, since)) {
    notes.push(`Codehere saved ${bound.length ? 'not all of it' : 'nothing'}: a draft was not tied to this session. Run that codehere command again on its own.`);
    lines.push(bound.length ? 'codehere ✕ not saved · a draft was not tied to this session' : 'codehere ✕ nothing saved · the draft was not tied to this session');
  }
  s.drafts = [];
  if (proofBack) s.pendingLesson = proofBack;
  else delete s.pendingLesson;
  return { notes, lines };
}

// An unbound draft made since then: one bound in any session is that session's to decide.
function draftMadeSince(root, state, since) {
  try {
    const dir = path.dirname(draftFile(root, '00000000'));
    const bound = new Set(Object.values(state.sessions).flatMap((x) => (Array.isArray(x.drafts) ? x.drafts.map((d) => `${d.id}.json`) : [])));
    const fresh = fs.readdirSync(dir).filter((f) => /^[0-9a-f]{8}\.json$/.test(f) && !bound.has(f) && fs.lstatSync(path.join(dir, f)).mtimeMs > since);
    if (!fresh.length) return false;
    // a draft git tracks came through git (a pull), not from a command this session ran
    const tracked = new Set(git(root, ['ls-files', '-z']).split('\0').map((x) => path.basename(x).toLowerCase()));
    return fresh.some((f) => !tracked.has(f));
  } catch {
    return false;
  }
}

function promptSubmit(root, input) {
  if (!input.session_id) quiet(); // without it, sessions cannot be told apart
  const prompt = String(input.prompt || '');
  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  s.transcript = input.transcript_path || s.transcript;
  s.prompts = (s.prompts || 0) + 1;
  if (!s.settings) s.settings = settingsSnapshot(root); // session start did not run for this session
  if (!isMap(s.team)) {
    s.team = teamSnapshot(root);
    s.teamHead = git(root, 'rev-parse HEAD') || null;
  }
  const decided = decideDrafts(root, state, s, prompt);

  // Only a failure from the agent's last turn counts: an older one may be fixed or forgotten.
  const f = s.lastFailure && (s.lastFailure.prompt || 0) === s.prompts - 1 ? s.lastFailure : null;
  const repeats = f ? s.errors[f.sig] || 1 : 0;
  const low = !!f && lowInfoPrompt(prompt);
  if (f && !s.episode) s.episode = { kind: low ? 'still-broken' : 'with-detail', start: s.prompts };

  let msg = null;
  if (low) {
    const changed = isGitRepo(root) ? quickChanged(root, s) : [];
    msg = [
      "Codehere context from this session's tool output (the user did not type this):",
      "The user's short message most likely means the last failure is still there.",
      `- Error (seen ${repeats}x): ${((f.lines && f.lines[0]) || f.sig).slice(0, 200)}`,
      ...(f.test ? [`- Failing test: ${f.test}`] : []),
      `- Command: ${f.command.slice(0, 120)}`,
      ...(changed.length ? [`- Files changed this session: ${changed.join(', ')}`] : []),
      'Find the root cause before editing again. If a fix already failed, try a different hypothesis.',
    ].join('\n');
  } else if (f && !s.briefSuggested && repeats >= cfg.loopThreshold && transcriptTokens(s) >= cfg.longSessionTokens) {
    s.briefSuggested = true;
    msg = [
      `Codehere: this session is long (about ${Math.round(transcriptTokens(s) / 1000)}k tokens) and the same error came back ${repeats} times.`,
      'Fresh sessions with one clear spec fix bugs better than long ones.',
      'In one line, offer to write a restart brief for a fresh session. Then continue with their request.',
    ].join('\n');
  } else if (!f && !s.askedHowToCheck && vagueFeature(prompt)) {
    s.askedHowToCheck = true;
    msg = [
      'Codehere: this feature request has no way to check it yet.',
      'Before writing code, ask the user only this one question: "How will you know it works?"',
      'You may offer 2 to 4 checkable examples they can accept. Then wait for the answer.',
      'Turn the answer into failing tests first, then build in small steps and run the tests after each one.',
    ].join('\n');
  }

  writeState(root, state);
  const context = [...decided.notes, ...(msg ? [msg.slice(0, 1100)] : [])].join('\n\n');
  if (context || decided.lines.length) {
    emitJson({
      ...(decided.lines.length ? { systemMessage: decided.lines.map(printable).join('\n') } : {}),
      ...(context ? { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } } : {}),
    });
  }
  quiet();
}

// Fast list for a prompt (no hashing): tracked files changed since the session started.
function quickChanged(root, s) {
  return git(root, ['diff', '--name-only', '--relative', '-z', commitId(s.startHead) || 'HEAD'], true)
    .split('\0')
    .filter((x) => x && !IGNORE(x))
    .slice(0, 5);
}

// How big the agent's context is now. Claude Code records each reply's token usage in the
// transcript; the file itself is no guide, as it also stores full request bodies.
// 0 means unknown (no usage recorded).
export function transcriptTokens(s) {
  try {
    const size = fs.statSync(s.transcript).size;
    const fd = fs.openSync(s.transcript, 'r');
    const len = Math.min(size, 1024 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const line of lines) {
      if (!line.includes('"usage"')) continue;
      try {
        const u = JSON.parse(line).message?.usage;
        const n = u ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0;
        if (n > 0) return n;
      } catch {}
    }
    return 0;
  } catch {
    return 0;
  }
}

// The session reached a verified green: close the open fix attempt, if any.
function recordGreen(state, s) {
  if (s.firstGreenAt == null) s.firstGreenAt = s.prompts || 0;
  if (s.episode) {
    state.episodes = state.episodes || [];
    state.episodes.push({ kind: s.episode.kind, turns: Math.max(1, (s.prompts || 0) - s.episode.start + 1) });
    state.episodes = state.episodes.slice(-200);
    s.episode = null;
  }
  // A green test run ends a test failure, not an unrelated one such as a failed build.
  const f = s.lastFailure;
  if (f && (f.test || /\b(test|tests|pytest|jest|vitest|mocha|spec)\b/.test(f.command || ''))) s.lastFailure = null;
}

// ---------- Stop: verify "done" outside the agent ----------

function runTests(root, cfg) {
  const started = Date.now();
  const r = spawnSync(cfg.testCommand, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: Math.max(1, Number(cfg.testTimeoutSeconds) || 120) * 1000, // 0 would mean no limit
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  // The runner's own count of failures wins over exit 0: `|| true` on a test script is one edit.
  const c = testCounts(output);
  return { ok: r.status === 0 && !timedOut && !(c && c.failed), output, timedOut, code: r.status, seconds: (Date.now() - started) / 1000 };
}

// "48 passed" or "2 failed" when the runner's summary can be read, else the exit code
export function runResult(t) {
  if (t.timedOut) return 'timed out';
  const c = testCounts(t.output);
  if (t.ok) return c && !c.failed ? `${c.passed} passed` : 'exit 0'; // no summary to read: say only the exit code
  return c && c.failed ? `${c.failed} failed${t.code === 0 ? ' · exit 0' : ''}` : `exit ${t.code}`;
}

const removedLine = (at) => `codehere ✕ codehere uninstall ran at ${new Date(at).toTimeString().slice(0, 5)} · this repo's checks are removed`;

// message: the developer's lines, already escaped
function block(reason, message) {
  emitJson(message ? { decision: 'block', reason, systemMessage: message } : { decision: 'block', reason });
}

function stop(root, input) {
  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  const mayBlock = (s.stopBlocks || 0) < 3; // never trap the agent: after 3 blocks, only observe
  // The first line of each reason is kept: Copilot passes a send-back to the prompt hook as if the
  // person typed it, and the prompt hook must not take it as their answer to a draft.
  // A send-back that cannot be counted is not sent: without the count the 3-block cap would never
  // stop the agent. The developer still gets what was found and why the agent was not sent back.
  // carryOn: a finding that comes before the test run goes in the report and the check goes on, so
  // the test result is not hidden behind it.
  const sendAgentBack = (reason, message, carryOn = false) => {
    s.lastSendBack = reason.split('\n')[0];
    if (writeState(root, state)) block(reason, message);
    const found = reason.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    const why = `codehere ✕ ${noTick([s.lastSendBack, ...found].join(' ')).slice(0, 160)} · not sent back · Codehere could not save its state in .codehere/local`;
    if (carryOn) return void lines.push(why);
    emitJson({ systemMessage: [String(message || '').replace(/ · agent sent back · \d+ of 3/, ''), printable(why)].filter(Boolean).join('\n') });
  };

  if (!isGitRepo(root)) quiet();
  const base = commitId(s.startHead) || 'HEAD';
  const changed = changedThisSession(root, s);
  const settings = settingsChanged(root, s);
  const removed = removedAt(root);
  const team = teamChanged(root, s);
  if (!changed.length && !settings.length && !removed && !team.length) quiet(); // the agent changed nothing this session: stay silent

  // Lines for the developer. Each is escaped as a whole, so text from the repo cannot fake a
  // line, and text from the repo never carries a tick (noTick).
  const lines = [];
  function message() {
    const all = [...lines];
    for (const a of readApprovals(root)) {
      if (a.at > (s.startedAt || '')) all.push(`codehere › approved on this machine during this session: ${noTick(a.command)}`);
    }
    if (settings.length) all.push(`codehere ✕ settings changed during this session · ${settings.join(' · ')}`);
    if (team.length) all.push(`codehere ✕ team files changed during this session, not saved by Codehere · ${noTick(team.slice(0, 5).join(' · '))}${team.length > 5 ? ` · and ${team.length - 5} more` : ''}`);
    if (removed) all.push(removedLine(removed));
    return all.map(printable).join('\n');
  }
  function report() {
    const m = message();
    if (m) emitJson({ systemMessage: m });
    quiet();
  }
  // only lessons or help cards changed: the person gets the line, and the tests are not run
  if (!changed.length && !settings.length && !removed) report();

  // 1. tampering with tests or checks (only in files changed this session)
  let findings = [];
  let unread = false; // the session's diff could not be read, so weakened tests were not checked: never proven
  if (changed.length) {
    const nameStatus = git(root, ['diff', base, '--relative', '--name-status', '--', ...changed]);
    const diff = gitDiff(root, ['diff', base, '--relative', '-U0', '--', ...changed]);
    unread = diff === null;
    findings = tamperFindings(nameStatus, diff || '');
  }
  const key = findings.join('|');
  if (findings.length && s.tamperReported !== key && mayBlock) {
    s.tamperReported = key;
    s.stopBlocks++;
    writeState(root, state);
    sendAgentBack(
      [
        'Codehere found changes that weaken tests or checks:',
        ...findings.map((f) => `- ${f}`),
        'Restore them and fix the code instead.',
        'If the change is truly intended, tell the user in one line why, then finish.',
      ].join('\n'),
      [printable(`codehere ✕ a check was weakened · ${noTick(findings.join(' · '))} · agent sent back · ${s.stopBlocks} of 3`), message()].filter(Boolean).join('\n'),
      true
    );
  }

  // 2. Codehere's settings or the agent's hook settings changed during the session.
  // The agent is sent back only for the ones that can game or switch off the check;
  // a rules.md change is shown to the developer alone.
  const settingsKey = settings.join('|');
  const sendBack = settings.some((f) => f !== '.codehere/rules.md');
  if (sendBack && s.settingsReported !== settingsKey && mayBlock) {
    s.settingsReported = settingsKey;
    s.stopBlocks++;
    writeState(root, state);
    sendAgentBack(
      [
        'Codehere settings or hook settings changed during this session:',
        ...settings.map((f) => `- ${f}`),
        'If you changed them and the user did not ask for it, undo your change.',
        'Then tell the user in one line what changed and why, and finish.',
      ].join('\n'),
      message(),
      true
    );
  }

  // 3. run the tests ourselves, but only a command approved on this machine:
  // a teammate's commit or the agent may have changed it
  const approved = cfg.testCommand && isApproved(root, cfg.testCommand);
  if (cfg.verifyOnStop && cfg.testCommand && !approved) {
    const last = readApprovals(root).at(-1);
    lines.push(
      `codehere ⊘ ${noTick(cfg.testCommand)} · not run · not approved on this machine${last ? ` · last approved: ${noTick(last.command)}` : ''} › run codehere approve in your terminal`
    );
  }
  if (unread && !(cfg.verifyOnStop && approved)) lines.push("codehere ✕ this session's diff could not be read · weakened tests not checked");
  const configChanged = settings.includes('.codehere/config.json');
  const cmd = noTick(cfg.testCommand || '');
  let passLine = null;
  let proven = false; // passed here, now, with intact tests and an unchanged config
  if (cfg.verifyOnStop && approved) {
    const t = runTests(root, cfg);
    // saves made while the tests ran moved snapshots on disk, and this hook writes the whole state back
    const disk = readState(root).sessions || {};
    for (const [k, x] of Object.entries(state.sessions)) if (isMap(disk[k]?.team)) Object.assign(x, { team: disk[k].team, teamHead: disk[k].teamHead });
    if (!t.ok && !mayBlock) {
      lines.push(`codehere ✕ ${cmd} · ${runResult(t)} · not sent back, limit of 3 reached`);
      writeState(root, state);
      report();
    }
    if (!t.ok) {
      s.stopBlocks++;
      writeState(root, state);
      const tail = t.output.split('\n').slice(-25).join('\n');
      sendAgentBack(
        [
          `Codehere ran \`${cmd}\` and it ${t.timedOut ? 'timed out' : 'failed'}. The task is not done yet.`,
          ...(t.code === 0 && !t.timedOut ? ['Its own summary counts failed tests, though the command exited 0.'] : []),
          'Last lines of output:',
          tail,
          'Fix the cause, then finish. Do not change or skip tests to make them pass.',
        ].join('\n'),
        (lines.push(`codehere ✕ ${cmd} · ${runResult(t)} · agent sent back · ${s.stopBlocks} of 3`), message())
      );
    }
    // ✓ only for intact evidence (DESIGN.md §1): not after a weakened test, nor after the
    // config that names the test command changed.
    proven = !findings.length && !configChanged && !unread;
    if (findings.length) passLine = `codehere ✕ ${cmd} passed, but a check was weakened · ${noTick(findings.join(' · '))}`;
    else if (configChanged) passLine = `codehere ✕ ${cmd} passed, but .codehere/config.json changed during this session`;
    else if (unread) passLine = `codehere ✕ ${cmd} passed, but this session's diff could not be read · weakened tests not checked`;
    else passLine = `codehere ✓ ${cmd} · ${runResult(t)} · re-run here · ${t.seconds.toFixed(1)} s`;
    if (proven) {
      state.lastGreen = { commit: git(root, 'rev-parse HEAD'), at: new Date().toISOString() };
      recordGreen(state, s);
    }
    lines.unshift(passLine);
  }

  // 4. a solved repeated error: the agent offers it to the team as a lesson (once per session).
  // Nothing is written here; the proof waits in the session for the lesson draft, and the person's
  // yes saves it. After the 3-block cap there is no offer, and the developer is told.
  const solved = Object.entries(s.errors).filter(([, n]) => n >= 2);
  if (solved.length && !s.lessonAsked) {
    s.lessonAsked = true;
    const [sig] = solved.sort((a, b) => b[1] - a[1])[0];
    const named = s.tests && s.tests[sig];
    if (mayBlock) {
      s.pendingLesson = lessonProofFor(root, sig, proven ? cfg.testCommand : null, changed, typeof named === 'string' ? named : '');
      s.stopBlocks++;
      sendAgentBack(
        [
          // the first line is fixed text: Copilot sends the reason back as a prompt, and the skip
          // compares this line, so the error's own text must not be in it
          'Before you finish: you hit and solved a repeated error.',
          `The error: ${printable(noTick(sig))}`,
          'Offer it to your team as a lesson: run `codehere lesson "<short title>" --cause "<one line>" --fix "<one line>"` and show the user the draft in one short message.',
          `Codehere adds ${proven ? 'this test run as proof' : 'the error and the changed files'}; it saves the lesson only if the user says yes.`,
        ].join('\n'),
        message(),
        true
      );
    } else lines.push('codehere › repeated error solved · not offered as a lesson · limit of 3 reached');
  }

  writeState(root, state);
  report();
}
