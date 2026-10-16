import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractClaimedTestFiles,
  findMissingClaimedTests,
} from '../../src/application/use-cases/check-claimed-tests.js';

const dirs: string[] = [];
function repo(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'claimed-tests-'));
  dirs.push(dir);
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), '');
  }
  return dir;
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('extractClaimedTestFiles', () => {
  it('finds js, ts, python, go and php test paths in prose', () => {
    const text =
      'Ran `test/webhook.test.js`, src/a.spec.ts and tests/test_total.py (all pass). Also svc/handler_test.go; app/BookingTest.php.';
    expect(extractClaimedTestFiles(text)).toEqual([
      'test/webhook.test.js',
      'src/a.spec.ts',
      'tests/test_total.py',
      'svc/handler_test.go',
      'app/BookingTest.php',
    ]);
  });

  it('strips trailing punctuation and a leading ./, and dedupes', () => {
    expect(extractClaimedTestFiles('./test/a.test.js, then test/a.test.js.')).toEqual(['test/a.test.js']);
  });

  it('ignores prose with no test file, absolute paths and parent escapes', () => {
    expect(extractClaimedTestFiles('all tests pass, backlog 0')).toEqual([]);
    expect(extractClaimedTestFiles('see /etc/passwd.test.js and ../x/a.test.js')).toEqual([]);
  });
});

describe('findMissingClaimedTests', () => {
  it('reports a claimed file that is nowhere in the repo', () => {
    const cwd = repo(['package.json', 'test/other.test.js']);
    expect(findMissingClaimedTests(cwd, 'ran test/webhook.test.js, all pass')).toEqual(['test/webhook.test.js']);
  });

  it('accepts a claimed file that exists', () => {
    const cwd = repo(['test/webhook.test.js']);
    expect(findMissingClaimedTests(cwd, 'ran test/webhook.test.js')).toEqual([]);
  });

  it('accepts a bare name or a different folder when a file with that name exists', () => {
    const cwd = repo(['src/deep/webhook.test.js']);
    expect(findMissingClaimedTests(cwd, 'webhook.test.js passes')).toEqual([]);
    expect(findMissingClaimedTests(cwd, 'tests/webhook.test.js passes')).toEqual([]);
  });

  it('does not look inside node_modules', () => {
    const cwd = repo(['node_modules/pkg/webhook.test.js']);
    expect(findMissingClaimedTests(cwd, 'ran webhook.test.js')).toEqual(['webhook.test.js']);
  });

  it('returns nothing when the claim names no test file', () => {
    expect(findMissingClaimedTests(repo(['a.js']), 'all green')).toEqual([]);
  });
});
