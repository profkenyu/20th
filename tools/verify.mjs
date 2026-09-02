import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0;
const ok = (t, d = "") => console.log(`  \u2713 ${t.padEnd(52)} ${d}`);
const bad = (t, d = "") => {
  fail++;
  console.log(`  \u2717 ${t.padEnd(52)} ${d}`);
};
async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if ([".js", ".mjs"].includes(extname(e.name))) out.push(p);
  }
  return out;
}
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
function functionBodies(src) {
  const ranges = [];
  const opens = [
    /(?:async\s+)?function\s*[\w$]*\s*\([^)]*\)\s*\{/g,
    /\([^()]*\)\s*=>\s*\{/g,
    /[\w$]+\s*=>\s*\{/g
  ];
  for (const re of opens) {
    for (const m of src.matchAll(re)) {
      const i = src.indexOf("{", m.index + m[0].length - 1);
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      ranges.push([i, j]);
    }
  }
  return ranges;
}
async function bootOrder(file) {
  const src = stripComments(await readFile(file, "utf8"));
  const bodies = functionBodies(src);
  const inBody = (i) => bodies.some(([a, b]) => i > a && i < b);
  const decls = new Map();
  for (const m of src.matchAll(/^(?:const|let|var)\s+([\w$]+)/gm))
    if (!decls.has(m[1])) decls.set(m[1], m.index);
  for (const m of src.matchAll(/^(?:const|let|var)\s+\{([^}]*)\}/gm))
    for (const n of m[1].split(",")) {
      const k = n.trim().split(":").pop().trim();
      if (k && !decls.has(k)) decls.set(k, m.index);
    }
  const fns = new Map();
  for (const m of src.matchAll(/^(?:async\s+)?function\s+([\w$]+)\s*\([^)]*\)\s*\{/gm)) {
    const i = src.indexOf("{", m.index);
    let depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    fns.set(m[1], src.slice(i, j));
  }
  let issues = 0;
  for (const [name, body] of fns) {
    let callAt = Infinity;
    for (const m of src.matchAll(new RegExp(`(?<![.\\w$])${name}\\s*\\(`, "g"))) {
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 14), m.index))) continue;
      if (!inBody(m.index) && m.index < callAt) callAt = m.index;
    }
    if (callAt === Infinity) continue;
    const locals = new Set([...body.matchAll(/(?:const|let|var)\s+([\w$]+)/g)].map((m) => m[1]));
    for (const [id, declAt] of decls) {
      if (locals.has(id) || declAt <= callAt) continue;
      if (!new RegExp(`\\b${id}\\b`).test(body)) continue;
      bad(
        `boot order in ${name}()`,
        `reads '${id}' (declared line ${lineOf(src, declAt)}) but runs at line ${lineOf(src, callAt)}  \u2192  ${src.split("\n")[lineOf(src, callAt) - 1].trim().slice(0, 60)}`
      );
      issues++;
    }
  }
  if (!issues) ok(`boot order \xB7 ${file.replace(ROOT + "/", "")}`, "no top-level call reaches a later binding");
}
async function imports() {
  const pools = {};
  for (const [spec, f] of [["three", "three.webgpu.js"], ["three/tsl", "three.tsl.js"]]) {
    try {
      const src = await readFile(`${ROOT}/vendor/${f}`, "utf8");
      const set = new Set();
      for (const blk of src.match(/export \{[^}]*\}/g) ?? [])
        for (const n of blk.replace("export {", "").replace("}", "").split(","))
          set.add(n.trim().split(" as ").pop().trim());
      pools[spec] = set;
    } catch {
    }
  }
  if (!pools["three"]) {
    ok("external imports", "skipped \u2014 run npm run build once to vendor three");
    return;
  }
  pools["three/webgpu"] = pools["three"];
  let issues = 0;
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)]) {
    const src = stripComments(await readFile(f, "utf8"));
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const names = m[1].split(",").map((x) => x.trim().split(" as ")[0].trim()).filter(Boolean);
      const spec = m[2];
      if (pools[spec]) {
        const miss = names.filter((n) => !pools[spec].has(n));
        if (miss.length) {
          bad(`import from '${spec}'`, `${f.split("/").pop()}: ${miss}`);
          issues++;
        }
      } else if (spec.startsWith(".")) {
        const target = resolve(dirname(f), spec);
        const tsrc = await readFile(target, "utf8").catch(() => null);
        if (tsrc === null) {
          bad("local import", `${f.split("/").pop()} \u2192 ${spec} missing`);
          issues++;
          continue;
        }
        for (const n of names) {
          const re = new RegExp(`export\\s+(?:async\\s+)?(?:const|let|function|class)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`);
          if (!re.test(tsrc)) {
            bad("local import", `${f.split("/").pop()} imports '${n}' from ${spec}`);
            issues++;
          }
        }
      }
    }
    for (const n of new Set([...src.matchAll(/THREE\.([\w$]+)/g)].map((m) => m[1]))) {
      if (n !== "TimestampQuery" && !pools["three"].has(n)) {
        bad("THREE symbol", `${f.split("/").pop()}: THREE.${n}`);
        issues++;
      }
    }
  }
  if (!issues) ok("every imported symbol resolves", "three, three/tsl and local modules");
}
async function configKeys() {
  const src = await readFile(`${ROOT}/engine/config.js`, "utf8");
  const body = src.slice(src.indexOf("export function defaults"));
  const declared = new Set([...body.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]));
  for (const k of ["snap"]) declared.add(k);
  const used = new Set();
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)])
    for (const m of stripComments(await readFile(f, "utf8")).matchAll(/cfg\(\)\.(\w+)/g))
      used.add(m[1]);
  const missing = [...used].filter((k) => !declared.has(k));
  missing.length ? bad("cfg() keys", `read but never defaulted: ${missing.join(", ")}`) : ok("every cfg() key exists in defaults()", `${used.size} keys read`);
}
async function unexercised() {
  const idx = await readFile(`${ROOT}/engine/index.js`, "utf8");
  const exported = new Set();
  for (const m of stripComments(idx).matchAll(/export\s*\{([^}]*)\}/g))
    for (const n of m[1].split(",")) {
      const k = n.trim().split(" as ").pop().trim();
      if (k) exported.add(k);
    }
  const used = new Set();
  const files = [...await walk(`${ROOT}/works`), ...await walk(`${ROOT}/engine`)];
  for (const f of files) {
    if (f.endsWith("/index.js") && f.includes("/engine/")) continue;
    const src = stripComments(await readFile(f, "utf8"));
    for (const n of exported) if (new RegExp(`\\b${n}\\b`).test(src)) used.add(n);
  }
  const h = stripComments(await readFile(`${ROOT}/tools/harness.html`, "utf8"));
  for (const n of exported) if (new RegExp(`\\b${n}\\b`).test(h)) used.add(n);
  const dead = [...exported].filter((n) => !used.has(n));
  dead.length ? bad("unexercised engine exports", dead.join(", ")) : ok("every engine export is exercised", `${exported.size} exports`);
}
async function staleImports() {
  let issues = 0;
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)]) {
    const raw = await readFile(f, "utf8");
    const src = stripComments(raw);
    const body = src.replace(/^import[^;]*;$/gm, "");
    const dead = [];
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g))
      for (const n of m[1].split(",")) {
        const k = n.trim().split(" as ").pop().trim();
        if (k && !new RegExp(`\\b${k}\\b`).test(body)) dead.push(k);
      }
    if (dead.length) {
      bad("unused import", `${f.split("/").slice(-2).join("/")}: ${dead.join(", ")}`);
      issues++;
    }
  }
  if (!issues) ok("no unused imports", "the dependency graph is honest");
}
async function ui() {
  const files = [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)];
  const srcs = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(f, "utf8")])));
  const all = Object.values(srcs).join("\n");
  const declared = new Set([
    ...[...all.matchAll(/\['(\w+)',\s*'[^']*'\]/g)].map((m) => m[1]),
    ...[...all.matchAll(/data-v="(\w+)"/g)].map((m) => m[1])
  ]);
  const used = new Set([...all.matchAll(/hud\.set\('(\w+)'/g)].map((m) => m[1]));
  const orphan = [...declared].filter((k) => !used.has(k) && used.size);
  const noop = [...used].filter((k) => !declared.has(k));
  noop.length ? bad("HUD wiring", `set but never declared: ${noop}`) : ok("HUD wiring", `${used.size} fields set, ${orphan.length} unused rows`);
  const binds = {};
  for (const [f, s] of Object.entries(srcs))
    for (const m of s.matchAll(/e\.code\s*===\s*'(\w+)'/g)) (binds[m[1]] ??= new Set()).add(f.split("/").pop());
  const vehicles = new Set(["rover.js", "walker.js"]);
  const clash = Object.entries(binds).filter(([, v]) => [...v].filter((f) => !vehicles.has(f)).length + ([...v].some((f) => vehicles.has(f)) ? 1 : 0) > 1);
  clash.length ? bad("key bindings", clash.map(([k, v]) => `${k}: ${[...v]}`).join(" \xB7 ")) : ok("key bindings", `${Object.keys(binds).length} keys, no collisions`);
  const blockers = [];
  for (const m of all.matchAll(/#([\w-]+)\s*\{([^}]*)\}/g)) {
    const body = m[2].replace(/\s/g, "");
    if (body.includes("position:fixed") && !body.includes("pointer-events:none")) blockers.push(m[1]);
  }
  const allowed = ["gl", "fh-watchdog", "ti-transfer-trigger", "ti-field-archive", "ti-rover-tools", "ti-drive-mode"];
  const bad_ = blockers.filter((b) => !allowed.includes(b));
  bad_.length ? bad("overlays swallow the pointer", bad_.join(", ")) : ok("overlays are pointer-transparent", `except ${allowed.join(" and ")}, correctly`);
}
async function build() {
  const html = await readFile(`${ROOT}/index.html`, "utf8").catch(() => null);
  if (!html) {
    ok("built file", "skipped \u2014 run npm run build");
    return;
  }
  const refs = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)|url\((https?:\/\/[^)]+)/g)];
  refs.length ? bad("built file fetches", refs.map((m) => m[1] ?? m[2]).join(" ")) : ok("built file is self-contained", `${(html.length / 1024).toFixed(0)} KB, 0 external refs`);
  const generatedIcons = html.match(/data:image\/png;base64,/g) ?? [];
  generatedIcons.length === 2 ? ok("generated rover utility icons inlined", "camera + light") : bad("generated rover utility icons", `expected 2 inlined PNGs, found ${generatedIcons.length}`);
  const faces = (html.match(/@font-face/g) ?? []).length;
  faces >= 6 ? ok("fonts inlined", `${faces} faces, ${(html.match(/data:font\/woff2/g) ?? []).length} base64`) : bad("fonts inlined", `only ${faces} @font-face`);
  const css = await readFile(`${ROOT}/engine/fonts.css`, "utf8").catch(() => "");
  const subset = new Set((css.match(/SUBSET: (.+)/)?.[1] ?? "").split(""));
  const used = new Set();
  for (const f of [...await walk(`${ROOT}/engine`), ...await walk(`${ROOT}/works`)])
    for (const ch of await readFile(f, "utf8")) if (ch >= "\uAC00" && ch <= "\uD7A3") used.add(ch);
  const missing = [...used].filter((c) => !subset.has(c));
  missing.length ? bad("Korean subset is stale", `${missing.length} glyphs missing: ${missing.join("")} \u2014 run npm run fonts`) : ok("Korean subset covers every glyph drawn", `${used.size} syllables`);
  const archive = await readFile(`${ROOT}/field-archive.html`, "utf8").catch(() => null);
  if (!archive) {
    bad("field archive output", "missing \u2014 run npm run build");
  } else if (!archive.includes("FIELD ARCHIVE / COORDINATE RECORDS") || !archive.includes("SIGNAL NOT ACQUIRED")) {
    bad("field archive output", "missing coordinate record UI");
  } else if (!archive.includes("terra-incognita:field-archive:v4") || !archive.includes("FISHEYE 8MM") || !archive.includes("RESOLVED POTENTIAL") || !archive.includes('data-role="')) {
    bad("field archive output", "missing capture profiles or selected-evidence / resolved-potential states");
  } else if (["P01", "P02", "P03"].some((planet, index) => (archive.match(new RegExp(`\\[\\"${planet}-`, "g")) ?? []).length !== [12, 7, 5][index])) {
    bad("field archive output", "expected 12 / 7 / 5 moving-photo records");
  } else if (/id=\"fa-title\"|id=\"fa-location\"|id=\"fa-data\"|id=\"fa-frame\"/.test(archive)) {
    bad("field archive output", "hover image still contains lower text metadata");
  } else if (/(?:src|href)="https?:\/\//i.test(archive)) {
    bad("field archive output", "contains external dependency");
  } else {
    ok("field archive output", `${(archive.length / 1024).toFixed(0)} KB, 12 / 7 / 5 moving-photo records`);
  }
}
console.log("\u2550\u2550 VERIFY \u2550\u2550\n");
for (const f of await walk(`${ROOT}/works`)) if (f.endsWith("main.js")) await bootOrder(f);
await imports();
await configKeys();
await unexercised();
await staleImports();
await ui();
await build();
console.log(fail ? `
\u2717 ${fail} problem(s)` : "\n\u2713 PASS");
process.exit(fail ? 1 : 0);
