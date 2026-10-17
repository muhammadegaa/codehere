/**
 * Always-true and skip forms that each weakened a failing test and passed unflagged (third cold review, 2026-10-17).
 */
import { describe, expect, it } from 'vitest';
import { parseTestWeakening } from '../../src/application/use-cases/detect-test-weakening.js';

/** A one-hunk diff of an existing test file that adds `line`. */
const diff = (file: string, line: string) =>
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -3 +3 @@\n-    old\n+${line}\n`;
const why = (file: string, line: string) => parseTestWeakening(diff(file, line)).map((w) => w.why);

describe('parseTestWeakening · more always-true forms', () => {
  it.each([
    ['test_a.py', '        self.assertTrue(True)'],
    ['test_a.py', '    assert True, "ok"'],
    ['test_a.py', '    assert(True)'],
    ['test_a.py', '        self.assertEqual(2, 2)'],
    ['a.test.js', '  expect(x).toBe(x);'],
    ['a.test.js', "  expect('a').toEqual('a')"],
  ])('%s: %s', (file, line) => {
    expect(why(file, line)).toEqual(['trivial-assertion']);
  });
});

describe('parseTestWeakening · more skip forms', () => {
  it.each([
    ['test_a.py', '@pytest.mark.skipif(True, reason="flaky")'],
    ['a.test.js', "test.only('sum', () => {"],
    ['a.test.js', "  it.only('sum', () => {"],
    ['a.test.js', "fit('sum', () => {"],
    ['a.test.js', "fdescribe('suite', () => {"],
  ])('%s: %s', (file, line) => {
    expect(why(file, line)).toEqual(['skipped']);
  });
});

describe('parseTestWeakening · real checks stay unflagged', () => {
  it.each([
    ['test_a.py', '    assert total == expected'],
    ['test_a.py', '        self.assertEqual(result, 2)'],
    ['test_a.py', '@pytest.mark.skipif(sys.platform == "win32", reason="posix only")'],
    ['a.test.js', '  expect(sum(1, 1)).toBe(2);'],
    ['a.test.js', "  expect(x).toBe(y)"],
    ['a.test.js', "const only = list.filter((t) => t.only);"],
  ])('%s: %s', (file, line) => {
    expect(why(file, line)).toEqual([]);
  });
});
