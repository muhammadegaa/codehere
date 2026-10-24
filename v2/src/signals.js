// Deterministic signals. No AI in the decision path.

const ERROR_LINE =
  /(error|exception|traceback|failed|failure|fatal|cannot|can't|not found|undefined is not|is not defined|is not a function|segmentation fault|ERR!|panic:|denied|refused|unexpected token|syntaxerror|typeerror|referenceerror|modulenotfound|no such file)/i;

const NOISE = /^(\s*at\s|\s*\^+\s*$|\s*$)/;

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
    if (ERROR_LINE.test(lines[i]) && !NOISE.test(lines[i])) hits.push(lines[i].trim());
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
