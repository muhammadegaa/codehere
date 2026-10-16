#!/usr/bin/env node
/**
 * Turn the output of `codehere check --json` into the receipt file and the step outputs.
 * If the check itself could not run (bad base ref, crash), say so and report `unverified`: a broken
 * check is never shown as a pass.
 *
 * Usage: summarize.mjs <result.json> <stderr.txt> <receipt.md>   (writes verdict=... to $GITHUB_OUTPUT)
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const [resultPath, stderrPath, receiptPath] = process.argv.slice(2);
const MARKER = '<!-- codehere-receipt -->';
const VERDICTS = new Set(['pass', 'fail', 'unverified', 'skipped']);

let verdict = 'unverified';
let receipt;
try {
  const out = JSON.parse(readFileSync(resultPath, 'utf8'));
  if (VERDICTS.has(out.verdict) && typeof out.receipt === 'string') {
    verdict = out.verdict;
    receipt = out.receipt;
  }
} catch {
  /* fall through to the unverified receipt */
}

if (!receipt) {
  let reason = 'no output';
  try {
    reason =
      readFileSync(stderrPath, 'utf8')
        .split('\n')
        .find((l) => l.trim()) ?? reason;
  } catch {
    /* keep the default reason */
  }
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  receipt = `${MARKER}\n> **codehere · verified outcome receipt** — couldn't run the check (${reason.trim().slice(0, 200)}) · unverified · ${when}`;
}

// On a pull request the receipt's commit is GitHub's temporary merge commit, which a fresh clone does not have.
const { PR_NUMBER, PR_HEAD_SHA } = process.env;
if (PR_NUMBER && PR_HEAD_SHA) {
  receipt = receipt.replace(
    /^> Reproduce independently: `git checkout ([0-9a-f]+) && (.+)`$/m,
    (_, merge, cmd) =>
      `> Reproduce independently: \`git fetch origin refs/pull/${PR_NUMBER}/merge && git checkout FETCH_HEAD && ${cmd}\` (PR head \`${PR_HEAD_SHA.slice(0, 7)}\`, checked as merge \`${merge}\`; the merge ref moves when the PR or its base changes)`,
  );
}

writeFileSync(receiptPath, receipt.trim() + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${verdict}\n`);
console.log(`verdict=${verdict}`);
