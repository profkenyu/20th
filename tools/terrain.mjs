/**
 * TERRAIN REPORT — measure the surface without a browser.
 *
 *   npm run terrain
 *
 * A surface you cannot measure is a surface you tune by eye. This reports the
 * three things that decide whether a landform works: relief, slope
 * distribution, and — since the observer is a vehicle now — DRIVABILITY, the
 * slope seen across the rover's own wheelbase rather than across one cell.
 */

import { configure } from '../engine/config.js';
import { T, BH } from '../works/terra_incognita/spec.js';

globalThis.window = { UNIVERSE_SEED: null };
const CFG = configure({ lattice: { seed: T.seedBase }, metric: { rs: BH.rs } });
const { heightCPU, normalCPU, veff, setCPUWorldMix } = await import('../works/terra_incognita/surface.cpu.js');

/* READ FROM THE VEHICLE, never hardcoded. These were literals until the rover
   was resized, at which point the report would have gone on describing the
   drivability of a machine that no longer existed — quietly, and with the same
   confident numbers. */
const CH = CFG.vehicle.chassis;
const WHEELBASE = CH.wheelBase * 2, TRACK = CH.track * 2;

function gradeAt(x, z, hdg) {
  const fx = -Math.sin(hdg), fz = -Math.cos(hdg), sx = fz, sz = -fx;
  const f = (heightCPU(x + fx * WHEELBASE / 2, z + fz * WHEELBASE / 2));
  const r = (heightCPU(x - fx * WHEELBASE / 2, z - fz * WHEELBASE / 2));
  const l = (heightCPU(x + sx * TRACK / 2, z + sz * TRACK / 2));
  const q = (heightCPU(x - sx * TRACK / 2, z - sz * TRACK / 2));
  return [Math.abs(Math.atan2(f - r, WHEELBASE)), Math.abs(Math.atan2(l - q, TRACK))];
}

const pitch = [], roll = [], cell = [];
let mn = 1e9, mx = -1e9;
for (let i = 0; i < 6000; i++) {
  const a = Math.random() * Math.PI * 2, r = 200 + Math.random() * 600;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const h = heightCPU(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h);
  const [p, q] = gradeAt(x, z, Math.random() * Math.PI * 2);
  pitch.push(p); roll.push(q);
  cell.push(Math.abs(Math.atan2(heightCPU(x + CFG.clipmap.cell, z) - h, CFG.clipmap.cell)));
}
const pct = (a, p) => (a.sort((u, v) => u - v)[Math.floor(a.length * p)] * 57.29578);
const mean = a => a.reduce((s, v) => s + v, 0) / a.length * 57.29578;

console.log('══ TERRA INCOGNITA — surface report ══\n');
console.log(`  relief, r 200–800 m      ${mn.toFixed(1)} … ${mx.toFixed(1)} m`);
console.log('');
console.log(`  slope across ONE CELL (${CFG.clipmap.cell.toFixed(2)} m) — what the eye sees`);
console.log(`    mean ${mean(cell).toFixed(1)}°   p50 ${pct(cell,.5).toFixed(1)}°   p95 ${pct(cell,.95).toFixed(1)}°   max ${pct(cell,.999).toFixed(1)}°`);
console.log('');
console.log(`  DRIVABILITY — slope across the rover, ${WHEELBASE.toFixed(2)} m × ${TRACK.toFixed(2)} m`);
console.log(`    pitch  mean ${mean(pitch).toFixed(1)}°   p50 ${pct(pitch,.5).toFixed(1)}°   p95 ${pct(pitch,.95).toFixed(1)}°`);
console.log(`    roll   mean ${mean(roll).toFixed(1)}°   p50 ${pct(roll,.5).toFixed(1)}°   p95 ${pct(roll,.95).toFixed(1)}°`);
console.log('    traction gate opens at 27.5°, closes at 40°');
const stall = pitch.filter(v => v * 57.29578 > 27.5).length / pitch.length;
console.log(`    ground above 27.5° pitch:  ${(stall * 100).toFixed(1)} %   ← the probe starts to slip`);
console.log('');
console.log('  eye-scale detail, 24 m transect');
{
  const hs = []; for (let i = 0; i < 96; i++) hs.push(heightCPU(-8 + i * 0.25, 611.5));
  console.log(`    relief ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m`);
}

/* The destination is a second physical surface, not merely a palette swap.
   Measure it independently so a visual improvement cannot quietly make the
   rover unable to cross it. */
setCPUWorldMix(1);
{
  const dp = [], dr = [];
  let dmn = 1e9, dmx = -1e9;
  for (let i = 0; i < 6000; i++) {
    const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 560;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightCPU(x, z); dmn = Math.min(dmn, h); dmx = Math.max(dmx, h);
    const [p, q] = gradeAt(x, z, Math.random() * Math.PI * 2);
    dp.push(p); dr.push(q);
  }
  const stalled = dp.filter(v => v * 57.29578 > 27.5).length / dp.length;
  console.log('');
  console.log('  destination geology — dunes / wadi / basalt mesas');
  console.log(`    relief ${dmn.toFixed(1)} … ${dmx.toFixed(1)} m`);
  console.log(`    pitch  mean ${mean(dp).toFixed(1)}°   p95 ${pct(dp,.95).toFixed(1)}°`);
  console.log(`    roll   mean ${mean(dr).toFixed(1)}°   p95 ${pct(dr,.95).toFixed(1)}°`);
  console.log(`    ground above 27.5° pitch: ${(stalled * 100).toFixed(1)} %`);
}
setCPUWorldMix(0);
console.log('');
console.log('  derived landforms');
const a = 1, b = -BH.L2 / BH.M, c = 3 * BH.L2, disc = b * b - 4 * a * c;
const r1 = (-b - Math.sqrt(disc)) / 2, r2 = (-b + Math.sqrt(disc)) / 2;
console.log(`    barrier  r ${r1.toFixed(2)} m   height ${(veff(r1) * BH.depth).toFixed(2)} m`);
console.log(`    trough   r ${r2.toFixed(2)} m   height ${(veff(r2) * BH.depth).toFixed(2)} m`);
console.log(`    horizon  r ${BH.rs} m   floor  ${(veff(BH.rs) * BH.depth).toFixed(2)} m`);
{
  const g = [];
  for (let r = BH.rs + 0.5; r < 60; r += 0.5) g.push(Math.atan2(Math.abs((veff(r + 0.5) - veff(r)) * BH.depth), 0.5) * 57.29578);
  console.log(`    inner cliff, r ${BH.rs}–60 m: up to ${Math.max(...g).toFixed(0)}°  ← unclimbable by design`);
}
