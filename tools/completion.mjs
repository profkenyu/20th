import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = `file://${ROOT}/index.html?embed`;
const requestedCase = process.argv[2];
const cases = [
  { name: "desktop", viewport: { width: 1600, height: 900 }, quality: "high", columns: 4 },
  {
    name: "portrait",
    viewport: { width: 390, height: 844 },
    quality: "low",
    columns: 4,
    mobile: true,
    safe: [44, 34]
  },
  {
    name: "landscape-reduced",
    viewport: { width: 844, height: 390 },
    quality: "low",
    columns: 4,
    mobile: true,
    reduced: true,
    safe: [20, 20]
  }
].filter((test) => !requestedCase || test.name === requestedCase);
if (!cases.length) throw new Error(`Unknown completion smoke case: ${requestedCase}`);
const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  args: ["--allow-file-access-from-files"]
});
const failures = [];
const overlap = (a, b) => !!a && !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
for (const test of cases) {
  const context = await browser.newContext({
    viewport: test.viewport,
    isMobile: !!test.mobile,
    hasTouch: !!test.mobile,
    userAgent: test.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" : void 0
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 220));
  });
  page.on("pageerror", (error) => errors.push(String(error).split("\n")[0]));
  page.on("requestfailed", (request) => errors.push(`request failed: ${request.url().slice(0, 100)}`));
  await page.emulateMedia({ reducedMotion: test.reduced ? "reduce" : "no-preference" });
  await page.goto(`${TARGET}&quality=${test.quality}`, { waitUntil: "load", timeout: 6e4 });
  await page.waitForFunction(() => window.TI_READY === true, null, { timeout: 6e4 });
  if (test.safe) await page.evaluate(([top, bottom]) => {
    document.documentElement.style.setProperty("--safe-top", `${top}px`);
    document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
  }, test.safe);
  await page.waitForTimeout(900);
  await page.keyboard.press("Equal");
  await page.waitForFunction(() => {
    const state = window.TI_SEQUENCE?.();
    return state?.restoration === 6 && state?.simultaneous === true;
  }, null, { timeout: 2500 });
  const simultaneous = await page.evaluate(() => window.TI_SEQUENCE?.().simultaneous === true);
  await page.waitForFunction(
    () => window.TI_SEQUENCE?.().tableau === "active",
    null,
    { timeout: 1e4 }
  );
  const measure = () => page.evaluate(() => {
    const root = document.getElementById("ti-restoration");
    const rect = root?.getBoundingClientRect();
    const top = document.querySelector(".bar.t")?.getBoundingClientRect();
    const bottom = document.querySelector(".bar.b")?.getBoundingClientRect();
    const caption = document.getElementById("fh-cap-line")?.getBoundingClientRect();
    const captionKo = document.querySelector("#fh-cap-line .ko");
    const style = root ? getComputedStyle(root) : null;
    const grid = document.getElementById("ti-restoration-cells");
    const gridStyle = grid ? getComputedStyle(grid) : null;
    return {
      state: window.TI_OBSERVED?.() ?? null,
      sequence: window.TI_SEQUENCE?.() ?? null,
      body: document.body.className,
      rect: rect ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      } : null,
      frame: {
        top: top?.height ?? 0,
        bottom: bottom?.height ?? 0,
        width: innerWidth,
        height: innerHeight
      },
      caption: caption ? {
        left: caption.left,
        top: caption.top,
        right: caption.right,
        bottom: caption.bottom,
        width: caption.width,
        height: caption.height
      } : null,
      captionWordBreak: captionKo ? getComputedStyle(captionKo).wordBreak : null,
      pointerEvents: style?.pointerEvents,
      opacity: Number(style?.opacity ?? 0),
      columns: gridStyle?.gridTemplateColumns.split(" ").filter(Boolean).length ?? 0,
      soundOpacity: Number(getComputedStyle(document.getElementById("ti-sound")).opacity),
      monitorOpacity: Number(getComputedStyle(document.getElementById("ti-monitor")).opacity)
    };
  });
  const initial = await measure();
  await page.waitForTimeout(1300);
  const visible = await measure();
  const before = visible.state;
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(650);
  const hidden = await measure();
  await page.evaluate(() => dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(180);
  const resumed = await measure();
  await page.waitForFunction(
    () => {
      const observed = window.TI_OBSERVED?.();
      return observed?.fixed === true && observed.resources?.every(
        (resource) => resource.displayedValue >= 0.999
      );
    },
    null,
    { timeout: 6e3 }
  );
  const fixed = await measure();
  await page.screenshot({ path: `${ROOT}/dist/completion-${test.name}.png` });
  await page.waitForFunction(() => {
    const state = window.TI_SEQUENCE?.();
    return state?.tableau === "idle" && state?.docking !== "idle";
  }, null, { timeout: 6e3 });
  const handedOff = await measure();
  const inside = visible.rect && visible.rect.left >= -1 && visible.rect.right <= visible.frame.width + 1 && visible.rect.top >= visible.frame.top - 1 && visible.rect.bottom <= visible.frame.height - visible.frame.bottom + 1;
  const noCaptionOverlap = !overlap(visible.rect, visible.caption);
  const lifecycle = hidden.state?.suspended && Math.abs((hidden.state?.progress ?? 0) - (before?.progress ?? 0)) < 0.02 && !resumed.state?.suspended && resumed.state?.active && Math.abs((resumed.state?.progress ?? 0) - (before?.progress ?? 0)) < 0.07;
  const completionGaugePass = initial.state?.resources?.every((resource) => resource.displayedValue <= 0.001) && visible.state?.resources?.every((resource) => resource.displayedValue > 0.01 && resource.displayedValue < 0.99) && fixed.state?.resources?.every((resource) => resource.displayedValue >= 0.999);
  const fixedPass = fixed.state?.fixed && fixed.state?.registered === 4 && fixed.state?.phase === "PLANNED 04 \u2192 OBSERVED 04" && fixed.state?.sample === "LANDER / STRUCTURE FIXED" && fixed.state?.resources?.length === 2 && fixed.state.resources.every((resource) => resource.value >= 0.999);
  const handoffPass = !handedOff.state?.active && handedOff.sequence?.tableau === "idle" && handedOff.sequence?.docking !== "idle" && !handedOff.body.includes("ti-completion-tableau");
  const pass = simultaneous && visible.state?.active && inside && noCaptionOverlap && visible.pointerEvents === "none" && visible.opacity > 0.96 && visible.columns === test.columns && visible.captionWordBreak === "keep-all" && visible.soundOpacity < 0.02 && visible.monitorOpacity < 0.02 && lifecycle && completionGaugePass && fixedPass && handoffPass && errors.length === 0;
  console.log(`  ${pass ? "\u2713" : "\u2717"} ${test.name.padEnd(18)} ${Math.round(visible.rect?.width ?? 0)}\xD7${Math.round(visible.rect?.height ?? 0)} \xB7 ${visible.columns} cols \xB7 gauges 0\u2192${Math.round((visible.state?.resources?.[0]?.displayedValue ?? 0) * 100)}\u2192100% \xB7 fixed ${fixed.state?.registered ?? 0}/4 \xB7 handoff ${handoffPass ? handedOff.sequence?.docking : "failed"} \xB7 lifecycle ${lifecycle ? "held" : "failed"}`);
  if (!pass) failures.push({
    name: test.name,
    simultaneous,
    inside,
    noCaptionOverlap,
    lifecycle,
    completionGaugePass,
    fixedPass,
    handoffPass,
    visible,
    initial,
    hidden,
    resumed,
    fixed,
    handedOff,
    errors
  });
  await context.close();
}
await browser.close();
if (failures.length) {
  console.log("\n\u2717 COMPLETION REGISTER FAIL");
  for (const failure of failures) console.log(JSON.stringify(failure, null, 2));
  process.exit(1);
}
console.log("\n\u2713 PASS \u2014 observed material register is finite, safe-framed and lifecycle-stable");
