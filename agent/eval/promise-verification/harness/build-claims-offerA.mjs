#!/usr/bin/env node
// W1: offer A's sentences as contracts. Quotes are located in their source files by exact substring (build fails if one
// is missing). `verdict` stays null for every row: graders decide verdicts. `status` only says what evidence exists.
import { createHash } from 'node:crypto';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

// Campaign scratch folder (claims json, run evidence). Set CAMPAIGN_SCRATCH to use another location.
const SC = process.env.CAMPAIGN_SCRATCH || nodePath.join(os.tmpdir(), 'promise-verification');
const REPO = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '../../../..');
const F = {
  offer: REPO + '/agent/docs/discovery/OUTREACH_QUEUE.md',
  action: REPO + '/action/action.yml',
  spec: REPO + '/agent/docs/GITHUB_ACTION_SPEC.md',
  readme: REPO + '/agent/README.md',
  receipt: SC + '/evidence/20261009130616-ed6a6b/receipt.md',
};
// ledger run ids
const E = {
  evalHead: '20261009130446-65c522', evalPubAdapted: '20261009130552-da396b',
  actionPub: '20261009130616-fbc1af', actionHead: '20261009130616-ed6a6b',
  helpPub: '20261009130648-5ce475', helpHead: '20261009130649-1094ff',
  pass: '20261009143510-2ff017', fail: '20261009143511-6853cc', none: '20261009143511-0344f0',
  sentHead: '20261009143546-97f0c9', sentNeg: '20261009143547-533fc1', sentPub: '20261009143547-77d664',
  pubPlain: '20261009130539-4df905',
};
const T = 'T-head 1.0.2 (11fc50a) unless stated';
const rows = [
  { id: 'VER-A01', src: 'offer', exposure: 'E3', type: 'capability', quote: 'it re-runs the exact tests the agent *claimed* it ran, in clean CI',
    status: 'wording_conflict', evidence: [E.helpHead, E.actionHead],
    contract: { scope: 'what check re-runs', command: 'codehere check --json --base <ref> --claim <text>', expected: 're-runs the whole project suite; --claim only flags test files the AI named that are not in the repo', known_gap: '"in clean CI" needs the Action run on a real PR' },
    note: 'Not what the product does. It re-runs the project test command (receipt: `npm test`), not the tests the agent claimed. Suggested wording: re-runs your test suite in clean CI and flags tests the AI weakened or test files it named that are not there.' },
  { id: 'VER-A02', src: 'offer', exposure: 'E3', type: 'capability', quote: 'green-for-real or caught-you',
    status: 'observed_partial', evidence: [E.pass, E.fail, E.actionHead, E.evalHead],
    contract: { scope: 'receipt outcome on local fixtures', command: 'check --json then action/summarize.mjs', expected: 'pass = green tick, weakened or failing = cross', known_gap: 'not run on a real PR; the published 1.0.1 cannot flag weakened tests (F-001)' }, note: '' },
  { id: 'VER-A03', src: 'offer', exposure: 'E3', type: 'capability', quote: 'so "tests pass" is something the team and the client can see before',
    status: 'blocked_needs_ega', evidence: [], contract: { scope: 'a real pull request', command: 'Action on a throwaway public repo', expected: 'receipt comment visible to a reviewer before merge', known_gap: 'needs the repo and published 1.0.2' }, note: '' },
  { id: 'VER-A04', src: 'offer', exposure: 'E3', type: 'comparative', quote: 'Free checkers, linters and a green CI tell *you* to go re-check the agent.',
    status: 'not_tested', evidence: [], contract: { scope: 'named free checkers and plain CI', command: 'W4 head to head on frozen fixtures', expected: 'each tool run on the same cases', known_gap: 'the 8 Oct comparison covered test-guard and proof-of-work-agent only, not Vet' }, note: '' },
  { id: 'VER-A05', src: 'offer', exposure: 'E3', type: 'capability', quote: 'codehere posts the proof',
    status: 'blocked_needs_ega', evidence: [], contract: { scope: 'comment on a PR', command: 'Action with comment: true', expected: 'one receipt comment on the PR', known_gap: 'post-receipt.mjs not yet tested even against a mock GitHub API' }, note: '' },
  { id: 'VER-A06', src: 'offer', exposure: 'E3', type: 'conditional', quote: 'If it catches one fake-green in your repo on the first run, are you in at £79?',
    status: 'see_note', evidence: [], contract: { scope: 'first run on a buyer repo', command: 'n/a', expected: 'n/a', known_gap: 'depends on how often agents weaken tests' },
    note: 'Frequency evidence: 0 real test weakenings in 302 held-out agent PRs (2026-10-06 AIDev check, patch level; not reproducible: source data lost, one labeler, not to be cited until re-run). A first-run catch may be rare, so the receipt\'s value should not rest on it.' },
  { id: 'VER-A07', src: 'offer', exposure: 'E3', type: 'availability', quote: 'I set you up the day it ships',
    status: 'blocked_needs_ega', evidence: [E.actionPub, E.helpPub], contract: { scope: 'what "ships" means', command: 'npm view codehere version', expected: '1.0.2 published and the Action usable', known_gap: 'latest is 1.0.1 and the Action default posts "couldn\'t run the check"' }, note: '' },
  { id: 'VER-B01', src: 'action', exposure: 'E2', type: 'capability', quote: 'Re-run this pull request\'s tests in your own CI, flag tests the AI weakened, and post one receipt.',
    status: 'observed_partial', evidence: [E.actionHead, E.actionPub, E.sentHead], contract: { scope: 'Action steps', command: 'action.yml on a runner', expected: 're-run, flag weakened, one comment', known_gap: 'not run on GitHub; "one receipt" untested; default version fails until 1.0.2 is published' }, note: 'Re-run and weakened flag observed locally on 1.0.2.' },
  { id: 'VER-B02', src: 'action', exposure: 'E2', type: 'absence', quote: 'Runs entirely on the job\'s own runner with the job\'s own token. codehere receives nothing.',
    status: 'not_tested', evidence: [], contract: { scope: 'network behaviour of check and the Action', command: 'check inside a network-less container plus a static grep of the check path', expected: 'works with no network; no outbound call to a codehere host', known_gap: 'npx itself fetches from the npm registry' }, note: '' },
  { id: 'VER-B03', src: 'action', exposure: 'E2', type: 'documented limitation', quote: 'The weakened-test checks need a release that includes them.',
    status: 'observed', evidence: [E.actionPub, E.helpPub, E.helpHead], contract: { scope: 'which versions have the checks', command: 'check --help per version', expected: '--claim and --base only in 1.0.2', known_gap: '' }, note: 'True, and it is why the default `latest` fails today.' },
  { id: 'VER-C01', src: 'spec', exposure: 'E3', type: 'capability', quote: 'pinned to the exact SHA it ran',
    status: 'observed', evidence: [E.actionHead], contract: { scope: 'commit shown in the receipt', command: 'compare receipt SHA to git rev-parse', expected: 'equal', known_gap: 'local fixture only' }, note: 'Receipt showed 3bc3bfa; fixture HEAD is 3bc3bfa.' },
  { id: 'VER-C02', src: 'spec', exposure: 'E3', type: 'capability', quote: 'One comment, always current.',
    status: 'not_tested', evidence: [], contract: { scope: 'post-receipt.mjs upsert', command: 'mock GitHub API: first post, second post, many comments, foreign comment', expected: 'POST once, then PATCH the same comment', known_gap: '' }, note: '' },
  { id: 'VER-D01', src: 'readme', exposure: 'E1', type: 'capability', quote: '`codehere check` re-runs your project\'s tests itself and reports the real result',
    status: 'observed', evidence: [E.sentHead, E.sentPub, E.sentNeg, E.pubPlain], contract: { scope: 'both versions', command: 'check on a suite whose test writes a marker file', expected: 'marker exists only if the suite really ran', known_gap: 'one runner (node --test)' }, note: 'Marker file appears on 1.0.2 and 1.0.1; absent when there is no suite.' },
  { id: 'VER-D02', src: 'readme', exposure: 'E1', type: 'capability', quote: 'It detects `npm test`, `node --test`, `pytest`, `go test`, `cargo test` and vitest or jest configs.',
    status: 'not_tested', evidence: [], contract: { scope: 'runner detection', command: 'one fixture per runner: pass, fail, zero collected', expected: 'right command, right verdict', known_gap: 'cargo needs a container' }, note: '' },
  { id: 'VER-D03', src: 'readme', exposure: 'E1', type: 'capability', quote: 'It exits 1 when the tests fail, and also when the tests pass but the change made them check nothing',
    status: 'observed', evidence: [E.fail, E.actionHead, E.evalHead], contract: { scope: '1.0.2, the listed patterns', command: 'check on failing and weakened fixtures', expected: 'exit 1', known_gap: 'the published 1.0.1 exits 0 on weakened tests' }, note: '' },
  { id: 'VER-D04', src: 'readme', exposure: 'E1', type: 'capability', quote: '`--json` adds a `verdict` (`pass`, `fail`, `unverified`) and the receipt text.',
    status: 'observed', evidence: [E.pass, E.fail, E.none, E.actionHead], contract: { scope: '1.0.2', command: 'check --json on pass, fail, no-suite fixtures', expected: 'verdict pass, fail, unverified plus a receipt string', known_gap: 'the published 1.0.1 has no verdict field' }, note: 'All three values observed.' },
  { id: 'VER-D05', src: 'readme', exposure: 'E1', type: 'quantitative', quote: 'Measured on 21 cases (13 false "tests pass" claims and 8 true ones; 6 reconstructed from public posts, the rest planted): 11 of the 13 false claims caught, and 0 false alarms on the 8 true ones',
    status: 'observed', evidence: [E.evalHead], contract: { scope: '1.0.2 on the 21-case set', command: 'node eval/false-done.mjs', expected: '11/13 caught, 8/8 confirmed, 0 false alarms', known_gap: 'the published 1.0.1 catches 3 of 13 (run ' + E.evalPubAdapted + ')' }, note: 'Replaced a stale sentence (12 cases, 10 caught).' },
  { id: 'VER-D06', src: 'readme', exposure: 'E1', type: 'availability', quote: 'It is not published to the marketplace yet.',
    status: 'not_tested', evidence: [], contract: { scope: 'GitHub Marketplace', command: 'search the marketplace', expected: 'no listing', known_gap: '' }, note: '' },
  { id: 'VER-D07', src: 'readme', exposure: 'E1', type: 'limits', quote: 'What it does not cover: a passing suite with a broken build, code the tests do not cover, and ways of weakening a test outside the patterns above.',
    status: 'observed', evidence: [E.evalHead], contract: { scope: 'known misses', command: 'eval fd-14 and fd-04', expected: 'both missed', known_gap: '' }, note: 'The two false greens in the eval are exactly these.' },
  { id: 'VER-E01', src: 'receipt', exposure: 'E2', type: 'runtime assertion', quote: 'codehere independently re-ran `npm test`',
    status: 'observed', evidence: [E.sentHead, E.sentNeg, E.actionHead], contract: { scope: 'receipt wording vs behaviour', command: 'marker-file suite', expected: 'string appears only when the suite ran', known_gap: 'no-suite case prints a different receipt, not this string' }, note: '' },
  { id: 'VER-E02', src: 'receipt', exposure: 'E2', type: 'runtime assertion', quote: 'Observed, not the AI\'s claim.',
    status: 'observed', evidence: [E.sentHead, E.actionHead], contract: { scope: 'same as E01', command: 'same', expected: 'same', known_gap: '' }, note: '' },
  { id: 'VER-E03', src: 'receipt', exposure: 'E2', type: 'limits', quote: 'Scope: the project\'s test suite',
    status: 'observed', evidence: [E.actionHead], contract: { scope: 'receipt scope line', command: 'read receipt', expected: 'present', known_gap: '' }, note: '' },
];


// ---- 2026-10-09 updates: the owner approved the accurate offer wording; local dry run of the Action (run a485be) ----
const upd = (id, f) => Object.assign(rows.find((r) => r.id === id), f);
const SIM = '20261009144611-a485be';
upd('VER-A01', { quote: "it re-runs your test suite in clean CI, flags tests the AI weakened or test files it named that aren't there", status: 'observed_partial', evidence: [E.pass, E.fail, E.actionHead, SIM],
  contract: { scope: 'what check re-runs and flags', command: 'check --json --base <ref> --claim <text> through the Action steps', expected: 'whole suite re-run; weakened tests and missing named test files flagged', known_gap: '"in clean CI" needs the Action on a real PR' },
  note: 'Replaces "re-runs the exact tests the agent claimed it ran" (the owner approved 2026-10-09). Weakened and missing-file cases observed in the local dry run.' });
upd('VER-A05', { evidence: [SIM], note: 'Mock GitHub API only: first post and update work. A real PR is still needed.' });
upd('VER-B01', { evidence: [E.actionHead, E.actionPub, E.sentHead, SIM], note: 'Re-run, weakened flag and missing-file flag observed through the real Action shell steps; one comment observed on a mock API. Not run on GitHub.' });
upd('VER-C02', { status: 'observed_partial', evidence: [SIM],
  contract: { scope: 'post-receipt.mjs upsert on a mock API', command: 'first post, second post, 150 comments, stranger marker, 520 comments, fork 403', expected: 'POST once, then PATCH the same comment', known_gap: 'a stranger comment containing the marker suppresses the receipt (F-009); above 500 comments a second receipt is posted (F-011)' },
  note: 'Holds in the normal cases and on page 2 of 150 comments.' });
rows.push({ id: 'VER-D08', src: 'readme', exposure: 'E1', type: 'capability', quote: '# flag test files it named that do not exist', status: 'observed', evidence: [SIM, E.helpHead],
  contract: { scope: '--claim on 1.0.2', command: 'check --claim "<text naming tests/payment.test.js>" on a repo without that file', expected: 'missingClaimed lists the file; verdict fail', known_gap: 'only file names that look like test files' }, note: 'tests/payment.test.js was flagged.' });
rows.push({ id: 'VER-B04', src: 'action', exposure: 'E2', type: 'guarantee', quote: '# Untrusted text: passed through the environment, never interpolated into the script.', status: 'observed_partial', evidence: [SIM],
  contract: { scope: 'PR body used as --claim', command: 'nine hostile payload classes through the real step 1, sentinel file as oracle', expected: 'no command runs', known_gap: 'nine classes, not exhaustive' }, note: 'No payload executed a command, including a 65,536 byte body.' });
rows.push({ id: 'VER-C03', src: 'spec', exposure: 'E3', type: 'guarantee', quote: 'Green (`success`) is reachable only from `passed`.', status: 'wording_conflict', evidence: [SIM],
  contract: { scope: 'what shows green on the pull request', command: 'Action with the default version (unverified verdict)', expected: 'only a passed verdict is green', known_gap: 'fail-on-unverified defaults to false' },
  note: 'F-010: on an unverified run the receipt says unverified but the job exits 0, so the status check is green (scenario latest-default).' });


upd('VER-D05', { quote: 'Measured on 21 cases (13 false "tests pass" or "all green" claims, 6 of them reconstructed from public posts and 7 planted, plus 8 true ones), run with `--claim`, and `--base` for committed changes: 11 of the 13 false claims caught, and 0 false alarms on the 8 true ones',
  note: 'Rewritten after a cold review: the 8 true cases are controls, not planted cheats, and the number depends on --claim and --base. Describes 1.0.2; the published 1.0.1 catches 3 of 13 (run ' + E.evalPubAdapted + ').' });


upd('VER-D02', { status: 'observed_partial', evidence: ['20261009145226-4bc9e2', '20261009145227-2d99a5', '20261009145228-e5cca4', '20261009145228-75d88a', '20261009145229-f1ab86', '20261009145230-1115c5', E.pass, E.fail, E.none],
  contract: { scope: 'runner detection on 1.0.2: node --test, pytest, go test', command: 'pass, fail and no-tests fixtures per runner', expected: 'pass is pass, fail is fail, no tests is not a pass', known_gap: 'a Go project with no test files returns pass (F-013); cargo test, vitest and jest configs not tested' },
  note: 'pytest with no tests exits 5 and is fail. node with no tests is fail. Go with no test files exits 0 and codehere says pass.' });


// ---- real pull requests in the throwaway repo (ledger run 20261009145607-29f786) ----
const REAL = '20261009145607-29f786';
const addEv = (id, ...ids) => { const r = rows.find((x) => x.id === id); r.evidence = [...new Set([...(r.evidence || []), ...ids])]; return r; };
upd('VER-A02', { status: 'observed', note: 'Real GitHub: clean change shows a tick and a green job; weakened test and a missing named test file show a cross and a red job. 1.0.2 ran from a tarball URL.' }); addEv('VER-A02', REAL);
upd('VER-A03', { status: 'observed', contract: { scope: 'a real pull request', command: 'Action on the throwaway public repo', expected: 'receipt comment visible on the open PR before merge', known_gap: 'one repository, same-repo branches only (no fork PR)' }, note: 'The receipt comment is on each open PR (github-actions author).' }); addEv('VER-A03', REAL);
upd('VER-A05', { status: 'observed', note: 'Real GitHub: one comment by github-actions on each of five PRs.' }); addEv('VER-A05', REAL);
addEv('VER-B01', REAL);
upd('VER-B01', { note: 'Real GitHub: re-run, weakened flag, missing-file flag and one comment per PR observed. Updating the same comment on a later push is not yet checked live.' });
upd('VER-C01', { status: 'observed_partial', note: 'F-015: on a real PR the receipt shows GitHub\'s temporary merge commit (refs/pull/N/merge), not the PR head. The SHA it ran is correct, but it is not in a fresh clone.' }); addEv('VER-C01', REAL);
upd('VER-C02', { note: 'First post confirmed on real GitHub (one comment per PR); mock API covers update, page 2 of 150, fork 403. Live update on a later push still to check by hand.' }); addEv('VER-C02', REAL);
addEv('VER-C03', REAL);
upd('VER-C03', { note: 'F-010 confirmed on real GitHub: PR 5 (default latest) has an unverified receipt and a green job.' });
addEv('VER-B04', REAL);
rows.push({ id: 'VER-E04', src: 'receipt', exposure: 'E2', type: 'capability', quote: 'Reproduce independently:', status: 'observed_partial', evidence: [REAL, E.actionHead],
  contract: { scope: 'the Reproduce line in the receipt', command: 'git checkout <receipt sha> in a fresh clone, then run the printed command', expected: 'the commit exists in a fresh clone and the command reproduces the verdict', known_gap: 'on a pull_request event the SHA is GitHub\'s merge commit, which a fresh clone does not contain (F-015)' },
  note: 'Real PRs 1 and 2: the receipt SHA is not found in a fresh clone; it appears only after fetching refs/pull/N/merge.' });

const sha = (s) => createHash('sha256').update(s).digest('hex');
const claims = rows.map((r) => {
  const file = F[r.src];
  const txt = fs.readFileSync(file, 'utf8');
  const idx = txt.indexOf(r.quote);
  if (idx < 0) throw new Error(`${r.id}: quote not found verbatim in ${file}`);
  const { src, ...rest } = r;
  return { ...rest, pillar: 'VER', file, line: txt.slice(0, idx).split('\n').length, quote_sha256: sha(r.quote), file_sha256: sha(txt), target: T, verdict: null };
});
const out = {
  meta: { created_utc: new Date().toISOString(), scope: 'offer A and the surfaces a prospect sees for it', note: 'verdict is null everywhere: graders decide verdicts. status only says what evidence exists. E3 rows are unsent drafts or internal specs.' },
  claims,
};
const path = SC + '/claims.offerA.json';
fs.writeFileSync(path, JSON.stringify(out, null, 2));
const by = {};
for (const c of claims) by[c.status] = (by[c.status] || 0) + 1;
console.log('written', path, '| claims:', claims.length, '| by status:', JSON.stringify(by));
const r = cp.spawnSync('node', [SC + '/harness/check-quotes.mjs', path], { encoding: 'utf8' });
console.log(r.stdout.trim());
process.exit(r.status || 0);
