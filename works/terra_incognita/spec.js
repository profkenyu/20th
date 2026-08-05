/**
 * Terra Incognita — constants.
 * 20th solo exhibition · work 01
 *
 * Frozen geology and metric blocks. The engine knows how to build a world;
 * this file defines the three bodies explored inside this work.
 */

export const T = Object.freeze({
  /* The lattice seed now lives in the engine config, because it is the one
     thing a universe changes and the engine's noise primitives are what read
     it. The base below is combined with UNIVERSE_SEED in main.js.

     THE SEED PERTURBS THE GROUND. IT NEVER TOUCHES THE PHYSICS. M, L, r_s and
     everything derived from them are the content of the work and are identical
     in every universe. What changes is the noise lattice — the ridges, the
     rubble, the basins, where the filaments clump. The mass is the same mass;
     only the planet it sits in is different. */
  seedBase: 20260824,
  bias: 32768,             // lattice coordinate bias → keeps indices unsigned
  stride: 65536,           // row stride for the 2D → 1D lattice key

  // domain warp
  warpFreq: 0.0060,
  warpAmp: 26.0,
  warpOct: 2,
  warpOffA: 3.11,
  warpOffB: 8.77,

  /* narrow mineral laminae laid down along a gravitational shear field.
     They live outside the relativistic barrier, so the potential-derived
     inner geography remains mathematically legible. */
  shearRadial: 0.055,
  shearX: 0.021,
  shearZ: -0.013,
  shearWarp: 2.6,
  shearExp: 10.0,
  shearAmp: 1.25,

  // continental swell — broad, low-frequency relief beneath the ridges.
  // It removes the synthetic “single octave” read without changing the
  // Schwarzschild-derived barrier that anchors the work.
  macroFreq: 0.00155,
  macroOct: 3,
  macroAmp: 15.0,
  macroOff: 14.6,

  /* ridged multifractal — the spines.
     RETUNED WHEN THE OBSERVER BECAME A VEHICLE. A decomposition of the slope
     across the rover's 2.30 m wheelbase found that the ridge register accounts
     for essentially ALL of the drivability problem: with it removed the mean
     pitch falls from 11.8° to 1.8°, and ridge alone reproduces 11.7°. Grit and
     rubble contribute 0.4° and 1.3° and are therefore innocent — they were
     suspected first and cleared by measurement.

     Reducing the octave count barely helped, because ridged noise is cuspate:
     the largest octave already carries the slope. What helped was the
     AMPLITUDE-TO-WAVELENGTH RATIO. Wavelength 109 m → 179 m at slightly lower
     amplitude halves the grade and leaves the landform's scale intact.
        stall fraction 11.5 % → 1.9 % of ground above the 24° traction limit. */
  ridgeFreq: 0.0056,
  ridgeOct: 4,
  ridgeExp: 1.90,
  ridgeAmp: 23.0,

  // rubble field
  rubbleFreq: 0.0430,
  rubbleOct: 4,
  rubbleAmp: 3.0,

  // weathered shelves: a separate middle register makes the transition
  // between kilometre-scale forms and wheel-scale grit feel deposited rather
  // than procedurally stacked.
  shelfFreq: 0.0130,
  shelfOct: 3,
  shelfAmp: 4.2,
  shelfOff: 37.4,

  // dust basins
  basinFreq: 0.0045,
  basinOct: 3,
  basinOff: 21.5,
  basinLo: 0.40,
  basinHi: 0.80,
  basinDepth: 7.5,

  // grit — metre-scale rubble. Without this register the surface reads as
  // upholstery at eye height: there is nothing to give the walker scale.
  // Finest octave wavelength is 1.8 m ≈ 4 cells, safely above Nyquist.
  gritFreq: 0.2800,
  gritOct: 2,
  gritAmp: 0.34,
  gritOff: 51.7,

  // fBm cascade — identical on both sides
  lacunarity: 2.0,
  gain: 0.5,
});

/** DUNE ARCHIVE — destination geology.
 *
 * The sandstorm travels at 7.8° east of +X, so the land records the same wind
 * instead of carrying an unrelated decorative dune direction. CPU and GPU
 * read this one block; the numbers are never duplicated between surfaces. */
export const D = Object.freeze({
  windCos: 0.9906,
  windSin: 0.1366,
  duneLambda: 74.0,
  duneAmpLo: 1.9,
  duneAmpHi: 4.2,
  warpAmp: 34.0,
  macroFreq: 0.0011,
  /* wind-carved yardangs: slow change along the wind, rapid change across it */
  yardangU: 0.00115,
  yardangV: 0.0105,
  yardangExp: 4.5,
  yardangAmp: 2.65,
  /* curved, intersecting seams in the sintered wadi crust */
  crustU: 0.084,
  crustV: 0.072,
  crustWarpU: 0.011,
  crustWarpV: 0.013,
  crustWarpAmp: 1.45,
  mesaA: Object.freeze([-155, 120, 230, 92, 10.5]),
  mesaB: Object.freeze([300, -40, 180, 76, 7.0]),
});

/** GRANITE PLAIN — BODY 03.
 *
 * A quiet, old crust rather than another dune system: kilometre-scale swell,
 * broad exfoliation domes, weather-softened granite shelves and embedded
 * clasts at wheel scale. Every band stays above the clipmap Nyquist limit. */
export const G = Object.freeze({
  macroFreq: 0.00165,
  macroOct: 3,
  macroAmp: 6.2,
  shelfFreq: 0.0062,
  shelfOct: 3,
  shelfExp: 2.7,
  shelfAmp: 2.6,
  domeFreq: 0.0155,
  domeOct: 3,
  domeLo: 0.67,
  domeHi: 0.91,
  domeAmp: 3.8,
  weatherFreq: 0.044,
  weatherOct: 3,
  weatherAmp: 0.46,
});

/**
 * SCHWARZSCHILD — the mass at the world origin.
 *
 * Geometrised units, G = c = 1, so mass is measured in metres and every term
 * below is dimensionless. Effective potential per unit rest mass for a
 * massive test particle on an equatorial orbit:
 *
 *     V(r) = −M/r + L²/(2r²) − M·L²/r³
 *
 * The third term is the general-relativistic correction. It is the ONLY
 * reason this differs from a Newtonian well, and it is why the barrier
 * exists at all. Do not drop it. Do not substitute a Newtonian potential.
 * (Wald §6.3; MTW §25.5.)
 *
 * Extrema solve  r² − (L²/M)·r + 3L² = 0, real only for L ≥ √12·M.
 * With M = 20 m and L = 4.4 M = 88 m:
 *
 *     r = 74.23 m   V = +0.054611   unstable circular orbit — the barrier
 *     r = 312.97 m  V = −0.029426   stable circular orbit — the trough
 *     r = 40.00 m   V = −0.500000   event horizon, r = rs = 2M
 *
 * The terrain is displaced by depth·V(r). At depth = 260 m that puts a
 * circular rampart 14.2 m high at 74 m from the centre, a shallow 7.7 m
 * depression at 313 m, and a plunge to −130 m at the horizon.
 *
 * Note what this buys: the composition is DERIVED. The rampart that hides
 * the horizon from an approaching walker is not a designed landform — it is
 * the angular-momentum barrier, sitting exactly where the equation puts it.
 *
 * For r < rs the potential is not defined for an exterior observer, so the
 * ground is floored at V(rs). Nothing inside is claimed.
 */
export const BH = Object.freeze({
  M: 20.0,
  rs: 40.0,
  L: 88.0,
  L2: 7744.0,
  depth: 260.0,

  rBarrier: 74.23,
  rTrough: 312.97,

  // field circulation. Angular velocity of a Schwarzschild circular orbit is
  // Ω = √(M/r³) exactly, so the tangential speed is √(M/r). A potential
  // ψ = 2A·√(M·r) has ∂ψ/∂r = A·√(M/r), which reproduces exactly that
  // profile — and because the field is the CURL of ψ, adding it keeps the
  // whole field divergence-free.
  circ: 0.27,
  windowIn: 380.0,
  windowOut: 900.0,

  start: [234.8, 573.8],
  /* r = 620 m, and chosen rather than assumed. The old start at (0, 620) sat
     in shadow — a ridge 30–46 m toward the sun blocks a 6.6° elevation — so the
     first thing a visitor saw was a machine that would not charge. This one was
     found by searching the r = 620 circle for a heading that satisfies three
     things at once:

       · sunlit at the start, and for the first 120 m of the drive;
       · driving at the mass is also driving at the SUN (alignment 0.999), so
         the lid is worth opening from the first metre and the pit and the low
         red sun share a frame;
       · worst grade over that run is 5.5°, well inside traction.

     78 of 1440 headings satisfy the first two. This is the flattest. */
});

/** Amplitude normaliser for an `oct`-octave cascade at gain 0.5. */
export function fbmNorm(oct) {
  let n = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { n += a; a *= T.gain; }
  return n;
}
