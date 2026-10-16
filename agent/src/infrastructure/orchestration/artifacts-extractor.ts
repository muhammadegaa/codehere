/**
 * Test summary parsing: "N passed", "M failed" and the runner-specific variants, out of collected stdout.
 * Used by `codehere check` to read what a test run reported.
 */

/** What a test run reported. */
export interface TestSummary {
  passed: number;
  failed: number;
  durationMs?: number;
}

/** Parse "N passed", "M failed", "K tests" out of accumulated stdout. Best-effort.
 *  Vitest + jest output both have TWO pass/fail lines ("Test Files 11 passed" then
 *  "Tests  47 passed"). We want the second/last. Take the last match in the buffer,
 *  which is also what appears in the final summary. */
function lastMatch(s: string, re: RegExp): RegExpExecArray | null {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) last = m;
  return last;
}

/** Parse a test pass/fail summary out of accumulated stdout. Best-effort and
 *  runner-agnostic so "trust the result" holds across whatever the repo uses,
 *  not just node runners. Exported for direct unit coverage. */
export function parseTestSummary(stdout: string): TestSummary | undefined {
  if (!stdout) return undefined;
  const s = stdout.slice(-8000); // only look at the tail

  // Primary — "N passed" / "M failed": vitest, jest, pytest, mocha ("passing"),
  // cargo ("5 passed; 0 failed"). Unchanged so existing matches never shift.
  let passed = lastMatch(s, /(\d+)\s+pass(?:ed|ing)/i);
  let failed = lastMatch(s, /(\d+)\s+fail(?:ed|ing)/i);

  // Fallback A — reversed order "Passed: N" / "Failed: N" (dotnet test, some CI
  // summaries). Only consulted when the primary matched nothing, so the common
  // path is untouched.
  if (!passed && !failed) {
    passed = lastMatch(s, /pass(?:ed)?:\s*(\d+)/i);
    failed = lastMatch(s, /fail(?:ed)?:\s*(\d+)/i);
  }

  // Fallback B — python unittest: "Ran 5 tests in 0.0s" then "OK" or
  // "FAILED (failures=2, errors=1)". There is no "passed" word at all, so the
  // earlier patterns never see it — this was a real drop the dogfood surfaced.
  if (!passed && !failed) {
    const ran = lastMatch(s, /Ran\s+(\d+)\s+tests?\b/i);
    if (ran) {
      const total = parseInt(ran[1], 10);
      const f = lastMatch(s, /failures=(\d+)/i);
      const e = lastMatch(s, /errors=(\d+)/i);
      const failedCount = (f ? parseInt(f[1], 10) : 0) + (e ? parseInt(e[1], 10) : 0);
      const unittest: TestSummary = {
        passed: Math.max(0, total - failedCount),
        failed: failedCount,
      };
      const d = lastMatch(s, /in\s+([\d.]+)s\b/i);
      if (d) unittest.durationMs = Math.round(parseFloat(d[1]) * 1000);
      return unittest;
    }
  }

  if (!passed && !failed) return undefined;

  const result: TestSummary = {
    passed: passed ? parseInt(passed[1], 10) : 0,
    failed: failed ? parseInt(failed[1], 10) : 0,
  };

  const dur = lastMatch(s, /Duration\s+([\d.]+)s/i) ?? lastMatch(s, /Time:\s+([\d.]+)\s*s/i);
  if (dur) result.durationMs = Math.round(parseFloat(dur[1]) * 1000);
  return result;
}
