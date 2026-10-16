#!/usr/bin/env node
// S11: build the page the owner labels the 30 anchor PRs on (PREREG Amendment 4: one question per PR).
// Reads the sheet that `agree.mjs anchor` wrote (packets in random order, no model labels, no group names)
// and writes anchor/LABEL-ME.html. Each card pulls three things out of the packet with text matching only
// (no model): the claim sentences, the CI conclusions and the changed assertion lines in test-file diffs.
// The page exports answers.json in the format `agree.mjs score` reads: {"1": ["yes"], "2": [], "3": ["undecidable"]}.
//   node make-label-page.mjs                 build the page
//   node make-label-page.mjs --probe <id>    print what the extractors find in one packet (packets/<id>.txt)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const EV = path.join(HERE, '../../evidence/S11');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function sections(text) {
  const marks = ['\nBODY:\n', '\nTEST FILES NAMED IN TITLE OR BODY', '\nCHECK RUNS ON THE PR HEAD', '\nCOMMIT STATUSES:', '\nFILES CHANGED', '\nDIFFS (test files first):'];
  const at = []; let from = 0;
  for (const m of marks) { const i = text.indexOf(m, from); at.push(i); if (i >= 0) from = i + m.length; }
  const cut = (k) => { const s = at[k]; if (s < 0) return ''; const e = at.slice(k + 1).find((x) => x >= 0) ?? text.length; return text.slice(s, e).split('\n').slice(1).join('\n').trim(); };
  return { head: text.slice(0, at[0] >= 0 ? at[0] : text.length), body: cut(0), named: cut(1), checks: cut(2), statuses: cut(3), diffs: cut(5) };
}

const TEST_WORD = /\b(tests?|test suite|suite|specs?|ci|checks?|build|lint(?:ing)?|typecheck|tsc|pytest|jest|vitest|mocha|cargo test|go test|npm (?:run )?test|pnpm test|yarn test)\b/i;
const PASS_WORD = /\b(pass(?:ed|es|ing)?|green|succe(?:ed|eds|eded|ss|ssful|ssfully)|verified|no regressions?|no failures?|0 failures?|all good|ran|run successfully|clean)\b|✅|✓|\[x\]/i;
export function claimLines(title, body) {
  const out = [];
  for (const line of `${title}\n${body}`.split('\n')) {
    for (const s of line.split(/(?<=[.!?])\s+/)) {
      if (TEST_WORD.test(s) && PASS_WORD.test(s) && s.trim().length > 3) out.push(s.trim().slice(0, 300));
    }
  }
  return [...new Set(out)].slice(0, 5);
}

export function ciSummary(checks, statuses) {
  if (/check-runs unavailable/.test(checks)) return { note: checks, bad: [], counts: {}, all: [] };
  const all = checks.split('\n').map((l) => l.trim()).map((l) => { const m = l.match(/^(.*): (\S+)\/(\S+)$/); return m ? { name: m[1], status: m[2], conclusion: m[3] } : null; }).filter(Boolean);
  const counts = {};
  for (const c of all) counts[c.conclusion] = (counts[c.conclusion] || 0) + 1;
  const bad = all.filter((c) => /^(failure|timed_out|cancelled)$/.test(c.conclusion));
  const st = statuses.split('\n').map((l) => l.trim()).filter((l) => /: (failure|error)$/.test(l));
  return { note: all.length ? '' : 'No check runs recorded for this PR head.', bad, counts, all, badStatuses: st };
}

const ASSERT = /assert|expect\(|\.should|\bshould\b|\.skip|\bskip\b|xfail|\bxit\(|xdescribe|\.only\b|pytest\.mark|@Disabled|@Ignore|t\.Skip|\bverify\(|^\+\s*return\s*;?\s*$|TODO|unimplemented|panic\(/;
export function testDiffs(diffs) {
  const parts = diffs.split(/^--- (?=\S.*\[\w+, \+\d+ -\d+\])/m).filter(Boolean);
  const files = [];
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const header = p.slice(0, nl), patch = nl >= 0 ? p.slice(nl + 1) : '';
    const m = header.match(/^(.*?) \[(\w+), \+(\d+) -(\d+)\](?: \(test file\))?$/);
    if (!m || !/\(test file\)$/.test(header)) continue;
    const lines = patch.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => /^[+-]/.test(l) && ASSERT.test(l));
    files.push({ file: m[1], status: m[2], add: m[3], del: m[4], cutNote: /\[patch cut at/.test(patch), lines });
  }
  return files;
}

export function extract(text) {
  const s = sections(text);
  const title = (s.head.match(/^TITLE: (.*)$/m) || [])[1] || '';
  return { s, title, claims: claimLines(title, s.body), ci: ciSummary(s.checks, s.statuses), tests: testDiffs(s.diffs) };
}

function card(n, total, text) {
  const first = text.split('\n')[0];
  const m = first.match(/^PR (\S+)#(\d+)/);
  const link = m ? `https://github.com/${m[1]}/pull/${m[2]}` : '';
  const x = extract(text);
  const claims = x.claims.length
    ? `<ul>${x.claims.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '<p class="mut">No claim sentence found by the text match. Read the body in the full packet; this does not mean there is no claim.</p>';
  const counts = Object.entries(x.ci.counts).map(([k, v]) => `${v} ${k}`).join(', ');
  const ci = x.ci.note
    ? `<p class="mut">${esc(x.ci.note)}</p>`
    : `<p>${esc(String(x.ci.all.length))} check runs: ${esc(counts)}</p>${x.ci.bad.length ? `<ul class="bad">${x.ci.bad.map((c) => `<li>${esc(c.name)}: ${esc(c.conclusion)}</li>`).join('')}</ul>` : '<p class="mut">None ended in failure, timed_out or cancelled.</p>'}<details><summary>All check runs</summary><pre>${esc(x.ci.all.map((c) => `${c.name}: ${c.status}/${c.conclusion}`).join('\n'))}</pre></details>${x.ci.badStatuses?.length ? `<p class="bad">Commit statuses failing: ${esc(x.ci.badStatuses.join('; '))}</p>` : ''}`;
  const quiet = x.tests.filter((t) => !t.lines.length);
  const tests = x.tests.length
    ? x.tests.filter((t) => t.lines.length).map((t) => `<p><b>${esc(t.file)}</b> <span class="mut">[${esc(t.status)}, +${t.add} -${t.del}]</span>${t.cutNote ? ' <span class="bad">patch cut, lines may be missing</span>' : ''}</p><pre>${esc(t.lines.slice(0, 30).join('\n'))}${t.lines.length > 30 ? `\n... ${t.lines.length - 30} more matching lines` : ''}</pre>`).join('') + (quiet.length ? `<p class="mut">Test files changed with no assertion, skip or return lines matched: ${quiet.map((t) => `${esc(t.file)} [${esc(t.status)}${t.cutNote ? ', patch cut' : ''}]`).join('; ')}</p>` : '')
    : '<p class="mut">No test file in the diffs shown.</p>';
  const named = x.s.named && !/\(none named\)/.test(x.s.named) ? `<h4>Test files the PR names</h4><pre>${esc(x.s.named)}</pre>` : '';
  const radio = (v, label) => `<label><input type="radio" name="q${n}" data-pr="${n}" value="${v}"> ${label}</label>`;
  return `<section id="pr${n}" class="card">
<h2>PR ${n} of ${total} <span class="status" id="st${n}">not answered</span></h2>
<p><a href="${link}" target="_blank" rel="noopener">${esc(link)}</a> &middot; ${esc(x.title)}</p>
<div class="q"><strong>Failing claim?</strong> ${radio('yes', 'Yes')}${radio('no', 'No')}${radio('cant', "Can't tell")}
<input type="text" data-note="${n}" placeholder="note (optional)"></div>
<p class="mut">Yes if any of L1 to L5 in the rubric applies. Can't tell only when the packet lacks the data.</p>
<h4>Claim sentences (text match)</h4>${claims}
<h4>CI conclusions</h4>${ci}
<h4>Changed assertion lines in test files</h4>${tests}${named}
<details><summary>Full packet (what the models read)</summary><pre>${esc(text)}</pre></details>
</section>`;
}

if (process.argv[2] === '--probe') {
  const id = process.argv[3];
  const x = extract(fs.readFileSync(path.join(EV, 'packets', id + '.txt'), 'utf8'));
  console.log(JSON.stringify({ title: x.title, claims: x.claims, checkRuns: x.ci.all.length, counts: x.ci.counts, bad: x.ci.bad, tests: x.tests.map((t) => ({ file: t.file, status: t.status, lines: t.lines })) }, null, 1));
  process.exit(0);
}

const HUMAN = path.join(EV, 'labels/human');
const sheet = fs.readFileSync(path.join(HUMAN, 'anchor-sheet.md'), 'utf8');
const rubric = fs.readFileSync(path.join(HERE, 'RUBRIC.md'), 'utf8');
const parts = sheet.split(/\n======== PR (\d+) of (\d+) ========\n/);
const total = Number(parts[2]);
const prs = [];
for (let i = 1; i < parts.length; i += 3) prs.push({ n: Number(parts[i]), text: parts[i + 2].trim() });
const cards = prs.map(({ n, text }) => card(n, total, text)).join('\n');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>S11 anchor labels</title>
<style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--card:#f6f6f4;--line:#d8d8d4;--acc:#0a5;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#e8e8e6;--mut:#9a9a96;--card:#202020;--line:#383836;--acc:#4c9;--bad:#f2867e}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:900px;padding:16px}
pre{white-space:pre-wrap;word-break:break-word;background:var(--card);border:1px solid var(--line);padding:10px;border-radius:6px;font:12.5px/1.45 ui-monospace,monospace;overflow-x:auto}
h4{margin:14px 0 4px;font-size:13px;color:var(--mut);text-transform:none}
.card{border-top:2px solid var(--line);margin-top:28px;padding-top:6px}
.q{display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin:10px 0 4px;font-size:16px}
.q input[type=text]{flex:1;min-width:160px;padding:4px 6px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:4px}
.status{font-size:12px;color:var(--mut);font-weight:400;margin-left:8px}.done .status{color:var(--acc)}
.mut{color:var(--mut)}.bad,.bad li{color:var(--bad)}
#bar{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 0;z-index:2;display:flex;gap:12px;align-items:center}
button{padding:6px 12px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:6px;cursor:pointer}
details summary{cursor:pointer;color:var(--mut);margin:6px 0}
</style></head><body>
<div id="bar"><strong id="count">0 of ${total} answered</strong><button id="exp">Download answers.json</button><span class="mut">Saved in this browser as you go.</span></div>
<h1>S11 anchor: ${total} pull requests, one question each</h1>
<p>Estimated time: about 60 to 90 minutes (an estimate, not measured). The PRs are in random order. No model labels are shown anywhere on this page.</p>
<p>For each PR answer <b>Failing claim? Yes / No / Can't tell</b>. Yes means at least one of L1 to L5 in the rubric applies. Each card pulls out the claim sentences, the CI conclusions and the changed assertion lines using text matching. These are reading aids and can miss things; the full packet, the same text the models read, is on every card. When done, press Download answers.json and save the file as <code>agent/eval/promise-verification/evidence/S11/labels/human/answers.json</code>.</p>
<details open><summary>Rubric</summary><pre>${esc(rubric)}</pre></details>
${cards}
<script>
(function(){
  var KEY='s11-anchor-answers-v2', N=${total}, state={};
  try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){state={}}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}}
  function render(n){
    var s=state[n]||{a:'',note:''};
    document.querySelectorAll('input[data-pr="'+n+'"]').forEach(function(b){b.checked=(b.value===s.a)});
    var inp=document.querySelector('input[data-note="'+n+'"]'); if(inp&&document.activeElement!==inp)inp.value=s.note||'';
    document.getElementById('st'+n).textContent=s.a?'answered':'not answered';
    document.getElementById('pr'+n).className='card'+(s.a?' done':'');
  }
  function count(){var c=0;for(var n=1;n<=N;n++)if((state[n]||{}).a)c++;document.getElementById('count').textContent=c+' of '+N+' answered'}
  document.addEventListener('change',function(e){
    var t=e.target, n=t.getAttribute('data-pr'); if(!n||t.type!=='radio')return;
    (state[n]||(state[n]={a:'',note:''})).a=t.value; save();render(n);count();
  });
  document.addEventListener('input',function(e){var n=e.target.getAttribute('data-note');if(!n)return;(state[n]||(state[n]={a:'',note:''})).note=e.target.value;save()});
  document.getElementById('exp').onclick=function(){
    var out={},notes={},missing=[],map={yes:['yes'],no:[],cant:['undecidable']};
    for(var n=1;n<=N;n++){var s=state[n]||{a:'',note:''};
      if(!s.a){missing.push(n);continue}
      out[n]=map[s.a]; if(s.note)notes[n]=s.note}
    if(missing.length&&!confirm('PRs not answered: '+missing.join(', ')+'. Download anyway?'))return;
    if(Object.keys(notes).length)out.notes=notes;
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));a.download='answers.json';a.click();
  };
  for(var n=1;n<=N;n++)render(n);count();
})();
</script></body></html>`;

const outDir = path.join(HERE, 'anchor');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'LABEL-ME.html'), html);
console.log('wrote', path.join(outDir, 'LABEL-ME.html'), 'for', prs.length, 'PRs,', html.length, 'bytes');
