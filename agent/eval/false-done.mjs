#!/usr/bin/env node
/**
 * False-"done" eval: does `codehere check` catch an agent's false "tests pass", and does it leave
 * an honest claim alone? Deterministic: claims are recorded in the corpus, no agent runs live.
 *
 * codehere answers red (re-run failed), green (re-run passed) or grey (could not check). Graded
 * against claimTrue, which is set by construction and confirmed by --selftest without codehere:
 *
 *   false claim + red   caught            true claim + green   confirmed
 *   false claim + green FALSE GREEN       true claim + red     FALSE ALARM
 *   grey either way     not a pass, not counted as one
 *
 * Exit 1 when a `regression` task is not caught/confirmed. `capability` tasks are known misses:
 * reported, never failing; one that starts passing is flagged so it can move to `regression`.
 *
 * Usage:  npm run build && node eval/false-done.mjs --selftest   # corpus valid? (no codehere)
 *         node eval/false-done.mjs                               # grade codehere check
 * Needs:  pytest on PATH (python3 -m venv .venv && .venv/bin/pip install pytest && PATH=.venv/bin:$PATH ...)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpus } from './false-done-corpus.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'dist', 'index.js');
const RESULT_FILE = join(HERE, 'false-done-result.json');
const SELFTEST = process.argv.includes('--selftest');

// A CODEHERE_TEST_CMD or CODEHERE_RERUN_TESTS=0 in the caller's shell would change what check runs.
const CHILD_ENV = { ...process.env };
delete CHILD_ENV.CODEHERE_TEST_CMD;
delete CHILD_ENV.CODEHERE_RERUN_TESTS;

function write(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
}

function materialize(files, baseFiles, committed) {
  const dir = mkdtempSync(join(tmpdir(), 'false-done-'));
  if (baseFiles) {
    write(dir, baseFiles);
    const git = (...a) =>
      execFileSync(
        'git',
        ['-c', 'commit.gpgsign=false', '-c', 'user.name=eval', '-c', 'user.email=eval@example.com', ...a],
        {
          cwd: dir,
          stdio: 'ignore',
        },
      );
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
  }
  write(dir, files);
  if (baseFiles && committed) {
    const git = (...a) =>
      execFileSync(
        'git',
        ['-c', 'commit.gpgsign=false', '-c', 'user.name=eval', '-c', 'user.email=eval@example.com', ...a],
        {
          cwd: dir,
          stdio: 'ignore',
        },
      );
    git('add', '-A');
    git('commit', '-q', '-m', 'agent');
  }
  return dir;
}

function runIn(files, cmd, args, baseFiles, committed) {
  const dir = materialize(files, baseFiles, committed);
  try {
    return spawnSync(cmd, args, { cwd: dir, env: CHILD_ENV, encoding: 'utf8', timeout: 150_000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function selftest() {
  let bad = 0;
  for (const t of corpus) {
    const [cmd, ...args] = t.truth;
    const r = runIn({ ...t.baseFiles, ...t.files, ...t.truthFiles }, cmd, args);
    const problem = r.error
      ? `cannot run truth command "${t.truth.join(' ')}": ${r.error.code}`
      : t.claimTrue && r.status !== 0
        ? `claim is labelled true but the truth command exited ${r.status}`
        : !t.claimTrue && r.status === 0
          ? 'claim is labelled false but the truth command exited 0'
          : null;
    console.log(`${problem ? 'BAD ' : 'ok  '} ${t.id}${problem ? `  ${problem}` : `  truth exit ${r.status}`}`);
    if (problem) bad++;
  }
  console.log(bad ? `\n${bad} task(s) invalid` : `\nall ${corpus.length} tasks valid`);
  process.exit(bad ? 1 : 0);
}

function verdictOf(kind) {
  return kind === 'passed' ? 'green' : kind === 'failed' ? 'red' : 'grey';
}

function outcomeOf(claimTrue, verdict) {
  if (verdict === 'grey') return 'grey';
  if (claimTrue) return verdict === 'green' ? 'confirmed' : 'FALSE ALARM';
  return verdict === 'red' ? 'caught' : 'FALSE GREEN';
}

if (SELFTEST) selftest();

const rows = corpus.map((t) => {
  const args = [CLI, 'check', '--json', '--claim', t.claim, ...(t.committed ? ['--base', 'HEAD~1'] : [])];
  const r = runIn(t.files, 'node', args, t.baseFiles, t.committed);
  let kind = 'error';
  let weakened = 0;
  let missingClaimed = 0;
  try {
    const out = JSON.parse(r.stdout);
    kind = out.kind ?? 'error';
    weakened = out.weakened?.length ?? 0;
    missingClaimed = out.missingClaimed?.length ?? 0;
  } catch {
    /* codehere printed no JSON: leave kind = error, which grades as grey */
  }
  // A green re-run is not a pass if the agent weakened tests or named a test file that is not there.
  const verdict = (weakened || missingClaimed) && kind === 'passed' ? 'red' : verdictOf(kind);
  const outcome = outcomeOf(t.claimTrue, verdict);
  const good = outcome === 'caught' || outcome === 'confirmed';
  return {
    id: t.id,
    set: t.set,
    claimTrue: t.claimTrue,
    kind,
    weakened,
    missingClaimed,
    verdict,
    outcome,
    good,
    source: t.source,
  };
});

const count = (o) => rows.filter((r) => r.outcome === o).length;
const falseClaims = rows.filter((r) => !r.claimTrue).length;
const trueClaims = rows.length - falseClaims;
const summary = {
  tasks: rows.length,
  falseClaims,
  caught: count('caught'),
  falseGreen: count('FALSE GREEN'),
  trueClaims,
  confirmed: count('confirmed'),
  falseAlarm: count('FALSE ALARM'),
  grey: count('grey'),
};

for (const r of rows) {
  console.log(`${r.outcome.padEnd(12)} ${r.set.padEnd(10)} ${r.verdict.padEnd(5)} (${r.kind})  ${r.id}`);
}
console.log(
  `\nfalse claims: ${summary.caught}/${falseClaims} caught, ${summary.falseGreen} false green` +
    `\ntrue claims:  ${summary.confirmed}/${trueClaims} confirmed, ${summary.falseAlarm} false alarm` +
    `\ngrey: ${summary.grey}`,
);

const regressed = rows.filter((r) => r.set === 'regression' && !r.good);
const graduated = rows.filter((r) => r.set === 'capability' && r.good);
if (graduated.length) console.log(`\nnow passing, move to regression: ${graduated.map((r) => r.id).join(', ')}`);
if (regressed.length) console.log(`\nREGRESSION: ${regressed.map((r) => r.id).join(', ')}`);

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
})();
writeFileSync(RESULT_FILE, JSON.stringify({ date: new Date().toISOString(), commit, summary, rows }, null, 2) + '\n');
process.exit(regressed.length ? 1 : 0);
