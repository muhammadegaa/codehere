import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-weakened-'));
  dirs.push(dir);
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
      cwd: dir,
      stdio: 'ignore',
    });
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  writeFileSync(join(dir, 'a.test.js'), REAL);
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check · weakened tests', () => {
  it('exits 1 and names the line when a real assertion was swapped for one that checks nothing', () => {
    const cwd = repo();
    writeFileSync(
      join(cwd, 'a.test.js'),
      `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.ok(true));\n`,
    );
    const r = check(cwd, '--json');
    const out = JSON.parse(r.stdout);
    expect(out.kind).toBe('passed');
    expect(out.weakened).toEqual([
      { file: 'a.test.js', line: 3, why: 'trivial-assertion', text: "test('sum', () => assert.ok(true));" },
    ]);
    expect(r.status).toBe(1);
  });

  it('exits 1 with a skip marker added to a test', () => {
    const cwd = repo();
    writeFileSync(join(cwd, 'a.test.js'), REAL.replace("test('sum'", "test.skip('sum'"));
    const r = check(cwd, '--json');
    expect(JSON.parse(r.stdout).weakened[0].why).toBe('skipped');
    expect(r.status).toBe(1);
  });

  it('leaves an honest edit alone: a real assertion added, exit 0', () => {
    const cwd = repo();
    writeFileSync(join(cwd, 'a.test.js'), REAL + `test('diff', () => assert.equal(3 - 1, 2));\n`);
    const r = check(cwd, '--json');
    expect(JSON.parse(r.stdout).weakened).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('prints the finding for a person and in the receipt', () => {
    const cwd = repo();
    writeFileSync(join(cwd, 'a.test.js'), REAL.replace('assert.equal(1 + 1, 2)', 'assert.ok(true)'));
    const text = check(cwd).stdout;
    expect(text).toContain('1 weakened in this change');
    expect(text).toContain('a.test.js:3');
    const proof = check(cwd, '--proof').stdout;
    expect(proof).toContain('✕ tests pass · 1 weakened');
    expect(proof).toContain('Tests changed in this diff');
  });

  it('works in a directory that is not a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-nogit-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), NODE_PKG);
    writeFileSync(join(dir, 'a.test.js'), REAL);
    const r = check(dir, '--json');
    expect(JSON.parse(r.stdout).weakened).toEqual([]);
    expect(r.status).toBe(0);
  });
});
