import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(__dirname, '../../../action/summarize.mjs');
const MARKER = '<!-- codehere-receipt -->';
const dir = mkdtempSync(join(tmpdir(), 'summarize-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(result: string | null, stderr = '', extraEnv: Record<string, string> = {}) {
  const resultFile = join(dir, 'result.json');
  const errFile = join(dir, 'stderr.txt');
  const receiptFile = join(dir, 'receipt.md');
  const outFile = join(dir, 'output.txt');
  if (result !== null) writeFileSync(resultFile, result);
  else rmSync(resultFile, { force: true });
  writeFileSync(errFile, stderr);
  writeFileSync(outFile, '');
  const r = spawnSync('node', [SCRIPT, resultFile, errFile, receiptFile], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: outFile, ...extraEnv },
  });
  return { status: r.status, output: readFileSync(outFile, 'utf8'), receipt: readFileSync(receiptFile, 'utf8') };
}

describe('action/summarize.mjs', () => {
  it('passes the CLI verdict and receipt through', () => {
    const r = run(JSON.stringify({ verdict: 'fail', receipt: `${MARKER}\n> receipt body` }));
    expect(r.status).toBe(0);
    expect(r.output).toContain('verdict=fail');
    expect(r.receipt).toBe(`${MARKER}\n> receipt body\n`);
  });

  it('reports unverified, never a pass, when the CLI printed nothing usable', () => {
    const r = run(null, 'error: Unknown --base "origin/main": not a ref in this repository.\nat x');
    expect(r.status).toBe(0);
    expect(r.output).toContain('verdict=unverified');
    expect(r.receipt.startsWith(`${MARKER}\n`)).toBe(true);
    expect(r.receipt).toContain("couldn't run the check");
    expect(r.receipt).toContain('Unknown --base');
    expect(r.receipt).not.toContain('at x');
  });

  it('treats a result with no verdict as unverified', () => {
    const r = run('{"kind":"passed"}');
    expect(r.output).toContain('verdict=unverified');
  });

  it('on a pull request, points the reproduce line at the merge ref and names the PR head', () => {
    const receipt = `${MARKER}\n> receipt body\n> Reproduce independently: \`git checkout 410f7fa && codehere check --base main\`\n> Scope: tests`;
    const r = run(JSON.stringify({ verdict: 'pass', receipt }), '', {
      PR_NUMBER: '7',
      PR_HEAD_SHA: 'abcdef1234567890',
    });
    expect(r.receipt).toContain(
      'Reproduce independently: `git fetch origin refs/pull/7/merge && git checkout FETCH_HEAD && codehere check --base main`',
    );
    expect(r.receipt).toContain('PR head `abcdef1`');
    expect(r.receipt).toContain('merge `410f7fa`');
    expect(r.receipt).not.toContain('git checkout 410f7fa');
  });

  it('leaves the reproduce line alone when there is no pull request in the environment', () => {
    const receipt = `${MARKER}\n> Reproduce independently: \`git checkout 410f7fa && codehere check\``;
    const r = run(JSON.stringify({ verdict: 'pass', receipt }));
    expect(r.receipt).toContain('git checkout 410f7fa && codehere check');
  });
});
