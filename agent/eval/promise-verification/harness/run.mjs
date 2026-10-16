#!/usr/bin/env node
// Evidence recorder. Runs one command, stores stdout and stderr with sha256, appends one row to evidence/ledger.jsonl.
// usage: node run.mjs --claim <id> --test <id> [--target pub|head|none] [--cwd dir] [--env K=V]... [--timeout ms] [--note text] -- <cmd> [args...]
// It records what happened. It never decides pass or fail; graders do that from the stored output.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0) {
  console.error('missing "-- <cmd>"');
  process.exit(64);
}
const opts = { env: [] };
const ALLOWED = new Set(['claim', 'test', 'target', 'cwd', 'timeout', 'note']);
for (let i = 0; i < sep; i++) {
  const k = argv[i];
  if (k === '--env') {
    const kv = argv[++i];
    if (!kv || !/^[A-Za-z_][A-Za-z0-9_]*=/.test(kv)) {
      console.error(`bad --env value: ${JSON.stringify(kv)} (expected K=V)`);
      process.exit(64);
    }
    opts.env.push(kv);
  } else if (k.startsWith('--') && ALLOWED.has(k.slice(2))) {
    opts[k.slice(2)] = argv[++i];
  } else {
    console.error(`unknown or malformed option before "--": ${JSON.stringify(k)}`);
    process.exit(64);
  }
}
if (opts.cwd && !fs.existsSync(opts.cwd)) {
  console.error(`--cwd does not exist: ${opts.cwd}`);
  process.exit(64);
}
const cmd = argv.slice(sep + 1);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const runId = `${stamp}-${randomBytes(3).toString('hex')}`;
const dir = path.join(ROOT, 'evidence', runId);
fs.mkdirSync(dir, { recursive: true });

const env = { ...process.env };
for (const kv of opts.env) {
  const i = kv.indexOf('=');
  env[kv.slice(0, i)] = kv.slice(i + 1);
}
const t0 = Date.now();
const r = spawnSync(cmd[0], cmd.slice(1), {
  cwd: opts.cwd || process.cwd(),
  env,
  encoding: 'buffer',
  timeout: Number(opts.timeout || 300000),
  maxBuffer: 64 * 1024 * 1024,
});
const out = r.stdout || Buffer.alloc(0);
const err = r.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(dir, 'stdout.txt'), out);
fs.writeFileSync(path.join(dir, 'stderr.txt'), err);

const tarball = { pub: 'codehere-1.0.1.tgz', head: 'codehere-1.0.2.tgz' }[opts.target];
const tarPath = tarball ? path.join(ROOT, 'target', tarball) : null;
const row = {
  runId,
  utc: new Date(t0).toISOString(),
  claim: opts.claim || null,
  test: opts.test || null,
  target: opts.target || 'none',
  targetSha256: tarPath && fs.existsSync(tarPath) ? sha(fs.readFileSync(tarPath)) : null,
  cwd: opts.cwd || process.cwd(),
  command: cmd,
  envOverrides: Object.fromEntries(opts.env.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])),
  exitCode: r.status,
  signal: r.signal,
  spawnError: r.error ? String(r.error.code || r.error.message) : null,
  durationMs: Date.now() - t0,
  stdoutPath: path.relative(ROOT, path.join(dir, 'stdout.txt')),
  stdoutSha256: sha(out),
  stderrPath: path.relative(ROOT, path.join(dir, 'stderr.txt')),
  stderrSha256: sha(err),
  node: process.version,
  platform: `${os.platform()}-${os.arch()}`,
  graderId: null,
  result: 'recorded',
  note: opts.note || null,
};
fs.appendFileSync(path.join(ROOT, 'evidence', 'ledger.jsonl'), JSON.stringify(row) + '\n');
console.log(
  JSON.stringify({ runId, exitCode: row.exitCode, signal: row.signal, durationMs: row.durationMs, stdoutBytes: out.length, stderrBytes: err.length, dir: path.relative(ROOT, dir) }),
);
