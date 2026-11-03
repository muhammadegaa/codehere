#!/usr/bin/env node
// The 2.1.0 chores on a real agent (spec section 5): the person asks in chat, the agent runs
// Codehere and shows the draft, the person says yes. Each scenario runs --runs times (default 3),
// each in a fresh scratch repo, and is scored from the team files, the session's bound drafts and
// the agent's replies. The result goes to docs/conformance/<date>-<agent>-<version>-<model>-chores.md.
//
//   node scripts/chores.mjs --agent claude --model haiku
//   node scripts/chores.mjs --agent codex --model qwen3.5:9b-q4_K_M --oss
//   node scripts/chores.mjs --agent copilot --model qwen3.5:9b-q4_K_M --oss --bin <path to copilot>
//   [--runs 1] [--only L5,L9]
//
// L5   "Add a team rule ..." then "yes": a bound rule draft, shown, then saved
// L8   a failing test, "Write a help card for my team" then "yes": a bound help draft, shown, then saved
// L9   Ana's open card: "Anything from my team?", "Answer it ... Mark it solved.", "yes"
// L10  "Run npm test twice ..., then fix src/price.js": the offered lesson carries the proof, then saved
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { V2, scratch, atTerminal, hookCalls, cliCalls, sessionOf, commandOf, trustCodexHooks, setUpCopilot, agentVersion, runAgent } from './agents.mjs';

const args = process.argv.slice(2);
const flag = (k) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const opts = { agent: flag('agent'), model: flag('model'), oss: args.includes('--oss'), copilotBin: flag('bin') || 'copilot' };
const runs = Number(flag('runs') || 3);
const only = flag('only') ? flag('only').split(',') : null;
if (!['claude', 'codex', 'copilot'].includes(opts.agent) || !opts.model) {
  console.error('Usage: node scripts/chores.mjs --agent claude|codex|copilot --model <model> [--oss] [--bin <path>] [--runs N] [--only L5,L8]');
  process.exit(1);
}

const GOOD = "export const parsePrice = (s) => Number(String(s).replace(/^£/, ''));\n";
const BROKEN = 'export const parsePrice = (s) => Number(String(s));\n';
const TESTS = "import test from 'node:test';\nimport assert from 'node:assert';\nimport { parsePrice } from '../src/price.js';\ntest('plain', () => assert.equal(parsePrice('12'), 12));\ntest('pound sign', () => assert.equal(parsePrice('£12'), 12));\n";
const CARD = 'Cart total ignores quantity';

const norm = (s) => String(s || '').toLowerCase().replace(/[`*_"'“”‘’]/g, '').replace(/\s+/g, ' ').trim();
const shows = (reply, text) => !!text && norm(reply).includes(norm(text).slice(0, 40));
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const docs = (ctx, dir) => {
  const d = path.join(ctx.repo, '.codehere', dir);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => fs.readFileSync(path.join(d, f), 'utf8')) : [];
};
const teamChanges = (ctx) => ctx.sh('git status --porcelain -- .codehere').split('\n').filter(Boolean);
// The session's bound drafts, each with its draft record (the file the CLI wrote).
function bound(ctx, sid) {
  const s = readJson(path.join(ctx.repo, '.codehere/local/state.json'))?.sessions?.[sid];
  return (Array.isArray(s?.drafts) ? s.drafts : []).map((d) => ({ ...d, rec: readJson(path.join(ctx.repo, '.codehere/local/drafts', `${d.id}.json`)) }));
}
const question = (rec) => (String(rec?.text || '').match(/## Question\n(.+)/) || [])[1] || '';

// ---------- one run ----------

async function setUp(id) {
  const ctx = scratch(opts.agent, `chores-${id}`);
  const { sh } = ctx;
  const write = (f, text) => {
    fs.mkdirSync(path.dirname(path.join(ctx.repo, f)), { recursive: true });
    fs.writeFileSync(path.join(ctx.repo, f), text);
  };
  sh('git init -q -b main && git config user.name Kai && git config user.email kai@example.com');
  write('package.json', JSON.stringify({ name: 'shop', type: 'module', scripts: { test: 'node --test' } }, null, 2) + '\n');
  write('src/price.js', id === 'L8' || id === 'L10' ? BROKEN : GOOD);
  write('test/price.test.js', TESTS);
  sh('git add -A && git commit -qm shop');
  sh(`codehere init --agent ${opts.agent}`);
  atTerminal(ctx, 'codehere approve', 'y');
  if (id === 'L9') {
    sh('git config user.name Ana');
    atTerminal(ctx, `codehere help '${CARD}'`);
    sh('git config user.name Kai');
  }
  sh('git add -A && git commit -qm codehere');
  if (!sh('codehere status').includes('approved on this machine')) throw new Error('setup: the test command is not approved');
  if (id === 'L9' && !docs(ctx, 'help').some((d) => d.includes('author: Ana'))) throw new Error("setup: Ana's card was not saved");
  if (opts.agent === 'codex') await trustCodexHooks(ctx);
  if (opts.agent === 'copilot') setUpCopilot(ctx, opts.model, opts.oss);
  fs.rmSync(ctx.log, { recursive: true, force: true }); // only the agent's calls from here on
  return ctx;
}

const TURNS = {
  L5: ['Add a team rule: prices are integer pence, never floats.', 'yes'],
  L8: ["I'm stuck on the failing test. Write a help card for my team.", 'yes'],
  L9: ['Anything from my team?', 'Answer it: use price * qty. Mark it solved.', 'yes'],
  L10: ['Run npm test twice before changing anything, then fix src/price.js until the tests pass.', 'yes'],
};

// Each check after a turn: [name, pass, evidence]. Run before the next turn, as the next prompt
// saves or discards what was bound.
function checkTurn(id, n, ctx, sid, reply, startCli) {
  const b = sid ? bound(ctx, sid) : [];
  const kind = (k) => b.find((d) => d.kind === k && d.rec);
  const ran = cliCalls(ctx).slice(startCli);
  const out = [];
  if (id === 'L5' && n === 1) {
    const d = kind('rule');
    const text = d ? d.rec.line.replace(/^- /, '').replace(/ \([^()]*\)$/, '') : '';
    out.push(['a bound rule draft', !!d, d ? d.rec.line : `bound: ${JSON.stringify(b.map((x) => x.kind))}`]);
    out.push(['no team file changed', !teamChanges(ctx).length, teamChanges(ctx).join(', ') || 'none']);
    out.push(['the reply shows the printed rule line', shows(reply, text), text]);
  }
  if (id === 'L5' && n === 2) {
    const rules = fs.readFileSync(path.join(ctx.repo, '.codehere/rules.md'), 'utf8');
    out.push(['the rule is in rules.md', /^- .*pence/im.test(rules), rules.split('\n').filter((l) => l.startsWith('- ')).join(' | ') || 'no rules']);
  }
  if (id === 'L8' && n === 1) {
    const d = kind('help');
    out.push(['a bound help draft', !!d, d ? question(d.rec) : `bound: ${JSON.stringify(b.map((x) => x.kind))}`]);
    out.push(['no team file changed', !teamChanges(ctx).length, teamChanges(ctx).join(', ') || 'none']);
    out.push(["the reply shows the card's question", shows(reply, question(d?.rec)), question(d?.rec)]);
  }
  if (id === 'L8' && n === 2) out.push(['the card is in help/', docs(ctx, 'help').length === 1, `${docs(ctx, 'help').length} card(s)`]);
  if (id === 'L9' && n === 1) {
    out.push(['inbox or show ran', ran.some((c) => /^(inbox|show)\b/.test(c)), ran.join(' | ') || 'no codehere command']);
    out.push(["the reply shows the card's question", shows(reply, CARD), CARD]);
  }
  if (id === 'L9' && n === 2) {
    const d = kind('reply');
    out.push(['a bound reply --solved draft', !!d?.rec?.lesson, d ? d.rec.line : `bound: ${JSON.stringify(b.map((x) => x.kind))}`]);
  }
  if (id === 'L9' && n === 3) {
    const card = docs(ctx, 'help').find((d) => d.includes('author: Ana')) || '';
    out.push(['the reply is in the card', /## Replies\n- Kai /.test(card), (card.match(/## Replies\n.*/) || ['no replies'])[0]]);
    out.push(['the card is resolved', /^status: resolved$/m.test(card), (card.match(/^status: .*$/m) || ['no status'])[0]]);
    out.push(['a lesson exists', docs(ctx, 'lessons').length === 1, `${docs(ctx, 'lessons').length} lesson(s)`]);
  }
  if (id === 'L10' && n === 1) {
    const d = kind('lesson');
    out.push(['a bound lesson draft carrying the proof', !!d?.proof && d.proof.state === 'verified', d ? JSON.stringify({ title: d.rec.meta?.title, proof: d.proof?.state || 'none' }) : `bound: ${JSON.stringify(b.map((x) => x.kind))}`]);
    out.push(["the reply shows the draft's title", shows(reply, d?.rec?.meta?.title), d?.rec?.meta?.title || '']);
  }
  if (id === 'L10' && n === 2) {
    const l = docs(ctx, 'lessons');
    out.push(['the lesson exists and is verified', l.length === 1 && /^state: verified$/m.test(l[0]) && /^proof_exit: 0$/m.test(l[0]), l.length ? (l[0].match(/^state: .*$/m) || ['no state'])[0] : 'no lesson']);
  }
  return out;
}

async function runOnce(id) {
  const ctx = await setUp(id);
  const turns = [];
  let sid = null;
  let blocked = null;
  for (const [i, prompt] of TURNS[id].entries()) {
    const before = hookCalls(ctx).length;
    const startCli = cliCalls(ctx).length;
    const run = runAgent(ctx, opts, prompt, sid);
    const calls = hookCalls(ctx).slice(before);
    sid = sid || calls.map(sessionOf).find(Boolean) || null;
    // a codehere command the agent ran that the wrapper never saw: its shell found another codehere
    const theirs = calls.filter((c) => c.event === 'post-tool').map((c) => commandOf(c.input)).filter((c) => /(^|[\s;&|(])codehere\s+(?!hook)/.test(c));
    if (theirs.length && cliCalls(ctx).length === startCli) blocked = `the agent ran \`${theirs[0].slice(0, 80)}\` but the wrapper logged no call`;
    if (!calls.length) blocked = `no hook ran in turn ${i + 1} (exit ${run.exit}${run.err ? `: ${run.err.trim().split('\n').pop().slice(0, 120)}` : ''})`;
    const checks = blocked ? [] : checkTurn(id, i + 1, ctx, sid, run.reply, startCli);
    turns.push({ prompt, run, checks, codehere: cliCalls(ctx).slice(startCli) });
    console.error(`${id} T${i + 1}: exit ${run.exit}, ${run.seconds}s, ${calls.length} hook call(s), codehere: ${turns.at(-1).codehere.join(' | ') || 'none'}; ${checks.map(([n, ok]) => `${ok ? 'ok' : 'FAIL'} ${n}`).join('; ') || blocked}`);
    if (blocked || !sid) break;
  }
  const status = blocked ? 'BLOCKED' : turns.length === TURNS[id].length && turns.every((t) => t.checks.every(([, ok]) => ok)) ? 'PASS' : 'FAIL';
  if (status === 'PASS') fs.rmSync(ctx.tmp, { recursive: true, force: true });
  return { status, blocked, turns, tmp: ctx.tmp, sid };
}

// ---------- all runs, then the result file ----------

const probe = scratch(opts.agent, 'chores-version');
const version = agentVersion(probe, opts.copilotBin);
fs.rmSync(probe.tmp, { recursive: true, force: true });
const results = {};
for (const id of Object.keys(TURNS).filter((x) => !only || only.includes(x))) {
  results[id] = [];
  for (let i = 0; i < runs; i++) {
    let r = await runOnce(id);
    if (r.status === 'BLOCKED') r = { ...(await runOnce(id)), retried: true }; // a BLOCKED run is repeated once
    results[id].push(r);
    console.error(`${id} run ${i + 1}: ${r.status}${r.status === 'PASS' ? '' : ` (kept: ${r.tmp})`}`);
  }
}

const commit = execSync('git rev-parse --short HEAD', { cwd: V2 }).toString().trim();
const dirty = execSync('git status --porcelain -- src bin', { cwd: V2 }).toString().trim() ? ' plus uncommitted changes' : '';
const modelSlug = opts.model.replace(/[^\w.-]+/g, '-');
const date = new Date().toISOString().slice(0, 10);
const file = path.join(V2, 'docs', 'conformance', `${date}-${opts.agent}-${version}-${modelSlug}-chores${only ? `-${only.join('-')}` : ''}.md`);
const scrub = (s, r) => String(s).split(r.tmp).join('<scratch>');
const cell = (rs) => {
  const pass = rs.filter((r) => r.status === 'PASS').length;
  const blocked = rs.filter((r) => r.status === 'BLOCKED').length;
  return blocked === rs.length ? 'not measured' : `${pass} of ${rs.length - blocked}${blocked ? ` (${blocked} BLOCKED)` : ''}`;
};
const lines = [
  `# Chores on ${opts.agent} ${version} (${date})`,
  '',
  `Codehere at ${commit}${dirty}. Model: ${opts.model}${opts.oss ? ' through Ollama' : ''}. Run with \`node scripts/chores.mjs --agent ${opts.agent} --model ${opts.model}${opts.oss ? ' --oss' : ''}${opts.agent === 'copilot' ? ' --bin <path>/copilot' : ''}\`, each run in a fresh scratch repo with its own approvals and agent home. Scenarios: spec 2.1.0 section 5.`,
  '',
  '| Scenario | Result | Runs |',
  '|---|---|---|',
  ...Object.entries(results).map(([id, rs]) => `| ${id} | ${cell(rs)} | ${rs.map((r) => r.status + (r.retried ? ' (after a BLOCKED retry)' : '')).join(', ')} |`),
  '',
];
for (const [id, rs] of Object.entries(results)) {
  rs.forEach((r, i) => {
    lines.push(`## ${id}, run ${i + 1}: ${r.status}`, '');
    if (r.blocked) lines.push(`BLOCKED: ${scrub(r.blocked, r)}`, '');
    for (const [n, t] of r.turns.entries()) {
      lines.push(`- **Turn ${n + 1}** "${t.prompt}": exit ${t.run.exit}, ${t.run.seconds} s; codehere commands: ${t.codehere.map((c) => `\`${scrub(c, r).slice(0, 100)}\``).join(', ') || 'none'}`);
      for (const [name, ok, ev] of t.checks) lines.push(`  - ${ok ? 'pass' : 'FAIL'}: ${name} (${scrub(ev, r).replace(/\n/g, ' ').slice(0, 160)})`);
      lines.push(`  - reply: ${scrub(t.run.reply, r).replace(/\s+/g, ' ').trim().slice(0, 300) || '(empty)'}`);
    }
    lines.push('');
  });
}
fs.writeFileSync(file, lines.join('\n'));
console.log(path.relative(V2, file));
for (const [id, rs] of Object.entries(results)) console.log(`${id}: ${cell(rs)}`);
