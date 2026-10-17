/**
 * The receipt is posted as a bot comment on the pull request, and the pull request author controls the diff text,
 * file names and branch names in it. None of that may render as a link, an @mention or a terminal escape
 * (cold review, 2026-10-16).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = join(__dirname, '../../dist/index.js');
const SUMMARIZE = join(__dirname, '../../../action/summarize.mjs');
const dirs: string[] = [];
const NODE_PKG = JSON.stringify({ name: 't', private: true, type: 'module', scripts: { test: 'node --test' } });
const REAL = `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('sum', () => assert.equal(1 + 1, 2));\n`;
const HOSTILE = `test.skip('[Approve and merge](https://evil.example/x) @octocat \u001b[31mRED', () => {});`;
const BASE = 'ma`in';

function git(cwd: string, ...a: string[]) {
  execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], {
    cwd,
    stdio: 'ignore',
  });
}

function hostileRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-escape-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), NODE_PKG);
  writeFileSync(join(dir, 'a.test.js'), REAL);
  git(dir, 'init', '-q', '-b', BASE);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'agent');
  writeFileSync(join(dir, 'a.test.js'), REAL + HOSTILE + '\n');
  git(dir, 'commit', '-q', '-am', 'agent');
  return dir;
}

function check(cwd: string, ...args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: '1' };
  delete env.CODEHERE_TEST_CMD;
  delete env.CODEHERE_RERUN_TESTS;
  return spawnSync('node', [CLI, 'check', ...args], { cwd, env, encoding: 'utf8' });
}

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** The text outside inline code spans of a markdown line. */
const outsideCode = (line: string) =>
  line
    .split('`')
    .filter((_, i) => i % 2 === 0)
    .join('');

describe('the receipt does not render hostile pull request text', () => {
  it('puts the weakened line inside a code span, strips escape bytes, and keeps the --base text from breaking out', () => {
    const cwd = hostileRepo();
    const r = check(cwd, '--json', '--base', BASE);
    const out = JSON.parse(r.stdout);
    expect(out.weakened.length).toBe(1);
    const receipt: string = out.receipt;
    expect(receipt).not.toContain('\u001b');
    for (const line of receipt.split('\n')) {
      expect(outsideCode(line)).not.toMatch(/\]\(https?:|@octocat/);
    }
    const reproduce = receipt.split('\n').find((l) => l.startsWith('> Reproduce independently:')) ?? '';
    expect(reproduce.split('`').length - 1).toBe(2);
  });

  it('the Action receipt file has the same protections after summarize.mjs', () => {
    const cwd = hostileRepo();
    const resultFile = join(cwd, 'result.json');
    writeFileSync(resultFile, check(cwd, '--json', '--base', BASE).stdout);
    const receiptFile = join(cwd, 'receipt.md');
    spawnSync('node', [SUMMARIZE, resultFile, join(cwd, 'none.txt'), receiptFile], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, PR_NUMBER: '7', PR_HEAD_SHA: 'abcdef1234567' },
    });
    const md = readFileSync(receiptFile, 'utf8');
    expect(md).not.toContain('\u001b');
    for (const line of md.split('\n')) expect(outsideCode(line)).not.toMatch(/\]\(https?:|@octocat/);
  });

  it('a hostile reason on stderr cannot break out of the fallback receipt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-escape-sum-'));
    dirs.push(dir);
    const err = join(dir, 'stderr.txt');
    writeFileSync(err, 'Unknown --base "x` [click](https://evil.example) @octocat \u001b[2J": not a ref\n');
    spawnSync('node', [SUMMARIZE, join(dir, 'missing.json'), err, join(dir, 'receipt.md')], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    const md = readFileSync(join(dir, 'receipt.md'), 'utf8');
    expect(md).not.toContain('\u001b');
    for (const line of md.split('\n')) expect(outsideCode(line)).not.toMatch(/\]\(https?:|@octocat/);
  });

  it('the terminal output carries no escape bytes from the diff', () => {
    const r = check(hostileRepo(), '--base', BASE);
    expect(r.stdout).toContain('test skipped');
    expect(r.stdout).not.toContain('\u001b');
  });
});
