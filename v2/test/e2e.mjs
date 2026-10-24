// End-to-end test: two teammates share one repo. We simulate Claude Code
// hook events by piping the same JSON Claude Code sends.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
check('installs 4 hook events', ['SessionStart', 'PostToolUse', 'PostToolUseFailure', 'Stop'].every((e) => settings.hooks[e]));
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

console.log(`\n${passed} passed, ${failed} failed`);
if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log(tmp);
process.exit(failed ? 1 : 0);
