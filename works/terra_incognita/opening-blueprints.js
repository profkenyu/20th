import * as THREE from "three";
import { installDotMatrixStyles, renderDotMatrix } from "../../engine/core/dot-matrix.js";
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const PHOSPHOR = "#85f2a8";
const PHOSPHOR_RGB = "139,255,169";
const PHOSPHOR_SIGNAL_RGB = "76,218,115";
const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
const CSS = `
#ti-opening-blueprints {
  position: fixed;
  z-index: 43;
  top: var(--frame-top);
  right: 0;
  bottom: var(--frame-bottom);
  left: 0;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  background-color: #050506;
  color: #d9dde2;
  transition: opacity .62s cubic-bezier(.4, 0, .2, 1), visibility 0s linear .62s;
}
body.ti-blueprints-active #ti-opening-blueprints {
  visibility: visible;
  opacity: 1;
  transition-delay: 0s;
  transition-duration: .08s, 0s;
  transition-timing-function: linear, linear;
}
body.ti-blueprints-out #ti-opening-blueprints {
  visibility: hidden;
  opacity: 0;
}
body.ti-blueprints-active #ti-prologue {
  background: transparent;
}
body.embed #ti-opening-blueprints {
  display: none;
}
#ti-opening-blueprints::before {
  content: "";
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background-image:
    linear-gradient(rgba(139, 255, 169, .035) 1px, transparent 1px),
    linear-gradient(
      90deg,
      rgba(139, 255, 169, .035) 1px,
      transparent 1px),
    linear-gradient(rgba(139, 255, 169, .06) 1px, transparent 1px),
    linear-gradient(
      90deg,
      rgba(139, 255, 169, .06) 1px,
      transparent 1px);
  background-size:
    24px 24px,
    24px 24px,
    96px 96px,
    96px 96px;
}
#ti-opening-blueprints::after {
  content: "";
  position: absolute;
  z-index: 4;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: #050506;
}
body.ti-blueprints-active #ti-opening-blueprints::after {
  opacity: 0;
}
#ti-opening-blueprints .bp-frame {
  position: absolute;
  top: 12px;
  right: max(14px, calc(var(--safe-right) + 10px));
  bottom: 12px;
  left: max(14px, calc(var(--safe-left) + 10px));
  z-index: 1;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border: 1px solid rgba(217, 221, 226, .18);
  background-color: #08090a;
  box-shadow: 0 0 0 8px #050506, 0 0 0 9px rgba(217, 221, 226, .055);
}
#ti-opening-blueprints .bp-noise {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  place-items: center;
  visibility: hidden;
  opacity: 0;
  background: #050506;
  transition: opacity .12s linear, visibility 0s linear .12s;
}
#ti-opening-blueprints .bp-noise canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  opacity: .88;
}
#ti-opening-blueprints .bp-noise::before,
#ti-opening-blueprints .bp-noise::after {
  position: absolute;
  font:
    600 7px/1.4 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .2em;
  color: rgba(171, 255, 191, .52);
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(76, 218, 115, .22);
}
#ti-opening-blueprints .bp-noise::before {
  content: "MONITOR / SIGNAL ACQUISITION";
  top: calc(var(--frame-top) + 18px);
  left: max(18px, calc(var(--safe-left) + 14px));
}
#ti-opening-blueprints .bp-noise::after {
  content: "NO CARRIER xB7 00:00:03";
  right: max(18px, calc(var(--safe-right) + 14px));
  bottom: calc(var(--frame-bottom) + 18px);
}
#ti-opening-blueprints.bp-noise-active .bp-noise {
  visibility: visible;
  opacity: 1;
  transition-delay: 0s;
}
#ti-opening-blueprints.bp-noise-active .bp-frame {
  opacity: 0;
}
#ti-opening-blueprints.bp-residual-on .bp-noise {
  visibility: visible;
  opacity: 1;
  mix-blend-mode: screen;
}
#ti-opening-blueprints.bp-residual-on .bp-noise canvas {
  opacity: .13;
}
#ti-opening-blueprints.bp-residual-on .bp-noise::before,
#ti-opening-blueprints.bp-residual-on .bp-noise::after {
  visibility: hidden;
}
#ti-opening-blueprints.bp-residual-title {
  z-index: 45;
  visibility: visible;
  opacity: 1;
  background-color: transparent;
  transition: opacity 3.6s cubic-bezier(.4, 0, .2, 1), visibility 0s linear 0s;
}
#ti-opening-blueprints.bp-residual-title .bp-frame {
  visibility: hidden;
  opacity: 0;
}
#ti-opening-blueprints.bp-residual-title .bp-noise {
  visibility: visible;
  opacity: 1;
  background: transparent;
  mix-blend-mode: screen;
}
#ti-opening-blueprints.bp-residual-title .bp-noise canvas {
  opacity: .12;
}
#ti-opening-blueprints.bp-residual-title .bp-noise::before,
#ti-opening-blueprints.bp-residual-title .bp-noise::after {
  visibility: hidden;
}
body.ti-blueprints-out #ti-opening-blueprints.bp-residual-title {
  visibility: visible;
  opacity: 1;
}
body.ti-prologue-out #ti-opening-blueprints.bp-residual-title {
  opacity: 0;
  visibility: hidden;
  transition: opacity 3.6s cubic-bezier(.4, 0, .2, 1), visibility 0s linear 3.6s;
}
#ti-opening-blueprints .bp-head {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 16px;
  min-height: 42px;
  padding: 0 clamp(12px, 1.8vw, 25px);
  border-bottom: 1px solid rgba(217, 221, 226, .13);
  font:
    700 7px/1.35 "Space Mono",
    ui-monospace,
    monospace;
  letter-spacing: .20em;
  text-transform: uppercase;
}
#ti-opening-blueprints .bp-head span:first-child {
  color: #aeb3b9;
}
#ti-opening-blueprints .bp-head span:last-child {
  color: #c0152a;
  text-align: right;
}
#ti-opening-blueprints .bp-work {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 3.25fr) minmax(220px, 1fr);
}
#ti-opening-blueprints .bp-drawing {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid rgba(217, 221, 226, .13);
  background-image:
    radial-gradient(
      ellipse at 48% 42%,
      rgba(82, 226, 115, .026),
      transparent 58%);
  background-color: #070809;
}
#ti-opening-blueprints canvas {
  display: block;
  width: 100%;
  height: 100%;
}
#ti-opening-blueprints .bp-view-label {
  position: absolute;
  top: 12px;
  left: 14px;
  font:
    500 6px/1.4 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .18em;
  color: #626870;
  text-transform: uppercase;
}
#ti-opening-blueprints .bp-spec {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: clamp(14px, 2vw, 28px);
  background-color: #0a0b0c;
}
#ti-opening-blueprints .bp-index {
  font:
    700 6px/1.4 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .18em;
  color: #85f2a8;
  text-transform: uppercase;
}
#ti-opening-blueprints h2 {
  margin: 9px 0 8px;
  font:
    700 clamp(13px, 1.5vw, 20px)/1.15 "Space Mono",
    ui-monospace,
    monospace;
  letter-spacing: .06em;
  color: #d9dde2;
  text-transform: uppercase;
}
#ti-opening-blueprints .bp-summary {
  margin: 0 0 clamp(12px, 2vh, 22px);
  max-width: 36ch;
  font:
    400 clamp(7px, .62vw, 9px)/1.62 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .055em;
  color: #777e87;
  text-transform: uppercase;
}
#ti-opening-blueprints dl {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  min-height: 0;
}
#ti-opening-blueprints dl div {
  display: grid;
  grid-template-columns: minmax(70px, .78fr) minmax(0, 1.22fr);
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid rgba(217, 221, 226, .095);
}
#ti-opening-blueprints dt,
#ti-opening-blueprints dd {
  margin: 0;
  font:
    500 6px/1.38 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .10em;
  text-transform: uppercase;
}
#ti-opening-blueprints dt {
  color: #555b63;
}
#ti-opening-blueprints dd {
  color: #a8adb3;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
#ti-opening-blueprints .bp-parts {
  margin-top: auto;
  padding-top: 14px;
  font:
    500 6px/1.65 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .08em;
  color: #666d75;
  text-transform: uppercase;
}
#ti-opening-blueprints .bp-foot {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 16px;
  min-height: 34px;
  padding: 0 clamp(12px, 1.8vw, 25px);
  border-top: 1px solid rgba(217, 221, 226, .13);
  font:
    500 6px/1.35 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .16em;
  color: #5e646c;
  text-transform: uppercase;
}
#ti-opening-blueprints .bp-signal {
  --dot-size:1.25px;
  --dot-gap:.75px;
  --dot-character-gap:2.4px;
  --dot-colour:#85f2a8;
  --dot-off:.055;
  --dot-on:.78;
  --dot-glow:2px;
}
#ti-opening-blueprints .bp-resolution {
  color: #858b92;
  text-align: right;
}
@media (max-width: 760px) {
  #ti-opening-blueprints .bp-frame {
    top: 9px;
    right: max(10px, calc(var(--safe-right) + 7px));
    bottom: 9px;
    left: max(10px, calc(var(--safe-left) + 7px));
    box-shadow: none;
  }
  #ti-opening-blueprints .bp-head {
    min-height: 34px;
    padding: 0 10px;
    font-size: 5.5px;
    letter-spacing: .12em;
  }
  #ti-opening-blueprints .bp-work {
    grid-template-columns: minmax(0, 2.15fr) minmax(150px, 1fr);
  }
  #ti-opening-blueprints .bp-spec {
    padding: 11px;
  }
  #ti-opening-blueprints h2 {
    margin: 6px 0;
    font-size: clamp(11px, 3.1vw, 15px);
  }
  #ti-opening-blueprints .bp-summary {
    margin-bottom: 8px;
    font-size: 5.8px;
    line-height: 1.45;
  }
  #ti-opening-blueprints dl div {
    grid-template-columns: minmax(56px, .8fr) minmax(0, 1.2fr);
    gap: 6px;
    padding: 6px 0;
  }
  #ti-opening-blueprints dt,
  #ti-opening-blueprints dd {
    font-size: 5.4px;
    line-height: 1.3;
    letter-spacing: .055em;
  }
  #ti-opening-blueprints .bp-parts {
    padding-top: 8px;
    font-size: 5.2px;
    line-height: 1.48;
  }
  #ti-opening-blueprints .bp-foot {
    min-height: 27px;
    padding: 0 10px;
    font-size: 5.2px;
    letter-spacing: .09em;
  }
  #ti-opening-blueprints .bp-signal {
    --dot-size:1px;
    --dot-gap:.6px;
    --dot-character-gap:1.8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  body.ti-blueprints-active #ti-opening-blueprints::after {
    animation: none;
    opacity: 0;
  }
}
@media (max-width: 600px) and (orientation: portrait) {
  #ti-opening-blueprints .bp-work {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(150px, 1fr) auto;
  }
  #ti-opening-blueprints .bp-drawing {
    border-right: 0;
    border-bottom: 1px solid rgba(217, 221, 226, .13);
  }
  #ti-opening-blueprints .bp-spec {
    display: grid;
    grid-template-columns: minmax(0, .86fr) minmax(0, 1.14fr);
    grid-template-rows: auto auto 1fr;
    column-gap: 12px;
    padding: 9px 10px 8px;
  }
  #ti-opening-blueprints .bp-index {
    grid-column: 1;
    font-size: 5.2px;
  }
  #ti-opening-blueprints h2 {
    grid-column: 1;
    margin: 4px 0 5px;
    font-size: 11px;
  }
  #ti-opening-blueprints .bp-summary {
    grid-column: 1;
    grid-row: 3;
    margin: 0;
    font-size: 5.2px;
    line-height: 1.42;
  }
  #ti-opening-blueprints dl {
    grid-column: 2;
    grid-row: 1/4;
    align-self: stretch;
  }
  #ti-opening-blueprints dl div {
    padding: 4px 0;
  }
  #ti-opening-blueprints dt,
  #ti-opening-blueprints dd {
    font-size: 4.9px;
  }
  #ti-opening-blueprints .bp-parts {
    display: none;
  }
  #ti-opening-blueprints .bp-foot {
    grid-template-columns: 1fr auto;
    min-height: 24px;
  }
  #ti-opening-blueprints .bp-resolution {
    display: none;
  }
}
@media (max-height: 520px) and (orientation: landscape) {
  #ti-opening-blueprints .bp-frame {
    top: 6px;
    right: max(8px, calc(var(--safe-right) + 5px));
    bottom: 6px;
    left: max(8px, calc(var(--safe-left) + 5px));
  }
  #ti-opening-blueprints .bp-head {
    min-height: 28px;
  }
  #ti-opening-blueprints .bp-spec {
    padding: 8px 10px;
  }
  #ti-opening-blueprints .bp-summary {
    display: none;
  }
  #ti-opening-blueprints h2 {
    margin: 4px 0;
    font-size: 10px;
  }
  #ti-opening-blueprints dl div {
    padding: 3px 0;
  }
  #ti-opening-blueprints .bp-parts {
    display: none;
  }
  #ti-opening-blueprints .bp-foot {
    min-height: 23px;
  }
}
@media (prefers-reduced-motion: reduce) {
  #ti-opening-blueprints {
    transition-duration: .12s !important;
  }
  #ti-opening-blueprints .bp-noise canvas {
    opacity: .54;
  }
  #ti-opening-blueprints::before {
    display: none;
  }
  body.ti-blueprints-active #ti-opening-blueprints,
  body.ti-blueprints-active #ti-opening-blueprints .bp-frame,
  body.ti-blueprints-active #ti-opening-blueprints .bp-drawing,
  body.ti-blueprints-active #ti-opening-blueprints .bp-spec {
    animation: none !important;
  }
}
`;
const ROVER_CALLOUTS = Object.freeze([
  { name: "ARMOURED HULL", detail: "AVIONICS + SAMPLE VAULT" },
  { name: "8-WHEEL LOAD PATH", detail: "INDEPENDENT TERRAIN STROKE" },
  { name: "6 \xD7 12 SOLAR MATRIX", detail: "PRIMARY SURFACE POWER" },
  { name: "8 MM OPTICAL MAST", detail: "WIDE-FIELD RANGE SURVEY" },
  { name: "SAMPLE ARM", detail: "CONTACT + SPECTRAL READ" },
  { name: "LIDAR / SIGNAL", detail: "TERRAIN MAP + TELEMETRY" }
]);
const LANDER_CALLOUTS = Object.freeze([
  { name: "FOUNDATION", detail: "TERRAIN DATUM + BAY FLOOR" },
  { name: "LOAD PATHS", detail: "6-POINT FORCE DISTRIBUTION" },
  { name: "SERVICE / PRESSURE", detail: "THERMAL + PRESSURE SHELL" },
  { name: "VISOR / BRIDGE / SIGNAL", detail: "FORWARD SENSE + TRANSFER + TELEMETRY" }
]);
const ROVER_PARTS = ROVER_CALLOUTS.map((part) => part.name);
const LANDER_PARTS = LANDER_CALLOUTS.map((part) => part.name);
const LANDER_ASSEMBLY_BY_PART = Object.freeze([0, 1, 2, 2, 3, 3, 3, 3]);
export class OpeningBlueprintSequence {
  constructor({ rover, lander, tier = "mid" }) {
    installDotMatrixStyles();
    this.rover = rover;
    this.lander = lander;
    this.tier = tier;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.timing = this.reduced ? { noise: 3500, rover: 1320, roverHold: 3e3, gap: 260, lander: 1420, landerHold: 3e3 } : { noise: 3500, rover: 4e3, roverHold: 3e3, gap: 500, lander: 4200, landerHold: 3e3 };
    this.total = Object.values(this.timing).reduce((sum, ms) => sum + ms, 0);
    this.active = false;
    this.suspended = false;
    this.seen = false;
    this.elapsed = 0;
    this.startedAt = 0;
    this.current = "idle";
    this.reveal = 0;
    this.scan = 0;
    this.scanDirection = 0;
    this.scanSpeed = 0;
    this.progress = 0;
    this.annotationCount = 0;
    this.draws = 0;
    this.lastDrawAt = -Infinity;
    this.frame = 0;
    this.onComplete = null;
    this.shown = new Set();
    this.models = null;
    if (!document.getElementById("ti-opening-blueprint-style")) {
      const style = document.createElement("style");
      style.id = "ti-opening-blueprint-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement("section");
    this.el.id = "ti-opening-blueprints";
    this.el.setAttribute("aria-label", "Rover and lander production blueprints");
    this.el.setAttribute("aria-hidden", "true");
    this.el.innerHTML = `
      <div class="bp-frame">
        <header class="bp-head"><span>TI\u201301 / PRODUCTION GEOMETRY</span><span class="bp-counter">PLATE 01 / 02</span></header>
        <div class="bp-work">
          <div class="bp-drawing"><canvas aria-hidden="true"></canvas><span class="bp-view-label">AXONOMETRIC / ELEVATION / PLAN</span></div>
          <aside class="bp-spec">
            <span class="bp-index">SURFACE EXPLORATION UNIT</span><h2>Rover Blueprint</h2>
            <p class="bp-summary"></p><dl></dl><p class="bp-parts"></p>
          </aside>
        </div>
        <footer class="bp-foot"><span>ACTUAL PRODUCTION GEOMETRY \xB7 NOT ILLUSTRATION</span><span class="bp-signal"></span><span class="bp-resolution"></span></footer>
      </div>
      <div class="bp-noise" aria-hidden="true"><canvas class="bp-noise-canvas"></canvas></div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.noiseCanvas = this.el.querySelector(".bp-noise-canvas");
    this.noiseCtx = this.noiseCanvas.getContext("2d", { alpha: false });
    this.counter = this.el.querySelector(".bp-counter");
    this.index = this.el.querySelector(".bp-index");
    this.title = this.el.querySelector("h2");
    this.summary = this.el.querySelector(".bp-summary");
    this.metrics = this.el.querySelector("dl");
    this.parts = this.el.querySelector(".bp-parts");
    this.signal = this.el.querySelector(".bp-signal");
    this.resolution = this.el.querySelector(".bp-resolution");
    renderDotMatrix(this.signal, "RVR/01", { label: "ROVER PLATE 01" });
    this._resize = () => this._size();
    addEventListener("resize", this._resize, { passive: true });
    addEventListener("ti-viewportresize", this._resize);
    this._size();
  }
  start(onComplete) {
    this.cancel({ preserve: false });
    this._capture();
    this.active = true;
    this.suspended = false;
    this.seen = true;
    this.elapsed = 0;
    this.startedAt = performance.now();
    this.current = "idle";
    this.reveal = 0;
    this.scan = 0;
    this.scanDirection = 0;
    this.scanSpeed = 0;
    this.progress = 0;
    this.annotationCount = 0;
    this.draws = 0;
    this.lastDrawAt = -Infinity;
    this.onComplete = onComplete;
    this.shown.clear();
    document.body.classList.remove("ti-blueprints-out");
    document.body.classList.add("ti-blueprints-active");
    this.el.setAttribute("aria-hidden", "false");
    this._size();
    this._apply(0, true);
    this.frame = requestAnimationFrame((now) => this._tick(now));
    return true;
  }
  finish({ preserve = true } = {}) {
    this.cancel({ preserve });
  }
  cancel({ preserve = false } = {}) {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.active = false;
    this.suspended = false;
    this.scan = 0;
    this.scanDirection = 0;
    this.scanSpeed = 0;
    this.onComplete = null;
    document.body.classList.remove("ti-blueprints-active");
    this.el?.classList.remove("bp-noise-active", "bp-residual-on");
    this.el?.classList.toggle("bp-residual-title", preserve && this.seen);
    document.body.classList.toggle("ti-blueprints-out", preserve && this.seen);
    this.el?.setAttribute("aria-hidden", "true");
  }
  suspend() {
    if (!this.active || this.suspended) return;
    this.elapsed = Math.max(0, Math.min(this.total, performance.now() - this.startedAt));
    this.suspended = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  resume() {
    if (!this.active || !this.suspended) return;
    this.suspended = false;
    this.startedAt = performance.now() - this.elapsed;
    this.frame = requestAnimationFrame((now) => this._tick(now));
  }
  snapshot() {
    const describe = (model) => model ? {
      meshes: model.meshes,
      segments: model.segments,
      sourceSegments: model.sourceSegments,
      dimensions: { ...model.dimensions },
      parts: model.parts
    } : null;
    return {
      active: this.active,
      suspended: this.suspended,
      seen: this.seen,
      current: this.current,
      reveal: this.reveal,
      scan: this.scan,
      scanDirection: this.scanDirection,
      scanSpeed: this.scanSpeed,
      progress: this.progress,
      annotationCount: this.annotationCount,
      shown: [...this.shown],
      reduced: this.reduced,
      draws: this.draws,
      duration: this.total,
      models: this.models ? {
        rover: describe(this.models.rover),
        lander: describe(this.models.lander)
      } : null
    };
  }
  _capture() {
    const limit = this.tier === "low" ? 2700 : this.tier === "high" ? 6200 : 4600;
    const rover = extractRover(this.rover, limit);
    const lander = extractLander(this.lander, limit);
    rover.views = createViews(rover.coords, rover.segmentParts, rover.parts);
    lander.views = createViews(lander.coords, lander.segmentParts, lander.parts);
    this.models = { rover, lander };
  }
  _tick(now) {
    if (!this.active || this.suspended) return;
    this.elapsed = Math.max(0, now - this.startedAt);
    const cadence = this.tier === "low" ? 50 : this.tier === "high" ? 24 : 34;
    if (now - this.lastDrawAt >= cadence) {
      this.lastDrawAt = now;
      this._apply(this.elapsed);
    }
    if (this.elapsed >= this.total) {
      this._complete();
      return;
    }
    this.frame = requestAnimationFrame((time) => this._tick(time));
  }
  _apply(elapsed, force = false) {
    const stages = [
      ["noise", this.timing.noise],
      ["rover", this.timing.rover],
      ["rover-hold", this.timing.roverHold],
      ["transition", this.timing.gap],
      ["lander", this.timing.lander],
      ["lander-hold", this.timing.landerHold]
    ];
    let current = stages.at(-1)[0];
    let local = stages.at(-1)[1];
    let duration = stages.at(-1)[1];
    let offset = 0;
    for (const [name, ms] of stages) {
      if (elapsed < offset + ms) {
        current = name;
        local = elapsed - offset;
        duration = ms;
        break;
      }
      offset += ms;
    }
    if (force || current !== this.current) this._present(current);
    this.current = current;
    this.progress = clamp01(elapsed / this.total);
    if (current === "noise") {
      this.reveal = 0;
      this.scan = 0;
      this.scanDirection = 0;
      this.scanSpeed = 0;
      this.annotationCount = 0;
      this._drawNoise(local / duration);
      return;
    }
    if (current === "transition") {
      this.reveal = 0;
      this.scan = 0;
      this.scanDirection = 0;
      this.scanSpeed = 0;
      this.annotationCount = 0;
      this._drawBlackout(local / duration);
      return;
    }
    const modelKey = current.startsWith("rover") ? "rover" : "lander";
    this.shown.add(modelKey);
    if (current.endsWith("-hold")) {
      this.reveal = 1;
      this.scan = 0;
      this.scanDirection = 0;
      this.scanSpeed = 0;
      this._drawModel(this.models[modelKey], 1, 1, 1, { position: 0, direction: 0, speed: 0 });
      return;
    }
    this.reveal = this.reduced ? 1 : smooth(Math.min(1, local / Math.min(1450, duration * 0.46)));
    const detail = this.reduced ? 1 : smooth(clamp01((local - 430) / 900));
    const motion = reciprocatingScan(local, duration, this.reduced);
    this.scan = motion.position;
    this.scanDirection = motion.direction;
    this.scanSpeed = motion.speed;
    this._drawModel(this.models[modelKey], this.reveal, detail, local / duration, motion);
  }
  _present(current) {
    this.el.classList.toggle("bp-noise-active", current === "noise");
    this.el.classList.toggle("bp-residual-on", current !== "noise");
    if (current === "noise") return;
    if (current === "transition") {
      this.counter.textContent = "PLATE TRANSFER / BLACK DATUM";
      renderDotMatrix(this.signal, "--/--", { label: "PLATE TRANSFER" });
      return;
    }
    const rover = current.startsWith("rover");
    const model = this.models[rover ? "rover" : "lander"];
    const d = model.dimensions;
    const rows = rover ? [
      ["Envelope", `${d.x.toFixed(2)} W \xD7 ${d.z.toFixed(2)} L \xD7 ${d.y.toFixed(2)} H m`],
      ["Contact", "8 wheels / independent stroke"],
      ["Power", "6 \xD7 12 photovoltaic matrix"],
      ["Optics", "Twin mast / 8 mm sensor"],
      ["Survey", "Sample arm / lidar cluster"],
      ["Geometry", `${model.meshes} meshes / ${model.segments} lines`]
    ] : [
      ["Envelope", `${d.x.toFixed(2)} W \xD7 ${d.z.toFixed(2)} L \xD7 ${d.y.toFixed(2)} H m`],
      ["Service stage", "\xD8 6.10 m / faceted pressure hull"],
      ["Load paths", "6 articulated / pad centres \xD8 11.10 m"],
      ["Receiving bay", "3.02 W \xD7 4.58 D \xD7 2.82 H m"],
      ["Ramp", "3.14 W \xD7 4.90 L m"],
      ["Restoration", `4 structural systems / ${model.segments} lines`]
    ];
    this.counter.textContent = rover ? "PLATE 01 / 02 \xB7 ROVER" : "PLATE 02 / 02 \xB7 LANDER";
    this.index.textContent = rover ? "SURFACE EXPLORATION UNIT / RVR\u201301" : "AUTONOMOUS DESCENT HABITAT / LDR\u201301";
    this.title.textContent = rover ? "Rover Blueprint" : "Lander Blueprint";
    this.summary.textContent = rover ? "Eight terrain contacts, the hinged solar field and the optical mast are resolved from the machine that continues into the mission." : "Six terrain-fitted load paths and four structural systems are resolved after landing-site placement; no mission state is restored for display.";
    this.metrics.innerHTML = rows.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");
    this.parts.textContent = (rover ? ROVER_PARTS : LANDER_PARTS).join(" \xB7 ");
    renderDotMatrix(
      this.signal,
      rover ? "RVR/01" : "LDR/02",
      { label: rover ? "ROVER PLATE 01" : "LANDER PLATE 02" }
    );
    this.resolution.textContent = `${model.sourceSegments.toLocaleString()} SOURCE EDGES \u2192 ${model.segments.toLocaleString()} DISPLAY LINES`;
  }
  _size() {
    if (!this.canvas || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(this.tier === "low" ? 1 : 1.5, devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    this.dpr = dpr;
    this._sizeNoise();
    if (this.active && this.models) this._apply(this.elapsed, true);
    else this._drawBlackout(0);
  }
  _sizeNoise() {
    if (!this.noiseCanvas || !this.noiseCtx) return;
    const rect = this.noiseCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const width = Math.max(128, Math.min(360, Math.round(rect.width / 3.5)));
    const height = Math.max(72, Math.min(220, Math.round(rect.height / 3.5)));
    if (this.noiseCanvas.width === width && this.noiseCanvas.height === height) return;
    this.noiseCanvas.width = width;
    this.noiseCanvas.height = height;
    this.noiseCtx.imageSmoothingEnabled = false;
  }
  _prepareCanvas() {
    const ctx = this.ctx;
    const w = this.cssWidth ?? this.canvas.width;
    const h = this.cssHeight ?? this.canvas.height;
    ctx.setTransform(this.dpr || 1, 0, 0, this.dpr || 1, 0, 0);
    ctx.fillStyle = "#070809";
    ctx.fillRect(0, 0, w, h);
    return { ctx, w, h };
  }
  _drawBlackout(progress) {
    const { ctx, w, h } = this._prepareCanvas();
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, w, h);
    if (progress > 0.72) {
      ctx.fillStyle = `rgba(${PHOSPHOR_SIGNAL_RGB},${smooth((progress - 0.72) / 0.28) * 0.42})`;
      ctx.fillRect(w * 0.5, h * 0.5, 1, 1);
    }
    this.draws++;
  }
  _drawNoise(progress) {
    this._sizeNoise();
    const ctx = this.noiseCtx;
    const canvas = this.noiseCanvas;
    if (!ctx || !canvas?.width || !canvas?.height) return;
    const image = ctx.createImageData(canvas.width, canvas.height);
    const data = image.data;
    const gain = 0.34 + Math.min(1, progress) * 0.28;
    for (let i = 0; i < data.length; i += 4) {
      const staticLevel = Math.floor(Math.random() * 92 * gain);
      const flare = Math.random() > 0.968 ? 70 : 0;
      data[i] = staticLevel * 0.34;
      data[i + 1] = staticLevel + flare;
      data[i + 2] = staticLevel * 0.48;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = "rgba(1,5,2,.38)";
    for (let y = 1; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1);
    this.draws++;
  }
  _drawModel(model, reveal, detail, phase, motion) {
    const { ctx, w, h } = this._prepareCanvas();
    drawGrid(ctx, w, h);
    const pad = Math.max(12, Math.min(24, w * 0.026));
    const insetGap = Math.max(8, w * 0.012);
    const insetH = Math.max(54, Math.min(h * 0.235, 122));
    const main = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 - insetH - insetGap };
    const insetW = (w - pad * 2 - insetGap) / 2;
    const side = { x: pad, y: h - pad - insetH, w: insetW, h: insetH };
    const top = { x: pad + insetW + insetGap, y: h - pad - insetH, w: insetW, h: insetH };
    drawPlate(ctx, model.views.axon, main, reveal, 0.78, true);
    drawPlate(ctx, model.views.side, side, detail, 0.48, false);
    drawPlate(ctx, model.views.top, top, detail, 0.48, false);
    drawViewLabel(ctx, main, "AXONOMETRIC / ACTUAL MESH EDGES");
    drawViewLabel(ctx, side, "SIDE ELEVATION");
    drawViewLabel(ctx, top, "PLAN / LOAD ENVELOPE");
    drawReciprocatingScan(ctx, main, motion, this.reduced);
    const callouts = this.current.startsWith("rover") ? ROVER_CALLOUTS : LANDER_CALLOUTS;
    this.annotationCount = drawPartCallouts(ctx, model.views.axon, main, callouts, motion, phase, this.reduced);
    const pips = this.current.startsWith("rover") ? 0 : 1;
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i === pips ? PHOSPHOR : "#2b2e32";
      ctx.fillRect(w - pad - 15 + i * 9, pad + 1, 4, 4);
    }
    ctx.fillStyle = "rgba(217,221,226,.38)";
    ctx.font = "500 6px 'DM Mono', ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${String(Math.round(clamp01(phase) * 100)).padStart(3, "0")}% PLATE RESOLUTION`, pad, h - 4);
    this.draws++;
  }
  _complete() {
    if (!this.active) return;
    if (this.current !== "lander") this.shown.add("lander");
    this.current = "complete";
    this.progress = 1;
    this.reveal = 1;
    this.scan = 0;
    this.scanDirection = 0;
    this.scanSpeed = 0;
    const callback = this.onComplete;
    this.onComplete = null;
    this.cancel({ preserve: true });
    callback?.();
  }
}
function extractRover(rover, limit) {
  const root = rover.group;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const coords = [];
  const parts = [];
  const bounds = new THREE.Box3();
  bounds.makeEmpty();
  let meshes = 0;
  let sourceSegments = 0;
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry || object === rover.acquisitionGlow) return;
    if (/glow|particle|beam/i.test(object.name || "")) return;
    object.updateWorldMatrix(true, false);
    const base = new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld);
    const matrices = [];
    if (object.isInstancedMesh) {
      const instance = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, instance);
        matrices.push(new THREE.Matrix4().multiplyMatrices(base, instance));
      }
    } else matrices.push(base);
    const edges = new THREE.EdgesGeometry(object.geometry, 27);
    const position = edges.getAttribute("position");
    if (!position?.count) {
      edges.dispose();
      return;
    }
    const part = roverPart(object, root);
    meshes += matrices.length;
    for (const matrix of matrices) {
      expandGeometryBounds(bounds, object.geometry, matrix);
      const segmentCount = Math.floor(position.count / 2);
      sourceSegments += segmentCount;
      const step = Math.max(1, Math.ceil(segmentCount / 260));
      for (let segment = 0; segment < segmentCount; segment += step) {
        const i = segment * 2;
        _a.fromBufferAttribute(position, i).applyMatrix4(matrix);
        _b.fromBufferAttribute(position, i + 1).applyMatrix4(matrix);
        coords.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
        parts.push(part);
      }
    }
    edges.dispose();
  });
  return finaliseModel(coords, parts, bounds, meshes, sourceSegments, limit, ROVER_PARTS.length);
}
function extractLander(lander, limit) {
  lander.group.updateMatrixWorld(true);
  const coords = [];
  const parts = [];
  const bounds = new THREE.Box3();
  bounds.makeEmpty();
  let sourceSegments = 0;
  let meshes = 0;
  for (const part of lander.parts) {
    const position = part.wire?.geometry?.getAttribute("position");
    if (!position?.count) continue;
    const segmentCount = Math.floor(position.count / 2);
    sourceSegments += segmentCount;
    meshes += part.objects.length;
    for (let i = 0; i < position.count; i++) {
      _a.fromBufferAttribute(position, i);
      bounds.expandByPoint(_a);
    }
    const step = Math.max(1, Math.ceil(segmentCount / 820));
    for (let segment = 0; segment < segmentCount; segment += step) {
      const i = segment * 2;
      _a.fromBufferAttribute(position, i);
      _b.fromBufferAttribute(position, i + 1);
      coords.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
      parts.push(LANDER_ASSEMBLY_BY_PART[part.index] ?? 0);
    }
  }
  return finaliseModel(coords, parts, bounds, meshes, sourceSegments, limit, LANDER_PARTS.length);
}
function roverPart(object, root) {
  let node = object;
  let role = "";
  while (node && node !== root) {
    role = `${role} ${node.userData?.designRole ?? ""} ${node.userData?.transferPart ?? ""}`;
    node = node.parent;
  }
  if (/wheel|suspension|pivot|coil/.test(role)) return 1;
  if (/solar|panel|gimbal/.test(role)) return 2;
  if (/sample-arm|sample tool/.test(role)) return 4;
  if (/mast|camera|optical/.test(role)) return 3;
  if (/lidar|signal|communications|beacon|survey/.test(role)) return 5;
  return 0;
}
function expandGeometryBounds(target, geometry, matrix) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;
  _box.copy(geometry.boundingBox).applyMatrix4(matrix);
  target.union(_box);
}
function finaliseModel(coords, parts, bounds, meshes, sourceSegments, limit, partCount) {
  const count = parts.length;
  let finalCoords;
  let finalParts;
  if (count <= limit) {
    finalCoords = new Float32Array(coords);
    finalParts = new Uint8Array(parts);
  } else {
    finalCoords = new Float32Array(limit * 6);
    finalParts = new Uint8Array(limit);
    for (let i = 0; i < limit; i++) {
      const source = Math.min(count - 1, Math.floor(i * count / limit));
      finalCoords.set(coords.slice(source * 6, source * 6 + 6), i * 6);
      finalParts[i] = parts[source];
    }
  }
  const size = bounds.getSize(new THREE.Vector3());
  return {
    coords: finalCoords,
    segmentParts: finalParts,
    segments: finalParts.length,
    sourceSegments,
    meshes,
    parts: partCount,
    dimensions: { x: size.x, y: size.y, z: size.z }
  };
}
function createViews(coords, parts, partCount) {
  const axon = project(coords, parts, "axon");
  axon.anchors = partAnchors(axon, partCount);
  return {
    axon,
    side: project(coords, parts, "side"),
    top: project(coords, parts, "top")
  };
}
function partAnchors(view, partCount) {
  const sums = Array.from({ length: partCount }, () => ({ x: 0, y: 0, count: 0 }));
  for (let i = 0; i < view.parts.length; i++) {
    const part = sums[view.parts[i]];
    if (!part) continue;
    const j = i * 4;
    part.x += (view.points[j] + view.points[j + 2]) * 0.5;
    part.y += (view.points[j + 1] + view.points[j + 3]) * 0.5;
    part.count++;
  }
  const width = Math.max(1e-6, view.bounds.maxX - view.bounds.minX);
  const height = Math.max(1e-6, view.bounds.maxY - view.bounds.minY);
  return sums.map((part, index) => {
    const x = part.count ? part.x / part.count : view.bounds.minX + width * ((index + 1) / (partCount + 1));
    const y = part.count ? part.y / part.count : view.bounds.minY + height * 0.5;
    return {
      x,
      y,
      nx: clamp01((x - view.bounds.minX) / width)
    };
  });
}
function project(coords, parts, mode) {
  const points = new Float32Array(parts.length * 4);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < parts.length; i++) {
    for (let endpoint = 0; endpoint < 2; endpoint++) {
      const offset = i * 6 + endpoint * 3;
      const x = coords[offset], y = coords[offset + 1], z = coords[offset + 2];
      let px;
      let py;
      if (mode === "top") {
        px = x;
        py = z;
      } else if (mode === "side") {
        px = z;
        py = -y;
      } else {
        const yaw = -0.66, pitch = -0.36;
        const xr = x * Math.cos(yaw) - z * Math.sin(yaw);
        const zr = x * Math.sin(yaw) + z * Math.cos(yaw);
        px = xr;
        py = -(y * Math.cos(pitch) - zr * Math.sin(pitch));
      }
      points[i * 4 + endpoint * 2] = px;
      points[i * 4 + endpoint * 2 + 1] = py;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }
  return { points, parts, bounds: { minX, minY, maxX, maxY } };
}
function drawGrid(ctx, w, h) {
  const minor = Math.max(18, Math.min(30, w / 26));
  ctx.save();
  ctx.lineWidth = 1;
  for (let x = minor; x < w; x += minor) {
    ctx.strokeStyle = Math.round(x / minor) % 4 ? "rgba(217,221,226,.052)" : "rgba(217,221,226,.125)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = minor; y < h; y += minor) {
    ctx.strokeStyle = Math.round(y / minor) % 4 ? "rgba(217,221,226,.052)" : "rgba(217,221,226,.125)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(139,255,169,.30)";
  ctx.beginPath();
  for (let x = minor, i = 1; x < w; x += minor, i++) {
    const tick = i % 4 ? 3 : 7;
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, tick);
    ctx.moveTo(x + 0.5, h);
    ctx.lineTo(x + 0.5, h - tick);
  }
  for (let y = minor, i = 1; y < h; y += minor, i++) {
    const tick = i % 4 ? 3 : 7;
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(tick, y + 0.5);
    ctx.moveTo(w, y + 0.5);
    ctx.lineTo(w - tick, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}
function drawPlate(ctx, view, rect, reveal, alpha, primary) {
  ctx.strokeStyle = "rgba(217,221,226,.105)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.w - 1), Math.max(0, rect.h - 1));
  const b = view.bounds;
  const bw = Math.max(1e-6, b.maxX - b.minX);
  const bh = Math.max(1e-6, b.maxY - b.minY);
  const margin = primary ? Math.min(rect.w, rect.h) * 0.085 : Math.min(rect.w, rect.h) * 0.12;
  const scale = Math.min((rect.w - margin * 2) / bw, (rect.h - margin * 2) / bh);
  const ox = rect.x + rect.w * 0.5 - (b.minX + b.maxX) * 0.5 * scale;
  const oy = rect.y + rect.h * 0.5 - (b.minY + b.maxY) * 0.5 * scale;
  const count = view.parts.length;
  const faint = primary ? 0.055 : 0.035;
  strokeSegments(ctx, view, count, scale, ox, oy, `rgba(217,221,226,${faint})`, primary ? 0.72 : 0.58);
  const visible = Math.max(0, Math.min(count, Math.floor(count * clamp01(reveal))));
  if (!visible) return;
  strokeSegments(ctx, view, visible, scale, ox, oy, `rgba(217,221,226,${alpha})`, primary ? 0.82 : 0.68);
  if (primary && reveal < 0.998) {
    const start = Math.max(0, visible - Math.ceil(count * 0.035));
    strokeSegments(ctx, view, visible, scale, ox, oy, `rgba(${PHOSPHOR_RGB},.72)`, 1.05, start);
  }
}
function strokeSegments(ctx, view, end, scale, ox, oy, colour, width, start = 0) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let i = start; i < end; i++) {
    const j = i * 4;
    ctx.moveTo(ox + view.points[j] * scale, oy + view.points[j + 1] * scale);
    ctx.lineTo(ox + view.points[j + 2] * scale, oy + view.points[j + 3] * scale);
  }
  ctx.stroke();
}
function drawViewLabel(ctx, rect, label) {
  ctx.fillStyle = "rgba(217,221,226,.34)";
  ctx.font = "500 6px 'DM Mono', ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(label, rect.x + 7, rect.y + 12);
  ctx.fillStyle = `rgba(${PHOSPHOR_RGB},.48)`;
  ctx.fillRect(rect.x + 7, rect.y + 17, 18, 1);
}
function drawPartCallouts(ctx, view, rect, callouts, motion, phase, reduced) {
  const held = phase >= 0.995;
  const returning = held || phase > 0.5 && motion.direction <= 0;
  if (!returning || !view.anchors?.length) return 0;
  const b = view.bounds;
  const bw = Math.max(1e-6, b.maxX - b.minX);
  const bh = Math.max(1e-6, b.maxY - b.minY);
  const margin = Math.min(rect.w, rect.h) * 0.085;
  const scale = Math.min((rect.w - margin * 2) / bw, (rect.h - margin * 2) / bh);
  const ox = rect.x + rect.w * 0.5 - (b.minX + b.maxX) * 0.5 * scale;
  const oy = rect.y + rect.h * 0.5 - (b.minY + b.maxY) * 0.5 * scale;
  const leftCount = Math.ceil(callouts.length / 2);
  const rightCount = Math.floor(callouts.length / 2);
  const inset = Math.max(6, Math.min(10, rect.w * 0.012));
  const labelWidth = Math.max(72, Math.min(142, rect.w * 0.31));
  const top = rect.y + Math.max(34, rect.h * 0.14);
  const bottom = rect.y + rect.h - Math.max(22, rect.h * 0.09);
  const nameSize = rect.w < 390 ? 4.8 : 5.8;
  const detailSize = rect.w < 390 ? 4.2 : 5;
  let visible = 0;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < callouts.length; i++) {
    const anchor = view.anchors[i];
    if (!anchor) continue;
    const ax = ox + anchor.x * scale;
    const ay = oy + anchor.y * scale;
    const scanThreshold = clamp01((ax - rect.x) / Math.max(1, rect.w));
    const alpha = held ? 1 : reduced ? phase >= 0.5 ? 1 : 0 : smooth(clamp01((scanThreshold - motion.position) / 0.055));
    if (alpha <= 0.015) continue;
    visible++;
    const right = i % 2 === 1;
    const lane = Math.floor(i / 2);
    const laneCount = right ? rightCount : leftCount;
    const ly = laneCount <= 1 ? (top + bottom) * 0.5 : top + (bottom - top) * lane / (laneCount - 1);
    const labelX = right ? rect.x + rect.w - inset : rect.x + inset;
    const lineEnd = right ? labelX - labelWidth : labelX + labelWidth;
    const elbow = right ? Math.max(ax + 10, lineEnd - 14) : Math.min(ax - 10, lineEnd + 14);
    ctx.fillStyle = `rgba(7,8,9,${0.72 * alpha})`;
    ctx.fillRect(right ? labelX - labelWidth - 3 : labelX - 3, ly - 9, labelWidth + 6, 19);
    ctx.strokeStyle = `rgba(${PHOSPHOR_RGB},${0.22 + 0.38 * alpha})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(elbow, ly);
    ctx.lineTo(lineEnd, ly);
    ctx.stroke();
    ctx.fillStyle = `rgba(${PHOSPHOR_RGB},${0.58 + 0.34 * alpha})`;
    ctx.beginPath();
    ctx.arc(ax, ay, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = right ? "right" : "left";
    ctx.font = `700 ${nameSize}px 'Space Mono', ui-monospace, monospace`;
    ctx.fillStyle = `rgba(217,221,226,${0.62 + 0.32 * alpha})`;
    ctx.fillText(callouts[i].name, labelX, ly - 1.5);
    ctx.font = `500 ${detailSize}px 'DM Mono', ui-monospace, monospace`;
    ctx.fillStyle = `rgba(${PHOSPHOR_RGB},${0.44 + 0.28 * alpha})`;
    ctx.fillText(callouts[i].detail, labelX, ly + 6);
  }
  if (visible) {
    ctx.textAlign = "right";
    ctx.font = `600 ${detailSize}px 'DM Mono', ui-monospace, monospace`;
    ctx.fillStyle = `rgba(${PHOSPHOR_RGB},.62)`;
    ctx.fillText("RETURN / COMPONENT REGISTER", rect.x + rect.w - 7, rect.y + 12);
  }
  ctx.restore();
  return visible;
}
function reciprocatingScan(local, duration, reduced) {
  if (reduced) return { position: 0.5, direction: 0, speed: 0 };
  const t = clamp01(local / Math.max(1, duration));
  const theta = Math.PI * 2 * t + Math.sin(Math.PI * 4 * t) * 0.035;
  const velocity = Math.sin(theta);
  const speed = Math.abs(velocity);
  return {
    position: 0.5 - Math.cos(theta) * 0.5,
    direction: speed < 0.025 ? 0 : velocity > 0 ? 1 : -1,
    speed
  };
}
function drawReciprocatingScan(ctx, rect, motion, reduced) {
  const x = rect.x + 1 + Math.max(0, rect.w - 2) * clamp01(motion.position);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!reduced && motion.direction && motion.speed > 0.01) {
    const trailWidth = 4 + motion.speed * 22;
    const from = motion.direction > 0 ? x - trailWidth : x;
    const to = motion.direction > 0 ? x : x + trailWidth;
    const trail = ctx.createLinearGradient(from, 0, to, 0);
    const trailAlpha = 0.105 * motion.speed;
    if (motion.direction > 0) {
      trail.addColorStop(0, `rgba(${PHOSPHOR_RGB},0)`);
      trail.addColorStop(1, `rgba(${PHOSPHOR_RGB},${trailAlpha})`);
    } else {
      trail.addColorStop(0, `rgba(${PHOSPHOR_RGB},${trailAlpha})`);
      trail.addColorStop(1, `rgba(${PHOSPHOR_RGB},0)`);
    }
    ctx.fillStyle = trail;
    ctx.fillRect(from, rect.y, trailWidth, rect.h);
  }
  ctx.strokeStyle = `rgba(${PHOSPHOR_RGB},${reduced ? 0.34 : 0.48 + motion.speed * 0.16})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, rect.y);
  ctx.lineTo(x, rect.y + rect.h);
  ctx.stroke();
  ctx.restore();
}
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _box = new THREE.Box3();
