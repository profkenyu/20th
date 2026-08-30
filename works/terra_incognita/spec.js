export const T = Object.freeze({
  seedBase: 20260824,
  bias: 32768,
  stride: 65536,
  warpFreq: 6e-3,
  warpAmp: 26,
  warpOct: 2,
  warpOffA: 3.11,
  warpOffB: 8.77,
  shearRadial: 0.055,
  shearX: 0.021,
  shearZ: -0.013,
  shearWarp: 2.6,
  shearExp: 10,
  shearAmp: 1.25,
  macroFreq: 155e-5,
  macroOct: 3,
  macroAmp: 15,
  macroOff: 14.6,
  ridgeFreq: 56e-4,
  ridgeOct: 4,
  ridgeExp: 1.9,
  ridgeAmp: 23,
  rubbleFreq: 0.043,
  rubbleOct: 4,
  rubbleAmp: 3,
  shelfFreq: 0.013,
  shelfOct: 3,
  shelfAmp: 4.2,
  shelfOff: 37.4,
  basinFreq: 45e-4,
  basinOct: 3,
  basinOff: 21.5,
  basinLo: 0.4,
  basinHi: 0.8,
  basinDepth: 7.5,
  gritFreq: 0.28,
  gritOct: 2,
  gritAmp: 0.34,
  gritOff: 51.7,
  lacunarity: 2,
  gain: 0.5
});
export const D = Object.freeze({
  windCos: 0.9906,
  windSin: 0.1366,
  duneLambda: 74,
  duneAmpLo: 1.9,
  duneAmpHi: 4.2,
  warpAmp: 34,
  macroFreq: 11e-4,
  yardangU: 115e-5,
  yardangV: 0.0105,
  yardangExp: 4.5,
  yardangAmp: 2.65,
  crustU: 0.084,
  crustV: 0.072,
  crustWarpU: 0.011,
  crustWarpV: 0.013,
  crustWarpAmp: 1.45,
  mesaA: Object.freeze([-155, 120, 230, 92, 10.5]),
  mesaB: Object.freeze([300, -40, 180, 76, 7])
});
export const G = Object.freeze({
  macroFreq: 165e-5,
  macroOct: 3,
  macroAmp: 6.2,
  shelfFreq: 62e-4,
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
  jointAFreq: 0.041,
  jointBFreq: 0.033,
  jointWarp: 95e-4,
  jointWarpAmp: 1.65,
  jointLo: 0.02,
  jointHi: 0.105,
  jointDepth: 0.34,
  torFreq: 92e-4,
  torOct: 3,
  torLo: 0.7,
  torHi: 0.91,
  torAmp: 2.15
});
export const BODY02_WATER_SITE = Object.freeze({
  id: "BODY02-H2O-01",
  x: 52,
  z: 428,
  bearing: -0.31,
  objective: "H\u2082O",
  scanRadius: 5.2,
  acquireRadius: 3.8,
  scanHoldMs: 4200,
  signature: Object.freeze({
    phase: "SUBSURFACE PORE ICE / HYDRATED SILICA",
    thermalDeltaK: -16,
    absorptionBandsMicron: Object.freeze([1.4, 1.9, 2.9]),
    evidence: Object.freeze([
      "THERMAL INERTIA ANOMALY",
      "1.9 \xB5m ABSORPTION",
      "HYDRATED SILICA DARKENING"
    ])
  }),
  visual: Object.freeze({
    coreRadius: 7.5,
    haloRadius: 15,
    reliefDepth: 0.22,
    thermalTint: Object.freeze([0.018, 0.052, 0.067]),
    saltTint: Object.freeze([0.205, 0.245, 0.222]),
    particleDensity: 0.28,
    spectrumRingMicron: 1.9
  })
});
export const BH = Object.freeze({
  M: 20,
  rs: 40,
  L: 88,
  L2: 7744,
  depth: 260,
  rBarrier: 74.23,
  rTrough: 312.97,
  circ: 0.27,
  windowIn: 380,
  windowOut: 900,
  start: [234.8, 573.8]
});
export const TERRA_SAMPLE_SITES = Object.freeze([
  Object.freeze({ x: 231.6, z: 543.4, bearing: 0.18 }),
  Object.freeze({ x: 199.1, z: 516.1, bearing: -0.42 }),
  Object.freeze({ x: 209.9, z: 471.4, bearing: 0.66 }),
  Object.freeze({ x: 168.5, z: 445.3, bearing: -0.31 }),
  Object.freeze({ x: 173.9, z: 391.9, bearing: 0.51 }),
  Object.freeze({ x: 127.7, z: 352.8, bearing: -0.57 }),
  Object.freeze({ x: 131.1, z: 294.2, bearing: 0.29 }),
  Object.freeze({ x: 92.5, z: 247.9, bearing: -0.16 })
]);
export function fbmNorm(oct) {
  let n = 0, a = 0.5;
  for (let i = 0; i < oct; i++) {
    n += a;
    a *= T.gain;
  }
  return n;
}
