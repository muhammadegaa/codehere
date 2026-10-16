/**
 * CLI surface tests: the two commands codehere ships (check, help), run as subprocesses.
 * Each test runs `node dist/index.js <args>` and asserts on exit code and output.
 * `check` itself is covered by check-*.test.ts and rerun-tests.test.ts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';

const CLI = join(__dirname, '..', '..', 'dist', 'index.js');

function run(...args: string[]): { out: string; status: number | null } {
  const r = spawnSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: '1' },
  });
  return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

beforeAll(() => {
  expect(existsSync(CLI)).toBe(true);
});

describe('CLI: version and help', () => {
  it('--version prints semver', () => {
    expect(run('--version').out.trim()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('--help lists check and help and nothing else', () => {
    const { out, status } = run('--help');
    expect(status).toBe(0);
    expect(out).toContain('Usage:');
    expect(out).toMatch(/^ {2}check /m);
    expect(out).toMatch(/^ {2}help /m);
    const listed = [...out.matchAll(/^ {2}([a-z][a-z-]*)(?: \[| |$)/gm)].map((m) => m[1]);
    expect(listed.filter((n) => !['check', 'help'].includes(n))).toEqual([]);
  });

  it('help command names check and does not mention commands that are gone', () => {
    const { out, status } = run('help');
    expect(status).toBe(0);
    expect(out).toContain('check');
    expect(out).not.toMatch(/help --all|trust|start|audit/);
  });

  it('help check shows the options of check', () => {
    const { out } = run('help', 'check');
    for (const flag of ['--json', '--proof', '--claim', '--base']) expect(out).toContain(flag);
  });

  it('no raw ANSI escape codes in --help', () => {
    expect(run('--help').out).not.toMatch(/\x1b\[/);
  });

  it('bare codehere prints help and exits 0', () => {
    const { out, status } = run();
    expect(status).toBe(0);
    expect(out).toContain('Usage:');
  });
});

describe('CLI: unknown input', () => {
  it('an unknown command exits 1 and points to help', () => {
    const { out, status } = run('nonexistent-command-xyz');
    expect(status).toBe(1);
    expect(out).toContain("unknown command 'nonexistent-command-xyz'");
    expect(out).toContain('codehere help');
  });

  it('a typo of check suggests check', () => {
    const { out, status } = run('chekc');
    expect(status).toBe(1);
    expect(out).toContain('codehere check');
  });

  it('a removed command is reported as unknown, not run', () => {
    const { out, status } = run('trust', '.');
    expect(status).toBe(1);
    expect(out).toContain("unknown command 'trust'");
  });
});
