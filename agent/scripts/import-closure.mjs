#!/usr/bin/env node
// Which files under src/ (or test/) are reachable from the given entry files, following static imports,
// re-exports and dynamic import() with a string literal. Used to size the `check` slim-down (docs/gates/SLIM-PLAN.md).
//   node scripts/import-closure.mjs <entry.ts> [<entry.ts> ...]            reachable src files with line counts, then unreachable ones
//   node scripts/import-closure.mjs --tests <entry.ts> [...]               also classify each test file: imports only reachable src files or not
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const withTests = args[0] === '--tests';
const entries = (withTests ? args.slice(1) : args).map((e) => path.resolve(ROOT, e));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const lines = (f) => (fs.readFileSync(f, 'utf8').match(/\n/g) || []).length;

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  const cands = [base.replace(/\.js$/, '.ts'), base + '.ts', base.replace(/\.js$/, '.tsx'), path.join(base, 'index.ts'), base.replace(/\.js$/, '.mjs'), base];
  return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

const cache = new Map();
const externals = new Set();
function importsOf(file) {
  if (cache.has(file)) return cache.get(file);
  const out = new Set();
  if (/\.(ts|tsx|mts)$/.test(file)) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (n) => {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.add(n.moduleSpecifier.text);
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.add(n.arguments[0].text);
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  for (const s of out) if (!s.startsWith('.') && !s.startsWith('node:')) externals.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
  const res = [...out].map((s) => resolveImport(file, s)).filter(Boolean);
  cache.set(file, res);
  return res;
}

function closure(starts) {
  const seen = new Set(), stack = [...starts];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); for (const d of importsOf(f)) stack.push(d); }
  return seen;
}

const reach = closure(entries);
const srcFiles = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const rel = (f) => path.relative(ROOT, f);
const keep = srcFiles.filter((f) => reach.has(f)), drop = srcFiles.filter((f) => !reach.has(f));
const sum = (fs_) => fs_.reduce((a, f) => a + lines(f), 0);
console.log(`entries: ${entries.map(rel).join(', ')}`);
console.log(`reachable src files: ${keep.length}, ${sum(keep)} lines; not reachable: ${drop.length}, ${sum(drop)} lines; src total ${srcFiles.length} files, ${sum(srcFiles)} lines`);
console.log('\nREACHABLE'); for (const f of keep.sort()) console.log(`${lines(f)}\t${rel(f)}`);
console.log('\nEXTERNAL PACKAGES imported by the reachable files (node builtins excluded):', [...externals].sort().join(', ') || '(none)');
const byDir = {};
for (const f of drop) { const d = path.relative(path.join(ROOT, 'src'), f).split(path.sep).slice(0, 3).join('/'); byDir[d] = byDir[d] || { files: 0, lines: 0 }; byDir[d].files++; byDir[d].lines += lines(f); }
console.log('\nNOT REACHABLE, by directory (up to 3 levels)'); for (const [d, v] of Object.entries(byDir).sort((a, b) => b[1].lines - a[1].lines)) console.log(`${v.lines}\t${v.files} files\t${d}`);

if (withTests) {
  const tests = walk(path.join(ROOT, 'test')).filter((f) => /\.test\.(ts|mjs)$/.test(f));
  let stay = [], go = [], none = [];
  for (const t of tests) {
    const c = [...closure([t])].filter((f) => f.startsWith(path.join(ROOT, 'src')));
    if (!c.length) { none.push(t); continue; }
    const direct = importsOf(t).filter((f) => f.startsWith(path.join(ROOT, 'src')) && !reach.has(f));
    (c.every((f) => reach.has(f)) ? stay : go).push({ t, off: c.filter((f) => !reach.has(f)).length, direct: (direct.length ? direct : c.filter((f) => !reach.has(f))).slice(0, 2).map(rel) });
  }
  console.log(`\nTESTS: ${tests.length} files. Import only reachable src files: ${stay.length} (${stay.reduce((a, x) => a + lines(x.t), 0)} lines). Import at least one unreachable file: ${go.length} (${go.reduce((a, x) => a + lines(x.t), 0)} lines). Import no src file (run the CLI, scripts or read files): ${none.length}`);
  fs.writeFileSync(process.env.TEST_REPORT || '/dev/null', JSON.stringify({ stay: stay.map((x) => rel(x.t)), go: go.map((x) => ({ file: rel(x.t), lines: lines(x.t), unreachableImports: x.off, because: x.direct })), none: none.map(rel) }, null, 1));
}
