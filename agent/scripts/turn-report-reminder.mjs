#!/usr/bin/env node
// UserPromptSubmit hook: re-injects the per-turn report rule so it does not decay in long sessions or after compaction.
// Rule source: CLAUDE.md § Every turn. Fails open: it only prints a reminder and always exits 0.
const TEXT =
  'Turn report rule (owner, 2026-10-09): answer the question first, in one sentence. Before executing, planning or deciding, name the workflow IDs (W0 to W10, agent/CLAUDE.md). End every turn with Happened (with evidence), Ongoing (what is running or waiting, and on whom), Next, and Your call (at most 3). Plain words. Never report green that was not observed.';

let done = false;
const emit = () => {
  if (done) return;
  done = true;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: TEXT } }));
  process.exit(0);
};
process.stdin.on('data', () => {});
process.stdin.on('end', emit);
process.stdin.on('error', emit);
setTimeout(emit, 500);
