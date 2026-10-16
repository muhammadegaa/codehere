import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;
const SWAPPED = REAL.replace('assert.equal(1 + 1, 2)', 'assert.ok(true)');

/** A repo whose `main` has the real test and whose `feature` branch commits `change`. */
function repo(change: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-base-'));
  dirs.push(dir);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
      cwd: dir,
      stdio: 'ignore',
    });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  writeFileSync(join(dir, 'a.test.js'), REAL);
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('checkout', '-q', '-b', 'feature');
  writeFileSync(join(dir, 'a.test.js'), change);
  git('add', '-A');
  git('commit', '-q', '-m', 'agent');
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check --base', () => {
  it('flags a swap that is already committed, comparing against the base branch', () => {
    const cwd = repo(SWAPPED);
    const r = check(cwd, '--json', '--base', 'main');
    const out = JSON.parse(r.stdout);
    expect(out.kind).toBe('passed');
    expect(out.weakened.map((w: { why: string }) => w.why)).toEqual(['trivial-assertion']);
    expect(r.status).toBe(1);
  });

  it('points at a diff that shows the committed change', () => {
    const text = check(repo(SWAPPED), '--base', 'main').stdout;
    expect(text).toContain('› git diff main...HEAD');
    expect(text).not.toContain('› git diff HEAD');
  });

  it('does not see the committed swap without --base', () => {
    const r = check(repo(SWAPPED), '--json');
    expect(JSON.parse(r.stdout).weakened).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('leaves an honest committed change alone', () => {
    const cwd = repo(REAL + `test('diff', () => assert.equal(3 - 1, 2));\n`);
    const r = check(cwd, '--json', '--base', 'main');
    expect(JSON.parse(r.stdout).weakened).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('compares against where the branch left the base, not the base tip', () => {
    const cwd = repo(REAL + `test('diff', () => assert.equal(3 - 1, 2));\n`);
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
        cwd,
        stdio: 'ignore',
      });
    git('checkout', '-q', 'main');
    writeFileSync(join(cwd, 'a.test.js'), SWAPPED);
    git('add', '-A');
    git('commit', '-q', '-m', 'someone else swaps a test on main');
    git('checkout', '-q', 'feature');
    const r = check(cwd, '--json', '--base', 'main');
    expect(JSON.parse(r.stdout).weakened).toEqual([]);
  });

  it('fails clearly on an unknown ref and refuses a ref that looks like an option', () => {
    const cwd = repo(SWAPPED);
    const unknown = check(cwd, '--base', 'no-such-branch');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('--base');
    const sneaky = check(cwd, '--base=--output=/tmp/x');
    expect(sneaky.status).toBe(1);
    expect(sneaky.stderr).toContain('--base');
  });
});

describe('codehere check --proof · reproduce line', () => {
  it('repeats --base and a short --claim so the receipt can be reproduced', () => {
    const cwd = repo(SWAPPED);
    const proof = check(cwd, '--proof', '--base', 'main', '--claim', 'ran a.test.js, all pass').stdout;
    expect(proof).toMatch(
      /Reproduce independently: `git checkout [0-9a-f]+ && codehere check --base main --claim 'ran a\.test\.js, all pass'`/,
    );
  });

  it('says to reuse the summary when it is too long or unsafe to inline', () => {
    const cwd = repo(SWAPPED);
    const long = 'x '.repeat(200) + 'a.test.js';
    const proof = check(cwd, '--proof', '--claim', long).stdout;
    expect(proof).toContain('codehere check --claim <the same summary>');
    const tick = check(cwd, '--proof', '--claim', 'ran `a.test.js`').stdout;
    expect(tick).toContain('--claim <the same summary>');
  });

  it('keeps the plain command when no option changed the verdict', () => {
    const proof = check(repo(REAL + '// ok\n'), '--proof').stdout;
    expect(proof).toMatch(/Reproduce independently: `git checkout [0-9a-f]+ && codehere check`/);
  });
});
