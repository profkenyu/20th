/**
 * ENGINE CONFIG — one mutable singleton, populated by the work before anything
 * is constructed.
 *
 * The rule that makes this safe: NO ENGINE MODULE MAY READ cfg() AT MODULE
 * SCOPE. ES module imports hoist, so a work calling configure() in its own
 * module body still runs after every engine module has been evaluated. Reads
 * are therefore confined to constructors and to TSL function bodies, both of
 * which run later — constructors when the work builds the world, TSL bodies at
 * shader build time. `cfg()` throws if that rule is broken.
 */

export function deviceTier() {
  const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const forced = query?.get('quality');
  if (query?.has('terminal') || forced === 'critical' || forced === 'low') return 'low';
  if (query?.has('full') || forced === 'high') return 'high';
  if (forced === 'mid') return 'mid';
  const mem = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return 'low';
  return (cores >= 8 && mem >= 8) ? 'high' : 'mid';
}

/** Engine defaults. A work overrides what it cares about and inherits the rest. */
export function defaults(tier = deviceTier()) {
  const pick = o => o[tier];
  return {
    tier,

    /* the lattice hash. `seed` is the only thing a universe changes. */
    lattice: { seed: 1, bias: 32768, stride: 65536, lacunarity: 2.0, gain: 0.5 },

    /* recentring height clipmap */
    clipmap: {
      grid: pick({ high: 640, mid: 480, low: 320 }),
      span: pick({ high: 560, mid: 460, low: 340 }),
      edgeFade: [0.84, 0.995],
      snapCells: 8,
    },

    /* baked vector field */
    field: { grid: pick({ high: 320, mid: 256, low: 192 }), span: 560, eps: 1.15 },

    /* instanced scatter rings — a work supplies its own */
    scatter: null,

    /* world-anchored disturbance grid */
    wake: {
      grid: pick({ high: 256, mid: 256, low: 128 }),
      cellsPerSnap: 16, radius: 1.45, tau: 7.0, gain: 2.4,
      flatten: 1.15,          // how far scattered instances lie down
      /* How strongly the trail tilts the GROUND normal. The track is geometry
         and nothing else — no albedo change — so it exists only where light
         grazes it. Peak ∇w ≈ 0.42 m⁻¹, so 0.55 gives a ≈13° berm.
         Set 0 to disable the three extra buffer reads per ground fragment. */
      relief: 0.55,
    },

    /* optional gravitational optics. null → nuRatio() is 1 and redshift is
       identity, so a work with no mass pays nothing and writes no branches. */
    metric: null,

    vehicle: {
      eye: 1.72, cruise: 4.4, boost: 15.0, lookSpeed: 0.0028,

      /* ── the chassis ──────────────────────────────────────────────────
         Here rather than in rover.js because `npm run terrain` has to measure
         grade across the ACTUAL wheelbase, and rover.js imports three so the
         report cannot read it. The numbers were hardcoded in two places until
         the machine was resized, at which point the drivability figures would
         have quietly gone on describing a vehicle that no longer existed.

         Scaled toward the Lunokhod proportions the reference shows: a 1.96 m
         wheelbase on a 1.24 m track, wheels 0.58 m across. Smaller than the
         first pass, which makes the terrain read larger — the eye sits at
         1.23 m, below a standing person, and the 179 m ridges tower properly.

         `axles` measures FORWARD from centre. The outer pair defines the pitch
         baseline; the inner pair carries load and contributes to deck height
         only, because at 0.33 m their moment arm is negligible. */
      chassis: {
        axles: [0.98, 0.33, -0.33, -0.98],
        wheelBase: 0.98,        // outer offset — half the pitch baseline
        track: 0.62,            // half the full track
        wheelR: 0.29,
        wheelW: 0.17,
        clearance: 0.28,
        travel: 0.24,           // ± stroke, sized by measurement below
        camY: 0.92,
        camZ: -0.70,
        lidLen: 1.42,
        lidWidth: 1.00,
        lidMax: 1.20,           // 69° — steep enough to aim at a 6.6° sun
        lidRate: 0.85,
      },
    },


    /* Two lamps on the deck front, aimed along the nose and tilted down —
       a rover lights the ground it is about to drive onto, not the horizon.
       Cosines rather than angles so the fragment shader needs no arccos:
       inner 15°, outer 27°. Set count: 0 for a work with no vehicle lamps. */
    headlight: {
      count: 2,
      reach: 9.0,             // metres to half brightness
      intensity: 1.7,        // tuned by measurement: peak +144/255 on dust
      cosInner: 0.966,        // 15°
      cosOuter: 0.891,        // 27°
      tilt: 0.16,             // 9° down from the deck plane
      offset: 0.42,           // lateral, metres
      ahead: 0.98,            // forward of the deck centre
      rise: 0.30,             // above the deck
      colour: [0.60, 0.65, 0.76],   // instrument white, cold against the sun
    },

    /* ── the visible shaft ────────────────────────────────────────────────
       An earlier version of this engine argued that a lamp on an airless world
       casts no visible beam: nothing scatters, so you see the lit ground and
       nothing between. That is right about AIR and wrong about the Moon.

       Airless bodies carry electrostatically levitated dust — solar UV
       photoionises the surface, micron grains take on charge, mutual repulsion
       lifts them clear, and they hang and fall back. Surveyors 5, 6 and 7
       photographed the horizon glow it makes after local sunset; Apollo crews
       reported streamers before orbital sunrise. It is observed, and it is a
       property of exactly this kind of world.

       So the numbers are the layer's, not a taste: a scale height near half a
       metre, and an optical depth small enough that the shaft is a suggestion.
       A beam you can see clearly is a beam on a planet with weather.
       `?nobeam` removes it; strength 0 removes it permanently. */
    beam: {
      strength: 0.115,
      length: 11.0,           // metres of cone drawn
      scaleHeight: 0.52,      // the dust layer thins with this constant
      hugFade: 0.09,          // fade out at the very bottom, so the lit pool takes over
      nearFade: 1.35,         // do not stab the camera
      segments: pick({ high: 22, mid: 18, low: 12 }),
      rings: pick({ high: 14, mid: 12, low: 8 }),
    },

    /* Mars-like gravity makes wheel-thrown regolith ballistic and visibly
       slower to settle than it would be under Earth's 9.81 m/s². */
    dust: {
      gravity: 3.71,
      /* 640 measured, not chosen: a fast traverse peaks at 398 live grains,
         and a pool that saturates starts silently dropping the newest —
         the trail thins exactly when the machine is working hardest. */
      maxParticles: pick({ high: 640, mid: 420, low: 192 }),
      maxEmitPerFrame: pick({ high: 12, mid: 8, low: 5 }),
      /* THE ARC IS SIZED AGAINST THE WHEEL IT COMES OFF, not guessed.
         At the original lift of 0.32–0.76 m/s and g = 3.71 the apex was
         1.4–7.8 cm — a seventh of a 0.29 m wheel — and mean flight was 0.29 s
         against a 1.15 s lifetime, so the lifetime never mattered and the
         steady population was five grains. Five grains is not dust.

         Lift now puts the apex between about half and one and a half wheel
         radii (0.15–0.45 m), which is 0.75 s of flight at the top — visible,
         and still unmistakably low-gravity. Emission rises to match, because
         population is rate × flight and both were starving it. */
      minSpeed: 0.18, emitPerMetre: 26.0, slamBoost: 2.4,
      kickBase: 0.55, kickSpeed: 0.22, kickShock: 0.70,
      liftBase: 1.05, liftVariance: 0.65, liftShock: 0.85,
      releaseHeight: 0.045, lateral: 0.24, spread: 0.34,
      life: 1.60, size: 2.2, opacity: 0.44,
      color: [0.42, 0.37, 0.34],
    },

    /* ── power budget ────────────────────────────────────────────────────
       Rates are per cent of the cell per second. Sized so that the open plain
       is roughly break-even with the lamps ON and clearly positive with them
       off, and so that a shadowed descent with the lamps burning gives about
       two and a half minutes. That number is the point: the lamp is the only
       thing you can see by down there, and it is what is killing you. */
    power: {
      array: 6.20,            // %/s at normal incidence, unshadowed, q = 1
      base: 0.16,             // electronics
      lamps: 0.26,
      drive: 0.22,            // × speed fraction × (2 − traction)
      slam: 0.34,             /* the drive fighting its own bump stops. Speed
                                 is not free: past the suspension's stroke the
                                 motors work against a rigid arm, and the
                                 wheel that is being slammed is not driving. */
      deckHeight: 1.00,       // the array above the ground: wheel + clearance + tub
      horizon: [2, 5, 10, 18, 30, 46, 62, 80],   // shadow probe distances
      deadHold: 30000,        // long final pull-back after the receiver dies

      /* ── the lamp bus ──────────────────────────────────────────────────
         The lamps are not on their own supply. When the drive spikes fighting
         a bump stop, the bus sags and the lamps go with it — and hard enough
         shocks chatter the contacts outright.

         This is not an effect bolted onto the suspension; it is the SAME load
         spike the budget above already charges for, made visible. Suspension →
         power → light, one quantity all the way through, which is why the
         flicker only ever happens when the machine is genuinely being beaten
         up rather than whenever it looks dramatic.

         The chatter is a hash of quantised time, not Math.random(): it runs at
         its own rate regardless of frame rate, and it is reproducible. */
      lampBus: {
        sag: 0.45,            /* bus fall at full slam severity. Tuned DOWN
                                 from 0.55/0.90/0.42, which cut the lamps to
                                 4 % of full and left 29 % of a fast traverse
                                 in darkness — a viewer reads that as a broken
                                 build, not as a machine under strain. The
                                 point is to make the load legible, and a light
                                 that gutters says that better than one that
                                 goes out. */
        flickerAt: 0.14,      // severity where the contacts begin to open
        flickerDepth: 0.45,
        flickerHz: 38,
        duty: 0.26,           // fraction of ticks the contact is open
        attack: 90,           // per second — the dip is instant
        release: 7.0,         // the recovery is not
        brownout: 0.16,       // cell fraction below which the lamps fail too
      },
    },

    atmosphere: { fogDensity: 0.0165, skyRadius: 900, far: 2200, fov: 46 },
    sun: [-0.42, 0.115, -0.90],

    color: {
      void:    [0.0031, 0.0031, 0.0035],
      horizon: [0.0064, 0.0075, 0.0106],
      rock:    [0.0230, 0.0250, 0.0300],
      dust:    [0.0880, 0.0940, 0.1050],
      fil:     [0.0340, 0.0370, 0.0430],
      crimson: [0.5400, 0.0070, 0.0230],
    },

    post: { bloomStrength: 0.72, bloomRadius: 0.85, bloomThreshold: 0.16,
            focusMin: 18, focusMax: 150, focalLength: 0.22, bokeh: 2.6 },

    audio: { droneBase: 300, droneEmitR: 0, droneGain: 0.16, noiseGain: 0.020, breath: 0.055 },

    kiosk: { idleMs: 90000 },
    dprCeiling: () => Math.min(devicePixelRatio, tier === 'high' ? 1.5 : tier === 'mid' ? 1.0 : 0.75),
  };
}

const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function'
              && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]))
      ? deepMerge(a[k], v) : v;
  }
  return out;
};

let CURRENT = null;

export function configure(work = {}) {
  CURRENT = deepMerge(defaults(work.tier), work);

  /* derived, so no work has to compute them and no two disagree */
  const c = CURRENT.clipmap;
  c.count = c.grid * c.grid;
  c.cell = c.span / (c.grid - 1);
  CURRENT.snap = c.cell * c.snapCells;
  CURRENT.wake.cell = CURRENT.snap / CURRENT.wake.cellsPerSnap;

  if (CURRENT.scatter?.rings) {
    for (const r of CURRENT.scatter.rings) {
      r.side = Math.round((r.r1 * 2) / r.cell);
      r.count = r.side * r.side;
    }
    CURRENT.scatter.count = CURRENT.scatter.rings.reduce((a, r) => a + r.count, 0);
    CURRENT.scatter.vertices = CURRENT.scatter.rings.reduce((a, r) => a + r.count * (r.seg + 1) * 2, 0);
  }
  return CURRENT;
}

export function cfg() {
  if (!CURRENT) throw new Error('engine: configure() must run before the world is built');
  return CURRENT;
}

/** The universe seed convention shared across the practice. */
export function universeSeed() {
  const s = typeof window !== 'undefined' ? window.UNIVERSE_SEED : null;
  const n = s ? parseInt(String(s), 16) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export const DEV = true;
