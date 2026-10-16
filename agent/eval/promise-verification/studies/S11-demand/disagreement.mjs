#!/usr/bin/env node
// S11 report support: how Claude's and qwen's labels relate to facts that can be read off each packet by code.
// No PR is labeled here. It compares each model's stated label with the rubric's mechanical conditions:
//   L1 needs a check run with conclusion failure, timed_out or cancelled on the PR head (a deploy-preview job does not count);
//   rubric rule 3: with no check data at all, L1 does not apply.
//   node disagreement.mjs            prints the tables the report quotes
//   node disagreement.mjs --prs      also prints the facts for the eight PRs named in the report
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EV = path.join(HERE, '../../evidence/S11');
const FAILING = /^(failure|timed_out|cancelled)$/;
const PREVIEW = /pages|vercel|netlify|preview|deploy|cloudflare|render|amplify/i;
const norm = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).map(String);
const isFail = (ls) => ls.some((l) => /^L[1-5]$/.test(l));

const index = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(EV, 'packets/index.json'), 'utf8')).filter((x) => !x.unusable).map((x) => [x.id, x]));
const rows = [];
for (const id of Object.keys(index)) {
  const packet = fs.readFileSync(path.join(EV, 'packets', id + '.txt'), 'utf8');
  const start = packet.indexOf('CHECK RUNS ON THE PR HEAD'), end = packet.indexOf('COMMIT STATUSES:');
  const runs = packet.slice(start, end).split('\n').map((l) => l.trim().match(/^(.*): (\S+)\/(\S+)$/)).filter(Boolean).map((m) => ({ name: m[1], conclusion: m[3] }));
  const failing = runs.filter((r) => FAILING.test(r.conclusion));
  const claude = norm(JSON.parse(fs.readFileSync(path.join(EV, 'labels/claude', id + '.json'), 'utf8')).labels);
  const q = JSON.parse(fs.readFileSync(path.join(EV, 'labels/qwen', id + '.json'), 'utf8')).parsed;
  rows.push({
    id, agent: index[id].agent, claude, qwen: norm(q.labels), qwenClaim: q.claim, qwenEv: q.evidence,
    runs: runs.length, failing: failing.length, previewOnly: failing.length > 0 && failing.every((r) => PREVIEW.test(r.name)),
    failingNames: failing.map((r) => r.name), conclusions: [...new Set(runs.map((r) => r.conclusion))],
  });
}

const pct = (a, b) => (b ? `${a} of ${b}` : `${a} of 0`);
const both = rows.filter((r) => isFail(r.claude) && isFail(r.qwen));
const onlyClaude = rows.filter((r) => isFail(r.claude) && !isFail(r.qwen));
const onlyQwen = rows.filter((r) => !isFail(r.claude) && isFail(r.qwen));
console.log(`PRs ${rows.length}: both flag ${both.length}, only Claude ${onlyClaude.length}, only qwen ${onlyQwen.length}, neither ${rows.length - both.length - onlyClaude.length - onlyQwen.length}`);

for (const agent of ['copilot', 'codex', 'claude']) {
  const a = rows.filter((r) => r.agent === agent);
  console.log(`agent ${agent}: n=${a.length}, Claude flags ${a.filter((r) => isFail(r.claude)).length}, qwen flags ${a.filter((r) => isFail(r.qwen)).length}, with check runs ${a.filter((r) => r.runs).length}`);
}

console.log('\nL1 consistency with the rubric (a failing check run must exist on the PR head)');
for (const [who, key] of [['Claude', 'claude'], ['qwen', 'qwen']]) {
  const l1 = rows.filter((r) => r[key].includes('L1'));
  console.log(`  ${who} L1 labels: ${l1.length}; with a failing check run: ${pct(l1.filter((r) => r.failing).length, l1.length)}; no check data at all: ${pct(l1.filter((r) => !r.runs).length, l1.length)}; check data but nothing failing: ${pct(l1.filter((r) => r.runs && !r.failing).length, l1.length)}; failing runs are all deploy-preview-like: ${pct(l1.filter((r) => r.previewOnly).length, l1.length)}`);
}
const l1q = onlyQwen.filter((r) => r.qwen.includes('L1'));
console.log(`  qwen-only L1 labels: ${l1q.length}; with a failing check run: ${pct(l1q.filter((r) => r.failing).length, l1q.length)}; check data but nothing failing: ${pct(l1q.filter((r) => r.runs && !r.failing).length, l1q.length)}; deploy-preview-like failures only: ${pct(l1q.filter((r) => r.previewOnly).length, l1q.length)}`);

console.log('\nqwen-only flags by label (a PR with two labels counts under each)');
const by = {};
for (const r of onlyQwen) for (const l of r.qwen) by[l] = (by[l] || 0) + 1;
console.log(' ', JSON.stringify(by));
const l4q = onlyQwen.filter((r) => r.qwen.includes('L4'));
console.log(`  qwen-only L4 labels: ${l4q.length}; with no check data: ${pct(l4q.filter((r) => !r.runs).length, l4q.length)}; all check runs success or skipped: ${pct(l4q.filter((r) => r.runs && r.conclusions.every((c) => /^(success|skipped|neutral)$/.test(c))).length, l4q.length)}`);
console.log(`  qwen-only flags where every check run succeeded: ${pct(onlyQwen.filter((r) => r.runs && !r.failing).length, onlyQwen.length)}; with no check data: ${pct(onlyQwen.filter((r) => !r.runs).length, onlyQwen.length)}; with a failing run: ${pct(onlyQwen.filter((r) => r.failing).length, onlyQwen.length)}`);

if (process.argv.includes('--prs')) {
  const eight = ['Bittrees-Technology__ai__202', 'Brian910cpr__910cpr-class-landers__137', 'ClubAmigosTT__marcelito-finanzas__78', 'DSTech-876__PRMSv3__212', 'DennisHengShuYi__Codenection__28', 'Donovoi__triage-with-rclone__21', 'DwennK__Plezy-SubtitleFix__20', 'JRDN-R__vision__39'];
  console.log('\nThe eight PRs (first eight qwen-only flags in file-name order among the first 177 labeled; not a random draw)');
  for (const id of eight) {
    const r = rows.find((x) => x.id === id);
    console.log(`  ${id}: qwen-only now = ${isFail(r.qwen) && !isFail(r.claude)}; qwen ${JSON.stringify(r.qwen)}; Claude ${JSON.stringify(r.claude)}; check runs ${r.runs}, failing ${r.failing}${r.failingNames.length ? ' (' + r.failingNames.join(', ') + ')' : ''}; conclusions ${JSON.stringify(r.conclusions)}`);
  }
}

// How much of the qwen-only gap rests only on conditions the rubric as written does not support (no relabeling:
// each qwen label is tested against the check data in the packet; an L4 that rests on the diff alone cannot be tested by code).
//   L1 label with check data present and no failing run: contradicts the L1 definition in RUBRIC.md.
//   L4 label with no check data: the gap in RUBRIC.md (rule 3 covered L1 only).
//   L4 label with check data where every run succeeded or skipped: no packet fact supports it.
const unsupported = (r, l) => (l === 'L1' && r.runs > 0 && !r.failing) || (l === 'L4' && (!r.runs || (r.conclusions.every((c) => /^(success|skipped|neutral)$/.test(c)))));
const onlyUnsupported = onlyQwen.filter((r) => r.qwen.filter((l) => /^L[1-5]$/.test(l)).every((l) => unsupported(r, l)));
const anyUnsupported = onlyQwen.filter((r) => r.qwen.some((l) => unsupported(r, l)));
console.log(`\nqwen-only PRs whose every label lacks support in the check data: ${onlyUnsupported.length} of ${onlyQwen.length}; PRs with at least one such label: ${anyUnsupported.length} of ${onlyQwen.length}`);
const gapL4 = onlyQwen.filter((r) => r.qwen.filter((l) => /^L[1-5]$/.test(l)).every((l) => l === 'L4' && !r.runs));
const l1Only = onlyQwen.filter((r) => r.qwen.filter((l) => /^L[1-5]$/.test(l)).every((l) => l === 'L1' && r.runs > 0 && !r.failing));
console.log(`  of the ${onlyUnsupported.length}: only L1 with no failing run (contradicts the L1 definition): ${l1Only.length}; only L4 with no check data (the rubric gap): ${gapL4.length}; L4 where every check run succeeded or was skipped: ${onlyUnsupported.length - l1Only.length - gapL4.length}`);
console.log(`  qwen-only PRs with no label of this kind: ${onlyQwen.length - anyUnsupported.length} of ${onlyQwen.length} (these rest on diff reading or on a failing run, and need a human)`);
