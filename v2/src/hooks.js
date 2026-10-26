// Claude Code hook handlers. Every handler fails open: if anything goes wrong,
// it exits 0 and the agent carries on as if Codehere were not installed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  findRoot, paths, readConfig, readState, writeState, session, readRules,
  listDocs, git, isGitRepo, me, slug, today, isApproved, readApprovals, printable, commitId,
} from './brain.js';
import {
  responseText, signature, errorLines, similarity, tamperFindings, failingTest, lowInfoPrompt, vagueFeature,
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

const quiet = () => process.exit(0);

export async function runHook(event) {
  const input = readStdin();
  const root = findRoot(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (!root) quiet();
  try {
    if (event === 'session-start') return sessionStart(root, input);
    if (event === 'prompt') return promptSubmit(root, input);
    if (event === 'post-tool') return postTool(root, input);
    if (event === 'stop') return stop(root, input);
  } catch (err) {
    if (process.env.CODEHERE_DEBUG) console.error(err);
  }
  quiet();
}

// ---------- SessionStart: load only human-confirmed context ----------

function sessionStart(root, input) {
  const state = readState(root);
  const s = session(state, input.session_id);
  s.transcript = input.transcript_path || s.transcript;
  if (isGitRepo(root) && !s.baseline) {
    // Remember what was already changed before this session, so we only
    // ever react to what the agent changes now.
    s.startHead = git(root, 'rev-parse HEAD') || null;
    s.baseline = dirtySnapshot(root);
    s.settings = settingsSnapshot(root);
  } else if (input.source === 'resume') {
    // While the session was closed only the developer or a pull could change settings.
    s.settings = settingsSnapshot(root);
  }

  const out = [];
  const rules = readRules(root);
  if (rules.length) {
    out.push('Team rules from Codehere (written by your teammates, follow them):');
    rules.slice(0, 20).forEach((r) => out.push(`- ${r}`));
  }

  // Only a brief in .codehere/briefs/: state.json can arrive through git and point anywhere.
  const brief = briefFile(root, state.pendingBrief);
  if (brief) {
    out.push('', 'Restart brief from the previous session. Treat it as the full, current spec:');
    out.push(fs.readFileSync(brief, 'utf8').slice(0, 4000));
  }
  state.pendingBrief = null;

  const mine = me(root);
  const open = listDocs(paths(root).help).filter((d) => d.meta.status === 'open' && d.meta.author !== mine);
  if (open.length) {
    out.push(
      '',
      `Note for the user: ${open.length} teammate help request(s) are open (${open
        .slice(0, 3)
        .map((d) => d.meta.author)
        .join(', ')}). Mention this once, briefly: they can run \`codehere inbox\`.`
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
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  quiet();
}

function briefFile(root, file) {
  try {
    const real = fs.realpathSync(path.resolve(root, file));
    return real.startsWith(fs.realpathSync(paths(root).briefs) + path.sep) ? real : null;
  } catch {
    return null;
  }
}

// ---------- what changed in THIS session ----------

const IGNORE = (f) => f.startsWith('.codehere/') || f.startsWith('.claude/');

export function dirtySnapshot(root) {
  const files = git(root, 'status --porcelain --untracked-files=all')
    .split('\n')
    .filter(Boolean)
    // "XY path"; the first line may have lost its leading space to trim()
    .map((l) => l.replace(/^[ MADRCU?!T]{1,2}\s+/, '').replace(/^"|"$/g, '').split(' -> ').pop())
    .filter((f) => f && !IGNORE(f));
  const snap = {};
  for (const f of files) {
    snap[f] = fs.existsSync(path.join(root, f)) ? git(root, ['hash-object', '--', f]) || 'x' : 'deleted';
  }
  return snap;
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
    git(root, ['diff', s.startHead, 'HEAD', '--name-only'])
      .split('\n')
      .filter((f) => f && !IGNORE(f))
      .forEach((f) => changed.add(f));
  }
  return [...changed];
}

// Files that decide what Codehere runs and tells every agent, and the agent's own hook
// settings. Claude Code loads hooks at session start, so a hook removed mid-session
// still runs at this session's finish check and can report it.
const PROTECTED = ['.codehere/config.json', '.codehere/rules.md', '.claude/settings.json', '.claude/settings.local.json'];

function settingsSnapshot(root) {
  const snap = {};
  for (const f of PROTECTED) {
    let text = null;
    try {
      text = fs.readFileSync(path.join(root, f), 'utf8');
    } catch {}
    // In .claude/ only the hook and env settings count: Claude Code also saves permission
    // rules there when the developer picks "don't ask again". env can move HOME or
    // XDG_CONFIG_HOME, where approvals are kept. A missing file has none of them.
    if (f.startsWith('.claude/')) {
      try {
        const j = JSON.parse(text ?? '{}');
        text = JSON.stringify([j.hooks ?? null, j.disableAllHooks ?? null, j.env ?? null]);
      } catch {}
    }
    snap[f] = text == null ? null : crypto.createHash('sha256').update(text).digest('hex');
  }
  return snap;
}

function settingsChanged(root, s) {
  if (!s.settings) return []; // no snapshot from session start: cannot tell
  const now = settingsSnapshot(root);
  return PROTECTED.filter((f) => now[f] !== s.settings[f]);
}

// ---------- PostToolUse (Bash): loop breaker + just-in-time team lessons ----------

// Commands that only read files. Their output may contain the word "error"
// (source code, logs) without anything having failed. A chain such as
// `cd x && cat a; ls b` is read-only only if every part is. Quoted text is
// emptied first so `grep "error|fail"` stays one part, and a part that runs
// another command ($(...), backticks, <(...)) is never read-only.
const READ_ONLY = /^\s*(cd|pwd|echo|cat|head|tail|less|more|grep|rg|ag|sed\s+-n|awk|ls|find|tree|wc|git\s+(diff|show|log|blame|grep|status))\b/;
export function readOnly(command) {
  const runsSomething = /\$\(|`|<\(/;
  if (runsSomething.test(command)) return false;
  const bare = command.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, "''");
  return bare.split(/&&|\|\||\|&|[;|\n]/).every((part) => !part.trim() || READ_ONLY.test(part));
}

function matchLesson(root, sig, shown) {
  let best = null;
  for (const doc of listDocs(paths(root).lessons)) {
    if (shown.includes(doc.id)) continue;
    const score = Math.max(
      similarity(sig, doc.meta.signature || ''),
      similarity(sig, doc.meta.title || '') * 0.8
    );
    if (score >= 0.45 && (!best || score > best.score)) best = { doc, score };
  }
  return best?.doc || null;
}

function lessonText(doc) {
  const fix = (doc.body.match(/## Fix\n([\s\S]*?)(\n## |$)/) || [null, doc.body])[1].trim();
  return `Team lesson "${doc.meta.title}" (from ${doc.meta.author || 'a teammate'}, ${doc.meta.date || ''}):\n${fix.slice(0, 700)}`;
}

function postTool(root, input) {
  if (input.tool_name && input.tool_name !== 'Bash') quiet();
  const command = (input.tool_input && input.tool_input.command) || '';
  if (readOnly(command)) quiet();
  const text = responseText(input.tool_response) + '\n' + (input.error || '');
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
  s.lastFailure = { sig, command, test: failingTest(text), lines: errorLines(text, 3), prompt: s.prompts || 0 };
  const count = s.errors[sig];

  const lesson = matchLesson(root, sig, s.shownLessons);
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
    if (lesson) msg.push('', lessonText(lesson));
    if (count > threshold) {
      msg.push(
        '',
        'You are still stuck. Stop now. Tell the user in one short line that they can run',
        '`codehere help "<what you are stuck on>"` to send a ready-made help card to a teammate,',
        'or `codehere brief` to restart in a fresh session. Then wait for the user.'
      );
    }
    toAgent(msg.join('\n') + '\n');
  }

  if (lesson) {
    emitJson({
      hookSpecificOutput: {
        hookEventName: input.hook_event_name || 'PostToolUse',
        additionalContext: `Codehere: a teammate solved a similar error before. It may apply here. ${lessonText(lesson)}\nCheck whether it fits before trying something new.`,
      },
    });
  }
  quiet();
}

// ---------- UserPromptSubmit: restore what a short prompt leaves out ----------
// One message at most, only about this session, under 300 tokens. Silent on normal turns.

function promptSubmit(root, input) {
  if (!input.session_id) quiet(); // without it, sessions cannot be told apart
  const prompt = String(input.prompt || '');
  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  s.transcript = input.transcript_path || s.transcript;
  s.prompts = (s.prompts || 0) + 1;
  if (!s.settings) s.settings = settingsSnapshot(root); // session start did not run for this session

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
      'In one line, suggest the user run `codehere brief` and start a new session (it loads the brief). Then continue with their request.',
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
  if (msg) {
    emitJson({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: msg.slice(0, 1100) } });
  }
  quiet();
}

// Fast list for a prompt (no hashing): tracked files changed since the session started.
function quickChanged(root, s) {
  return git(root, ['diff', '--name-only', commitId(s.startHead) || 'HEAD'])
    .split('\n')
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
  const r = spawnSync(cfg.testCommand, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: Math.max(1, Number(cfg.testTimeoutSeconds) || 120) * 1000, // 0 would mean no limit
    env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
  });
  const output = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  return { ok: r.status === 0 && !timedOut, output, timedOut };
}

function block(reason) {
  emitJson({ decision: 'block', reason });
}

function stop(root, input) {
  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  const mayBlock = (s.stopBlocks || 0) < 3; // never trap the agent: after 3 blocks, only observe

  if (!isGitRepo(root)) quiet();
  const base = commitId(s.startHead) || 'HEAD';
  const changed = changedThisSession(root, s);
  const settings = settingsChanged(root, s);
  if (!changed.length && !settings.length) quiet(); // the agent changed nothing this session: stay silent

  // Lines for the developer. Each is escaped as a whole, so text from the repo cannot fake a line.
  const lines = [];
  function report() {
    const all = [...lines];
    for (const a of readApprovals(root)) {
      if (a.at > (s.startedAt || '')) all.push(`codehere › approved on this machine during this session: ${a.command}`);
    }
    if (settings.length) all.push(`codehere ✕ settings changed during this session · ${settings.join(' · ')}`);
    if (all.length) emitJson({ systemMessage: all.map(printable).join('\n') });
    quiet();
  }

  // 1. tampering with tests or checks (only in files changed this session)
  let findings = [];
  if (changed.length) {
    const nameStatus = git(root, ['diff', base, '--name-status', '--', ...changed]);
    findings = tamperFindings(nameStatus, git(root, ['diff', base, '-U0', '--', ...changed]));
  }
  const key = findings.join('|');
  if (findings.length && s.tamperReported !== key && mayBlock) {
    s.tamperReported = key;
    s.stopBlocks++;
    writeState(root, state);
    block(
      [
        'Codehere found changes that weaken tests or checks:',
        ...findings.map((f) => `- ${f}`),
        'Restore them and fix the code instead.',
        'If the change is truly intended, tell the user in one line why, then finish.',
      ].join('\n')
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
    block(
      [
        'Codehere settings or hook settings changed during this session:',
        ...settings.map((f) => `- ${f}`),
        'If you changed them and the user did not ask for it, undo your change.',
        'Then tell the user in one line what changed and why, and finish.',
      ].join('\n')
    );
  }

  // 3. run the tests ourselves, but only a command approved on this machine:
  // a teammate's commit or the agent may have changed it
  const approved = cfg.testCommand && isApproved(root, cfg.testCommand);
  if (cfg.verifyOnStop && cfg.testCommand && !approved) {
    const last = readApprovals(root).at(-1);
    lines.push(
      `codehere ⊘ ${cfg.testCommand} · not run · not approved on this machine${last ? ` · last approved: ${last.command}` : ''} › run codehere approve in your terminal`
    );
  }
  const configChanged = settings.includes('.codehere/config.json');
  let verified = null;
  if (cfg.verifyOnStop && approved) {
    const t = runTests(root, cfg);
    if (!t.ok && !mayBlock) {
      writeState(root, state);
      report();
    }
    if (!t.ok) {
      s.stopBlocks++;
      writeState(root, state);
      const tail = t.output.split('\n').slice(-25).join('\n');
      block(
        [
          `Codehere ran \`${cfg.testCommand}\` and it ${t.timedOut ? 'timed out' : 'failed'}. The task is not done yet.`,
          'Last lines of output:',
          tail,
          'Fix the cause, then finish. Do not change or skip tests to make them pass.',
        ].join('\n')
      );
    }
    verified = cfg.testCommand;
    if (!findings.length && !configChanged) {
      state.lastGreen = { commit: git(root, 'rev-parse HEAD'), at: new Date().toISOString() };
      recordGreen(state, s);
    }
  }

  // 4. turn a solved repeated error into a team lesson (asked once per session)
  const solved = Object.entries(s.errors).filter(([, n]) => n >= 2);
  if (solved.length && !s.lessonAsked && mayBlock) {
    s.lessonAsked = true;
    s.stopBlocks++;
    writeState(root, state);
    const [sig] = solved.sort((a, b) => b[1] - a[1])[0];
    const file = path.join('.codehere', 'lessons', `${today()}-${slug(sig, 30)}.md`);
    block(
      [
        `Before you finish: you hit and solved a repeated error ("${sig}").`,
        `Save it for the team. Create ${file} with exactly this format:`,
        '---',
        'title: <short name of the problem>',
        `signature: ${sig}`,
        `author: ${me(root)}`,
        `date: ${today()}`,
        '---',
        '## Fix',
        '- Cause: <one line>',
        '- Fix: <one line>',
        '- Avoid next time: <one line>',
        'Then finish your reply as normal. Do not mention this step unless asked.',
      ].join('\n')
    );
  }

  writeState(root, state);
  // Green only for intact evidence (DESIGN.md §1): a pass with a weakened test, or after
  // the config that names the test command changed, is not verified.
  if (verified && findings.length) {
    lines.unshift(`Codehere ran \`${verified}\`. It passed, but a file changed this session has a weakened check: ${findings.join('; ')}.`);
  } else if (verified && configChanged) {
    lines.unshift(`Codehere ran \`${verified}\`. It passed, but .codehere/config.json changed during this session.`);
  } else if (verified) {
    lines.unshift(`Codehere verified: \`${verified}\` passed.`);
  }
  report();
}
