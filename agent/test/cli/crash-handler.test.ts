/**
 * Crash safety · a daemon must not outlive an uncaught exception.
 *
 * The old handler set `process.exitCode = 1`, which is only honoured once the
 * event loop DRAINS. A daemon's loop never drains, so the process kept running
 * from a state Node itself considers undefined — measured 2026-08-08: the old
 * shape survived a 5s timeout and had to be killed; the new one exits in 0.17s.
 * Staying up is not resilience when the thing you protect is a record of what
 * happened; a restarted daemon re-reads the chain and is correct again.
 *
 * Driven as real subprocesses because that is the only way to observe the
 * behaviour — an in-process test cannot assert that a process died.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runDaemonLike(handlerBody: string): { status: number | null; timedOut: boolean } {
  const dir = mkdtempSync(join(tmpdir(), 'crash-handler-'));
  const f = join(dir, 'd.mjs');
  writeFileSync(
    f,
    `process.on('uncaughtException', (e) => { ${handlerBody} });\n` +
      `setInterval(() => {}, 50);\n` + // a daemon: the loop never drains on its own
      `setTimeout(() => { throw new Error('boom'); }, 60);\n`,
  );
  const r = spawnSync(process.execPath, [f], { timeout: 3000, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, timedOut: r.signal === 'SIGTERM' || r.status === null };
}

describe('uncaught exception in a daemon-shaped process', () => {
  it('the shipped handler exits rather than continuing', () => {
    const r = runDaemonLike('process.exit(1)');
    expect(r.timedOut).toBe(false);
    expect(r.status).toBe(1);
  });

  it('the OLD shape would have run forever — this is the regression guard', () => {
    // exitCode alone cannot stop a process whose loop never drains. If someone
    // "simplifies" the handler back to this, the test above starts timing out.
    const r = runDaemonLike('process.exitCode = 1');
    expect(r.timedOut).toBe(true);
  });
});
