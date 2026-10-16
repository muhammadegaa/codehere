/**
 * Every `npx` invocation must pass --no-install.
 *
 * Why (found and reproduced 2026-08-08): npx resolves a BIN NAME and falls back
 * to the public registry when nothing is installed locally. codehere shelled out
 * to bare `npx graphify-ts` while depending on the SCOPED
 * @mohammednagy/graphify-ts — and an unrelated `graphify-ts` (v0.2.0, publisher
 * "howell5") exists on npm. With the scoped package absent, npx downloaded that
 * stranger's package into ~/.npm/_npx and tried to run it, in the user's repo
 * cwd, with stdio ignored, and the catch swallowed it as "degrade gracefully".
 *
 * The same fallback sat on `npx vitest` / `npx jest` in rerun-tests — the
 * VERIFICATION path. There codehere would have downloaded a test runner,
 * executed it against the user's repo, and reported the result as "verifier
 * re-ran the suite", which is the strongest claim this product makes.
 *
 * A source-level invariant rather than a behavioural test on purpose: the unsafe
 * version only misbehaves when a package is ABSENT and the network is up, which
 * is precisely the case a unit test cannot reach. Grepping the source catches
 * the mistake at the moment it is written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('npx invocations', () => {
  it('never fall back to the public registry', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      // Find every 'npx' literal and inspect the window after it. Deliberately
      // NOT a tight structural regex: the first version required 'npx' to be
      // followed immediately by the args array, which missed the
      // `{ cmd: 'npx', args: [...] }` shape entirely and made this test pass
      // vacuously. A test that cannot fail is not a test — caught by planting a
      // violation and watching it stay green.
      const re = /['"]npx['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const window = src.slice(m.index, m.index + 200);
        if (!window.includes('--no-install')) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${file.split('/src/')[1]}:${line} → ${window.split('\n')[0].trim().slice(0, 70)}`);
        }
      }
    }
    expect(
      offenders,
      `npx without --no-install can fetch and execute a package from the registry:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
