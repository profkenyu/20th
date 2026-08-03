/**
 * Terra Incognita — the surface, CPU side.
 *
 * ══ THIS FILE IS ONE HALF OF A PAIR ══
 * The other half is `surface.js`, which expresses the SAME height field in TSL
 * for the clipmap's compute pass. A change here that is not mirrored there is
 * a bug, and the runtime divergence probe will report it in millimetres.
 *
 * It is a separate file for one reason: it imports no TSL, so it runs in Node.
 * That makes the surface measurable — `npm run terrain` reports relief, slope
 * distribution and drivability without a browser or a GPU — and a surface you
 * cannot measure is a surface you tune by eye.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PHYSICS IS EXACT.  V(r) = −M/r + L²/2r² − M·L²/r³
 *
 * The third term is the general-relativistic correction: the only reason this
 * differs from a Newtonian well, and the reason the barrier exists at all.
 * Extrema solve r² − (L²/M)·r + 3L² = 0, real only when L ≥ √12·M.
 *
 * Using V(r) as a height field is a metaphor made precise — the ground IS the
 * potential a test particle would have to climb — and what it buys is that the
 * composition is DERIVED. The circular rampart at r = 74.23 m is the
 * angular-momentum barrier, sitting where the equation puts it.
 *
 * For r < rs the potential is not defined for an exterior observer, so the
 * ground is floored at V(rs). Nothing inside is claimed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as CPU from '../../engine/cpu/noise.js';
import { T, D, BH } from './spec.js';

let worldMix = 0;

/** CPU mirror of the GPU world uniform. Shared engine systems keep the same
 * height callback while the work changes planet beneath them. */
export function setCPUWorldMix(value) {
  worldMix = Math.max(0, Math.min(1, value));
}

export function desertHeightCPU(x, z) {
  const u = x * D.windCos + z * D.windSin;
  const v = x * -D.windSin + z * D.windCos;
  const regional = CPU.fbm(x * D.macroFreq + 93.7, z * D.macroFreq + 93.7, 3);
  const warpN = CPU.fbm(u * 0.0022 + 17.1, v * 0.00085 + 17.1, 2);
  const strata = CPU.ridge(u * 0.0018 + 63.4, v * 0.0032 + 63.4, 2);
  const skin = CPU.fbm(x * 0.045 + 5.8, z * 0.045 + 5.8, 2);

  const phase = (u + (warpN - 0.5) * D.warpAmp + Math.sin(v * 0.0048) * 12)
    * Math.PI * 2 / D.duneLambda;
  const wave = 0.72 * Math.sin(phase)
    + 0.20 * Math.sin(phase * 2 - 0.70)
    + 0.08 * Math.sin(phase * 3 - 1.10);
  const amp = D.duneAmpLo + (D.duneAmpHi - D.duneAmpLo) * CPU.smoothstep(0.26, 0.74, regional);

  const contour = Math.abs(regional - 0.43);
  const wadiNatural = 1 - CPU.smoothstep(0.028, 0.105, contour);
  const along = 0.181 * x + 0.983 * z;
  const archiveDist = Math.abs(along - 365 + (warpN - 0.5) * 42);
  const wadiRoute = (1 - CPU.smoothstep(16, 54, archiveDist)) * 0.88;
  const wadi = Math.max(wadiNatural, wadiRoute);
  const bed = Math.max(
    1 - CPU.smoothstep(0.014, 0.045, contour),
    1 - CPU.smoothstep(8, 22, archiveDist),
  );
  const rock = CPU.smoothstep(0.72, 0.89, strata + wadi * 0.10);
  const dune = wave * amp * (1 - 0.88 * wadi) * (1 - 0.65 * rock);

  const [ax, az, arx, arz, ah] = D.mesaA;
  const [bx, bz, brx, brz, bh] = D.mesaB;
  const ellA = Math.hypot(
    (x - ax + (warpN - 0.5) * 22) / arx,
    (z - az + (regional - 0.5) * 14) / arz,
  );
  const ellB = Math.hypot(
    (x - bx - (warpN - 0.5) * 18) / brx,
    (z - bz + (regional - 0.5) * 12) / brz,
  );
  const mesaA = (1 - CPU.smoothstep(0.72, 1.08, ellA)) * ah;
  const mesaB = (1 - CPU.smoothstep(0.74, 1.10, ellB)) * bh;

  return (regional - 0.5) * 5.5
    + dune - wadi - bed * 0.65
    + rock * (0.45 + 1.35 * skin)
    + mesaA + mesaB
    + (skin - 0.5) * 0.18 * (1 - 0.75 * rock);
}

export function veff(r) {
  const rc = Math.max(r, BH.rs);
  return -BH.M / rc + (BH.L2 * 0.5) / (rc * rc) - (BH.M * BH.L2) / (rc * rc * rc);
}

export function heightCPU(x, z) {
  const wa = CPU.fbm(x * T.warpFreq + T.warpOffA, z * T.warpFreq + T.warpOffA, T.warpOct) - 0.5;
  const wb = CPU.fbm(x * T.warpFreq + T.warpOffB, z * T.warpFreq + T.warpOffB, T.warpOct) - 0.5;
  const qx = x + wa * T.warpAmp, qz = z + wb * T.warpAmp;

  const macro = (CPU.fbm(x * T.macroFreq + T.macroOff, z * T.macroFreq + T.macroOff, T.macroOct) - 0.5) * T.macroAmp;
  const spine = Math.pow(CPU.ridge(qx * T.ridgeFreq, qz * T.ridgeFreq, T.ridgeOct), T.ridgeExp) * T.ridgeAmp;
  const rubble = CPU.fbm(qx * T.rubbleFreq, qz * T.rubbleFreq, T.rubbleOct) * T.rubbleAmp;
  const shelf = Math.pow(CPU.fbm(qx * T.shelfFreq + T.shelfOff, qz * T.shelfFreq + T.shelfOff, T.shelfOct), 2.2) * T.shelfAmp;
  const basin = CPU.smoothstep(T.basinLo, T.basinHi,
    CPU.fbm(x * T.basinFreq + T.basinOff, z * T.basinFreq + T.basinOff, T.basinOct)) * T.basinDepth;
  const grit = CPU.fbm(x * T.gritFreq + T.gritOff, z * T.gritFreq + T.gritOff, T.gritOct) * T.gritAmp;
  const r = Math.hypot(x, z);
  const well = veff(r) * BH.depth;
  /* Beyond the surveyed gravity field the planet opens into a low, broad
     regolith desert. The blend keeps the boundary traversable. */
  const outer = CPU.smoothstep(800, 1040, r);
  const core = macro + spine + rubble + shelf - basin + grit + well;
  const dunes = (CPU.fbm(x * 0.0087 + 71.3, z * 0.0087 + 71.3, 3) - 0.5) * 2.4
    + (CPU.fbm(x * 0.021 + 14.8, z * 0.021 + 14.8, 2) - 0.5) * 0.55;

  const terra = core * (1 - outer) + dunes * outer;
  const desert = desertHeightCPU(x, z);
  return terra * (1 - worldMix) + desert * worldMix;
}

/* The outer desert lies beyond a raised, permanent terminator. It is not a
   display effect: this same value reaches the power model and removes solar
   charging continuously as the rover enters the expanded territory. */
/* The open survey radius. Power is unrestricted through 700 m; the last
   100 m is the perceptible retreat threshold, and beyond 800 m this planet's
   canyon-like shadow cuts solar input completely. The generic Power class
   receives this as a world policy, so another planet can define its own sky. */
export const solarAccessCPU = (x, z) => {
  const terra = 1 - CPU.smoothstep(700, 800, Math.hypot(x, z));
  return terra * (1 - worldMix) + worldMix;
};

export function normalCPU(x, z, e = 0.35) {
  const dhdx = (heightCPU(x + e, z) - heightCPU(x - e, z)) / (2 * e);
  const dhdz = (heightCPU(x, z + e) - heightCPU(x, z - e)) / (2 * e);
  const len = Math.hypot(-dhdx, 1, -dhdz);
  return [-dhdx / len, 1 / len, -dhdz / len];
}
