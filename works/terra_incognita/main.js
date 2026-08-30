import * as THREE from "three";
import {
  configure,
  deviceTier,
  universeSeed,
  DEV,
  Clipmap,
  Field,
  Scatter,
  Wake,
  Dust,
  GraniteField,
  Sandstorm,
  ResolutionTransferFX,
  MatterPassage,
  Beam,
  buildSky,
  createRenderer,
  describeAdapter,
  unsupported,
  fatal,
  enableTimestamps,
  captureDeviceErrors,
  Lens,
  Adaptive,
  Hud,
  Captions,
  Kiosk,
  Ambient,
  MobileControl,
  Restoration,
  WaterMission,
  MissionMemory,
  GeologicalMemory,
  DockingSequence,
  VoyageSequence,
  ShotDirector,
  Rover,
  Lander,
  Power,
  uObserverR,
  nuRatioCPU,
  uLampPower
} from "../../engine/index.js";
import { T, BH, TERRA_SAMPLE_SITES, BODY02_WATER_SITE } from "./spec.js";
import {
  heightGPU,
  heightCPU,
  solarAccessCPU,
  potential,
  shadeGround,
  albedoGround,
  shadeBlade,
  shadeSky,
  setWorldMode
} from "./surface.js";
import { MiniMap, Optics, Survey } from "../../engine/core/survey.js";
import { OpeningBlueprintSequence } from "./opening-blueprints.js";
import { AnimeRituals } from "./anime-rituals.js";
const touchTerminal = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0 && (matchMedia("(any-pointer: coarse)").matches || matchMedia("(hover: none)").matches);
const tier = touchTerminal ? "low" : deviceTier();
const pick = (o) => o[tier];
const ARCHIVE_AT_BOOT = tier === "low";
const CFG = configure({
  tier,
  lattice: { seed: T.seedBase + universeSeed() >>> 0 },
  metric: { rs: BH.rs },
  scatter: {
    rings: [
      { r0: 0, r1: 25.5, seg: 6, cell: pick({ high: 0.085, mid: 0.125, low: 0.21 }) },
      { r0: 22, r1: 67.5, seg: 3, cell: pick({ high: 0.29, mid: 0.42, low: 0.7 }) },
      { r0: 64, r1: 136, seg: 1, cell: pick({ high: 0.66, mid: 1, low: 1.75 }) }
    ],
    fadeBand: 3.5,
    clumpCell: 2.35,
    minPixels: 1.3,
    length: 0.58,
    width: 0.019,
    bend: 0.62,
    breath: 0.17,
    breathRate: 0.21,
    spineBoost: 0.95,
    slopeGate: [0.055, 0.3]
  },
  vehicle: { cruise: 2, boost: 6 },
  atmosphere: { fogDensity: 0 },
  post: {
    bloomStrength: 0.014,
    bloomRadius: 0.27,
    bloomThreshold: 1.32,
    focusMin: 2,
    focusMax: 90,
    focalLength: 0.105,
    bokeh: 0.34
  },
  kiosk: { idleMs: 48e4 },
  audio: { droneEmitR: BH.rs * 1.01 }
});
const LINES = [
  {
    r: 540,
    ko: "\uD1B5\uC2E0 \uBC18\uC1A1\uD30C \uBBF8\uAC80\uCD9C \xB7 \uC655\uBCF5 \uC9C0\uC5F0 \uC0B0\uCD9C \uBD88\uAC00",
    en: "COMMS \xB7 RETURN CARRIER NOT ACQUIRED"
  },
  {
    r: 500,
    ko: "\uAD11\uBB3C\uCE35 \uBE44\uB4F1\uBC29 \uC804\uB2E8 \uBC30\uC5F4 \uAC80\uCD9C \xB7 \uBC29\uC0AC \uB300\uCE6D \uBD88\uC77C\uCE58",
    en: "GEOLOGY \xB7 ANISOTROPIC SHEAR LAMINAE"
  },
  {
    r: 380,
    ko: "\uB300\uAE30 \uC131\uBD84 \uBBF8\uB7C9 \uAC80\uCD9C \xB7 \uC2E0\uD638\uB300\uC7A1\uC74C\uBE44 \uAE30\uC900 \uBBF8\uB2EC",
    en: "ATMOSPHERE \xB7 TRACE BELOW CONFIDENCE THRESHOLD"
  },
  {
    r: 312.97,
    ko: "\uC911\uB825 \uD37C\uD150\uC15C \uAD6D\uC18C \uADF9\uAC12 \xB7 r = 312.97 m",
    en: "GRAVITY \xB7 LOCAL EXTREMUM / R 312.97 M"
  },
  {
    r: 250,
    ko: "\uC8FC\uBCC0 \uC0DD\uCCB4 \uC2E0\uD638 0 \xB7 \uC218\uB3D9 \uC751\uB2F5 \uCC44\uB110 \uBB34\uC785\uB825",
    en: "BIOSCAN \xB7 LOCAL SIGNALS 0 / MANUAL CHANNEL IDLE"
  },
  {
    r: 150,
    ko: "\uBC29\uC0AC\uC120 \uD50C\uB7ED\uC2A4 \uC0C1\uC2B9 \xB7 \uD0DC\uC591\uC804\uC9C0 \uCD9C\uB825 \uC720\uC9C0",
    en: "RADIATION \xB7 FLUX RISING / ARRAY OUTPUT NOMINAL"
  },
  {
    r: 74.23,
    ko: "\uAC01\uC6B4\uB3D9\uB7C9 \uC7A5\uBCBD \uAC80\uCD9C \xB7 \uBD88\uC548\uC815 \uC6D0\uADA4\uB3C4 r = 74.23 m",
    en: "GRAVITY \xB7 UNSTABLE ORBIT / R 74.23 M"
  },
  {
    r: 60,
    ko: "\uD3D0\uACE1\uC120 \uAD11\uACBD\uB85C \uAC80\uCD9C \xB7 \uAD11\uC790\uAD6C\uBA74 r = 60.00 m",
    en: "OPTICS \xB7 CLOSED NULL PATH / R 60.00 M"
  },
  {
    r: 45,
    ko: "\uAD00\uCE21 \uAD11\uB3C4 1.4% \xB7 \uC801\uC0C9\uD3B8\uC774 \uBCF4\uC815 \uD55C\uACC4 \uC811\uADFC",
    en: "OPTICS \xB7 OBSERVED LUMINANCE 1.4% / CORRECTION LIMIT"
  },
  {
    r: 41,
    ko: "\uC88C\uD45C \uC2DC\uAC04 \uBC1C\uC0B0 \xB7 \uC678\uBD80 \uAE30\uC900 \uB3C4\uB2EC\uAC12 \uC5C6\uC74C",
    en: "METRIC \xB7 COORDINATE TIME DIVERGENT / ARRIVAL UNDEFINED"
  }
];
const TERRA_SURVEY = [
  [540, "COMMS \xB7 RETURN CARRIER / NOT ACQUIRED"],
  [500, "GEOLOGY \xB7 ANISOTROPIC SHEAR LAMINAE"],
  [380, "ATMOSPHERE \xB7 TRACE / BELOW THRESHOLD"],
  [313, "GRAVITY \xB7 ORBITAL ANOMALY / LOCKED"],
  [250, "BIOSCAN \xB7 LOCAL SIGNALS / 0"],
  [150, "RADIATION \xB7 FLUX RISING"],
  [74.23, "GRAVITY \xB7 ANGULAR BARRIER"],
  [60, "OPTICS \xB7 PHOTON SHELL"],
  [45, "ATMOSPHERE \xB7 SIGNAL LOST"]
];
const DESERT_SURVEY = [
  [500, "COMMS \xB7 RETURN CARRIER / NOT ACQUIRED"],
  [460, "ELECTROSTATIC \xB7 CHARGED SILICATE HOPS"],
  [350, "THERMAL \xB7 NIGHT-SIDE INERTIA LOW"],
  [245, "GROUND \xB7 YARDANG / SINTERED CRUST"],
  [140, "MINERAL \xB7 GLASS PHASE / DISCONTINUOUS"],
  [90, "BIOSCAN \xB7 LOCAL SIGNALS / 0"]
];
const DESERT_LINES = [
  { r: 500, ko: "\uD1B5\uC2E0 \uBC18\uC1A1\uD30C \uBBF8\uAC80\uCD9C \xB7 \uC6D0\uACA9 \uC6B4\uC6A9 \uCC44\uB110 \uB300\uAE30", en: "COMMS \xB7 RETURN CARRIER NOT ACQUIRED" },
  { r: 460, ko: "\uADDC\uC0B0\uC5FC \uD558\uC804 \uC785\uC790 \uAC80\uCD9C \xB7 \uC774\uB3D9 \uACBD\uB85C \uD655\uC778", en: "ELECTROSTATIC \xB7 CHARGED SILICATE HOPS" },
  { r: 350, ko: "\uC57C\uAC04 \uC9C0\uD45C \uC5F4\uAD00\uC131 \uC800\uD558", en: "THERMAL \xB7 NIGHT-SIDE INERTIA LOW" },
  { r: 245, ko: "\uC57C\uB974\uB2F9 \uB2A5\uC120\xB7\uC18C\uACB0 \uC9C0\uAC01 \uAD50\uCC28 \uAC80\uCD9C \xB7 \uD45C\uBA74 \uBAA8\uB378 \uAC31\uC2E0", en: "GROUND \xB7 YARDANG / SINTERED CRUST" },
  { r: 140, ko: "\uC720\uB9AC\uC9C8 \uAD11\uBB3C\uC0C1 \uBD88\uC5F0\uC18D \uBD84\uD3EC \xB7 \uBC18\uC0AC\uC728 \uD3B8\uCC28 \uC99D\uAC00", en: "MINERAL \xB7 GLASS PHASE / ALBEDO VARIANCE" },
  { r: 90, ko: "\uC8FC\uBCC0 \uC0DD\uCCB4 \uC2E0\uD638 0 \xB7 \uC751\uB2F5 \uD328\uD0B7 0", en: "BIOSCAN \xB7 LOCAL SIGNALS 0 / RETURN PACKETS 0" }
];
const GRANITE_SURVEY = [
  [520, "MEMORY \xB7 CROSS-PLANET FIELD SYNTHESIS"],
  [410, "LITHOLOGY \xB7 QUARTZ / FELDSPAR / MICA"],
  [300, "STRUCTURE \xB7 CONJUGATE JOINT SETS"],
  [190, "WEATHERING \xB7 EXFOLIATION DOMES"]
];
const GRANITE_LINES = [
  { r: 520, ko: "\uD589\uC131 \uAC04 \uAE30\uC5B5\uC7A5 \uD569\uC131 \xB7 \uC138 \uAC1C \uAD50\uCC28 \uACB0\uC808 \uC0DD\uC131", en: "MEMORY SYNTHESIS \xB7 THREE CONCORDANCE NODES GENERATED" },
  { r: 410, ko: "\uAD11\uBB3C \uBC18\uC0AC \uBD84\uB9AC", en: "LITHOLOGY \xB7 QUARTZ / FELDSPAR / MICA" },
  { r: 300, ko: "\uB450 \uC808\uB9AC \uAD50\uCC28 \xB7 \uC0B0\uD654\uBA74 \uAC80\uCD9C", en: "STRUCTURE \xB7 CONJUGATE JOINT SETS" },
  { r: 190, ko: "\uD48D\uD654 \uAD6C\uC870 \uAC80\uCD9C", en: "WEATHERING \xB7 EXFOLIATION DOMES / TORS" }
];
const DOCKING_LINES = Object.freeze({
  recall: { r: 0, ko: "\uAD6C\uC870\uC7AC 5/5 \xB7 \uC790\uC6D0 3/3 \xB7 \uADC0\uD658 \uC88C\uD45C \uC555\uCD95", en: "STRUCTURE 5/5 \xB7 RESERVES 3/3 \xB7 COORDINATE RECALL" },
  ramp: { r: 0, ko: "\uCC29\uB959\uC120 \uACA9\uB0A9 \uACBD\uB85C \uAC1C\uBC29", en: "LANDER \xB7 STOW PATH OPENING" },
  approach: { r: 0, ko: "\uC2E4\uC811\uC9C0 \uADC0\uD658 \xB7 8\uB95C \uAD6C\uB3D9 \uC720\uC9C0", en: "FINAL APPROACH \xB7 EIGHT CONTACTS LIVE" },
  secure: { r: 0, ko: "\uACA9\uB0A9 \uC704\uCE58 \uACE0\uC815 \xB7 \uAD6C\uC870\uAD11 \uC18C\uAC70", en: "ROVER SECURED \xB7 LOCATORS FALL SILENT" },
  docked: { r: 0, ko: "\uD0D0\uC0AC\uC120 \uACA9\uB0A9 \uC644\uB8CC \xB7 \uBE44\uD589 \uC7A0\uAE08", en: "ROVER STOWED \xB7 FLIGHT INTERLOCK" }
});
const VOYAGE_LINES = Object.freeze({
  "flight-lock": { r: 0, ko: "\uACA9\uB0A9 \uC9C8\uB7C9 \uACE0\uC815 \xB7 \uBE44\uD589 \uC778\uD130\uB85D \uD574\uC81C", en: "STOW MASS LOCKED \xB7 FLIGHT INTERLOCK RELEASED" },
  fold: { r: 0, ko: "6\uAC1C \uCC29\uB959 \uC9C0\uC9C0\uACC4 \uC218\uB0A9", en: "SIX LANDING LOAD PATHS \xB7 RETRACTING" },
  lift: { r: 0, ko: "\uD45C\uBA74 \uAE30\uC900 \uBD84\uB9AC \xB7 \uC800\uC18D \uC0C1\uC2B9", en: "SURFACE DATUM RELEASED \xB7 LOW ASCENT" },
  transit: { r: 0, ko: "\uAD00\uC131 \uAE30\uC900 \uC804\uD658 \xB7 \uBAA9\uC801\uC9C0 \uC88C\uD45C \uB3D9\uAE30", en: "INERTIAL FRAME \xB7 DESTINATION COORDINATES LOCKED" },
  descent: { r: 0, ko: "\uB2E4\uC74C \uD589\uC131 \uC9C0\uD45C \uD68D\uB4DD \xB7 \uD558\uAC15", en: "NEXT PLANET ACQUIRED \xB7 CONTROLLED DESCENT" },
  touchdown: { r: 0, ko: "6\uC810 \uC811\uC9C0 \uD655\uC778", en: "SIX-POINT GROUND CONTACT CONFIRMED" },
  egress: { r: 0, ko: "\uACA9\uB0A9 \uD574\uC81C \xB7 \uD0D0\uC0AC\uC120 \uC7AC\uBC30\uCE58", en: "STOW RELEASE \xB7 ROVER REDEPLOYMENT" },
  epilogue: { r: 0, ko: "\uB450 \uBC88\uC9F8 \uD45C\uBA74\uC5D0 \uCCAB \uC88C\uD45C\uAC00 \uB0A8\uB294\uB2E4", en: "PLANET 02 \xB7 THE FIRST COORDINATE REMAINS" }
});
const DESERT_START = [96, 520];
const PLANETS = Object.freeze({
  terra: Object.freeze({
    key: "terra",
    number: 1,
    id: "PLANET 01",
    label: "SHEAR WORLD",
    start: BH.start,
    mode: "terra",
    metric: true,
    storm: false,
    initialCharge: 1,
    lines: LINES,
    survey: TERRA_SURVEY,
    next: "desert",
    mission: "loadout"
  }),
  desert: Object.freeze({
    key: "desert",
    number: 2,
    id: "PLANET 02",
    label: "YARDANG FIELD",
    start: DESERT_START,
    mode: "desert",
    metric: false,
    storm: false,
    initialCharge: 0.86,
    lines: DESERT_LINES,
    survey: DESERT_SURVEY,
    next: "granite",
    mission: "water"
  }),
  granite: Object.freeze({
    key: "granite",
    number: 3,
    id: "PLANET 03",
    label: "JOINTED GRANITE",
    start: [120, 460],
    mode: "granite",
    metric: false,
    storm: false,
    initialCharge: 0.9,
    lines: GRANITE_LINES,
    survey: GRANITE_SURVEY,
    next: null,
    mission: "geological-memory"
  })
});
const COMPLETION_TABLEAU_MS = 5400;
const COMPLETION_CAPTION = Object.freeze({
  r: 0,
  ko: "\uCC29\uB959\uC120 \uC678\uBD80 \uAD6C\uC131 \uC644\uB8CC \xB7 \uAD6C\uC870\uC7AC 5\uC885 \xB7 \uC790\uC6D0 \uAC8C\uC774\uC9C0 3\uACC4\uD1B5 \uCDA9\uC804",
  en: "LANDER SHELL FIXED \xB7 FIVE STRUCTURES \xB7 THREE RESERVES CHARGED"
});
const OPENING_CAMERA_MS = 6e3;
const BLUEPRINT_BREATH_MS = 1200;
const DOCKED_BREATH_MS = 2800;
const ARRIVAL_BREATH_MS = 3e3;
const WATER_CONFIRM_BREATH_MS = 4800;
const FINAL_TABLEAU_MS = 12e3;
const EXPLORER_IDLE_MS = 12e3;
const DRIVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
]);
const DIAGNOSTIC_ROWS = [
  ["Instrument", [["backend", "Backend"], ["vendor", "Vendor"], ["tier", "Tier"], ["mode", "Render mode"], ["limits", "Limits"]]],
  ["Surface", [["grid", "Grid"], ["tris", "Triangles"], ["gridCell", "Cell"], ["span", "Span"]]],
  ["Clipmap", [
    ["origin", "Origin"],
    ["recentre", "Recentres"],
    ["rcT", "rebuild \xB7 ground"],
    ["rcF", "rebuild \xB7 field"],
    ["rcL", "rebuild \xB7 filaments"]
  ]],
  ["Field", [["fcount", "Instances"], ["fverts", "Vertices"], ["frings", "Rings"], ["fgrid", "Field grid"]]],
  ["Probe", [
    ["pos", "Position"],
    ["ground", "Ground"],
    ["speed", "Speed"],
    ["odo", "Odometer"],
    ["att", "Pitch / roll"],
    ["trac", "Traction"],
    ["lamps", "Headlights"],
    ["susp", "Suspension"],
    ["view", "View"]
  ]],
  ["Power", [
    ["cell", "Cell"],
    ["array", "Array"],
    ["lid", "Lid"],
    ["load", "Load"],
    ["endur", "Endurance"]
  ]],
  ["Reconstruction", [["recon", "Lander modules"]]],
  ["Metric", [["r", "r \xB7 observer"], ["region", "Region"], ["lapse", "\u221A(1\u2212rs/r)"], ["nu", "\u03BD at barrier"]]],
  ["Lens", [["dpr", "Pixel ratio"], ["focus", "Focus"], ["score", "Score"]]],
  ["Gallery", [["universe", "Universe"], ["idle", "Idle"]]],
  ["Verification", [["hcpu", "h \xB7 cpu"], ["hgpu", "h \xB7 gpu"], ["delta", "Divergence"]]]
];
const GALLERY_ROWS = [
  ["Mission", [["recon", "Recovery"], ["r", "Range"], ["region", "Region"]]],
  ["Rover", [["speed", "Speed"], ["trac", "Traction"], ["cell", "Power"], ["endur", "Endurance"]]],
  ["Signal", [["score", "Sound"], ["universe", "Universe"]]]
];
const HALT = () => new Promise(() => {
});
const SAFE = location.search.includes("safe");
const TEST = DEV || location.search.includes("test");
const OFF = new Set(location.search.replace(/^\?/, "").split(/[&,]/).filter(Boolean));
const off = (name) => SAFE || OFF.has("no" + name);
addEventListener("error", (e) => fatal(e.error ?? e.message, "window"));
addEventListener("unhandledrejection", (e) => fatal(e.reason, "promise"));
if (!navigator.gpu) {
  unsupported("api", "Terra Incognita");
  await HALT();
}
window.TI_BOOT?.beat("device");
const canvas = document.getElementById("gl");
let renderer, camera;
try {
  ({ renderer, camera } = createRenderer(canvas));
} catch (e) {
  fatal(e, "renderer");
  await HALT();
}
try {
  await renderer.init();
} catch (e) {
  fatal(e, "device");
  await HALT();
}
if (renderer.backend?.isWebGPUBackend !== true) {
  unsupported("adapter");
  await HALT();
}
const GPU_PROFILE = describeAdapter(renderer);
if (!GPU_PROFILE.supported) {
  unsupported(GPU_PROFILE.compatibility ? "compatibility" : "limits");
  await HALT();
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
captureDeviceErrors(renderer, handleGpuFault);
window.TI_BOOT?.beat("world");
let scene, hud, captions, ambient, kiosk, ground, field, wake, dust, graniteField, storm, transferFx, matterPassage, scatter, beam, sky, landmark, rover, lander, restoration, waterMission, missionMemory, geologicalMemory, docking, voyage, shotDirector, power, lens, adaptive, minimap, optics, survey, mobileControl, openingBlueprints, animeRituals;
let world = "terra";
let landerPresent = true;
let archiveMode = false, greenMonitorManual = false, rawMonitorManual = false;
let lastArchiveFrame = 0, archiveCueTimer = 0;
let openingShot = null;
let completionTableau = null;
let failureResetAt = 0;
let nextAutoPauseAt = 0, autoPauseUntil = 0;
let driveReleaseAt = 0, dockedHoldUntil = 0;
let pendingArrival = null, finalTableau = null;
let experienceMode = "observer", lastExplorerIntent = -Infinity;
let released = false;
let prologuePhase = "blueprints";
let entryRevealRequested = false;
let soundControl = null, greenControl = null, desktopStart = null;
let running = false, hasTimestamp = false;
let rafId = 0, loopGeneration = 0, frameInFlight = false;
let tPrev = 0, tStamp = 0, tProbe = 0, frames = 0, acc = 0;
const rc = { ground: 0, field: 0, scatter: 0 };
try {
  scene = new THREE.Scene();
  hud = new Hud(TEST ? DIAGNOSTIC_ROWS : GALLERY_ROWS, "recentre", { diagnostic: TEST });
  hud.setExperience("observer");
  captions = new Captions(LINES);
  ambient = new Ambient();
  soundControl = document.getElementById("ti-sound");
  soundControl.disabled = !location.search.includes("embed");
  soundControl.setAttribute("aria-hidden", String(soundControl.disabled));
  ambient.bindControl(soundControl);
  greenControl = document.getElementById("ti-green");
  greenControl?.addEventListener("pointerdown", (event) => event.stopPropagation());
  greenControl?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const forcedGreen = archiveMode || mobileControl?.active && released;
    const active = !rawMonitorManual && (forcedGreen || greenMonitorManual);
    if (active) {
      greenMonitorManual = false;
      rawMonitorManual = forcedGreen;
    } else {
      rawMonitorManual = false;
      greenMonitorManual = !forcedGreen;
    }
    syncGreenMonitor();
  });
  syncGreenMonitor();
  kiosk = new Kiosk(CFG.kiosk.idleMs);
  wake = new Wake();
  dust = off("dust") ? null : new Dust(heightCPU);
  graniteField = new GraniteField(heightCPU);
  storm = new Sandstorm(heightCPU);
  ground = new Clipmap({
    height: heightGPU,
    shade: shadeGround(CFG.color),
    albedo: albedoGround(CFG.color),
    wake
  });
  field = new Field(ground, { potential });
  scatter = new Scatter(ground, field, wake, { shade: shadeBlade(CFG.color) });
  beam = off("beam") ? { meshes: [] } : new Beam(ground);
  sky = buildSky(shadeSky);
  landmark = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 16, 3),
    new THREE.MeshBasicMaterial({ color: 526603, transparent: true, opacity: 0.72 })
  );
  landmark.rotation.set(0.1, 0.42, -0.035);
  landmark.visible = false;
  rover = new Rover(camera, canvas, heightCPU);
  rover.cameraControl = false;
  rover.externalDriveMode = true;
  rover.manualInputEnabled = false;
  rover.mobileInputEnabled = false;
  mobileControl = new MobileControl(rover);
  if (mobileControl.active) document.body.classList.add("ti-handheld-crt");
  lander = new Lander(heightCPU);
  restoration = new Restoration(lander, heightCPU, TERRA_SAMPLE_SITES);
  missionMemory = new MissionMemory();
  geologicalMemory = new GeologicalMemory({ renderer, heightAt: heightCPU, onComplete: (memory, now) => {
    rover.auto = false;
    rover.missionHold = true;
    rover.operatorHold = true;
    finalTableau = { t0: now, requested: false };
    document.body.classList.add("ti-memory-tableau");
    captions.force({
      r: 0,
      ko: "\uC9C0\uC9C8 \uAE30\uC5B5 \uACE0\uC815 \xB7 \uC138 \uAC1C \uAD50\uCC28 \uACB0\uC808 \uD655\uC778",
      en: "GEOLOGICAL MEMORY FIXED \xB7 THREE CONCORDANCE NODES"
    }, now, FINAL_TABLEAU_MS - 800);
    kiosk.last = now;
  } });
  waterMission = new WaterMission(heightCPU, BODY02_WATER_SITE, (_site, now) => {
    missionMemory.recordWater({ complete: true, site: BODY02_WATER_SITE });
    captions.force({
      r: 0,
      ko: "\uC218\uBD84 \uD655\uC778 \xB7 \uC218\uD654 \uADDC\uC0B0\uC5FC\uACFC \uC218\uBD84 \uC2E0\uD638 \uC77C\uCE58",
      en: "H\u2082O CONFIRMED \xB7 HYDRATED SILICA / PORE ICE MATCH"
    }, now, 5200);
    kiosk.last = now;
  });
  transferFx = new ResolutionTransferFX(rover.group);
  matterPassage = new MatterPassage({ renderer, rover: rover.group, lander: lander.group });
  docking = new DockingSequence({
    rover,
    lander,
    effect: transferFx,
    camera,
    onCue: (phase, now) => {
      openingShot = null;
      const line = world === "desert" && phase === "recall" ? { r: 0, ko: "\uC218\uBD84 \uD655\uC778 \xB7 \uADC0\uD658 \uC88C\uD45C \uC555\uCD95", en: "H\u2082O CONFIRMED \xB7 COORDINATE RECALL" } : DOCKING_LINES[phase];
      if (line) captions.force(line, now, phase === "docked" ? 12e3 : 4600);
      if (phase === "recall") {
        kiosk.last = now;
      }
    }
  });
  voyage = new VoyageSequence({
    rover,
    lander,
    camera,
    ambient,
    passage: matterPassage,
    onSwap: prepareVoyageDestination,
    onSpace: (active) => {
      sky.visible = !active;
      ground.mesh.visible = !active;
      for (const mesh of scatter.meshes) mesh.visible = !active && PLANETS[world].metric;
      for (const mesh of beam.meshes) mesh.visible = !active && PLANETS[world].metric;
      landmark.visible = false;
      graniteField.mesh.visible = !active && world === "granite";
      geologicalMemory.group.visible = !active && world === "granite" && geologicalMemory.state !== "inactive";
      if (active) {
        dust?.clear();
        storm.setActive(false);
        graniteField.mesh.visible = false;
        geologicalMemory.group.visible = false;
      }
    },
    onCue: (phase, now, destination) => {
      const line = VOYAGE_LINES[phase];
      if (line) captions.force(line, now, phase === "transit" ? 11800 : phase === "epilogue" ? 6200 : 4800);
      if (phase === "epilogue") ambient.silenceFor(24e3);
      kiosk.last = now;
    },
    onComplete: (destination, now) => {
      kiosk.last = now;
      const planet = PLANETS[destination.key];
      if (!planet) return;
      rover.auto = false;
      rover.missionHold = true;
      rover.operatorHold = true;
      pendingArrival = { key: planet.key, at: now + ARRIVAL_BREATH_MS };
      captions.force({
        r: 0,
        ko: `${planet.id} \xB7 \uD45C\uBA74 \uAE30\uC900 \uC548\uC815\uD654`,
        en: `${planet.id} \xB7 SURFACE DATUM STABILISING`
      }, now, ARRIVAL_BREATH_MS - 350);
    },
    onLandingDust: (source) => dust?.landingBurst(source)
  });
  shotDirector = new ShotDirector({
    camera,
    rover,
    lander,
    restoration,
    mission: waterMission,
    docking,
    voyage,
    heightAt: heightCPU
  });
  shotDirector.setExperience("observer");
  mobileControl.setExplorer(false);
  mobileControl.onIntent = (_kind, now) => enterExplorer(now, { rear: true });
  rover.onSpace = (now) => {
    if (!released) return;
    enterObserver(now, { resumeRoute: observerMayDrive() });
    kiosk.last = now;
  };
  openingBlueprints = new OpeningBlueprintSequence({ rover, lander, tier });
  animeRituals = new AnimeRituals();
  power = new Power(heightCPU, solarAccessCPU);
  minimap = new MiniMap(document.getElementById("ti-minimap"), BH.start, {
    heightAt: heightCPU,
    id: "PLANET 01",
    label: "SHEAR WORLD",
    restoration
  });
  optics = new Optics();
  survey = new Survey(heightCPU, TERRA_SURVEY);
  scene.add(
    sky,
    landmark,
    ground.mesh,
    ...scatter.meshes,
    ...beam.meshes,
    graniteField.mesh,
    lander.group,
    restoration.group,
    waterMission.group,
    geologicalMemory.group,
    voyage.group,
    ...dust ? [dust.points] : [],
    storm.points,
    rover.group,
    survey.group,
    transferFx.group,
    matterPassage.group
  );
  lens = off("lens") || ARCHIVE_AT_BOOT ? null : new Lens(renderer, scene, camera);
  adaptive = new Adaptive(renderer, CFG.dprCeiling());
  if (ARCHIVE_AT_BOOT) activateArchive("device", false);
} catch (e) {
  fatal(e, "build");
  await HALT();
}
addEventListener("resize", () => renderer.setPixelRatio(adaptive.dpr));
addEventListener("keydown", (e) => {
  const now = performance.now();
  if (DRIVE_KEYS.has(e.code)) {
    e.preventDefault();
    if (!released) return;
    enterExplorer(now, { rear: true });
  }
  if (!e.repeat && e.code === "KeyC") {
    e.preventDefault();
    if (!released) return;
    shotDirector.setOpening(false);
    if (shotDirector.cycle(now)) {
      enterExplorer(now, { rear: false });
      openingShot = null;
      kiosk.last = now;
    }
  }
  if (!e.repeat && (e.code === "Equal" || e.code === "NumpadEqual" || e.key === "=")) {
    e.preventDefault();
    if (!released) return;
    if (world === "terra" && !docking.started && !voyage.active && !restoration.complete) {
      const now2 = performance.now();
      openingShot = null;
      shotDirector.setOpening(false);
      rover.setViewMode("rear");
      const acquired = restoration.acquireAll({
        x: rover.pos.x,
        z: rover.pos.z,
        heading: rover.heading,
        ground: heightCPU(rover.pos.x, rover.pos.z)
      }, now2);
      if (acquired) {
        rover.flashAcquisition(now2);
        captions.force({
          r: 0,
          ko: "\uAD6C\uC870\uC7AC 5\uC885 \xB7 \uC790\uC6D0 3\uACC4\uD1B5 \uB3D9\uC2DC \uD68D\uB4DD",
          en: "FIVE STRUCTURES \xB7 THREE RESERVES ACQUIRED"
        }, now2, 5200);
        kiosk.last = now2;
      }
    }
    if (!TEST) return;
    if (world === "desert" && waterMission.active && !docking.started) {
      const now2 = performance.now();
      if (waterMission.forceAcquire(now2)) {
        rover.flashAcquisition(now2);
        kiosk.last = now2;
      }
    }
    if (world === "granite" && geologicalMemory.active && !docking.started) {
      const now2 = performance.now();
      if (geologicalMemory.forceAcquire(now2)) {
        rover.flashAcquisition(now2);
        kiosk.last = now2;
      }
    }
  }
  if (TEST && e.code === "KeyG") {
    const on = !ground.mesh.material.wireframe;
    ground.mesh.material.wireframe = on;
    for (const m of scatter.meshes) m.visible = !on;
  }
});
function authoredExperienceLock() {
  return prologuePhase !== "released" || !!completionTableau || !!pendingArrival || !!finalTableau || docking.started || voyage.active || !!restoration.event || !!waterMission.event || !!geologicalMemory.event || restoration.group.visible && restoration.complete || waterMission.complete || geologicalMemory.state === "complete";
}
function observerMayDrive() {
  return released && !completionTableau && !pendingArrival && !finalTableau && !docking.started && !voyage.active;
}
function enterExplorer(now = performance.now(), { rear = true } = {}) {
  if (!released || authoredExperienceLock()) return false;
  const changed = experienceMode !== "explorer";
  experienceMode = "explorer";
  lastExplorerIntent = now;
  openingShot = null;
  shotDirector.setOpening(false);
  shotDirector.setExperience("explorer", now);
  if (rear && changed) shotDirector.selectRear(now, true);
  rover.auto = false;
  rover.operatorHold = false;
  rover.manualInputEnabled = true;
  autoPauseUntil = 0;
  nextAutoPauseAt = now + 46e3;
  mobileControl.setExplorer(true);
  hud.setExperience("explorer");
  kiosk.last = now;
  return true;
}
function enterObserver(now = performance.now(), { resumeRoute = observerMayDrive() } = {}) {
  const changed = experienceMode !== "observer";
  experienceMode = "observer";
  lastExplorerIntent = -Infinity;
  rover.manualInputEnabled = false;
  rover.operatorHold = false;
  if (resumeRoute) {
    rover.auto = true;
    rover.missionHold = false;
    autoPauseUntil = 0;
    nextAutoPauseAt = now + 46e3;
  }
  mobileControl.setExplorer(false);
  shotDirector.setExperience("observer", now);
  hud.setExperience("observer");
  if (changed) kiosk.last = now;
  return changed;
}
const a = GPU_PROFILE;
hud.set("backend", "WebGPU");
hud.set("vendor", `${a.vendor} \xB7 ${a.arch}`);
hud.set("tier", `${CFG.tier} \xB7 ${a.storageMB} MB storage`);
hud.set("mode", archiveMode ? "ARCHIVAL \xB7 PHOSPHOR" : "CINEMATIC \xB7 FULL COLOUR");
hud.set("grid", `${CFG.clipmap.grid} \xD7 ${CFG.clipmap.grid}`);
hud.set("tris", ground.stats.triangles.toLocaleString());
hud.set("gridCell", `${CFG.clipmap.cell.toFixed(3)} m`);
hud.set("span", `${CFG.clipmap.span} m`);
hud.set("fcount", scatter.stats.instances.toLocaleString());
hud.set("fverts", `${(scatter.stats.vertices / 1e6).toFixed(2)} M`);
hud.set("frings", scatter.stats.rings.join(" / "));
hud.set("fgrid", `${field.stats.grid}\xB2 \xB7 ${field.stats.cell.toFixed(2)} m`);
hud.set("nu", nuRatioCPU(BH.rBarrier, BH.start[1]).toFixed(3));
hud.set("limits", `${a.storageBuffers} storage / ${a.maxBufferMB} MB buffer`);
hasTimestamp = enableTimestamps(renderer);
if (!hasTimestamp) {
  hud.set("gc", "unsupported");
  hud.set("gr", "unsupported");
}
const disabledSubsystems = ["beam", "dust", "lens", "wake"].filter(off);
if (disabledSubsystems.length) hud.set("backend", `WebGPU \xB7 without ${disabledSubsystems.join(", ")}`, true);
const START_HEADING = Math.atan2(BH.start[0], BH.start[1]);
rover.reset(BH.start[0], BH.start[1], START_HEADING);
lander.place(BH.start[0], BH.start[1], START_HEADING, true);
rover.auto = false;
rover.setViewMode("rear");
uObserverR.value = Math.hypot(...BH.start);
ground.syncTo(rover.pos.x, rover.pos.z);
window.TI_BOOT?.beat("first-compute");
try {
  await rebuild();
} catch (e) {
  fatal(e, "first compute");
  await HALT();
}
shotDirector.setIntro(false);
window.TI_BOOT?.beat("pipelines");
try {
  await prewarmPipelines();
} catch (e) {
  fatal(e, "pipeline prewarm");
  await HALT();
}
running = true;
tPrev = performance.now();
window.TI_BOOT?.ready();
window.TI_READY = true;
window.TI_WORLD = world;
window.TI_RENDER_MODE = () => ({
  archive: archiveMode,
  green: !rawMonitorManual && (archiveMode || greenMonitorManual || mobileControl?.active && released),
  greenManual: greenMonitorManual,
  rawManual: rawMonitorManual,
  dpr: adaptive.dpr,
  lens: !!lens
});
window.TI_AUDIO = () => ambient.snapshot();
window.TI_BLUEPRINT = () => openingBlueprints.snapshot();
window.TI_OPENING = () => openingBlueprints.snapshot();
window.TI_OBSERVED = () => ({
  ...restoration.snapshot().registration,
  suspended: completionTableau?.pausedAt != null
});
window.TI_MATTER_PASSAGE = () => matterPassage.snapshot();
window.TI_CAMERA = () => ({
  world,
  experience: experienceMode,
  shot: shotDirector.rendered,
  label: shotDirector.label,
  source: shotDirector.source,
  available: shotDirector.availableManualShots(),
  locked: shotDirector.manualLocked,
  lock: shotDirector.lockLabel,
  roverPOV: shotDirector.rendered === "mast",
  lensProfile: lens?.profile ?? "off",
  transition: shotDirector.transition ? "dissolve" : performance.now() - shotDirector.lastCutAt < 100 ? "hardcut" : "none"
});
window.TI_EXPERIENCE = () => ({
  mode: experienceMode,
  auto: rover.auto,
  manualInput: rover.manualInputEnabled,
  idleFor: experienceMode === "explorer" ? performance.now() - lastExplorerIntent : 0,
  returnAfter: EXPLORER_IDLE_MS
});
window.TI_ANOMALIES = () => restoration.sites.map((site, index) => ({
  index,
  x: site.data.x,
  y: site.root.position.y,
  z: site.data.z,
  state: index < restoration.count ? "acquired" : restoration.event?.index === index ? "scanning" : index === restoration.count ? "target" : "latent",
  distance: Math.hypot(rover.pos.x - site.data.x, rover.pos.z - site.data.z)
}));
window.TI_WATER = () => ({
  ...waterMission.snapshot(),
  x: BODY02_WATER_SITE.x,
  y: heightCPU(BODY02_WATER_SITE.x, BODY02_WATER_SITE.z),
  z: BODY02_WATER_SITE.z
});
window.TI_MEMORY = () => ({
  ledger: missionMemory.snapshot(),
  geological: geologicalMemory.snapshot()
});
window.TI_RESTORATION = TEST ? (level) => {
  if (level == null) return restoration.snapshot();
  restoration.reset(level);
  return restoration.snapshot();
} : void 0;
window.TI_SEQUENCE = () => ({
  world,
  planets: Object.keys(PLANETS).length,
  restoration: restoration.count,
  structure: restoration.structuralCount,
  reserves: restoration.reserveCount,
  simultaneous: !!restoration.event?.all,
  prologue: prologuePhase,
  mission: world === "granite" ? geologicalMemory.state : PLANETS[world].mission,
  water: waterMission.state,
  waterDistance: waterMission.lastDistance,
  geological: geologicalMemory.state,
  geologicalNode: geologicalMemory.current,
  docking: docking.phase,
  voyage: voyage.phase,
  matter: matterPassage.snapshot().phase,
  tableau: completionTableau ? "active" : "idle",
  observed: restoration.snapshot().registration.active ? "active" : "idle",
  landerPresent,
  roverVisible: rover.group.visible,
  experience: experienceMode,
  cameraShot: shotDirector.rendered
});
queueLoop();
const PROLOGUE_TEXT_MS = 8e3;
const ARM_MS = 0;
const PROLOGUE_EXIT_MS = 3600;
const prologueTimers = {
  release: { id: 0, deadline: 0, remaining: null, run: () => releasePrologue() },
  arm: { id: 0, deadline: 0, remaining: null, run: () => armPrologue() },
  blueprint: { id: 0, deadline: 0, remaining: null, run: () => completeBlueprintPrologue() }
};
function schedulePrologueTimer(timer, delay) {
  clearTimeout(timer.id);
  const ms = Math.max(0, delay);
  timer.remaining = null;
  timer.deadline = performance.now() + ms;
  timer.id = setTimeout(() => {
    timer.id = 0;
    timer.deadline = 0;
    timer.remaining = null;
    timer.run();
  }, ms);
}
function cancelPrologueTimers() {
  for (const timer of Object.values(prologueTimers)) {
    clearTimeout(timer.id);
    timer.id = 0;
    timer.deadline = 0;
    timer.remaining = null;
  }
}
function suspendPrologueTimers() {
  const now = performance.now();
  for (const timer of Object.values(prologueTimers)) {
    if (!timer.id) continue;
    timer.remaining = Math.max(0, timer.deadline - now);
    clearTimeout(timer.id);
    timer.id = 0;
    timer.deadline = 0;
  }
}
function resumePrologueTimers() {
  for (const timer of Object.values(prologueTimers)) {
    if (timer.remaining == null) continue;
    const delay = timer.remaining;
    schedulePrologueTimer(timer, delay);
  }
}
function setExperienceControlsReady(ready) {
  document.body.classList.toggle("ti-prologue-released", ready);
  soundControl.disabled = !ready;
  soundControl.setAttribute("aria-hidden", String(!ready));
  syncGreenMonitor();
}
window.TI_PROLOGUE = () => ({
  phase: prologuePhase,
  released,
  controlsReady: document.body.classList.contains("ti-prologue-released"),
  soundDisabled: soundControl.disabled,
  timers: Object.fromEntries(Object.entries(prologueTimers).map(([name, timer]) => [name, {
    active: !!timer.id,
    paused: timer.remaining != null,
    remaining: timer.remaining ?? (timer.id ? Math.max(0, timer.deadline - performance.now()) : null)
  }]))
});
function beginTextPrologue() {
  if (released || prologuePhase !== "blueprints") return;
  prologuePhase = "text";
  document.body.classList.add("ti-prologue-reading");
  animeRituals.beginTitleBinding();
  schedulePrologueTimer(prologueTimers.release, PROLOGUE_TEXT_MS);
  schedulePrologueTimer(prologueTimers.arm, ARM_MS);
}
function startPrologueSequence() {
  cancelPrologueTimers();
  animeRituals.reset();
  released = false;
  entryRevealRequested = false;
  prologuePhase = "blueprints";
  setExperienceControlsReady(false);
  document.body.classList.remove(
    "ti-prologue-out",
    "ti-prologue-reading",
    "ti-blueprints-out",
    "ti-entry-blackout",
    "ti-entry-revealing"
  );
  const prologue = document.getElementById("ti-prologue");
  prologue?.classList.remove("armed");
  prologue?.setAttribute("aria-hidden", "false");
  removeEventListener("keydown", onPrologueKey);
  for (const id of ["ti-start", "ti-mobile-start"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = true;
  }
  rover.auto = false;
  openingBlueprints.start(beginTextPrologue);
  window.TI_REVEAL_OPENING?.();
}
function releasePrologue({ throughBlack = false } = {}) {
  if (prologuePhase !== "text") return;
  cancelPrologueTimers();
  entryRevealRequested = throughBlack;
  prologuePhase = "release";
  openingBlueprints.finish({ preserve: true });
  document.body.classList.toggle("ti-entry-blackout", throughBlack);
  document.body.classList.remove("ti-entry-revealing");
  document.body.classList.add("ti-prologue-out");
  const prologue = document.getElementById("ti-prologue");
  prologue?.classList.remove("armed");
  prologue?.setAttribute("aria-hidden", "true");
  for (const id of ["ti-start", "ti-mobile-start"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = true;
  }
  const now = performance.now();
  rover.auto = false;
  rover.missionHold = true;
  rover.scriptedDrive = { throttle: 0, steer: 0 };
  kiosk.last = now;
  removeEventListener("keydown", onPrologueKey);
  schedulePrologueTimer(prologueTimers.blueprint, PROLOGUE_EXIT_MS);
}
function completeBlueprintPrologue() {
  if (prologuePhase !== "release") return;
  prologuePhase = "released";
  released = true;
  setExperienceControlsReady(true);
  shotDirector.setIntro(false);
  rover.auto = false;
  rover.missionHold = true;
  rover.scriptedDrive = { throttle: 0, steer: 0 };
  rover.setViewMode("rear");
  const now = performance.now();
  openingShot = { t0: now };
  shotDirector.setOpening(true);
  if (entryRevealRequested) {
    document.body.classList.remove("ti-entry-blackout");
    document.body.classList.add("ti-entry-revealing");
    animeRituals.beginManualReceiverLock();
  }
  driveReleaseAt = now + BLUEPRINT_BREATH_MS;
  lander.purge?.reset(now);
  nextAutoPauseAt = driveReleaseAt + 32e3;
  kiosk.last = now;
  if (archiveMode) showArchiveCue();
}
function activateArrivalMission(key, now) {
  const planet = PLANETS[key];
  if (!planet) return;
  pendingArrival = null;
  nextAutoPauseAt = now + 32e3;
  autoPauseUntil = 0;
  if (planet.mission === "water") {
    waterMission.activate(now);
    shotDirector.mission = waterMission;
    rover.auto = true;
    rover.missionHold = false;
    rover.operatorHold = false;
    storm.setActive(planet.storm);
    captions.force({
      r: 0,
      ko: "\uB2E8\uC77C \uC784\uBB34 \xB7 \uC9C0\uD45C \uC218\uBD84 \uC2E0\uD638 \uD655\uC778",
      en: "SINGLE OBJECTIVE \xB7 CONFIRM SURFACE WATER"
    }, now, 5200);
  } else if (planet.mission === "geological-memory") {
    waterMission.reset();
    const model = missionMemory.composeBody03({ start: planet.start });
    const activated = geologicalMemory.activate(model, now);
    shotDirector.mission = geologicalMemory;
    rover.auto = activated;
    rover.missionHold = false;
    rover.operatorHold = !activated;
    captions.force(activated ? { r: 0, ko: "PLANET 03 \xB7 \uB450 \uAE30\uC5B5\uC7A5\uC758 \uAD50\uCC28 \uACB0\uC808 \uCD94\uC801", en: "PLANET 03 \xB7 TRACE THREE MEMORY CONCORDANCE NODES" } : { r: 0, ko: "PLANET 03 \xB7 \uC774\uC804 \uD589\uC131 \uB370\uC774\uD130 \uBD88\uC644\uC804", en: "PLANET 03 \xB7 PRIOR-PLANET EVIDENCE INCOMPLETE" }, now, 7200);
  }
}
mobileControl.bindStart(() => {
  ambient.start();
  releasePrologue({ throughBlack: true });
});
desktopStart = document.getElementById("ti-start");
desktopStart?.addEventListener("pointerdown", (e) => e.stopPropagation());
desktopStart?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  ambient.start();
  releasePrologue({ throughBlack: true });
});
function onPrologueKey(e) {
  if (e.repeat || e.code !== "Enter" && e.code !== "Space") return;
  e.preventDefault();
  ambient.start();
  releasePrologue({ throughBlack: true });
}
function armPrologue() {
  if (released || prologuePhase !== "text") return;
  document.getElementById("ti-prologue")?.classList.add("armed");
  for (const id of ["ti-start", "ti-mobile-start"]) {
    const button = document.getElementById(id);
    if (button) button.disabled = false;
  }
  addEventListener("keydown", onPrologueKey);
  if (!mobileControl.active) desktopStart?.focus({ preventScroll: true });
}
if (location.search.includes("embed")) {
  openingBlueprints.finish({ preserve: true });
  released = true;
  prologuePhase = "released";
  setExperienceControlsReady(true);
  rover.auto = true;
} else {
  startPrologueSequence();
}
const resume = () => {
  const now = performance.now();
  if (completionTableau?.pausedAt != null) {
    completionTableau.t0 += now - completionTableau.pausedAt;
    completionTableau.pausedAt = null;
    const remaining = Math.max(
      0,
      COMPLETION_TABLEAU_MS - (now - completionTableau.t0) - 350
    );
    if (remaining > 0) captions.force(COMPLETION_CAPTION, now, remaining);
  }
  if (archiveMode) {
    document.body.classList.add("ti-terminal");
    adaptive.lockAt(0.58);
  }
  document.body.classList.remove("ti-paused");
  ambient?.resume();
  openingBlueprints?.resume();
  animeRituals?.resume();
  if (completionTableau) restoration?.setCompletionRegistration(
    lander?.setCompletionHighlight(restoration.registrationReduced ? 1 : (now - completionTableau.t0) / COMPLETION_TABLEAU_MS),
    (now - completionTableau.t0) / COMPLETION_TABLEAU_MS
  );
  resumePrologueTimers();
  matterPassage?.resume(now);
  if (!running) {
    running = true;
    tPrev = now;
    loopGeneration++;
  }
  queueLoop(loopGeneration);
  mobileControl?.recalibrate();
};
const pause = () => {
  const now = performance.now();
  running = false;
  loopGeneration++;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  document.body.classList.add("ti-paused");
  ambient?.suspend();
  openingBlueprints?.suspend();
  animeRituals?.suspend();
  if (completionTableau && completionTableau.pausedAt == null) completionTableau.pausedAt = now;
  suspendPrologueTimers();
  matterPassage?.suspend(now);
};
addEventListener("pageshow", resume);
addEventListener("pagehide", pause);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" ? resume() : pause());
if (document.visibilityState === "hidden") pause();
async function rebuild() {
  const t0 = performance.now();
  await ground.recompute(renderer);
  const t1 = performance.now();
  await field.recompute(renderer);
  const t2 = performance.now();
  await scatter.recompute(renderer);
  rc.ground = t1 - t0;
  rc.field = t2 - t1;
  rc.scatter = performance.now() - t2;
}
async function prewarmPipelines() {
  await renderer.compileAsync(scene, camera);
  const hidden = [matterPassage.group, graniteField.mesh, geologicalMemory.group];
  for (const object of hidden) {
    if (!object) continue;
    const visible = object.visible;
    object.visible = true;
    try {
      await renderer.compileAsync(object, camera, scene);
    } finally {
      object.visible = visible;
    }
  }
  if (!off("wake")) await wake.step(renderer, 0, 0, 0, 0, 0);
  await matterPassage.prewarm();
  if (lens) await lens.prewarm();
  else {
    renderer.render(scene, camera);
    await renderer.backend?.device?.queue?.onSubmittedWorkDone?.();
  }
}
function handleGpuFault(err) {
  running = false;
  const lost = /device lost/i.test(err?.message ?? String(err));
  if (lost) {
    try {
      if (sessionStorage.getItem("ti_device_recovery") !== "1") {
        sessionStorage.setItem("ti_device_recovery", "1");
        location.reload();
        return;
      }
    } catch {
    }
  }
  fatal(err, "gpu");
}
async function loop(now = performance.now(), generation = loopGeneration) {
  rafId = 0;
  if (!running || generation !== loopGeneration || frameInFlight) return;
  if (archiveMode && now - lastArchiveFrame < 30) {
    queueLoop(generation);
    return;
  }
  lastArchiveFrame = now;
  frameInFlight = true;
  try {
    await frame();
  } catch (e) {
    running = false;
    fatal(e, "frame");
  } finally {
    frameInFlight = false;
  }
  if (running) queueLoop(loopGeneration);
}
function queueLoop(generation = loopGeneration) {
  if (running && !rafId && !frameInFlight) {
    rafId = requestAnimationFrame((now) => loop(now, generation));
  }
}
async function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - tPrev) / 1e3);
  const frameMs = now - tPrev;
  tPrev = now;
  if (failureResetAt && now >= failureResetAt) {
    failureResetAt = 0;
    await returnToStart();
    return;
  }
  if (driveReleaseAt && now >= driveReleaseAt) {
    driveReleaseAt = 0;
    rover.auto = true;
    rover.missionHold = false;
    rover.scriptedDrive = null;
  }
  docking.beforeRover(now, dt);
  if (docking.docked && !voyage.active && PLANETS[world].next) {
    if (!dockedHoldUntil) dockedHoldUntil = now + DOCKED_BREATH_MS;
    else if (now >= dockedHoldUntil) {
      voyage.start(PLANETS[PLANETS[world].next], now);
      dockedHoldUntil = 0;
    }
  }
  await voyage.beforeRover(now, dt);
  if (pendingArrival && now >= pendingArrival.at && !voyage.active) {
    activateArrivalMission(pendingArrival.key, now);
  }
  if (finalTableau) {
    const p = Math.max(0, Math.min(1, (now - finalTableau.t0) / FINAL_TABLEAU_MS));
    geologicalMemory.setFinale(orbitEase(Math.max(0, (p - 0.56) / 0.44)));
    if (p >= 1 && !finalTableau.requested) {
      finalTableau.requested = true;
      kiosk.requestReturn(now);
    }
  }
  const missionEnding = voyage.phase === "epilogue" || voyage.phase === "ended" || !!finalTableau;
  if (experienceMode === "explorer") {
    let driveHeld = false;
    for (const code of DRIVE_KEYS) if (rover.keys.has(code)) {
      driveHeld = true;
      break;
    }
    if (driveHeld) lastExplorerIntent = now;
    if (authoredExperienceLock()) {
      enterObserver(now, { resumeRoute: observerMayDrive() });
    } else if (now - lastExplorerIntent >= EXPLORER_IDLE_MS) {
      enterObserver(now, { resumeRoute: true });
    }
  }
  rover.manualInputEnabled = experienceMode === "explorer" && !authoredExperienceLock();
  const restorationHold = world === "terra" && (restoration.holding(now) || restoration.shouldHold({ x: rover.pos.x, z: rover.pos.z }));
  const waterHold = world === "desert" && waterMission.shouldHold({ x: rover.pos.x, z: rover.pos.z });
  const geologicalHold = world === "granite" && geologicalMemory.shouldHold({ x: rover.pos.x, z: rover.pos.z });
  if (rover.auto && !completionTableau && !docking.started && !voyage.active && !missionEnding) {
    if (!nextAutoPauseAt) nextAutoPauseAt = now + 32e3;
    if (!autoPauseUntil && now >= nextAutoPauseAt) autoPauseUntil = now + 14e3;
    if (autoPauseUntil && now >= autoPauseUntil) {
      autoPauseUntil = 0;
      nextAutoPauseAt = now + 46e3;
    }
    rover.missionHold = autoPauseUntil > now || restorationHold || waterHold || geologicalHold;
  } else {
    rover.missionHold = restorationHold || waterHold || geologicalHold || !!completionTableau || missionEnding;
  }
  if (rover.auto && !completionTableau && !docking.started && !voyage.active && !missionEnding) {
    const target = world === "terra" ? restoration.target : world === "desert" ? waterMission.target : world === "granite" ? geologicalMemory.target : null;
    const start = PLANETS[world].start;
    const base = target ? Math.atan2(rover.pos.x - target.x, rover.pos.z - target.z) : Math.atan2(start[0], start[1]);
    const distance = target ? Math.hypot(rover.pos.x - target.x, rover.pos.z - target.z) : 100;
    rover.autoSpeedScale = distance <= 3 ? 0.18 : distance <= 8 ? 0.42 : 1;
    const curve = target ? Math.min(0.12, distance * 12e-4) : 0.34;
    const phaseIndex = world === "terra" ? restoration.count : world === "granite" ? geologicalMemory.current + 9 : 2;
    const desired = base + Math.sin(rover.odometer * 0.017 + phaseIndex * 1.31) * curve;
    const error = Math.atan2(Math.sin(desired - rover.heading), Math.cos(desired - rover.heading));
    rover.autoSteer = Math.max(-0.38, Math.min(0.38, error * 1.18));
  } else {
    rover.autoSteer = 0;
    rover.autoSpeedScale = 1;
  }
  mobileControl.update(now, dt, {
    released,
    blocked: !!completionTableau || !!pendingArrival || docking.started || voyage.active || missionEnding,
    missionHold: rover.missionHold
  });
  const v = rover.update(dt);
  restoration.update(v, now, world === "terra");
  waterMission.update(v, now, world === "desert");
  await geologicalMemory.update(v, now, world === "granite");
  if (world === "desert" && waterMission.complete && now - waterMission.confirmedAt >= WATER_CONFIRM_BREATH_MS && !docking.started) {
    docking.start(now);
  }
  if (world === "terra" && restoration.complete && !restoration.event && lander.parts.every((part) => part.state === "solid") && !docking.started && !completionTableau) {
    missionMemory.recordSamples({
      count: restoration.count,
      items: restoration.items,
      sites: restoration.sites
    });
    beginCompletionTableau(now);
  }
  updateOpeningCamera(now);
  docking.afterRover();
  updateCompletionTableau(now);
  shotDirector.update(now);
  voyage.afterRover(now);
  optics.update(now, v);
  minimap.update(v, now, power.charge, !voyage.active && !missionEnding);
  uObserverR.value = PLANETS[world].metric ? v.radius : 1e7;
  const prevX = ground.origin.x, prevZ = ground.origin.y;
  if (!voyage.inSpace && ground.syncTo(rover.pos.x, rover.pos.z)) {
    if (!off("wake")) await wake.shift(renderer, ground.origin.x - prevX, ground.origin.y - prevZ);
    await rebuild();
    adaptive.skip();
    hud.flash();
  }
  if (!voyage.inSpace && world === "granite") graniteField.syncTo(rover.pos.x, rover.pos.z);
  if (!off("wake") && !voyage.active) await wake.step(
    renderer,
    dt,
    v.trackA[0] - ground.origin.x,
    v.trackA[1] - ground.origin.y,
    v.trackB[0] - ground.origin.x,
    v.trackB[1] - ground.origin.y
  );
  if (!voyage.inSpace) dust?.update(dt, v);
  if (!voyage.active && !missionEnding) storm.update(dt, v, now);
  lander.update(now, landerPresent || voyage.active);
  if (completionTableau) {
    const tableauProgress = Math.max(0, Math.min(
      1,
      (now - completionTableau.t0) / COMPLETION_TABLEAU_MS
    ));
    const highlight = lander.setCompletionHighlight(
      restoration.registrationReduced ? 1 : tableauProgress
    );
    restoration.setCompletionRegistration(highlight, tableauProgress);
    if (tableauProgress >= 0.7) animeRituals.beginCompletionSilence();
  }
  sky.position.copy(camera.position);
  if (lens) {
    const focusTarget = shotDirector.focus;
    lens.focusAt(camera.position.distanceTo(focusTarget));
    lens.setProfile(shotDirector.rendered);
    lens.render();
  } else renderer.render(scene, camera);
  if (!completionTableau && !docking.active && (!voyage.active || voyage.phase === "ended")) await kiosk.update(now, returnToStart);
  else kiosk.last = now;
  if (adaptive.sample(frameMs, now) === "critical") activateArchive("measured");
  const pw = power.update(dt, { ...v, radius: PLANETS[world].metric ? v.radius : 1e7, lamps: rover.lamps });
  const objective = world === "terra" ? restoration.structureComplete ? `RESERVE BANK \xB7 ${restoration.reserveCount} / 3` : `LANDER SHELL \xB7 ${restoration.structuralCount} / 5` : world === "desert" ? `H\u2082O EVIDENCE \xB7 ${waterMission.complete ? "CONFIRMED" : waterMission.state.toUpperCase()}` : `MEMORY CONCORDANCE \xB7 ${geologicalMemory.current} / ${geologicalMemory.model?.sites?.length ?? 3}`;
  hud.setMission({
    body: `${PLANETS[world].id} \xB7 ${PLANETS[world].label}`,
    objective,
    systems: `PWR ${(pw.charge * 100).toFixed(0)}% \xB7 COMMS ${pw.dead ? "LOST" : "LOCAL"}`
  });
  rover.setSignalState(pw.charge, docking.started || voyage.active || missionEnding);
  mobileControl.syncSignal();
  if (!completionTableau && !voyage.active && !missionEnding) {
    survey.setFocus(world === "terra" ? restoration.scanFocus : world === "desert" ? waterMission.scanFocus : world === "granite" ? geologicalMemory.scanFocus : null);
    survey.update(v, now, pw.charge);
  }
  if (!completionTableau && !docking.started && !voyage.active && !missionEnding) {
    if (pw.dead && world === "terra" && !restoration.complete && !failureResetAt) {
      failureResetAt = now + CFG.power.deadHold;
      document.body.classList.add("fh-dead");
      captions.force({
        r: 0,
        ko: "\uC804\uB825 \uC140 \uACE0\uAC08 \xB7 \uBB3C\uC9C8 \uD1B5\uB85C \uD615\uC131 \uC2E4\uD328",
        en: "POWER CELL EMPTY \xB7 MATERIAL PASSAGE INCOMPLETE"
      }, now, CFG.power.deadHold);
    }
  }
  rover.disabled = pw.dead && !docking.active && !voyage.active;
  rover.transmitting = false;
  const roverVisibleForFlight = !voyage.active || voyage.phase === "egress" || voyage.phase === "close";
  uLampPower.value = rover.lamps && roverVisibleForFlight ? pw.bus * openingLampGain(now) : 0;
  ambient.setPower(pw.dead ? 0 : pw.charge);
  const q = ambient.update(v.radius);
  captions.update(v.radius, now);
  acc += frameMs;
  frames++;
  if (acc >= 320) {
    hud.frame(frameMs);
    hud.set("fps", (frames * 1e3 / acc).toFixed(1));
    hud.set("cpu", `${frameMs.toFixed(2)} ms`);
    hud.set("origin", `${ground.origin.x.toFixed(1)} / ${ground.origin.y.toFixed(1)}`);
    hud.set("recentre", String(ground.recentres));
    hud.set("rcT", `${rc.ground.toFixed(1)} ms`);
    hud.set("rcF", `${rc.field.toFixed(1)} ms`);
    hud.set("rcL", `${rc.scatter.toFixed(1)} ms`, rc.scatter > 12);
    hud.set("pos", `${rover.pos.x.toFixed(1)} / ${rover.pos.z.toFixed(1)}`);
    hud.set("ground", `${v.ground.toFixed(2)} m`);
    hud.set("speed", v.speed > 0.01 ? `${v.speed.toFixed(2)} m/s${v.boosting ? " \xB7 fast" : ""}` : "halted");
    hud.set("odo", `${v.odometer.toFixed(0)} m`);
    hud.set("att", `${deg(v.pitch)} / ${deg(v.roll)}`, Math.abs(v.roll) > 0.4);
    hud.set("trac", `${(v.traction * 100).toFixed(0)} %`, v.traction < 0.6);
    hud.set(
      "susp",
      v.stops > 0 ? `${(v.artic * 100).toFixed(0)} / ${(v.travel * 100).toFixed(0)} cm \xB7 ${(v.stops * 8).toFixed(0)} on stops` : `${(v.artic * 100).toFixed(0)} / ${(v.travel * 100).toFixed(0)} cm`,
      v.slam > 0.05
    );
    hud.set("view", shotDirector.label);
    hud.set("lamps", v.lamps ? pw.bus > 0.92 ? `on \xB7 ${CFG.headlight.reach.toFixed(0)} m reach` : `on \xB7 bus ${(pw.bus * 100).toFixed(0)} %` : "off", !v.lamps || pw.bus < 0.7);
    hud.set("cell", pw.dead ? "EMPTY" : `${(pw.charge * 100).toFixed(1)} %`, pw.charge < 0.25);
    hud.set("array", pw.sunlit ? `${pw.solar.toFixed(2)} %/s` : "shadowed", !pw.sunlit);
    hud.set("lid", `AUTO \xB7 ${(v.lidTilt * 57.29578).toFixed(0)}\xB0 / ${(v.lidMax * 57.29578).toFixed(0)}\xB0`);
    hud.set("load", `${pw.load.toFixed(2)} %/s`);
    hud.set(
      "endur",
      pw.dead ? "\u2014" : pw.endurance === Infinity ? `charging +${pw.net.toFixed(2)} %/s` : `${Math.floor(pw.endurance / 60)}m ${Math.round(pw.endurance % 60)}s`,
      pw.endurance < 90
    );
    hud.set("recon", world === "terra" ? `${restoration.structuralCount}/5 shell \xB7 ${restoration.reserveCount}/3 reserve` : world === "desert" ? `H\u2082O \xB7 ${waterMission.complete ? "confirmed" : waterMission.state}` : `memory nodes \xB7 ${geologicalMemory.current} / ${geologicalMemory.model?.sites?.length ?? 3}`);
    hud.set("r", PLANETS[world].metric ? `${v.radius.toFixed(1)} m \xB7 ${(v.radius / BH.rs).toFixed(2)} rs` : `${v.radius.toFixed(1)} m \xB7 ${world === "granite" ? "jointed granite" : "yardang field"}`);
    hud.set("region", regionOf(v.radius), v.radius < BH.rs * 1.5);
    hud.set("lapse", PLANETS[world].metric ? v.lapse.toFixed(4) : "1.0000");
    hud.set("dpr", `${adaptive.dpr.toFixed(2)} \xB7 ${adaptive.changes} steps`);
    hud.set("focus", lens ? `${lens.uFocus.value.toFixed(0)} m` : "safe mode");
    const audioState = ambient.snapshot();
    hud.set("score", audioState.muted ? "sound off" : audioState.state !== "running" ? "tap \xB7 resume sound" : `${(CFG.audio.droneBase * q).toFixed(0)} Hz \xB7 q ${q.toFixed(3)}`);
    hud.set("idle", kiosk.state === "live" ? `${kiosk.idleFor.toFixed(0)} s / ${(kiosk.idle / 1e3).toFixed(0)}` : `${kiosk.state} \xB7 ${kiosk.returns} returns`);
    hud.set("universe", window.UNIVERSE_SEED ? `#${window.UNIVERSE_SEED}` : "unseeded");
    acc = 0;
    frames = 0;
  }
  if (hasTimestamp && now - tStamp > 480) {
    tStamp = now;
    try {
      const gc = await renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE);
      const gr = await renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER);
      if (gc != null) hud.set("gc", `${Number(gc).toFixed(3)} ms`);
      if (gr != null) hud.set("gr", `${Number(gr).toFixed(3)} ms`);
    } catch {
      hud.set("gc", "unavailable");
      hud.set("gr", "unavailable");
    }
  }
  if (DEV && now - tProbe > 1200) {
    tProbe = now;
    probeDivergence().catch(() => {
    });
  }
}
function showArchiveCue() {
  const cue = document.getElementById("ti-terminal-cue");
  if (!cue) return;
  cue.setAttribute("aria-hidden", "false");
  cue.classList.add("on");
  clearTimeout(archiveCueTimer);
  archiveCueTimer = setTimeout(() => {
    cue.classList.remove("on");
    cue.setAttribute("aria-hidden", "true");
  }, 3600);
}
function syncGreenMonitor() {
  const forcedGreen = archiveMode || mobileControl?.active && released;
  const active = !rawMonitorManual && (forcedGreen || greenMonitorManual);
  document.body.classList.toggle("ti-green-monitor", greenMonitorManual && !archiveMode);
  document.body.classList.toggle("ti-raw-monitor", rawMonitorManual && forcedGreen);
  if (greenControl) {
    greenControl.dataset.greenState = active ? "on" : "off";
    greenControl.setAttribute("aria-pressed", String(active));
    greenControl.disabled = !released;
    greenControl.setAttribute("aria-disabled", String(greenControl.disabled));
    greenControl.setAttribute("aria-hidden", String(!released && !location.search.includes("embed")));
    greenControl.textContent = active ? "RAW" : "GREEN";
    greenControl.setAttribute("aria-label", active ? "\uC6D0\uB798 \uC0C9\uC0C1\uC73C\uB85C \uBCF4\uAE30" : "\uB179\uC0C9 \uBAA8\uB2C8\uD130\uB85C \uBCF4\uAE30");
  }
  hud?.set("mode", archiveMode ? active ? "ARCHIVAL \xB7 PHOSPHOR" : "ARCHIVAL \xB7 RAW COLOUR" : active ? "GREEN MONITOR \xB7 MANUAL" : "CINEMATIC \xB7 FULL COLOUR");
}
function activateArchive(reason = "device", announce = true) {
  if (archiveMode) return;
  archiveMode = true;
  document.body.classList.add("ti-terminal");
  adaptive?.lockAt(0.58);
  lens?.dispose?.();
  lens = null;
  syncGreenMonitor();
  hud?.set("mode", `ARCHIVAL \xB7 ${reason.toUpperCase()}`);
  hud?.set("tier", `${CFG.tier} \xB7 LOW BANDWIDTH`);
  if (announce && released) showArchiveCue();
}
function orbitEase(p) {
  const t = Math.max(0, Math.min(1, p));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function updateOpeningCamera(now) {
  if (!openingShot) return;
  if (world !== "terra" || !lander.group.visible || now - openingShot.t0 >= OPENING_CAMERA_MS) {
    openingShot = null;
    shotDirector.setOpening(false);
  }
}
function openingLampGain(now) {
  if (!openingShot) return 1;
  const p = Math.max(0, Math.min(1, (now - openingShot.t0) / OPENING_CAMERA_MS));
  return 0.015 + 0.985 * orbitEase(Math.max(0, (p - 0.55) / 0.45));
}
function beginCompletionTableau(now) {
  openingShot = null;
  shotDirector.setOpening(false);
  enterObserver(now, { resumeRoute: false });
  completionTableau = { t0: now, pausedAt: null };
  rover.auto = false;
  rover.missionHold = true;
  rover.scriptedDrive = { throttle: 0, steer: 0 };
  rover.setViewMode("cinematic", { yaw: 0, pitch: 0.2, dist: 24 });
  document.body.classList.add("ti-completion-tableau");
  captions.force(COMPLETION_CAPTION, now, COMPLETION_TABLEAU_MS - 350);
  kiosk.last = now;
}
function updateCompletionTableau(now) {
  if (!completionTableau) return;
  const elapsed = now - completionTableau.t0;
  const p = Math.max(0, Math.min(1, elapsed / COMPLETION_TABLEAU_MS));
  rover.scriptedDrive = { throttle: 0, steer: 0 };
  if (p < 1) return;
  restoration.setCompletionRegistration(null);
  lander.setCompletionHighlight(null);
  document.body.classList.remove("ti-completion-tableau");
  completionTableau = null;
  docking.start(now);
}
async function prepareVoyageDestination(destination) {
  const planet = PLANETS[destination.key];
  if (!planet) throw new Error(`Unknown voyage destination: ${destination.key}`);
  docking.reset();
  dockedHoldUntil = 0;
  pendingArrival = null;
  landerPresent = true;
  world = planet.key;
  window.TI_WORLD = world;
  setWorldMode(planet.mode);
  rover.metricEnabled = planet.metric;
  document.body.classList.toggle("ti-desert", world === "desert");
  document.body.classList.toggle("ti-granite", world === "granite");
  document.body.classList.remove("fh-dead");
  landmark.position.set(-230, heightCPU(-230, -340) + 8, -340);
  landmark.visible = false;
  for (const mesh of scatter.meshes) mesh.visible = false;
  for (const mesh of beam.meshes) mesh.visible = false;
  storm.setActive(false);
  dust?.clear();
  waterMission.reset();
  geologicalMemory.reset();
  graniteField.setActive(world === "granite", { x: planet.start[0], z: planet.start[1] });
  if (voyage.inSpace) graniteField.mesh.visible = false;
  power.reset(planet.initialCharge);
  const heading = Math.atan2(planet.start[0], planet.start[1]);
  rover.reset(planet.start[0], planet.start[1], heading);
  rover.auto = false;
  rover.disabled = false;
  rover.transmitting = false;
  rover.lamps = true;
  rover.group.visible = false;
  rover.setViewMode("cinematic", { yaw: 0.18, pitch: 0.22, dist: 13 });
  lander.place(planet.start[0], planet.start[1], heading, true);
  restoration.reset(8);
  restoration.group.visible = false;
  shotDirector.mission = world === "granite" ? geologicalMemory : waterMission;
  shotDirector.clearManual();
  shotDirector.setOpening(false);
  enterObserver(performance.now(), { resumeRoute: false });
  captions.lines = planet.lines;
  captions.rearm();
  survey.reset(planet.survey);
  minimap.restoration = null;
  minimap.reset(planet.start, { id: planet.id, label: planet.label, archives: [] });
  uObserverR.value = planet.metric ? Math.hypot(...planet.start) : 1e7;
  ground.syncTo(lander.group.position.x, lander.group.position.z);
  if (!off("wake")) await wake.clear(renderer);
  await rebuild();
  lens?.focusAt(camera.position.distanceTo(lander.group.position));
}
async function returnToStart() {
  cancelPrologueTimers();
  animeRituals.reset();
  openingBlueprints.cancel({ preserve: false });
  voyage.reset();
  shotDirector.reset();
  docking.reset();
  completionTableau = null;
  finalTableau = null;
  greenMonitorManual = false;
  rawMonitorManual = false;
  syncGreenMonitor();
  pendingArrival = null;
  driveReleaseAt = 0;
  dockedHoldUntil = 0;
  failureResetAt = 0;
  restoration.setCompletionRegistration(null);
  lander.setCompletionHighlight(null);
  document.body.classList.remove("ti-completion-tableau", "ti-memory-tableau");
  openingShot = null;
  shotDirector.setOpening(false);
  nextAutoPauseAt = 0;
  autoPauseUntil = 0;
  world = "terra";
  window.TI_WORLD = world;
  setWorldMode("terra");
  landerPresent = true;
  rover.metricEnabled = true;
  document.body.classList.remove("fh-dead", "ti-desert", "ti-granite");
  storm.setActive(false);
  graniteField.setActive(false);
  waterMission.reset();
  geologicalMemory.reset();
  shotDirector.mission = waterMission;
  landmark.visible = false;
  for (const mesh of scatter.meshes) mesh.visible = true;
  for (const mesh of beam.meshes) mesh.visible = true;
  dust?.clear();
  power.reset();
  rover.disabled = false;
  rover.transmitting = false;
  rover.missionHold = false;
  rover.scriptedDrive = null;
  rover.lamps = true;
  rover.lidTilt = 0;
  rover.reset(BH.start[0], BH.start[1], START_HEADING);
  mobileControl.reset();
  enterObserver(performance.now(), { resumeRoute: location.search.includes("embed") });
  lander.place(BH.start[0], BH.start[1], START_HEADING, true);
  restoration.reset(0);
  restoration.group.visible = true;
  rover.auto = location.search.includes("embed");
  rover.setViewMode("rear");
  uObserverR.value = Math.hypot(...BH.start);
  captions.lines = LINES;
  captions.rearm();
  survey.reset(TERRA_SURVEY);
  minimap.restoration = restoration;
  minimap.reset(BH.start, { id: "PLANET 01", label: "SHEAR WORLD", archives: [] });
  ground.syncTo(rover.pos.x, rover.pos.z);
  if (!off("wake")) await wake.clear(renderer);
  await rebuild();
  shotDirector.setIntro(false);
  lens?.focusAt(camera.position.distanceTo(rover.group.position));
  if (!location.search.includes("embed")) {
    startPrologueSequence();
  } else {
    openingBlueprints.finish({ preserve: true });
    released = true;
    prologuePhase = "released";
    setExperienceControlsReady(true);
  }
}
function regionOf(r) {
  if (world === "desert") return "sintered archive";
  if (world === "granite") return "jointed batholith";
  if (r > BH.rTrough) return "outer basin";
  if (r > BH.rBarrier) return "descent";
  if (r > BH.rs * 1.5) return "inside barrier";
  if (r > BH.rs) return "photon sphere";
  return "beyond horizon";
}
function deg(rad) {
  return `${(rad * 57.29578).toFixed(1)}\xB0`;
}
async function probeDivergence() {
  const p = ground.nearestVertex(rover.pos.x, rover.pos.z);
  const buf = new Float32Array(await renderer.getArrayBufferAsync(ground.bufN.value));
  const gpu = buf[p.index * 4 + 3];
  const cpu = heightCPU(p.x, p.z);
  const d = Math.abs(gpu - cpu);
  hud.set("hcpu", `${cpu.toFixed(4)} m`);
  hud.set("hgpu", `${gpu.toFixed(4)} m`);
  hud.set("delta", d < 1e-3 ? `${(d * 1e6).toFixed(1)} \xB5m` : `${(d * 1e3).toFixed(2)} mm`, d >= 1e-3);
}
