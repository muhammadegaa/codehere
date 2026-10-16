#!/usr/bin/env node
// Verifies a claims file: every quote must still appear verbatim in its source file, on the recorded line,
// and the quote hash must match. Exit 0 only if all claims pass. usage: node check-quotes.mjs <claims.json>
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const file = process.argv[2];
if (!file) {
  console.error('usage: check-quotes.mjs <claims.json>');
  process.exit(64);
}
const { claims } = JSON.parse(fs.readFileSync(file, 'utf8'));
let bad = 0;
for (const c of claims) {
  const problems = [];
  if (!fs.existsSync(c.file)) problems.push('source file missing');
  else {
    const txt = fs.readFileSync(c.file, 'utf8');
    const idx = txt.indexOf(c.quote);
    if (idx < 0) problems.push('quote not found verbatim');
    else if (txt.slice(0, idx).split('\n').length !== c.line) problems.push(`line moved (recorded ${c.line})`);
    if (sha(c.quote) !== c.quote_sha256) problems.push('quote hash mismatch');
  }
  if (problems.length) {
    bad++;
    console.log(`FAIL ${c.id}: ${problems.join(', ')}`);
  }
}
console.log(`quotes checked: ${claims.length}, failing: ${bad}`);
process.exit(bad ? 1 : 0);
