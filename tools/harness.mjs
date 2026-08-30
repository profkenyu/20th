import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const path = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  try {
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  args: ["--enable-unsafe-swiftshader"]
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200));
});
let failed = false;
for (const mode of ["work", "minimal"]) {
  await page.goto(`http://127.0.0.1:${port}/tools/harness.html?mode=${mode}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.RESULT?.done, { timeout: 6e4 }).catch(() => {
  });
  const r = await page.evaluate(() => window.RESULT);
  if (mode === "work") {
    const tr = await page.evaluate(() => window.__trailAB?.() ?? null);
    if (tr) {
      console.log(`
  wheel trail, lamps on \u2014 peak ${tr.peak}/765, ${tr.pct}% of pixels`);
      if (tr.peak === 0) console.log("    (expected: the WebGL2 fallback implements no storage reads at all \u2014\n     texelFetch count is 0 and every storage-driven value is zero here.\n     See the varying A/B below, which is the only check this backend allows.)");
    }
    const sh = await page.evaluate(() => ({ v: window.__vertSrc ?? "", f: window.__fragSrc ?? "" }));
    for (const [name, src] of [["vertex", sh.v], ["fragment", sh.f]]) {
      const head = src.split("void main")[0];
      console.log(`
  \u2500\u2500 ${name} bindings (${src.length} chars) \u2500\u2500`);
      console.log(head.split("\n").filter((l) => l.trim() && !/^precision/.test(l.trim()) && !/^\/\//.test(l.trim())).slice(0, 22).map((l) => "    " + l.trim()).join("\n") || "    (none)");
      console.log(`    texelFetch calls: ${(src.match(/texelFetch/g) ?? []).length}`);
      if (name === "vertex") {
        const varyings = [...src.matchAll(/^\s*out\s+(\w+)\s+(\w+);/gm)].map((m) => `${m[1]} ${m[2]}`);
        const relief = varyings.some((v) => v.startsWith("vec2 nodeVarying"));
        console.log(`    varyings: ${varyings.join(" \xB7 ")}`);
        console.log(`    WAKE RELIEF varying (vec2 \u2207w): ${relief ? "PRESENT" : "ABSENT"}`);
      }
    }
    const lm = await page.evaluate(() => window.__lampMap ?? null);
    if (lm) {
      console.log(`
  headlight contribution \u2014 peak +${lm.peak}/255, ${lm.pct}% of pixels`);
      const ramp = " .:-=+*#%@";
      for (const row of lm.map)
        console.log("    " + row.map((v) => ramp[Math.min(9, Math.floor(v / Math.max(lm.peak, 1) * 9.99))]).join(""));
    }
  }
  const shaderErrs = await page.evaluate(() => window.__shaderErrors ?? []);
  if (shaderErrs.length) {
    console.log("\n\u2500\u2500\u2500\u2500 SHADER ERRORS \u2500\u2500\u2500\u2500");
    for (const e of shaderErrs.slice(0, 3)) console.log(e.slice(0, 2200));
  }
  console.log(`
\u2550\u2550 ${mode === "work" ? "TERRA INCOGNITA" : "A SECOND, MINIMAL WORK"} \u2014 gate bypassed, WebGL2 backend \u2550\u2550
`);
  for (const [name, status, ms, value] of r.steps) {
    console.log(`  ${status === "ok" ? "\u2713" : "\u2717"} ${name.padEnd(52)} ${(ms + "ms").padStart(8)}  ${value ?? ""}`);
  }
  console.log(`
  first failure  : ${r.error ?? "none"}`);
  if (r.error) failed = true;
}
await browser.close();
server.close();
console.log(`
  console errors : ${errors.length ? errors.slice(0, 6).join("\n                   ") : "none"}`);
if (failed || errors.length) process.exit(1);
console.log("\n\u2713 PASS \u2014 the engine builds and transfers among three planetary surfaces");
