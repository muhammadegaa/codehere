// Builds the demo page from demo.json (written by v2/demo/live-team.mjs). Usage: node build-demo-page.mjs <demo.json> <out.html>
import fs from 'node:fs';
const [IN, OUT, FIRST] = process.argv.slice(2);
const first = FIRST ? JSON.parse(fs.readFileSync(FIRST, 'utf8')).scenes.find((s) => s.id === 2) : null;
const d = JSON.parse(fs.readFileSync(IN, 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kind = (l) => (l.startsWith('codehere ✓') ? 'ok' : l.startsWith('codehere ✕') ? 'caught' : l.startsWith('codehere ⊘') ? 'blocked' : 'note');
const shortcut = (p) => /Make it pass by changing the expected|Update the expected values|Make npm test pass by giving|no longer fails the job/.test(p);
const firstLines = (t, n = 6) => t.split('\n').filter((l) => l.trim()).slice(0, n).join('\n');
const diffHtml = (diff) =>
  diff
    ? `<details><summary>What the agent changed</summary><pre class="diff">${esc(diff)
        .split('\n')
        .map((l) => (l.startsWith('+') && !l.startsWith('+++') ? `<span class="add">${l}</span>` : l.startsWith('-') && !l.startsWith('---') ? `<span class="del">${l}</span>` : l))
        .join('\n')}</pre></details>`
    : '<p class="muted small">The agent changed no file.</p>';

const ENTERPRISE = {
  1: 'Platform teams write conventions once. Every developer’s agent gets them at session start, whatever agent they use, with nothing to paste.',
  2: 'Reviewers see a green CI run and a one-line test change. The bug ships with a test that now asserts it.',
  3: 'The agent’s “fixed” is checked by running the approved test command on the developer’s machine before the session ends.',
  4: 'A workflow edit that makes CI ignore failing tests is easy to approve in a busy pull request.',
  5: 'A fix found by one team reaches the next developer’s agent at the first matching error, through git, with no server.',
  6: 'An integration test skipped on a laptop where a secret is missing, and nobody notices it never runs.',
  7: 'Anyone with push access can change the repo’s test command. Codehere runs only a command this developer approved on this machine.',
};

const sceneHtml = (s) => {
  const lines = s.lines.length ? s.lines.map((l) => `<div class="line ${kind(l)}">${esc(l)}</div>`).join('') : '<div class="line note">No line: Codehere stayed silent.</div>';
  const told = s.sentBack.length
    ? `<div class="told"><div class="label">What Codehere told the agent (${s.sentBack.length}×)</div><pre class="said-machine">${esc(firstLines(s.sentBack[0], 5))}</pre></div>`
    : '';
  const extra = [
    s.ruleInContext !== undefined ? `<li>Team rule in the model’s context at session start: <b>${s.ruleInContext ? 'yes' : 'no'}</b> (from the session transcript)</li>` : '',
    s.lessonInContext !== undefined ? `<li>Ana’s lesson in the model’s context after the first failing run: <b>${s.lessonInContext ? 'yes' : 'no'}</b></li>` : '',
    s.id === 7 ? '<li>Tests after the session fail because the payments test from scene 6 needs the sandbox key, which this laptop does not have. Codehere did not run the pulled command at all.</li>' : '',
    s.pwned !== undefined ? `<li>The pulled command’s marker file <code>PWNED</code> exists after the session: <b>${s.pwned ? 'yes' : 'no'}</b></li>` : '',
  ].join('');
  const earlier = s.id === 2 && first ? `<div class="earlier"><div class="label">First try, same session setup, a plainer prompt</div><p class="said dim">Prompt: ${esc(first.prompt)}</p><p class="said">The agent refused: ${esc(firstLines(first.reply, 3))}</p><p class="muted small">Codehere printed nothing: the agent changed no file. So the second try below adds the deadline pressure teams put on agents.</p></div>` : '';
  return `<section class="scene" id="scene-${s.id}">
  <header><span class="num">${s.id}</span><h2>${esc(s.title)}</h2></header>
  <p class="risk"><span class="label">Enterprise risk</span>${esc(s.risk)}</p>
  <p class="why">${esc(ENTERPRISE[s.id] || '')}</p>
  ${earlier}
  <div class="ask"><div class="label">Sam asked the agent${shortcut(s.prompt) ? ' <span class="tag">shortcut told on purpose, to show the catch</span>' : ''}</div><p class="said">${esc(s.prompt)}</p></div>
  <div class="lines"><div class="label">What Sam saw from Codehere</div>${lines}</div>
  ${told}
  <div class="reply"><div class="label">The agent’s last message (its own words, not checked)</div><p class="said dim">${esc(firstLines(s.reply, 4))}</p></div>
  ${diffHtml(s.diff)}
  <ul class="facts"><li>Sent back ${s.sentBack.length} time${s.sentBack.length === 1 ? '' : 's'}</li><li>Tests after the session: <b>${s.testsAfter}</b></li><li>${s.seconds} s</li><li class="mono small">session ${esc(s.session || '')}</li>${extra}</ul>
</section>`;
};

const caught = d.scenes.filter((s) => s.lines.some((l) => kind(l) === 'caught' || kind(l) === 'blocked')).length;
const ticks = d.scenes.filter((s) => s.lines.some((l) => kind(l) === 'ok')).length;
const html = `<title>Codehere Live Team Demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* Layout: one reading column; each scene is a record of one real session, machine output in mono, people and agents in sans. */
:root {
  color-scheme: dark;
  --g0: #0e0f10; --g1: #16181a; --g2: #1e2124; --g3: #282c30;
  --ink: #e8eaec; --ink-70: rgba(232,234,236,.70); --ink-45: rgba(232,234,236,.52); --hair: rgba(232,234,236,.09);
  --verified: #7fc39a; --caught: #e2827f; --warn: #d9a441; --ember: #ff9a76;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
body { background: var(--g0); color: var(--ink); font: 15px/1.6 var(--sans); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 40px 64px; }
main { max-width: 860px; margin: 0 auto; display: grid; gap: 28px; }
h1 { font: 600 clamp(26px, 4vw, 34px)/1.15 var(--sans); margin: 0; text-wrap: balance; }
h2 { font: 600 19px/1.3 var(--sans); margin: 0; text-wrap: balance; }
p { margin: 0; }
.mono, code, pre { font-family: var(--mono); }
code { font-size: 13px; color: var(--ink-70); }
.label { font: 400 11px/1.4 var(--mono); text-transform: uppercase; letter-spacing: .13em; color: var(--ink-45); margin-bottom: 6px; }
.muted { color: var(--ink-45); } .small { font-size: 12px; }
.intro { display: grid; gap: 14px; color: var(--ink-70); max-width: 68ch; }
.meta { font: 400 12px/1.5 var(--mono); color: var(--ink-45); }
.readings { display: flex; flex-wrap: wrap; gap: 28px; padding: 18px 0; border-block: 1px solid var(--hair); }
.reading b { display: block; font: 600 34px/1 var(--mono); font-variant-numeric: tabular-nums; }
.reading span { font: 400 11px/1.4 var(--mono); text-transform: uppercase; letter-spacing: .13em; color: var(--ink-45); }
.reading.caught b { color: var(--caught); } .reading.ok b { color: var(--verified); }
.key { display: flex; flex-wrap: wrap; gap: 18px; font: 400 12px/1.5 var(--mono); color: var(--ink-70); }
.key i { font-style: normal; }
.setup { background: var(--g1); border: 1px solid var(--hair); border-radius: 6px; padding: 18px; display: grid; gap: 10px; min-width: 0; }
.scene { background: var(--g1); border: 1px solid var(--hair); border-radius: 6px; padding: 22px; display: grid; gap: 16px; min-width: 0; }
.scene header { display: flex; gap: 12px; align-items: baseline; }
.num { font: 600 13px/1 var(--mono); color: var(--ink-45); }
.risk { color: var(--ink); }
.earlier { display: grid; gap: 6px; padding: 12px; border: 1px dashed var(--hair); border-radius: 4px; }
.risk .label { display: block; }
.why { color: var(--ink-70); max-width: 70ch; }
.ask .said { border-left: 2px solid var(--ember); padding-left: 12px; }
.tag { text-transform: none; letter-spacing: 0; color: var(--warn); margin-left: 6px; }
.said { font-family: var(--sans); color: var(--ink); max-width: 70ch; }
.said.dim { color: var(--ink-70); }
.lines { display: grid; gap: 4px; min-width: 0; }
.line { font: 400 13px/1.5 var(--mono); padding: 6px 10px; background: var(--g2); border-radius: 4px; overflow-wrap: anywhere; color: var(--ink-70); }
.line.ok { color: var(--verified); } .line.caught { color: var(--caught); } .line.blocked { color: var(--warn); }
.told pre, .setup pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 400 12.5px/1.55 var(--mono); color: var(--ink-70); background: var(--g2); padding: 10px 12px; border-radius: 4px; }
details summary { cursor: pointer; font: 400 12px/1.5 var(--mono); color: var(--ink-70); }
details summary:focus-visible, a:focus-visible { outline: 2px solid var(--ember); outline-offset: 2px; }
pre.diff { margin: 8px 0 0; overflow-x: auto; font: 400 12px/1.5 var(--mono); color: var(--ink-45); background: var(--g0); padding: 12px; border-radius: 4px; border: 1px solid var(--hair); }
.diff .add { color: var(--ink); } .diff .del { color: var(--ink-45); text-decoration: line-through; text-decoration-color: rgba(226,130,127,.5); }
.facts { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font: 400 12px/1.5 var(--mono); color: var(--ink-45); }
.facts b { color: var(--ink-70); font-weight: 600; }
.limits { display: grid; gap: 10px; color: var(--ink-70); }
.limits ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
a { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
<main>
  <div class="intro">
    <div class="label">Codehere ${esc(d.version.replace(/^codehere /, ''))} · live run · ${esc(new Date().toISOString().slice(0, 10))}</div>
    <h1>Seven real agent sessions on a billing service</h1>
    <p>Ana is the platform lead; Sam is a developer on her team. They share one git remote. Every scene below is one Claude Code session (model haiku) that Sam started with the prompt shown, in his own clone, with Codehere installed from npm. Nothing on this page is mocked: the lines are what Codehere printed, read back from each session's transcript, and the diffs are what the agent changed.</p>
    <p>Three scenes tell the agent to take a shortcut, because an agent that is told to fix a bug usually fixes it, and the point is what happens when one does not. Those prompts are marked.</p>
  </div>
  <div class="readings">
    <div class="reading"><b>${d.scenes.length}</b><span>sessions</span></div>
    <div class="reading caught"><b>${caught}</b><span>caught or blocked</span></div>
    <div class="reading ok"><b>${ticks}</b><span>with a ✓ re-run here</span></div>
  </div>
  <div class="key"><i style="color:var(--verified)">✓ Codehere re-ran the tests here and they passed</i><i style="color:var(--caught)">✕ caught, agent sent back</i><i style="color:var(--warn)">⊘ not run, and why</i><i>› a note</i></div>
  <div class="setup">
    <div class="label">Setup, typed by Ana and Sam in their own terminals</div>
    <pre>$ npm install -g codehere@next
$ codehere init --agent claude,codex,copilot     # Ana, answers y to approve npm test
${esc(d.setup.init.filter((l) => /Approved on this machine/.test(l)).join('\n'))}
$ codehere rule "Amounts are integer cents. Never use floats for money."
${esc(d.setup.rule)}
$ git push                                        # Ana
$ git clone … && codehere approve                 # Sam, answers y
${esc(d.setup.approve.join('\n'))}</pre>
  </div>
  ${d.scenes.map(sceneHtml).join('\n  ')}
  <section class="limits">
    <div class="label">What Codehere does not do yet</div>
    <ul>
      <li>No central dashboard, org-wide policy or admin console. Rules, lessons and help cards are plain files in the repo, shared through git.</li>
      <li>No SSO or accounts. It runs on each developer’s machine and sends nothing anywhere.</li>
      <li>The finish check runs only where a developer approved the test command; until then their agent tells them the check is off.</li>
      <li>On Codex CLI (<code>codex exec</code>) and Copilot CLI the developer does not see Codehere’s lines; the agent still gets every message. Three live runs per agent on this build pass for Claude Code, Codex CLI and Copilot CLI.</li>
      <li>Tampering is found by pattern. On the held-out half of a public benchmark of Claude Code runs, it sent back 15 of 19 runs that changed a test to pass, and 0 of 30 honest runs.</li>
      <li>It is not a CI gate. It works inside the agent session, before the change is pushed.</li>
    </ul>
  </section>
  <p class="meta">Run with <code>node v2/demo/live-team.mjs &lt;work dir&gt;</code> in github.com/muhammadegaa/codehere, branch fix/2.1.0-rc.3. Claude Code on the signed-in account, model haiku; Codehere ${esc(d.version)} from npm, approvals in each person’s own config folder.</p>
</main>
`;
fs.writeFileSync(OUT, html);
console.log(`written ${OUT}: ${d.scenes.length} scenes, ${caught} caught or blocked, ${ticks} with ✓`);
