/**
 * The weakened-test scan must not turn itself off without saying so. Each case below used to return a green pass
 * with the weakening unseen (cold review, 2026-10-16).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];
const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;
const WEAK = REAL.replace('assert.equal(1 + 1, 2)', 'assert.ok(true)');

function git(cwd: string, ...a: string[]) {
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    stdio: 'ignore',
  });
}

/** A repo with `file` committed on main, then `change` applied and committed on a branch. */
function repo(file: string, change: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-gaps-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), REAL);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'agent');
  change(dir);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'agent change');
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check · the weakened-test scan does not go quiet', () => {
  it('still sees a weakened test when the same change adds a 20 MB non-test file', () => {
    const cwd = repo('a.test.js', (d) => {
      writeFileSync(join(d, 'a.test.js'), WEAK);
      writeFileSync(join(d, 'big.txt'), 'a'.repeat(20_000_000));
    });
    const r = check(cwd, '--json', '--base', 'main');
    expect(JSON.parse(r.stdout).weakened.map((w: { file: string }) => w.file)).toEqual(['a.test.js']);
    expect(r.status).toBe(1);
  });

  it('flags a weakened test whose file name is not ASCII', () => {
    const cwd = repo('test/café.test.js', (d) => writeFileSync(join(d, 'test/café.test.js'), WEAK));
    const r = check(cwd, '--json', '--base', 'main');
    expect(JSON.parse(r.stdout).weakened.map((w: { file: string }) => w.file)).toEqual(['test/café.test.js']);
    expect(r.status).toBe(1);
  });

  it('is not fooled by an added line that looks like a diff header', () => {
    const cwd = repo('a.test.js', (d) =>
      writeFileSync(join(d, 'a.test.js'), WEAK.replace("test('sum'", "/*\n++ b/README.md\n*/\ntest('sum'")),
    );
    const r = check(cwd, '--json', '--base', 'main');
    expect(JSON.parse(r.stdout).weakened.map((w: { why: string }) => w.why)).toEqual(['trivial-assertion']);
    expect(r.status).toBe(1);
  });

  it('a test-file diff too large to read makes the run unverified, not a pass', () => {
    const cwd = repo('a.test.js', (d) => writeFileSync(join(d, 'a.test.js'), REAL + `// ${'x'.repeat(70_000_000)}\n`));
    const r = check(cwd, '--json', '--base', 'main');
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('unverified');
    expect(out.weakeningScan).toMatch(/could not read the diff/);
    expect(r.status).toBe(2);
  });

  it('says so when the folder is not a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-gaps-nogit-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), NODE_PKG);
    writeFileSync(join(dir, 'a.test.js'), REAL);
    const out = JSON.parse(check(dir, '--json').stdout);
    expect(out.weakeningScan).toMatch(/not a git repository/);
    expect(check(dir).stdout).toMatch(/weakened-test scan skipped: not a git repository/);
  });
});
