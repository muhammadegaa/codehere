import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const dirs: string[] = [];

const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-claim-'));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

const check = (cwd: string, ...args: string[]) => {
  const env = { ...process.env };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
};

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('codehere check --claim', () => {
  it('exits 1 when the AI named a test file that is not in the repo, even though the suite passes', () => {
    const cwd = repo({ 'package.json': NODE_PKG, 'test/other.test.js': REAL });
    const r = check(cwd, '--json', '--claim', 'ran test/webhook.test.js, all pass');
    const out = JSON.parse(r.stdout);
    expect(out.kind).toBe('passed');
    expect(out.missingClaimed).toEqual(['test/webhook.test.js']);
    expect(r.status).toBe(1);
  });

  it('exits 0 when the named file exists', () => {
    const cwd = repo({ 'package.json': NODE_PKG, 'test/webhook.test.js': REAL });
    const r = check(cwd, '--json', '--claim', 'ran test/webhook.test.js, all pass');
    expect(JSON.parse(r.stdout).missingClaimed).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('does nothing without --claim', () => {
    const cwd = repo({ 'package.json': NODE_PKG, 'test/other.test.js': REAL });
    const r = check(cwd, '--json');
    expect(JSON.parse(r.stdout).missingClaimed).toEqual([]);
    expect(r.status).toBe(0);
  });

  it('names the missing file in the text output and the receipt', () => {
    const cwd = repo({ 'package.json': NODE_PKG, 'test/other.test.js': REAL });
    const claim = 'webhook tests pass: test/webhook.test.js';
    const text = check(cwd, '--claim', claim).stdout;
    expect(text).toContain('1 claimed test file not found');
    expect(text).toContain('test/webhook.test.js');
    const proof = check(cwd, '--proof', '--claim', claim).stdout;
    expect(proof).toContain('✕ tests pass · 1 claimed test file not found');
    expect(proof).toContain('not in the repo: `test/webhook.test.js`');
  });

  it('still flags a missing file when no suite can run at all', () => {
    const cwd = repo({ 'README.md': 'x' });
    const r = check(cwd, '--json', '--claim', 'ran tests/booking_test.go');
    expect(JSON.parse(r.stdout).missingClaimed).toEqual(['tests/booking_test.go']);
    expect(r.status).toBe(1);
  });
});
