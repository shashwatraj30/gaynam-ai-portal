// Static analysis (CONTRACT.md rules): no innerHTML assignment, eval, document.write, setAttribute('style'),
// and no raw hex colours in css/ outside tokens.css. Comments are stripped before scanning.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out); else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}
// Strip block comments and whole-line // comments (keeps URLs inside strings intact).
function stripJs(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
function stripCss(src) { return src.replace(/\/\*[\s\S]*?\*\//g, ''); }
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const JS_RULES = [
  ['innerHTML assignment', /\.(?:inner|outer)HTML\s*(?:\+?=(?!=))/],
  ['insertAdjacentHTML', /\.insertAdjacentHTML\s*\(/],
  ['eval(', /(?<![\w.$])eval\s*\(/],
  ['new Function(', /new\s+Function\s*\(/],
  ['document.write', /document\.write(?:ln)?\s*\(/],
  ["setAttribute('style'", /setAttribute\(\s*['"`]style['"`]/],
  ['inline on* handler attribute', /setAttribute\(\s*['"`]on[a-z]+['"`]/],
];

test('js/ has no forbidden constructs', () => {
  const bad = [];
  for (const f of walk(path.join(ROOT, 'js'), '.js')) {
    const src = stripJs(fs.readFileSync(f, 'utf8'));
    for (const [name, re] of JS_RULES) if (re.test(src)) bad.push(`${rel(f)}: ${name}`);
  }
  assert.deepEqual(bad, []);
});

test('css/ has no raw hex colours outside tokens.css', () => {
  const bad = [];
  for (const f of walk(path.join(ROOT, 'css'), '.css')) {
    if (path.basename(f) === 'tokens.css') continue;
    const m = stripCss(fs.readFileSync(f, 'utf8')).match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g);
    if (m) bad.push(`${rel(f)}: ${[...new Set(m)].join(' ')}`);
  }
  assert.deepEqual(bad, []);
});

test('index.html has no inline script, style or handlers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/<style[\s>]/i.test(html));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/\son[a-z]+\s*=/i.test(html));
});
