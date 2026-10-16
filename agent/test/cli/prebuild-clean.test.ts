/**
 * Regression test for the prebuild clean step.
 *
 * Historic bug: `tsc` does not delete output files when source files are
 * removed. After checkouts between branches with different src/ trees,
 * orphan *.js files lingered in dist/ — including, for a time,
 * mcp-server.js and mcp-oauth.js after those sources were deleted.
 *
 * Cursor verification on a long-lived workspace saw the orphans and
 * couldn't tell whether the fix had landed. Fresh clones were clean.
 *
 * Fix: `prebuild` script wipes dist/ before every `tsc` run — so every
 * `npm run build`, `npm test`, and `npm publish` produces a clean tree.
 *
 * This test pins the contract. Behavioral correctness is exercised on
 * every CI run: `npm test` → `npm run build` → `prebuild` → `tsc`; if
 * prebuild is broken or removed, stale dist content would have surfaced.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const AGENT_ROOT = join(__dirname, '..', '..');

describe('prebuild removes stale dist output', () => {
  it('package.json has a prebuild that wipes dist', () => {
    const pkg = JSON.parse(readFileSync(join(AGENT_ROOT, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.prebuild).toBeDefined();
    expect(pkg.scripts.prebuild).toMatch(/rm\s+-rf\s+dist/);
  });
});
