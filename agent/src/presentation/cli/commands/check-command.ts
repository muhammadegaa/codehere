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
import {
  scanTestWeakening,
  type TestWeakening,
  type WeakeningScan,
} from '../../../application/use-cases/detect-test-weakening.js';
import { findMissingClaimedTests } from '../../../application/use-cases/check-claimed-tests.js';

const WHY_TEXT: Record<TestWeakening['why'], string> = {
  'trivial-assertion': 'assertion that checks nothing',
  skipped: 'test skipped',
  'commented-out': 'assertion commented out',
  'unreachable-assertion': 'assertion after an early return',
};

// File names, diff lines and branch names come from whoever wrote the change, so they are treated as untrusted:
// control characters (terminal escapes among them) are replaced, and in the markdown receipt the text sits inside
// an inline code span, where no link, @mention or emphasis renders.
// Control characters, plus direction overrides and zero-width characters that can disguise a file name.
const plain = (s: string) =>
  s.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '?');
const code = (s: string) => '`' + plain(s).replace(/`/g, "'") + '`';
/** Characters a branch name usually has; anything else is not repeated in the reproduce command. */
const SAFE_REF = /^[A-Za-z0-9._/@+-]+$/;

const weakenedLines = (w: TestWeakening[]) =>
  w.map((f) => `${plain(f.file)}:${f.line} · ${WHY_TEXT[f.why]} · ${plain(f.text)}`);
const weakenedMarkdown = (w: TestWeakening[]) =>
  w.map((f) => `${code(f.file)}:${f.line} · ${WHY_TEXT[f.why]} · ${code(f.text)}`);

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
 * was weakened, no named test file was missing and the weakened-test scan finished. Tampering is `fail` even if
 * no suite could run; every other case where nothing was verified is `unverified`, never a pass.
 */
export function checkVerdict(
  r: RerunTestsResult,
  weakened: unknown[],
  missingClaimed: unknown[],
  scanError?: string,
): CheckVerdict {
  if (weakened.length || missingClaimed.length) return 'fail';
  if (r.kind === 'disabled') return 'skipped';
  if (r.kind === 'failed') return 'fail';
  if (scanError) return 'unverified';
  if (r.kind === 'passed' && r.ran && (r.exitCode ?? 1) === 0) return 'pass';
  return 'unverified';
}

/** The check command that gives the same verdict as this run: the options that changed it are repeated. */
function reproduceCommand({ base, claim }: { base?: string; claim?: string }): string {
  let cmd = 'codehere check';
  if (base) cmd += SAFE_REF.test(base) ? ` --base ${base}` : ' --base <the same base>';
  if (claim) {
    const inlineable = claim.length <= 160 && !/[`'\n\r]/.test(claim);
    cmd += inlineable ? ` --claim '${plain(claim)}'` : ' --claim <the same summary>';
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
  scan: WeakeningScan = { findings: [] },
): string {
  const sha = gitShortSha(cwd);
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const at = sha ? `commit \`${sha}\`` : 'the working tree';
  const weakenedNote = weakened.length
    ? `> Tests changed in this diff, so a pass may check nothing: ${weakenedMarkdown(weakened).join(' · ')}\n`
    : '';
  const missingNote = missingClaimed.length
    ? `> The AI named test files that are not in the repo: ${missingClaimed.map(code).join(' · ')}\n`
    : '';
  const scanNote = scan.error
    ? `> Weakened-test scan could not run: ${scan.error}\n`
    : scan.skipped
      ? `> Weakened-test scan skipped: ${scan.skipped}\n`
      : '';
  // A finding is reported even when the suite could not run.
  const notes = weakenedNote + missingNote + scanNote;
  if (!r.ran) {
    if (r.kind === 'command-not-found') {
      const fix = r.remedy ? ` · fix: \`${r.remedy}\`` : '';
      return `> **codehere · verified outcome receipt** — couldn't run ${code(r.command || 'the tests')} (runner/deps not installed) · unverified${fix} · ${when}\n${notes}`;
    }
    return `> **codehere · verified outcome receipt** — no suite re-run (${code(r.skippedReason || 'none detected')}) · nothing verified · ${when}\n${notes}`;
  }
  if (r.kind === 'runner-missing') {
    const fix = r.remedy ? ` · fix: \`${r.remedy}\`` : '';
    return `> **codehere · verified outcome receipt** — couldn't run ${code(r.command ?? '')} on ${at} (runner not installed, exit ${r.exitCode}) · unverified${fix} · ${when}\n${notes}`;
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
          : scan.error
            ? '✕ tests pass · weakened-test scan could not run'
            : '✓ tests pass';
  // Reproduce line: the real, verifiable trust — anyone can re-run and confirm.
  const reproduce = sha ? `> Reproduce independently: \`git checkout ${sha} && ${reproduceCommand(repro)}\`\n` : '';
  return (
    `> **codehere · verified outcome receipt** · ${verdict}${counts}\n` +
    `> codehere independently re-ran ${code(r.command ?? '')} on ${at} — exit ${r.exitCode}. Observed, not the AI's claim. · ${when}\n` +
    notes +
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
  const scan = scanTestWeakening(cwd, options.base);
  const weakened = scan.findings;
  const missingClaimed = options.claim ? findMissingClaimedTests(cwd, options.claim) : [];
  const verdict = checkVerdict(r, weakened, missingClaimed, scan.error);
  const weakeningScan = scan.error ? `could not run: ${scan.error}` : scan.skipped ? `skipped: ${scan.skipped}` : 'ran';
  const exitCode = verdict === 'pass' ? 0 : verdict === 'fail' ? 1 : 2;
  const weakenedText = () =>
    weakened.length
      ? weakenedLines(weakened)
          .map((l) => colors.dim(`  ${l}\n`))
          .join('') + colors.dim(`  › ${options.base ? `git diff ${plain(options.base)}...HEAD` : 'git diff HEAD'}\n`)
      : '';
  const scanText = () =>
    scan.error
      ? colors.dim(`  weakened-test scan could not run: ${scan.error}\n`)
      : scan.skipped
        ? colors.dim(`  weakened-test scan skipped: ${scan.skipped}\n`)
        : '';
  const missingLines = () =>
    missingClaimed.length
      ? missingClaimed.map((f) => colors.dim(`  ${plain(f)} · named by the AI, not in the repo\n`)).join('')
      : '';

  if (options.json) {
    const receipt =
      RECEIPT_MARKER +
      '\n' +
      buildProofBlock(cwd, r, weakened, missingClaimed, { base: options.base, claim: options.claim }, scan);
    process.stdout.write(
      JSON.stringify({ cwd, ...r, weakened, missingClaimed, weakeningScan, verdict, receipt }, null, 2) + '\n',
    );
    return exitCode;
  }

  if (options.proof) {
    process.stdout.write(
      buildProofBlock(cwd, r, weakened, missingClaimed, { base: options.base, claim: options.claim }, scan),
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
      process.stdout.write(weakenedText() + missingLines() + scanText());
      return exitCode; // couldn't verify (2); a weakened test or a missing named test file still counts (1)
    }
    if (r.kind === 'timed-out' || r.kind === 'disabled') {
      process.stdout.write(
        colors.error(`${symbols.error} Nothing verified`) +
          colors.dim(
            `  — ${r.kind === 'timed-out' ? `'${r.command}' ${r.skippedReason?.replace(/^test re-run /, '')}` : r.skippedReason}.\n`,
          ),
      );
      process.stdout.write(weakenedText() + missingLines() + scanText());
      return exitCode;
    }
    process.stdout.write(
      colors.dim(`No test suite codehere can run here — ${r.skippedReason || 'none detected'}.\n`) +
        colors.dim(
          'codehere proves the AI by re-running your tests; add one (npm test / node --test / pytest / go test / cargo test) and run check again.\n',
        ),
    );
    process.stdout.write(weakenedText() + missingLines() + scanText());
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
    process.stdout.write(weakenedText() + missingLines() + scanText());
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
          : scan.error
            ? colors.error(`${symbols.error} Tests pass · weakened-test scan could not run`)
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
      scanText() +
      '\n',
  );
  return exitCode;
}
