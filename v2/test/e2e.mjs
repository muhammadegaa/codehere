// End-to-end test: two teammates share one repo. We simulate Claude Code
// hook events by piping the same JSON Claude Code sends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readOnly } from '../src/hooks.js';
import { pickModel } from '../src/gemma.js';
import { lowInfoPrompt, vagueFeature } from '../src/signals.js';

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'codehere.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codehere-e2e-'));
let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}\n${extra}`);
  }
}

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function ch(args, cwd, input) {
  const r = spawnSync('node', [BIN, ...args], { cwd, input: input ? JSON.stringify(input) : '', encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function user(dir, name) {
  sh(`git config user.name "${name}"`, dir);
  sh(`git config user.email "${name.toLowerCase()}@example.com"`, dir);
}

// --- repo setup: a bare remote, Ana's clone, Budi's clone ---
const remote = path.join(tmp, 'remote.git');
sh(`git init -q --bare -b main "${remote}"`, tmp);
const ana = path.join(tmp, 'ana');
sh(`git clone -q "${remote}" ana`, tmp);
user(ana, 'Ana');
sh('git checkout -q -b main', ana);
fs.writeFileSync(path.join(ana, 'package.json'), JSON.stringify({ name: 'demo', scripts: { test: 'node test/run.test.js' } }, null, 2));
fs.mkdirSync(path.join(ana, 'test'));
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a - b;\n');
fs.writeFileSync(
  path.join(ana, 'test', 'run.test.js'),
  "import { add } from '../app.js';\nif (add(2, 2) !== 4) { console.error('AssertionError: expected 4 but got ' + add(2,2)); process.exit(1); }\nconsole.log('all tests passed');\n"
);
fs.writeFileSync(path.join(ana, 'package.json'), JSON.stringify({ name: 'demo', type: 'module', scripts: { test: 'node test/run.test.js' } }, null, 2));
sh('git add -A && git commit -qm "initial app"', ana);

console.log('\n1. init');
let r = ch(['init'], ana);
check('init succeeds', r.code === 0, r.err);
check('detects npm test', JSON.parse(fs.readFileSync(path.join(ana, '.codehere/config.json'), 'utf8')).testCommand === 'npm test --silent');
const settings = JSON.parse(fs.readFileSync(path.join(ana, '.claude/settings.json'), 'utf8'));
check('installs 5 hook events', ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'Stop'].every((e) => settings.hooks[e]));
r = ch(['init'], ana);
const settings2 = JSON.parse(fs.readFileSync(path.join(ana, '.claude/settings.json'), 'utf8'));
check('init is idempotent', settings2.hooks.Stop.length === 1);
check('local state is git-ignored', fs.readFileSync(path.join(ana, '.gitignore'), 'utf8').includes('.codehere/local/'));
ch(['rule', 'Use pnpm, never npm install'], ana);
sh('git add -A && git commit -qm "add codehere" && git push -q origin main', ana);

// a fake transcript, like Claude Code writes
const transcript = path.join(tmp, 'ana-session.jsonl');
fs.writeFileSync(
  transcript,
  [
    { type: 'user', message: { role: 'user', content: 'Build an add() function and make the tests pass' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'On it' }] } },
    { type: 'user', message: { role: 'user', content: 'still broken, just fix it' } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ignored' }] } },
    { type: 'user', message: { role: 'user', content: 'it must handle negative numbers too, contact me at ana@example.com' } },
  ]
    .map((x) => JSON.stringify(x))
    .join('\n')
);

console.log('\n2. session start loads team rules');
r = ch(['hook', 'session-start'], ana, { session_id: 's1', transcript_path: transcript, cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
check('exit 0', r.code === 0);
check('injects team rule', r.out.includes('Use pnpm'), r.out);

console.log('\n3. doom loop: same error 3 times');
const failing = { session_id: 's1', cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '', stderr: 'AssertionError: expected 4 but got 0\n    at test/run.test.js:2:40' } };
r = ch(['hook', 'post-tool'], ana, failing);
check('1st error: silent', r.code === 0 && !r.out && !r.err, r.out + r.err);
r = ch(['hook', 'post-tool'], ana, { ...failing, tool_response: { stderr: 'AssertionError: expected 4 but got -2' } });
check('2nd error (different numbers, same signature): silent', r.code === 0 && !r.err);
r = ch(['hook', 'post-tool'], ana, failing);
check('3rd error: agent is told to stop and diagnose (exit 2)', r.code === 2 && r.err.includes('Stop patching'), r.err);
r = ch(['hook', 'post-tool'], ana, { ...failing, tool_name: 'Read' });
check('non-Bash tools ignored', r.code === 0 && !r.err);
r = ch(['hook', 'post-tool'], ana, { ...failing, tool_response: { stdout: 'all tests passed' } });
check('success output ignored', r.code === 0 && !r.err);

console.log('\n4. "done" is verified by running the tests');
fs.appendFileSync(path.join(ana, 'app.js'), '// tried something\n');
r = ch(['hook', 'stop'], ana, { session_id: 's1', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
let j = r.out ? JSON.parse(r.out) : {};
check('failing tests block "done"', j.decision === 'block' && j.reason.includes('failed'), r.out + r.err);

console.log('\n5. test tampering is caught');
fs.writeFileSync(path.join(ana, 'test', 'run.test.js'), fs.readFileSync(path.join(ana, 'test', 'run.test.js'), 'utf8') + "// @ts-nocheck\nit.skip('add works', () => {});\n");
r = ch(['hook', 'stop'], ana, { session_id: 's1', cwd: ana, hook_event_name: 'Stop', stop_hook_active: true });
j = r.out ? JSON.parse(r.out) : {};
check('tampering blocks "done"', j.decision === 'block' && j.reason.includes('weaken tests'), r.out + r.err);
sh('git checkout -q -- test/run.test.js', ana);

console.log('\n6. real fix passes; solved loop becomes a team lesson');
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a + b;\n');
r = ch(['hook', 'stop'], ana, { session_id: 's1', cwd: ana, hook_event_name: 'Stop', stop_hook_active: true });
j = r.out ? JSON.parse(r.out) : {};
check('agent asked to write a lesson once', j.decision === 'block' && j.reason.includes('.codehere/lessons/'), r.out + r.err);
r = ch(['hook', 'stop'], ana, { session_id: 's2', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
j = r.out ? JSON.parse(r.out) : {};
check('clean finish shows a short receipt', (j.systemMessage || '').includes('passed'), r.out + r.err);

console.log('\n7. stop-block cap (never traps the agent)');
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a * b;\n');
let blocks = 0;
for (let i = 0; i < 6; i++) {
  r = ch(['hook', 'stop'], ana, { session_id: 's3', cwd: ana, hook_event_name: 'Stop', stop_hook_active: i > 0 });
  if (r.out && JSON.parse(r.out).decision === 'block') blocks++;
}
check('at most 3 blocks per session', blocks <= 3, `blocks=${blocks}`);
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a + b;\n');

console.log('\n8. restart brief');
r = ch(['brief'], ana);
check('brief has goal from transcript', r.out.includes('Build an add() function'), r.out);
check('brief lists what kept failing', r.out.includes('AssertionError'), r.out);
check('brief redacts emails', !r.out.includes('ana@example.com'), r.out);
r = ch(['hook', 'session-start'], ana, { session_id: 's4', cwd: ana, hook_event_name: 'SessionStart', source: 'clear' });
check('next session loads the brief', r.out.includes('Restart brief'), r.out);
r = ch(['hook', 'session-start'], ana, { session_id: 's5', cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
check('brief loads only once', !r.out.includes('Restart brief'), r.out);

console.log('\n9. help card -> teammate -> lesson -> every agent');
const fresh = { session_id: 's6', transcript_path: transcript, cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'pnpm build' }, tool_response: { stderr: "Error: Cannot find module 'left-pad' imported from src/index.js" } };
ch(['hook', 'session-start'], ana, { session_id: 's6', transcript_path: transcript, cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
ch(['hook', 'post-tool'], ana, fresh);
ch(['hook', 'post-tool'], ana, fresh);
r = ch(['help', 'Build fails: cannot find module left-pad'], ana);
check('help card written', r.code === 0 && r.out.includes('Cannot find module'), r.out + r.err);
check('help card redacts email', !r.out.includes('ana@example.com'));
check('help card counts plainly ("Seen 2 times", never "1 times")', r.out.includes('Seen 2 times') && !r.out.includes(' 1 times'), r.out);
sh('git add -A && git commit -qm "help card" && git push -q origin main', ana);

sh(`git clone -q -b main "${remote}" budi`, tmp);
const budi = path.join(tmp, 'budi');
user(budi, 'Budi');
r = ch(['hook', 'session-start'], budi, { session_id: 'b1', cwd: budi, hook_event_name: 'SessionStart', source: 'startup' });
check("Budi's agent mentions Ana's open request", r.out.includes('Ana') && r.out.includes('codehere inbox'), r.out);
r = ch(['inbox'], budi);
check('Budi sees it in inbox', r.out.includes('cannot find module left-pad'), r.out);
const id = r.out.split('\n')[0].trim();
r = ch(['reply', id.slice(0, 13), 'left-pad was removed from package.json in commit abc; run pnpm add left-pad', '--solved'], budi);
check('reply --solved creates a lesson', r.out.includes('team lesson'), r.out + r.err);
sh('git add -A && git commit -qm "answer" && git push -q origin main', budi);

sh('git pull -q --rebase origin main', ana);
r = ch(['hook', 'post-tool'], ana, { ...fresh, session_id: 's7', tool_response: { stderr: "Error: Cannot find module 'left-pad' imported from src/other.js" } });
j = r.out ? JSON.parse(r.out) : {};
check("Ana's agent gets Budi's fix the first time the error appears", (j.hookSpecificOutput?.additionalContext || '').includes('pnpm add left-pad'), r.out + r.err);
r = ch(['hook', 'post-tool'], ana, { ...fresh, session_id: 's7' });
check('lesson is shown only once per session', !r.out, r.out);

console.log('\n10. fail-safe');
r = spawnSync('node', [BIN, 'hook', 'stop'], { cwd: tmp, input: 'not json', encoding: 'utf8' });
check('garbage input outside a project: exit 0', r.status === 0);
r = ch(['hook', 'stop'], ana, { session_id: 's8', cwd: ana, hook_event_name: 'Stop' });
check('no changes this session: silent', r.code === 0 && !r.out, r.out);
// codehere 1.x installed user-level hooks such as `codehere scan-tool --log-only`
r = ch(['scan-tool', '--log-only'], ana, { session_id: 's8', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } });
check('an unknown command from an old hook: nothing on stdout, exit 0', r.code === 0 && !r.out, r.out + r.err);

console.log('\n11. never adds work the user did not ask for');
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a - b; // broken before the session\n');
ch(['hook', 'session-start'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
r = ch(['hook', 'stop'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
check('changes made before the session do not trigger the test check', r.code === 0 && !r.out, r.out);
r = ch(['hook', 'post-tool'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'cat test/run.test.js' }, tool_response: { stdout: "console.error('AssertionError: expected 4')" } });
r = ch(['hook', 'post-tool'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'grep -r error .' }, tool_response: { stdout: 'TypeError: x is not a function' } });
const st = JSON.parse(fs.readFileSync(path.join(ana, '.codehere/local/state.json'), 'utf8'));
check('reading files (cat, grep) never counts as an error', Object.keys(st.sessions.s9.errors).length === 0, JSON.stringify(st.sessions.s9.errors));
fs.appendFileSync(path.join(ana, 'app.js'), '// agent edit\n');
r = ch(['hook', 'stop'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
check('a change the agent makes this session is checked', r.out && JSON.parse(r.out).decision === 'block', r.out);
ch(['hook', 'post-tool'], ana, { session_id: 's9', cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'cd .codehere && cat README.md config.json; ls lessons' }, tool_response: { stdout: '- `lessons/`: errors someone already solved' } });
const st9 = JSON.parse(fs.readFileSync(path.join(ana, '.codehere/local/state.json'), 'utf8'));
check('a chain of read-only commands (cd && cat; ls) never counts as an error', Object.keys(st9.sessions.s9.errors).length === 0, JSON.stringify(st9.sessions.s9.errors));

console.log('\n12. a weakened test is never reported as verified');
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => a + b;\n'); // same as HEAD: a clean start
ch(['hook', 'session-start'], ana, { session_id: 's10', cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
fs.writeFileSync(path.join(ana, 'test', 'run.test.js'), "const it = { skip() {} };\nit.skip('add works', () => {});\nconsole.log('all tests passed');\n");
r = ch(['hook', 'stop'], ana, { session_id: 's10', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
check('the skip is blocked once', r.out && JSON.parse(r.out).decision === 'block', r.out);
r = ch(['hook', 'stop'], ana, { session_id: 's10', cwd: ana, hook_event_name: 'Stop', stop_hook_active: true });
j = r.out ? JSON.parse(r.out) : {};
check('user kept the skip: no "verified", the weakened test is named', !(j.systemMessage || '').includes('verified') && (j.systemMessage || '').includes('skipped'), r.out);
sh('git checkout -q -- test/run.test.js', ana);

console.log('\n13. reviewer cases: read-only chains and -h');
check('grep for "error|fail" is read-only (quotes are not split)', readOnly('grep -E "error|fail" log.txt') && readOnly("sed -n '1p;5p' f") && readOnly("awk '{print $1; print $2}' f"));
check('a test run hidden in a chain still counts', !readOnly('cd app\nnpm test') && !readOnly('echo $(npm test)') && !readOnly('echo "`npm test`"') && !readOnly('cd app && npm test') && !readOnly('ls && pytest'));
r = ch(['-h'], ana);
check('codehere -h prints usage', r.out.includes('codehere init'), r.out + r.err);
r = ch(['stauts'], ana);
check('a typo prints one line to stderr, nothing to stdout', !r.out && r.err.includes('Unknown command'), r.out + r.err);

console.log('\n14. prompt support (UserPromptSubmit)');
const ptx = path.join(tmp, 'prompt-session.jsonl');
fs.writeFileSync(ptx, '{"type":"user","message":{"role":"user","content":"fix the cart"}}\n');
const P = (sid, prompt) => ch(['hook', 'prompt'], ana, { session_id: sid, transcript_path: ptx, cwd: ana, hook_event_name: 'UserPromptSubmit', prompt });
const ctx = (r) => (r.out ? JSON.parse(r.out).hookSpecificOutput?.additionalContext || '' : '');
ch(['hook', 'session-start'], ana, { session_id: 'p1', transcript_path: ptx, cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
r = P('p1', 'hello, what does this repo do?');
check('normal turn: zero output', r.code === 0 && !r.out && !r.err, r.out + r.err);
const nodeFail = { session_id: 'p1', cwd: ana, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, error: '✖ total counts quantity (0.8ms)\nAssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n800 !== 1300' };
ch(['hook', 'post-tool'], ana, nodeFail);
fs.appendFileSync(path.join(ana, 'app.js'), '// try 1\n');
r = P('p1', 'still broken');
const c1 = ctx(r);
check('"still broken" after a failure gets the error, failing test and files changed', c1.includes('Failing test: total counts quantity') && c1.includes('Error (seen 1x)') && c1.includes('app.js'), r.out);
check('that message stays under 300 tokens', c1.length > 0 && c1.length <= 1100, String(c1.length));
r = P('p1', 'Rename sum to total in app.js, the test expects 1300');
check('a detailed prompt during a failure: zero output', !r.out, r.out);
r = P('p1', 'still broken');
check('a failure from an older turn is not attached', !r.out, r.out);
ch(['hook', 'post-tool'], ana, { session_id: 'p1', cwd: ana, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: '✔ returns an error for bad input (1.2ms)\nℹ tests 3\nℹ fail 0' } });
const stP = JSON.parse(fs.readFileSync(path.join(ana, '.codehere/local/state.json'), 'utf8'));
check('a passing run that mentions "error" is not a failure', !Object.keys(stP.sessions.p1.errors).some((k) => k.includes('returns an error')), JSON.stringify(stP.sessions.p1.errors));
r = P('p2', 'Build me a todo app with login and a dashboard for my class');
check('vague feature with no test: ask "How will you know it works?"', ctx(r).includes('How will you know it works?'), r.out);
r = P('p2', 'Also build a settings page with a dark mode toggle');
check('asked only once per session', !r.out, r.out);
r = P('p3', 'Build a login page; it should return 401 for a wrong password');
check('feature that says how to check it: zero output', !r.out, r.out);
const cfgFile = path.join(ana, '.codehere/config.json');
const cfgBefore = fs.readFileSync(cfgFile, 'utf8');
fs.writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(cfgBefore), longSessionTokens: 10 }));
for (let i = 0; i < 3; i++) ch(['hook', 'post-tool'], ana, { ...nodeFail, session_id: 'p4' });
ch(['hook', 'session-start'], ana, { session_id: 'p4', transcript_path: ptx, cwd: ana, hook_event_name: 'SessionStart', source: 'startup' });
fs.appendFileSync(ptx, JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage: { input_tokens: 3, cache_read_input_tokens: 40000, cache_creation_input_tokens: 2000, output_tokens: 50 } } }) + '\n');
r = P('p4', 'Can you rename sum to total in app.js');
check('long session + repeated error: suggest codehere brief and a fresh session', ctx(r).includes('codehere brief'), r.out);
const { transcriptTokens } = await import('../src/hooks.js');
check('context size comes from recorded usage, not file size', transcriptTokens({ transcript: ptx }) === 42003, String(transcriptTokens({ transcript: ptx })));
r = P('p4', 'and update the README file');
check('brief suggested only once', !r.out, r.out);
fs.writeFileSync(cfgFile, cfgBefore);
r = spawnSync('node', [BIN, 'hook', 'prompt'], { cwd: ana, input: '{not json', encoding: 'utf8' });
check('prompt hook fails open on garbage input', r.status === 0 && !r.stdout, r.stdout + r.stderr);

console.log('\n15. stats');
fs.writeFileSync(path.join(ana, 'app.js'), 'export const add = (a, b) => b + a; // fixed\n');
r = ch(['hook', 'stop'], ana, { session_id: 'p1', cwd: ana, hook_event_name: 'Stop', stop_hook_active: false });
check('green closes the open fix attempt', (r.out ? JSON.parse(r.out).systemMessage || '' : '').includes('verified'), r.out);
r = ch(['stats'], ana);
check('stats: turns to green, loops stopped, size, turns to fix', /Turns to green: median \d/.test(r.out) && /Loops stopped: \d/.test(r.out) && r.out.includes('Context size') && r.out.includes('after a short "still broken" (1 fix)'), r.out + r.err);

console.log('\n16. Gemma picks a model that is installed');
check('configured model used when installed', pickModel(['gemma4:e4b', 'gemma4:e2b-it-qat'], 'gemma4:e4b') === 'gemma4:e4b');
check('falls back to the installed E4B tag', pickModel(['embeddinggemma:300m-qat-q4_0', 'gemma4:12b-it-qat', 'gemma4:e4b-it-qat'], 'gemma4:e4b') === 'gemma4:e4b-it-qat');
check('no Gemma installed: none', pickModel(['qwen3:8b', 'embeddinggemma:300m'], 'gemma4:e4b') === null);

console.log('\n17. prompt words, English and Indonesian');
check('short repair prompts count (en + id)', ['still broken', 'fix it', 'still error', "doesn't work", 'masih error, benerin dong', 'kenapa masih error?', 'gak jalan', 'tolong perbaiki'].every(lowInfoPrompt));
check('thanks, confirmations, questions and pasted errors do not', !['thanks!', 'yes', 'ya', 'ok', 'ok continue', 'it works now, thanks', 'nice work', 'mantap, sudah bisa', 'why?', 'no, use postgres instead', 'great, now print the receipt', 'TypeError: x is not a function', 'expected 20 but got 10', 'fix src/cart.js'].some(lowInfoPrompt));
check('questions and small edits are not vague features', !['how do I add auth to this app?', 'why did you create a new api route here?', 'make sure the dashboard still loads after the change', 'make the login button blue instead of grey'].some(vagueFeature));
check('vague feature (en + id)', vagueFeature('Buatkan aplikasi kasir untuk warung dengan laporan bulanan') && vagueFeature('Add a discount code feature to the checkout page'));
check('a feature that says how to check it is not vague (en + id)', !vagueFeature('Buatkan fitur login, harus menolak password salah') && !vagueFeature('Build a login page; it should return 401 for a wrong password'));

console.log(`\n${passed} passed, ${failed} failed`);
if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log(tmp);
process.exit(failed ? 1 : 0);
