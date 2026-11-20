// Deterministic signals. No AI in the decision path.
import { testChanges, languageOf } from './noskip.js';
import { unquotePath, hunkReader } from './gitpath.js';

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

// The names the common runners collect (cold review, L13 round 7): a test folder, a .NET test project (Cart.Tests/),
// .test. and .spec., _test (Go, Python, Ruby, Dart, Elixir, Deno and node --test), and pytest's test_*.py. Not
// node's test-*.js, *-test.js and test.js: those also name helpers and features (test-utils.js, ab-test.js), and
// deleting one is not deleting a test (round 8, m1).
const CODE_EXT = String.raw`(?:go|py|rb|dart|exs?|[cm]?[jt]sx?)`;
const TEST_NAME = new RegExp(String.raw`\.(test|spec)\.[a-z]+$|_test\.${CODE_EXT}$|(^|\/)test_[^/]+\.py$`, 'i');
const TEST_FILE = new RegExp(String.raw`(^|\/)(test|tests|__tests__|spec)\/|(^|\/)[^/]+\.tests?\/|${TEST_NAME.source}`, 'i');
// TEST_NAME is the name a runner collects a test file by, wherever it is: pytest, jest and vitest do not collect test/cart.js.
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
const REPLACED = 'test-replaced';

const TAMPER_ADDED = [
  // with modifiers between the name and .skip, and .each after it: test.concurrent.skip, it.skip.each (round 19)
  // modifiers after .skip too, .for as well as .each, and a TypeScript generic before the call (round 20)
  { re: /\b(it|test|describe)(?:\.(?:describe|concurrent|serial|parallel|sequential))*\.skip(?:\.(?:concurrent|sequential|shuffle|fails|failing|each|for))*\s*(?:<[^<>()\n]*>\s*)?[(`]/, kind: SKIPPED, why: 'a test was skipped (.skip)' },
  { re: /\b(xit|xdescribe|xtest)(?:\.(?:each|for))?\s*(?:<[^<>()\n]*>\s*)?[(`]/, kind: SKIPPED, why: 'a test was disabled (xit/xdescribe)' },
  // skip, and skipif or skipIf only when the condition is a literal: skipUnless(shutil.which("uv")) is a
  // test that cannot run on this machine, as { skip: process.platform === 'win32' } is in JS
  // a whole module (pytestmark) too (round 19); a conftest hook's add_marker is not read, since the honest form gates it
  // on an option (round 20)
  { re: /@pytest\.mark\.skip\b|\bunittest\.skip\s*\(|\b(skipif|skipIf)\s*\(\s*True\b|\bskipUnless\s*\(\s*False\b|\bpytestmark\s*=(?:[^#\n"']|"[^"\n]*"|'[^'\n]*'){0,500}?\bpytest\.mark\.skip\b/, kind: SKIPPED, why: 'a Python test was skipped' },
  { re: /@ts-nocheck/, kind: CHECKS_OFF, why: 'type checking was turned off (@ts-nocheck)' },
  { re: /--no-verify/, kind: CHECKS_OFF, why: 'git hooks were bypassed (--no-verify)' },
  { re: /expect\([^)]*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)\s*;?\s*\/\/\s*(todo|temp|hack)/i, kind: WEAKENED, why: 'an assertion was replaced with a placeholder' },
];

// Only in test files: elsewhere `{ skip: true }` or `assert.equal(1, 1)` can be ordinary code.
const LITERAL = String.raw`(\d+(?:\.\d+)?|true|false|null|'[^']*'|"[^"]*")`;
const TAMPER_ADDED_IN_TESTS = [
  // mocha's other names, read only in test files: context.skip( is a plausible call in other code (round 19)
  { re: /\b(context|suite|specify)(?:\.(?:describe|concurrent|serial|parallel|sequential))*\.skip(?:\.(?:concurrent|sequential|shuffle|fails|failing|each|for))*\s*(?:<[^<>()\n]*>\s*)?[(`]|\b(xcontext|xspecify)\s*\(/, kind: SKIPPED, why: 'a test was skipped (.skip)' },
  // node:test's it.todo(name, fn) runs the test but does not fail on it; jest's test.todo(name) has no function (round 20)
  { re: /(?<![.\w])(it|test|describe|suite)\.todo\s*\(\s*(['"`])(?:(?!\2)[^\\]|\\.)*\2\s*,/, kind: SKIPPED, why: 'a test was skipped (.todo)' },
  // test('name', { skip: true }, ...): the name cannot run past its closing quote, so the options are this test's
  { re: /(?<![.\w])(it|test|describe|suite)\s*\(\s*(['"`])(?:(?!\2)[^\\]|\\.)*\2\s*,\s*\{[^}]*\b(skip|todo)\s*:\s*(true\b|['"`])/, kind: SKIPPED, why: 'a test was skipped ({ skip: true })' },
  // fit/fdescribe only in jest's form, starting a statement with a quoted name then a callback:
  // `fit(` alone is a common function name
  { re: /(?<![.\w])(it|test|describe|context|suite|specify)(?:\.(?:describe|concurrent|serial|parallel|sequential))*\.only(?:\.(?:concurrent|sequential|shuffle|fails|failing|each|for))*\s*(?:<[^<>()\n]*>\s*)?[(`]|^[+-]\s*(?:fit|fdescribe)\.each\s*[(`]|^[+-]\s*(fit|fdescribe)\s*\(\s*(['"`])(?:(?!\3)[^\\]|\\.)*\3\s*,\s*(async\s+)?(\(|function\b|\w+\s*=>)/, kind: SKIPPED, why: 'other tests were turned off (.only)' },
  { re: /\bassert(\.ok)?\(\s*true\s*\)|^\+\s*assert\s+True\s*$/, kind: WEAKENED, why: 'an assertion that cannot fail was added' },
  { re: new RegExp(String.raw`\bassert\.\w+\(\s*${LITERAL}\s*,\s*\1\s*\)`), kind: WEAKENED, why: 'an assertion that cannot fail was added' },
  { re: new RegExp(String.raw`\bexpect\(\s*${LITERAL}\s*\)\.(toBe|toEqual|toStrictEqual)\(\s*\1\s*\)`), kind: WEAKENED, why: 'an assertion that cannot fail was added' },
];
// assert(...), assert.equal(...), expect(...), self.assertEqual(...), .NET's Assert.Equal(...), and pytest's bare
// `assert x`; not expect.objectContaining(...) and the other matchers inside one assertion
const ASSERT = /\b(expect\s*\(|assert[\w.]*\s*\(|Assert\.\w+\s*\()|^[+-]\s*assert\s/;
// package.json's test script made to pass whatever the tests do: `|| true`, `|| :`, `|| echo`, `; exit 0`
const ALWAYS_PASSES = /"test"\s*:\s*"(?:[^"\\]|\\.)*?(\|\|\s*(true|:|exit\s+0|echo\b[^"&|;]*)|;\s*(true|exit\s+0))\s*"/; // \" inside the script too (round 13)
const COMMENT = /^[+-]\s*(\/\/|#|\/\*|\*)\s*/;
// a comment line in the diff; in an ini file a ; line too, as pytest reads it (round 15)
const commented = (file, line) => COMMENT.test(line) || (/\.(ini|cfg)$/.test(file) && /^[+-]\s*;/.test(line));

// Options that make the runner leave tests out (node --test, jest, vitest, mocha, playwright, pytest,
// go, cargo), on a test script or a pytest addopts line. Reporter, coverage and other options are not.
const FILTER_NAMES = String.raw`--test-skip-pattern|--test-name-pattern|--testPathIgnorePatterns|--testNamePattern|--testPathPatterns?|--grep-invert|--grep|--fgrep|--invert|--ignore(?:-glob)?|--deselect|--skip|-skip|-run|-k`;
const FILTER = new RegExp(String.raw`(?:^|\s)(${FILTER_NAMES})(?=[\s=]|$)`, 'g');
const TEST_SCRIPT = /"(test(?::[^"]*)?)"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const ADDOPTS = /^[+-]\s*"?addopts"?\s*[=:](.*?)\r?$/; // pytest reads addopts: in an ini file too; a CRLF line (round 15)
// pytest's config files, pytest 9's pytest.toml and the hidden names too (round 17)
const PYTEST_CONFIG = /(^|\/)(\.?pytest\.ini|\.?pytest\.toml|pyproject\.toml|setup\.cfg|tox\.ini)$/;
// The same, as keys in a runner's own config file
const RUNNER_CONFIG = /(^|\/)(jest|vitest|playwright)\.config\.[\w.]+$|(^|\/)\.mocharc(\.[\w]+)?$/;
const CONFIG_KEY = /(?:^|[\s{,'"])(testPathIgnorePatterns|testNamePattern|testIgnore|grepInvert|grep|invert|ignore)['"]?\s*:/g;
export const isTestConfig = (file) => /(^|\/)package\.json$/.test(file) || PYTEST_CONFIG.test(file) || RUNNER_CONFIG.test(file);

// The options a line of this file sets that leave tests out, with where they were set.
function filtersOn(file, line) {
  if (/(^|\/)package\.json$/.test(file)) {
    // every script on the line (a one-line package.json holds them all: round 13), as npm runs it (\" is a quote: round 12)
    const scripts = [...line.matchAll(TEST_SCRIPT_G)].flatMap((m) => {
      try {
        return filtersOn.script(m[1], JSON.parse(`"${m[2]}"`));
      } catch {
        return filtersOn.script(m[1], m[2]);
      }
    });
    // jest's own config under package.json's "jest" key (round 12)
    // at is where the key's name starts, after its quote (round 14)
    const jest = PKG_JEST_KEY.test(line) ? [...line.slice(1).matchAll(PKG_JEST_KEY_G)].map((m) => ({ option: m[1], where: "by the test runner's config", script: null, text: line.slice(1), at: m.index + 1 })) : [];
    return [...scripts, ...jest];
  }
  if (PYTEST_CONFIG.test(file)) {
    const value = (ADDOPTS.exec(line) || [])[1];
    return value == null ? [] : pytestFilters(file, value);
  }
  if (!RUNNER_CONFIG.test(file)) return [];
  const text = line.slice(1);
  return [...text.matchAll(CONFIG_KEY)].map((m) => ({ option: m[1], where: "by the test runner's config", script: null, text, at: m.index + m[0].indexOf(m[1]) }));
}
// addopts as pytest splits it into arguments: in pyproject.toml a TOML list's items, or a TOML string split as a shell
// splits it; in an ini file the text split as a shell splits it. A quoted argument stays one (-k "not slow": round
// 14), and an argument that holds an option and its value is read as both ("-k not cart": round 15).
// a TOML string's text: a basic string's \" and \\ are unescaped (round 15), a literal string is as written, and a
// multi-line """ or ''' string is matched before the empty "" its quotes would otherwise make (round 16)
const tomlItems = (s) => [...s.matchAll(/"""([\s\S]*?)"""|'''([\s\S]*?)'''|"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? (m[3] != null ? m[3].replace(/\\(["\\])/g, '$1') : m[4]));
function pytestArgs(file, text, inList = false) {
  if (!/\.toml$/.test(file)) return shellWords(text);
  const v = text.split('\n').map(dropComment).join('\n').trim(); // quotes inside a # comment are not items (round 15)
  return inList || v.startsWith('[') ? tomlItems(v) : shellWords(tomlItems(v)[0] ?? v);
}
const pytestFilters = (file, text, inList) => argFilters(pytestArgs(file, text, inList)).map((a) => ({ option: a.option, where: "by the test runner's options", script: null, text, values: [a.value] }));
// a config line without its comment, cut outside quotes: `[ // build output` holds no value (round 14)
function dropComment(v) {
  for (let i = 0, q = ''; i < v.length; i++) {
    const c = v[i];
    if (q) q = c === '\\' ? (i++, q) : c === q ? '' : q;
    else if (`'"\``.includes(c)) q = c;
    else if ((c === '#' || (c === '/' && v[i + 1] === '/')) && (i === 0 || /[\s[,]/.test(v[i - 1]))) return v.slice(0, i);
  }
  return v;
}
// A whole config, read the way the runner reads it (round 15). Arguments split as a shell splits them; the filters
// in a list of arguments: --opt value, --opt=value, and pytest's -kvalue or "-k value" as one argument.
const FILTER_ARG = new RegExp(String.raw`^(${FILTER_NAMES})(?:=([\s\S]*))?$`);
function shellWords(s) {
  const out = [];
  let cur = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (cur != null) out.push(cur), (cur = null);
      continue;
    }
    cur ??= '';
    if (c === '"' || c === "'") {
      const end = s.indexOf(c, i + 1);
      cur += end < 0 ? s.slice(i + 1) : s.slice(i + 1, end);
      i = end < 0 ? s.length : end;
    } else if (c === '\\' && i + 1 < s.length) cur += s[++i];
    else cur += c;
  }
  if (cur != null) out.push(cur);
  return out;
}
// a -k made only of `not x and not y` terms is the same filter in any order: its terms sorted (rounds 19 and 20)
const normK = (option, v) => (option === '-k' && /^\s*not\s+[^\s()]+(?:\s+and\s+not\s+[^\s()]+)*\s*$/.test(v) ? [...v.matchAll(/not\s+([^\s()]+)/g)].map((m) => m[1]).sort().map((t) => `not ${t}`).join(' and ') : v);
// a list a variable holds: its declaration at a line's start or after another statement (rounds 16, 19, 20); the
// type before the = stops at a ; so a search costs no more than the line
const DECL = /(?:^|[;{}])\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=\n;]*)?=\s*\[/;
// the [ and ] of a line outside its quoted strings (a [ in '^(?!\\[wip)' opens no list: round 20), over the whole line
// (round 19); a quote with no closing quote on the line is a plain character, and one pass keeps it linear
function bracketsOf(l) {
  const out = [];
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < l.length && l[j] !== c) j += l[j] === '\\' ? 2 : 1;
      if (j < l.length) i = j;
    } else if (c === '[' || c === ']') out.push(c);
  }
  return out;
}
function argFilters(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const m = FILTER_ARG.exec(args[i]);
    if (m) {
      const takes = m[1] !== '--invert' && m[2] == null && i + 1 < args.length && !/^-/.test(args[i + 1]);
      out.push({ option: m[1], value: normK(m[1], m[2] ?? (takes ? args[++i] : '')) });
      continue;
    }
    const k = /^-k([\s\S]+)$/.exec(args[i]);
    if (k) out.push({ option: '-k', value: normK('-k', k[1].replace(/^=/, '').trim()) });
  }
  return out;
}
// JavaScript or JSON without its comments, outside quotes; line breaks kept, so line numbers hold
function stripJsComments(text) {
  let out = '';
  for (let i = 0, q = ''; i < text.length; i++) {
    const c = text[i];
    if (q) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === q || (c === '\n' && q !== '`')) q = '';
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const body = end < 0 ? text.slice(i) : text.slice(i, end + 2);
      out += body.replace(/[^\n]/g, ' ');
      i = end < 0 ? text.length : end + 1;
    } else if (c === '\\') out += c + (text[++i] ?? '');
    else {
      if (`'"\``.includes(c)) q = c;
      out += c;
    }
  }
  return out;
}
const JEST_T = /(?:^|[\s;&|(/])(?:jest|vitest)(?:\.[cm]?js)?\s(?:[^&|;]*?\s)?-t(?=[\s=]|$)/; // also by its path (round 11)
const PKG_JEST_KEY = /"(testPathIgnorePatterns|testNamePattern)"\s*:/;
const TEST_SCRIPT_G = new RegExp(TEST_SCRIPT.source, 'g');
// one test script's filters, by its name and its text as npm runs it
filtersOn.script = (script, text) => {
  const where = 'by the test script';
  const found = [...text.matchAll(FILTER)].map((m) => ({ option: m[1], where, script, text }));
  // jest's and vitest's -t (--testNamePattern); mocha's -t is a timeout, so only after jest or vitest as the command
  // word, not inside jest-extended or vitest.config.ts (rounds 9 and 10)
  if (JEST_T.test(text)) found.push({ option: '-t', where, script, text });
  return found;
};
const PKG_JEST_KEY_G = new RegExp(PKG_JEST_KEY.source, 'g');

// Which characters of a line are inside a string literal: test code often writes another test as
// text, and a skip in that text is not a skip. One line at a time, so a string that spans lines (a
// template literal, a docstring) is not seen; after // or a # comment, no quote opens a string. A quote in a
// /* comment */ or a regex literal opens none either, so "/* don't */ it.skip(" is a skip (cold review, L13
// round 5). A / starts a regex where an expression can start: after an operator, a bracket or nothing.
function stringMask(line) {
  const mask = new Uint8Array(line.length);
  let quote = '';
  let last = ''; // the last character outside strings and comments that is not a space
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      mask[i] = 1;
      if (c === '\\') mask[++i] = 1;
      else if (c === quote) (quote = ''), (last = c);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') (quote = c), (mask[i] = 1);
    else if (c === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    } else if ((c === '/' && line[i + 1] === '/') || (c === '#' && (i <= 1 || /\s/.test(line[i - 1])))) break;
    else if (c === '/' && (!last || '(,=:[!&|?{};+-*%<>~^'.includes(last) || REGEX_AFTER.test(line.slice(Math.max(0, i - 12), i)))) {
      let j = i + 1;
      for (let inClass = false; j < line.length; j++) {
        if (line[j] === '\\') j++;
        else if (line[j] === '[') inClass = true;
        else if (line[j] === ']') inClass = false;
        else if (line[j] === '/' && !inClass) break;
      }
      if (j < line.length) i = j;
    }
    if (!/\s/.test(c)) last = line[i];
  }
  mask.open = quote;
  return mask;
}
const REGEX_AFTER = /(?:^|[^\w$.])(?:return|typeof|void|delete|in|of|instanceof|new|throw|case|do|else|yield|await)\s*$/;

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
// The literals a condition singles an input out by: price === 250, 250 == price, [250].includes(price),
// price in (250,), Object.is(price, 250). A literal inside arithmetic (n % 15 === 0) is not one (cold review,
// L13 round 5); a comment after it does not make it arithmetic (round 6).
const LIT = String.raw`-?\d[\d_]*(?:\.\d+)?(?![\w$])|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;
const LITS = String.raw`(?:${LIT})(?:\s*,\s*(?:${LIT}))*\s*,?`;
const COMPARED = new RegExp(
  [
    String.raw`(?<![=!<>])===?\s*(${LIT})(?!\s*(?:[-+*%]|\/(?![/*])))`,
    String.raw`(?<![-+*/%]\s*|[\w$.])(${LIT})\s*===?(?!=)`,
    String.raw`\[\s*(${LITS})\s*\]\s*\.includes\s*\(`,
    String.raw`\bin\s*[[({]\s*(${LITS})\s*[\])}]`,
    String.raw`\bObject\.is\s*\(([^()]*)\)`,
  ].join('|'),
  'g'
);
function comparedLiterals(cond) {
  return [...String(cond).matchAll(COMPARED)].flatMap((m) => literals(m.slice(1).find((x) => x !== undefined)));
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

// CI files, and the commands in them that run the tests
// at the repo's top, where CI reads them: one moved elsewhere no longer runs (round 10)
const CI_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$|^\.circleci\/config\.yml$|^(azure|bitbucket)-pipelines\.yml$/; // the names each reads by default (round 12)
// Every file that says what the tests are or how they run: test code in a language the scan reads, test configs,
// test setup and CI files. Codehere keeps its own record of these at session start, so a change to one is read
// even when git does not show it (docs/finish-check-promise.md). Data in a test folder is not one.
// A CI file at the repo's top; ../ in front when Codehere is set up in a subfolder of the repo (round 11)
export const isCiFile = (f) => CI_FILE.test(String(f).replace(/^(\.\.\/)+/, ''));
// The same for a known setup: up is the path from Codehere's folder to the repo's top ('' at the top, '../..' in a
// package), so the package's own .github/workflows is not the repo's CI (round 12)
export const ciFileIn = (up) => (f) => (up ? String(f).startsWith(`${up}/`) && CI_FILE.test(String(f).slice(up.length + 1)) : CI_FILE.test(String(f)));
export const isCheckFile = (f) => (isTestFile(f) && languageOf(f) != null) || isTestConfig(f) || isCiFile(f) || TEST_SETUP.test(f);
// Test code only: a check file that is not a config, setup or CI file. New test code in a folder git ignores is a
// build or an install, not the agent's tests; a new config or setup file changes how the tests run wherever it is.
export const isTestCode = (f) => isCheckFile(f) && !isTestConfig(f) && !isCiFile(f) && !TEST_SETUP.test(f);
// the common runners, workspace tools and build tools that run the tests (round 12)
const TEST_CMD = new RegExp(
  [
    String.raw`\b(?:npm|pnpm|yarn|bun)\b[^\n|&;]{0,200}?\btest\b`,
    String.raw`\b(?:turbo|nx|lerna)\b[^\n|&;]{0,200}?\btest\b`,
    String.raw`\bnode\s+--test\b`,
    String.raw`\b(?:npx\s+)?(?:jest|vitest|mocha)\b`,
    String.raw`\b(?:python3?\s+-m\s+)?pytest\b|\bpython3?\s+-m\s+unittest\b|\btox\b|\bnox\b`,
    String.raw`\bgo\s+test\b|\bcargo\s+(?:test|nextest)\b|\bmake\s+(?:test|check)\b|\bctest\b`,
    String.raw`\bgradlew?\b[^\n|&;]{0,200}?\b(?:test|check|build)\b|\bmvnw?\b[^\n|&;]{0,200}?\b(?:test|verify|install|package)\b`,
    String.raw`\bdotnet\s+test\b|\b(?:bundle\s+exec\s+)?(?:rspec|rake\s+test)\b|\bmix\s+test\b|\bswift\s+test\b`,
    String.raw`\bphpunit\b|\bpest\b|\b(?:dart|flutter)\s+test\b`,
  ].join('|')
);
// a CI line that runs the tests, then makes the step pass whatever they did: the first test command is found, then a
// fallback anywhere after it, so no length limit between them (round 14)
const FALLBACK = /\|\|\s*(?:true|:|exit\s+0|echo\b)|;\s*(?:true|exit\s+0)\s*$/;
const ciAlwaysPasses = (text) => {
  const t = TEST_CMD.exec(text);
  return !!t && FALLBACK.test(text.slice(t.index + t[0].length));
};
// a CI step's command, without what an echo prints (an echo that names npm test runs nothing: round 13; the command
// after it on the line still runs: round 14) and without a comment
const CI_STEP_KEY = /^\s*(?:-\s*)?(?:run|script|command|commands|cmd|before_script|after_script|test|bash|pwsh|powershell)\s*:/; // Azure's step keys too (round 14)
// a command that only prints (echo, printf, PowerShell's Write-Host), with its arguments: each argument a run of quoted
// and bare parts (Don\'t run npm test: round 15)
const ECHO_ARGS = /\b(?:echo|printf|Write-Host|Write-Output)\b(?:[ \t]+(?:"(?:[^"\\\n]|\\.)*"|'[^'\n]*'|\\.|[^\s&|;"'\\])+)*/gi;
const ciCommand = (text) => (/^\s*(?:-\s*)?[\w.-]+\s*:/.test(text) && !CI_STEP_KEY.test(text) ? '' : text.replace(ECHO_ARGS, '').replace(/\s#.*$/, ''));
// a CI step or job made to pass, or not to run: continue-on-error, allow_failure, if: false, GitLab's when: manual or
// never (round 15)
const CI_IGNORE = /^\s*(?:-\s+)?(?:(?:continue-on-error|continueOnError|allow_failure)\s*:\s*(?:true\b|\$\{\{\s*true\s*\}\})|enabled\s*:\s*false\b|if\s*:\s*(?:false|'false'|"false"|\$\{\{\s*false\s*\}\})\s*(?:#.*)?$|when\s*:\s*(?:manual|never)\b)/; // Azure's continueOnError and enabled, a quoted 'false' (round 16)

// Whether the YAML block a key at line `at` belongs to (its step or job) runs the tests.
function blockRunsTests(lines, at, text) {
  let i = at - 1;
  if ((lines[i] || '').trim() !== text.trim()) {
    const near = [-3, -2, -1, 1, 2, 3].map((d) => at - 1 + d).find((k) => (lines[k] || '').trim() === text.trim());
    if (near === undefined) return false;
    i = near;
  }
  const indent = (l) => l.length - l.trimStart().length;
  const parentOf = (k) => {
    const own = indent(lines[k] || '');
    let p = k;
    while (p > 0 && !((lines[p - 1] || '').trim() && indent(lines[p - 1]) < own)) p--;
    return Math.max(0, p - 1);
  };
  let start = parentOf(i);
  // GitLab's - when: never under rules: switches its whole job off; a switch that is the first key of a list item
  // (- if: false) is that item's, not the list's (round 16)
  if (/^\s*rules\s*:/.test(lines[start] || '')) start = parentOf(start);
  else if (/^\s*-\s/.test(lines[i])) start = i;
  const top = indent(lines[start] || '');
  for (let k = start; k < lines.length && k < start + 200; k++) {
    if (k > start && (lines[k] || '').trim() && indent(lines[k]) <= top) break;
    if (TEST_CMD.test((lines[k] || '').slice(0, 10000))) return true;
  }
  return false;
}

// re found in the code of the line, not only inside its strings. A ' or " string still open where the line ends
// means the mask lost its place, as at a regex literal it read as a division: the whole line is then read as
// code, so a stray quote cannot hide a skip (cold review, L13 round 6). Python's triple quotes and a line
// continued with \ do open strings that end on a later line.
const OPEN_ON_PURPOSE = /'''|"""|\\\s*$/;
function inCode(re, line, mask) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m = mask();
  if ((m.open === "'" || m.open === '"') && !OPEN_ON_PURPOSE.test(line)) m = [];
  for (const x of line.matchAll(g)) if (!m[x.index + (x[0].length - x[0].trimStart().length)]) return true;
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
// hardcoded answer would copy. testFiles, when given, is a function returning the paths of the repo's test
// files before the change (at session start, or at the commit's parent), called only for a test renamed to
// another code extension.
export function tamperEvents(nameStatus, diff, { read, tests, testFiles, command, up = '' } = {}) {
  // CI files at the repo's top: with Codehere set up in a subfolder, a path from root that starts with up/ (round 12)
  const isCi = ciFileIn(up);
  const events = [];
  const seen = new Set();
  const add = (kind, file, why) => {
    if (seen.has(why)) return;
    seen.add(why);
    events.push({ kind, file, why });
  };
  const ext = (f) => (f.match(/\.[^./]+$/) || [''])[0];
  // A rename to another code extension (.mjs to .ts) is a migration when tests the repo already had use that
  // extension, or other tests made the same move in this change. A lone test moved to one may stop running:
  // Node 22's test runner skips .ts files, Node 24's runs them (cold review, L13 round 5). A new file does not
  // count, so an empty zz.test.ts added beside the move does not make it one (round 6, m6).
  const entries = nameStatus.split('\n').map((line) => line.split('\t').map(unquotePath));
  const renames = entries.filter(([status, file, to]) => /^R\d*$/.test(status) && file && to && isTestFile(file));
  let others = null;
  const migrated = (file, to) =>
    languageOf(to) != null &&
    (renames.some(([, a, b]) => b !== to && ext(a) === ext(file) && ext(b) === ext(to)) ||
      (typeof testFiles === 'function' && (others ||= testFiles()).some((f) => f !== to && f !== file && ext(f) === ext(to))));
  for (const [status, file, to] of entries) {
    if (status === 'D' && file && isTestFile(file)) add(DELETED, file, `test file deleted: ${file}`);
    // a rename to a name that is not a test file, that drops the test name inside a test folder (test/cart.test.mjs
    // to test/cart.mjs), or to another extension (.off, .bak), hides the test
    const dropsName = TEST_NAME.test(file) && !TEST_NAME.test(to);
    if (/^R\d*$/.test(status) && to && isTestFile(file) && (!isTestFile(to) || dropsName || (ext(to) !== ext(file) && !migrated(file, to)))) add(DELETED, file, `test file renamed: ${file} to ${to}`);
  }
  // A test:* script counts unless nothing can run it: no other script names it or holds a glob matching it
  // (run-s test:*; a lint glob such as "src/**/*.js" is not one: round 12), and the approved command does not name it.
  // A side script such as test:smoke, called by nothing, is not what the tests run (round 10); a chain or a glob is
  // (round 11). Without the file as it is now (the audit), every one counts.
  const runsTests = (script, file) => {
    if (!script || script === 'test' || !read) return true;
    try {
      const scripts = JSON.parse(read(file) || '{}').scripts || {};
      // npm-run-all and run-s test:*, concurrently "npm:test:*" (the runner prefix dropped), pnpm run "/^test:/" (round 13)
      // or /^test:/ unquoted; a regex that does not compile runs nothing (round 14)
      const globbed = (v) =>
        (v.match(/[\w-]+:[\w:*-]*\*[\w:*-]*/g) || []).some((g) => new RegExp(`^${g.replace(/^(?:npm|pnpm|yarn|bun):/, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(script)) ||
        [...v.matchAll(/["']\/([^"'/]+)\/["']|(?:^|\s)\/([^\s"'/]+)\/(?=\s|$)/g)].some((m) => {
          try {
            return new RegExp(m[1] ?? m[2]).test(script);
          } catch {
            return false;
          }
        });
      const named = Object.entries(scripts).some(([k, v]) => k !== script && typeof v === 'string' && (v.includes(script) || globbed(v)));
      return named || String(command || '').includes(script);
    } catch {
      return true;
    }
  };
  // A filter option's values: a filter that already held some is new again when a value is added, such as a second
  // path in testPathIgnorePatterns or a second --ignore (round 11). In a config, only the key's own value counts, not
  // other keys on the same line (round 12).
  const filterKey = (f) => `${f.script || ''}\0${f.option}`;
  // the key's value from where the key matched (its name can appear in an earlier value), a list to its closing bracket
  // outside quotes (an item can hold brackets: round 13)
  const ownValue = (text, key, at = text.indexOf(key)) => {
    if (at < 0) return text;
    const rest = text.slice(at + key.length).replace(/^['"]?\s*:\s*/, '');
    if (!rest.startsWith('[')) {
      const end = rest.search(/[,}]/);
      return end > 0 ? rest.slice(0, end) : rest;
    }
    for (let i = 1, depth = 1, q = ''; i < rest.length; i++) {
      const c = rest[i];
      if (q) q = c === '\\' ? (i++, q) : c === q ? '' : q;
      else if (`'"\``.includes(c)) q = c;
      else if (c === '[') depth++;
      else if (c === ']' && !--depth) return rest.slice(0, i + 1);
    }
    return rest;
  };
  const quoted = (text) => [...text.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const regexes = (v) => [...v.matchAll(/\/((?:[^/\\\n]|\\.)+)\//g)].map((m) => m[1]);
  // the values on a line inside a list: its quoted strings, else its regex literals (testIgnore: /.*cart.*/: round 15),
  // and a YAML block item's bare text (- test/cart.spec.js)
  const itemValues = (text, yaml) => {
    const t = dropComment(text);
    const q = quoted(t);
    if (q.length) return q;
    if (!yaml) return regexes(t);
    const bare = t.replace(/^\s*-\s*/, '').trim();
    return bare ? [bare] : [];
  };
  // a config value: its quoted strings, else a regex literal (grepInvert: /@flaky/), else the bare word (YAML grep: smoke)
  const configValues = (value) => {
    const v = dropComment(value);
    const q = quoted(v);
    if (q.length) return q;
    const rx = regexes(v);
    if (rx.length) return rx;
    const bare = v.replace(/^[\s[]+|[\s\],;]+$/g, '');
    return bare ? [bare] : [];
  };
  const filterValues = (f) => {
    if (f.values) return f.values;
    if (f.where === "by the test runner's config") return configValues(ownValue(f.text, f.option, f.at));
    const opt = f.option.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    // without their outer quotes: -k 'not slow' and -k "not slow" are one value (round 14)
    return [...f.text.matchAll(new RegExp(`(?:^|\\s)${opt}(?:=|\\s+)("[^"]*"|'[^']*'|[^\\s"']+)`, 'g'))].map((m) => normK(f.option, m[1].replace(/^(["'])([\s\S]*)\1$/, '$2')));
  };
  // a key line that opens a list whose items come on the next lines, or a YAML key with an empty value (round 15): the
  // items are judged one by one
  const opensList = (f) => {
    const v = f.where === "by the test runner's config" ? ownValue(f.text, f.option, f.at) : null;
    return v != null && (/\[[^\]]*$/.test(v) || !dropComment(v).trim());
  };
  const filterSeen = (had, f) => {
    const set = had.get(filterKey(f)) || new Set();
    const vals = filterValues(f);
    vals.forEach((v) => set.add(v));
    if (!vals.length) set.add('');
    had.set(filterKey(f), set);
  };
  const filterIsNew = (f, extra = new Set()) => {
    const had = hadFilters.get(filterKey(f));
    const vals = filterValues(f);
    if (!runsTests(f.script, current)) return false;
    // with no key line before (an item moved inside a wrapped list), the values the removed lines held count (round 13)
    if (!had) return !vals.length || vals.some((v) => !extra.has(v));
    return vals.length ? vals.some((v) => !had.has(v) && !extra.has(v)) : opensList(f) ? false : !had.has('');
  };
  // Which key each line of a config sits under when it names none: a line inside a list or an addopts block that
  // starts on an earlier line (testPathIgnorePatterns: [ ... ], addopts = then indented lines: round 12; a pyproject
  // addopts = [ list, indented or not, and a YAML block list under ignore: round 14). One pass places every line, so a
  // long config costs one read (a line-by-line walk timed out on 200,000 lines).
  const OPTIONS = { kind: 'options', where: "by the test runner's options" };
  const closesList = (line) => /\]/.test(line.replace(/"(?:[^"\\]|\\.)*"|'[^']*'|#.*$/g, ''));
  const placeLines = (file, lines) => {
    const out = new Array(lines.length).fill(null);
    const pytest = PYTEST_CONFIG.test(file);
    const yaml = /\.ya?ml$/.test(file);
    const keyRe = RUNNER_CONFIG.test(file) ? new RegExp(CONFIG_KEY.source) : /(^|\/)package\.json$/.test(file) ? PKG_JEST_KEY : null;
    const stack = [];
    let inAddopts = false;
    let inList = false;
    let block = null;
    for (let k = 0; k < lines.length; k++) {
      const line = String(lines[k] ?? '').slice(0, 10000);
      if (pytest) {
        if (inList) (out[k] = OPTIONS), (inList = !closesList(line));
        else if (/^\s+\S/.test(line)) out[k] = inAddopts ? OPTIONS : null;
        else if (line.trim()) (inAddopts = /^\s*"?addopts"?\s*[=:]/.test(line)), (inList = inAddopts && /=\s*\[/.test(line) && !closesList(line));
        continue;
      }
      if (!keyRe) continue;
      const m = keyRe.exec(line);
      if (yaml) {
        const indent = /^\s*(#|$)/.test(line) ? -1 : line.search(/\S/); // a comment line keeps the block, as a blank one does (round 15)
        if (block && indent >= 0 && (indent > block.indent || (indent === block.indent && /^\s*-(\s|$)/.test(line)))) {
          out[k] = block.place;
          continue;
        }
        if (indent >= 0) block = m && /:\s*(#.*)?$/.test(line) ? { indent, place: { kind: 'items', option: m[1], where: "by the test runner's config", yaml: true } } : null;
      }
      out[k] = stack.length ? stack[stack.length - 1] : null;
      // a list a variable holds (const ignored = [ ... ]) is placed under its name, for a key that names it (round 15)
      const name = m ? null : DECL.exec(line);
      for (const c of bracketsOf(String(lines[k] ?? ''))) {
        if (c === '[') stack.push(m ? { kind: 'items', option: m[1], where: "by the test runner's config" } : name && !stack.length ? { kind: 'items', name: name[1] } : stack[stack.length - 1] || null);
        else stack.pop();
      }
    }
    return out;
  };
  // where an added line sits, in the file as it is now; null without the file
  const keyed = new Map();
  const enclosing = (file, at) => {
    if (!read || !at) return null;
    if (!keyed.has(file)) keyed.set(file, placeLines(file, (read(file) || '').split('\n')));
    return keyed.get(file)[at - 1] || null;
  };
  // The file as it was at the start, from the file as it is now and its hunks, with the line each removed line was on,
  // so a removed line is placed under the key the start file held it under, as an added line is under the file now
  // (round 14: a --deselect under tox's commands is not an addopts value). Null without the file or hunk headers, or
  // when the file read does not match the diff (cut at 1 MiB, or changed since): those are read line by line.
  const startVersion = (now, body) => {
    if (now == null || !body.some((l) => l.startsWith('@@'))) return null;
    const lines = now.split('\n');
    const old = [];
    const at = new Map(); // the body's index of a removed line, to its line number at the start
    let n = 1; // the next line of the file now
    let same = true; // every added and context line matches the file read: not cut at 1 MiB or changed since (round 15)
    body.forEach((line, i) => {
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (h) for (const first = h[2] === '0' ? +h[1] + 1 : +h[1]; n < first; n++) (same &&= n <= lines.length), old.push(lines[n - 1] ?? '');
      else if (line.startsWith('-')) at.set(i, old.push(line.slice(1)));
      else if (line.startsWith('+')) (same &&= lines[n - 1] === line.slice(1)), n++;
      else if (line.startsWith(' ')) (same &&= lines[n - 1] === line.slice(1)), old.push(lines[n++ - 1] ?? '');
    });
    for (; n <= lines.length; n++) old.push(lines[n - 1]);
    return same ? { lines: old, at } : null;
  };
  // Every filter a test config sets, read from the whole file, as script and option to values (round 15). The finish
  // check compares the file at session start with the file now, so how lines are wrapped, sorted, commented or placed
  // does not count, only what the runner is told to leave out. package.json is read as JSON; pytest's addopts as
  // pytest splits it, and tox's commands when the approved command runs tox; a runner's config without its comments,
  // with a list a variable holds read where a key names it.
  const configFilters = (file, raw) => {
    const lines = raw.map((l) => String(l ?? '').replace(/\r$/, '')); // a CRLF file (round 15)
    const out = new Map();
    // each value is counted by the places that set it, so a value one place sets, added in a second place (another
    // jest project, another tox env), is new there (round 16)
    const put = (option, where, script, values) => {
      const key = `${script || ''}\0${option}`;
      const e = out.get(key) || out.set(key, { option, where, script, values: new Map() }).get(key);
      for (const v of new Set(values.map((x) => normK(option, x)))) e.values.set(v, (e.values.get(v) || 0) + 1);
    };
    if (/(^|\/)package\.json$/.test(file)) {
      let pkg = null;
      try {
        pkg = JSON.parse(lines.join('\n'));
      } catch {}
      if (!pkg || typeof pkg !== 'object') {
        // not JSON, an edit half done: line by line
        for (const line of lines) for (const f of filtersOn(file, `+${line}`)) put(f.option, f.where, f.script, filterValues(f).length ? filterValues(f) : ['']);
        return out;
      }
      for (const [name, script] of Object.entries(pkg.scripts || {})) {
        if (typeof script !== 'string' || !/^test(:|$)/.test(name)) continue;
        for (const f of filtersOn.script(name, script)) put(f.option, f.where, name, filterValues(f).length ? filterValues(f) : ['']);
      }
      // jest's own keys, and the same keys in each of jest's projects (round 16)
      const jest = (o) => {
        for (const key of ['testPathIgnorePatterns', 'testNamePattern']) {
          const v = o && typeof o === 'object' ? o[key] : null;
          if (v != null) put(key, "by the test runner's config", null, (Array.isArray(v) ? v : [v]).map(String));
        }
      };
      jest(pkg.jest);
      if (Array.isArray(pkg.jest?.projects)) pkg.jest.projects.forEach(jest);
      return out;
    }
    if (PYTEST_CONFIG.test(file)) {
      const toml = /\.toml$/.test(file);
      // tox's commands count when the approved command runs tox, as a command word (round 16: not tox.ini)
      // by its path or in a subshell too (.venv/bin/tox, (cd x && tox): round 17)
      const tox = /(^|\/)tox\.ini$/.test(file) && /(^|[\s;&|(/])tox(?=[\s;&|)]|$)/.test(String(command || ''));
      const blocks = [];
      let block = null;
      for (const line of lines) {
        if (toml) {
          if (block?.open) {
            block.text.push(block.close ? line : dropComment(line));
            block.open = block.close ? !line.includes(block.close) : !closesList(dropComment(line));
            continue;
          }
          if (/^\s*#/.test(line)) continue;
          const m = /^\s*"?addopts"?\s*=(.*)$/.exec(dropComment(line));
          if (!m) continue;
          // a list, or a multi-line string between """ or ''' (round 16)
          const triple = /^\s*("""|''')/.exec(m[1]);
          const value = triple ? line.slice(line.indexOf('=') + 1) : m[1];
          const open = triple ? value.indexOf(triple[1], value.indexOf(triple[1]) + 3) < 0 : /^\s*\[/.test(value) && !closesList(value);
          blocks.push((block = { kind: 'addopts', text: [value], open, close: triple?.[1] }));
          continue;
        }
        if (/^\s*[#;]/.test(line)) continue; // an ini comment line
        if (block && /^\s+\S/.test(line)) {
          block.text.push(line);
          continue;
        }
        if (line.trim()) block = null;
        const m = /^\s*(addopts|commands)\s*[=:](.*)$/.exec(line);
        if (m && (m[1] === 'addopts' || tox)) blocks.push((block = { kind: m[1], text: [m[2]] }));
      }
      for (const b of blocks) {
        if (b.kind === 'commands') {
          // each line is a command, read as tox reads it: a # comment cut first, then a line ending in \ (spaces after
          // it too) joined with the next (rounds 17 and 18); only a pytest command's arguments are pytest's, not a
          // linter's --ignore (round 16)
          const text = b.text
            .map((l) => {
              const at = l.search(/(?<!\\)#/); // linear: a pattern with \s* before the # was quadratic on spaces (round 19)
              return at < 0 ? l : l.slice(0, at).trimEnd();
            })
            .join('\n');
          for (const cmd of text.split(/(?<!\\[ \t]*)\n/).map((c) => c.replace(/\\[ \t]*\n/g, ' '))) {
            const words = shellWords(cmd);
            const at = words.findIndex((w, i) => /(^|\/)py\.?test$/.test(w) || (w === '-m' && /^py\.?test$/.test(words[i + 1] || '')));
            if (at < 0) continue;
            for (const f of argFilters(words.slice(at + (words[at] === '-m' ? 2 : 1)))) put(f.option, "by tox's commands", 'tox', [f.value]);
          }
          continue;
        }
        const joined = b.text.join('\n');
        const args = !toml ? shellWords(joined) : /^\s*\[/.test(joined) ? tomlItems(joined) : shellWords(tomlItems(joined)[0] ?? joined);
        for (const f of argFilters(args)) put(f.option, "by the test runner's options", null, [f.value]);
      }
      return out;
    }
    if (RUNNER_CONFIG.test(file)) {
      const yaml = /\.ya?ml$/.test(file);
      const where = "by the test runner's config";
      const clean = yaml ? lines.map((l) => dropComment(l)) : stripJsComments(lines.join('\n')).split('\n');
      const places = placeLines(file, clean);
      const lists = new Map(); // a list a variable holds: its name to its values
      const refs = []; // a key, or a ...spread, that names a variable
      const keyOn = (l) => new RegExp(CONFIG_KEY.source).test(l);
      // the next line with text, as a key's value when the key's own line holds none (Prettier breaks a long string
      // after the colon: round 16)
      const nextValue = (k) => {
        for (let j = k + 1; j < clean.length; j++) if (clean[j].trim()) return keyOn(clean[j]) || /^\s*[\]}]/.test(clean[j]) ? '' : clean[j];
        return '';
      };
      clean.forEach((line, k) => {
        const keys = [...line.matchAll(CONFIG_KEY)];
        for (const m of keys) {
          const at = m.index + m[0].indexOf(m[1]);
          // a YAML value runs to the end of the line (mocha splits ignore: a, b on the comma: round 16)
          let v = yaml ? line.slice(m.index + m[0].length) : ownValue(line, m[1], at);
          let vals;
          if (yaml && /^\s*[|>][-+]?\d*\s*$/.test(v)) {
            // a block scalar (grep: >- with the text on the lines under it) is that text (round 15)
            const indent = line.search(/\S/);
            let end = k + 1;
            while (end < clean.length && (!clean[end].trim() || clean[end].search(/\S/) > indent)) end++;
            vals = [clean.slice(k + 1, end).map((l) => l.trim()).filter(Boolean).join(v.trim()[0] === '>' ? ' ' : '\n')];
          } else if (yaml) vals = quoted(v).length ? quoted(v) : v.replace(/^[\s[]+|[\s\]]+$/g, '').split(/\s*,\s*/).filter(Boolean);
          else {
            if (!v.trim()) v = nextValue(k);
            // a ...spread names a variable's list; its own text is not a value (round 17)
            vals = configValues(v.replace(/\.\.\.[\w$]+\s*,?/g, ''));
            for (const s of v.matchAll(/\.\.\.([\w$]+)/g)) refs.push([m[1], s[1]]);
          }
          if (!yaml && vals.length === 1 && !quoted(v).length && /^[A-Za-z_$][\w$]*$/.test(vals[0])) refs.push([m[1], vals[0]]);
          else put(m[1], where, null, vals);
        }
        if (keys.length) return;
        // a list a variable holds: the values on its own line too, and a type before the = (round 16)
        // the declaration found in the line's first 10,000 characters (a bounded search: round 17), its list read
        // from the whole line (round 18)
        const decl = yaml ? null : DECL.exec(line.slice(0, 10000));
        if (decl) lists.set(decl[1], [...(lists.get(decl[1]) || []), ...itemValues(ownValue(`x:${line.slice(decl.index + decl[0].length - 1)}`, 'x', 0), false)]);
        const p = places[k];
        if (p?.kind !== 'items') return;
        const spread = /^\s*\.\.\.([\w$]+)/.exec(line);
        if (spread && p.option) refs.push([p.option, spread[1]]);
        if (p.name) lists.set(p.name, [...(lists.get(p.name) || []), ...itemValues(line, false)]);
        else if (p.option) put(p.option, where, null, itemValues(line, p.yaml));
      });
      for (const [option, name] of refs) put(option, where, null, lists.get(name) ?? [name]);
    }
    return out;
  };
  // A test config whose start version can be rebuilt (the finish check: the file now and the diff's hunks) is judged
  // whole: a filter value it sets now that it did not set at the start leaves tests out (round 15). Otherwise (the
  // audit), line by line: every filter a removed line held, per file, before any added line is judged, since with -U0
  // a line that moved up comes before its removal (round 12); a commented-out line held none (round 14); the quoted
  // values on removed lines with no key are kept for list items that moved, and a removed indented line that starts
  // with an option counts as addopts.
  const wholeFile = new Set();
  const movedLines = new Map();
  const removedFilters = new Map();
  const removedItems = new Map();
  {
    const byFile = [];
    const inPre = hunkReader();
    let old = '';
    for (const line of diff.split('\n')) {
      const body = inPre(line);
      if (!body && line.startsWith('--- ')) old = unquotePath(line.slice(4).replace(/\t$/, '')).replace(/^a\//, '');
      else if (!body && line.startsWith('+++ ')) {
        const file = unquotePath(line.slice(4).replace(/\t$/, '')).replace(/^b\//, '');
        byFile.push({ file: file === '/dev/null' && isCi(old) ? old : file, body: [] });
      } else if (byFile.length) byFile[byFile.length - 1].body.push(line);
    }
    // An assertion whose exact text is both removed and added in a file only moved (tests wrapped in a describe):
    // neither side counts as an assertion removed, added or changed (round 20). Every other check still reads the
    // line where it lands, since a moved skip, continue-on-error or runner check switches off something new there
    // (round 21). A line with no word in it (a closing brace) is never paired.
    for (const { file, body } of byFile) {
      const minus = new Map();
      const plus = new Map();
      for (const l of body) {
        const t = l.slice(1).trim();
        if (!/\w/.test(t) || (l[0] !== '-' && l[0] !== '+')) continue;
        const side = l[0] === '-' ? minus : plus;
        side.set(t, (side.get(t) || 0) + 1);
      }
      const both = new Map([...minus].filter(([t]) => plus.has(t)).map(([t, n]) => [t, Math.min(n, plus.get(t))]));
      if (both.size) movedLines.set(file, both);
    }
    for (const { file, body } of byFile) {
      if (!isTestConfig(file) || !read) continue;
      const now = read(file);
      const start = startVersion(now, body);
      if (!start) continue;
      wholeFile.add(file);
      const before = configFilters(file, start.lines);
      const after = configFilters(file, now.split('\n'));
      for (const [key, f] of after) {
        const had = before.get(key)?.values || new Map();
        // set in more places than at the start (round 16); no -k is let off as narrower: that rule had holes in rounds
        // 17 to 19, so a -k narrowed back is a named false send-back
        const added = [...f.values].some(([v, n]) => n > (had.get(v) || 0));
        if (added && (f.script == null || f.script === 'tox' || runsTests(f.script, file))) add(SKIPPED, file, `tests were left out ${f.where} (${f.option}) in ${file}`);
      }
    }
    for (const { file, body } of byFile) {
      if (wholeFile.has(file) || !isTestConfig(file) || !body.some((l) => l.startsWith('-'))) continue;
      const had = removedFilters.get(file) || removedFilters.set(file, new Map()).get(file);
      for (const line of body) {
        if (!line.startsWith('-') || commented(file, line)) continue;
        const found = filtersOn(file, line.slice(0, 10000));
        found.forEach((f) => filterSeen(had, f));
        if (found.length) continue;
        if (PYTEST_CONFIG.test(file) && /^-\s+["']?-/.test(line)) for (const f of pytestFilters(file, line.slice(1, 10000), true)) filterSeen(had, f);
        quoted(line).forEach((v) => (removedItems.get(file) || removedItems.set(file, new Set()).get(file)).add(v));
      }
    }
  }
  let oldPath = ''; // the file a "--- a/" header names: a deleted CI file's lines are read under its own name (round 10)
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
  const ciRemoved = []; // CI files that lost a line running the tests
  let ciAdded = 0; // lines running the tests added to any CI file
  const weakenedIn = new Set(); // one weakened-matcher finding per file
  let hadFallback = false; // the test script already ended in `|| true` before this session
  let hadFilters = new Map(); // options that left tests out before this session, with their values
  let movedMinus = new Map(); // this file's lines that only moved, left to match on each side
  let movedPlus = new Map();
  const inHunk = hunkReader();
  for (const line of diff.split('\n')) {
    const body = inHunk(line);
    if (!body && line.startsWith('+++ ')) {
      current = unquotePath(line.slice(4).replace(/\t$/, '')).replace(/^b\//, ''); // git ends a path holding a space with a tab
      if (current === '/dev/null' && isCi(oldPath)) current = oldPath;
      removed = new Set();
      removedShapes = new Map();
      removedValueChecks = new Map();
      fileLines = [];
      pendingCatch = 0;
      prevText = '';
      hadFallback = false;
      hadFilters = new Map([...(removedFilters.get(current) || new Map())].map(([k, v]) => [k, new Set(v)]));
      movedMinus = new Map(movedLines.get(current) || []);
      movedPlus = new Map(movedLines.get(current) || []);
      continue;
    }
    if (!body && line.startsWith('--- ')) {
      oldPath = unquotePath(line.slice(4).replace(/\t$/, '')).replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      newLine = Number((/\+(\d+)/.exec(line) || [])[1] || 0);
      continue;
    }
    if (line[0] === '\\') continue; // git's "\ No newline at end of file" is not a line of the file (round 15)
    const left = line[0] === '-' ? movedMinus : line[0] === '+' ? movedPlus : null; // an assertion that only moved
    const movedKey = line.slice(1).trim();
    const moved = !!left && left.get(movedKey) > 0;
    if (moved) left.set(movedKey, left.get(movedKey) - 1);
    const at = line.startsWith('-') ? 0 : newLine;
    if (!line.startsWith('-')) newLine++;
    if (at && at <= 20000) fileLines[at - 1] = line.slice(1);
    const inTest = isTestFile(current);
    if (isCi(current) && !COMMENT.test(line)) {
      const text = line.slice(1, 10001);
      // a test step is a command: not an echo that names one, not another YAML key such as a cache key (round 13)
      const cmd = ciCommand(text);
      if (line.startsWith('-') && TEST_CMD.test(cmd)) ciRemoved.push(current);
      if (line.startsWith('+') && TEST_CMD.test(cmd)) ciAdded++;
      if (line.startsWith('+') && ciAlwaysPasses(text)) add(CHECKS_OFF, current, `the CI test step was changed to always pass in ${current}`);
      if (line.startsWith('+') && CI_IGNORE.test(text)) {
        const now = read ? read(current) : null;
        if (blockRunsTests(now == null ? fileLines : now.split('\n'), at, text)) add(CHECKS_OFF, current, `the CI test step was changed to always pass in ${current}`);
      }
    }
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
        if (cond != null) returns.push({ file: current, text: r[1], value: literals(r[1])[0], given: comparedLiterals(cond) });
      }
    }
    const probe = line.slice(0, 10000); // the patterns can take quadratic time on a long line
    let lineMask = null;
    const mask = () => (lineMask ||= stringMask(probe));
    if (/(^|\/)package\.json$/.test(current) && ALWAYS_PASSES.test(probe)) {
      if (line.startsWith('-')) hadFallback = true;
      else if (!hadFallback) add(CHECKS_OFF, current, `the test script was changed to always exit 0 in ${current}`);
    }
    // a commented-out line sets no filter (round 14)
    if (isTestConfig(current) && !wholeFile.has(current) && line.startsWith('+') && !commented(current, line)) {
      const found = filtersOn(current, probe);
      for (const f of found) if (filterIsNew(f)) add(SKIPPED, current, `tests were left out ${f.where} (${f.option}) in ${current}`);
      const inside = found.length ? null : enclosing(current, at);
      const extra = removedItems.get(current) || new Set();
      if (inside?.kind === 'items' && inside.option) {
        const f = { option: inside.option, where: inside.where, script: null, text: probe.slice(1), values: itemValues(probe.slice(1), inside.yaml) };
        if (f.values.length && filterIsNew(f, extra)) add(SKIPPED, current, `tests were left out ${f.where} (${f.option}) in ${current}`);
      } else if (inside?.kind === 'options') {
        for (const f of pytestFilters(current, probe.slice(1), true)) if (filterIsNew(f, extra)) add(SKIPPED, current, `tests were left out ${f.where} (${f.option}) in ${current}`);
      }
    }
    if (line.startsWith('+')) {
      for (const t of TAMPER_ADDED) if (inCode(t.re, probe, mask)) add(t.kind, current, `${t.why} in ${current}`);
      // the rest of a line longer than the probe, in overlapping pieces, so a skip past its first 10,000 characters
      // is read (cold review, L13 round 7); a single match longer than the 1,000-character overlap can be missed
      for (let from = 9000; from < line.length; from += 9000) {
        const piece = `+${line.slice(from, from + 10000)}`;
        let pieceMask = null;
        const pmask = () => (pieceMask ||= stringMask(piece));
        for (const t of [...TAMPER_ADDED, ...(inTest ? TAMPER_ADDED_IN_TESTS : [])]) if (inCode(t.re, piece, pmask)) add(t.kind, current, `${t.why} in ${current}`);
        if (isTestConfig(current) && !wholeFile.has(current) && !commented(current, line)) for (const f of filtersOn(current, piece)) if (filterIsNew(f)) add(SKIPPED, current, `tests were left out ${f.where} (${f.option}) in ${current}`);
      }
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
      if (moved) continue; // an assertion that only moved
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
    } else if (line.startsWith('-') && !moved && inTest && !COMMENT.test(line) && inCode(ASSERT, probe, mask)) {
      removedAsserts++;
      removed.add(line.slice(1).trim());
      const was = shape(probe);
      removedShapes.set(was.text, was.values);
      const st = strength(probe);
      if (st && st.value) removedValueChecks.set(st.subject, st.form);
    }
  }
  if (ciRemoved.length > ciAdded) add(CHECKS_OFF, ciRemoved[0], `the test step was removed from CI in ${ciRemoved[0]}`);
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
  // Expected values, replaced tests and test data, by the rules ported from noskip (src/noskip.js). They need
  // the files as they are now, so only the finish check runs them.
  if (read) {
    const replacedIn = new Set();
    const WORDS = {
      expected: (c) => `an expected value was changed in ${c.file} (${c.from} → ${c.to})`,
      call: (c) => `the call a test checks was changed and its expected value kept in ${c.file} (${c.from} → ${c.to})`,
      flipped: (c) => `an assertion was flipped to its opposite in ${c.file} (${c.from} → ${c.to})`,
      assertion: (c) => `an assertion was changed in ${c.file} (${c.from} → ${c.to})`,
      dropped: (c) => `a case was removed from a test list in ${c.file} (${c.from})`,
      reordered: (c) => `test data was reordered in ${c.file} (${c.from} moved)`,
    };
    for (const c of testChanges(diff, { read, isTestFile })) {
      if (c.type === 'skipped') add(SKIPPED, c.file, `a test that already existed was given a skip option in ${c.file} ("${c.from}")`);
      else if (c.type === 'replaced') {
        if (!replacedIn.has(c.file)) add(REPLACED, c.file, `a test was replaced by a different one in ${c.file} ("${c.from}" → "${c.to}"${c.where ? ` in ${c.where}` : ''})`);
        replacedIn.add(c.file);
      } else if (c.type === 'weakened') {
        if (!weakenedIn.has(c.file)) add(WEAKENED, c.file, `an assertion was weakened in ${c.file} (${c.from} became ${c.to})`);
        weakenedIn.add(c.file);
      } else {
        if (!changedIn.has(c.file)) add(EXPECTED, c.file, WORDS[c.what](c));
        changedIn.add(c.file);
      }
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
  // jest "Tests:       2 failed, 46 passed, 48 total", vitest " Tests  2 failed | 46 passed (48)"; a line with only
  // skipped or todo tests is 0 passed (round 9)
  {
    re: /^\s*Tests:?\s+.*\d+ (?:passed|failed|skipped|todo)\b.*$/gm,
    read: (t, line) => counts(num(line, /(\d+) passed/) ?? 0, num(line, /(\d+) failed/)),
  },
  // jest and vitest with --passWithNoTests: "No tests found, exiting with code 0", "No test files found, exiting with code 0"
  { re: /^No test(?: file)?s found, exiting with code 0\b.*$/gm, read: () => counts(0, 0) },
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
