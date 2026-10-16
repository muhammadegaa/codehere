import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reportedZeroTests } from '../../src/application/use-cases/rerun-tests.js';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const TEST_BODY = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;

function repo(testFile: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-zero-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, testFile), TEST_BODY);
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('reportedZeroTests', () => {
  it('is true when node reports 0 tests (spec and TAP reporters)', () => {
    expect(reportedZeroTests('ℹ tests 0\nℹ suites 0\nℹ pass 0\nℹ fail 0\n')).toBe(true);
    expect(reportedZeroTests('# tests 0\n# pass 0\n# fail 0\n')).toBe(true);
  });
  it('is true when go test only prints [no test files] lines', () => {
    expect(reportedZeroTests('?   \tx\t[no test files]\n')).toBe(true);
    expect(reportedZeroTests('?   \tx\t[no test files]\n?   \tx/sub\t[no test files]\n')).toBe(true);
  });
  it('is false when go test ran a package, even if another has no test files', () => {
    expect(reportedZeroTests('?   \tx\t[no test files]\nok  \tx/sub\t0.003s\n')).toBe(false);
    expect(reportedZeroTests('?   \tx\t[no test files]\nFAIL\tx/sub\t0.003s\n')).toBe(false);
  });
  it('is false when any test ran', () => {
    expect(reportedZeroTests('ℹ tests 3\nℹ pass 3\nℹ fail 0\n')).toBe(false);
    expect(reportedZeroTests('ℹ tests 0\nℹ tests 2\n')).toBe(false);
  });
  it('is false for output with no node summary at all', () => {
    expect(reportedZeroTests('3 passed in 0.1s\n')).toBe(false);
    expect(reportedZeroTests('')).toBe(false);
  });
});

describe('codehere check when the runner finds no tests', () => {
  it('does not say "Tests pass" when node:test ran 0 tests (misnamed file), and exits 1', () => {
    const r = check(repo('calc.tests.js'));
    expect(r.stdout).not.toMatch(/Tests pass/);
    expect(r.stdout).toMatch(/No tests ran/);
    expect(r.status).toBe(1);
  });

  it('reports verdict fail in --json and keeps the real exit code of the run', () => {
    const r = check(repo('calc.tests.js'), '--json');
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('fail');
    expect(out.noTests).toBe(true);
    expect(out.exitCode).toBe(0);
    expect(r.status).toBe(1);
  });

  it('the receipt does not say tests pass', () => {
    const r = check(repo('calc.tests.js'), '--proof');
    expect(r.stdout).not.toMatch(/✓ tests pass/);
    expect(r.stdout).toMatch(/no tests ran/i);
  });

  it('control: a correctly named test file still passes', () => {
    const r = check(repo('calc.test.js'));
    expect(r.stdout).toMatch(/Tests pass/);
    expect(r.status).toBe(0);
  });
});
