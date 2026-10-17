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

describe('the receipt keeps findings and stays one blockquote (second review, 2026-10-17)', () => {
  function repoWith(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-escape2-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'package.json'), NODE_PKG);
    execFileSync('mkdir', ['-p', join(dir, 'test')]);
    writeFileSync(join(dir, name), REAL);
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'base');
    writeFileSync(join(dir, name), WEAK);
    return dir;
  }
  const WEAK = REAL.replace('assert.equal(1 + 1, 2)', 'assert.ok(true)');

  it('a weakened test is in the receipt when the run timed out, and the verdict is fail', () => {
    const cwd = repoWith('a.test.js');
    const env: Record<string, string | undefined> = { ...process.env, CODEHERE_RERUN_TIMEOUT_MS: '1' };
    delete env.CODEHERE_TEST_CMD;
    delete env.CODEHERE_RERUN_TESTS;
    const r = spawnSync('node', [CLI, 'check', '--json'], { cwd, env, encoding: 'utf8' });
    const out = JSON.parse(r.stdout);
    expect(out.verdict).toBe('fail');
    expect(out.receipt).toContain('`a.test.js`:3');
    expect(r.status).toBe(1);
  });

  it('a weakened test with the re-run turned off is fail, not skipped', () => {
    const cwd = repoWith('a.test.js');
    const env: Record<string, string | undefined> = { ...process.env, CODEHERE_RERUN_TESTS: '0' };
    delete env.CODEHERE_TEST_CMD;
    const r = spawnSync('node', [CLI, 'check', '--json'], { cwd, env, encoding: 'utf8' });
    expect(JSON.parse(r.stdout).verdict).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('a test file name with newlines cannot end the blockquote or the code span', () => {
    const cwd = repoWith('test/x\n\n@octocat [click](www.evil.example)\n\ny.test.js');
    const receipt: string = JSON.parse(check(cwd, '--json').stdout).receipt;
    for (const line of receipt.trim().split('\n')) {
      expect(line.startsWith('>') || line.startsWith('<!--')).toBe(true);
      expect(outsideCode(line)).not.toMatch(/@octocat|\]\(/);
    }
  });

  it('direction overrides and zero-width characters in a file name are replaced (third review, 2026-10-17)', () => {
    const cwd = repoWith('test/bidi‮yp.txt​.py');
    const r = check(cwd, '--json');
    const out = JSON.parse(r.stdout);
    expect(out.weakened.length).toBe(1);
    expect(out.receipt).not.toMatch(/[​‮]/);
    expect(check(cwd).stdout).not.toMatch(/[​‮]/);
  });

  it('the Action fallback receipt replaces direction overrides too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-escape-bidi-'));
    dirs.push(dir);
    const err = join(dir, 'stderr.txt');
    writeFileSync(err, 'bad ref ‮exe.txt⁦\n');
    spawnSync('node', [SUMMARIZE, join(dir, 'missing.json'), err, join(dir, 'receipt.md')], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    expect(readFileSync(join(dir, 'receipt.md'), 'utf8')).not.toMatch(/[‮⁦]/);
  });

  it('terminal escapes in --claim are not printed back', () => {
    const cwd = repoWith('a.test.js');
    const r = check(
      cwd,
      '--proof',
      '--claim',
      'ran a.test.js \u001b]8;;https://evil.example\u0007x\u001b]8;;\u0007 \u001b[2J',
    );
    expect(r.stdout).not.toContain('\u001b');
    expect(r.stdout).not.toContain('\u0007');
  });
});
