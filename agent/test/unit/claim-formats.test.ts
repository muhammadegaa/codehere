/**
 * AI summaries name test files in markdown and runner syntax. Each of these used to be missed, so a missing
 * file named this way was never reported (cold review, 2026-10-16).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractClaimedTestFiles,
  findMissingClaimedTests,
} from '../../src/application/use-cases/check-claimed-tests.js';

describe('extractClaimedTestFiles · formats AI summaries use', () => {
  it('markdown bold and italics', () => {
    expect(extractClaimedTestFiles('Added **auth.test.js** and _cart.spec.ts_')).toEqual([
      'auth.test.js',
      'cart.spec.ts',
    ]);
  });

  it('pytest node ids', () => {
    expect(extractClaimedTestFiles('ran tests/test_x.py::test_y and tests/test_z.py::TestA::test_b')).toEqual([
      'tests/test_x.py',
      'tests/test_z.py',
    ]);
  });

  it('a line number after the name', () => {
    expect(extractClaimedTestFiles('see src/b.spec.ts:42 and src/c.test.js:7:3')).toEqual([
      'src/b.spec.ts',
      'src/c.test.js',
    ]);
  });

  it('brackets, angle brackets and a trailing ellipsis', () => {
    expect(extractClaimedTestFiles('[c.test.js] <d.test.js> then i.test.js…')).toEqual([
      'c.test.js',
      'd.test.js',
      'i.test.js',
    ]);
  });

  it('still reads the plain forms', () => {
    expect(extractClaimedTestFiles('Tests in `test/webhook.test.js` pass; also test_api.py.')).toEqual([
      'test/webhook.test.js',
      'test_api.py',
    ]);
  });
});

describe('findMissingClaimedTests · a missing file named in bold is reported', () => {
  it('reports **missing.test.js** when it is not in the repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-claimfmt-'));
    try {
      writeFileSync(join(dir, 'present.test.js'), '');
      expect(findMissingClaimedTests(dir, 'Added **missing.test.js** and **present.test.js**, all pass')).toEqual([
        'missing.test.js',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
