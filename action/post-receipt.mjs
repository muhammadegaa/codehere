#!/usr/bin/env node
/**
 * Keep exactly one codehere receipt comment on a pull request: update it if it exists, create it if not.
 * No dependencies and no codehere backend: it talks only to the GitHub API with the job's own token.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, RECEIPT_FILE; GITHUB_API_URL optional.
 * Exit 0 when the comment cannot be written (a fork PR's token is read-only) so the check itself still runs.
 */
import { readFileSync } from 'node:fs';

const MARKER = '<!-- codehere-receipt -->';
const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, RECEIPT_FILE } = process.env;
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');

const receipt = readFileSync(RECEIPT_FILE, 'utf8').trim();
if (!receipt.startsWith(MARKER)) {
  console.error('::error::receipt does not start with the codehere marker; refusing to post it');
  process.exit(1);
}

const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
const pr = event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : undefined);
if (!pr) {
  console.log('no pull request in this event; not posting a comment');
  process.exit(0);
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'codehere-action',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return res.json();
}

try {
  const base = `/repos/${GITHUB_REPOSITORY}/issues`;
  let existing;
  for (let page = 1; page <= 5 && !existing; page++) {
    const batch = await api('GET', `${base}/${pr}/comments?per_page=100&page=${page}`);
    existing = batch.find((c) => c.user?.type === 'Bot' && typeof c.body === 'string' && c.body.includes(MARKER));
    if (batch.length < 100) break;
  }
  if (existing) await api('PATCH', `${base}/comments/${existing.id}`, { body: receipt });
  else await api('POST', `${base}/${pr}/comments`, { body: receipt });
  console.log(existing ? `updated receipt comment ${existing.id}` : 'posted receipt comment');
} catch (err) {
  console.log(`::warning::could not write the receipt comment (${err.message}); the check result is unchanged`);
}
