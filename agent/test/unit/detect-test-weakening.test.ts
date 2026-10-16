import { describe, it, expect } from 'vitest';
import { parseTestWeakening } from '../../src/application/use-cases/detect-test-weakening.js';

const diff = (file: string, added: string[], removed: string[] = [], isNew = false) =>
  [
    `diff --git a/${file} b/${file}`,
    isNew ? '--- /dev/null' : `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -3,${removed.length} +3,${added.length} @@`,
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
  ].join('\n');

describe('parseTestWeakening', () => {
  it('flags assert True added to an existing python test', () => {
    const found = parseTestWeakening(diff('test_total.py', ['    assert True'], ['    assert total([1, 2, 3]) == 6']));
    expect(found).toEqual([{ file: 'test_total.py', line: 3, why: 'trivial-assertion', text: 'assert True' }]);
  });

  it('flags trivial assertions in js, php and go-style tests', () => {
    const js = parseTestWeakening(diff('src/a.test.ts', ['  expect(true).toBe(true);']));
    const node = parseTestWeakening(diff('test/a.test.js', ['  assert.ok(true);']));
    const php = parseTestWeakening(diff('tests/BookingTest.php', ['        $this->assertTrue(true);']));
    expect([js[0]?.why, node[0]?.why, php[0]?.why]).toEqual([
      'trivial-assertion',
      'trivial-assertion',
      'trivial-assertion',
    ]);
  });

  it('flags self-equal assertions', () => {
    expect(parseTestWeakening(diff('test_x.py', ['    assert 1 == 1']))[0]?.why).toBe('trivial-assertion');
    expect(parseTestWeakening(diff('test_x.py', ['    assert x == x']))[0]?.why).toBe('trivial-assertion');
  });

  it('flags skip and xfail markers added to a test', () => {
    const py = parseTestWeakening(diff('test_x.py', ['@pytest.mark.skip(reason="later")', '@pytest.mark.xfail']));
    const js = parseTestWeakening(diff('a.spec.js', ["  it.skip('books a slot', () => {});", "  xit('x', () => {});"]));
    const go = parseTestWeakening(diff('svc_test.go', ['\tt.Skip("flaky")']));
    expect(py.map((f) => f.why)).toEqual(['skipped', 'skipped']);
    expect(js.map((f) => f.why)).toEqual(['skipped', 'skipped']);
    expect(go.map((f) => f.why)).toEqual(['skipped']);
  });

  it('reports the line number in the new file', () => {
    const d = [
      'diff --git a/test_x.py b/test_x.py',
      '--- a/test_x.py',
      '+++ b/test_x.py',
      '@@ -10,0 +10,2 @@',
      '+def test_y():',
      '+    assert True',
    ].join('\n');
    expect(parseTestWeakening(d)[0]?.line).toBe(11);
  });

  it('does not flag real assertions added to a test', () => {
    expect(parseTestWeakening(diff('test_total.py', ['    assert total([]) == 0']))).toEqual([]);
    expect(parseTestWeakening(diff('a.test.js', ['  expect(total([])).toBe(0);']))).toEqual([]);
  });

  it('does not flag a trivial assertion in a non-test file', () => {
    expect(parseTestWeakening(diff('app.py', ['    assert True']))).toEqual([]);
    expect(parseTestWeakening(diff('src/latest.ts', ['it.skip(x)']))).toEqual([]);
  });

  it('does not flag a newly created test file', () => {
    expect(parseTestWeakening(diff('test_new.py', ['    assert True'], [], true))).toEqual([]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseTestWeakening('')).toEqual([]);
  });
});

describe('parseTestWeakening · assertions that never run', () => {
  it('flags a skip passed as an option', () => {
    const d = (line: string) => parseTestWeakening(diff('total.test.js', [line]));
    expect(d("test('total', { skip: true }, () => {});")[0]?.why).toBe('skipped');
    expect(d("test('total', { skip: 'flaky' }, () => {});")[0]?.why).toBe('skipped');
    expect(d("test('total', { todo: true }, () => {});")[0]?.why).toBe('skipped');
  });

  it('does not flag a conditional skip', () => {
    const d = parseTestWeakening(
      diff('total.test.js', ["test('t', { skip: process.platform === 'win32' }, () => {});"]),
    );
    expect(d).toEqual([]);
  });

  it('flags an assertion that was commented out in the same change', () => {
    const js = parseTestWeakening(
      diff('total.test.js', ['  // assert.equal(total([1, 2, 3]), 6);'], ['  assert.equal(total([1, 2, 3]), 6);']),
    );
    expect(js).toEqual([
      { file: 'total.test.js', line: 3, why: 'commented-out', text: '// assert.equal(total([1, 2, 3]), 6);' },
    ]);
    const py = parseTestWeakening(
      diff('test_total.py', ['    # assert total([1, 2, 3]) == 6'], ['    assert total([1, 2, 3]) == 6']),
    );
    expect(py[0]?.why).toBe('commented-out');
  });

  it('flags an assertion commented out of a one-line test', () => {
    const found = parseTestWeakening(
      diff(
        'total.test.js',
        ['  // assert.equal(total([1, 2, 3]), 6);'],
        ["test('total', () => assert.equal(total([1, 2, 3]), 6));"],
      ),
    );
    expect(found[0]?.why).toBe('commented-out');
  });

  it('does not flag a new comment that is not a commented-out assertion', () => {
    expect(parseTestWeakening(diff('total.test.js', ['  // assert the total is correct']))).toEqual([]);
    expect(parseTestWeakening(diff('total.test.js', ['  // log(total)'], ['  log(total)']))).toEqual([]);
  });

  it('flags a bare return added above an assertion', () => {
    const lines = [
      "import test from 'node:test';",
      "test('total', () => {",
      '  return;',
      '  assert.equal(total([1, 2, 3]), 6);',
      '});',
    ];
    const found = parseTestWeakening(diff('total.test.js', ['  return;']), () => lines);
    expect(found).toEqual([{ file: 'total.test.js', line: 3, why: 'unreachable-assertion', text: 'return;' }]);
  });

  it('does not flag a return that sits under a condition', () => {
    const lines = [
      "import test from 'node:test';",
      "test('total', () => {",
      '  if (xs.length === 0) {',
      '    return;',
      '  }',
      '  assert.equal(total(xs), 6);',
      '});',
    ];
    expect(parseTestWeakening(diff('total.test.js', ['    return;']).replace('+3,', '+4,'), () => lines)).toEqual([]);
  });

  it('does not flag a return with no assertion after it, or when the file cannot be read', () => {
    const after = ['  return;', '});', 'test("b", () => {})'];
    expect(parseTestWeakening(diff('total.test.js', ['  return;']), () => after)).toEqual([]);
    expect(parseTestWeakening(diff('total.test.js', ['  return;']))).toEqual([]);
    expect(parseTestWeakening(diff('total.test.js', ['  return;']), () => null)).toEqual([]);
  });
});
