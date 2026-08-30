/**
 * Terra Incognita — single-file build
 *
 *   node tools/build.mjs
 *
 * Produces dist/TERRA_INCOGNITA.html: one document, zero network requests at
 * runtime, which is the format every work in the practice ships in.
 *
 * Steps
 *   1. read exact-pinned Three.js and Anime.js from node_modules
 *   2. flip config.js's DEV flag off in a temporary copy
 *   3. esbuild bundles the work with local package files only
 *   4. inline the bundle and emit a SHA-256 archive checksum
 *
 * Fonts: the shell currently links Google Fonts. Before the exhibition build
 * is final, base64 the two woff2 subsets into the stylesheet — see README,
 * Phase 5 checklist. A gallery machine cannot be assumed to have a network.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = process.argv[2] ?? 'terra_incognita';

async function main() {
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
        const threeRoot = `${ROOT}/node_modules/three`;
        const core = `${threeRoot}/build/three.webgpu.js`;
        b.onResolve({ filter: /^three$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/webgpu$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/tsl$/ }, () => ({ path: `${threeRoot}/build/three.tsl.js` }));
        b.onResolve({ filter: /^three\/addons\// }, args => ({
          path: `${threeRoot}/examples/jsm/${args.path.slice('three/addons/'.length)}`,
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

  /* Validate the candidate before replacing any exhibition artifact. */
  try {
    new (await import('node:vm')).SourceTextModule(js);
  } catch (e) {
    throw new Error(`the bundle does not parse: ${e.message}`);
  }
  if (/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html)
      || /<script\s+type=["']importmap["']/i.test(html)) {
    throw new Error('the exhibition candidate still contains a network dependency');
  }

  /* Two destinations, on purpose:
       index.html                 — the root file, opens on a double click
       dist/TERRA_INCOGNITA.html  — the named copy for the exhibition archive
     `dev.html` is the modular entry and REQUIRES a server; file:// blocks
     module fetches. The root file has no fetches at all, so it does not. */
  await mkdir(`${ROOT}/dist`, { recursive: true });
  const name = WORK.toUpperCase();
  const digest = createHash('sha256').update(html).digest('hex');
  await writeFile(`${ROOT}/works/${WORK}/index.html`, html);
  await writeFile(`${ROOT}/dist/${name}.html`, html);
  await writeFile(`${ROOT}/dist/${name}.html.sha256`, `${digest}  ${name}.html\n`);
  if (WORK === 'terra_incognita') await writeFile(`${ROOT}/index.html`, html);
  await rm(tmp, { recursive: true, force: true });

  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`\n✓ ${WORK} — ${kb} KB, self-contained`);
  console.log(`  sha256 ${digest}`);
  console.log('  open index.html directly — no server needed');
  if (Number(kb) < 600) console.warn('  ! smaller than expected — is three actually inlined?');
}

main().catch(e => { console.error(e); process.exit(1); });
