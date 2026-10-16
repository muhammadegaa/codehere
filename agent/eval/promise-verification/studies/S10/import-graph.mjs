#!/usr/bin/env node
// Walks the import graph from a start file and reports network-capable lines in every reachable source file.
// usage: node import-graph.mjs <src-root> <start-file>   (run from the package root)
import fs from 'node:fs';
import path from 'node:path';

const [, , , start] = process.argv;
const NET = /\bfetch\(|node:https?|from 'https?'|node:net\b|node:dns|node:tls|XMLHttpRequest|undici|axios|node-fetch|WebSocket|new Socket|\.connect\(/;
const seen = new Set();
const q = [start];
const hits = [];
const ext = new Set();
while (q.length) {
  const f = q.pop();
  if (seen.has(f) || !fs.existsSync(f)) continue;
  seen.add(f);
  const t = fs.readFileSync(f, 'utf8');
  t.split('\n').forEach((l, i) => {
    if (NET.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 110)}`);
  });
  for (const m of t.matchAll(/from '([^']+)'/g)) {
    if (m[1].startsWith('.')) {
      let p = path.join(path.dirname(f), m[1]).replace(/\.js$/, '.ts');
      if (!fs.existsSync(p) && fs.existsSync(p.replace(/\.ts$/, '/index.ts'))) p = p.replace(/\.ts$/, '/index.ts');
      q.push(p);
    } else ext.add(m[1]);
  }
}
console.log('files reachable from', start + ':', seen.size);
console.log('network-capable lines in them:', hits.length);
hits.slice(0, 12).forEach((h) => console.log('  ', h));
console.log('external and node modules imported:', [...ext].sort().join(', '));
