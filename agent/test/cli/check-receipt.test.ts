import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;
const FAILING = REAL.replace('1 + 1, 2', '1 + 1, 3');

function repo(files: Record<string, string>, change?: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-receipt-'));
  dirs.push(dir);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
      cwd: dir,
      stdio: 'ignore',
    });
  for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, f), body);
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  for (const [f, body] of Object.entries(change ?? {})) writeFileSync(join(dir, f), body);
  return dir;
}

function json(cwd: string, extra: Record<string, string> = {}) {
  const env = { ...process.env, ...extra };
  if (!('CODEHERE_TEST_CMD' in extra)) delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  const r = spawnSync('node', [CLI, 'check', '--json'], { cwd, env, encoding: 'utf8' });
  return { out: JSON.parse(r.stdout), status: r.status };
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check --json · verdict and receipt', () => {
  it('pass: suite passed and nothing was weakened', () => {
    const { out, status } = json(repo({ 'package.json': NODE_PKG, 'a.test.js': REAL }));
    expect(out.verdict).toBe('pass');
    expect(out.receipt.startsWith('<!-- codehere-receipt -->\n> **codehere')).toBe(true);
    expect(out.receipt).toContain('✓ tests pass');
    expect(status).toBe(0);
  });

  it('fail: the suite failed', () => {
    const { out, status } = json(repo({ 'package.json': NODE_PKG, 'a.test.js': FAILING }));
    expect(out.verdict).toBe('fail');
    expect(out.receipt).toContain('✕ tests FAIL');
    expect(status).toBe(1);
  });

  it('fail: the suite passed but a test was weakened', () => {
    const cwd = repo(
      { 'package.json': NODE_PKG, 'a.test.js': REAL },
      { 'a.test.js': REAL.replace('assert.equal(1 + 1, 2)', 'assert.ok(true)') },
    );
    const { out } = json(cwd);
    expect(out.kind).toBe('passed');
    expect(out.verdict).toBe('fail');
    expect(out.receipt).toContain('1 weakened');
  });

  it('unverified: no suite can be run, never a pass', () => {
    const { out, status } = json(repo({ 'README.md': 'x' }));
    expect(out.verdict).toBe('unverified');
    expect(out.receipt).toContain('nothing verified');
    expect(status).toBe(2);
  });

  it('unverified: the test command is not installed', () => {
    const cwd = repo({ 'package.json': NODE_PKG, 'a.test.js': REAL });
    const { out } = json(cwd, { CODEHERE_TEST_CMD: 'definitely-not-a-real-command-xyz' });
    expect(out.verdict).toBe('unverified');
  });
});

describe('codehere check · a folder that does not exist', () => {
  it('is an error, never "nothing to verify" with exit 0', () => {
    const r = spawnSync('node', [CLI, 'check', '/no/such/folder-xyz', '--json'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('No such folder');
    expect(r.stdout).toBe('');
  });

  it('is an error for a file path too', () => {
    const dir = repo({ 'package.json': NODE_PKG, 'a.test.js': REAL });
    const r = spawnSync('node', [CLI, 'check', join(dir, 'package.json')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('No such folder');
  });
});
