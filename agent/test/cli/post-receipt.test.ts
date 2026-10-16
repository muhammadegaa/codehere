import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(__dirname, '../../../action/post-receipt.mjs');
const MARKER = '<!-- codehere-receipt -->';

interface Call {
  method: string;
  url: string;
  body: string;
  auth: string | undefined;
}
let server: Server;
let base = '';
let calls: Call[] = [];
let comments: { id: number; body: string; user?: { login: string; type: string } }[] = [];
const BOT = { login: 'github-actions[bot]', type: 'Bot' };
let failWith = 0;
const dir = mkdtempSync(join(tmpdir(), 'post-receipt-'));

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ method: req.method ?? '', url: req.url ?? '', body, auth: req.headers.authorization });
      if (failWith) {
        res.writeHead(failWith).end('{"message":"nope"}');
        return;
      }
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') res.end(JSON.stringify(comments));
      else if (req.method === 'POST') {
        const c = { id: 100 + comments.length, body: JSON.parse(body).body };
        comments.push(c);
        res.writeHead(201).end(JSON.stringify(c));
      } else if (req.method === 'PATCH') {
        const id = Number(/comments\/(\d+)/.exec(req.url ?? '')?.[1]);
        const c = comments.find((x) => x.id === id);
        if (c) c.body = JSON.parse(body).body;
        res.end(JSON.stringify(c));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function run(receipt: string, event: object | null = { pull_request: { number: 7 } }) {
  calls = [];
  const receiptFile = join(dir, 'receipt.md');
  writeFileSync(receiptFile, receipt);
  const eventFile = join(dir, 'event.json');
  writeFileSync(eventFile, JSON.stringify(event ?? { ref: 'refs/heads/main' }));
  const child = spawn('node', [SCRIPT], {
    env: {
      PATH: process.env.PATH,
      GITHUB_TOKEN: 'tok',
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_API_URL: base,
      GITHUB_EVENT_PATH: eventFile,
      RECEIPT_FILE: receiptFile,
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => (stdout += c));
  child.stderr.on('data', (c) => (stderr += c));
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { status, stdout, stderr };
}

describe('action/post-receipt.mjs', () => {
  it('creates one comment on the PR when there is none', async () => {
    comments = [];
    const r = await run(`${MARKER}\n> first`);
    expect(r.status).toBe(0);
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe('/repos/o/r/issues/7/comments');
    expect(post?.auth).toBe('Bearer tok');
    expect(comments).toHaveLength(1);
  });

  it('updates the same comment on the next run instead of adding another', async () => {
    comments = [
      { id: 5, body: 'unrelated' },
      { id: 6, body: `${MARKER}\n> old`, user: BOT },
    ];
    const r = await run(`${MARKER}\n> new`);
    expect(r.status).toBe(0);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(calls.find((c) => c.method === 'PATCH')?.url).toBe('/repos/o/r/issues/comments/6');
    expect(comments.find((c) => c.id === 6)?.body).toBe(`${MARKER}\n> new`);
    expect(comments).toHaveLength(2);
  });

  it('never edits a comment a person wrote that happens to contain the marker', async () => {
    comments = [{ id: 8, body: `${MARKER}\nwritten by a person`, user: { login: 'someone', type: 'User' } }];
    const r = await run(`${MARKER}\n> receipt`);
    expect(r.status).toBe(0);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(comments.find((c) => c.id === 8)?.body).toBe(`${MARKER}\nwritten by a person`);
    expect(comments).toHaveLength(2);
  });

  it('does nothing outside a pull request', async () => {
    comments = [];
    const r = await run(`${MARKER}\n> x`, null);
    expect(r.status).toBe(0);
    expect(calls).toHaveLength(0);
    expect(r.stdout).toContain('no pull request');
  });

  it('warns and exits 0 when the API refuses, as on a fork PR with a read-only token', async () => {
    failWith = 403;
    const r = await run(`${MARKER}\n> x`);
    failWith = 0;
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain('::warning');
  });

  it('refuses a receipt that does not carry the marker', async () => {
    comments = [];
    const r = await run('> no marker here');
    expect(r.status).toBe(1);
    expect(calls).toHaveLength(0);
  });
});
