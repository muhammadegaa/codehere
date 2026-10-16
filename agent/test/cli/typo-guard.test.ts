/**
 * Unit tests for the bare-action typo guard.
 *
 * Why these exist: rc.15 introduced an over-aggressive typo guard that blocked
 * legitimate one-word prompts (caught by Codex in rc.15 review). rc.16 rewrote
 * it with real Levenshtein + length floor + kebab exemption. These tests pin
 * both the positive cases (catch real typos) AND the regressions (let real
 * prompts through). No subprocess spawn — pure function tests.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkTypo, levenshtein, looksLikeUnknownCommand } = require('../../dist/utils/typo-guard.js') as {
  checkTypo: (input: string, known: readonly string[]) => string[] | null;
  levenshtein: (a: string, b: string) => number;
  looksLikeUnknownCommand: (input: string, known: readonly string[]) => string | null;
};

const KNOWN = [
  'completion',
  'config',
  'health',
  'help',
  'hook',
  'kill',
  'report',
  'serve',
  'setup',
  'start',
  'status',
  'task',
  'trust',
] as const;

describe('Typo guard · positive cases (these MUST suggest)', () => {
  const cases: Array<[string, string]> = [
    ['helpp', 'help'],
    ['heath', 'health'], // 1 edit (transposition + drop)
    ['truts', 'trust'],
    ['statu', 'status'],
    ['servee', 'serve'],
    ['taks', 'task'],
    ['confing', 'config'],
    ['repot', 'report'],
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → suggests '${expected}'`, () => {
      const r = checkTypo(input, KNOWN);
      expect(r, `expected suggestion array, got null for '${input}'`).not.toBeNull();
      expect(r).toContain(expected);
    });
  }
});

describe('Typo guard · negative cases (rc.15 regression — these MUST fall through)', () => {
  const falls = [
    // Real-known commands — exact match, no typo
    'health',
    'help',
    'trust',
    'task',
    // Too short — high false-positive risk
    'h',
    'go',
    'fix',
    'hi',
    // Kebab-case — likely a real prompt (rc.16 review explicitly named these)
    'task-runner',
    'review-this',
    'review-this-bug',
    'fix-bug-123',
    'add-tests-please',
    // Distinct multi-edit words — not typos of any command
    'algorithm',
    'database',
    'questionable',
    'investigate',
    // Contains digits / symbols — not command-shaped
    'foo123',
    'bar_baz',
    'help!',
    // Empty
    '',
  ];
  for (const input of falls) {
    it(`'${input}' → falls through (returns null)`, () => {
      expect(checkTypo(input, KNOWN), `'${input}' wrongly flagged as typo`).toBeNull();
    });
  }
});

describe('Typo guard · ranking', () => {
  it('returns suggestions ordered by ascending edit distance', () => {
    // 'hep' should suggest 'help' (distance 1) before 'hook' (distance 2)
    const r = checkTypo('helpx', KNOWN);
    expect(r).not.toBeNull();
    expect(r![0]).toBe('help');
  });

  it('returns at most 3 suggestions', () => {
    const r = checkTypo('hesta', ['help', 'health', 'hook', 'host', 'hash', 'hesa']);
    expect(r).not.toBeNull();
    expect(r!.length).toBeLessThanOrEqual(3);
  });

  it('skips suggestions where distance >= input length (rc.16 invariant)', () => {
    // Without this, 'fix' would suggest 'help' (distance 3, but input len 3).
    // The guard already exempts <4-char inputs but the invariant is belt+braces.
    const r = checkTypo('fixx', ['help', 'task']); // 'fixx' is 4 chars
    expect(r).toBeNull(); // both distances >= 3, > 2 threshold
  });
});

describe('Typo guard · length boundaries', () => {
  it('exactly 4 chars qualifies (boundary)', () => {
    const r = checkTypo('helx', KNOWN);
    expect(r).not.toBeNull();
    expect(r).toContain('help');
  });

  it('exactly 14 chars qualifies (boundary)', () => {
    // 14-char alphabetic word — far from any command, falls through
    expect(checkTypo('aaaaaaaaaaaaaa', KNOWN)).toBeNull();
    // 14-char close to nothing — still falls through
  });

  it('15 chars falls through (over the limit)', () => {
    // Even if it's close to something, should fall through
    expect(checkTypo('healthhhhhhhhhh', KNOWN)).toBeNull();
  });
});

describe('Typo guard · multi-token input (v0.6 extension)', () => {
  it("'setupp foo bar' → suggests 'setup' (first token typo, args ignored)", () => {
    const r = checkTypo('setupp foo bar', KNOWN);
    expect(r).not.toBeNull();
    expect(r).toContain('setup');
  });

  it("'helpp world' → suggests 'help'", () => {
    const r = checkTypo('helpp world', KNOWN);
    expect(r).not.toBeNull();
    expect(r).toContain('help');
  });

  it("'truts me bro' → suggests 'trust' (3-token still typo-checks first)", () => {
    const r = checkTypo('truts me bro', KNOWN);
    expect(r).not.toBeNull();
    expect(r).toContain('trust');
  });

  it("'review src/auth.ts' → falls through (legitimate quoted prompt)", () => {
    expect(checkTypo('review src/auth.ts', KNOWN)).toBeNull();
  });

  it("'fix the bug now' → falls through (real natural-language prompt)", () => {
    expect(checkTypo('fix the bug now', KNOWN)).toBeNull();
  });
});

describe('looksLikeUnknownCommand · narrow `cmd subcmd` shape', () => {
  it("'daemon start' → returns 'daemon' (unknown 2-token command)", () => {
    expect(looksLikeUnknownCommand('daemon start', KNOWN)).toBe('daemon');
  });

  it("'webui open' → returns 'webui'", () => {
    expect(looksLikeUnknownCommand('webui open', KNOWN)).toBe('webui');
  });

  it("'nuke session' → returns 'nuke'", () => {
    expect(looksLikeUnknownCommand('nuke session', KNOWN)).toBe('nuke');
  });

  it("'health check' → returns null (first IS a known command)", () => {
    expect(looksLikeUnknownCommand('health check', KNOWN)).toBeNull();
  });

  it("'helpp world' → returns null (first IS a typo — checkTypo handles it)", () => {
    expect(looksLikeUnknownCommand('helpp world', KNOWN)).toBeNull();
  });

  it("'review src/auth.ts' → returns null (second token has slash → file path)", () => {
    expect(looksLikeUnknownCommand('review src/auth.ts', KNOWN)).toBeNull();
  });

  it("'fix login bug' → returns null (3 tokens — natural prompt)", () => {
    expect(looksLikeUnknownCommand('fix login bug', KNOWN)).toBeNull();
  });

  it("'go run' → returns null (first token <4 chars)", () => {
    expect(looksLikeUnknownCommand('go run', KNOWN)).toBeNull();
  });

  it("single token 'daemon' → returns null (handled by checkTypo path)", () => {
    expect(looksLikeUnknownCommand('daemon', KNOWN)).toBeNull();
  });

  it("'foo123 bar' → returns null (digits in first token)", () => {
    expect(looksLikeUnknownCommand('foo123 bar', KNOWN)).toBeNull();
  });

  it("'task-runner go' → returns null (kebab-case → likely real prompt)", () => {
    expect(looksLikeUnknownCommand('task-runner go', KNOWN)).toBeNull();
  });

  it('empty input → returns null', () => {
    expect(looksLikeUnknownCommand('', KNOWN)).toBeNull();
  });
});

describe('Levenshtein distance · primitive', () => {
  it('identical strings → 0', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });
  it('one substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });
  it('one insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });
  it('one deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });
  it('full replacement', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
  it('empty inputs', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('hello', '')).toBe(5);
    expect(levenshtein('', 'hello')).toBe(5);
  });
  it("'helpp' → 'help' = 1", () => {
    expect(levenshtein('helpp', 'help')).toBe(1);
  });
  it("'truts' → 'trust' = 2 (transposition counts as 2)", () => {
    expect(levenshtein('truts', 'trust')).toBe(2);
  });
});
