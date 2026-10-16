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

export function parseTestWeakening(diff: string, readLines?: (file: string) => string[] | null): TestWeakening[] {
  const found: TestWeakening[] = [];
  let file: string | null = null;
  let existing = false;
  let line = 0;
  let removed: string[] = [];
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      file = null;
      existing = true;
      removed = [];
    } else if (raw.startsWith('--- ')) {
      existing = raw !== '--- /dev/null';
    } else if (raw.startsWith('+++ ')) {
      const path = raw.startsWith('+++ b/') ? raw.slice(6) : null;
      file = path && existing && TEST_PATH.test(path) ? path : null;
    } else if (raw.startsWith('@@')) {
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

/** Changes in `cwd` against HEAD, or against where the branch left `base` when it is given. Empty outside a git repo. */
export function detectTestWeakening(cwd: string, base?: string): TestWeakening[] {
  const from = base ? resolveBase(cwd, base) : 'HEAD';
  try {
    const diff = execFileSync('git', ['diff', '--unified=0', '--no-color', from], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return parseTestWeakening(diff, (f) => {
      try {
        return readFileSync(join(cwd, f), 'utf8').split('\n');
      } catch {
        return null;
      }
    });
  } catch {
    return [];
  }
}
