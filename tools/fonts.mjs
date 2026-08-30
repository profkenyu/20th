import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
async function hangul() {
  const files = [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)];
  const set = new Set();
  for (const f of files) {
    for (const ch of await readFile(f, "utf8")) {
      if (ch >= "\uAC00" && ch <= "\uD7A3") set.add(ch);
    }
  }
  return [...set].sort().join("");
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
const ko = await hangul();
const all = [
  ...await faces("family=DM+Mono:wght@300;400;500&display=swap"),
  ...await faces("family=Space+Mono:wght@400;700&display=swap"),
  ...await faces("family=Noto+Sans+KR:wght@400&display=swap", ko)
];
const header = `

`;
await writeFile(`${ROOT}/engine/fonts.css`, header + all.map((f) => f.css).join("\n") + "\n");
const kb = (await stat(`${ROOT}/engine/fonts.css`)).size / 1024;
console.log(`\u2713 engine/fonts.css \u2014 ${all.length} faces, ${ko.length} hangul, ${kb.toFixed(1)} KB`);
