/**
 * CLI: check — the simplest proof. codehere independently RE-RUNS your project's
 * tests and reports the real result, so you trust what the AI actually did, not
 * what it claimed. Zero setup, no daemon, no API. Exit codes for CI: 0 a verified pass, 1 a finding (tests
 * failed, no test ran, a test weakened, a claimed test file missing), 2 nothing could be verified.
 */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { colors, symbols } from '../../../ui.js';
import { rerunTests, type RerunTestsResult } from '../../../application/use-cases/rerun-tests.js';
import { detectTestWeakening, type TestWeakening } from '../../../application/use-cases/detect-test-weakening.js';
import { findMissingClaimedTests } from '../../../application/use-cases/check-claimed-tests.js';

const WHY_TEXT: Record<TestWeakening['why'], string> = {
  'trivial-assertion': 'assertion that checks nothing',
  skipped: 'test skipped',
  'commented-out': 'assertion commented out',
  'unreachable-assertion': 'assertion after an early return',
};

const weakenedLines = (w: TestWeakening[]) => w.map((f) => `${f.file}:${f.line} · ${WHY_TEXT[f.why]} · ${f.text}`);

export interface CheckOptions {
  json?: boolean;
  /** Emit a paste-ready proof block (PR description / review comment) instead of the terminal summary. */
  proof?: boolean;
  /** The agent's own summary. Test files it names that are not in the repo are flagged. */
  claim?: string;
  /** Compare tests against where this branch left <ref>, so committed changes are seen too. */
  base?: string;
}

export const RECEIPT_MARKER = '<!-- codehere-receipt -->';

export type CheckVerdict = 'pass' | 'fail' | 'unverified' | 'skipped';

/**
 * One word per result, for CI. Green (`pass`) only when codehere re-ran the suite, it exited 0, no test
 * was weakened and no named test file was missing. Tampering is `fail` even if no suite could run;
 * every other case where nothing was verified is `unverified`, never a pass.
 */
export function checkVerdict(r: RerunTestsResult, weakened: unknown[], missingClaimed: unknown[]): CheckVerdict {
  if (r.kind === 'disabled') return 'skipped';
  if (weakened.length || missingClaimed.length) return 'fail';
  if (r.kind === 'failed') return 'fail';
  if (r.kind === 'passed' && r.ran && (r.exitCode ?? 1) === 0) return 'pass';
  return 'unverified';
}

/** The check command that gives the same verdict as this run: the options that changed it are repeated. */
function reproduceCommand({ base, claim }: { base?: string; claim?: string }): string {
  let cmd = 'codehere check';
  if (base) cmd += ` --base ${base}`;
  if (claim) {
    const inlineable = claim.length <= 160 && !/[`'\n\r]/.test(claim);
    cmd += inlineable ? ` --claim '${claim}'` : ' --claim <the same summary>';
  }
  return cmd;
}

/** Short commit SHA of `cwd`'s repo, or null when it isn't a git checkout. */
function gitShortSha(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * A paste-ready "verified outcome receipt": the one thing a reviewer can trust
 * without re-running anything — codehere independently re-ran the suite, here's the
 * observed result, pinned to a commit + timestamp, WITH the exact command to
 * reproduce it independently. Plain markdown so it drops into a PR description or
 * review comment as-is.
 *
 * Why reproducibility is the trust mechanism (not a digest): a self-computed hash
 * over self-reported facts proves nothing — a sender could edit the facts AND the
 * hash. What a third party can actually trust is REPRODUCING it: check out the
 * pinned commit, run `codehere check`, get the same exit code. So the receipt leads
 * with the reproduce command and is honest about SCOPE (a test re-run, not a
 * security/logic audit) — it never says more than it verified.
 *
 * ponytail: this is the standalone (no-daemon) receipt. Upgrade path to true
 * tamper-EVIDENCE (authenticity, not just reproducibility): when a ~/.codehere audit
 * chain covers this commit, fold in its verified hash (audit-chain.ts) so the receipt
 * also carries a digest a third party can check against an append-only log.
 */
function buildProofBlock(
  cwd: string,
  r: RerunTestsResult,
  weakened: TestWeakening[] = [],
  missingClaimed: string[] = [],
  repro: { base?: string; claim?: string } = {},
): string {
  const sha = gitShortSha(cwd);
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const at = sha ? `commit \`${sha}\`` : 'the working tree';
  if (!r.ran) {
    if (r.kind === 'command-not-found') {
      const fix = r.remedy ? ` · fix: \`${r.remedy}\`` : '';
      return `> **codehere · verified outcome receipt** — couldn't run \`${r.command || 'the tests'}\` (runner/deps not installed) · unverified${fix} · ${when}\n`;
    }
    return `> **codehere · verified outcome receipt** — no suite re-run (${r.skippedReason || 'none detected'}) · nothing verified · ${when}\n`;
  }
  if (r.kind === 'runner-missing') {
    const fix = r.remedy ? ` · fix: \`${r.remedy}\`` : '';
    return `> **codehere · verified outcome receipt** — couldn't run \`${r.command}\` on ${at} (runner not installed, exit ${r.exitCode}) · unverified${fix} · ${when}\n`;
  }
  const passed = (r.exitCode ?? 1) === 0 && !r.noTests;
  const counts =
    typeof r.passed === 'number' || typeof r.failed === 'number'
      ? ` (${r.passed ?? '?'} passed · ${r.failed ?? 0} failed)`
      : '';
  const verdict = r.noTests
    ? '✕ no tests ran'
    : !passed
      ? '✕ tests FAIL'
      : weakened.length
        ? `✕ tests pass · ${weakened.length} weakened`
        : missingClaimed.length
          ? `✕ tests pass · ${missingClaimed.length} claimed test file not found`
          : '✓ tests pass';
  const missingNote = missingClaimed.length
    ? `> The AI named test files that are not in the repo: ${missingClaimed.join(' · ')}\n`
    : '';
  // Reproduce line: the real, verifiable trust — anyone can re-run and confirm.
  const reproduce = sha ? `> Reproduce independently: \`git checkout ${sha} && ${reproduceCommand(repro)}\`\n` : '';
  const weakenedNote = weakened.length
    ? `> Tests changed in this diff, so a pass may check nothing: ${weakenedLines(weakened).join(' · ')}\n`
    : '';
  return (
    `> **codehere · verified outcome receipt** · ${verdict}${counts}\n` +
    `> codehere independently re-ran \`${r.command}\` on ${at} — exit ${r.exitCode}. Observed, not the AI's claim. · ${when}\n` +
    weakenedNote +
    missingNote +
    reproduce +
    `> Scope: the project's test suite — not a security or logic audit.\n`
  );
}

export async function executeCheckCommand(target: string | undefined, options: CheckOptions = {}): Promise<number> {
  const cwd = resolve(target || '.');
  let isFolder = false;
  try {
    isFolder = statSync(cwd).isDirectory();
  } catch {
    /* missing path: handled below */
  }
  if (!isFolder) throw new Error(`No such folder: ${target}`);
  const r = await rerunTests(cwd);
  const weakened = detectTestWeakening(cwd, options.base);
  const missingClaimed = options.claim ? findMissingClaimedTests(cwd, options.claim) : [];
  const verdict = checkVerdict(r, weakened, missingClaimed);
  const exitCode = verdict === 'pass' ? 0 : verdict === 'fail' ? 1 : 2;
  const weakenedText = () =>
    weakened.length
      ? weakenedLines(weakened)
          .map((l) => colors.dim(`  ${l}\n`))
          .join('') + colors.dim(`  › ${options.base ? `git diff ${options.base}...HEAD` : 'git diff HEAD'}\n`)
      : '';
  const missingLines = () =>
    missingClaimed.length
      ? missingClaimed.map((f) => colors.dim(`  ${f} · named by the AI, not in the repo\n`)).join('')
      : '';

  if (options.json) {
    const receipt =
      RECEIPT_MARKER +
      '\n' +
      buildProofBlock(cwd, r, weakened, missingClaimed, { base: options.base, claim: options.claim });
    process.stdout.write(JSON.stringify({ cwd, ...r, weakened, missingClaimed, verdict, receipt }, null, 2) + '\n');
    return exitCode;
  }

  if (options.proof) {
    process.stdout.write(
      buildProofBlock(cwd, r, weakened, missingClaimed, { base: options.base, claim: options.claim }),
    );
    return exitCode;
  }

  if (!r.ran) {
    // The runner/deps aren't installed (e.g. `spawn pytest ENOENT`) — that's a
    // fixable environment gap, not "no tests". Name the one command that fixes it.
    if (r.kind === 'command-not-found') {
      process.stdout.write(
        '\n' +
          colors.error(`${symbols.error} Couldn't run the tests`) +
          colors.dim(`  — the runner for '${r.command || 'your tests'}' isn't installed here.\n`) +
          (r.remedy
            ? colors.dim('  Fix it, then re-check:  ') + colors.success(`${r.remedy}\n\n`)
            : colors.dim('  Install the test runner, then run check again.\n\n')),
      );
      process.stdout.write(weakenedText() + missingLines());
      return exitCode; // couldn't verify (2); a weakened test or a missing named test file still counts (1)
    }
    if (r.kind === 'timed-out' || r.kind === 'disabled') {
      process.stdout.write(
        colors.error(`${symbols.error} Nothing verified`) +
          colors.dim(
            `  — ${r.kind === 'timed-out' ? `'${r.command}' ${r.skippedReason?.replace(/^test re-run /, '')}` : r.skippedReason}.\n`,
          ),
      );
      process.stdout.write(weakenedText() + missingLines());
      return exitCode;
    }
    process.stdout.write(
      colors.dim(`No test suite codehere can run here — ${r.skippedReason || 'none detected'}.\n`) +
        colors.dim(
          'codehere proves the AI by re-running your tests; add one (npm test / node --test / pytest / go test / cargo test) and run check again.\n',
        ),
    );
    process.stdout.write(weakenedText() + missingLines());
    return exitCode; // nothing was verified (2); a weakened test or a missing named test file still counts (1)
  }

  // Honesty: runner-missing (exit 126/127) means the test command couldn't be RUN
  // (deps not installed), not that the tests failed. Never report "FAIL" for that —
  // name the one command that makes it runnable.
  if (r.kind === 'runner-missing') {
    process.stdout.write(
      '\n' +
        colors.error(`${symbols.error} Couldn't run the tests`) +
        colors.dim(`  — '${r.command}' exited ${r.exitCode}: the deps/runner aren't installed here.\n`) +
        (r.remedy
          ? colors.dim('  Fix it, then re-check:  ') + colors.success(`${r.remedy}\n\n`)
          : colors.dim('  Install deps, then run check again.\n\n')),
    );
    process.stdout.write(weakenedText() + missingLines());
    return exitCode; // non-zero for CI (unverified), but NOT a false "tests failed"
  }

  const passed = (r.exitCode ?? 1) === 0 && !r.noTests;
  const counts =
    typeof r.passed === 'number' || typeof r.failed === 'number'
      ? `  ${r.passed ?? '?'} passed · ${r.failed ?? 0} failed`
      : '';
  const headline = r.noTests
    ? colors.error(`${symbols.error} No tests ran`)
    : !passed
      ? colors.error(`${symbols.error} Tests FAIL`)
      : weakened.length
        ? colors.error(`${symbols.error} Tests pass · ${weakened.length} weakened in this change`)
        : missingClaimed.length
          ? colors.error(`${symbols.error} Tests pass · ${missingClaimed.length} claimed test file not found`)
          : colors.success(`${symbols.success} Tests pass`);
  process.stdout.write(
    '\n' +
      headline +
      colors.dim(`  — codehere re-ran them itself (${r.command}, exit ${r.exitCode})${counts}\n`) +
      colors.dim("This is observed reality, not the agent's claim.\n") +
      (r.noTests
        ? colors.dim(
            r.allSkipped
              ? '  The runner says every test was skipped, so nothing was tested.\n'
              : '  The runner reported 0 tests, so nothing was tested. Check the test file names.\n',
          )
        : '') +
      weakenedText() +
      missingLines() +
      '\n',
  );
  return exitCode;
}
