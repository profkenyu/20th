/**
 * Terra Incognita — single-file build
 *
 *   node tools/build.mjs
 *
 * Produces dist/TERRA_INCOGNITA.html: one document, zero network requests at
 * runtime, which is the format every work in the practice ships in.
 *
 * Steps
 *   1. vendor three.webgpu.js + three.tsl.js into vendor/ (cached)
 *   2. flip config.js's DEV flag off in a temporary copy
 *   3. esbuild bundles src/main.js with `three` aliased to the vendored files
 *   4. inline the bundle into the shell document
 *
 * Fonts: the shell currently links Google Fonts. Before the exhibition build
 * is final, base64 the two woff2 subsets into the stylesheet — see README,
 * Phase 5 checklist. A gallery machine cannot be assumed to have a network.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, cp, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_VERSION = '0.185.1';
const CDN = `https://unpkg.com/three@${THREE_VERSION}/build`;
const JSM = `https://unpkg.com/three@${THREE_VERSION}/examples/jsm`;

/* Post-processing lives in the addons, not the core build. DepthOfFieldNode
   imports GaussianBlurNode relatively, so the directory layout is preserved
   verbatim and the relative import resolves without any rewriting. */
const ADDONS = [
  'tsl/display/BloomNode.js',
  'tsl/display/DepthOfFieldNode.js',
  'tsl/display/GaussianBlurNode.js',
];

const exists = async p => access(p).then(() => true, () => false);

async function grab(url, dest) {
  if (await exists(dest)) { console.log(`· cached  ${dest.replace(ROOT + '/', '')}`); return; }
  console.log(`· fetch   ${url.split('/').slice(-2).join('/')}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function vendor() {
  await mkdir(`${ROOT}/vendor`, { recursive: true });
  for (const f of ['three.webgpu.js', 'three.tsl.js', 'three.core.js']) {
    await grab(`${CDN}/${f}`, `${ROOT}/vendor/${f}`);
  }
  for (const f of ADDONS) {
    await grab(`${JSM}/${f}`, `${ROOT}/vendor/addons/${f}`);
  }
}

const WORK = process.argv[2] ?? 'terra_incognita';

async function main() {
  await vendor();

  /* production copy of the engine and the works, with DEV stripped */
  const tmp = `${ROOT}/.build`;
  await rm(tmp, { recursive: true, force: true });
  await cp(`${ROOT}/engine`, `${tmp}/engine`, { recursive: true });
  await cp(`${ROOT}/works`, `${tmp}/works`, { recursive: true });
  const cfgPath = `${tmp}/engine/config.js`;
  const cfg = await readFile(cfgPath, 'utf8');
  await writeFile(cfgPath, cfg.replace('export const DEV = true;', 'export const DEV = false;'));

  const out = await build({
    entryPoints: [`${tmp}/works/${WORK}/main.js`],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    /* Identifier mangling is OFF, deliberately.
       With it on, esbuild's name allocator eventually emits `$` — and three's
       own bundle already declares a top-level `$`. The two land in the same
       module scope and the file dies at parse time with
       `Identifier '$' has already been declared`, before a single line runs.
       It only appeared once the engine grew enough symbols to push the
       allocator that far, which is the worst kind of bug: latent, and
       triggered by unrelated growth.
       Whitespace and syntax minification are kept; they carry most of the
       size win and rename nothing. */
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    charset: 'utf8',        // keep the Korean captions readable, not \uXXXX
    legalComments: 'none',
    write: false,
    plugins: [{
      /* esbuild's `alias` matches whole package names only, so the
         `three/addons/` prefix needs a resolver. */
      name: 'three-local',
      setup(b) {
        const core = `${ROOT}/vendor/three.webgpu.js`;
        b.onResolve({ filter: /^three$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/webgpu$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/tsl$/ }, () => ({ path: `${ROOT}/vendor/three.tsl.js` }));
        b.onResolve({ filter: /^three\/addons\// }, args => ({
          path: `${ROOT}/vendor/addons/${args.path.slice('three/addons/'.length)}`,
        }));
      },
    }],
  });

  const js = out.outputFiles[0].text;
  const shell = await readFile(`${ROOT}/works/${WORK}/dev.html`, 'utf8');

  /* fonts are a stylesheet link in dev and must become inline in the build,
     or the gallery file would still reach for the network */
  const fontCss = await readFile(`${ROOT}/engine/fonts.css`, 'utf8');

  const html = shell
    .replace('<link rel="stylesheet" href="../../engine/fonts.css">', `<style>\n${fontCss}\n</style>`)
    .replace(/\n?\s*<script type="importmap">[\s\S]*?<\/script>/, '')
    .replace(
      /<script type="module" src="\.\/main\.js"><\/script>/,
      `<script type="module">\n${js}\n</script>`
    );

  /* Two destinations, on purpose:
       index.html                 — the root file, opens on a double click
       dist/TERRA_INCOGNITA.html  — the named copy for the exhibition archive
     `dev.html` is the modular entry and REQUIRES a server; file:// blocks
     module fetches. The root file has no fetches at all, so it does not. */
  await mkdir(`${ROOT}/dist`, { recursive: true });
  const name = WORK.toUpperCase();
  await writeFile(`${ROOT}/works/${WORK}/index.html`, html);
  await writeFile(`${ROOT}/dist/${name}.html`, html);
  if (WORK === 'terra_incognita') await writeFile(`${ROOT}/index.html`, html);
  await rm(tmp, { recursive: true, force: true });

  /* THE BUILD MUST NEVER EMIT A FILE THAT DOES NOT PARSE.
     Cheap, absolute, and it would have caught the `$` collision the moment it
     appeared instead of at the gallery. */
  try {
    new (await import('node:vm')).SourceTextModule(js);
  } catch (e) {
    console.error(`\n✗ the bundle does not parse: ${e.message}`);
    process.exit(1);
  }

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`\n✓ ${WORK} — ${kb} KB, self-contained`);
  console.log('  open index.html directly — no server needed');
  if (Number(kb) < 600) console.warn('  ! smaller than expected — is three actually inlined?');
}

main().catch(e => { console.error(e); process.exit(1); });
