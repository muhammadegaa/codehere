#!/usr/bin/env node
// S11 labeler 2: qwen3-coder:30b through local ollama. Prompt = RUBRIC.md verbatim + one packet.
// Settings fixed: temperature 0, seed 7, num_ctx 16384, JSON output. Resumable (skips finished ids).
// Output: ../../evidence/S11/labels/qwen/<id>.json (gitignored)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PK = path.join(HERE, '../../evidence/S11/packets');
// usage: node label-qwen.mjs [model] [limit]    (default model qwen3-coder:30b, output dir labels/qwen; other models go to labels/<name>)
const MODEL = process.argv[2] || 'qwen3-coder:30b';
const LIMIT = Number(process.argv[3]) || Infinity;
const OUT = path.join(HERE, '../../evidence/S11/labels', MODEL === 'qwen3-coder:30b' ? 'qwen' : MODEL.replace(/[^\w.-]/g, '_'));
fs.mkdirSync(OUT, { recursive: true });
const rubric = fs.readFileSync(path.join(HERE, 'RUBRIC.md'), 'utf8');

const ids = fs.readdirSync(PK).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')).sort().slice(0, LIMIT);
let done = 0;
for (const id of ids) {
  const out = path.join(OUT, `${id}.json`);
  if (fs.existsSync(out)) continue;
  const packet = fs.readFileSync(path.join(PK, `${id}.txt`), 'utf8');
  const prompt = `${rubric}\n\n---\n\nPacket to label:\n\n${packet}\n\nAnswer with the JSON object only.`;
  const t0 = Date.now();
  let rec;
  try {
    let j, parsed = null, tries = 0;
    do {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json', options: { temperature: 0, seed: 7, num_ctx: 16384 } }),
      });
      j = await res.json();
      parsed = null;
      try { parsed = JSON.parse(j.response); } catch { /* retry below */ }
      if (!parsed) await new Promise((r) => setTimeout(r, 5000 * ++tries));
    } while (!parsed && tries < 3);
    rec = { id, model: MODEL, parsed, raw: j.response, serverError: j.error, tries, ms: Date.now() - t0, prompt_tokens: j.prompt_eval_count };
  } catch (e) {
    rec = { id, model: MODEL, error: String(e).slice(0, 200) };
  }
  fs.writeFileSync(out, JSON.stringify(rec));
  if (++done % 10 === 0) console.log('labeled', done, 'of', ids.length);
}
console.log('qwen done', done);
