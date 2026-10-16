/**
 * Regression: prebuild wipes dist/, tsc rebuilds index.js without the
 * executable bit, and every `npm link` shim or bin symlink silently breaks
 * on PATH after a rebuild. This manifested as "codehere: command not found"
 * spam in Claude Code's PreToolUse hook even though npm link had been done.
 *
 * postbuild must restore the +x bit so `codehere` on PATH keeps working.
 */

import { describe, it, expect } from 'vitest';
import { statSync } from 'fs';
import { join } from 'path';

describe('build output permissions', () => {
  it('dist/index.js is executable after build (postbuild chmod +x)', () => {
    const distEntry = join(__dirname, '..', '..', 'dist', 'index.js');
    const mode = statSync(distEntry).mode;
    // Owner execute bit (0o100)
    const ownerExecutable = (mode & 0o100) !== 0;
    expect(ownerExecutable).toBe(true);
  });
});
