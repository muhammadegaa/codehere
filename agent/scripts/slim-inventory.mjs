#!/usr/bin/env node
// Tracked files and line counts per group, used to size the slim-down in docs/gates/SLIM-PLAN.md. Run from anywhere in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
const files = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
const bin = /\.(png|jpg|jpeg|gif|webm|mp4|pdf|ico|svg|woff2?|ttf|zip|gz)$/i;
const g = (f) => {
  if (f.startsWith('agent/src/')) return 'agent/src';
  if (f.startsWith('agent/test-fixtures/')) return 'agent/test-fixtures';
  if (f.startsWith('agent/test/')) return 'agent/test';
  if (/^agent\/eval\/(false-done|promise-verification)/.test(f)) return 'agent/eval: false-done* and promise-verification (keep)';
  if (f.startsWith('agent/eval/')) return 'agent/eval: other';
  if (f.startsWith('agent/docs/')) return 'agent/docs';
  if (f.startsWith('agent/scripts/')) return 'agent/scripts';
  if (f.startsWith('agent/.codehere-cache/')) return 'agent/.codehere-cache';
  if (f.startsWith('agent/.claude/')) return 'agent/.claude';
  if (f.startsWith('action/')) return 'action/';
  if (f.startsWith('docs/gates/') || f.startsWith('docs/learn/')) return 'docs/gates and docs/learn (this work)';
  if (f.startsWith('docs/')) return 'docs/ (rest)';
  if (f.startsWith('vscode-extension/')) return 'vscode-extension/';
  if (f.startsWith('scripts/')) return 'scripts/ (repo root)';
  if (f.startsWith('.githooks/')) return '.githooks/';
  if (f.startsWith('.github/')) return '.github/';
  if (!f.includes('/')) return 'repo root files';
  if (f.startsWith('agent/') && f.split('/').length === 2) return 'agent root files';
  return f.split('/')[0] + '/ other';
};
const t = {};
for (const f of files) {
  let n = 0;
  if (!bin.test(f)) { try { n = (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/\n/g) || []).length; } catch {} }
  const k = g(f); t[k] = t[k] || { files: 0, lines: 0 }; t[k].files++; t[k].lines += n;
}
console.log('tracked files', files.length);
for (const [k, v] of Object.entries(t).sort((a, b) => b[1].lines - a[1].lines)) console.log(String(v.files).padStart(4), 'files', String(v.lines).padStart(8), 'lines ', k);
