/**
 * When git itself fails, the weakened-test scan did not run, so the run must not exit 0. Each case used to print
 * "skipped: not a git repository" and pass with a weakened test in the diff (third cold review, 2026-10-17).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];
const REAL = 'def test_sum():\n    assert 1 + 1 == 2\n';
const WEAK = 'def test_sum():\n    assert True\n';

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function git(cwd: string, ...a: string[]) {
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    stdio: 'ignore',
  });
}

/** A repository with test_a.py committed, then weakened in the working tree. */
function weakenedRepo(): string {
  const dir = tmp('codehere-gitfail-');
  writeFileSync(join(dir, 'test_a.py'), REAL);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'test_a.py'), WEAK);
  return dir;
}

function check(cwd: string, env: Record<string, string | undefined>, ...args: string[]) {
  const e: Record<string, string | undefined> = { ...process.env, CODEHERE_TEST_CMD: '/usr/bin/true', ...env };
  delete e.CODEHERE_RERUN_TESTS;
  return spawnSync(process.execPath, [CLI, 'check', '--json', ...args], { cwd, env: e, encoding: 'utf8' });
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check when git fails', () => {
  it('git not installed: unverified, exit 2, and it says git is missing', () => {
    const bin = tmp('codehere-nogit-bin-');
    symlinkSync(process.execPath, join(bin, 'node'));
    const r = check(weakenedRepo(), { PATH: bin });
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('unverified');
    expect(out.weakeningScan).toMatch(/could not run: git is not installed/);
    expect(r.status).toBe(2);
  });

  it('GIT_DIR pointing nowhere inside a repository: unverified, exit 2', () => {
    const r = check(weakenedRepo(), { GIT_DIR: '/nonexistent' });
    expect(JSON.parse(r.stdout).verdict).toBe('unverified');
    expect(r.status).toBe(2);
  });

  it('--base in a folder that is not a repository: unverified, exit 2', () => {
    const dir = tmp('codehere-gitfail-nogit-');
    writeFileSync(join(dir, 'test_a.py'), WEAK);
    const r = check(dir, {}, '--base', 'main');
    expect(JSON.parse(r.stdout).verdict).toBe('unverified');
    expect(r.status).toBe(2);
  });

  it('control: a plain folder with no repository and no --base still passes with the scan marked skipped', () => {
    const dir = tmp('codehere-gitfail-plain-');
    writeFileSync(join(dir, 'test_a.py'), REAL);
    const r = check(dir, {});
    const out = JSON.parse(r.stdout);
    expect(out.weakeningScan).toBe('skipped: not a git repository');
    expect(r.status).toBe(0);
  });
});
