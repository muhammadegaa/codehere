/**
 * When codehere could not run the tests, nothing was verified, so `check` must not exit 0 (which CI reads as a pass).
 * Exit codes: 0 verified pass, 1 a finding (failed, no tests ran, weakened, missing claimed file), 2 nothing verified.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-unverified-'));
  dirs.push(dir);
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
      cwd: dir,
      stdio: 'ignore',
    });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return dir;
}

function check(cwd: string, env: Record<string, string>, ...args: string[]) {
  const e: Record<string, string | undefined> = { ...process.env };
  delete e.CODEHERE_TEST_CMD;
  delete e.CODEHERE_RERUN_TESTS;
  delete e.CODEHERE_RERUN_TIMEOUT_MS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env: { ...e, ...env }, encoding: 'utf8' });
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check · nothing verified is not a pass', () => {
  it('a timed-out run exits 2, says it timed out, and does not claim there is no suite', () => {
    const cwd = repo({ 'README.md': 'x' });
    const r = check(cwd, { CODEHERE_TEST_CMD: 'sleep 5', CODEHERE_RERUN_TIMEOUT_MS: '500' });
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('timed out after 0.5s');
    expect(r.stdout).not.toContain('No test suite');
  });

  it('a timed-out run is unverified in --json and exits 2', () => {
    const cwd = repo({ 'README.md': 'x' });
    const r = check(cwd, { CODEHERE_TEST_CMD: 'sleep 5', CODEHERE_RERUN_TIMEOUT_MS: '500' }, '--json');
    expect(JSON.parse(r.stdout).verdict).toBe('unverified');
    expect(r.status).toBe(2);
  });

  it('no test command exits 2', () => {
    const r = check(repo({ 'README.md': 'x' }), {});
    expect(r.stdout).toContain('No test suite');
    expect(r.status).toBe(2);
  });

  it('a re-run turned off with CODEHERE_RERUN_TESTS=0 exits 2', () => {
    const r = check(repo({ 'README.md': 'x' }), { CODEHERE_RERUN_TESTS: '0' }, '--json');
    expect(JSON.parse(r.stdout).verdict).toBe('skipped');
    expect(r.status).toBe(2);
  });
});
