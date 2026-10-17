/**
 * A run where every test was skipped tested nothing, so it must not read as "Tests pass".
 */
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reportedOnlySkipped } from '../../src/application/use-cases/rerun-tests.js';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];
const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });

function repo(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-skipped-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  writeFileSync(join(dir, 'a.test.js'), body);
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('reportedOnlySkipped · runner summaries', () => {
  it('node:test: pass 0 and skipped > 0', () => {
    expect(
      reportedOnlySkipped('ℹ tests 2\nℹ suites 0\nℹ pass 0\nℹ fail 0\nℹ cancelled 0\nℹ skipped 2\nℹ todo 0\n'),
    ).toBe(true);
    expect(reportedOnlySkipped('ℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ skipped 1\n')).toBe(false);
  });

  it('pytest: a final line with skipped and nothing passed', () => {
    expect(
      reportedOnlySkipped('============================== 2 skipped in 0.01s ==============================\n'),
    ).toBe(true);
    expect(
      reportedOnlySkipped('========================= 1 passed, 1 skipped in 0.02s =========================\n'),
    ).toBe(false);
  });

  it('jest and vitest: Tests line with skipped and nothing passed', () => {
    expect(reportedOnlySkipped('Tests:       2 skipped, 2 total\n')).toBe(true);
    expect(reportedOnlySkipped('Tests:       1 skipped, 1 passed, 2 total\n')).toBe(false);
    expect(reportedOnlySkipped('      Tests  2 skipped (2)\n')).toBe(true);
    expect(reportedOnlySkipped('      Tests  1 passed | 1 skipped (2)\n')).toBe(false);
  });

  it('no summary at all is not "only skipped"', () => {
    expect(reportedOnlySkipped('')).toBe(false);
    expect(reportedOnlySkipped('3 passed in 0.1s\n')).toBe(false);
  });
});

describe('codehere check when every test is skipped', () => {
  const ALL_SKIPPED = `import test from 'node:test';\ntest('a', { skip: true }, () => { throw new Error('x'); });\n`;

  it('does not say "Tests pass", says every test was skipped, and exits 1', () => {
    const r = check(repo(ALL_SKIPPED));
    expect(r.stdout).not.toMatch(/Tests pass/);
    expect(r.stdout).toMatch(/every test was skipped/);
    expect(r.status).toBe(1);
  });

  it('reports verdict fail in --json', () => {
    const out = JSON.parse(check(repo(ALL_SKIPPED), '--json').stdout);
    expect(out.verdict).toBe('fail');
    expect(out.allSkipped).toBe(true);
  });

  it('control: one real test next to a skipped one still passes', () => {
    const r = check(
      repo(
        `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('a', { skip: true }, () => {});\ntest('b', () => assert.equal(1, 1));\n`,
      ),
    );
    expect(r.stdout).toMatch(/Tests pass/);
    expect(r.status).toBe(0);
  });
});
