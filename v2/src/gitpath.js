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

// Reads a unified diff one line at a time and says whether the line is in a hunk, counting the lines its
// header announced (@@ -3,2 +3,0 @@). In a hunk, an added "++ n;" reads "+++ n;" and a removed "-- seed"
// reads "--- seed": they are lines of the file, never the next file's header (cold review, L13 round 5).
export function hunkReader() {
  let old = 0;
  let now = 0;
  return (line) => {
    if (old > 0 || now > 0) {
      const c = line[0];
      if (c === '\\') return true;
      if (c === '-' && old > 0) return old--, true;
      if (c === '+' && now > 0) return now--, true;
      if (c === ' ' && old > 0 && now > 0) return old--, now--, true;
      old = now = 0; // the line does not fit the counts: the hunk has ended
    }
    const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
    if (m) [old, now] = [m[1] === undefined ? 1 : +m[1], m[2] === undefined ? 1 : +m[2]];
    return false;
  };
}
