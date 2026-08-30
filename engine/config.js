export function deviceTier() {
  const query = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const forced = query?.get("quality");
  if (query?.has("terminal") || forced === "critical" || forced === "low") return "low";
  if (query?.has("full") || forced === "high") return "high";
  if (forced === "mid") return "mid";
  const mem = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    const memoryKnown = Number.isFinite(navigator.deviceMemory);
    return memoryKnown && cores >= 8 && mem >= 8 ? "mid" : "low";
  }
  return cores >= 8 && mem >= 8 ? "high" : "mid";
}
export function defaults(tier = deviceTier()) {
  const pick = (o) => o[tier];
  return {
    tier,
    lattice: { seed: 1, bias: 32768, stride: 65536, lacunarity: 2, gain: 0.5 },
    clipmap: {
      grid: pick({ high: 640, mid: 480, low: 320 }),
      span: pick({ high: 560, mid: 460, low: 340 }),
      edgeFade: [0.84, 0.995],
      snapCells: 8
    },
    field: { grid: pick({ high: 320, mid: 256, low: 192 }), span: 560, eps: 1.15 },
    scatter: null,
    wake: {
      grid: pick({ high: 256, mid: 256, low: 128 }),
      cellsPerSnap: 16,
      radius: 1.45,
      tau: 7,
      gain: 2.4,
      flatten: 1.15,
      relief: 0.55
    },
    metric: null,
    vehicle: {
      eye: 1.72,
      cruise: 4.4,
      boost: 15,
      lookSpeed: 28e-4,
      chassis: {
        axles: [0.98, 0.33, -0.33, -0.98],
        wheelBase: 0.98,
        track: 0.62,
        wheelR: 0.29,
        wheelW: 0.19,
        clearance: 0.28,
        travel: 0.24,
        camY: 0.92,
        camZ: -0.7,
        lidLen: 1.42,
        lidWidth: 1,
        lidMax: 1.2,
        lidRate: 0.85
      }
    },
    headlight: {
      count: 2,
      reach: 9,
      intensity: 1.7,
      cosInner: 0.966,
      cosOuter: 0.891,
      tilt: 0.16,
      offset: 0.42,
      ahead: 0.98,
      rise: 0.3,
      colour: [0.6, 0.65, 0.76]
    },
    beam: {
      strength: 0.115,
      length: 11,
      scaleHeight: 0.52,
      hugFade: 0.09,
      nearFade: 1.35,
      segments: pick({ high: 22, mid: 18, low: 12 }),
      rings: pick({ high: 14, mid: 12, low: 8 })
    },
    dust: {
      gravity: 3.71,
      maxParticles: pick({ high: 640, mid: 420, low: 192 }),
      maxEmitPerFrame: pick({ high: 12, mid: 8, low: 5 }),
      minSpeed: 0.18,
      emitPerMetre: 26,
      slamBoost: 2.4,
      kickBase: 0.55,
      kickSpeed: 0.22,
      kickShock: 0.7,
      liftBase: 1.05,
      liftVariance: 0.65,
      liftShock: 0.85,
      releaseHeight: 0.045,
      lateral: 0.24,
      spread: 0.34,
      life: 1.6,
      size: 2.2,
      opacity: 0.44,
      color: [0.42, 0.37, 0.34]
    },
    power: {
      array: 6.2,
      base: 0.16,
      lamps: 0.26,
      drive: 0.22,
      slam: 0.34,
      deckHeight: 1,
      horizon: [2, 5, 10, 18, 30, 46, 62, 80],
      deadHold: 3e4,
      lampBus: {
        sag: 0.45,
        flickerAt: 0.14,
        flickerDepth: 0.45,
        flickerHz: 38,
        duty: 0.26,
        attack: 90,
        release: 7,
        brownout: 0.16
      }
    },
    atmosphere: { fogDensity: 0.0165, skyRadius: 900, far: 2200, fov: 46 },
    sun: [-0.42, 0.115, -0.9],
    color: {
      void: [31e-4, 31e-4, 35e-4],
      horizon: [64e-4, 75e-4, 0.0106],
      rock: [0.023, 0.025, 0.03],
      dust: [0.088, 0.094, 0.105],
      fil: [0.034, 0.037, 0.043],
      crimson: [0.54, 7e-3, 0.023],
      beacon: [1, 0.34, 0.015]
    },
    post: {
      bloomStrength: 0.72,
      bloomRadius: 0.85,
      bloomThreshold: 0.16,
      focusMin: 18,
      focusMax: 150,
      focalLength: 0.22,
      bokeh: 2.6
    },
    audio: { droneBase: 300, droneEmitR: 0, droneGain: 0.16, noiseGain: 0.02, breath: 0.055 },
    kiosk: { idleMs: 9e4 },
    dprCeiling: () => Math.min(devicePixelRatio, tier === "high" ? 1.5 : tier === "mid" ? 1 : 0.75)
  };
}
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof v !== "function" && a[k] && typeof a[k] === "object" && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
};
let CURRENT = null;
export function configure(work = {}) {
  CURRENT = deepMerge(defaults(work.tier), work);
  const c = CURRENT.clipmap;
  c.count = c.grid * c.grid;
  c.cell = c.span / (c.grid - 1);
  CURRENT.snap = c.cell * c.snapCells;
  CURRENT.wake.cell = CURRENT.snap / CURRENT.wake.cellsPerSnap;
  if (CURRENT.scatter?.rings) {
    for (const r of CURRENT.scatter.rings) {
      r.side = Math.round(r.r1 * 2 / r.cell);
      r.count = r.side * r.side;
    }
    CURRENT.scatter.count = CURRENT.scatter.rings.reduce((a, r) => a + r.count, 0);
    CURRENT.scatter.vertices = CURRENT.scatter.rings.reduce((a, r) => a + r.count * (r.seg + 1) * 2, 0);
  }
  return CURRENT;
}
export function cfg() {
  if (!CURRENT) throw new Error("engine: configure() must run before the world is built");
  return CURRENT;
}
export function universeSeed() {
  const s = typeof window !== "undefined" ? window.UNIVERSE_SEED : null;
  const n = s ? parseInt(String(s), 16) : NaN;
  return Number.isFinite(n) ? n : 0;
}
export const DEV = true;
