// Git writes a path that holds a tab, newline, quote, backslash or (by default) a non-ASCII character
// C-quoted and escaped: "test/caf\303\251.test.js". This gives the path back as it is on disk.
export function unquotePath(p) {
  if (p.length < 2 || p[0] !== '"' || p.at(-1) !== '"') return p;
  const s = p.slice(1, -1);
  const named = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  const parts = [];
  const re = /\\([0-7]{3}|.)/g;
  let at = 0;
  for (let m; (m = re.exec(s)); at = re.lastIndex) {
    parts.push(Buffer.from(s.slice(at, m.index)));
    const c = m[1];
    parts.push(Buffer.from([c.length === 3 ? parseInt(c, 8) : (named[c] ?? c.charCodeAt(0))]));
  }
  parts.push(Buffer.from(s.slice(at)));
  return Buffer.concat(parts).toString('utf8');
}
