#!/usr/bin/env node
/**
 * R0 anti-graveyard ratchet gate.
 *
 * Runs knip, counts dead code (unused exports + orphan files), compares against
 * knip-baseline.json. A commit that INCREASES dead code fails. A commit that
 * DECREASES it passes and nudges you to lower the baseline (the ratchet only
 * turns toward zero). This is what makes "no dead files you can't explain"
 * mechanical instead of a promise — you cannot commit a new orphan.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(join(root, 'knip-baseline.json'), 'utf8'));

let raw;
try {
  raw = execFileSync('npx', ['knip', '--reporter', 'json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (e) {
  // knip exits non-zero when it finds issues; the JSON is still on stdout.
  raw = e.stdout?.toString() || '';
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('knip-gate: could not parse knip output — is knip installed?');
  process.exit(2);
}

// knip@6 --reporter json shape: { issues: [ { file, files:[{name}], exports:[…],
// types:[…], enumMembers:[…], namespaceMembers:[…], dependencies:[…], … } ] }.
// Every category is an ARRAY. A whole-file orphan appears as a non-empty `files`
// array (and knip empties that file's `exports`), so orphan files MUST be counted
// from `files`, not inferred from `exports`. (This is the exact bug the refuter
// caught: the old code compared an array against `=== true`/number and never fired.)
const issues = Array.isArray(report.issues) ? report.issues : [];
const len = (v) => (Array.isArray(v) ? v.length : 0);
let unusedExports = 0;
let orphanFiles = 0;
let unusedDeps = 0;
for (const f of issues) {
  orphanFiles += len(f.files);
  unusedExports += len(f.exports) + len(f.types) + len(f.enumMembers) + len(f.namespaceMembers);
  unusedDeps += len(f.dependencies) + len(f.devDependencies);
}

const checks = [
  ['orphanFiles', orphanFiles, baseline.orphanFiles],
  ['totalUnusedExports', unusedExports, baseline.totalUnusedExports],
  ['unusedDeps', unusedDeps, baseline.unusedDeps],
];

let failed = false;
let improved = false;
for (const [name, current, base] of checks) {
  if (current > base) {
    console.error(
      `✗ ${name}: ${current} > baseline ${base} — you added dead code. Move-and-delete, don't add-alongside (delete what you stop using in the same change).`,
    );
    failed = true;
  } else if (current < base) {
    console.log(
      `✓ ${name}: ${current} < baseline ${base} — improvement! Lower knip-baseline.json to ${current} to lock it in.`,
    );
    improved = true;
  } else {
    console.log(`✓ ${name}: ${current} (baseline ${base})`);
  }
}

if (failed) {
  console.error('\nknip-gate FAILED — the anti-graveyard ratchet caught new dead code.');
  process.exit(1);
}
if (improved) {
  console.log('\nknip-gate passed (with improvements available to lock in).');
}
process.exit(0);
