/**
 * Tier 1.1 (verdict-trust punch list, 2026-06-09) · RE-RUN the tests, don't
 * trust the agent's stdout.
 *
 * The gap this closes: `artifacts.tests` was regex-scraped from the AGENT's own
 * captured stdout (`parseTestSummary(textAccum)`) and never re-executed — so
 * "18/18 passed" was verified against the agent's own claim. A skeptic waves
 * that off instantly. We already check FILE claims against ground truth
 * (`git diff`); this extends the same "observe reality, don't trust the
 * narration" rule to tests: codehere independently runs the project's test
 * command on the real on-disk state and reads the REAL exit code.
 *
 * The authoritative signal is the EXIT CODE (a test runner exits non-zero on
 * failure), not the scraped count — counts are display-only. So a report that
 * claims "all tests pass" while the re-run exits non-zero becomes a caught lie
 * (verify-claim flags it `broken` once `failed > 0`).
 *
 * Safe by construction: async (never blocks the daemon), timeout-bounded,
 * opt-out via CODEHERE_RERUN_TESTS=0, and only ever runs the repo's OWN test
 * script — strictly inside the trust boundary codehere already crosses by
 * spawning agents that execute code in this repo.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseTestSummary } from '../../infrastructure/orchestration/artifacts-extractor.js';

/**
 * The one classification every surface reads, so none re-derives "can't run vs
 * failed" from a raw exit code (they used to, three different ways). `passed` /
 * `failed` are the real re-run verdict; the rest are honest non-verdicts:
 *  - `runner-missing`   — the command launched but the runner/deps aren't there
 *                         (exit 126/127). NOT a failure — nothing was tested.
 *  - `command-not-found` — the command itself couldn't spawn (ENOENT).
 *  - `no-command`       — no known test command in this project.
 *  - `timed-out`        — killed after the timeout.
 *  - `disabled`         — CODEHERE_RERUN_TESTS=0.
 */
export type RerunKind =
  | 'passed'
  | 'failed'
  | 'runner-missing'
  | 'command-not-found'
  | 'no-command'
  | 'timed-out'
  | 'disabled';

export interface RerunTestsResult {
  /** True only if codehere actually executed a test command. */
  ran: boolean;
  /** Centralized outcome — the field surfaces should switch on (not exitCode). */
  kind?: RerunKind;
  /** The command codehere ran (for the surface to name). */
  command?: string;
  /** Exit code — the AUTHORITATIVE pass/fail signal (0 = pass). */
  exitCode?: number;
  /** Parsed-for-display counts from the re-run's own output (not authoritative). */
  passed?: number;
  failed?: number;
  /** The runner exited 0 but its own summary says it ran 0 tests, or skipped every test: nothing was tested. */
  noTests?: boolean;
  /** The runner's summary says every test was skipped (also sets noTests). */
  allSkipped?: boolean;
  durationMs?: number;
  /** Why codehere did NOT re-run (so the surface can stay honest). */
  skippedReason?: string;
  /** The ONE command that would make this runnable — a string to SHOW the user,
   *  never executed (guide, never execute · the owner 2026-08-17). Set for
   *  runner-missing / command-not-found where deps/runner are absent. */
  remedy?: string;
}

const TIMEOUT_SETTING = Number(process.env.CODEHERE_RERUN_TIMEOUT_MS);
/** A value that is not a positive number falls back to two minutes; NaN would time out at once. */
const DEFAULT_TIMEOUT_MS = TIMEOUT_SETTING > 0 ? TIMEOUT_SETTING : 120_000;

/** 500 → "0.5s", 120000 → "120s". */
const seconds = (ms: number) => `${Number.isInteger(ms / 1000) ? ms / 1000 : (ms / 1000).toFixed(1)}s`;

/** True when node's test runner printed a summary and every summary says 0 tests, or when go test found no test files. `node --test`
 *  exits 0 for a misnamed file (`calc.tests.js`), so the exit code alone reads as a pass.
 *  pytest already exits 5 in that case. */
export function reportedZeroTests(out: string): boolean {
  const counts = [...out.matchAll(/^[ \t]*(?:ℹ|#)[ \t]+tests[ \t]+(\d+)[ \t]*$/gm)].map((m) => Number(m[1]));
  if (counts.length > 0) return counts.every((n) => n === 0);
  // `go test ./...` exits 0 and prints `[no test files]` for every package when the module has no _test.go files.
  return /^\?[ \t]+.*\[no test files\]/m.test(out) && !/^(ok|FAIL|---)[ \t]/m.test(out);
}

/** True when the runner's own summary says tests were skipped and none passed or failed: node:test (`pass 0`,
 *  `skipped N`), pytest's final line, and the jest or vitest `Tests` line. A run like that tested nothing. */
export function reportedOnlySkipped(out: string): boolean {
  const last = (re: RegExp) => [...out.matchAll(re)].pop();
  const node = (k: string) => {
    const m = last(new RegExp(`^[ \\t]*(?:ℹ|#)[ \\t]+${k}[ \\t]+(\\d+)[ \\t]*$`, 'gm'));
    return m ? Number(m[1]) : null;
  };
  const pass = node('pass');
  const skipped = node('skipped');
  if (pass !== null && skipped !== null) return pass === 0 && (node('fail') ?? 0) === 0 && skipped > 0;
  const py = last(/^=+ (.*) in [\d.]+s(?: \([^)]*\))? =+$/gm);
  if (py) return /\b\d+ skipped\b/.test(py[1]) && !/\b\d+ (passed|failed|errors?|xpassed)\b/.test(py[1]);
  const js = last(/^[ \t]*Tests:?[ \t]+(.*)$/gm);
  if (js) return /\b\d+ skipped\b/.test(js[1]) && !/\b\d+ (passed|failed)\b/.test(js[1]);
  return false;
}

/** True if `file` exists in `cwd` and its text contains `needle` (case-insensitive). */
function fileMentions(cwd: string, file: string, needle: string): boolean {
  try {
    const p = join(cwd, file);
    return existsSync(p) && readFileSync(p, 'utf8').toLowerCase().includes(needle.toLowerCase());
  } catch {
    return false;
  }
}

/** True if `cwd` (top level, or a test/ or tests/ dir) holds a Node built-in
 *  test file — `*.test.{mjs,cjs,js}`. Lets codehere observe reality in a plain
 *  Node repo that uses `node --test` with no npm script or runner config (a
 *  common setup that previously left the verifier blind — DISCOVERED via a real
 *  V3 run, 2026-06-14). Bounded: top level + two conventional dirs, never a
 *  recursive walk. */
function hasNodeTestFiles(cwd: string): boolean {
  const isTest = (f: string) => /\.test\.(mjs|cjs|js)$/.test(f);
  for (const dir of [cwd, join(cwd, 'test'), join(cwd, 'tests')]) {
    try {
      if (readdirSync(dir).some(isTest)) return true;
    } catch {
      /* dir absent / unreadable → keep looking */
    }
  }
  return false;
}

/**
 * Detect a runnable test command in `cwd`, across ecosystems — so "codehere
 * re-runs your tests and catches a lying report" holds for Python/Go/Rust repos,
 * not only npm. Conservative: each branch keys off an UNAMBIGUOUS marker; we
 * return null (never guess) when there's nothing known to run.
 *
 * Precedence: explicit override → Node (npm test) → Go → Rust → Python (pytest)
 * → a JS runner config without an npm script. First match wins.
 */
export function detectTestCommand(cwd: string): { cmd: string; args: string[]; display: string } | null {
  // 0. Explicit per-repo override — the escape hatch for anything we can't infer
  //    (monorepos, custom runners). e.g. CODEHERE_TEST_CMD="make test". Run via
  //    execFile (no shell), so args are whitespace-split — a quoted arg with
  //    spaces (CODEHERE_TEST_CMD='pytest -k "a b"') is NOT supported; use a
  //    wrapper script for that case.
  const override = process.env.CODEHERE_TEST_CMD?.trim();
  if (override) {
    const [cmd, ...args] = override.split(/\s+/);
    return { cmd, args, display: override };
  }

  // 1. Node — the project's declared `npm test` (dominant case + this repo).
  const pj = join(cwd, 'package.json');
  if (existsSync(pj)) {
    try {
      const json = JSON.parse(readFileSync(pj, 'utf8')) as { scripts?: Record<string, string> };
      const test = json.scripts?.test;
      // npm's default placeholder script is not a real suite — skip it.
      if (typeof test === 'string' && test.trim() && !/no test specified/i.test(test)) {
        return { cmd: 'npm', args: ['test', '--silent'], display: 'npm test' };
      }
    } catch {
      /* unreadable package.json → fall through to other ecosystems */
    }
  }

  // 2. Go — go.mod present → the standard whole-module test run.
  if (existsSync(join(cwd, 'go.mod'))) {
    return { cmd: 'go', args: ['test', './...'], display: 'go test ./...' };
  }

  // 3. Rust — Cargo.toml → `cargo test`.
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    return { cmd: 'cargo', args: ['test'], display: 'cargo test' };
  }

  // 4. Python — pytest is the dominant runner. Key off pytest-specific markers
  //    (conftest.py / pytest.ini are unambiguous). For pyproject/setup.cfg, match
  //    the actual pytest CONFIG SECTION header — not a bare "pytest" substring,
  //    which would fire on a comment or an unrelated dependency string and run
  //    pytest on a project that doesn't use it.
  if (
    existsSync(join(cwd, 'pytest.ini')) ||
    existsSync(join(cwd, 'conftest.py')) ||
    fileMentions(cwd, 'pyproject.toml', '[tool.pytest') ||
    fileMentions(cwd, 'setup.cfg', '[tool:pytest]')
  ) {
    return { cmd: 'pytest', args: ['-q'], display: 'pytest' };
  }

  // 5. A JS test runner with config but no npm `test` script.
  //
  // SECURITY (2026-08-08) · `--no-install` is load-bearing on THIS path above all
  // others. Bare `npx vitest` falls back to the public registry when the runner
  // is not installed locally, so codehere would DOWNLOAD a test runner and
  // execute it against the user's repo — and then report the result as
  // "verifier re-ran the suite", the strongest claim this product makes. The
  // same fallback let `npx graphify-ts` fetch an unrelated stranger's package
  // (fixed 86c7893); here the blast radius is the evidence itself.
  //
  // Refusing is also the semantically right answer: a runner the project does
  // not have installed is not the project's test suite, so re-running with it
  // proves nothing. When this returns nothing runnable, applyTestObservation
  // records an honest `testsUnobserved` reason instead — which is exactly the
  // abstention the eval harness scores 2/2 on.
  if (existsSync(join(cwd, 'vitest.config.ts')) || existsSync(join(cwd, 'vitest.config.js'))) {
    return { cmd: 'npx', args: ['--no-install', 'vitest', 'run'], display: 'npx vitest run' };
  }
  if (existsSync(join(cwd, 'jest.config.js')) || existsSync(join(cwd, 'jest.config.ts'))) {
    return { cmd: 'npx', args: ['--no-install', 'jest'], display: 'npx jest' };
  }

  // 6. Node built-in test runner — `*.test.{mjs,cjs,js}` present but no npm
  //    script or runner config above. `node --test` self-discovers them. This is
  //    the plain-Node case that left codehere blind to test reality (the verifier
  //    can't catch a "tests pass" lie it never observed). Lowest precedence so a
  //    declared script/runner always wins.
  if (hasNodeTestFiles(cwd)) {
    return { cmd: 'node', args: ['--test'], display: 'node --test' };
  }

  return null;
}

/**
 * The one command that would make the suite runnable — returned as a STRING to
 * SHOW the user, NEVER executed. The owner's call (2026-08-17): guide, never execute —
 * auto-installing runs arbitrary postinstall code, which is exactly the posture
 * a trust tool must not take (the same reason detectTestCommand keeps
 * `--no-install`). Mirrors detectTestCommand's marker-probing: pick the
 * ecosystem, name its install. Returns undefined when there's nothing to suggest.
 */
export function detectRemedy(cwd: string): string | undefined {
  const has = (f: string) => existsSync(join(cwd, f));
  // Node — deps missing / runner not installed → install from the lockfile.
  if (has('package.json')) {
    if (has('pnpm-lock.yaml')) return 'pnpm install';
    if (has('yarn.lock')) return 'yarn install';
    if (has('package-lock.json')) return 'npm ci';
    return 'npm install';
  }
  // Python — set up a venv and install, then re-check.
  if (has('requirements.txt')) {
    return 'python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt';
  }
  if (has('pyproject.toml') || has('setup.py') || has('setup.cfg')) {
    return 'python -m venv .venv && . .venv/bin/activate && pip install -e .';
  }
  if (has('pytest.ini') || has('conftest.py')) return 'pip install pytest';
  if (has('go.mod')) return 'go mod download';
  if (has('Cargo.toml')) return 'cargo fetch';
  return undefined;
}

/**
 * Re-run the project's tests on the real on-disk state. Async + timeout-bounded.
 * Resolves with `ran:false` + a reason when there's nothing to run or it's
 * disabled — never throws.
 */
export function rerunTests(cwd: string): Promise<RerunTestsResult> {
  if (process.env.CODEHERE_RERUN_TESTS === '0') {
    return Promise.resolve({ ran: false, kind: 'disabled', skippedReason: 'disabled (CODEHERE_RERUN_TESTS=0)' });
  }
  const detected = detectTestCommand(cwd);
  if (!detected) {
    return Promise.resolve({ ran: false, kind: 'no-command', skippedReason: 'no known test command in this project' });
  }

  return new Promise<RerunTestsResult>((resolve) => {
    const start = Date.now();
    let out = '';
    let settled = false;
    const done = (r: RerunTestsResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(detected.cmd, detected.args, {
        cwd,
        env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Own process group so a timeout can kill the whole TREE — `npm test`
        // forks the real runner, and killing just the npm wrapper orphaned the
        // grandchild, which kept running past the timeout (self-audit 2026-06-09).
        detached: true,
      });
    } catch (e) {
      done({
        ran: false,
        kind: 'command-not-found',
        command: detected.display,
        skippedReason: `could not spawn test command: ${String(e).slice(0, 80)}`,
        remedy: detectRemedy(cwd),
      });
      return;
    }
    const timer = setTimeout(() => {
      try {
        // Negative pid = kill the whole process group (the detached tree), so the
        // forked test runner dies too, not just the npm wrapper.
        if (typeof child.pid === 'number') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* best-effort */
        }
      }
      done({
        ran: false,
        kind: 'timed-out',
        command: detected.display,
        skippedReason: `test re-run timed out after ${seconds(DEFAULT_TIMEOUT_MS)}`,
      });
    }, DEFAULT_TIMEOUT_MS);

    const cap = (chunk: Buffer | string) => {
      out += String(chunk);
      // bound memory — keep only the tail the parser reads
      if (out.length > 200_000) out = out.slice(-100_000);
    };
    child.stdout?.on('data', cap);
    child.stderr?.on('data', cap);
    child.on('error', (e) => {
      clearTimeout(timer);
      done({
        ran: false,
        kind: 'command-not-found',
        command: detected.display,
        skippedReason: `test command errored: ${String(e.message).slice(0, 80)}`,
        remedy: detectRemedy(cwd),
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const ec = code ?? -1;
      const parsed = parseTestSummary(out);
      // 126/127 = the wrapper launched but the runner/deps aren't installed —
      // nothing was tested, so this is NOT a failing suite. Classify it as
      // runner-missing (with the one-command remedy) so no surface renders a
      // red measured-fail for an unrunnable suite.
      const allSkipped = ec === 0 && reportedOnlySkipped(out);
      const noTests = ec === 0 && (reportedZeroTests(out) || allSkipped);
      const kind: RerunKind = ec === 126 || ec === 127 ? 'runner-missing' : ec === 0 && !noTests ? 'passed' : 'failed';
      done({
        ran: true,
        kind,
        command: detected.display,
        exitCode: ec,
        passed: parsed?.passed,
        failed: parsed?.failed,
        ...(noTests ? { noTests: true } : {}),
        ...(allSkipped ? { allSkipped: true } : {}),
        durationMs: Date.now() - start,
        ...(kind === 'runner-missing' ? { remedy: detectRemedy(cwd) } : {}),
      });
    });
  });
}
