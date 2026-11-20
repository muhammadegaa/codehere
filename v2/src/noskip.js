// Changed expected values, replaced tests and dropped test cases, read from a diff of test files.
// Ported from noskip 1.2.0, src/rules/tests.js and src/util.js (github.com/DariusHQ/noskip), with the
// findings reworded for Codehere and the file model built from a unified diff plus the files as they are now.
// Only the finish check runs this: it is the one caller that can read the files.
//
// MIT License
//
// Copyright (c) 2026 DariusHQ
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { unquotePath } from './gitpath.js';

// ---------- helpers (noskip src/util.js) ----------

const normalizeLine = (text) => text.trim().replace(/\s+/g, ' ');
const isCommentLine = (text) => /^\s*(?:\/\/|\/\*|\*(?:\s|\/|$)|<!--|#(?![[!]|pragma\b|if\b|include\b|define\b|expect\b|require\b))/.test(text);
const truncate = (text, max = 120) => {
  const t = text.trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};

function splitArgs(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      cur += ch;
      if (ch === '\\') cur += text[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') (quote = ch), (cur += ch);
    else if (ch === '(' || ch === '[' || ch === '{') depth++, (cur += ch);
    else if (ch === ')' || ch === ']' || ch === '}') depth--, (cur += ch);
    else if (ch === ',' && depth === 0) out.push(cur.trim()), (cur = '');
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function matchParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

// ---------- test names (noskip src/rules/tests.js) ----------

const EXT_LANG = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', mts: 'js', cts: 'js', vue: 'js', svelte: 'js', astro: 'js',
  py: 'py', pyi: 'py', go: 'go', rs: 'rs', java: 'java', kt: 'java', kts: 'java', groovy: 'java', scala: 'java', cs: 'cs',
  rb: 'rb', php: 'php', swift: 'swift', dart: 'dart', c: 'c', cc: 'c', cpp: 'c', cxx: 'c', h: 'c', hh: 'c', hpp: 'c', hxx: 'c', ex: 'ex', exs: 'ex',
};
export const languageOf = (p) => EXT_LANG[(/\.([^./]+)$/.exec(p) || [])[1]?.toLowerCase()] ?? null;

const STR = String.raw`(['"\x60])((?:\\.|(?!\1)[^\\])*)\1`;
const NAME_PATTERNS = {
  js: [
    {
      re: new RegExp(
        String.raw`\b(?:it|test|specify)(?:\s*\.\s*(?:only|skip|concurrent|sequential|failing|fails|todo|fixme|skipIf\([^)]{0,1000}\)|runIf\([^)]{0,1000}\)|each\s*(?:\([^)]{0,1000}\)|\x60[^\x60]*\x60)))*\s*\(\s*` + STR,
        'g',
      ),
      pick: (m) => m[2],
    },
  ],
  py: [{ re: /^[ \t]*(?:async[ \t]+)?def[ \t]+(test\w*)[ \t]*\(/gm }],
  go: [{ re: /^func\s+(?:\([^)]{0,1000}\)\s*)?((?:Test|Benchmark|Fuzz|Example)\w*)\s*\(/gm }, { re: /\bt\.Run\(\s*"((?:\\.|[^"\\])*)"/g }, { re: /\bname:\s*"((?:\\.|[^"\\])*)"/g }],
  rs: [{ re: /#\[(?:[\w:]+::)?test\b[^\]]{0,1000}\]\s*(?:#\[[^\]]{0,1000}\]\s*){0,20}(?:pub(?:\([^)\n]{0,200}\))?\s+)?(?:async\s+)?fn\s+(\w+)/g }],
  java: [
    { re: /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b[^\n]{0,1000}\n(?:[ \t]*(?:@[^\n]{0,1000})?\n){0,20}[ \t]*(?:(?:public|private|protected|internal|open|override|suspend|static|final)\s+)*(?:void\s+|fun\s+)?`?([^`(\s][^`(\n]{0,199}?)`?[ \t]{0,40}\(/g },
    { re: /\bvoid\s+(test\w+)\s*\(/g },
  ],
  cs: [{ re: /\[\s*(?:Fact|Theory|Test|TestMethod|TestCase|TestCaseSource|SkippableFact)\b[^\]]{0,1000}\]\s*(?:\[[^\]]{0,1000}\]\s*){0,20}(?:(?:public|private|protected|internal|async|static|virtual|override)\s+)*[\w<>[\],.?]+\s+(\w+)\s*\(/g }],
  rb: [{ re: new RegExp(String.raw`^[ \t]*(?:it|specify|scenario|example|test)[ \t]*(?:\(\s*)?` + STR, 'gm'), pick: (m) => m[2] }, { re: /^[ \t]*def\s+(test_\w+)/gm }],
  php: [{ re: /function\s+(test\w+)\s*\(/g }, { re: /(?:#\[Test\]|@test\b)[^]{0,200}?function\s+(\w+)\s*\(/g }, { re: new RegExp(String.raw`\b(?:it|test)\s*\(\s*` + STR, 'g'), pick: (m) => m[2] }],
  swift: [{ re: /func\s+(test\w+)\s*\(/g }, { re: /@Test\b(?:\([^)]{0,1000}\))?\s*(?:@\w+(?:\([^)]{0,1000}\))?\s*){0,20}func\s+(\w+)\s*\(/g }],
  dart: [{ re: new RegExp(String.raw`\b(?:test|testWidgets)\s*\(\s*` + STR, 'g'), pick: (m) => m[2] }],
  c: [{ re: /\b(?:TEST|TEST_F|TEST_P|TYPED_TEST)\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, pick: (m) => `${m[1]}.${m[2]}` }, { re: /\bTEST_CASE\s*\(\s*"((?:\\.|[^"\\])*)"/g }],
  ex: [{ re: /\btest\s+"((?:\\.|[^"\\])*)"/g }],
};

// Each test name in the text with where its match starts, pattern by pattern.
function* nameMatches(text, lang) {
  if (!text) return;
  for (const { re, pick } of NAME_PATTERNS[lang] ?? []) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = (pick ? pick(m) : m[m.length - 1] ?? m[1])?.trim();
      if (name) yield [m.index, name, m.index + m[0].length];
    }
  }
}

function extractTestNames(text, lang) {
  const names = new Map();
  for (const [index, name] of nameMatches(text, lang)) {
    const entry = names.get(name);
    if (entry) entry.count++;
    else names.set(name, { count: 1, index });
  }
  return names;
}

const NAME_STOPWORDS = new Set(['a', 'an', 'the', 'is', 'are', 'it', 'to', 'of', 'on', 'in', 'and', 'or', 'when', 'if', 'with', 'for', 'should', 'be', 'not', 'still', 'that', 'does', 'do', 'test']);
const nameTokens = (name) => new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t)));

// Two test names describe the same behaviour: a test split or moved under a new name, not one that went.
function similarNames(a, b) {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.size || !B.size) return false;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared >= 2 && shared / Math.min(A.size, B.size) >= 0.5;
}

// ---------- assertions ----------

const STRONG = new Set([
  'toBe', 'toEqual', 'toStrictEqual', 'toMatchObject', 'toHaveBeenCalledWith', 'toHaveBeenNthCalledWith',
  'toHaveBeenLastCalledWith', 'toHaveBeenCalledTimes', 'toHaveLength', 'toHaveProperty', 'toThrow', 'toThrowError',
  'toMatch', 'toContainEqual', 'toBeCloseTo', 'equal', 'equals', 'eql', 'eq', 'isEqualTo', 'containsExactly',
  'hasSize', 'isSameAs', 'assertEqual', 'assertEquals', 'assertSame', 'assertIs', 'assertDictEqual',
  'assertListEqual', 'assertCountEqual', 'assertAlmostEqual', 'assertRaises', 'assertStrictEqual', 'assert_equal',
  'assert_eq!', 'Equal', 'Equals', 'AreEqual', 'Same', 'Exactly', 'EqualValues', 'StrictEqual', 'deepEqual',
  'deepStrictEqual', 'strictEqual', 'XCTAssertEqual', 'EXPECT_EQ', 'ASSERT_EQ', 'to eq', 'to eql', 'to equal',
  'to match', 'to raise_error', '==',
]);
const WEAK = new Set([
  'toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeInstanceOf', 'toBeTypeOf', 'toHaveBeenCalled', 'not.toBeNull',
  'not.toBeUndefined', 'ok', 'exist', 'exists', 'isNotNull', 'isNotEmpty', 'isInstanceOf', 'assertTrue', 'assertFalse',
  'assertIsNotNone', 'assertIsInstance', 'assertIn', 'assertNotNull', 'assertNotNil', 'assert_not_nil', 'assert',
  'assert!', 'NotNil', 'NotNull', 'NotEmpty', 'True', 'IsNotNull', 'IsTrue', 'XCTAssertNotNil', 'XCTAssertTrue',
  'EXPECT_TRUE', 'ASSERT_TRUE', 'to be_truthy', 'to be_present', 'not_to be_nil', 'to_not be_nil', 'is not',
  'truthy',
]);

const norm = (s) => normalizeLine(String(s ?? '')).replace(/;$/, '').replace(/\s*,\s*$/, '');

function parseExpectStyle(t, opener) {
  const m = opener.exec(t);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const close = matchParen(t, open);
  if (close < 0) return null;
  const subject = t.slice(open + 1, close);
  const rest = t.slice(close + 1).replace(/->/g, '.');
  let mm = /^\s*((?:\.\s*(?:not|resolves|rejects|to|be|been|is|deep|own|nested|and|has|have)\s*)*)\.\s*(\w+)\s*\(/.exec(rest);
  if (mm) {
    const argOpen = mm[0].length - 1;
    const argClose = matchParen(rest, argOpen);
    const chain = mm[1].replace(/\s+/g, '').replace(/^\./, '');
    const matcher = (chain ? chain + '.' : '') + mm[2];
    // a matcher whose call does not close on the line is an assertion a formatter spread over lines: its subject and
    // matcher are still compared, its arguments are not (rounds 21 and 22)
    if (argClose < 0) return { kind: 'expect', subject: norm(subject), matcher, args: null };
    const args = rest.slice(argOpen + 1, argClose);
    return { kind: 'expect', subject: norm(subject), matcher, args: norm(args) };
  }
  mm = /^\s*\.\s*(to|not_to|to_not)\s+(\w+)\s*\(?(.*?)\)?\s*$/.exec(rest);
  if (mm) {
    // RSpec's to eq( spread over lines: the same (round 22)
    const paren = /^\s*\.\s*(?:to|not_to|to_not)\s+\w+\s*\(/.exec(rest);
    const unclosed = paren && matchParen(rest, paren[0].length - 1) < 0;
    return { kind: 'expect', subject: norm(subject), matcher: `${mm[1]} ${mm[2]}`, args: unclosed ? null : norm(mm[3]) };
  }
  return null;
}

const CALL_OPENER =
  /(?:^|[^\w.$])((?:self\s*\.\s*|this\s*\.\s*|\$this\s*->\s*)?(?:assert[A-Z_]\w*|assert_\w+|assert_eq!|assert_ne!|assert!)|(?:assert|Assert|require)\s*\.\s*\w+|XCTAssert\w*|(?:EXPECT|ASSERT)_[A-Z_]+)\s*\(/;

function parseCallStyle(t) {
  const m = CALL_OPENER.exec(t);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const close = matchParen(t, open);
  if (close < 0) return null;
  let fn = m[1].replace(/\s+/g, '').replace(/^(?:self\.|this\.|\$this->)/, '');
  let args = splitArgs(t.slice(open + 1, close)).map(norm);
  if (/^(?:assert|require)\./.test(fn) && /^[A-Z]/.test(fn.split('.')[1] ?? '') && args[0] === 't') args = args.slice(1); // Go testify
  fn = fn.replace(/^(?:assert|Assert|require)\./, '');
  return { kind: 'call', matcher: fn, args };
}

// whether every bracket a Python line opens closes on it, outside strings and before a # comment
function balanced(t) {
  let depth = 0;
  for (let i = 0, q = ''; i < t.length; i++) {
    const c = t[i];
    if (q) q = c === '\\' ? (i++, q) : c === q ? '' : q;
    else if (c === '#') break;
    else if (c === '"' || c === "'" || c === '`') q = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  return depth === 0;
}

function parsePyAssert(t) {
  const m = /^assert\s+(.+)$/.exec(t);
  if (!m) return null;
  // a # comment is not part of the assert (round 23)
  let body = m[1];
  for (let i = 0, q = ''; i < body.length; i++) {
    const c = body[i];
    if (q) q = c === '\\' ? (i++, q) : c === q ? '' : q;
    else if (c === '"' || c === "'") q = c;
    else if (c === '#') {
      body = body.slice(0, i).trimEnd();
      break;
    }
  }
  const cond = splitArgs(body)[0] ?? '';
  // a condition black spread over lines: its value is not compared (rounds 21 and 22); only the condition counts, not
  // a message wrapped after it (round 23)
  const open = !balanced(cond);
  const op = /\s(==|!=|<=|>=|is not|is|not in|in)\s/.exec(cond);
  if (!op) return { kind: 'py', subject: norm(cond), matcher: 'assert', args: '' };
  const left = cond.slice(0, op.index);
  const right = cond.slice(op.index + op[0].length);
  if (op[1] === 'is not' && /^None$/.test(right.trim())) return { kind: 'py', subject: norm(left), matcher: 'is not', args: 'None' };
  return { kind: 'py', subject: norm(left), matcher: op[1], args: open ? null : norm(right) };
}

const KV = /^\s*(?:(?:const|let|var|val|final|auto|my)\s+)?["']?((?:want|wanted|expected|expect|exp|golden|answer)\w*)["']?\s*(?::=|=|:)\s*(.+?)\s*[,;]?\s*$/i;

function parseAssertion(text) {
  const t = text.trim().replace(/;\s*$/, '');
  if (!t || isCommentLine(t)) return null;
  return (
    parseExpectStyle(t, /\bexpect\s*\(/) ||
    parseExpectStyle(t, /\bassertThat\s*\(/) ||
    parseCallStyle(t) ||
    parsePyAssert(t) ||
    (() => {
      const m = KV.exec(t);
      return m ? { kind: 'kv', subject: m[1].toLowerCase(), matcher: 'kv', args: norm(m[2]) } : null;
    })()
  );
}

const LITERALISH = /^(?:-?\d[\d_.]*n?|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`[^`$]*`|true|false|null|undefined|None|True|False|nil|\/.+\/[a-z]*|\{[^()]*\}|\[[^()]*\]|[A-Z][A-Z0-9_]+)$/;

// The expression with its literals blanked out: `count + 3` and `count + 4` share a shape.
const shapeOf = (s) => s.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, 'S').replace(/\b\d+(?:\.\d+)?n?\b/g, '#');

// The expectation moved (`46` to `47`, `n + 3` to `n + 4`), as opposed to the expression computing the actual value.
const goalpostMoved = (before, after) => LITERALISH.test(before) || LITERALISH.test(after) || shapeOf(before) === shapeOf(after);

const OPPOSITES = new Map(
  [
    ['assertTrue', 'assertFalse'], ['assertEqual', 'assertNotEqual'], ['assertEquals', 'assertNotEquals'],
    ['assertIs', 'assertIsNot'], ['assertIn', 'assertNotIn'], ['assertIsNone', 'assertIsNotNone'],
    ['assertNull', 'assertNotNull'], ['assertSame', 'assertNotSame'], ['assertRegex', 'assertNotRegex'],
    ['assertIsInstance', 'assertNotIsInstance'], ['assert_equal', 'refute_equal'], ['assert_nil', 'refute_nil'],
    ['assert_eq!', 'assert_ne!'], ['equal', 'notEqual'], ['strictEqual', 'notStrictEqual'], ['deepEqual', 'notDeepEqual'],
    ['deepStrictEqual', 'notDeepStrictEqual'], ['throws', 'doesNotThrow'], ['rejects', 'doesNotReject'],
    ['match', 'doesNotMatch'], ['True', 'False'], ['Equal', 'NotEqual'], ['Nil', 'NotNil'], ['Error', 'NoError'],
    ['Empty', 'NotEmpty'], ['Contains', 'NotContains'], ['Zero', 'NotZero'], ['IsTrue', 'IsFalse'],
    ['AreEqual', 'AreNotEqual'], ['IsNull', 'IsNotNull'], ['XCTAssertTrue', 'XCTAssertFalse'],
    ['XCTAssertEqual', 'XCTAssertNotEqual'], ['XCTAssertNil', 'XCTAssertNotNil'], ['EXPECT_TRUE', 'EXPECT_FALSE'],
    ['ASSERT_TRUE', 'ASSERT_FALSE'], ['EXPECT_EQ', 'EXPECT_NE'], ['ASSERT_EQ', 'ASSERT_NE'],
  ].flatMap(([a, b]) => [[a, b], [b, a]]),
);

function negated(a, b) {
  const strip = (s) => {
    const m = /^(?:!\s*|not\s+)(.+)$/.exec(s);
    return m ? m[1].replace(/^\((.*)\)$/, '$1').trim() : null;
  };
  const unwrap = (s) => s.replace(/^\((.*)\)$/, '$1').trim();
  return strip(a) === unwrap(b) || strip(b) === unwrap(a);
}

// `f(x)` to `f(x, opts)`: the same function, called with arguments added or dropped at the end.
function callArgsExtended(before, after) {
  const call = (s) => {
    const m = /^([\w$.]+)\s*\(/.exec(s);
    if (!m) return null;
    const close = matchParen(s, m[0].length - 1);
    if (close !== s.length - 1) return null;
    return { callee: m[1], args: splitArgs(s.slice(m[0].length, close)).map(norm).filter(Boolean) };
  };
  const b = call(before);
  const a = call(after);
  if (!b || !a || b.callee !== a.callee || b.args.length === a.args.length) return false;
  const [short, long] = b.args.length < a.args.length ? [b.args, a.args] : [a.args, b.args];
  return short.every((x, i) => x === long[i]);
}

// A removed assertion against an added one: null, or { type, what, from, to }.
// type 'weakened' or 'changed'; what says which change, for the finding's wording.
const pair = (type, what, from, to) => ({ type, what, from: truncate(from, 50), to: truncate(to, 50) });
function compareAssertions(r, a) {
  if (r.kind === 'call' && a.kind === 'call') {
    const showCall = (x) => `${x.matcher}(${x.args.join(', ')})`;
    if (r.matcher === a.matcher && r.args.length === a.args.length && r.args.length >= 2) {
      const diffs = [0, 1].filter((i) => r.args[i] !== a.args[i]);
      if (diffs.length !== 1) return null;
      const i = diffs[0];
      if (goalpostMoved(r.args[i], a.args[i])) return pair('changed', 'expected', r.args[i], a.args[i]);
      return callArgsExtended(r.args[i], a.args[i]) ? pair('changed', 'call', r.args[i], a.args[i]) : null;
    }
    if (r.matcher === a.matcher && r.args.length === 1 && a.args.length === 1 && negated(r.args[0], a.args[0])) return pair('changed', 'flipped', showCall(r), showCall(a));
    if (OPPOSITES.get(r.matcher) === a.matcher && r.args.length === a.args.length && r.args.every((x, i) => x === a.args[i])) return pair('changed', 'flipped', showCall(r), showCall(a));
    if (STRONG.has(r.matcher) && WEAK.has(a.matcher) && a.args.some((x) => r.args.slice(0, 2).includes(x))) return pair('weakened', 'weakened', `${r.matcher}(…)`, `${a.matcher}(…)`);
    return null;
  }
  if (r.kind === 'py' && a.kind === 'py' && r.matcher === 'assert' && a.matcher === 'assert' && negated(r.subject, a.subject)) return pair('changed', 'flipped', `assert ${r.subject}`, `assert ${a.subject}`);
  if (r.kind === a.kind && r.kind !== 'kv' && r.subject !== a.subject && r.matcher === a.matcher && r.args !== null && r.args === a.args && callArgsExtended(r.subject, a.subject)) return pair('changed', 'call', r.subject, a.subject);
  if (r.kind !== a.kind || r.subject === undefined || r.subject !== a.subject) return null;
  if (r.kind === 'kv') return r.args === a.args || !goalpostMoved(r.args, a.args) ? null : pair('changed', 'expected', `${r.subject} ${r.args}`, `${a.subject} ${a.args}`);
  if (r.matcher === a.matcher) {
    // a call that does not close always had arguments, so one with none now lost them (round 23)
    if (r.args === null && a.args === '') return pair('weakened', 'weakened', `${r.matcher}(…)`, `${a.matcher}()`);
    if (r.args === a.args || r.args === null || a.args === null) return null;
    if (a.args === '' && r.args !== '') return pair('weakened', 'weakened', `${r.matcher}(${truncate(r.args, 40)})`, `${a.matcher}()`);
    return pair('changed', 'expected', r.args, a.args);
  }
  const strongOld = STRONG.has(r.matcher) || STRONG.has(r.matcher.replace(/^not\./, ''));
  const weakNew = WEAK.has(a.matcher) || (r.kind === 'py' && (a.matcher === 'assert' || a.matcher === 'is not'));
  const show = (x) => (x.kind === 'py' ? `assert ${x.subject}${x.matcher === 'assert' ? '' : ` ${x.matcher} ${truncate(x.args ?? '…', 40)}`}` : `${x.matcher}(${truncate(x.args ?? '…', 40)})`);
  if (strongOld && weakNew) return pair('weakened', 'weakened', show(r), show(a));
  return pair('changed', 'assertion', show(r), show(a));
}

// ---------- test tables (table-driven tests, parametrize lists, `for (x of [..])`) ----------

const STRING_SRC = String.raw`'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"`;
const LITERAL_SRC = String.raw`${STRING_SRC}|-?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?|\b(?:true|false|null|undefined|None|True|False|nil)\b`;
const ROW_TOKEN = new RegExp(String.raw`(\s+)|((?:[A-Za-z_$][\w$]*|${STRING_SRC})\s*:(?!:))|(${LITERAL_SRC})|([[\](){},;])`, 'y');

// A line that is only data, such as `[1900, true],`, `(1900, True),`, `{ in: 5, want: 120 },` or `1900,`.
function dataRow(text) {
  const t = text.trim();
  if (!t || !(/^[[({]/.test(t) || /,$/.test(t))) return null;
  const literals = [];
  let shape = '';
  let depth = 0;
  ROW_TOKEN.lastIndex = 0;
  while (ROW_TOKEN.lastIndex < t.length) {
    const m = ROW_TOKEN.exec(t);
    if (!m) return null;
    if (m[1]) continue;
    if (m[3]) {
      literals.push(m[3]);
      shape += 'L';
      continue;
    }
    if (m[4] && '[({'.includes(m[4])) depth++;
    if (m[4] && '])}'.includes(m[4]) && --depth < 0) return null; // the tail of a call: `{ name: 'X' });`
    shape += (m[2] ?? m[4]).replace(/\s+/g, '');
  }
  // open brackets are the start of a multi-line value (`[true,`); a key with one value (`code: 1,`) is a property
  if (depth !== 0 || !literals.length || (!/^[[({]/.test(t) && (literals.length > 1 || shape.includes(':')))) return null;
  return { literals, shape };
}

const INLINE_LIST = new RegExp(String.raw`\[\s*((?:${LITERAL_SRC})(?:\s*,\s*(?:${LITERAL_SRC}))*)\s*,?\s*\]`, 'g');
function inlineLists(text) {
  const lists = [];
  const shape = text.replace(INLINE_LIST, (_, items) => {
    lists.push(items.match(new RegExp(LITERAL_SRC, 'g')));
    return '[L]';
  });
  return { lists, shape: normalizeLine(shape) };
}

// What is gone from big, if small is big with some items removed and nothing else.
function dropped(big, small) {
  if (!small || small.length >= big.length) return null;
  const gone = [];
  let j = 0;
  for (const item of big) {
    if (j < small.length && small[j] === item) j++;
    else gone.push(item);
  }
  return j === small.length ? gone : null;
}

// The test each line sits in: the last test that starts at or above it, read over the whole text (a Java, C# or Rust
// name sits a line below its annotation; a Python test starts at its decorators, so a parametrize list is its own), or
// null above the first test (round 25). Old tests are keyed by name and occurrence; each new test takes the old key it
// was, by the first rule that places it (rounds 26 and 27):
// 1. its name line did not change, nor did the line above it, or its old line above and the line after its name;
// 2. its name line was edited in place: the old one was removed, and the lines around the test did not change;
// 3. the line above it (its describe or class line) matches that of exactly one old test of its name and one new one;
// 4. the old keys of its name left over, in order; with more new than old, only when the line after its name matches
//    exactly one old test of the name and no other new one, or else a key of its own.
// Read once a file.
function testsOf(file) {
  if (file.tests !== undefined) return file.tests;
  if (!file.oldLines || !file.newLines) return (file.tests = null);
  const lang = languageOf(file.path);
  const indent = (l) => /^\s*/.exec(l)[0].length;
  const decorated = (lines, i) => {
    let top = i;
    for (let j = i - 1; j >= 0 && lines[j].trim(); j--) {
      if (indent(lines[j]) < indent(lines[i])) break;
      if (indent(lines[j]) === indent(lines[i]) && lines[j].trim().startsWith('@')) top = j;
      else if (indent(lines[j]) === indent(lines[i]) && !/^[)\]]/.test(lines[j].trim())) break;
    }
    return top + 1;
  };
  const startsOf = (lines) => {
    const matches = [...nameMatches(lines.join('\n'), lang)].sort((x, y) => x[0] - y[0]);
    const out = [];
    let [m, e, offset] = [0, 0, 0];
    lines.forEach((l, i) => {
      offset += l.length;
      for (; m < matches.length && matches[m][0] <= offset; m++) out.push({ at: i + 1, line: lang === 'py' ? decorated(lines, i) : i + 1, name: matches[m][1], stop: matches[m][2] });
      for (; e < out.length && out[e].stop <= offset + 1; e++) out[e].end = i + 1;
      offset += 1;
    });
    for (; e < out.length; e++) out[e].end = lines.length;
    return out;
  };
  // the nearest line that is not blank above (step -1) or below (step 1) a 1-based line, 0 or length + 1 if none
  const near = (lines, line, step) => {
    let i = line - 1 + step;
    while (i >= 0 && i < lines.length && !lines[i].trim()) i += step;
    return i + 1;
  };
  const olds = startsOf(file.oldLines);
  const count = new Map();
  for (const t of olds) {
    count.set(t.name, (count.get(t.name) || 0) + 1);
    t.key = `${t.name}\0${count.get(t.name)}`;
  }
  // each unchanged line of the new file and the old line it was
  const added = new Set(file.added.map((x) => x.line));
  const removed = new Set(file.removed.map((x) => x.line));
  const toOld = new Map();
  for (let o = 1, n = 1; n <= file.newLines.length; n++) {
    if (added.has(n)) continue;
    while (removed.has(o)) o++;
    toOld.set(n, o++);
  }
  const kept = new Set();
  const news = startsOf(file.newLines);
  const keep = (t, o) => {
    if (o && !kept.has(o) && !t.key) kept.add(o), (t.key = o.key);
  };
  // 1
  const oldAt = new Map(olds.map((t) => [`${t.at}\0${t.name}`, t]));
  const addedText = new Set(file.added.map((x) => normalizeLine(x.text)));
  for (const t of news) {
    const o = oldAt.get(`${toOld.get(t.at)}\0${t.name}`);
    if (!o) continue;
    // a line added above it (a new test, a hook, a comment) does not move it: its old line above was not moved
    // elsewhere and the line after its name is the same line (round 28)
    const up = near(file.oldLines, o.line, -1);
    const stayed = (!removed.has(up) || !addedText.has(normalizeLine(file.oldLines[up - 1]))) && toOld.get(near(file.newLines, t.end, 1)) === near(file.oldLines, o.end, 1);
    if (!added.has(near(file.newLines, t.line, -1)) || stayed) keep(t, o);
  }
  // 2
  const around = (name, up, down) => `${name}\0${up}\0${down}`;
  const byAround = new Map();
  for (const o of olds) {
    if (!removed.has(o.at)) continue;
    const k = around(o.name, near(file.oldLines, o.line, -1), near(file.oldLines, o.end, 1));
    byAround.set(k, byAround.has(k) ? null : o);
  }
  for (const t of news) {
    if (t.key || !added.has(t.at)) continue;
    const [up, down] = [near(file.newLines, t.line, -1), near(file.newLines, t.end, 1)];
    if ((up >= 1 && !toOld.has(up)) || !toOld.has(down)) continue;
    keep(t, byAround.get(around(t.name, up >= 1 ? toOld.get(up) : 0, toOld.get(down))));
  }
  const group = (list, pick) => {
    const m = new Map();
    for (const t of list) if (pick(t)) (m.get(t.name) ?? m.set(t.name, []).get(t.name)).push(t);
    return m;
  };
  const unique = (list, keyOf) => {
    const m = new Map();
    for (const t of list) {
      const k = keyOf(t);
      m.set(k, m.has(k) ? null : t);
    }
    return m;
  };
  const lineAt = (lines, i) => (i >= 1 && i <= lines.length ? normalizeLine(lines[i - 1]) : '');
  // 3
  const oldPool = group(olds, (t) => !kept.has(t));
  for (const [name, waiting] of group(news, (t) => !t.key)) {
    const before = unique(oldPool.get(name) ?? [], (t) => lineAt(file.oldLines, near(file.oldLines, t.line, -1)));
    for (const [k, t] of unique(waiting, (t) => lineAt(file.newLines, near(file.newLines, t.line, -1)))) if (t) keep(t, before.get(k));
  }
  // 4
  const pool = group(olds, (t) => !kept.has(t));
  const next = (lines, t) => lineAt(lines, near(lines, t.end, 1));
  let fresh = 0;
  for (const [name, waiting] of group(news, (t) => !t.key)) {
    const old = pool.get(name) ?? [];
    if (waiting.length <= old.length) {
      waiting.forEach((t, i) => (t.key = old[i].key));
      continue;
    }
    const [olds1, news1] = [unique(old, (t) => next(file.oldLines, t)), unique(waiting, (t) => next(file.newLines, t))];
    for (const t of waiting) {
      const k = next(file.newLines, t);
      const o = news1.get(k) === t ? olds1.get(k) : null;
      t.key = o ? o.key : `${name}\0+${++fresh}`;
    }
  }
  const spread = (lines, starts) => {
    let [s, cur] = [0, null];
    return lines.map((_, i) => {
      for (; s < starts.length && starts[s].line <= i + 1; s++) cur = starts[s].key;
      return cur;
    });
  };
  file.tests = { old: spread(file.oldLines, olds), now: spread(file.newLines, news) };
  return file.tests;
}

// A removed line pairs first with its exact copy in the same test, so a test that only moved keeps its lines (round
// 24). It pairs with a line of another test only when its text was added nowhere (a copy on an unchanged line did
// not move: round 26): a value changed or swapped between two tests is read, and a list or helper outside any test,
// which a new test above moves into another one's span, is still compared (round 25). A line in no test, or without
// the file read, looks for its copy in its own hunk.
function pairing(file) {
  const tests = testsOf(file);
  const at = (side, line) => (tests ? (tests[side][line - 1] ?? null) : null);
  const taken = new Set();
  const index = (added, key) => {
    const m = new Map();
    for (const a of added) {
      const k = key(a);
      if (!m.has(k)) m.set(k, { lines: [], next: 0 });
      m.get(k).lines.push(a.line);
    }
    return m;
  };
  const take = (c) => {
    while (c && c.next < c.lines.length && taken.has(c.lines[c.next])) c.next++;
    const line = c?.lines[c.next++];
    if (line !== undefined) taken.add(line);
    return line !== undefined;
  };
  const whole = tests && index(file.added, (a) => `${at('now', a.line)}\0${normalizeLine(a.text)}`);
  const left = tests && new Set(file.added.map((a) => normalizeLine(a.text)));
  const perHunk = new Map();
  const gone = new Map(); // a removed line whose text was added nowhere
  return {
    taken,
    mine: (r, a) => at('old', r.line) != null && at('old', r.line) === at('now', a.line),
    inTest: (r) => at('old', r.line) != null,
    same: (r, a) => {
      const [x, y] = [at('old', r.line), at('now', a.line)];
      if (x == null || y == null || x === y) return true;
      if (!gone.has(r.line)) gone.set(r.line, !left.has(normalizeLine(r.text)));
      return gone.get(r.line);
    },
    copy: (r, hunk) => {
      const t = at('old', r.line);
      if (t != null) return take(whole.get(`${t}\0${normalizeLine(r.text)}`));
      if (!perHunk.has(hunk)) perHunk.set(hunk, index(hunk.added, (a) => normalizeLine(a.text)));
      return take(perHunk.get(hunk).get(normalizeLine(r.text)));
    },
  };
}

// Items dropped from a list on one line whose rest is unchanged, and rows moved within their table. Whole rows
// that disappear from multi-line tables are not reported: tables shrink when features go, so that signal is noise.
function tableChanges(file) {
  const out = [];
  const pair = pairing(file);
  const lists = (r) => {
    const pa = parseAssertion(r.text);
    return (pa && pa.args !== null) || dataRow(r.text) ? null : inlineLists(r.text); // a spread assertion's first line still holds lists (round 23)
  };
  const moved = new Set();
  for (const hunk of file.hunks) for (const r of hunk.removed) if (lists(r)?.lists.length && pair.copy(r, hunk)) moved.add(r.line);
  const shapes = new Map(); // an added line's list shape, read once: a rewritten table pairs every line (round 25)
  const shapeOf = (x) => (shapes.has(x.line) ? shapes.get(x.line) : shapes.set(x.line, inlineLists(x.text).shape).get(x.line));
  for (const hunk of file.hunks) {
    const used = pair.taken;
    for (const r of hunk.removed) {
      if (moved.has(r.line)) continue;
      const before = lists(r);
      if (!before?.lists.length) continue;
      let [a, first] = [null, null]; // a line of its own test first (round 27), in one pass (round 28)
      for (const x of hunk.added) {
        if (used.has(x.line) || shapeOf(x) !== before.shape || !pair.same(r, x)) continue;
        first ??= x;
        if (!pair.inTest(r) || pair.mine(r, x)) {
          a = x;
          break;
        }
      }
      a ??= first;
      if (!a) continue;
      used.add(a.line);
      const after = inlineLists(a.text);
      before.lists.forEach((items, i) => {
        const gone = dropped(items, after.lists[i]);
        if (gone) out.push({ type: 'changed', what: 'dropped', from: truncate(gone.join(', '), 40) });
      });
    }
  }
  if (!file.oldLines || !file.newLines) return out;
  const key = (text) => normalizeLine(text).replace(/,$/, '');
  const rowLines = (lines) => lines.filter((l) => dataRow(l.text) && !parseAssertion(l.text));
  const table = (lines, at) => {
    let start = at - 1;
    let end = at - 1;
    while (start > 0 && dataRow(lines[start - 1])) start--;
    while (end < lines.length - 1 && dataRow(lines[end + 1])) end++;
    return lines.slice(start, end + 1).map(key);
  };
  const addedRows = rowLines(file.added);
  for (const r of rowLines(file.removed)) {
    const a = addedRows.find((x) => key(x.text) === key(r.text));
    if (!a) continue;
    const before = table(file.oldLines, r.line);
    const after = table(file.newLines, a.line);
    const sorted = (list) => [...list].sort().join('\n');
    if (before.join('\n') !== after.join('\n') && sorted(before) === sorted(after)) {
      out.push({ type: 'changed', what: 'reordered', from: truncate(key(r.text), 50) });
      break;
    }
  }
  return out;
}

// ---------- the file model, from a unified diff and the files as they are now ----------

function parseDiff(diff) {
  const files = [];
  let f = null;
  let h = null;
  let oldLine = 0;
  let newLine = 0;
  let from = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      f = null;
      h = null;
      continue;
    }
    if (line.startsWith('--- ') && !h) {
      from = unquotePath(line.slice(4)).replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('+++ ') && !h) {
      const to = unquotePath(line.slice(4)).replace(/^b\//, '');
      f = { path: to === '/dev/null' ? from : to, status: from === '/dev/null' ? 'A' : to === '/dev/null' ? 'D' : 'M', hunks: [], removed: [], added: [] };
      files.push(f);
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m && f) {
      h = { oldStart: +m[1], newStart: +m[3], newCount: m[4] === undefined ? 1 : +m[4], removed: [], added: [], lines: [] };
      f.hunks.push(h);
      [oldLine, newLine] = [h.oldStart, h.newStart];
      continue;
    }
    if (!h || line.startsWith('\\')) continue;
    if (line.startsWith('-')) {
      const r = { line: oldLine++, text: line.slice(1, 10001) }; // the patterns can take quadratic time on a long line
      h.removed.push(r), f.removed.push(r), h.lines.push(line);
    } else if (line.startsWith('+')) {
      const a = { line: newLine++, text: line.slice(1, 10001) };
      h.added.push(a), f.added.push(a), h.lines.push(line);
    } else if (line.startsWith(' ')) oldLine++, newLine++, h.lines.push(line);
    else h = null; // the end of this file's hunks
  }
  return files;
}

// The file before the change: the file as it is now with each hunk undone. Null if they do not match.
function undo(newLines, hunks) {
  const old = [];
  let cur = 0;
  for (const h of hunks) {
    const upto = h.newCount === 0 ? h.newStart : h.newStart - 1;
    if (upto < cur || upto > newLines.length) return null;
    while (cur < upto) old.push(newLines[cur++]);
    for (const l of h.lines) {
      if (l[0] === '-') old.push(l.slice(1));
      else if (newLines[cur]?.replace(/\r$/, '') !== l.slice(1).replace(/\r$/, '')) return null;
      else if (l[0] === ' ') old.push(newLines[cur++]);
      else cur++;
    }
  }
  while (cur < newLines.length) old.push(newLines[cur++]);
  return old;
}

const OPTIONS_SKIP = /\b(?:it|test|describe|suite|specify)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*\{[^}]*\b(?:skip|todo)\b(?!\s*:\s*(?:false|null|undefined|0)\b)/;
const lineOfIndex = (text, index) => text.slice(0, index).split('\n').length;

// The changes, as { type: 'changed' | 'weakened' | 'replaced' | 'skipped', file, what, from, to }.
// isTestFile picks the test files; read(file) returns a file as it is now, or null.
export function testChanges(diff, { read, isTestFile }) {
  const files = parseDiff(diff).filter((f) => isTestFile(f.path) && languageOf(f.path));
  for (const f of files) {
    const now = f.status === 'D' ? null : read(f.path);
    f.newLines = now == null ? null : now.split('\n');
    f.oldLines = f.status === 'A' ? [] : f.status === 'D' ? f.removed.map((r) => r.text) : f.newLines && undo(f.newLines, f.hunks);
    f.newText = f.status === 'D' ? '' : f.newLines && f.newLines.join('\n');
    f.oldText = f.oldLines && f.oldLines.join('\n');
  }
  const changes = [];

  // Tests that went: moved to another file, replaced by a new one, or removed. Only replaced ones are reported
  // here; a removed test is counted with the removed assertions, and a deleted file on its own.
  const perFile = [];
  const addedPool = new Map();
  for (const file of files.filter((x) => x.oldText != null && x.newText != null)) {
    const lang = languageOf(file.path);
    const oldNames = extractTestNames(file.oldText, lang);
    const newNames = extractTestNames(file.newText, lang);
    const removed = [];
    const added = [];
    for (const [name, { count, index }] of oldNames) for (let i = newNames.get(name)?.count ?? 0; i < count; i++) removed.push({ name, index });
    for (const [name, { count, index }] of newNames) {
      const before = oldNames.get(name)?.count ?? 0;
      for (let i = before; i < count; i++) added.push({ name, index });
      if (count > before) addedPool.set(name, (addedPool.get(name) ?? 0) + (count - before));
    }
    perFile.push({ file, removed, added });
  }
  for (const entry of perFile) {
    entry.removed = entry.removed.filter(({ name }) => {
      const n = addedPool.get(name) ?? 0;
      if (n === 0) return true;
      addedPool.set(name, n - 1);
      return false;
    });
  }
  const removedIn = new Set();
  const addedIn = (pred) => perFile.filter((e) => e.file.status !== 'D' && pred(e.file)).flatMap((e) => e.added.map((a) => ({ ...a, file: e.file })));
  const take = (list, pick) => {
    const i = list.findIndex((a) => (addedPool.get(a.name) ?? 0) > 0 && pick(a));
    if (i < 0) return null;
    const [hit] = list.splice(i, 1);
    addedPool.set(hit.name, addedPool.get(hit.name) - 1);
    return hit;
  };
  for (const { file, removed } of perFile) {
    if (file.status === 'D') {
      if (removed.length) removedIn.add(file.path);
      continue;
    }
    // only a file that lost tests needs the added ones; building them for every file is quadratic in new files
    // (cold review, L13 round 7)
    if (!removed.length) continue;
    const own = addedIn((x) => x === file);
    const elsewhere = addedIn((x) => x !== file);
    for (const r of removed) {
      const replacement = take(own, () => true) ?? take(elsewhere, (a) => similarNames(r.name, a.name));
      if (replacement) changes.push({ type: 'replaced', file: file.path, what: 'replaced', from: truncate(r.name, 50), to: truncate(replacement.name, 50), where: replacement.file === file ? null : replacement.file.path, line: lineOfIndex(file.newText, replacement.index) });
      else removedIn.add(file.path);
    }
  }

  // Assertions changed in place: each removed assertion against the first added one in its hunk that it matches.
  for (const file of files) {
    const pair = pairing(file);
    const used = pair.taken;
    const twins = new Set();
    for (const hunk of file.hunks) for (const r of hunk.removed) if (parseAssertion(r.text) && pair.copy(r, hunk)) twins.add(r.line);
    for (const hunk of file.hunks) {
      if (!hunk.removed.length || !hunk.added.length) continue;
      const rem = hunk.removed.filter((r) => !twins.has(r.line)).map((r) => ({ ...r, a: parseAssertion(r.text) })).filter((x) => x.a);
      const add = hunk.added.map((x) => ({ ...x, a: parseAssertion(x.text) })).filter((x) => x.a);
      if (rem.length * add.length > 250000) continue; // a rewritten test file, not an edit; the other checks still read it
      for (const r of rem) {
        for (const a of add) {
          if (used.has(a.line) || !pair.same(r, a)) continue;
          if (normalizeLine(r.text) === normalizeLine(a.text)) {
            used.add(a.line);
            break;
          }
          const cmp = compareAssertions(r.a, a.a);
          if (!cmp) continue;
          used.add(a.line);
          changes.push({ ...cmp, file: file.path });
          break;
        }
      }
    }
  }

  // A skip option added to a test that already existed: test('name', { skip }, fn). New tests use the same
  // option to declare what they need (`{ skip: !hasCrypto }`), so a test whose name is new does not count.
  for (const file of files) {
    if (languageOf(file.path) !== 'js' || file.oldText == null) continue;
    const before = new Set(file.removed.map((r) => normalizeLine(r.text)));
    for (const a of file.added) {
      const m = OPTIONS_SKIP.exec(a.text);
      if (m && !isCommentLine(a.text) && !before.has(normalizeLine(a.text)) && file.oldText.includes(m[2])) {
        changes.push({ type: 'skipped', file: file.path, what: 'skipped', from: truncate(m[2], 50) });
        break;
      }
    }
  }

  // Test data dropped or reordered, in files that lost no whole test.
  for (const file of files) if (file.status === 'M' && !removedIn.has(file.path)) for (const c of tableChanges(file)) changes.push({ ...c, file: file.path });
  return changes;
}
