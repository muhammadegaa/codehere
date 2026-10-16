#!/usr/bin/env node
// Guard for global agent configs. `snapshot` records sha256 (or "absent") per file; `check` compares and exits 1 on any change.
// usage: node guard.mjs snapshot | node guard.mjs check
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'harness', 'guard.json');
const H = os.homedir();
const WATCH = [
  path.join(H, '.claude', 'settings.json'),
  path.join(H, '.codex', 'config.toml'),
  path.join(H, '.codehere', 'config.json'),
  path.join(H, '.codehere', 'sessions.jsonl'),
  path.join(H, '.claude', 'CLAUDE.md'),
];
const hash = (p) => (fs.existsSync(p) ? createHash('sha256').update(fs.readFileSync(p)).digest('hex') : 'absent');
const now = Object.fromEntries(WATCH.map((p) => [p, hash(p)]));
const mode = process.argv[2];
if (mode === 'snapshot') {
  fs.writeFileSync(FILE, JSON.stringify({ utc: new Date().toISOString(), files: now }, null, 2));
  console.log('snapshot written for', WATCH.length, 'files');
} else if (mode === 'check') {
  const before = JSON.parse(fs.readFileSync(FILE, 'utf8')).files;
  const changed = WATCH.filter((p) => before[p] !== now[p]);
  for (const p of WATCH) console.log(before[p] === now[p] ? 'same   ' : 'CHANGED', p.replace(H, '~'), now[p] === 'absent' ? '(absent)' : '');
  process.exit(changed.length ? 1 : 0);
} else {
  console.error('usage: guard.mjs snapshot|check');
  process.exit(64);
}
