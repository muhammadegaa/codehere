#!/usr/bin/env node
// S11 step 2: turn each fetched PR into one plain-text packet that every labeler (Claude, qwen, the owner) reads.
// Same bytes for all three. No detector output and no codehere knowledge goes into a packet.
// Input:  ../../evidence/S11/*.json (from `node sample.mjs fetch`)
// Output: ../../evidence/S11/packets/<repo>__<n>.txt and packets/index.json (both gitignored)
// Extra API calls: one git-tree read per PR whose text names a test file (to check the file exists at the PR head).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RAW = path.join(HERE, '../../evidence/S11');
const OUT = path.join(RAW, 'packets');
fs.mkdirSync(OUT, { recursive: true });

const TEST_NAME = /[\w@./-]*(?:test_[\w-]+\.py|[\w-]+_test\.(?:go|py|rb|rs)|[\w-]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)|[\w-]*Tests?\.(?:java|kt|cs|php))/g;
const isTestPath = (p) => /(^|\/)(tests?|__tests__|spec|specs)\//i.test(p) || /(\.test\.|\.spec\.|_test\.|test_[^/]*\.py$|Tests?\.(java|kt|cs|php)$)/i.test(p);
const CAP_PER_FILE = 3500;
const CAP_TOTAL = 14000;
const CAP_BODY = 5000;

function gh(args) {
  const r = spawnSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || '').slice(0, 160));
  return JSON.parse(r.stdout);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const index = [];
for (const f of fs.readdirSync(RAW).filter((x) => x.endsWith('.json')).sort()) {
  const rec = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
  const id = f.replace(/\.json$/, '');
  if (rec.error || !rec.pr) { index.push({ id, repo: rec.repo, number: rec.number, agent: rec.agent, unusable: rec.error || 'no pr' }); continue; }
  const { pr, files = [] } = rec;
  const body = (pr.body || '').slice(0, CAP_BODY);
  const text = `${pr.title}\n${body}`;
  const named = [...new Set(text.match(TEST_NAME) || [])];
  const filePaths = (Array.isArray(files) ? files : []).map((x) => x.filename);

  let tree = null, treeNote = '';
  if (named.length) {
    const cache = path.join(OUT, `${id}.tree.json`);
    if (fs.existsSync(cache)) tree = JSON.parse(fs.readFileSync(cache, 'utf8'));
    else {
      try { tree = gh([`repos/${rec.repo}/git/trees/${pr.head.sha}?recursive=1`]); fs.writeFileSync(cache, JSON.stringify(tree)); await sleep(300); }
      catch (e) { treeNote = `tree unavailable: ${e.message}`; }
    }
  }
  const treePaths = tree && !tree.truncated ? (tree.tree || []).map((t) => t.path) : null;
  const namedStatus = named.map((n) => {
    if (!treePaths) return `${n}: could not check (${treeNote || 'tree truncated'})`;
    const base = n.split('/').pop();
    const hit = treePaths.find((p) => p === n || p.endsWith('/' + n) || p.split('/').pop() === base);
    return `${n}: ${hit ? 'present in the repo at the PR head (' + hit + ')' : 'NOT in the repo at the PR head'}`;
  });

  const ordered = [...(Array.isArray(files) ? files : [])].sort((a, b) => Number(isTestPath(b.filename)) - Number(isTestPath(a.filename)));
  let used = 0;
  const diffs = ordered.map((x) => {
    const room = Math.max(0, Math.min(CAP_PER_FILE, CAP_TOTAL - used));
    const patch = x.patch ? x.patch.slice(0, room) : '(no patch text)';
    used += patch.length;
    const cut = x.patch && x.patch.length > room ? `\n... [patch cut at ${room} of ${x.patch.length} chars]` : '';
    return `--- ${x.filename} [${x.status}, +${x.additions} -${x.deletions}]${isTestPath(x.filename) ? ' (test file)' : ''}\n${patch}${cut}`;
  });

  const runs = (rec.checkRuns?.check_runs || []).map((c) => `  ${c.name}: ${c.status}/${c.conclusion}`);
  const statuses = (rec.status?.statuses || []).map((s) => `  ${s.context}: ${s.state}`);
  const ci = rec.checkRuns?.error ? `check-runs unavailable: ${rec.checkRuns.error}` : runs.length ? runs.join('\n') : '  (no check runs recorded)';

  const packet = [
    `PR ${rec.repo}#${rec.number}`,
    `author: ${pr.user?.login} (${pr.user?.type}) | state: ${pr.state}${pr.merged ? ' merged' : ''} | draft: ${pr.draft} | ${pr.changed_files} files, +${pr.additions} -${pr.deletions}`,
    `TITLE: ${pr.title}`,
    `BODY:\n${body || '(empty)'}`,
    `TEST FILES NAMED IN TITLE OR BODY (checked against the repo tree at the PR head):\n${namedStatus.length ? namedStatus.map((s) => '  ' + s).join('\n') : '  (none named)'}`,
    `CHECK RUNS ON THE PR HEAD (as recorded on ${new Date().toISOString().slice(0, 10)}):\n${ci}`,
    `COMMIT STATUSES:\n${statuses.length ? statuses.join('\n') : '  (none)'}`,
    `FILES CHANGED (${filePaths.length}${pr.changed_files > filePaths.length ? ' of ' + pr.changed_files + ', first 100 only' : ''}):\n${filePaths.join('\n')}`,
    `DIFFS (test files first):\n${diffs.join('\n\n')}`,
  ].join('\n\n');

  fs.writeFileSync(path.join(OUT, `${id}.txt`), packet);
  index.push({ id, repo: rec.repo, number: rec.number, agent: rec.agent, chars: packet.length, namedTestFiles: named.length, hasCheckRuns: runs.length > 0 });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log('packets', index.filter((x) => !x.unusable).length, 'unusable', index.filter((x) => x.unusable).length);
