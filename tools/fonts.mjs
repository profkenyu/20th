import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
const NOTO_SUBSET_FONT = `${ROOT}/engine/noto-sans-kr-subset.woff2`;
const NOTO_SUBSET_TEXT = `${ROOT}/engine/noto-sans-kr-subset.txt`;
const GENERATED_HTML = new Set([
  `${ROOT}/works/terra_incognita/index.html`,
  `${ROOT}/works/terra_incognita/field-archive.html`
]);
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
async function usedCharacters() {
  const files = [
    ...await walk(`${ROOT}/engine`),
    ...await walk(`${ROOT}/works`),
    ...await walk(`${ROOT}/tools`)
  ].filter((file) => !GENERATED_HTML.has(file));
  const set = new Set();
  for (const f of files) {
    for (const ch of await readFile(f, "utf8")) {
      if (ch.codePointAt(0) > 0x7f) set.add(ch);
    }
  }
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("");
}
async function faces(query, text) {
  let url = "https://fonts.googleapis.com/css2?" + query;
  if (text) url += "&text=" + encodeURIComponent(text);
  const css = await (await fetch(url, { headers: UA })).text();
  const out = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    if (!text && /unicode-range/.test(block) && !/U\+0000-00FF/.test(block)) continue;
    const m = block.match(/url\((https:\/\/[^)]+)\)/);
    if (!m) continue;
    const bytes = Buffer.from(await (await fetch(m[1], { headers: UA })).arrayBuffer());
    out.push({
      bytes: bytes.length,
      css: block.replace(m[1], `data:font/woff2;base64,${bytes.toString("base64")}`).replace(/\s*unicode-range:[^;]+;/, "")
    });
  }
  return out;
}
async function localNotoFace(text) {
  const subsetText = (await readFile(NOTO_SUBSET_TEXT, "utf8")).trimEnd();
  if (subsetText !== text) {
    throw new Error("Noto Sans KR subset is stale: regenerate it for the current source characters");
  }
  const bytes = await readFile(NOTO_SUBSET_FONT);
  return {
    bytes: bytes.length,
    css: `@font-face {\n  font-family: 'Noto Sans KR';\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n  src: url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2');\n}`
  };
}
const chars = await usedCharacters();
const all = [
  ...await faces("family=DM+Mono:wght@300;400;500&display=swap"),
  ...await faces("family=Space+Mono:wght@400;700&display=swap"),
  await localNotoFace(chars)
];
const header = `/* SUBSET: ${chars} */\n\n`;
await writeFile(`${ROOT}/engine/fonts.css`, header + all.map((f) => f.css).join("\n") + "\n");
const kb = (await stat(`${ROOT}/engine/fonts.css`)).size / 1024;
console.log(`\u2713 engine/fonts.css \u2014 ${all.length} faces, ${chars.length} subset chars, ${kb.toFixed(1)} KB`);
