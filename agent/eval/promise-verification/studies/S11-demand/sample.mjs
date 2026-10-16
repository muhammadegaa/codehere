#!/usr/bin/env node
// S11 sampler. Draws the PR sample fixed in PREREG.md. Method (written before labeling, see FRAME below):
//  - window 2026-09-01T00:00Z to 2026-10-13T23:59Z, public PRs only
//  - 3 agent identifiers, 100 PRs each: Copilot coding agent (author app/copilot-swe-agent), Codex cloud (head branch codex/),
//    Claude Code (body contains "Generated with Claude Code")
//  - one draw = a uniformly random minute in the window; take the PRs created in that minute (first 100 by created time),
//    pick one uniformly. Empty minute: redraw. At most 3 PRs per repository.
//  - seeded PRNG (seed + agent index + PRs already saved, so a stopped run resumes); the returned ids
//    are saved in sample-ids.json after every accepted draw
// Usage: node sample.mjs draw     (writes sample-ids.json)
//        node sample.mjs fetch    (writes raw PR json under ../../evidence/S11/, not committed)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IDS = path.join(HERE, 'sample-ids.json');
const RAW = path.join(HERE, '..', '..', 'evidence', 'S11');
const SEED = 20261014;
const START = Date.UTC(2026, 8, 1);
const END = Date.UTC(2026, 9, 13, 23, 59, 0);
const PER_AGENT = 100;
const REPO_CAP = 3;
const AGENTS = [
  { name: 'copilot', q: 'author:app/copilot-swe-agent' },
  { name: 'codex', q: 'head:codex/' },
  { name: 'claude', q: '"Generated with Claude Code" in:body' },
];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gh = (args) => JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

async function draw() {
  const prev = fs.existsSync(IDS) ? JSON.parse(fs.readFileSync(IDS, 'utf8')) : null;
  const out = prev ? prev.sample : [];
  const log = prev ? prev.log : { attempts: 0, empty: 0, capped: 0, backoffs: 0 };
  const save = () => fs.writeFileSync(IDS, JSON.stringify({ seed: SEED, window: [iso(START), iso(END)], perAgent: PER_AGENT, repoCap: REPO_CAP, log, sample: out }, null, 2));
  for (const [ai, agent] of AGENTS.entries()) {
    const have = out.filter((x) => x.agent === agent.name);
    // each agent has its own stream; a resumed run continues from a stream seeded by how many PRs are already saved
    const rnd = mulberry32(SEED + ai + have.length * 7919);
    const perRepo = {};
    for (const h of have) perRepo[h.repo] = (perRepo[h.repo] || 0) + 1;
    let got = have.length;
    let wait = 60000;
    while (got < PER_AGENT) {
      const minute = START + Math.floor(rnd() * Math.floor((END - START) / 60000)) * 60000;
      const q = `is:pr is:public ${agent.q} created:${iso(minute)}..${iso(minute + 59000)}`;
      log.attempts++;
      let res;
      try { res = gh(['-X', 'GET', 'search/issues', '-f', `q=${q}`, '-f', 'per_page=100', '-f', 'sort=created', '-f', 'order=asc']); }
      catch (e) { log.backoffs++; await sleep(wait); wait = Math.min(wait * 2, 600000); continue; }
      wait = 60000;
      await sleep(4000);
      const items = res.items || [];
      if (!items.length) { log.empty++; continue; }
      const it = items[Math.floor(rnd() * items.length)];
      const repo = it.repository_url.replace('https://api.github.com/repos/', '');
      if ((perRepo[repo] || 0) >= REPO_CAP) { log.capped++; continue; }
      if (out.some((x) => x.repo === repo && x.number === it.number)) continue;
      perRepo[repo] = (perRepo[repo] || 0) + 1;
      out.push({ agent: agent.name, repo, number: it.number, created_at: it.created_at, minute_total: res.total_count, state: it.state, draft: it.draft || false });
      got++;
      save();
    }
    console.log(agent.name, 'drawn', got, JSON.stringify(log));
  }
  save();
}

async function fetchRaw() {
  fs.mkdirSync(RAW, { recursive: true });
  const { sample } = JSON.parse(fs.readFileSync(IDS, 'utf8'));
  let n = 0;
  for (const s of sample) {
    const f = path.join(RAW, `${s.repo.replace('/', '__')}__${s.number}.json`);
    if (fs.existsSync(f)) continue;
    const rec = { ...s };
    try {
      rec.pr = gh([`repos/${s.repo}/pulls/${s.number}`]);
      rec.files = gh([`repos/${s.repo}/pulls/${s.number}/files?per_page=100`]);
      const sha = rec.pr.head.sha;
      try { rec.checkRuns = gh([`repos/${s.repo}/commits/${sha}/check-runs?per_page=100`]); } catch (e) { rec.checkRuns = { error: String(e).slice(0, 120) }; }
      try { rec.status = gh([`repos/${s.repo}/commits/${sha}/status`]); } catch (e) { rec.status = { error: String(e).slice(0, 120) }; }
    } catch (e) { rec.error = String(e).slice(0, 200); }
    fs.writeFileSync(f, JSON.stringify(rec));
    if (++n % 25 === 0) console.log('fetched', n);
    await sleep(300);
  }
  console.log('fetch done', n);
}

const cmd = process.argv[2];
if (cmd === 'draw') await draw();
else if (cmd === 'fetch') await fetchRaw();
else console.log('usage: node sample.mjs draw|fetch');
