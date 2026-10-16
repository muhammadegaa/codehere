#!/usr/bin/env node
// Verifies every row in evidence/ledger.jsonl: stored files exist and their sha256 still matches.
// Exit 0 only if every row checks out. Prints the failing rows.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledger = path.join(ROOT, 'evidence', 'ledger.jsonl');
if (!fs.existsSync(ledger)) {
  console.error('no ledger yet');
  process.exit(2);
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
let ok = 0;
const bad = [];
for (const [n, line] of fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).entries()) {
  const row = JSON.parse(line);
  const problems = [];
  for (const [p, h] of [[row.stdoutPath, row.stdoutSha256], [row.stderrPath, row.stderrSha256]]) {
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f)) problems.push(`missing ${p}`);
    else if (sha(fs.readFileSync(f)) !== h) problems.push(`hash mismatch ${p}`);
  }
  if (problems.length) bad.push({ line: n + 1, runId: row.runId, problems });
  else ok++;
}
console.log(`rows ok: ${ok}, rows failing: ${bad.length}`);
for (const b of bad) console.log(JSON.stringify(b));
process.exit(bad.length ? 1 : 0);
