#!/usr/bin/env node
// Local dry run of the Action. Step 1 and step 3 are the real shell blocks sliced out of action/action.yml; step 2 is the real
// post-receipt.mjs talking to a mock GitHub API. Nothing leaves this machine except npm fetching the package dependencies.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

// Campaign scratch folder. Set CAMPAIGN_SCRATCH to use another location.
const SC = process.env.CAMPAIGN_SCRATCH || path.join(os.tmpdir(), 'promise-verification');
const REPO = SC + '/throwaway/codehere-receipt-test';
const BODIES = SC + '/throwaway/pr-bodies/';
const HOMEF = SC + '/sandbox/home';
const TGZ = SC + '/target/codehere-1.0.2.tgz';
const W = SC + '/sandbox/sim';
fs.rmSync(W, { recursive: true, force: true });
fs.mkdirSync(W, { recursive: true });
const run = (cmd, args, opts = {}) => cp.spawnSync(cmd, args, { encoding: 'utf8', ...opts });

run('git', ['clone', '--bare', '-q', REPO, W + '/origin.git']);
const yml = fs.readFileSync(REPO + '/action/action.yml', 'utf8');
const dedent = (s) => s.split('\n').map((l) => (l.startsWith('        ') ? l.slice(8) : l)).join('\n');
const endMarker = 'cat "$RUNNER_TEMP/codehere-receipt.md" >> "$GITHUB_STEP_SUMMARY"';
const a1 = yml.indexOf('        args=(check --json)');
const b1 = yml.indexOf(endMarker);
const a3 = yml.indexOf('        if [ "$VERDICT" = "fail" ]; then');
if (a1 < 0 || b1 < 0 || a3 < 0) throw new Error('could not slice the steps out of action.yml');
const STEP1 = dedent(yml.slice(a1, b1 + endMarker.length));
const STEP3 = dedent(yml.slice(a3));

const readOr = (p, d = '') => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : d);
function step1(branch, claim, version = 'file:' + TGZ) {
  const d = `${W}/work-${branch}-${Math.random().toString(36).slice(2, 7)}`;
  run('git', ['clone', '-q', W + '/origin.git', d]);
  run('git', ['checkout', '-q', branch], { cwd: d });
  const tmp = fs.mkdtempSync(W + '/rt-');
  fs.writeFileSync(tmp + '/out', '');
  fs.writeFileSync(tmp + '/summary', '');
  const env = { ...process.env, HOME: HOMEF, CODEHERE_TEST_CMD: '', CODEHERE_VERSION: version, BASE_REF: 'main', CLAIM: claim, RUNNER_TEMP: tmp, GITHUB_ACTION_PATH: REPO + '/action', GITHUB_STEP_SUMMARY: tmp + '/summary', GITHUB_OUTPUT: tmp + '/out' };
  const t0 = Date.now();
  const r = run('bash', ['-c', STEP1], { cwd: d, env, timeout: 240000 });
  let res = null;
  try {
    res = JSON.parse(readOr(tmp + '/codehere-result.json', 'null'));
  } catch {}
  const verdict = (readOr(tmp + '/out').match(/verdict=(\S+)/) || [])[1];
  const s3 = run('bash', ['-c', STEP3], { env: { ...process.env, VERDICT: verdict || '', FAIL_ON_UNVERIFIED: 'false' } });
  return {
    branch, step1Exit: r.status, jobExit: s3.status, ms: Date.now() - t0, verdict, kind: res?.kind,
    weakened: res?.weakened?.length, missingClaimed: res?.missingClaimed,
    receipt: readOr(tmp + '/codehere-receipt.md').trim(), stderr: readOr(tmp + '/codehere-stderr.txt').trim().slice(0, 160), tmp,
  };
}

// ---------- mock GitHub API ----------
const BOT = 'github-actions[bot]';
function mockApi() {
  const state = { comments: [], next: 1000, requests: [], failPost: false };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      state.requests.push(req.method + ' ' + url.pathname + url.search);
      const list = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/);
      const one = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/);
      const send = (s, o) => {
        res.writeHead(s, { 'content-type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      if (list && req.method === 'GET') {
        const per = +url.searchParams.get('per_page') || 30, page = +url.searchParams.get('page') || 1;
        return send(200, state.comments.slice((page - 1) * per, page * per));
      }
      if (list && req.method === 'POST') {
        if (state.failPost) return send(403, { message: 'Resource not accessible by integration' });
        const c = { id: state.next++, body: JSON.parse(body).body, user: { login: BOT } };
        state.comments.push(c);
        return send(201, c);
      }
      if (one && req.method === 'PATCH') {
        const c = state.comments.find((x) => x.id === +one[1]);
        if (!c) return send(404, {});
        if (c.user.login !== BOT) return send(403, { message: 'cannot edit another user comment' });
        c.body = JSON.parse(body).body;
        return send(200, c);
      }
      send(404, {});
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, state, port: server.address().port })));
}
function step2(port, receiptFile, event = { pull_request: { number: 7 } }) {
  const ev = W + '/event.json';
  fs.writeFileSync(ev, JSON.stringify(event));
  return new Promise((resolve) => {
    const p = cp.spawn('node', [REPO + '/action/post-receipt.mjs'], { env: { ...process.env, GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'o/r', GITHUB_EVENT_PATH: ev, RECEIPT_FILE: receiptFile, GITHUB_API_URL: 'http://127.0.0.1:' + port } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ exit: code, out: out.trim().slice(0, 170) }));
  });
}

(async () => {
  const results = { scenarios: [], hostile: [], upsert: [] };
  // ---- the five pull-request scenarios, with their real bodies ----
  const MAIN = [['clean-change'], ['weakened-test'], ['claims-missing-file'], ['hostile-body'], ['latest-default', 'latest']];
  const SENT_PWN = '/tmp/codehere-pwned';
  fs.rmSync(SENT_PWN, { force: true });
  for (const [b, v] of MAIN) {
    const r = step1(b, fs.readFileSync(BODIES + b + '.md', 'utf8'), v);
    results.scenarios.push(r);
  }
  const pwned = fs.existsSync(SENT_PWN);
  fs.rmSync(SENT_PWN, { force: true });
  // ---- hostile PR bodies on a clean branch ----
  const SENT = W + '/SENTINEL';
  const H = {
    'dollar-paren': `$(touch ${SENT})`, backticks: '`touch ' + SENT + '`', 'newline-then-flag': `line1\n--base evil\n$(touch ${SENT})`,
    'leading-dashes': '--help', 'claim-equals-json': '--claim=--json', 'quote-break': `'; touch ${SENT}; echo '`,
    'max-size-65536': 'A'.repeat(65536), unicode: '‮evil‬ 日本語 🧪 tests/ünï.test.js', empty: '',
  };
  for (const [k, claim] of Object.entries(H)) {
    fs.rmSync(SENT, { force: true });
    const r = step1('clean-change', claim);
    results.hostile.push({ case: k, injected: fs.existsSync(SENT), step1Exit: r.step1Exit, verdict: r.verdict, ms: r.ms, receiptHead: r.receipt.split('\n')[1]?.slice(0, 80) });
  }
  // ---- step 2 against the mock API ----
  const receiptA = W + '/receiptA.md', receiptB = W + '/receiptB.md';
  fs.writeFileSync(receiptA, '<!-- codehere-receipt -->\n> receipt A\n');
  fs.writeFileSync(receiptB, '<!-- codehere-receipt -->\n> receipt B\n');
  const bot = (id, body) => ({ id, body, user: { login: BOT } });
  const other = (id, body) => ({ id, body, user: { login: 'mallory' } });
  const filler = (n) => Array.from({ length: n }, (_, i) => other(i + 1, 'noise ' + i));
  const cases = [
    ['first post', [], receiptA, (s) => s.comments.length === 1 && s.requests.some((x) => x.startsWith('POST'))],
    ['second post updates the same comment', [bot(1, '<!-- codehere-receipt -->\n> receipt A\n')], receiptB, (s) => s.comments.length === 1 && s.comments[0].body.includes('receipt B') && s.requests.some((x) => x.startsWith('PATCH'))],
    ['a stranger comment contains the marker first', [other(1, '<!-- codehere-receipt -->\nspoof')], receiptA, (s) => s.comments.some((c) => c.user.login === BOT)],
    ['our comment is on page 2 of 150', [...filler(119), bot(120, '<!-- codehere-receipt -->\n> receipt A\n'), ...filler(30)], receiptB, (s) => s.comments.length === 150 && s.comments[119].body.includes('receipt B')],
    ['our comment is number 520', [...filler(519), bot(520, '<!-- codehere-receipt -->\n> receipt A\n')], receiptB, (s) => s.comments.length === 520],
    ['fork PR: the token cannot post', [], receiptA, null, { failPost: true }],
    ['event has no pull request', [], receiptA, (s) => s.requests.length === 0, {}, { push: {} }],
    ['receipt without the marker', [], W + '/bad.md', (s) => s.requests.length === 0],
  ];
  fs.writeFileSync(W + '/bad.md', 'no marker here\n');
  for (const [name, seed, file, ok, opts = {}, ev] of cases) {
    const { server, state, port } = await mockApi();
    state.comments = seed;
    Object.assign(state, opts);
    const r = await step2(port, file, ev);
    server.close();
    results.upsert.push({ case: name, exit: r.exit, requests: state.requests.length, comments: state.comments.length, expectedBehaviour: ok ? !!ok(state) : null, out: r.out });
  }
  fs.writeFileSync(SC + '/studies/S9/sim-results.json', JSON.stringify({ pwnedFromRealBranch: pwned, ...results }, null, 2));

  // ---------- print ----------
  console.log('## PR scenarios (what you should see on GitHub)');
  for (const r of results.scenarios) console.log(`- ${r.branch.padEnd(20)} verdict=${String(r.verdict).padEnd(10)} kind=${String(r.kind).padEnd(9)} weakened=${r.weakened ?? '-'} missingClaimed=${JSON.stringify(r.missingClaimed ?? null)} job-exit=${r.jobExit} | ${r.receipt.split('\n')[1]?.slice(0, 90) ?? '(no receipt)'}${r.stderr ? ' | stderr: ' + r.stderr.slice(0, 70) : ''}`);
  console.log('hostile branch body ran a command:', pwned);
  console.log('\n## hostile PR bodies');
  for (const h of results.hostile) console.log(`- ${h.case.padEnd(18)} injected=${h.injected} step1-exit=${h.step1Exit} verdict=${h.verdict} ${h.ms}ms | ${h.receiptHead ?? ''}`);
  console.log('\n## post-receipt.mjs against the mock API');
  for (const u of results.upsert) console.log(`- ${u.case.padEnd(46)} exit=${u.exit} requests=${u.requests} comments=${u.comments} expected-behaviour=${u.expectedBehaviour} | ${u.out}`);
  process.exit(0);
})();
