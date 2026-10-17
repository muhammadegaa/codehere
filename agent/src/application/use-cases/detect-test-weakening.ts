/**
 * Did the change make a test pass without checking anything?
 *
 * A green re-run proves nothing when the agent got there by editing the test: swapping a failing
 * assertion for `assert True`, skipping the test, commenting the assertion out, or returning above
 * it. This reads `git diff` against HEAD and flags such lines added to test files that already
 * existed. It is a deterministic diff read (no model), so it is measured evidence (DESIGN.md §1).
 * By default it reads uncommitted changes against HEAD. With a base ref it reads everything since
 * the branch left that base (committed or not), which is the view a pull request needs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TestWeakening {
  file: string;
  /** Line in the new file. */
  line: number;
  why: 'trivial-assertion' | 'skipped' | 'commented-out' | 'unreachable-assertion';
  /** The added line, trimmed. */
  text: string;
}

const TEST_PATH =
  /(^|\/)(test_[^/]*\.py|[^/]*_test\.py|[^/]*\.(test|spec)\.[cm]?[jt]sx?|[^/]*_test\.go|[^/]*Test\.php)$|(^|\/)(__tests__|tests?)\//;

const TRIVIAL: RegExp[] = [
  /^assert\s+(True|1|not\s+False)\s*(#.*)?$/,
  /^assert\s+([\w.'"]+)\s*==\s*\1\s*(#.*)?$/,
  /\bexpect\(\s*(true|1)\s*\)\s*\.\s*(toBe|toEqual|toStrictEqual)\(\s*(true|1)\s*\)/,
  /\bexpect\(\s*true\s*\)\s*\.\s*toBeTruthy\(\)/,
  /\bassert(\.ok)?\(\s*true\s*\)/,
  /\bassert\.(equal|strictEqual|deepEqual|deepStrictEqual)\(\s*([\w.'"]+)\s*,\s*\2\s*\)/,
  /\bassertTrue\(\s*true\s*\)/,
];

const SKIP: RegExp[] = [
  /@pytest\.mark\.(skip|xfail)\b/,
  /\bpytest\.(skip|xfail)\(/,
  /@unittest\.skip/,
  /\b(it|test|describe)\.(skip|todo)\(/,
  /\b(xit|xtest|xdescribe)\(/,
  /\bmarkTest(Skipped|Incomplete)\(/,
  /\bt\.Skip(f|Now)?\(/,
  // node:test options: { skip: true } / { skip: 'reason' } / { todo: true }; a conditional skip is left alone
  /\b(skip|todo)\s*:\s*(true\b|['"`])/,
];

const ASSERTION =
  /\b(assert\w*|expect|should|self\.assert\w*|this->assert\w*|t\.(Error|Fatal)\w*)\s*[.(]|^\s*assert\s+\S/;
const BARE_RETURN = /^return\s*;?$/;
/** A line that opens a branch: a return under it is conditional, not an unconditional skip. */
const CONDITIONAL = /^(\}\s*)?(if|else|for|while|switch|case|default|catch|try|finally)\b/;
/** How far below a bare return an assertion still counts as the one it hides. */
const RETURN_LOOKAHEAD = 8;

function uncomment(text: string): string | null {
  const m = /^(?:\/\/+|#+|\/\*+|\*)\s?(.*?)\s*(?:\*\/)?$/.exec(text);
  return m ? m[1].trim() : null;
}

/** The commented text is an assertion that the same change removed (alone on its line, or inside a one-line test). */
function wasCommentedOut(body: string, removed: string[]): boolean {
  const core = body.replace(/;$/, '');
  return core.length >= 12 && ASSERTION.test(core) && removed.some((r) => r.includes(core));
}

/** `b/path` or git's C-quoted `"b/p\"ath"` form → `path`. */
function headerPath(raw: string): string | null {
  const v = raw.slice(4);
  if (v.startsWith('b/')) return v.slice(2);
  if (v.startsWith('"b/') && v.endsWith('"')) {
    return v.slice(3, -1).replace(/\\(["\\tn])/g, (_, c: string) => (c === 't' ? '\t' : c === 'n' ? '\n' : c));
  }
  return null;
}

export function parseTestWeakening(diff: string, readLines?: (file: string) => string[] | null): TestWeakening[] {
  const found: TestWeakening[] = [];
  let file: string | null = null;
  let existing = false;
  let line = 0;
  let removed: string[] = [];
  // File headers (`--- a/...`, `+++ b/...`) only appear between `diff --git` and the first hunk, so an added line
  // whose text starts with `++ ` cannot pose as a header.
  let inHeader = false;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      file = null;
      existing = true;
      removed = [];
      inHeader = true;
    } else if (inHeader && raw.startsWith('--- ')) {
      existing = raw !== '--- /dev/null';
    } else if (inHeader && raw.startsWith('+++ ')) {
      const path = headerPath(raw);
      file = path && existing && TEST_PATH.test(path) ? path : null;
    } else if (raw.startsWith('@@')) {
      inHeader = false;
      const m = /\+(\d+)/.exec(raw);
      line = m ? Number(m[1]) : 0;
      removed = [];
    } else if (raw.startsWith('-')) {
      removed.push(raw.slice(1).trim());
    } else if (raw.startsWith('+') && file) {
      const text = raw.slice(1).trim();
      const body = uncomment(text);
      let why: TestWeakening['why'] | null = null;
      if (TRIVIAL.some((re) => re.test(text))) why = 'trivial-assertion';
      else if (SKIP.some((re) => re.test(text))) why = 'skipped';
      else if (body !== null && wasCommentedOut(body, removed)) why = 'commented-out';
      else if (BARE_RETURN.test(text)) {
        const lines = readLines?.(file);
        const above = (lines?.[line - 2] ?? '').trim();
        const below = lines?.slice(line, line + RETURN_LOOKAHEAD) ?? [];
        if (!CONDITIONAL.test(above) && below.some((l) => ASSERTION.test(l))) why = 'unreachable-assertion';
      }
      if (why) found.push({ file, line, why, text: text.slice(0, 80) });
      line++;
    }
  }
  return found;
}

/** The commit the current branch left `base` at, so changes made on `base` since are not blamed on the branch. */
function resolveBase(cwd: string, base: string): string {
  if (base.startsWith('-')) throw new Error(`Invalid --base "${base}": a ref cannot start with "-".`);
  try {
    return execFileSync('git', ['merge-base', base, 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error(`Unknown --base "${base}": not a ref in this repository.`);
  }
}

export interface WeakeningScan {
  findings: TestWeakening[];
  /** The scan did not apply here (no repository, no commit yet). Not a finding, but said out loud. */
  skipped?: string;
  /** The scan was attempted and could not finish: nothing about the test changes was verified. */
  error?: string;
}

const MAX_DIFF = 64 * 1024 * 1024;

/** git with literal paths and unquoted non-ASCII names. */
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', '--literal-pathspecs', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: MAX_DIFF,
  });
}

/**
 * Changes in `cwd` against HEAD, or against where the branch left `base` when it is given. Only test files are
 * diffed, so a large change elsewhere cannot push the test diff past the read limit.
 */
export function scanTestWeakening(cwd: string, base?: string): WeakeningScan {
  try {
    git(cwd, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    return { findings: [], skipped: 'not a git repository' };
  }
  if (!base) {
    try {
      git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    } catch {
      return { findings: [], skipped: 'no commit to compare against yet' };
    }
  }
  const from = base ? resolveBase(cwd, base) : 'HEAD';
  let tests: string[];
  try {
    tests = git(cwd, ['diff', '--name-only', '-z', from])
      .split('\0')
      .filter((p) => p && TEST_PATH.test(p));
  } catch {
    return { findings: [], error: 'could not read the diff (the list of changed files)' };
  }
  if (!tests.length) return { findings: [] };
  let diff: string;
  try {
    diff = git(cwd, ['diff', '--unified=0', '--no-color', from, '--', ...tests]);
  } catch {
    return {
      findings: [],
      error: `could not read the diff of ${tests.length} changed test file(s); it may be larger than 64 MB`,
    };
  }
  return {
    findings: parseTestWeakening(diff, (f) => {
      try {
        return readFileSync(join(cwd, f), 'utf8').split('\n');
      } catch {
        return null;
      }
    }),
  };
}
