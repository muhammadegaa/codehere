#!/usr/bin/env node
// S11 step 4: agreement between labelers, and the blind anchor sheet for the human labeler.
//   node agree.mjs report              kappa and counts for Claude vs qwen (and vs the human once answers exist)
//   node agree.mjs report --from labels-only.json   the same counts from the published file alone
//   node agree.mjs export              write labels-only.json from the raw label files (refuses when they are absent)
//   node agree.mjs anchor              pick 30 PRs (10 flagged by Claude, 10 by qwen only, 10 by neither) and write the blind sheet
//   node agree.mjs score [--answers f] per-group human counts, kappas, D1 verdict at three C values, Amendment 2 estimate
// Failing claim = any of L1..L5. "undecidable" and an empty list both count as not failing (PREREG).
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EV = path.join(HERE, '../../evidence/S11');
const LAB = path.join(EV, 'labels');
const ALLOWED = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'undecidable', 'yes']); // 'yes' is the human anchor's answer (Amendment 4)

const norm = (v) => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
  return [...new Set(raw.map((x) => String(x).trim()).filter((x) => ALLOWED.has(x)))];
};
const failing = (labels) => labels.some((l) => /^(L[1-5]|yes)$/.test(l));

function load(dir, pick) {
  const out = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
    const id = f.replace(/\.json$/, '');
    try { out[id] = pick(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch { out[id] = null; }
  }
  return out;
}
// --from labels-only.json: recompute from the published file instead of the raw label files, which are not published.
const fromArg = process.argv.indexOf('--from');
const fromRows = fromArg > 0 ? JSON.parse(fs.readFileSync(process.argv[fromArg + 1], 'utf8')) : null;
const claude = fromRows ? Object.fromEntries(fromRows.map((r) => [r.pr, norm(r.claude)])) : load(path.join(LAB, 'claude'), (j) => norm(j.labels));
const qwen = fromRows ? Object.fromEntries(fromRows.map((r) => [r.pr, norm(r.qwen)])) : load(path.join(LAB, 'qwen'), (j) => (j.parsed ? norm(j.parsed.labels) : null));
const agentOf = fromRows
  ? Object.fromEntries(fromRows.map((r) => [r.pr, r.agent]))
  : Object.fromEntries(JSON.parse(fs.readFileSync(path.join(HERE, 'sample-ids.json'), 'utf8')).sample.map((s) => [`${s.repo.replace('/', '__')}__${s.number}`, s.agent]));
const ansArg = process.argv.indexOf('--answers');
const humanFile = ansArg > 0 ? process.argv[ansArg + 1] : path.join(LAB, 'human', 'answers.json');
const keyFile = path.join(LAB, 'human', 'key.json');
const sheetKey = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')).picked : {};
const human = fs.existsSync(humanFile) ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(humanFile, 'utf8'))).filter(([k]) => sheetKey[k]).map(([k, v]) => [sheetKey[k], norm(v)])) : {};

function kappa(a, b, ids) {
  let tt = 0, tf = 0, ft = 0, ff = 0;
  for (const id of ids) {
    const x = failing(a[id]), y = failing(b[id]);
    if (x && y) tt++; else if (x && !y) tf++; else if (!x && y) ft++; else ff++;
  }
  const n = tt + tf + ft + ff;
  const po = (tt + ff) / n;
  const pe = ((tt + tf) / n) * ((tt + ft) / n) + ((ft + ff) / n) * ((tf + ff) / n);
  return { n, tt, tf, ft, ff, agree: po, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}
const both = (a, b) => Object.keys(a).filter((id) => a[id] && b[id]);
const fmt = (k) => `n=${k.n} both-fail=${k.tt} only-first=${k.tf} only-second=${k.ft} neither=${k.ff} agree=${(k.agree * 100).toFixed(1)}% kappa=${k.kappa === null ? 'n/a' : k.kappa.toFixed(3)}`;

const cmd = process.argv[2];
if (cmd === 'export') {
  // labels-only.json: PR id and each model's labels, no reason or PR text (the packets and reasons are third-party text).
  if (fromRows || !Object.keys(claude).length || !Object.keys(qwen).length) {
    console.error('export needs the raw label files in evidence/S11/labels (not published); to recompute from labels-only.json use: node agree.mjs report --from labels-only.json');
    process.exit(1);
  }
  const { sample } = JSON.parse(fs.readFileSync(path.join(HERE, 'sample-ids.json'), 'utf8'));
  const rows = sample
    .map((s) => ({ pr: `${s.repo}#${s.number}`, agent: s.agent, id: `${s.repo.replace('/', '__')}__${s.number}` }))
    .filter((s) => claude[s.id] && qwen[s.id])
    .map((s) => ({ pr: s.pr, agent: s.agent, claude: claude[s.id], qwen: qwen[s.id] }));
  fs.writeFileSync(path.join(HERE, 'labels-only.json'), JSON.stringify(rows, null, 1) + '\n');
  console.log(`wrote labels-only.json: ${rows.length} PRs`);
} else if (cmd === 'report') {
  const ids = both(claude, qwen);
  console.log('Claude vs qwen:', fmt(kappa(claude, qwen, ids)));
  const unparsed = Object.keys(qwen).filter((id) => qwen[id] === null);
  console.log('qwen unparsed:', unparsed.length);
  const count = (m) => ids.filter((id) => failing(m[id])).length;
  console.log(`failing claim: Claude ${count(claude)}, qwen ${count(qwen)} of ${ids.length}`);
  const per = (m) => { const c = {}; for (const id of ids) for (const l of m[id]) c[l] = (c[l] || 0) + 1; return JSON.stringify(c); };
  console.log('Claude labels', per(claude)); console.log('qwen labels  ', per(qwen));
  for (const a of [...new Set(ids.map((id) => agentOf[id]))]) {
    const ai = ids.filter((id) => agentOf[id] === a);
    console.log(`  ${a} (n=${ai.length}): failing claim Claude ${ai.filter((id) => failing(claude[id])).length}, qwen ${ai.filter((id) => failing(qwen[id])).length}`);
  }
  const hid = Object.keys(human).filter((id) => claude[id] && qwen[id]);
  if (hid.length) {
    console.log('human vs Claude:', fmt(kappa(human, claude, hid)));
    console.log('human vs qwen:  ', fmt(kappa(human, qwen, hid)));
    const flagged = hid.filter((id) => failing(claude[id]) || failing(qwen[id]));
    const pos = flagged.filter((id) => failing(human[id])).length;
    const unflagged = hid.filter((id) => !flagged.includes(id));
    const neg = unflagged.filter((id) => failing(human[id])).length;
    console.log(`human confirms ${pos} of ${flagged.length} flagged PRs as failing; human finds ${neg} failing among ${unflagged.length} unflagged PRs`);
  }
} else if (cmd === 'anchor') {
  const ids = both(claude, qwen).sort();
  let s = 20261015;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  // Three groups of 10: Claude flagged it; only qwen flagged it; neither flagged it. Short groups are topped up from "neither".
  const gA = shuffle(ids.filter((id) => failing(claude[id])));
  const gB = shuffle(ids.filter((id) => !failing(claude[id]) && failing(qwen[id])));
  const gC = shuffle(ids.filter((id) => !failing(claude[id]) && !failing(qwen[id])));
  const a = gA.slice(0, 10), b = gB.slice(0, 10);
  const pick = [...a, ...b, ...gC.slice(0, 30 - a.length - b.length)];
  const flagged = pick.slice(0, a.length + b.length);
  const order = shuffle(pick);
  const dir = path.join(LAB, 'human');
  fs.mkdirSync(dir, { recursive: true });
  const rubric = fs.readFileSync(path.join(HERE, 'RUBRIC.md'), 'utf8');
  let sheet = `# Anchor sheet: 30 pull requests\n\nLabel each PR with the rubric below. No model labels appear here. Write your answers into answers.json (same folder), one entry per PR number, e.g. {"1": [], "2": ["L1"], "3": ["undecidable"]}. Use [] when no label applies.\n\n---\n\n${rubric}\n\n---\n\n`;
  const key = {};
  order.forEach((id, i) => { key[i + 1] = id; sheet += `\n\n======== PR ${i + 1} of ${order.length} ========\n\n${fs.readFileSync(path.join(EV, 'packets', id + '.txt'), 'utf8')}\n`; });
  fs.writeFileSync(path.join(dir, 'anchor-sheet.md'), sheet);
  fs.writeFileSync(path.join(dir, 'answers.template.json'), JSON.stringify(Object.fromEntries(order.map((_, i) => [String(i + 1), []])), null, 1));
  const group = Object.fromEntries(pick.map((id) => [id, a.includes(id) ? 'claude-flagged' : b.includes(id) ? 'qwen-only-flagged' : 'neither']));
  fs.writeFileSync(path.join(dir, 'key.json'), JSON.stringify({ seed: 20261015, available: { claudeFlagged: gA.length, qwenOnly: gB.length, neither: gC.length }, picked: key, group }, null, 1));
  console.log('anchor written:', order.length, 'PRs; claude-flagged', a.length, 'of', gA.length, '| qwen-only', b.length, 'of', gB.length, '| neither', order.length - a.length - b.length, 'of', gC.length);
} else if (cmd === 'score') {
  // Registered scoring (PREREG D1, D2, Amendment 2). Prints counts only, never individual model labels.
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const ids = Object.keys(human).filter((id) => claude[id] && qwen[id]);
  if (!ids.length) { console.log('no human answers found at', humanFile); process.exit(1); }
  console.log(`human answers: ${ids.length} of ${Object.keys(sheetKey).length} PRs`);
  const wilson = (k, n) => { const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; };
  const pct = (x) => (x * 100).toFixed(2) + '%';
  const sizes = { 'claude-flagged': key.available.claudeFlagged, 'qwen-only-flagged': key.available.qwenOnly, neither: key.available.neither };
  let est = 0, lo = 0, hi = 0, complete = true;
  console.log('\nPer group: PRs the human labels as failing');
  for (const g of Object.keys(sizes)) {
    const gi = ids.filter((id) => key.group[id] === g);
    const k = gi.filter((id) => failing(human[id])).length;
    console.log(`  ${g}: ${k} of ${gi.length} (group has ${sizes[g]} PRs in the sample)`);
    if (!gi.length) { complete = false; continue; }
    const [l, u] = wilson(k, gi.length);
    est += sizes[g] * k / gi.length; lo += sizes[g] * l; hi += sizes[g] * u;
  }
  const kc = kappa(human, claude, ids), kq = kappa(human, qwen, ids), km = kappa(claude, qwen, Object.keys(claude).filter((id) => qwen[id]));
  console.log('\nAgreement (human kappa is on a stratified 30, not a population kappa)');
  console.log('  human vs Claude:', fmt(kc));
  console.log('  human vs qwen:  ', fmt(kq));
  console.log('  Claude vs qwen (all 299):', fmt(km));
  const n = Object.keys(claude).filter((id) => qwen[id]).length;
  const kC = Object.values(claude).filter((l) => l && failing(l)).length;
  console.log('\nD2 reliability: kappa below 0.6 between the models =', km.kappa < 0.6 ? 'yes' : 'no', '| human vs Claude below 0.6 =', kc.kappa < 0.6 ? 'yes' : 'no', '| human vs qwen below 0.6 =', kq.kappa < 0.6 ? 'yes' : 'no');
  const d2met = km.kappa >= 0.6 && kc.kappa >= 0.6;
  console.log(`\nD1 on Claude's labels: ${kC} of ${n} failing = ${pct(kC / n)}, Wilson 95% ${wilson(kC, n).map(pct).join(' to ')}`);
  console.log(`  registered verdict: ${d2met ? 'by the count rule below' : 'inconclusive (D2 not met, so the count does not decide)'}`);
  for (const C of [50, 100, 200]) {
    const f = (79 / C) / 20, [l, u] = wilson(kC, n);
    console.log(`  C = £${C}: f* = ${pct(f)}; count rule alone: ${l >= f ? 'GO' : u < f ? 'NO-GO' : 'inconclusive'}`);
  }
  console.log(`\nExploratory population estimate (Amendment 2), not a verdict: ${complete ? `${pct(est / n)}, range ${pct(lo / n)} to ${pct(hi / n)}` : 'a group has no answers'}`);
} else console.log('usage: node agree.mjs report [--from labels-only.json]|export|anchor|score [--answers file]');
