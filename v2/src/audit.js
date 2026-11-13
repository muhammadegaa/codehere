// codehere audit: the commits of the last 90 days that weakened tests, each listed for a person to read.
// Read-only: it runs git on this machine and sends nothing anywhere. The kinds come from the finish
// check's own detector. A count found by pattern is a list of candidates, never proof (DESIGN.md §1).
import { spawn, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { printable } from './brain.js';
import { tamperEvents, isTestFile, isTestConfig } from './signals.js';

const DAYS = 90;
const KINDS = new Set(['test-deleted', 'test-skipped', 'assertion-weakened']);
const BIG = 512 * 1024 * 1024;

// How agents mark their commits. A commit without a marker is still counted and listed, unmarked:
// markers can be turned off, and some agents leave none.
const MARKERS = [
  { re: /^Co-authored-by:[^\n]*\b(Claude|Copilot|Codex)\b/im, name: (m) => `Co-Authored-By ${m[1]}` },
  { re: /^Claude-Session:/im, name: () => 'Claude-Session' },
  { re: /^Agent-Logs-Url:/im, name: () => 'Agent-Logs-Url' },
  // Claude Code's commit footer, the one marker a squash merge often keeps
  { re: /Generated with \[?Claude Code\b/i, name: () => 'Generated with Claude Code' },
];

export function markersOf(author, body) {
  const found = /copilot-swe-agent\[bot\]/i.test(author) ? ['copilot-swe-agent[bot]'] : [];
  for (const m of MARKERS) {
    const x = m.re.exec(body);
    if (x) found.push(m.name(x));
  }
  return found;
}

function gitLine(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

// Every non-merge commit since `since`, with what the markers need.
function commitsSince(root, since) {
  const out = execFileSync('git', ['log', '--no-merges', `--since=${since}`, '--format=%H%x1f%an <%ae>%x1f%cs%x1f%s%x1f%B%x1e'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: BIG,
  }).toString();
  return out
    .split('\x1e')
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((r) => {
      const [sha, author, date, subject, body = ''] = r.split('\x1f');
      return { sha, author, date, subject, body, events: [] };
    });
}

// The path in `diff --git a/P b/P` when both sides name the same file, as they do for a deletion.
function samePath(line) {
  const rest = line.slice('diff --git a/'.length);
  const half = (rest.length - ' b/'.length) / 2;
  return Number.isInteger(half) && rest.slice(half, half + 3) === ' b/' ? rest.slice(0, half) : '';
}

// One `git log -p`, read line by line: hunks of test files and of the files that say which tests run
// (package.json, runner configs) are kept, a deleted file by its name only, so
// memory stays small however large a commit is. Each commit's kinds go on its entry in bySha.
function scanChanges(root, since, bySha) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['log', '--no-merges', `--since=${since}`, '-p', '--no-color', '--format=%x00%H'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    let commit = null;
    let nameStatus = [];
    let kept = [];
    let keep = false;
    let deleted = '';
    const finish = () => {
      if (commit) commit.events = tamperEvents(nameStatus.join('\n'), kept.join('\n')).filter((e) => KINDS.has(e.kind));
    };
    lines.on('line', (line) => {
      if (line.startsWith('\0')) {
        finish();
        commit = bySha.get(line.slice(1)) || null;
        nameStatus = [];
        kept = [];
        keep = false;
        return;
      }
      if (!commit) return;
      if (line.startsWith('diff --git ')) {
        keep = false;
        deleted = samePath(line);
        return;
      }
      if (line.startsWith('deleted file mode')) {
        if (deleted && isTestFile(deleted)) nameStatus.push(`D\t${deleted}`);
        deleted = '';
        keep = false;
        return;
      }
      if (line.startsWith('+++ ')) {
        const file = line.replace(/^\+\+\+ (b\/)?/, '');
        keep = file !== '/dev/null' && (isTestFile(file) || isTestConfig(file));
        if (keep) kept.push(`+++ ${file}`);
        return;
      }
      if (keep && !line.startsWith('--- ')) kept.push(line);
    });
    let failed = null;
    child.on('error', (e) => (failed = e));
    const ended = new Promise((r) => lines.on('close', r));
    child.on('close', async (code) => {
      await ended;
      finish();
      if (failed || code !== 0) reject(failed || new Error(`git log exited ${code}`));
      else resolve();
    });
  });
}

function summary(events) {
  const deletedFiles = events.filter((e) => e.kind === 'test-deleted');
  const other = events.filter((e) => e.kind !== 'test-deleted').map((e) => e.why);
  const parts = deletedFiles.length > 1 ? [`${deletedFiles.length} test files deleted`] : deletedFiles.map((e) => e.why);
  parts.push(...other.slice(0, 3));
  if (other.length > 3) parts.push(`and ${other.length - 3} more`);
  return parts.join(' · ');
}

// Prints the audit; returns the exit code.
export async function audit(root, { out = console.log, err = console.error, now = Date.now() } = {}) {
  if (gitLine(root, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
    err('codehere audit: not inside a git repository');
    return 1;
  }
  if (gitLine(root, ['rev-parse', '--is-shallow-repository']) === 'true') {
    err('codehere audit: this clone is shallow, so its history is not available › git fetch --unshallow');
    return 1;
  }
  const since = new Date(now - DAYS * 24 * 3600 * 1000).toISOString();
  let list;
  try {
    list = commitsSince(root, since);
    if (list.length > 500) err(`codehere audit: reading ${list.length} commits`);
    await scanChanges(root, since, new Map(list.map((c) => [c.sha, c])));
  } catch {
    err('codehere audit: git log failed, so nothing was counted');
    return 1;
  }
  const flagged = list.filter((c) => c.events.length);
  const marked = flagged.filter((c) => markersOf(c.author, c.body).length);
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  out(`codehere audit · last ${DAYS} days · ${n(list.length, 'commit', 'commits')} read`);
  out(`codehere › ${n(flagged.length, 'commit', 'commits')} weakened tests · ${n(marked.length, 'carries', 'carry')} an agent marker`);
  if (!flagged.length) return 0;
  out('codehere › each was found by pattern: read the commit before drawing a conclusion');
  for (const c of flagged) {
    const m = markersOf(c.author, c.body);
    out('');
    out(`  ${c.sha.slice(0, 8)} · ${c.date} · ${m.length ? m.join(', ') : 'no agent marker'} · ${printable(c.subject)}`);
    out(`    ${printable(summary(c.events))}`);
  }
  return 0;
}
