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
    t.match(/^\s*●\s+(.+?)\s*$/m) ||
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
export function lowInfoPrompt(p) {
  const w = words(p);
  if (!w.length || w.length > 8 || SPECIFIC.test(p) || POSITIVE.test(p)) return false;
  return REPAIR.test(p);
}

const BUILD_START =
  /^\s*(please\s+|tolong\s+|can you\s+|could you\s+)?(build|create|make|add|implement|develop|design|set up|setup|buat|buatkan|bikin|bikinin|tambah|tambahkan|bangun)\b/i;
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

const TAMPER_ADDED = [
  { re: /\b(it|test|describe)\.skip\s*\(/, why: 'a test was skipped (.skip)' },
  { re: /\b(xit|xdescribe|xtest)\s*\(/, why: 'a test was disabled (xit/xdescribe)' },
  { re: /@pytest\.mark\.skip|unittest\.skip/, why: 'a Python test was skipped' },
  { re: /@ts-nocheck/, why: 'type checking was turned off (@ts-nocheck)' },
  { re: /--no-verify/, why: 'git hooks were bypassed (--no-verify)' },
  { re: /expect\([^)]*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)\s*;?\s*\/\/\s*(todo|temp|hack)/i, why: 'an assertion was replaced with a placeholder' },
];

export function tamperFindings(nameStatus, diff) {
  const found = [];
  for (const line of nameStatus.split('\n')) {
    const [status, file] = line.split(/\s+/);
    if (status === 'D' && file && TEST_FILE.test(file)) found.push(`test file deleted: ${file}`);
  }
  let current = '';
  let removedAsserts = 0;
  let addedAsserts = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line.replace(/^\+\+\+ (b\/)?/, '');
      continue;
    }
    if (line.startsWith('--- ')) continue;
    if (line.startsWith('+')) {
      for (const t of TAMPER_ADDED) if (t.re.test(line)) found.push(`${t.why} in ${current}`);
      if (TEST_FILE.test(current) && /\b(expect|assert)\w*\s*\(/.test(line)) addedAsserts++;
    } else if (line.startsWith('-')) {
      if (TEST_FILE.test(current) && /\b(expect|assert)\w*\s*\(/.test(line)) removedAsserts++;
    }
  }
  if (removedAsserts - addedAsserts >= 2) {
    found.push(`${removedAsserts - addedAsserts} assertions removed from test files`);
  }
  return [...new Set(found)];
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
