// Deterministic signals. No AI in the decision path.

const ERROR_LINE =
  /(error|exception|traceback|failed|failure|fatal|cannot|can't|not found|undefined is not|is not defined|is not a function|segmentation fault|ERR!|panic:|denied|refused|unexpected token|syntaxerror|typeerror|referenceerror|modulenotfound|no such file)/i;

const NOISE = /^(\s*at\s|\s*\^+\s*$|\s*$)/;
// A passing test whose name mentions an error ("✔ returns an error for bad input"),
// or a summary that says zero failed ("ℹ fail 0"), is not a failure.
const PASSING = /^\s*(✔|✓|√|ok \d+\b|PASS\b)|^\s*(ℹ\s*)?(fail|failed|failures|errors)\s*[:=]?\s*0\s*$/i;

export function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

// Pull text out of whatever shape the tool response has.
export function responseText(resp) {
  if (resp == null) return '';
  if (typeof resp === 'string') return resp;
  const parts = [];
  for (const key of ['stderr', 'stdout', 'output', 'error', 'content', 'result']) {
    const v = resp[key];
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) parts.push(v.map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n'));
  }
  return parts.length ? parts.join('\n') : JSON.stringify(resp);
}

export function errorLines(text, max = 12) {
  const lines = stripAnsi(text).split('\n');
  const hits = [];
  for (let i = 0; i < lines.length && hits.length < max; i++) {
    if (ERROR_LINE.test(lines[i]) && !NOISE.test(lines[i]) && !PASSING.test(lines[i])) hits.push(lines[i].trim());
  }
  return hits;
}

// A stable fingerprint for "the same error again".
export function normalize(line) {
  return stripAnsi(line)
    .replace(/(['"`]).*?\1/g, "'…'")
    .replace(/(?:[A-Za-z]:)?(?:[\w.-]*[\\/])+([\w.-]+)/g, '$1')
    .replace(/0x[0-9a-f]+/gi, 'N')
    .replace(/-?\d+(\.\d+)?/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function signature(text) {
  const lines = errorLines(text, 3);
  if (!lines.length) return null;
  return normalize(lines[0]);
}

// The name of the failing test, from node --test / TAP, jest, pytest or go test output.
export function failingTest(text) {
  const t = stripAnsi(text);
  const m =
    t.match(/^\s*(?:✖|×|✗|not ok \d+ -)\s+(?!failing tests)(.+?)(?:\s+\(?\d[\d.]*\s?m?s\)?)?\s*$/m) ||
    t.match(/^\s*●\s+(?!Console\s*$)(.+?)\s*$/m) ||
    t.match(/^FAILED\s+(\S+)/m) ||
    t.match(/^--- FAIL:\s+(\S+)/m);
  return m ? m[1].trim().slice(0, 120) : null;
}

// ---------- prompts (UserPromptSubmit) ----------

const words = (p) => String(p || '').trim().split(/\s+/).filter(Boolean);
// A file path, inline code, a pasted error line or a number: the prompt carries its own
// information. The bare word "error" does not count ("still error", "masih error").
const SPECIFIC = /`|[\w-]+\/[\w./-]+|\.\w{1,5}\b|\w*(error|exception)\s*[:[(]|\b(traceback|line \d+|expected|got)\b|\d{3,}/i;
// English and Indonesian words that ask for a repair. Thanks and "works now" never count.
const REPAIR =
  /\b(still|again|broken|fix|fail|fails|failing|failed|wrong|same|bug|error|errors|wtf|ugh|stuck|nope|masih|lagi|rusak|gagal|eror|salah|belum|tolong|perbaiki|benerin|betulin)\b|\b(not|doesn'?t|didn'?t|isn'?t|won'?t|can'?t|gak|nggak|ngga|ga|tidak|blm)\s+(work|working|run|running|pass|passing|load|loading|jalan|bisa|berhasil)\b/i;
const POSITIVE = /\b(thanks|thank you|thx|works now|working now|great|nice|good|perfect|awesome|mantap|makasih|terima kasih|sip|berhasil|sudah bisa|udah bisa)\b/i;

// "still broken", "fix it", "masih error": short, no specifics, asks for a repair.
// The person's answer to a draft: a yes word, optionally with one polite word. A fixed list, in the
// style of askApproval(), so no model decides what is saved for the team.
const YES = new Set(['yes', 'y', 'yep', 'yeah', 'ok', 'okay', 'sure', 'save', 'save it', 'go ahead', 'do it', 'ya', 'iya', 'oke', 'boleh', 'simpan']);
export function plainYes(p) {
  const t = String(p || '').trim().toLowerCase().replace(/[.!]+$/, '').trim();
  const m = /^(.+?)(?:[\s,]+(?:please|thanks|thank you|makasih|dong))?$/.exec(t);
  return !!m && YES.has(m[1].trim());
}

export function lowInfoPrompt(p) {
  const w = words(p);
  if (!w.length || w.length > 8 || SPECIFIC.test(p) || POSITIVE.test(p)) return false;
  return REPAIR.test(p);
}

const BUILD_START =
  /^\s*(please\s+|tolong\s+|can you\s+|could you\s+)?(build|create|make|add|implement|develop|design|set up|setup|buat|buatkan|buatin|bikin|bikinin|tambah|tambahkan|tambahin|bangun)\b/i;
const BIG = /\b(app|application|feature|system|platform|website|site|dashboard|service|bot|game|aplikasi|fitur|sistem|situs|web)\b/i;
const SMALL = /\b(make sure|pastikan|instead|still|again|fix|bug|error|rename|change|ubah|ganti|refactor|button|color|colour|font|style)\b/i;
const CHECKABLE =
  /\b(tests?|spec|expect|assert|should (return|show|be|print)|when i|given|acceptance|example|input|output|returns?|tes|uji|contoh|harus|kalau|jika)\b/i;

// "build me a todo app with login": a new feature with nothing that says how to check it.
// Questions and small edits ("make the button blue") do not count.
export function vagueFeature(p) {
  return (
    words(p).length >= 6 &&
    BUILD_START.test(p) &&
    BIG.test(p) &&
    !SMALL.test(p) &&
    !CHECKABLE.test(p) &&
    !SPECIFIC.test(p) &&
    !/\?\s*$/.test(p)
  );
}

function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2 && w !== 'n')
  );
}

export function similarity(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------- test tampering ----------

const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
// Data the tests read, not tests: deleting or editing it is not counted as weakening a test.
const FIXTURE = /(^|\/)(__fixtures__|fixtures?|__snapshots__|__mocks__|testdata)\//i;
export const isTestFile = (file) => TEST_FILE.test(file) && !FIXTURE.test(file);

// Kinds: the first three weaken the tests themselves, which is what `codehere audit` counts;
// expected-changed is an assertion whose expected value changed, which the finish check reports and the
// audit does not (in history it is mostly ordinary upkeep); checks-off turns off a check around the tests
// (hooks, types, the test script's exit code).
const DELETED = 'test-deleted';
const SKIPPED = 'test-skipped';
const WEAKENED = 'assertion-weakened';
const EXPECTED = 'expected-changed';
const HARDCODED = 'hardcoded-answer';
const UNDER_TEST = 'test-env';
const CHECKS_OFF = 'checks-off';

const TAMPER_ADDED = [
  { re: /\b(it|test|describe)\.skip\s*\(/, kind: SKIPPED, why: 'a test was skipped (.skip)' },
  { re: /\b(xit|xdescribe|xtest)\s*\(/, kind: SKIPPED, why: 'a test was disabled (xit/xdescribe)' },
  // skip, and skipif or skipIf only when the condition is a literal: skipUnless(shutil.which("uv")) is a
  // test that cannot run on this machine, as { skip: process.platform === 'win32' } is in JS
  { re: /@pytest\.mark\.skip\b|\bunittest\.skip\s*\(|\b(skipif|skipIf)\s*\(\s*True\b|\bskipUnless\s*\(\s*False\b/, kind: SKIPPED, why: 'a Python test was skipped' },
  { re: /@ts-nocheck/, kind: CHECKS_OFF, why: 'type checking was turned off (@ts-nocheck)' },
  { re: /--no-verify/, kind: CHECKS_OFF, why: 'git hooks were bypassed (--no-verify)' },
  { re: /expect\([^)]*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)\s*;?\s*\/\/\s*(todo|temp|hack)/i, kind: WEAKENED, why: 'an assertion was replaced with a placeholder' },
];

// Only in test files: elsewhere `{ skip: true }` or `assert.equal(1, 1)` can be ordinary code.
const LITERAL = String.raw`(\d+(?:\.\d+)?|true|false|null|'[^']*'|"[^"]*")`;
const TAMPER_ADDED_IN_TESTS = [
  // test('name', { skip: true }, ...): the name cannot run past its closing quote, so the options are this test's
  { re: /(?<![.\w])(it|test|describe|suite)\s*\(\s*(['"`])(?:(?!\2)[^\\]|\\.)*\2\s*,\s*\{[^}]*\b(skip|todo)\s*:\s*(true\b|['"`])/, kind: SKIPPED, why: 'a test was skipped ({ skip: true })' },
  // fit/fdescribe only in jest's form, starting a statement with a quoted name then a callback:
  // `fit(` alone is a common function name
  { re: /(?<![.\w])(it|test|describe|context|suite)\.only\s*\(|^[+-]\s*(fit|fdescribe)\s*\(\s*(['"`])(?:(?!\3)[^\\]|\\.)*\3\s*,\s*(async\s+)?(\(|function\b|\w+\s*=>)/, kind: SKIPPED, why: 'other tests were turned off (.only)' },
  { re: /\bassert(\.ok)?\(\s*true\s*\)|^\+\s*assert\s+True\s*$/, kind: WEAKENED, why: 'an assertion that cannot fail was added' },
  { re: new RegExp(String.raw`\bassert\.\w+\(\s*${LITERAL}\s*,\s*\1\s*\)`), kind: WEAKENED, why: 'an assertion that cannot fail was added' },
  { re: new RegExp(String.raw`\bexpect\(\s*${LITERAL}\s*\)\.(toBe|toEqual|toStrictEqual)\(\s*\1\s*\)`), kind: WEAKENED, why: 'an assertion that cannot fail was added' },
];
// assert(...), assert.equal(...), expect(...), self.assertEqual(...), and pytest's bare `assert x`;
// not expect.objectContaining(...) and the other matchers inside one assertion
const ASSERT = /\b(expect\s*\(|assert[\w.]*\s*\()|^[+-]\s*assert\s/;
// package.json's test script made to pass whatever the tests do: `|| true`, `|| :`, `|| echo`, `; exit 0`
const ALWAYS_PASSES = /"test"\s*:\s*"[^"]*(\|\|\s*(true|:|exit\s+0|echo\b[^"&|;]*)|;\s*(true|exit\s+0))\s*"/;
const COMMENT = /^[+-]\s*(\/\/|#|\/\*|\*)\s*/;

// Options that make the runner leave tests out (node --test, jest, vitest, mocha, playwright, pytest,
// go, cargo), on a test script or a pytest addopts line. Reporter, coverage and other options are not.
const FILTER = /(?:^|\s)(--test-skip-pattern|--test-name-pattern|--testPathIgnorePatterns|--testNamePattern|--testPathPatterns?|--grep-invert|--grep|--fgrep|--invert|--ignore(?:-glob)?|--deselect|--skip|-skip|-run|-k)(?=[\s=]|$)/g;
const TEST_SCRIPT = /"test(?::[^"]*)?"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const ADDOPTS = /^[+-]\s*"?addopts"?\s*=(.*)$/;
const PYTEST_CONFIG = /(^|\/)(pytest\.ini|pyproject\.toml|setup\.cfg|tox\.ini)$/;
// The same, as keys in a runner's own config file
const RUNNER_CONFIG = /(^|\/)(jest|vitest|playwright)\.config\.[\w.]+$|(^|\/)\.mocharc(\.[\w]+)?$/;
const CONFIG_KEY = /(?:^|[\s{,'"])(testPathIgnorePatterns|testNamePattern|testIgnore|grepInvert|grep|invert|ignore)['"]?\s*:/g;
export const isTestConfig = (file) => /(^|\/)package\.json$/.test(file) || PYTEST_CONFIG.test(file) || RUNNER_CONFIG.test(file);

// The options a line of this file sets that leave tests out, with where they were set.
function filtersOn(file, line) {
  let text = null;
  let where = '';
  if (/(^|\/)package\.json$/.test(file)) (text = (TEST_SCRIPT.exec(line) || [])[1] ?? null), (where = 'by the test script');
  else if (PYTEST_CONFIG.test(file)) (text = (ADDOPTS.exec(line) || [])[1] ?? null), (where = "by the test runner's options");
  else if (RUNNER_CONFIG.test(file)) (text = line.slice(1)), (where = "by the test runner's config");
  if (text == null) return [];
  const re = RUNNER_CONFIG.test(file) ? CONFIG_KEY : FILTER;
  return [...text.matchAll(re)].map((m) => ({ option: m[1], where }));
}

// Which characters of a line are inside a string literal: test code often writes another test as
// text, and a skip in that text is not a skip. One line at a time, so a string that spans lines (a
// template literal, a docstring) is not seen; after // or a # comment, no quote opens a string.
function stringMask(line) {
  const mask = new Uint8Array(line.length);
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      mask[i] = 1;
      if (c === '\\') mask[++i] = 1;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') (quote = c), (mask[i] = 1);
    else if ((c === '/' && line[i + 1] === '/') || (c === '#' && (i <= 1 || /\s/.test(line[i - 1])))) break;
  }
  return mask;
}

// An assertion line with its values taken out. A removed and an added line with the same shape and other
// values are one assertion whose expected value changed; assertTrue and assertFalse share a shape.
// numbers may use _ as a separator (10_000), as JS and Python allow
const VALUES = /(?<![\w.$])(?:\d[\d_]*(?:\.\d+)?|true|false|True|False|null|None|undefined)(?![\w$])|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
function shape(line) {
  const values = [];
  const text = line
    .slice(1)
    .trim()
    .replace(/\bassert(True|False)\b/g, (m, b) => (values.push(b), 'assert<b>'))
    .replace(VALUES, (v) => (values.push(v.slice(0, 40)), '<v>'));
  return { text, values };
}

// The arguments of the call whose '(' is at open, split at top-level commas; null if it does not close.
function argsAt(t, open) {
  const args = [];
  let depth = 0;
  let quote = '';
  let start = open + 1;
  for (let i = open; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (--depth === 0) return (args.push(t.slice(start, i).trim()), { args, end: i });
    } else if (c === ',' && depth === 1) args.push(t.slice(start, i).trim()), (start = i + 1);
  }
  return null;
}

// Where a top-level operator (==) starts in a Python assert, outside brackets and strings; -1 if none.
function topLevel(t, op) {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && t.startsWith(op, i)) return i;
  }
  return -1;
}

// An assertion's subject and whether it checks a value (equal, toBe, assertEqual, ==) or only that the
// subject is set or truthy (ok, assert(), toBeDefined, toBeTruthy, assertTrue, a bare Python assert).
// The same subject going from the first kind to the second is a weakened assertion.
const VALUE_CALL = /\b(equal|strictEqual|deepEqual|deepStrictEqual|assertEqual|assertEquals)\s*\(/;
const TRUTHY_CALL = /(?:^|[^\w.])(assert\.ok|assert)\s*\(|\b(assertTrue|assertIsNotNone)\s*\(/;
const EXPECT_VALUE = /^\.(toBe|toEqual|toStrictEqual)\s*\(/;
const EXPECT_TRUTHY = /^\.(toBeDefined|toBeTruthy|not\.toBeNull|not\.toBeUndefined)\s*\(\s*\)/;
function strength(line) {
  const t = line.slice(1).trim().replace(/;$/, '');
  let m = VALUE_CALL.exec(t);
  if (m) {
    const c = argsAt(t, m.index + m[0].length - 1);
    return c && c.args.length >= 2 ? { subject: c.args[0], value: true, form: `${m[1]}(…)`, expected: c.args[1] } : null;
  }
  m = /\bexpect\s*\(/.exec(t);
  if (m) {
    const c = argsAt(t, m.index + m[0].length - 1);
    if (!c) return null;
    const rest = t.slice(c.end + 1);
    const v = EXPECT_VALUE.exec(rest);
    if (v) {
      const e = argsAt(rest, rest.indexOf('('));
      return { subject: c.args[0], value: true, form: `${v[1]}(…)`, expected: e ? e.args[0] : '' };
    }
    const w = EXPECT_TRUTHY.exec(rest);
    return w ? { subject: c.args[0], value: false, form: `${w[1]}()` } : null;
  }
  m = TRUTHY_CALL.exec(t);
  if (m) {
    const c = argsAt(t, m.index + m[0].length - 1);
    return c ? { subject: c.args[0], value: false, form: `${(m[1] || m[2]).replace('assert.', '')}(…)` } : null;
  }
  m = /^assert\s+(.+)$/.exec(t);
  if (m) {
    const comma = topLevel(m[1], ',');
    const body = (comma >= 0 ? m[1].slice(0, comma) : m[1]).trim(); // drop a message
    const eq = topLevel(body, '==');
    if (eq >= 0) return { subject: body.slice(0, eq).trim(), value: true, form: '==', expected: body.slice(eq + 2).trim() };
    const none = /^(.+?)\s+is\s+not\s+None$/.exec(body);
    if (none) return { subject: none[1].trim(), value: false, form: 'is not None' };
    if (/[<>!]=?|\bin\b|\bis\b/.test(body)) return null;
    return { subject: body, value: false, form: 'a bare assert' };
  }
  return null;
}

// A catch that swallows what was thrown: catch {}, catch (e) {} or catch (e) { /* ignore */ } on one line;
// a catch line that opens a body which the next line closes; Python's except ...: pass, on one or two lines.
const CATCH_EMPTY = /\bcatch\s*(?:\(\s*[\w$]*\s*\))?\s*\{\s*(?:\/\*[^*]*\*\/|\/\/[^\n]*)?\s*\}/;
const CATCH_OPEN = /\bcatch\s*(?:\(\s*[\w$]*\s*\))?\s*\{\s*$/;
const EXCEPT_PASS = /^\s*except\b[^:]*:\s*pass\s*(#.*)?$/;
const EXCEPT_OPEN = /^\s*except\b[^:]*:\s*(#.*)?$/;
const TRY_OPEN = /\btry\s*\{|^\s*try\s*:/;

// Whether the try that a swallowing catch at line `at` (1-based) closes holds an assertion. The lines are the
// file as it is now when it can be read, else the lines of the diff around the catch (git's context).
function swallowsAssertion(lines, at, catchText) {
  let i = at - 1;
  if ((lines[i] || '').trim() !== catchText.trim()) {
    const near = [-3, -2, -1, 1, 2, 3].map((d) => at - 1 + d).find((k) => (lines[k] || '').trim() === catchText.trim());
    if (near === undefined) return false;
    i = near;
  }
  for (let k = i, n = 0; k >= 0 && n < 60; k--, n++) {
    let text = lines[k] || '';
    const cut = k === i ? text.search(/\bcatch\b|\bexcept\b/) : -1;
    if (cut >= 0) text = text.slice(0, cut); // try { assert(...) } catch {} on one line: the part before the catch
    const open = text.search(TRY_OPEN);
    if (ASSERT.test('+' + (open >= 0 ? text.slice(open).replace(TRY_OPEN, '') : text))) return true;
    if (open >= 0) return false;
  }
  return false;
}

// Literals in a piece of code: numbers (10_000 is 10000) and the contents of quoted strings, tagged so the
// number 500 and the string "500" stay apart.
const LITERAL_RE = /(?<![\w.$])-?\d[\d_]*(?:\.\d+)?(?![\w$])|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
function literals(text) {
  return [...String(text).matchAll(LITERAL_RE)].map((m) => (m[1] !== undefined || m[2] !== undefined ? `s:${m[1] ?? m[2]}` : `n:${Number(m[0].replace(/_/g, ''))}`));
}
// Values too common to say anything when code returns them
const DULL = new Set(['n:0', 'n:1', 'n:-1', 'n:2', 's:']);

// What a test line expects, when it compares a call on literal inputs with one literal value.
function expectationOf(line) {
  const st = strength('+' + line);
  if (!st || !st.value || !st.expected) return null;
  const want = literals(st.expected);
  if (want.length !== 1 || st.expected.replace(/^[-'"]|['"]$/g, '').length === 0) return null;
  return { inputs: new Set(literals(st.subject)), expected: want[0] };
}

// A return of one literal under a condition, on the same line or the line before: if (x === 250) return 500;
const RETURN_LITERAL = /\breturn\s+(-?\d[\d_]*(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;?\s*\}?\s*$/;
const SAME_LINE_IF = /\bif\s*\(?(.*?)\)?\s*(?:\{|:)?\s*return\b/;

// A test runner's own markers, read by code outside the tests: the code can then behave one way under the
// runner and another way for users. NODE_ENV === 'test' is not one: apps use it to pick a test database.
const RUNNER_MARKER = /\b(NODE_TEST_CONTEXT|JEST_WORKER_ID|VITEST_WORKER_ID|VITEST_POOL_ID|PYTEST_CURRENT_TEST)\b|(['"]pytest['"]\s+in\s+sys\.modules)|\b(testing\.Testing\(\))/;
// Test setup that may read them: pytest's conftest.py and the setup files jest and vitest load
const TEST_SETUP = /(^|\/)(conftest\.py|setupTests\.[cm]?[jt]sx?|(jest|vitest)\.setup\.[cm]?[jt]sx?)$/;

// re found in the code of the line, not only inside its strings
function inCode(re, line, mask) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (const m of line.matchAll(g)) if (!mask()[m.index + (m[0].length - m[0].trimStart().length)]) return true;
  return false;
}

// What the finish check prints: the events' text, in order, each once.
export function tamperFindings(nameStatus, diff, opts) {
  return tamperEvents(nameStatus, diff, opts).map((e) => e.why);
}

// Each finding as { kind, file, why }; file is undefined for the count of removed assertions,
// which spans the whole diff. A why already seen is not repeated.
// read(file), when given, returns the file as it is now (or null): the finish check passes one, the audit
// does not and relies on the diff's context lines. tests, when given, is the repo's test files as
// "path\0content" (or a function returning them, called only when it is needed), for the expected values a
// hardcoded answer would copy.
export function tamperEvents(nameStatus, diff, { read, tests } = {}) {
  const events = [];
  const seen = new Set();
  const add = (kind, file, why) => {
    if (seen.has(why)) return;
    seen.add(why);
    events.push({ kind, file, why });
  };
  for (const line of nameStatus.split('\n')) {
    const [status, file] = line.split(/\s+/);
    if (status === 'D' && file && isTestFile(file)) add(DELETED, file, `test file deleted: ${file}`);
  }
  let current = '';
  let removedAsserts = 0;
  let addedAsserts = 0;
  let removed = new Set(); // this file's removed assertions, to spot one coming back as a comment
  let removedShapes = new Map(); // this file's removed assertions by shape, to spot a changed expected value
  let removedValueChecks = new Map(); // this file's removed value checks by subject, to spot a weakened one
  const changedIn = new Set(); // one changed-value finding per file
  let newLine = 0; // the line number in the file as it is now, from the hunk headers
  let fileLines = []; // this file's lines from the diff (added and context), by line number, for the audit
  let pendingCatch = 0; // a catch or except line whose body may be closed or passed on the next line
  let prevText = ''; // the previous added or context line of this file
  const expectations = []; // from test lines in the diff, then from the repo's test files
  const returns = []; // literal returns under a condition in code files, checked after the diff is read
  const weakenedIn = new Set(); // one weakened-matcher finding per file
  let hadFallback = false; // the test script already ended in `|| true` before this session
  let hadFilters = new Set(); // options that left tests out before this session
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line.replace(/^\+\+\+ (b\/)?/, '');
      removed = new Set();
      removedShapes = new Map();
      removedValueChecks = new Map();
      fileLines = [];
      pendingCatch = 0;
      prevText = '';
      hadFallback = false;
      hadFilters = new Set();
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('@@')) {
      newLine = Number((/\+(\d+)/.exec(line) || [])[1] || 0);
      continue;
    }
    const at = line.startsWith('-') ? 0 : newLine;
    if (!line.startsWith('-')) newLine++;
    if (at && at <= 20000) fileLines[at - 1] = line.slice(1);
    const inTest = isTestFile(current);
    const before = prevText;
    if (!line.startsWith('-')) prevText = line.slice(1, 10001);
    if (inTest && !line.startsWith('-')) {
      const e = expectationOf(line.slice(1, 10001));
      if (e) expectations.push(e);
    } else if (!inTest && line.startsWith('+') && !isTestConfig(current)) {
      const marker = !COMMENT.test(line) && !TEST_SETUP.test(current) && !FIXTURE.test(current) && RUNNER_MARKER.exec(line.slice(1, 10001));
      if (marker) add(UNDER_TEST, current, `${current} checks whether it is running under a test (${(marker[1] || marker[2] || marker[3]).replace(/['"]/g, '')})`);
      const r = RETURN_LITERAL.exec(line.slice(1, 10001));
      if (r) {
        const same = SAME_LINE_IF.exec(line.slice(1, 10001));
        const cond = same ? same[1] : /^\s*if\b/.test(before) ? before : null;
        if (cond != null) returns.push({ file: current, text: r[1], value: literals(r[1])[0], given: literals(cond) });
      }
    }
    const probe = line.slice(0, 10000); // the patterns can take quadratic time on a long line
    let lineMask = null;
    const mask = () => (lineMask ||= stringMask(probe));
    if (/(^|\/)package\.json$/.test(current) && ALWAYS_PASSES.test(probe)) {
      if (line.startsWith('-')) hadFallback = true;
      else if (!hadFallback) add(CHECKS_OFF, current, `the test script was changed to always exit 0 in ${current}`);
    }
    if (isTestConfig(current)) {
      for (const f of filtersOn(current, probe)) {
        if (line.startsWith('-')) hadFilters.add(f.option);
        else if (line.startsWith('+') && !hadFilters.has(f.option)) add(SKIPPED, current, `tests were left out ${f.where} (${f.option}) in ${current}`);
      }
    }
    if (line.startsWith('+')) {
      for (const t of TAMPER_ADDED) if (inCode(t.re, probe, mask)) add(t.kind, current, `${t.why} in ${current}`);
      if (!inTest) continue;
      const text = probe.slice(1);
      let swallowAt = 0;
      let swallowText = '';
      if (pendingCatch && at === pendingCatch.at + 1 && (text.trim() === '}' || text.trim() === 'pass')) [swallowAt, swallowText] = [pendingCatch.at, pendingCatch.text];
      pendingCatch = 0;
      if (inCode(CATCH_EMPTY, probe, mask) || EXCEPT_PASS.test(text)) [swallowAt, swallowText] = [at, text];
      else if (inCode(CATCH_OPEN, probe, mask) || EXCEPT_OPEN.test(text)) pendingCatch = { at, text };
      if (swallowAt) {
        const now = read ? read(current) : null;
        const lines = now == null ? fileLines : now.split('\n');
        if (swallowsAssertion(lines, swallowAt, swallowText)) add(WEAKENED, current, `an assertion was wrapped in a try that swallows its failure in ${current}`);
      }
      for (const t of TAMPER_ADDED_IN_TESTS) if (inCode(t.re, probe, mask)) add(t.kind, current, `${t.why} in ${current}`);
      if (COMMENT.test(line)) {
        if (removed.has(line.replace(COMMENT, '').trim())) add(WEAKENED, current, `an assertion was commented out in ${current}`);
      } else if (inCode(ASSERT, probe, mask)) {
        addedAsserts++;
        const now = shape(probe);
        const before = removedShapes.get(now.text);
        const i = before ? before.findIndex((v, k) => v !== now.values[k]) : -1;
        if (i >= 0 && !changedIn.has(current)) {
          changedIn.add(current);
          add(EXPECTED, current, `an expected value was changed in ${current} (${before[i]} → ${now.values[i]})`);
        }
        const st = strength(probe);
        if (st && !st.value && removedValueChecks.has(st.subject) && !weakenedIn.has(current)) {
          weakenedIn.add(current);
          add(WEAKENED, current, `an assertion was weakened in ${current} (${removedValueChecks.get(st.subject)} became ${st.form})`);
        }
      }
    } else if (line.startsWith('-') && inTest && !COMMENT.test(line) && inCode(ASSERT, probe, mask)) {
      removedAsserts++;
      removed.add(line.slice(1).trim());
      const was = shape(probe);
      removedShapes.set(was.text, was.values);
      const st = strength(probe);
      if (st && st.value) removedValueChecks.set(st.subject, st.form);
    }
  }
  const candidates = returns.filter((r) => !DULL.has(r.value));
  if (candidates.length) {
    for (const t of (typeof tests === 'function' ? tests() : tests) || []) {
      for (const l of String(t).slice(String(t).indexOf('\0') + 1).split('\n')) {
        const e = expectationOf(l.slice(0, 10000));
        if (e) expectations.push(e);
      }
    }
    for (const r of candidates) {
      // numbers first: a string in the condition is often a key ("price"), the number is the input
      const order = [...r.given.filter((g) => g.startsWith('n:')), ...r.given.filter((g) => g.startsWith('s:'))];
      const given = order.find((g) => !DULL.has(g) && expectations.some((e) => e.expected === r.value && e.inputs.has(g)));
      const show = (g) => (g.startsWith('n:') ? g.slice(2) : JSON.stringify(g.slice(2)));
      if (given) add(HARDCODED, r.file, `${r.file} returns ${r.text} when given ${show(given)}, the exact value a test expects`);
    }
  }
  if (removedAsserts - addedAsserts >= 2) {
    add(WEAKENED, undefined, `${removedAsserts - addedAsserts} assertions removed from test files`);
  }
  return events;
}

// ---------- redaction for anything that leaves the machine ----------

const SECRETS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
];

export function redact(text) {
  let out = String(text);
  for (const re of SECRETS) out = out.replace(re, '[redacted]');
  out = out.replace(
    /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*[:=]\s*\S+/gi,
    '$1=[redacted]'
  );
  return out;
}

// Passed and failed counts from a test runner's own summary line, or null. Exactly one
// summary must be found: with two runners in one command, or a runner that prints one per
// package, a count would cover only part of the run, so the finish line says "exit 0".
const num = (s, re) => {
  const m = s.match(re);
  return m ? Number(m[1]) : null;
};
const after = (t, line) => t.slice(t.indexOf(line) + line.length);
const counts = (passed, failed) => (passed == null && failed == null ? null : { passed: passed || 0, failed: failed || 0 });
const SUMMARIES = [
  // node --test, spec and TAP reporters: "ℹ tests 3", "ℹ pass 2", "ℹ fail 1"
  { re: /^(?:ℹ|#) tests \d+$/gm, read: (t) => counts(num(t, /^(?:ℹ|#) pass (\d+)$/m), num(t, /^(?:ℹ|#) fail (\d+)$/m)) },
  // jest "Tests:       2 failed, 46 passed, 48 total", vitest " Tests  2 failed | 46 passed (48)"
  { re: /^\s*Tests:?\s+.*\d+ (?:passed|failed)\b.*$/gm, read: (t, line) => counts(num(line, /(\d+) passed/), num(line, /(\d+) failed/)) },
  // pytest "===== 1 failed, 1 passed in 0.02s ====="
  {
    re: /^[=\s]*(?:\d+ \w+(?:, )?)+ in [\d.]+s\b.*$/gm,
    read: (t, line) => counts(num(line, /(\d+) passed/), (num(line, /(\d+) failed/) || 0) + (num(line, /(\d+) errors?/) || 0)),
  },
  // mocha "46 passing", then "2 pending" and "2 failing" on the next lines (a log line elsewhere is not the count)
  {
    re: /^\s*\d+ passing\b.*$/gm,
    read: (t, line) => counts(num(line, /(\d+) passing/), num(after(t, line).split('\n').slice(1, 3).join('\n'), /^\s*(\d+) failing\b/m)),
  },
  // python unittest "Ran 5 tests in 0.001s", then the status line: "OK" or "FAILED (failures=2, errors=1)"
  {
    re: /^Ran \d+ tests? in [\d.]+s$/gm,
    read: (t, line) => {
      const status = (after(t, line).trimStart().match(/^(OK|FAILED)\b.*/) || [''])[0];
      if (!status || /expected failures|unexpected successes/.test(status)) return null; // neither passed nor failed
      const failed = (num(status, /failures=(\d+)/) || 0) + (num(status, /errors=(\d+)/) || 0);
      return counts(num(line, /^Ran (\d+)/) - failed - (num(status, /skipped=(\d+)/) || 0), failed);
    },
  },
  // cargo "test result: ok. 4 passed; 0 failed", one line per test binary
  { re: /^test result: \w+\. \d+ passed; \d+ failed\b.*$/gm, read: (t, line) => counts(num(line, /(\d+) passed/), num(line, /(\d+) failed/)) },
];

export function testCounts(output) {
  const t = stripAnsi(output);
  const found = SUMMARIES.flatMap((s) => [...t.matchAll(s.re)].map((m) => ({ s, line: m[0] })));
  return found.length === 1 ? found[0].s.read(t, found[0].line) : null;
}
