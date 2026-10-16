/**
 * Tier 1.1 · re-run-tests — codehere OBSERVES the suite instead of trusting the
 * agent's scraped stdout. The authoritative signal is the exit code, so a suite
 * that really fails is caught even if its output count can't be parsed.
 *
 * Uses real temp repos with a real `npm test` script (a node one-liner — no
 * install needed) so the subprocess path is genuinely exercised.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectTestCommand, rerunTests } from '../../src/application/use-cases/rerun-tests.js';

/** Is a toolchain on PATH? Lets cross-language live tests run when available
 *  and skip honestly (never false-pass) when not. */
function hasTool(cmd: string, arg = '--version'): boolean {
  try {
    execFileSync(cmd, [arg], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function makeRepo(testScript: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'codehere-rerun-'));
  const pkg: { name: string; scripts?: Record<string, string> } = { name: 'fixture' };
  if (testScript !== null) pkg.scripts = { test: testScript };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

// Runner detection reads CODEHERE_TEST_CMD, so a value in the caller's environment (for example when this suite
// is run through `codehere check` with an override) changes what these tests observe. Clear it for the whole
// file and put it back afterwards.
let savedTestCmd: string | undefined;
beforeAll(() => {
  savedTestCmd = process.env.CODEHERE_TEST_CMD;
  delete process.env.CODEHERE_TEST_CMD;
});
afterAll(() => {
  if (savedTestCmd === undefined) delete process.env.CODEHERE_TEST_CMD;
  else process.env.CODEHERE_TEST_CMD = savedTestCmd;
});

describe('rerun-tests · observe the suite, exit-code authoritative', () => {
  const dirs: string[] = [];
  beforeAll(() => {
    delete process.env.CODEHERE_RERUN_TESTS;
  });
  afterAll(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  it('detects a real npm test script', () => {
    const dir = makeRepo('node -e "console.log(\'1 passed\')"');
    dirs.push(dir);
    expect(detectTestCommand(dir)).toEqual({ cmd: 'npm', args: ['test', '--silent'], display: 'npm test' });
  });

  it('detects node --test for a plain repo with *.test.mjs and no npm test script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-rerun-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'sum.test.mjs'), 'import {test} from "node:test"; test("x",()=>{});');
    expect(detectTestCommand(dir)).toEqual({ cmd: 'node', args: ['--test'], display: 'node --test' });
  });

  it('npm test script wins over node --test files (precedence)', () => {
    const dir = makeRepo('node -e "process.exit(0)"');
    dirs.push(dir);
    writeFileSync(join(dir, 'a.test.mjs'), 'import {test} from "node:test"; test("x",()=>{});');
    expect(detectTestCommand(dir)?.display).toBe('npm test');
  });

  it('re-runs node --test and catches a failing suite via the exit code', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-rerun-'));
    dirs.push(dir);
    writeFileSync(
      join(dir, 'f.test.mjs'),
      'import {test} from "node:test"; import a from "node:assert/strict"; test("fails",()=>{a.equal(1,2);});',
    );
    const r = await rerunTests(dir);
    expect(r.ran).toBe(true);
    expect(r.exitCode).not.toBe(0); // authoritative fail signal, even if counts don't parse
  });

  it('ignores npm\'s default "no test specified" placeholder', () => {
    const dir = makeRepo('echo "Error: no test specified" && exit 1');
    dirs.push(dir);
    expect(detectTestCommand(dir)).toBeNull();
  });

  it('returns null when there is no package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-rerun-empty-'));
    dirs.push(dir);
    expect(detectTestCommand(dir)).toBeNull();
  });

  it('a PASSING suite → ran, exitCode 0', async () => {
    const dir = makeRepo('node -e "console.log(\'2 passed\')"');
    dirs.push(dir);
    const r = await rerunTests(dir);
    expect(r.ran).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.command).toBe('npm test');
  }, 30000);

  it('a FAILING suite → ran, exitCode non-zero (the lie is catchable even with no parseable count)', async () => {
    // No "N failed" in output — only the exit code reveals the failure.
    const dir = makeRepo('node -e "process.exit(1)"');
    dirs.push(dir);
    const r = await rerunTests(dir);
    expect(r.ran).toBe(true);
    expect(r.exitCode).not.toBe(0);
  }, 30000);

  it('no test command → ran:false with an honest reason (never throws)', async () => {
    const dir = makeRepo(null);
    dirs.push(dir);
    const r = await rerunTests(dir);
    expect(r.ran).toBe(false);
    expect(r.skippedReason).toMatch(/no known test command/i);
  });

  it('respects the opt-out CODEHERE_RERUN_TESTS=0', async () => {
    const dir = makeRepo('node -e "console.log(\'1 passed\')"');
    dirs.push(dir);
    process.env.CODEHERE_RERUN_TESTS = '0';
    try {
      const r = await rerunTests(dir);
      expect(r.ran).toBe(false);
      expect(r.skippedReason).toMatch(/disabled/i);
    } finally {
      delete process.env.CODEHERE_RERUN_TESTS;
    }
  });
});

describe('detectTestCommand · multi-language (R4 — verify works beyond npm)', () => {
  const dirs: string[] = [];
  function repo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'codehere-detect-'));
    dirs.push(dir);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return dir;
  }
  beforeAll(() => {
    delete process.env.CODEHERE_TEST_CMD;
  });
  afterAll(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  it('Go: go.mod → go test ./...', () => {
    expect(detectTestCommand(repo({ 'go.mod': 'module x\n' }))).toEqual({
      cmd: 'go',
      args: ['test', './...'],
      display: 'go test ./...',
    });
  });

  it('Rust: Cargo.toml → cargo test', () => {
    expect(detectTestCommand(repo({ 'Cargo.toml': '[package]\nname="x"\n' }))).toEqual({
      cmd: 'cargo',
      args: ['test'],
      display: 'cargo test',
    });
  });

  it('Python: pytest.ini → pytest', () => {
    expect(detectTestCommand(repo({ 'pytest.ini': '[pytest]\n' }))).toEqual({
      cmd: 'pytest',
      args: ['-q'],
      display: 'pytest',
    });
  });

  it('Python: conftest.py (pytest-specific) → pytest', () => {
    expect(detectTestCommand(repo({ 'conftest.py': '' }))?.cmd).toBe('pytest');
  });

  it('Python: pyproject.toml that names pytest → pytest', () => {
    expect(detectTestCommand(repo({ 'pyproject.toml': '[tool.pytest.ini_options]\n' }))?.cmd).toBe('pytest');
  });

  it('conservative: pyproject.toml that does NOT mention pytest → null (never guess a runner)', () => {
    expect(detectTestCommand(repo({ 'pyproject.toml': '[build-system]\nrequires=["setuptools"]\n' }))).toBeNull();
  });

  it('JS: vitest.config.ts with no npm test script → npx vitest run', () => {
    // --no-install is asserted, not incidental: without it npx falls back to the
    // public registry, so codehere would DOWNLOAD a test runner and execute it
    // against the user's repo, then report the result as "verifier re-ran the
    // suite". A runner the project does not have is not the project's suite.
    expect(detectTestCommand(repo({ 'vitest.config.ts': 'export default {}' }))).toEqual({
      cmd: 'npx',
      args: ['--no-install', 'vitest', 'run'],
      display: 'npx vitest run',
    });
  });

  it('explicit CODEHERE_TEST_CMD override wins over every auto-detection', () => {
    const dir = repo({ 'go.mod': 'module x' });
    process.env.CODEHERE_TEST_CMD = 'make test';
    try {
      expect(detectTestCommand(dir)).toEqual({ cmd: 'make', args: ['test'], display: 'make test' });
    } finally {
      delete process.env.CODEHERE_TEST_CMD;
    }
  });

  it('precedence: a Node project (npm test) wins over a stray go.mod', () => {
    const dir = repo({ 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }), 'go.mod': 'module x' });
    expect(detectTestCommand(dir)?.cmd).toBe('npm');
  });
});

describe('rerun-tests · live cross-language (R4) — a lying report is caught on a real Go suite', () => {
  const dirs: string[] = [];
  const goPresent = hasTool('go', 'version');
  afterAll(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  });

  it.runIf(goPresent)(
    'Go: a FAILING go test → ran via "go test ./...", exitCode non-zero (the lie is observable)',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'codehere-go-lie-'));
      dirs.push(dir);
      // The fixture is compile-clean valid Go — the ONLY reason `go test` exits
      // non-zero here is the test's own t.Fatal, not a compile error. Paired with
      // the passing control below, this proves codehere observes the 0-vs-nonzero
      // signal an agent's "all tests pass" claim would contradict. (Exit code is
      // authoritative by design; for the product, any non-zero = the claim is a lie.)
      writeFileSync(join(dir, 'go.mod'), 'module lie\n\ngo 1.20\n');
      writeFileSync(
        join(dir, 'lie_test.go'),
        'package lie\n\nimport "testing"\n\nfunc TestFails(t *testing.T) { t.Fatal("boom") }\n',
      );
      const r = await rerunTests(dir);
      expect(r.ran).toBe(true);
      expect(r.command).toBe('go test ./...');
      expect(r.exitCode).not.toBe(0);
    },
    60000,
  );

  it.runIf(goPresent)(
    'Go: a PASSING go test → ran, exitCode 0',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'codehere-go-ok-'));
      dirs.push(dir);
      writeFileSync(join(dir, 'go.mod'), 'module ok\n\ngo 1.20\n');
      writeFileSync(join(dir, 'ok_test.go'), 'package ok\n\nimport "testing"\n\nfunc TestOk(t *testing.T) {}\n');
      const r = await rerunTests(dir);
      expect(r.ran).toBe(true);
      expect(r.exitCode).toBe(0);
    },
    60000,
  );
});
