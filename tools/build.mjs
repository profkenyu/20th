import { build } from "esbuild";
import { mkdir, readFile, writeFile, rm, cp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = process.argv[2] ?? "terra_incognita";
async function main() {
  const tmp = `${ROOT}/.build`;
  await rm(tmp, { recursive: true, force: true });
  await cp(`${ROOT}/engine`, `${tmp}/engine`, { recursive: true });
  await cp(`${ROOT}/works`, `${tmp}/works`, { recursive: true });
  const cfgPath = `${tmp}/engine/config.js`;
  const cfg = await readFile(cfgPath, "utf8");
  await writeFile(cfgPath, cfg.replace("export const DEV = true;", "export const DEV = false;"));
  const out = await build({
    entryPoints: [`${tmp}/works/${WORK}/main.js`],
    bundle: true,
    format: "esm",
    target: "es2022",
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    charset: "utf8",
    legalComments: "none",
    write: false,
    plugins: [{
      name: "three-local",
      setup(b) {
        const threeRoot = `${ROOT}/node_modules/three`;
        const core = `${threeRoot}/build/three.webgpu.js`;
        b.onResolve({ filter: /^three$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/webgpu$/ }, () => ({ path: core }));
        b.onResolve({ filter: /^three\/tsl$/ }, () => ({ path: `${threeRoot}/build/three.tsl.js` }));
        b.onResolve({ filter: /^three\/addons\// }, (args) => ({
          path: `${threeRoot}/examples/jsm/${args.path.slice("three/addons/".length)}`
        }));
      }
    }]
  });
  const js = out.outputFiles[0].text;
  const shell = await readFile(`${ROOT}/works/${WORK}/dev.html`, "utf8");
  const fontCss = await readFile(`${ROOT}/engine/fonts.css`, "utf8");
  const html = shell.replace('<link rel="stylesheet" href="../../engine/fonts.css">', `<style>
${fontCss}
</style>`).replace(/\n?\s*<script type="importmap">[\s\S]*?<\/script>/, "").replace(
    /<script type="module" src="\.\/main\.js"><\/script>/,
    `<script type="module">
${js}
<\/script>`
  );
  try {
    new (await import("node:vm")).SourceTextModule(js);
  } catch (e) {
    throw new Error(`the bundle does not parse: ${e.message}`);
  }
  if (/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html) || /<script\s+type=["']importmap["']/i.test(html)) {
    throw new Error("the exhibition candidate still contains a network dependency");
  }
  await mkdir(`${ROOT}/dist`, { recursive: true });
  const name = WORK.toUpperCase();
  const digest = createHash("sha256").update(html).digest("hex");
  await writeFile(`${ROOT}/works/${WORK}/index.html`, html);
  await writeFile(`${ROOT}/dist/${name}.html`, html);
  await writeFile(`${ROOT}/dist/${name}.html.sha256`, `${digest}  ${name}.html
`);
  if (WORK === "terra_incognita") await writeFile(`${ROOT}/index.html`, html);
  await rm(tmp, { recursive: true, force: true });
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`
\u2713 ${WORK} \u2014 ${kb} KB, self-contained`);
  console.log(`  sha256 ${digest}`);
  console.log("  open index.html directly \u2014 no server needed");
  if (Number(kb) < 600) console.warn("  ! smaller than expected \u2014 is three actually inlined?");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
