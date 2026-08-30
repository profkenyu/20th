/**
 * VERIFY — everything that can be checked without a GPU.
 *
 *   npm run verify
 *
 * The first check exists because of a real bug that shipped: `rebuild()` wrote
 * to a `const` declared below the line that called it. Declarations hoist,
 * initialisations do not, so it threw `Cannot access 'rc' before
 * initialization` on every machine that had a WebGPU adapter — and inside a
 * top-level-await module that is an unhandled rejection, so the only symptom
 * was a black screen. No amount of construction testing on a machine without
 * an adapter could see it, because the adapter gate stopped first.
 *
 * A class of bug that costs a day is worth twenty lines of parser.
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (t, d = '') => console.log(`  ✓ ${t.padEnd(52)} ${d}`);
const bad = (t, d = '') => { fail++; console.log(`  ✗ ${t.padEnd(52)} ${d}`); };

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (['.js', '.mjs'].includes(extname(e.name))) out.push(p);
  }
  return out;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/* Documentation in this project contains example import statements. Scanning
   them as if they were code reported a missing module in engine/index.js —
   a false positive that would have trained everyone to ignore the verifier. */
const stripComments = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

/* ── 1. boot order: no top-level call may touch a later const/let ──────────
   Written twice. The first version looked for a call at the start of a line
   and therefore missed `try { await rebuild(); }` — which is exactly how the
   real bug was written. A checker that does not catch the bug it was written
   for is worse than none, so this version marks every function body in the
   file and treats any call outside all of them as module-evaluation time. */

function functionBodies(src) {
  const ranges = [];
  const opens = [
    /(?:async\s+)?function\s*[\w$]*\s*\([^)]*\)\s*\{/g,   // declarations and expressions
    /\([^()]*\)\s*=>\s*\{/g,                                // (a, b) => {
    /[\w$]+\s*=>\s*\{/g,                                     // x => {
  ];
  for (const re of opens) {
    for (const m of src.matchAll(re)) {
      const i = src.indexOf('{', m.index + m[0].length - 1);
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      ranges.push([i, j]);
    }
  }
  return ranges;
}

async function bootOrder(file) {
  const src = stripComments(await readFile(file, 'utf8'));
  const bodies = functionBodies(src);
  const inBody = i => bodies.some(([a, b]) => i > a && i < b);

  const decls = new Map();
  for (const m of src.matchAll(/^(?:const|let|var)\s+([\w$]+)/gm))
    if (!decls.has(m[1])) decls.set(m[1], m.index);
  for (const m of src.matchAll(/^(?:const|let|var)\s+\{([^}]*)\}/gm))
    for (const n of m[1].split(',')) {
      const k = n.trim().split(':').pop().trim();
      if (k && !decls.has(k)) decls.set(k, m.index);
    }

  const fns = new Map();
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)\s*\([^)]*\)\s*\{/gm)) {
    const i = src.indexOf('{', m.index);
    let depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    fns.set(m[1], src.slice(i, j));
  }

  let issues = 0;
  for (const [name, body] of fns) {
    /* the earliest module-evaluation-time call of this function, anywhere */
    let callAt = Infinity;
    for (const m of src.matchAll(new RegExp(`(?<![.\\w$])${name}\\s*\\(`, 'g'))) {
      /* the declaration's own header is not a call site */
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 14), m.index))) continue;
      if (!inBody(m.index) && m.index < callAt) callAt = m.index;
    }
    if (callAt === Infinity) continue;

    const locals = new Set([...body.matchAll(/(?:const|let|var)\s+([\w$]+)/g)].map(m => m[1]));
    for (const [id, declAt] of decls) {
      if (locals.has(id) || declAt <= callAt) continue;
      if (!new RegExp(`\\b${id}\\b`).test(body)) continue;
      bad(`boot order in ${name}()`,
          `reads '${id}' (declared line ${lineOf(src, declAt)}) but runs at line ${lineOf(src, callAt)}` +
          `  →  ${src.split('\n')[lineOf(src, callAt) - 1].trim().slice(0, 60)}`);
      issues++;
    }
  }
  if (!issues) ok(`boot order · ${file.replace(ROOT + '/', '')}`, 'no top-level call reaches a later binding');
}

/* ── 2. every imported symbol exists ─────────────────────────────────────── */
async function imports() {
  const pools = {};
  for (const [spec, f] of [['three', 'three.webgpu.js'], ['three/tsl', 'three.tsl.js']]) {
    try {
      const src = await readFile(`${ROOT}/vendor/${f}`, 'utf8');
      const set = new Set();
      for (const blk of src.match(/export \{[^}]*\}/g) ?? [])
        for (const n of blk.replace('export {', '').replace('}', '').split(','))
          set.add(n.trim().split(' as ').pop().trim());
      pools[spec] = set;
    } catch { /* vendor not fetched yet */ }
  }
  if (!pools['three']) { ok('external imports', 'skipped — run npm run build once to vendor three'); return; }
  pools['three/webgpu'] = pools['three'];

  let issues = 0;
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)]) {
    const src = stripComments(await readFile(f, 'utf8'));
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const names = m[1].split(',').map(x => x.trim().split(' as ')[0].trim()).filter(Boolean);
      const spec = m[2];
      if (pools[spec]) {
        const miss = names.filter(n => !pools[spec].has(n));
        if (miss.length) { bad(`import from '${spec}'`, `${f.split('/').pop()}: ${miss}`); issues++; }
      } else if (spec.startsWith('.')) {
        const target = resolve(dirname(f), spec);
        const tsrc = await readFile(target, 'utf8').catch(() => null);
        if (tsrc === null) { bad('local import', `${f.split('/').pop()} → ${spec} missing`); issues++; continue; }
        for (const n of names) {
          const re = new RegExp(`export\\s+(?:async\\s+)?(?:const|let|function|class)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`);
          if (!re.test(tsrc)) { bad('local import', `${f.split('/').pop()} imports '${n}' from ${spec}`); issues++; }
        }
      }
    }
    for (const n of new Set([...src.matchAll(/THREE\.([\w$]+)/g)].map(m => m[1]))) {
      if (n !== 'TimestampQuery' && !pools['three'].has(n)) { bad('THREE symbol', `${f.split('/').pop()}: THREE.${n}`); issues++; }
    }
  }
  if (!issues) ok('every imported symbol resolves', 'three, three/tsl and local modules');
}

/* ── 2b. every cfg() key an engine module reads must exist in defaults() ───
   Added after a silent failure: a patch that was supposed to insert an
   `ejecta` block into defaults() matched nothing, wrote nothing, reported
   nothing, and the module then threw on `cfg().ejecta.history`. A config key
   that does not exist is a crash at construction time, which on a machine with
   an adapter means a black screen. This is two minutes of parsing against
   that. */
async function configKeys() {
  const src = await readFile(`${ROOT}/engine/config.js`, 'utf8');
  const body = src.slice(src.indexOf('export function defaults'));
  const declared = new Set([...body.matchAll(/^\s{4}(\w+):/gm)].map(m => m[1]));
  /* computed by configure(), not present in the defaults literal */
  for (const k of ['snap']) declared.add(k);

  const used = new Set();
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)])
    for (const m of stripComments(await readFile(f, 'utf8')).matchAll(/cfg\(\)\.(\w+)/g))
      used.add(m[1]);

  const missing = [...used].filter(k => !declared.has(k));
  missing.length ? bad('cfg() keys', `read but never defaulted: ${missing.join(', ')}`)
                 : ok('every cfg() key exists in defaults()', `${used.size} keys read`);
}

/* ── 2c. nothing the engine exports may go unexercised ─────────────────────
   Added after the wheel-ejecta system was removed. It was a complete engine
   module — compute pass, geometry, config block, harness step — that had never
   been SEEN, because the development container has no WebGPU adapter and every
   grain was a sub-pixel sprite past twenty metres. Unexercised code in a shared
   engine is worse than no code: it looks like a capability, it rots quietly,
   and nobody notices until a later work leans on it.

   An export is exercised if any work imports it or any other engine module
   uses it. Anything else is either dead or waiting to be. */
async function unexercised() {
  const idx = await readFile(`${ROOT}/engine/index.js`, 'utf8');
  const exported = new Set();
  for (const m of stripComments(idx).matchAll(/export\s*\{([^}]*)\}/g))
    for (const n of m[1].split(',')) {
      const k = n.trim().split(' as ').pop().trim();
      if (k) exported.add(k);
    }

  const used = new Set();
  const files = [...await walk(`${ROOT}/works`), ...await walk(`${ROOT}/engine`)];
  for (const f of files) {
    if (f.endsWith('/index.js') && f.includes('/engine/')) continue;
    const src = stripComments(await readFile(f, 'utf8'));
    for (const n of exported) if (new RegExp(`\\b${n}\\b`).test(src)) used.add(n);
  }
  /* the harness drives the engine too, and counts */
  const h = stripComments(await readFile(`${ROOT}/tools/harness.html`, 'utf8'));
  for (const n of exported) if (new RegExp(`\\b${n}\\b`).test(h)) used.add(n);

  const dead = [...exported].filter(n => !used.has(n));
  dead.length ? bad('unexercised engine exports', dead.join(', '))
              : ok('every engine export is exercised', `${exported.size} exports`);
}

/* ── 2d. imports that nothing uses ─────────────────────────────────────────
   Cheap, and it catches rot. An import left behind after a rewrite is a claim
   about what a module depends on, and a false one — it makes the dependency
   graph wider than it is and survives every refactor because nothing breaks. */
async function staleImports() {
  let issues = 0;
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)]) {
    const raw = await readFile(f, 'utf8');
    const src = stripComments(raw);
    const body = src.replace(/^import[^;]*;$/gm, '');
    const dead = [];
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g))
      for (const n of m[1].split(',')) {
        const k = n.trim().split(' as ').pop().trim();
        if (k && !new RegExp(`\\b${k}\\b`).test(body)) dead.push(k);
      }
    if (dead.length) { bad('unused import', `${f.split('/').slice(-2).join('/')}: ${dead.join(', ')}`); issues++; }
  }
  if (!issues) ok('no unused imports', 'the dependency graph is honest');
}

/* ── 3. HUD wiring, key collisions, pointer-blocking overlays ────────────── */
async function ui() {
  const files = [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)];
  const srcs = Object.fromEntries(await Promise.all(files.map(async f => [f, await readFile(f, 'utf8')])));
  const all = Object.values(srcs).join('\n');

  const declared = new Set([
    ...[...all.matchAll(/\['(\w+)',\s*'[^']*'\]/g)].map(m => m[1]),
    ...[...all.matchAll(/data-v="(\w+)"/g)].map(m => m[1]),
  ]);
  const used = new Set([...all.matchAll(/hud\.set\('(\w+)'/g)].map(m => m[1]));
  const orphan = [...declared].filter(k => !used.has(k) && used.size);
  const noop = [...used].filter(k => !declared.has(k));
  noop.length ? bad('HUD wiring', `set but never declared: ${noop}`)
              : ok('HUD wiring', `${used.size} fields set, ${orphan.length} unused rows`);

  const binds = {};
  for (const [f, s] of Object.entries(srcs))
    for (const m of s.matchAll(/e\.code\s*===\s*'(\w+)'/g)) (binds[m[1]] ??= new Set()).add(f.split('/').pop());
  /* rover and walker are alternative vehicles — a work mounts one of them, so
     sharing a key between the two is not a collision. */
  const vehicles = new Set(['rover.js', 'walker.js']);
  const clash = Object.entries(binds).filter(([, v]) =>
    [...v].filter(f => !vehicles.has(f)).length + (([...v].some(f => vehicles.has(f))) ? 1 : 0) > 1);
  clash.length ? bad('key bindings', clash.map(([k, v]) => `${k}: ${[...v]}`).join(' · '))
               : ok('key bindings', `${Object.keys(binds).length} keys, no collisions`);

  const blockers = [];
  for (const m of all.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)) {
    const body = m[2].replace(/\s/g, '');
    if (body.includes('position:fixed') && !body.includes('pointer-events:none')) blockers.push(m[1]);
  }
  /* The transfer control is the one deliberate fixed interactive overlay. */
  const allowed = ['gl', 'fh-watchdog', 'ti-transfer-trigger'];
  const bad_ = blockers.filter(b => !allowed.includes(b));
  bad_.length ? bad('overlays swallow the pointer', bad_.join(', '))
              : ok('overlays are pointer-transparent', `except ${allowed.join(' and ')}, correctly`);
}

/* ── 4. the built file is genuinely self-contained ───────────────────────── */
async function build() {
  const html = await readFile(`${ROOT}/index.html`, 'utf8').catch(() => null);
  if (!html) { ok('built file', 'skipped — run npm run build'); return; }
  const refs = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)|url\((https?:\/\/[^)]+)/g)];
  refs.length ? bad('built file fetches', refs.map(m => m[1] ?? m[2]).join(' ')) 
              : ok('built file is self-contained', `${(html.length / 1024).toFixed(0)} KB, 0 external refs`);
  const faces = (html.match(/@font-face/g) ?? []).length;
  faces >= 6 ? ok('fonts inlined', `${faces} faces, ${(html.match(/data:font\/woff2/g) ?? []).length} base64`)
             : bad('fonts inlined', `only ${faces} @font-face`);

  /* every Korean glyph drawn must be in the generated subset */
  const css = await readFile(`${ROOT}/engine/fonts.css`, 'utf8').catch(() => '');
  const subset = new Set((css.match(/SUBSET: (.+)/)?.[1] ?? '').split(''));
  const used = new Set();
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)])
    for (const ch of await readFile(f, 'utf8')) if (ch >= '\uac00' && ch <= '\ud7a3') used.add(ch);
  const missing = [...used].filter(c => !subset.has(c));
  missing.length ? bad('Korean subset is stale', `${missing.length} glyphs missing: ${missing.join('')} — run npm run fonts`)
                 : ok('Korean subset covers every glyph drawn', `${used.size} syllables`);
}

console.log('══ VERIFY ══\n');
for (const f of await walk(`${ROOT}/works`)) if (f.endsWith('main.js')) await bootOrder(f);
await imports();
await configKeys();
await unexercised();
await staleImports();
await ui();
await build();
console.log(fail ? `\n✗ ${fail} problem(s)` : '\n✓ PASS');
process.exit(fail ? 1 : 0);
