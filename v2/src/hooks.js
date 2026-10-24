// Claude Code hook handlers. Every handler fails open: if anything goes wrong,
// it exits 0 and the agent carries on as if Codehere were not installed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  findRoot, paths, readConfig, readState, writeState, session, readRules,
  listDocs, git, isGitRepo, me, slug, today,
} from './brain.js';
import { responseText, signature, errorLines, similarity, tamperFindings } from './signals.js';

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
  }

  const out = [];
  const rules = readRules(root);
  if (rules.length) {
    out.push('Team rules from Codehere (written by your teammates, follow them):');
    rules.slice(0, 20).forEach((r) => out.push(`- ${r}`));
  }

  if (state.pendingBrief && fs.existsSync(state.pendingBrief)) {
    out.push('', 'Restart brief from the previous session. Treat it as the full, current spec:');
    out.push(fs.readFileSync(state.pendingBrief, 'utf8').slice(0, 4000));
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
        .join(', ')}). Mention this once, briefly: they can run \`codehere inbox\`.`
    );
  }

  writeState(root, state);
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  quiet();
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
    snap[f] = fs.existsSync(path.join(root, f)) ? git(root, `hash-object -- "${f}"`) || 'x' : 'deleted';
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
  if (s.startHead) {
    git(root, `diff ${s.startHead} HEAD --name-only`)
      .split('\n')
      .filter((f) => f && !IGNORE(f))
      .forEach((f) => changed.add(f));
  }
  return [...changed];
}

// ---------- PostToolUse (Bash): loop breaker + just-in-time team lessons ----------

// Commands that only read files. Their output may contain the word "error"
// (source code, logs) without anything having failed.
const READ_ONLY = /^\s*(cat|head|tail|less|more|grep|rg|ag|sed\s+-n|awk|ls|find|tree|wc|git\s+(diff|show|log|blame|grep))\b/;

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
  if (READ_ONLY.test(command)) quiet();
  const text = responseText(input.tool_response) + '\n' + (input.error || '');
  const sig = signature(text);
  if (!sig) quiet();

  const cfg = readConfig(root);
  const state = readState(root);
  const s = session(state, input.session_id);
  s.errors[sig] = (s.errors[sig] || 0) + 1;
  s.rawErrors[sig] = errorLines(text, 8);
  const count = s.errors[sig];

  const lesson = matchLesson(root, sig, s.shownLessons);
  if (lesson) s.shownLessons.push(lesson.id);
  writeState(root, state);

  const threshold = cfg.loopThreshold;
  if (count === threshold || count === threshold + 2) {
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

// ---------- Stop: verify "done" outside the agent ----------

function runTests(root, cfg) {
  const r = spawnSync(cfg.testCommand, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: cfg.testTimeoutSeconds * 1000,
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
  if (s.stopBlocks >= 3) quiet(); // never trap the agent

  if (!isGitRepo(root)) quiet();
  const base = s.startHead || 'HEAD';
  const changed = changedThisSession(root, s);
  if (!changed.length) quiet(); // the agent changed nothing this session: stay silent

  // 1. tampering with tests or checks (only in files changed this session)
  const files = changed.map((f) => `"${f}"`).join(' ');
  const nameStatus = git(root, `diff ${base} --name-status -- ${files}`);
  const findings = tamperFindings(nameStatus, git(root, `diff ${base} -U0 -- ${files}`));
  const key = findings.join('|');
  if (findings.length && s.tamperReported !== key) {
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

  // 2. run the tests ourselves
  let verified = null;
  if (cfg.verifyOnStop && cfg.testCommand) {
    const t = runTests(root, cfg);
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
    state.lastGreen = { commit: git(root, 'rev-parse HEAD'), at: new Date().toISOString() };
  }

  // 3. turn a solved repeated error into a team lesson (asked once per session)
  const solved = Object.entries(s.errors).filter(([, n]) => n >= 2);
  if (solved.length && !s.lessonAsked) {
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
  if (verified) emitJson({ systemMessage: `Codehere verified: \`${verified}\` passed.` });
  quiet();
}
