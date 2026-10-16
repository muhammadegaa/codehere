/**
 * parseTestSummary: test results must be read across runners, not just node ones, so "trust the result"
 * holds whatever the repo uses. The primary "N passed/failed" path is unchanged; these lock runner coverage,
 * including the python-unittest "Ran N tests" format.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseTestSummary } = require('../../dist/infrastructure/orchestration/artifacts-extractor.js') as {
  parseTestSummary: (stdout: string) => { passed: number; failed: number; durationMs?: number } | undefined;
};

// A2 (PRODUCT_STATE §0 NEXT #2) — test results must be captured across runners,
// not just node ones, so "trust the result" holds whatever the repo uses. The
// primary "N passed/failed" path is unchanged; these lock runner coverage,
// including the python-unittest "Ran N tests" format the dogfood found dropped.
describe('parseTestSummary · runner coverage', () => {
  it('vitest / jest "Tests 47 passed, 1 failed"', () => {
    expect(parseTestSummary('Test Files  3 passed (3)\nTests  47 passed, 1 failed (48)\nDuration  1.20s')).toEqual({
      passed: 47,
      failed: 1,
      durationMs: 1200,
    });
  });

  it('pytest "5 passed, 1 failed in 0.3s"', () => {
    expect(parseTestSummary('===== 5 passed, 1 failed in 0.30s =====')).toMatchObject({ passed: 5, failed: 1 });
  });

  it('mocha "12 passing / 2 failing"', () => {
    expect(parseTestSummary('  12 passing (340ms)\n  2 failing')).toMatchObject({ passed: 12, failed: 2 });
  });

  it('cargo "test result: ok. 5 passed; 0 failed"', () => {
    expect(parseTestSummary('test result: ok. 5 passed; 0 failed; 0 ignored')).toMatchObject({ passed: 5, failed: 0 });
  });

  it('python unittest OK — "Ran 5 tests" + "OK"', () => {
    expect(parseTestSummary('.....\n----------\nRan 5 tests in 0.012s\n\nOK')).toEqual({
      passed: 5,
      failed: 0,
      durationMs: 12,
    });
  });

  it('python unittest FAILED — counts failures + errors as failed', () => {
    expect(parseTestSummary('Ran 8 tests in 0.50s\n\nFAILED (failures=2, errors=1)')).toMatchObject({
      passed: 5,
      failed: 3,
    });
  });

  it('dotnet reversed order "Passed: 5, Failed: 0"', () => {
    expect(parseTestSummary('Passed!  - Failed:     0, Passed:     5, Skipped: 0, Total: 5')).toMatchObject({
      passed: 5,
      failed: 0,
    });
  });

  it('returns undefined when there is no test summary', () => {
    expect(parseTestSummary('just some build output\nDone in 2s')).toBeUndefined();
  });

  it('returns undefined on empty input', () => {
    expect(parseTestSummary('')).toBeUndefined();
  });
});
