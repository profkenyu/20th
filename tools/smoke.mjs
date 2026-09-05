import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DWELL = Number(process.env.DWELL ?? 15e3);
const SEQUENCE = process.env.SEQUENCE === "1";
const MOBILE = process.env.MOBILE === "1";
const AUTO_PROLOGUE = process.env.AUTO_PROLOGUE === "1";
const CAPTURE_BLUEPRINT = process.env.CAPTURE_BLUEPRINT === "1";
const TARGET = process.argv[2] ?? `file://${ROOT}/index.html?test${MOBILE ? "&quality=low" : ""}`;
const [viewportWidth, viewportHeight] = String(process.env.VIEWPORT ?? "1600x900").split("x").map(Number);
const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  args: ["--allow-file-access-from-files"]
});
const page = await browser.newPage({
  viewport: {
    width: Number.isFinite(viewportWidth) ? viewportWidth : 1600,
    height: Number.isFinite(viewportHeight) ? viewportHeight : 900
  },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  userAgent: MOBILE ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" : void 0
});
if (MOBILE) await page.emulateMedia({ reducedMotion: "reduce" });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push(String(e).split("\n")[0]));
page.on("requestfailed", (r) => errors.push(`request failed: ${r.url().slice(0, 90)}`));
console.log(`\u2192 ${TARGET}`);
await page.goto(TARGET, { waitUntil: "load", timeout: 6e4 });
await page.waitForFunction(() => window.TI_READY === true, null, { timeout: 6e4 });
await page.waitForTimeout(1e3);
const introObserved = await page.evaluate(() => ({
  opening: window.TI_OPENING?.() ?? null,
  blueprint: window.TI_BLUEPRINT?.() ?? null,
  phase: window.TI_SEQUENCE?.().prologue ?? null,
  cover: (() => {
    const el = document.getElementById("arrive");
    return el ? {
      revealSource: el.dataset.revealSource ?? "",
      opacity: Number.parseFloat(getComputedStyle(el).opacity)
    } : null;
  })()
}));
let blueprintLayout = null;
if (MOBILE) {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--safe-top", "44px");
    root.style.setProperty("--safe-bottom", "34px");
    root.style.setProperty("--safe-left", "8px");
    root.style.setProperty("--safe-right", "8px");
    dispatchEvent(new Event("ti-viewportresize"));
  });
  await page.waitForFunction(() => {
    const state = window.TI_BLUEPRINT?.();
    return state?.current?.startsWith("lander") && state.annotationCount === 4;
  }, null, { timeout: 12e3 });
  blueprintLayout = await page.evaluate(() => {
    const section = document.getElementById("ti-opening-blueprints")?.getBoundingClientRect();
    const frame = document.querySelector("#ti-opening-blueprints .bp-frame")?.getBoundingClientRect();
    const drawing = document.querySelector("#ti-opening-blueprints .bp-drawing")?.getBoundingClientRect();
    const spec = document.querySelector("#ti-opening-blueprints .bp-spec");
    const specRect = spec?.getBoundingClientRect();
    const specStyle = spec ? getComputedStyle(spec) : null;
    const canvas = document.querySelector("#ti-opening-blueprints canvas");
    const canvasRect = canvas?.getBoundingClientRect();
    const topFrame = document.querySelector(".bar.t")?.getBoundingClientRect().height ?? 0;
    const bottomFrame = document.querySelector(".bar.b")?.getBoundingClientRect().height ?? 0;
    const state = window.TI_BLUEPRINT?.() ?? null;
    return {
      visible: !!section && section.width > 0 && section.height > 0,
      current: state?.current,
      shown: state?.shown,
      scan: state?.scan,
      scanDirection: state?.scanDirection,
      scanSpeed: state?.scanSpeed,
      annotationCount: state?.annotationCount,
      sectionInsideFrame: !!section && section.top >= topFrame - 1 && section.bottom <= innerHeight - bottomFrame + 1,
      frameInsideViewport: !!frame && frame.top >= topFrame && frame.bottom <= innerHeight - bottomFrame && frame.left >= 8 && frame.right <= innerWidth - 8,
      drawingVisible: !!drawing && drawing.width > 120 && drawing.height > 120,
      specVisible: !!specRect && specRect.width > 120 && specRect.height > 70,
      specOverflow: !!spec && spec.scrollHeight > spec.clientHeight + 1,
      specBox: spec ? {
        clientHeight: spec.clientHeight,
        scrollHeight: spec.scrollHeight
      } : null,
      gridConfinedToDrawing: specStyle?.backgroundImage === "none",
      canvasReady: !!canvas && canvas.width > 0 && canvas.height > 0 && !!canvasRect && canvasRect.width > 120 && canvasRect.height > 120,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      section: section ? { top: section.top, bottom: section.bottom, width: section.width, height: section.height } : null,
      frame: frame ? { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right } : null
    };
  });
}
let openingLifecycle = null;
let openingMotion = null;
if (!MOBILE && introObserved.opening?.active) {
  const lifecycleBefore = introObserved.opening;
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  openingLifecycle = { before: lifecycleBefore, hidden, resumed };
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === "rover" && state.scanDirection === 1 && state.scan > 0.1 && state.scan < 0.9;
  }, null, { timeout: 9e3 });
  const before = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === "rover" && state.scanDirection === -1 && state.scan > 0.96;
  }, null, { timeout: 9e3 });
  const afterTurn = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === "rover" && state.scanDirection === -1 && state.scan < 0.12;
  }, null, { timeout: 5e3 });
  const nearReturn = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  openingMotion = { before, afterTurn, nearReturn };
  if (CAPTURE_BLUEPRINT) {
    await page.screenshot({ path: resolve(ROOT, "dist/blueprint-rover-return.png") });
    await page.waitForFunction(() => {
      const state = window.TI_OPENING?.();
      return state?.current?.startsWith("lander") && state.annotationCount === 4;
    }, null, { timeout: 9e3 });
    await page.screenshot({ path: resolve(ROOT, "dist/blueprint-lander-return.png") });
  }
}
const startId = MOBILE ? "ti-mobile-start" : "ti-start";
await page.waitForFunction(
  (id) => document.getElementById(id)?.disabled === false,
  startId,
  { timeout: 3e4 }
);
const readInputGate = () => page.evaluate(() => {
  const sound = document.getElementById("ti-sound");
  const green = document.getElementById("ti-green");
  const soundRect = sound?.getBoundingClientRect();
  const greenRect = green?.getBoundingClientRect();
  const hit = soundRect && document.elementFromPoint(
    soundRect.left + soundRect.width * 0.5,
    soundRect.top + soundRect.height * 0.5
  );
  const greenHit = greenRect && document.elementFromPoint(
    greenRect.left + greenRect.width * 0.5,
    greenRect.top + greenRect.height * 0.5
  );
  const drive = document.getElementById("ti-mobile-drive")?.getBoundingClientRect();
  return {
    phase: window.TI_SEQUENCE?.().prologue ?? null,
    controlsReady: window.TI_PROLOGUE?.().controlsReady ?? null,
    soundDisabled: !!sound?.disabled,
    soundOwnsPoint: !!sound && (hit === sound || sound.contains(hit)),
    greenDisabled: !!green?.disabled,
    greenOwnsPoint: !!green && (greenHit === green || green.contains(greenHit)),
    driveVisible: !!drive && drive.width > 0 && drive.height > 0,
    audio: window.TI_AUDIO?.() ?? null
  };
});
const preReleaseInput = await readInputGate();
let blueprintObserved = await page.evaluate(() => window.TI_BLUEPRINT?.() ?? null);
let prologueLifecycle = null;
if (!MOBILE) {
  const before = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  prologueLifecycle = { text: { before, hidden, resumed }, blueprint: null };
}
const mobileIntro = MOBILE ? await page.evaluate((id) => {
  const el = document.getElementById(id);
  const root = document.documentElement;
  const rect = el?.getBoundingClientRect();
  const style = el ? getComputedStyle(el) : null;
  const topFrame = document.querySelector(".bar.t")?.getBoundingClientRect().height ?? 0;
  const bottomFrame = document.querySelector(".bar.b")?.getBoundingClientRect().height ?? 0;
  const prologue = document.getElementById("ti-prologue")?.getBoundingClientRect();
  const inner = document.querySelector("#ti-prologue .inner");
  const innerRect = inner?.getBoundingClientRect();
  const controlsRect = document.querySelector("#ti-prologue .controls")?.getBoundingClientRect();
  const overlaps = (a, b) => !!a && !!b && a.width > 0 && b.width > 0 && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  return {
    visible: !!rect && rect.width >= 58 && rect.height >= 58,
    label: el?.textContent?.trim() ?? "",
    circular: !!rect && Math.abs(rect.width - rect.height) <= 2 && (!!style?.borderTopLeftRadius?.includes("%") || parseFloat(style?.borderTopLeftRadius ?? "0") >= rect.width * 0.45),
    insideViewport: !!rect && rect.top >= topFrame && rect.bottom <= innerHeight - bottomFrame,
    prologueInsideViewport: !!prologue && prologue.top >= 0 && prologue.bottom <= innerHeight + 1,
    innerInsideFrame: !!innerRect && innerRect.left >= 8 && innerRect.right <= innerWidth - 8 && innerRect.top >= topFrame && innerRect.bottom <= innerHeight - bottomFrame,
    innerOverflow: !!inner && inner.scrollHeight > inner.clientHeight + 1,
    overlapsControls: overlaps(innerRect, controlsRect),
    viewportReady: root.classList.contains("ti-viewport-ready"),
    viewportWidth: getComputedStyle(root).getPropertyValue("--viewport-width").trim(),
    viewportHeight: getComputedStyle(root).getPropertyValue("--viewport-height").trim(),
    topFrame,
    bottomFrame,
    width: rect?.width,
    height: rect?.height
  };
}, startId) : null;
if (AUTO_PROLOGUE) {
  await page.waitForFunction(
    () => window.TI_SEQUENCE?.().prologue === "release",
    null,
    { timeout: 11e3 }
  );
} else if (MOBILE) await page.click(`#${startId}`);
else await page.keyboard.press("Enter");
await page.waitForFunction(
  () => window.TI_SEQUENCE?.().prologue === "release",
  null,
  { timeout: 5e3 }
);
const blueprintInput = await readInputGate();
if (MOBILE) {
  await page.waitForFunction(
    () => window.TI_SEQUENCE?.().prologue === "released",
    null,
    { timeout: 8e3 }
  );
} else {
  const before = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  prologueLifecycle.blueprint = { before, hidden, resumed };
  await page.waitForFunction(
    () => window.TI_SEQUENCE?.().prologue === "released",
    null,
    { timeout: 12e3 }
  );
}
let mobileControl = null;
let soundCycle = null;
let greenMode = null;
let roverTools = null;
const readRoverTools = () => page.evaluate(() => {
  const root = document.getElementById("ti-rover-tools")?.getBoundingClientRect();
  const monitor = document.getElementById("ti-monitor")?.getBoundingClientRect();
  const buttons = [...document.querySelectorAll("#ti-rover-tools > *")];
  const rects = buttons.map((button) => button.getBoundingClientRect());
  const mobile = document.body.classList.contains("ti-mobile");
  const light = document.getElementById("ti-light");
  const camera = document.getElementById("ti-camera");
  const overlap = (a, b) => !!a && !!b && a.width > 0 && b.width > 0 && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  return {
    mobile,
    order: buttons.map((button) => button.id),
    visible: !!root && (mobile ? root.width >= 46 && root.width <= 50 && root.height >= 142 : root.width >= 186 && root.width <= 194 && root.height >= 42),
    equalWidths: rects.length === 4 && Math.max(...rects.map((rect) => rect.width)) - Math.min(...rects.map((rect) => rect.width)) <= 1,
    vertical: mobile && rects.length === 4 && rects.every((rect, index) => Math.abs(rect.left - rects[0].left) <= 1 && (!index || rect.top >= rects[index - 1].bottom - 1)),
    horizontal: !mobile && rects.length === 4 && rects.every((rect, index) => Math.abs(rect.top - rects[0].top) <= 1 && (!index || rect.left >= rects[index - 1].right - 1)),
    belowMonitor: !!root && !!monitor && root.top >= monitor.bottom + 4,
    alignedMonitor: !!root && !!monitor && Math.abs(root.right - monitor.right) <= 2,
    overlapMonitor: overlap(root, monitor),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    light: {
      state: light?.dataset.lightState ?? "",
      pressed: light?.getAttribute("aria-pressed") === "true",
      disabled: !!light?.disabled
    },
    camera: {
      state: camera?.dataset.cameraState ?? "",
      disabled: !!camera?.disabled,
      label: camera?.getAttribute("aria-label") ?? ""
    },
    shot: window.TI_CAMERA?.() ?? null,
    experience: window.TI_EXPERIENCE?.() ?? null
  };
});
await page.waitForFunction(
  () => document.getElementById("ti-light")?.disabled === false && document.getElementById("ti-camera")?.disabled === false,
  null,
  { timeout: 12e3 }
);
const toolsBefore = await readRoverTools();
await page.click("#ti-light");
await page.waitForFunction(() => document.getElementById("ti-light")?.dataset.lightState === "off");
const lightOff = await readRoverTools();
await page.click("#ti-light");
await page.waitForFunction(() => document.getElementById("ti-light")?.dataset.lightState === "on");
const lightOn = await readRoverTools();
const shotBefore = toolsBefore.shot?.shot;
await page.click("#ti-camera");
await page.waitForFunction((before) => {
  const camera = window.TI_CAMERA?.();
  return camera?.source === "manual" && camera.shot !== before;
}, shotBefore);
const cameraMoved = await readRoverTools();
for (let i = 0; i < 3; i++) {
  await page.click("#ti-camera");
  await page.waitForTimeout(80);
}
await page.keyboard.press("Space");
await page.waitForTimeout(120);
const restoredTools = await readRoverTools();
roverTools = { before: toolsBefore, lightOff, lightOn, cameraMoved, restored: restoredTools };
const readGreenMode = () => page.evaluate(() => {
  const button = document.getElementById("ti-green");
  const rect = button?.getBoundingClientRect();
  const drive = document.getElementById("ti-drive-mode")?.getBoundingClientRect();
  const screen = document.getElementById("ti-terminal-screen");
  const sound = document.getElementById("ti-sound")?.getBoundingClientRect();
  const monitor = document.getElementById("ti-monitor")?.getBoundingClientRect();
  const universe = document.getElementById("universe-id")?.getBoundingClientRect();
  const render = window.TI_RENDER_MODE?.() ?? null;
  return {
    current: button?.dataset.greenCurrent ?? "",
    pressed: button?.getAttribute("aria-pressed") === "true",
    disabled: !!button?.disabled,
    state: button?.dataset.greenState ?? "",
    visible: !!rect && rect.width >= 88 && rect.width <= 96 && rect.height >= 26 && rect.height <= 30,
    driveVisible: !!drive && drive.width >= 88 && drive.width <= 96 && drive.height >= 26 && drive.height <= 30,
    driveMatches: !!rect && !!drive && Math.abs(rect.width - drive.width) <= 1 && Math.abs(rect.height - drive.height) <= 1 && Math.abs(rect.bottom - drive.bottom) <= 1 && drive.right <= rect.left - 4,
    soundHeight: sound?.height ?? 0,
    sound: sound ? { left: sound.left, top: sound.top, right: sound.right, bottom: sound.bottom } : null,
    monitor: monitor ? { left: monitor.left, top: monitor.top, right: monitor.right, bottom: monitor.bottom } : null,
    universe: universe ? { left: universe.left, top: universe.top, right: universe.right, bottom: universe.bottom } : null,
    classActive: document.body.classList.contains("ti-green-monitor"),
    terminal: document.body.classList.contains("ti-terminal"),
    screenVisible: screen ? getComputedStyle(screen).display !== "none" : false,
    canvasFilter: getComputedStyle(document.getElementById("gl")).filter,
    render,
    rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null
  };
});
if (!MOBILE) {
  await page.waitForTimeout(3200);
  const before = await readGreenMode();
  await page.click("#ti-green");
  await page.waitForTimeout(950);
  const on = await readGreenMode();
  await page.screenshot({ path: `${ROOT}/dist/green-monitor-desktop.png` });
  await page.click("#ti-green");
  await page.waitForTimeout(950);
  const off = await readGreenMode();
  greenMode = { before, on, off };
}
if (MOBILE) {
  await page.waitForTimeout(1600);
  await page.waitForFunction(
    () => document.getElementById("ti-drive-mode")?.disabled === false,
    null,
    { timeout: 12e3 }
  );
  const readMobileDriveMode = () => page.evaluate(() => {
    const button = document.getElementById("ti-drive-mode");
    return {
      experience: window.TI_EXPERIENCE?.() ?? null,
      pressed: button?.getAttribute("aria-pressed") === "true",
      state: button?.dataset.driveState ?? "",
      label: button?.getAttribute("aria-label") ?? "",
      visible: !!button && button.getBoundingClientRect().width > 0,
      steeringVisible: document.getElementById("ti-mobile-drive")?.getBoundingClientRect().width > 0
    };
  });
  const initialDriveMode = await readMobileDriveMode();
  if (initialDriveMode.steeringVisible) throw new Error("AUTO must hide the steering panel");
  await page.click("#ti-drive-mode");
  await page.waitForFunction(() => document.getElementById("ti-mobile-steer")?.disabled === false);
  mobileControl = await page.evaluate(() => {
    const root = document.getElementById("ti-mobile-drive")?.getBoundingClientRect();
    const steer = document.getElementById("ti-mobile-steer")?.getBoundingClientRect();
    const sound = document.getElementById("ti-sound")?.getBoundingClientRect();
    const green2 = document.getElementById("ti-green")?.getBoundingClientRect();
    const driveMode = document.getElementById("ti-drive-mode")?.getBoundingClientRect();
    const archive = document.getElementById("ti-field-archive")?.getBoundingClientRect();
    const monitor = document.getElementById("ti-monitor")?.getBoundingClientRect();
    const mission = document.getElementById("fh-mission")?.getBoundingClientRect();
    const cue = document.getElementById("ti-terminal-cue")?.getBoundingClientRect();
    const driveButtons = [...document.querySelectorAll("#ti-mobile-drive button")].map((button) => button.getBoundingClientRect());
    const utilityHeights = [sound, archive].filter(Boolean).map((rect) => rect.height);
    const driveHeights = driveButtons.map((rect) => rect.height);
    const configuredSafeRight = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--safe-right")
    );
    const measuredSafeRight = Math.max(
      0,
      innerWidth - (document.querySelector(".bar.b")?.getBoundingClientRect().right ?? innerWidth)
    );
    const safeRight = Number.isFinite(configuredSafeRight) ? configuredSafeRight : measuredSafeRight;
    const frameBottom = document.querySelector(".bar.b")?.getBoundingClientRect().height ?? 0;
    const compactLandscape = matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 520px)").matches;
    const greenRight = compactLandscape ? Math.max(68, safeRight + 64) : Math.max(14, safeRight);
    const overlap = (a, b) => !!a && !!b && a.width > 0 && b.width > 0 && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return {
      rootVisible: !!root && root.width > 0 && root.height >= 48,
      steerVisible: !!steer && steer.width > 60 && steer.height >= 44,
      soundVisible: !!sound && sound.width >= 42 && sound.width <= 52 && sound.height >= 42 && sound.height <= 46,
      greenVisible: !!green2 && green2.width >= 88 && green2.width <= 96 && green2.height >= 26 && green2.height <= 30,
      greenRightAligned: !!green2 && Math.abs(innerWidth - green2.right - greenRight) <= 2,
      greenNearBottom: !!green2 && innerHeight - green2.bottom <= frameBottom + 14,
      driveModeVisible: !!driveMode && driveMode.width >= 88 && driveMode.width <= 96 && driveMode.height >= 26 && driveMode.height <= 30,
      archiveVisible: !!archive && archive.width >= 42 && archive.width <= 52 && archive.height >= 42 && archive.height <= 46,
      balancedButtons: utilityHeights.length === 2 && Math.max(...utilityHeights) - Math.min(...utilityHeights) <= 1,
      balancedDriveButtons: driveHeights.length === 2 && Math.max(...driveHeights) - Math.min(...driveHeights) <= 1,
      overlapSoundControl: overlap(sound, root),
      overlapSoundMonitor: overlap(sound, monitor),
      overlapGreenControl: overlap(green2, root),
      overlapDriveControl: overlap(driveMode, root),
      overlapDriveGreen: overlap(driveMode, green2),
      overlapGreenMonitor: overlap(green2, monitor),
      overlapGreenSound: overlap(green2, sound),
      overlapArchiveControl: overlap(archive, root),
      overlapArchiveMonitor: overlap(archive, monitor),
      overlapArchiveMission: overlap(archive, mission),
      overlapArchiveSound: overlap(archive, sound),
      overlapArchiveGreen: overlap(archive, green2),
      overlapCueControl: overlap(cue, root),
      overlapCueSound: overlap(cue, sound),
      steerX: steer ? steer.left + steer.width * 0.88 : 0,
      steerY: steer ? steer.top + steer.height * 0.5 : 0,
      audio: window.TI_AUDIO?.() ?? null
    };
  });
  mobileControl.dispatched = await page.evaluate(({ x, y }) => {
    const el = document.getElementById("ti-mobile-steer");
    if (!el) return false;
    el.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y
    }));
    return true;
  }, { x: mobileControl.steerX, y: mobileControl.steerY });
  await page.waitForTimeout(220);
  mobileControl.dragExperience = await page.evaluate(() => window.TI_EXPERIENCE?.().mode ?? null);
  await page.evaluate(({ x, y }) => {
    document.getElementById("ti-mobile-steer")?.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: x,
      clientY: y
    }));
  }, { x: mobileControl.steerX, y: mobileControl.steerY });
  await page.waitForFunction(
    () => document.getElementById("ti-drive-mode")?.disabled === false,
    null,
    { timeout: 12e3 }
  );
  const manual = await readMobileDriveMode();
  await page.click("#ti-drive-mode");
  await page.waitForFunction(() => window.TI_EXPERIENCE?.().driveMode === "auto");
  const auto = await readMobileDriveMode();
  if (auto.steeringVisible) throw new Error("Returning to AUTO must hide steering");
  await page.click("#ti-drive-mode");
  await page.waitForFunction(() => window.TI_EXPERIENCE?.().driveMode === "manual");
  const restoredManual = await readMobileDriveMode();
  mobileControl.modeCycle = { initial: initialDriveMode, manual, auto, restoredManual };
  await page.click("#ti-sound");
  const off = await page.evaluate(() => window.TI_AUDIO?.() ?? null);
  await page.click("#ti-sound");
  await page.waitForFunction(() => window.TI_AUDIO?.().state === "running");
  const on = await page.evaluate(() => window.TI_AUDIO?.() ?? null);
  soundCycle = { off, on };
  const green = await readGreenMode();
  await page.click("#ti-green");
  await page.waitForTimeout(950);
  const raw = await readGreenMode();
  await page.click("#ti-green");
  await page.waitForTimeout(950);
  const restored = await readGreenMode();
  greenMode = { green, raw, restored };
  const modeCycle = mobileControl.modeCycle;
  const utilityFailed = roverTools.before.order.join("|") !== "ti-sound|ti-light|ti-camera|ti-field-archive" || !roverTools.before.visible || !roverTools.before.equalWidths || (roverTools.before.mobile ? !roverTools.before.vertical : !roverTools.before.horizontal) || !roverTools.before.belowMonitor || !roverTools.restored.alignedMonitor || roverTools.before.overlapMonitor || roverTools.before.overflow || roverTools.before.light.state !== "on" || !roverTools.before.light.pressed || roverTools.lightOff.light.state !== "off" || roverTools.lightOff.light.pressed || roverTools.lightOn.light.state !== "on" || !roverTools.lightOn.light.pressed || roverTools.cameraMoved.shot?.shot === roverTools.before.shot?.shot || roverTools.cameraMoved.shot?.source !== "manual" || roverTools.restored.experience?.driveMode !== "auto";
  const failed = !mobileIntro?.visible || !mobileIntro?.insideViewport || !blueprintLayout?.visible || blueprintLayout.current !== "lander" || !blueprintLayout.sectionInsideFrame || !blueprintLayout.frameInsideViewport || !blueprintLayout.drawingVisible || !blueprintLayout.specVisible || blueprintLayout.specOverflow || !blueprintLayout.gridConfinedToDrawing || !blueprintLayout.canvasReady || blueprintLayout.horizontalOverflow || blueprintLayout.annotationCount !== 4 || Math.abs(blueprintLayout.scan - 0.5) > 0.01 || blueprintLayout.scanDirection !== 0 || blueprintLayout.scanSpeed !== 0 || blueprintObserved?.active || blueprintObserved?.current !== "complete" || !blueprintObserved?.shown?.includes("rover") || !blueprintObserved?.shown?.includes("lander") || blueprintObserved?.models?.rover?.segments < 700 || blueprintObserved?.models?.lander?.segments < 700 || !preReleaseInput.soundDisabled || preReleaseInput.soundOwnsPoint || !preReleaseInput.greenDisabled || preReleaseInput.greenOwnsPoint || preReleaseInput.driveVisible || preReleaseInput.controlsReady || !blueprintInput.soundDisabled || blueprintInput.soundOwnsPoint || !blueprintInput.greenDisabled || blueprintInput.greenOwnsPoint || blueprintInput.driveVisible || blueprintInput.controlsReady || mobileIntro?.label !== "START" || !mobileIntro?.circular || !mobileIntro?.prologueInsideViewport || !mobileIntro?.innerInsideFrame || mobileIntro?.innerOverflow || mobileIntro?.overlapsControls || !mobileIntro?.viewportReady || utilityFailed || !mobileControl.rootVisible || !mobileControl.steerVisible || !mobileControl.soundVisible || !mobileControl.greenVisible || !mobileControl.greenRightAligned || !mobileControl.greenNearBottom || !mobileControl.driveModeVisible || !mobileControl.archiveVisible || !mobileControl.balancedButtons || !mobileControl.balancedDriveButtons || mobileControl.overlapSoundControl || mobileControl.overlapSoundMonitor || mobileControl.overlapGreenControl || mobileControl.overlapDriveControl || mobileControl.overlapDriveGreen || mobileControl.overlapGreenMonitor || mobileControl.overlapGreenSound || mobileControl.overlapArchiveControl || mobileControl.overlapArchiveMonitor || mobileControl.overlapArchiveMission || mobileControl.overlapArchiveSound || mobileControl.overlapArchiveGreen || mobileControl.overlapCueControl || mobileControl.overlapCueSound || !mobileControl.audio?.graphReady || !mobileControl.audio?.unlocked || mobileControl.audio?.state !== "running" || mobileControl.audio?.ui !== "on" || !soundCycle.off?.muted || soundCycle.off?.ui !== "off" || soundCycle.on?.muted || soundCycle.on?.state !== "running" || soundCycle.on?.ui !== "on" || greenMode.green?.current !== "green" || !greenMode.green?.visible || !greenMode.green?.pressed || greenMode.green?.disabled || greenMode.green?.state !== "on" || !greenMode.green?.terminal || !greenMode.green?.screenVisible || !greenMode.green?.render?.archive || !greenMode.green?.canvasFilter?.includes("grayscale(1)") || greenMode.raw?.current !== "raw" || greenMode.raw?.pressed || greenMode.raw?.disabled || greenMode.raw?.state !== "off" || greenMode.raw?.screenVisible || !greenMode.raw?.render?.archive || greenMode.restored?.current !== "green" || !greenMode.restored?.pressed || !greenMode.restored?.screenVisible || !greenMode.restored?.canvasFilter?.includes("grayscale(1)") || modeCycle?.initial?.experience?.driveMode !== "auto" || !modeCycle.initial.experience.auto || modeCycle.initial.pressed || modeCycle.initial.state !== "auto" || !modeCycle.initial.visible || !mobileControl.dispatched || mobileControl.dragExperience !== "explorer" || modeCycle?.manual?.experience?.driveMode !== "manual" || modeCycle.manual.experience.auto || !modeCycle.manual.pressed || modeCycle.manual.state !== "manual" || modeCycle?.auto?.experience?.driveMode !== "auto" || !modeCycle.auto.experience.auto || modeCycle.auto.pressed || modeCycle.auto.state !== "auto" || modeCycle?.restoredManual?.experience?.driveMode !== "manual" || modeCycle.restoredManual.experience.auto || !modeCycle.restoredManual.pressed || modeCycle.restoredManual.state !== "manual" || errors.length > 0;
  console.log(`
  mobile intro CTA       ${JSON.stringify(mobileIntro)}`);
  console.log(`  blueprint safe frame   ${JSON.stringify(blueprintLayout)}`);
  console.log(`  pre-release input      ${JSON.stringify(preReleaseInput)}`);
  console.log(`  blueprint input gate   ${JSON.stringify(blueprintInput)}`);
  console.log(`  mobile controls        ${JSON.stringify(mobileControl)}`);
  console.log(`  rover utility row      ${JSON.stringify(roverTools)}`);
  console.log(`  mobile sound cycle     ${JSON.stringify(soundCycle)}`);
  console.log(`  green monitor          ${JSON.stringify(greenMode)}`);
  if (errors.length) console.log(`  browser errors         ${errors.slice(0, 6).join(" \xB7 ")}`);
  await page.screenshot({ path: `${ROOT}/dist/mobile-smoke.png` });
  await browser.close();
  if (failed) {
    console.log("\n\u2717 FAIL \u2014 mobile CTA/drag/sound contract");
    process.exit(1);
  }
  console.log("\n\u2713 PASS \u2014 mobile CTA visible, AUTO / MANUAL cycle works, drag steering enters manual");
  process.exit(0);
}
const sequencePhases = [];
let sequenceComplete = !SEQUENCE;
let cameraCycle = null;
let roverPOV = null;
const sequenceShots = {
  waterTravelWide: false,
  waterConfirmedMacro: false,
  body02Rear: false,
  body02ObserverReturn: false,
  body03Rear: false,
  return: false,
  ascent: false
};
if (SEQUENCE) {
  await page.keyboard.press("Equal");
  const deadline = Date.now() + 22e4;
  let last = "", waterShortcut = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.TI_SEQUENCE?.() ?? null);
    if (state) {
      if (state.world === "desert" && state.water === "searching" && state.waterDistance > 8 && state.cameraShot === "wide") {
        sequenceShots.waterTravelWide = true;
        if (!sequenceShots.body02Rear) {
          await page.keyboard.press("KeyC");
          await page.waitForTimeout(240);
          const camera = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
          sequenceShots.body02Rear = camera?.world === "desert" && camera?.shot === "rear" && camera?.source === "manual" && camera?.experience === "explorer" && !camera?.locked;
          await page.keyboard.press("Space");
          await page.waitForTimeout(2650);
          const returned = await page.evaluate(() => ({
            camera: window.TI_CAMERA?.() ?? null,
            experience: window.TI_EXPERIENCE?.() ?? null
          }));
          sequenceShots.body02ObserverReturn = returned.camera?.shot === "wide" && returned.camera?.experience === "observer" && returned.experience?.auto === true;
        }
      }
      if (state.world === "desert" && state.water === "confirmed" && state.cameraShot === "macro") sequenceShots.waterConfirmedMacro = true;
      if ((state.docking !== "idle" || ["hold", "settle", "deploy", "egress", "close"].includes(state.voyage)) && state.cameraShot === "return") sequenceShots.return = true;
      if (["lift", "transit", "descent"].includes(state.voyage) && state.cameraShot === "ascent") sequenceShots.ascent = true;
      const key = `${state.world}|${state.mission}|${state.water}|${state.tableau}|${state.docking}|${state.voyage}|${state.restoration}|${state.cameraShot ?? "\u2014"}`;
      if (key !== last) {
        sequencePhases.push(key);
        console.log(`  \xB7 ${key}`);
        last = key;
      }
      if (!waterShortcut && state.world === "desert" && state.mission === "water" && state.water === "searching" && state.voyage === "arrived" && state.waterDistance > 8 && sequenceShots.body02ObserverReturn) {
        waterShortcut = true;
        await page.keyboard.press("Equal");
      }
      if (state.world === "granite" && state.mission === "searching" && state.planets === 3 && state.tableau === "idle" && state.docking === "idle" && state.voyage === "arrived") {
        if (!sequenceShots.body03Rear) {
          await page.keyboard.press("KeyC");
          await page.waitForTimeout(240);
          const camera = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
          sequenceShots.body03Rear = camera?.world === "granite" && camera?.shot === "rear" && camera?.source === "manual" && camera?.experience === "explorer" && !camera?.locked;
        }
        sequenceComplete = sequenceShots.body03Rear;
        break;
      }
    }
    await page.waitForTimeout(400);
  }
} else {
  await page.waitForTimeout(2700);
  const before = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  cameraCycle = { before, after };
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(250);
  roverPOV = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  await page.screenshot({ path: `${ROOT}/dist/rover-pov-smoke.png` });
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(DWELL);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.press("Space");
  await page.waitForTimeout(2650);
  await page.waitForTimeout(1200);
  await page.waitForTimeout(900);
}
const report = await page.evaluate(() => {
  const read = (k) => document.querySelector(`[data-v="${k}"]`)?.textContent ?? "\u2014";
  const monitor = document.getElementById("ti-monitor")?.getBoundingClientRect();
  const missionPanel = document.getElementById("fh-mission")?.getBoundingClientRect();
  const overlap = monitor && missionPanel ? !(monitor.right <= missionPanel.left || monitor.left >= missionPanel.right || monitor.bottom <= missionPanel.top || monitor.top >= missionPanel.bottom) : null;
  const atlas = document.getElementById("ti-minimap");
  let greenPixels = 0, redPixels = 0, measuredPixels = 0;
  if (atlas) {
    const pixels = atlas.getContext("2d").getImageData(0, 0, atlas.width, atlas.height).data;
    for (let i = 0; i < pixels.length; i += 64) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a < 8) continue;
      measuredPixels++;
      if (g > 15 && g > r * 1.25 && g > b * 1.05) greenPixels++;
      if (r > 20 && r > g * 1.15) redPixels++;
    }
  }
  return {
    started: !!window.TI_READY,
    gate: document.getElementById("fh-gate")?.textContent.trim() ?? null,
    universe: window.UNIVERSE_SEED,
    backend: read("backend"),
    vendor: read("vendor"),
    tier: read("tier"),
    fps: read("fps"),
    cpuFrame: read("cpu"),
    gpuCompute: read("gc"),
    gpuRender: read("gr"),
    rebuildGround: read("rcT"),
    rebuildField: read("rcF"),
    rebuildFilaments: read("rcL"),
    recentres: read("recentre"),
    pixelRatio: read("dpr"),
    r: read("r"),
    region: read("region"),
    divergence: read("delta"),
    filaments: read("fcount"),
    vertices: read("fverts"),
    camera: window.TI_CAMERA?.() ?? null,
    audio: window.TI_AUDIO?.() ?? null,
    experience: window.TI_EXPERIENCE?.() ?? null,
    anomalies: window.TI_ANOMALIES?.().length ?? 0,
    fieldArchive: window.TI_FIELD_ARCHIVE?.() ?? null,
    water: window.TI_WATER?.() ?? null,
    memory: window.TI_MEMORY?.() ?? null,
    sequence: window.TI_SEQUENCE?.() ?? null,
    monitor: {
      overlap,
      backing: atlas ? `${atlas.width}x${atlas.height}` : null,
      greenRatio: measuredPixels ? greenPixels / measuredPixels : 0,
      redRatio: measuredPixels ? redPixels / measuredPixels : 0
    }
  };
});
report.sequenceComplete = sequenceComplete;
report.cameraCycle = cameraCycle;
report.roverPOV = roverPOV;
report.sequenceShots = sequenceShots;
report.introObserved = introObserved;
report.openingLifecycle = openingLifecycle;
report.openingMotion = openingMotion;
report.prologueLifecycle = prologueLifecycle;
report.preReleaseInput = preReleaseInput;
report.blueprintInput = blueprintInput;
report.blueprintObserved = blueprintObserved;
report.blueprintLayout = blueprintLayout;
report.mobileIntro = mobileIntro;
report.mobileControl = mobileControl;
report.soundCycle = soundCycle;
report.greenMode = greenMode;
report.roverTools = roverTools;
await page.screenshot({ path: `${ROOT}/dist/${SEQUENCE ? "sequence-smoke" : "smoke"}.png` });
await browser.close();
const pad = (s) => String(s).padEnd(22);
console.log("");
for (const [k, v] of Object.entries(report)) console.log(`  ${pad(k)} ${v}`);
console.log(`
  screenshot            dist/${SEQUENCE ? "sequence-smoke" : "smoke"}.png`);
const fatal = [];
if (!report.started) fatal.push("module never reached first frame");
if (introObserved?.phase !== "blueprints" || introObserved?.cover?.revealSource !== "blueprint" || !introObserved?.opening?.seen || !introObserved?.opening?.active || !["noise", "rover"].includes(introObserved?.opening?.current) || introObserved?.opening?.models?.rover?.meshes < 80 || introObserved?.opening?.models?.lander?.meshes < 40 || introObserved?.opening?.models?.rover?.segments < 700 || introObserved?.opening?.models?.lander?.segments < 700 || introObserved?.opening?.models?.lander?.parts !== 4 || !["x", "y", "z"].every((axis) => Number.isFinite(introObserved?.opening?.models?.rover?.dimensions?.[axis]) && introObserved.opening.models.rover.dimensions[axis] > 0 && Number.isFinite(introObserved?.opening?.models?.lander?.dimensions?.[axis]) && introObserved.opening.models.lander.dimensions[axis] > 0)) {
  fatal.push(`production rover blueprint did not precede lander/text: ${JSON.stringify(introObserved)}`);
}
if (!MOBILE && openingLifecycle && (!openingLifecycle.hidden?.suspended || openingLifecycle.resumed?.suspended || !openingLifecycle.resumed?.active || Math.abs(openingLifecycle.hidden.progress - openingLifecycle.before.progress) > 0.03)) {
  fatal.push(`opening lifecycle did not pause/resume in place: ${JSON.stringify(openingLifecycle)}`);
}
if (!MOBILE && (!openingMotion || openingMotion.before?.scanDirection !== 1 || openingMotion.afterTurn?.scanDirection !== -1 || openingMotion.afterTurn?.scan < 0.96 || openingMotion.afterTurn?.scanSpeed > 0.35 || openingMotion.afterTurn?.annotationCount > 1 || openingMotion.nearReturn?.scanDirection !== -1 || openingMotion.nearReturn?.scan > 0.12 || openingMotion.nearReturn?.annotationCount !== 6 || openingMotion.afterTurn.scan - openingMotion.nearReturn.scan < 0.8)) {
  fatal.push(`CRT scan did not reverse with gradual velocity: ${JSON.stringify(openingMotion)}`);
}
if (!MOBILE && (!prologueLifecycle?.text?.hidden?.timers?.release?.paused || !prologueLifecycle.text.resumed?.timers?.release?.active || prologueLifecycle.text.resumed?.timers?.release?.paused || prologueLifecycle.text.hidden?.phase !== "text" || !prologueLifecycle?.blueprint?.hidden?.timers?.blueprint?.paused || !prologueLifecycle.blueprint.resumed?.timers?.blueprint?.active || prologueLifecycle.blueprint.resumed?.timers?.blueprint?.paused || prologueLifecycle.blueprint.hidden?.phase !== "release")) {
  fatal.push(`prologue timers did not pause/resume in place: ${JSON.stringify(prologueLifecycle)}`);
}
if (!preReleaseInput.soundDisabled || preReleaseInput.soundOwnsPoint || preReleaseInput.driveVisible || preReleaseInput.controlsReady || !preReleaseInput.greenDisabled || preReleaseInput.greenOwnsPoint || !blueprintInput.soundDisabled || blueprintInput.soundOwnsPoint || !blueprintInput.greenDisabled || blueprintInput.greenOwnsPoint || blueprintInput.driveVisible || blueprintInput.controlsReady) {
  fatal.push(`opening input gate leaked through an obscuring layer: ${JSON.stringify({ preReleaseInput, blueprintInput })}`);
}
if (blueprintObserved?.active || blueprintObserved?.current !== "complete" || blueprintObserved?.scan !== 0 || blueprintObserved?.scanDirection !== 0 || blueprintObserved?.scanSpeed !== 0 || blueprintObserved?.annotationCount !== 4 || !blueprintObserved?.shown?.includes("rover") || !blueprintObserved?.shown?.includes("lander") || blueprintObserved?.models?.rover?.sourceSegments < blueprintObserved?.models?.rover?.segments || blueprintObserved?.models?.lander?.sourceSegments < blueprintObserved?.models?.lander?.segments) {
  fatal.push(`rover \u2192 lander production blueprint sequence was incomplete: ${JSON.stringify(blueprintObserved)}`);
}
if (report.gate) fatal.push(`adapter gate fired: ${report.gate}`);
if (!report.audio?.graphReady || !report.audio?.unlocked || report.audio?.state !== "running" || report.audio?.muted || report.audio?.ui !== "on") {
  fatal.push(`start gesture did not unlock audible score: ${JSON.stringify(report.audio)}`);
}
if (!MOBILE && (!greenMode?.before?.visible || !greenMode.before.driveVisible || !greenMode.before.driveMatches || greenMode.before.current !== "raw" || greenMode.before.pressed || greenMode.before.disabled || greenMode.before.state !== "off" || !greenMode.before.sound || !greenMode.before.monitor || !greenMode.before.universe || greenMode.before.sound.top < greenMode.before.monitor.bottom + 4 || greenMode.before.universe.bottom > greenMode.before.monitor.top || !greenMode?.on?.visible || greenMode.on.current !== "green" || !greenMode.on.pressed || greenMode.on.disabled || greenMode.on.state !== "on" || !greenMode.on.classActive || !greenMode.on.screenVisible || !greenMode.on.canvasFilter?.includes("grayscale(1)") || greenMode.on.render?.archive || !greenMode.on.render?.green || !greenMode.on.render?.greenManual || greenMode.off.current !== "raw" || greenMode.off.pressed || greenMode.off.disabled || greenMode.off.state !== "off" || greenMode.off.classActive || greenMode.off.screenVisible || greenMode.off.canvasFilter !== greenMode.before.canvasFilter || greenMode.off.render?.archive || greenMode.off.render?.green || greenMode.off.render?.greenManual)) {
  fatal.push(`GREEN monitor toggle did not preserve the high-tier renderer: ${JSON.stringify(greenMode)}`);
}
if (roverTools?.before?.order?.join("|") !== "ti-sound|ti-light|ti-camera|ti-field-archive" || !roverTools.before.visible || !roverTools.before.equalWidths || (roverTools.before.mobile ? !roverTools.before.vertical : !roverTools.before.horizontal) || !roverTools.before.belowMonitor || !roverTools.restored.alignedMonitor || roverTools.before.overlapMonitor || roverTools.before.overflow || roverTools.before.light.state !== "on" || !roverTools.before.light.pressed || roverTools.lightOff.light.state !== "off" || roverTools.lightOff.light.pressed || roverTools.lightOn.light.state !== "on" || !roverTools.lightOn.light.pressed || roverTools.cameraMoved.shot?.shot === roverTools.before.shot?.shot || roverTools.cameraMoved.shot?.source !== "manual" || roverTools.restored.experience?.driveMode !== "auto") {
  fatal.push(`rover utility order or light/camera function failed: ${JSON.stringify(roverTools)}`);
}
if (MOBILE && (!mobileIntro?.visible || mobileIntro?.label !== "START" || !mobileIntro?.circular || !mobileControl?.rootVisible || !mobileControl?.steerVisible || !mobileControl?.soundVisible || !mobileControl?.greenRightAligned || !mobileControl?.greenNearBottom || !mobileControl?.driveModeVisible || !mobileControl?.archiveVisible || !mobileControl?.balancedButtons || !mobileControl?.balancedDriveButtons || mobileControl?.overlapArchiveMission || mobileControl?.modeCycle?.initial?.experience?.driveMode !== "auto" || mobileControl?.dragExperience !== "explorer")) {
  fatal.push(`mobile CTA/drag/sound contract failed: ${JSON.stringify({ mobileIntro, mobileControl })}`);
}
if (!["wide", "rear", "mast", "macro", "tele", "return", "ascent"].includes(report.camera?.shot))
  fatal.push(`camera escaped authored/operator grammar: ${report.camera?.shot ?? "missing"}`);
if (!SEQUENCE && (cameraCycle.before.shot === cameraCycle.after?.shot || cameraCycle.after?.source !== "manual" || cameraCycle.after?.experience !== "explorer")) {
  fatal.push(`C did not change an available authored shot: ${JSON.stringify(cameraCycle)}`);
}
if (!SEQUENCE && (roverPOV?.shot !== "mast" || !roverPOV?.roverPOV || roverPOV?.lensProfile !== "mast" || roverPOV?.source !== "manual")) {
  fatal.push(`second C did not engage the 8 mm rover POV/lens profile: ${JSON.stringify(roverPOV)}`);
}
if (!SEQUENCE && (report.experience?.mode !== "observer" || report.experience?.auto !== true)) {
  fatal.push(`Space did not return Explorer to Observer: ${JSON.stringify(report.experience)}`);
}
if (report.anomalies !== 18) fatal.push(`expected 18 distributed resource manifestations, found ${report.anomalies}`);
const archiveProfiles = new Set((report.fieldArchive?.stations ?? []).map((station) => station.capture?.profile).filter(Boolean));
if (report.fieldArchive?.version !== 4 || !["fisheye", "wide", "rear", "tele", "macro", "portrait", "panorama"].every((profile) => archiveProfiles.has(profile))) {
  fatal.push(`FIELD ARCHIVE capture profiles incomplete: ${JSON.stringify({ version: report.fieldArchive?.version ?? "missing", profiles: [...archiveProfiles] })}`);
}
if (!sequenceComplete) fatal.push("authored sequence did not generate BODY 03 Geological Memory");
if (SEQUENCE && (!report.memory?.ledger?.ready || report.memory?.geological?.total !== 3 || report.memory?.geological?.sources?.samples !== 6 || report.memory?.geological?.sources?.water !== "BODY02-H2O-01" || report.memory?.geological?.gpu?.backend !== "webgpu-storage-compute" || report.memory?.geological?.gpu?.dispatches < 1)) {
  fatal.push(`BODY 03 memory synthesis incomplete: ${JSON.stringify(report.memory)}`);
}
if (SEQUENCE) {
  const terraStations = report.fieldArchive?.stations?.filter((station) => station.body === "terra") ?? [];
  const evidence = terraStations.filter((station) => station.archiveRole === "evidence");
  const potentials = terraStations.filter((station) => station.archiveRole === "potential");
  const evidenceRecords = report.fieldArchive?.records?.filter((record) => record.body === "terra" && record.kind === "resource-evidence") ?? [];
  if (terraStations.length !== 12 || evidence.length !== 6 || potentials.length !== 6 || evidenceRecords.length !== 6 || potentials.some((station) => report.fieldArchive.records.some((record) => record.id === station.id))) {
    fatal.push(`FIELD ARCHIVE did not preserve 6 evidence / 6 potential rows: ${JSON.stringify({ terra: terraStations.length, evidence: evidence.length, potentials: potentials.length, evidenceRecords: evidenceRecords.length })}`);
  }
  for (const [name, seen] of Object.entries(sequenceShots)) {
    if (!seen) fatal.push(`sequence never rendered required camera state: ${name}`);
  }
}
if ((report.sequence?.planets ?? 0) !== 3) fatal.push(`expected 3 planets, found ${report.sequence?.planets ?? 0}`);
if (report.monitor?.overlap) fatal.push("mission HUD overlaps the phosphor monitor");
if (report.monitor?.backing !== "308x352" || report.monitor?.greenRatio < 0.01 || report.monitor?.redRatio > 3.5e-3) {
  fatal.push(`phosphor monitor palette invalid: ${JSON.stringify(report.monitor)}`);
}
if (errors.length) fatal.push(`${errors.length} console/page error(s)`);
if (report.divergence !== "\u2014" && /mm/.test(report.divergence)) fatal.push(`CPU/GPU divergence in mm: ${report.divergence}`);
if (fatal.length) {
  console.log("\n\u2717 FAIL");
  fatal.forEach((f) => console.log("   \u2022", f));
  errors.slice(0, 12).forEach((e) => console.log("     ", e));
  process.exit(1);
}
console.log("\n\u2713 PASS \u2014 no errors, adapter present, divergence within tolerance");
