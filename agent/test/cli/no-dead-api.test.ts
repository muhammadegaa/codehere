/**
 * Regression test for the dead HTTP API surface.
 *
 * Historic bug: the repo shipped an entire `agent/api/` Express server
 * (routes, controllers, middleware) that was never compiled — tsconfig.json
 * `include` is `src/**` only, so `npm run build` skipped it. The `start:api`
 * and `dev:api` package scripts both pointed at files that never produced a
 * `dist/` output, and the MCP route file imported a class architecture
 * (`CodehereMCPServer`) that didn't match the real `mcp-server-impl.ts`.
 *
 * This test pins the intent: no dead HTTP API surface, no scripts that
 * would fail on first run, no orphan test files outside the test/cli/ suite.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const AGENT_ROOT = join(__dirname, '..', '..');

describe('no dead HTTP API surface', () => {
  it('agent/api/ directory is gone', () => {
    expect(existsSync(join(AGENT_ROOT, 'api'))).toBe(false);
  });

  it('agent/test/api/ directory is gone', () => {
    expect(existsSync(join(AGENT_ROOT, 'test', 'api'))).toBe(false);
  });

  it('package.json has no start:api or dev:api scripts', () => {
    const pkg = JSON.parse(readFileSync(join(AGENT_ROOT, 'package.json'), 'utf-8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['start:api']).toBeUndefined();
    expect(pkg.scripts['dev:api']).toBeUndefined();
    // The real serve command stays
    expect(pkg.scripts.start).toBe('node dist/index.js');
  });
});
