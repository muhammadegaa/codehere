/**
 * Did the agent name a test file that is not in the repo?
 *
 * "The webhook tests passed" while the file never existed is a lie a green re-run cannot see:
 * the suite passes because it never contained the test. Given the agent's own words, this lists
 * the test files it named that exist nowhere in the checkout. A file counts as present when any
 * file with the same name exists (so a wrong folder is not flagged). Deterministic, no model.
 * It cannot tell that a named test never ran, only that it is not there.
 */
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const TEST_FILE =
  /^(?:[\w.@-]+\/)*(?:test_[\w.-]+\.py|[\w.-]+_test\.(?:py|go)|[\w.-]+\.(?:test|spec)\.[cm]?[jt]sx?|[\w-]+Test\.php)$/;

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.venv',
  'venv',
  '__pycache__',
  'vendor',
  'target',
]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 50_000;

export function extractClaimedTestFiles(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.split(/[\s`'"(),;]+/)) {
    const token = raw.replace(/^\.\//, '').replace(/[.:]+$/, '');
    if (token.startsWith('/') || token.split('/').includes('..')) continue;
    if (TEST_FILE.test(token) && !found.includes(token)) found.push(token);
  }
  return found;
}

function namesInRepo(cwd: string): Set<string> {
  const names = new Set<string>();
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || seen > MAX_ENTRIES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      seen++;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), depth + 1);
      } else {
        names.add(e.name);
      }
    }
  };
  walk(cwd, 0);
  return names;
}

export function findMissingClaimedTests(cwd: string, claim: string): string[] {
  const claimed = extractClaimedTestFiles(claim);
  if (!claimed.length) return [];
  const present = namesInRepo(cwd);
  return claimed.filter((p) => !present.has(basename(p)));
}
