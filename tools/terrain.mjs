import { configure } from "../engine/config.js";
import { T, BH } from "../works/terra_incognita/spec.js";
globalThis.window = { UNIVERSE_SEED: null };
const CFG = configure({ lattice: { seed: T.seedBase }, metric: { rs: BH.rs } });
const { heightCPU, normalCPU, veff, setCPUWorldMix } = await import("../works/terra_incognita/surface.cpu.js");
const CH = CFG.vehicle.chassis;
const WHEELBASE = CH.wheelBase * 2, TRACK = CH.track * 2;
function gradeAt(x, z, hdg) {
  const fx = -Math.sin(hdg), fz = -Math.cos(hdg), sx = fz, sz = -fx;
  const f = heightCPU(x + fx * WHEELBASE / 2, z + fz * WHEELBASE / 2);
  const r = heightCPU(x - fx * WHEELBASE / 2, z - fz * WHEELBASE / 2);
  const l = heightCPU(x + sx * TRACK / 2, z + sz * TRACK / 2);
  const q = heightCPU(x - sx * TRACK / 2, z - sz * TRACK / 2);
  return [Math.abs(Math.atan2(f - r, WHEELBASE)), Math.abs(Math.atan2(l - q, TRACK))];
}
const pitch = [], roll = [], cell = [];
let mn = 1e9, mx = -1e9;
for (let i = 0; i < 6e3; i++) {
  const a2 = Math.random() * Math.PI * 2, r = 200 + Math.random() * 600;
  const x = Math.cos(a2) * r, z = Math.sin(a2) * r;
  const h = heightCPU(x, z);
  mn = Math.min(mn, h);
  mx = Math.max(mx, h);
  const [p, q] = gradeAt(x, z, Math.random() * Math.PI * 2);
  pitch.push(p);
  roll.push(q);
  cell.push(Math.abs(Math.atan2(heightCPU(x + CFG.clipmap.cell, z) - h, CFG.clipmap.cell)));
}
const pct = (a2, p) => a2.sort((u, v) => u - v)[Math.floor(a2.length * p)] * 57.29578;
const mean = (a2) => a2.reduce((s, v) => s + v, 0) / a2.length * 57.29578;
console.log("\u2550\u2550 TERRA INCOGNITA \u2014 surface report \u2550\u2550\n");
console.log(`  relief, r 200\u2013800 m      ${mn.toFixed(1)} \u2026 ${mx.toFixed(1)} m`);
console.log("");
console.log(`  slope across ONE CELL (${CFG.clipmap.cell.toFixed(2)} m) \u2014 what the eye sees`);
console.log(`    mean ${mean(cell).toFixed(1)}\xB0   p50 ${pct(cell, 0.5).toFixed(1)}\xB0   p95 ${pct(cell, 0.95).toFixed(1)}\xB0   max ${pct(cell, 0.999).toFixed(1)}\xB0`);
console.log("");
console.log(`  DRIVABILITY \u2014 slope across the rover, ${WHEELBASE.toFixed(2)} m \xD7 ${TRACK.toFixed(2)} m`);
console.log(`    pitch  mean ${mean(pitch).toFixed(1)}\xB0   p50 ${pct(pitch, 0.5).toFixed(1)}\xB0   p95 ${pct(pitch, 0.95).toFixed(1)}\xB0`);
console.log(`    roll   mean ${mean(roll).toFixed(1)}\xB0   p50 ${pct(roll, 0.5).toFixed(1)}\xB0   p95 ${pct(roll, 0.95).toFixed(1)}\xB0`);
console.log("    traction gate opens at 27.5\xB0, closes at 40\xB0");
const stall = pitch.filter((v) => v * 57.29578 > 27.5).length / pitch.length;
console.log(`    ground above 27.5\xB0 pitch:  ${(stall * 100).toFixed(1)} %   \u2190 the probe starts to slip`);
console.log("");
console.log("  eye-scale detail, 24 m transect");
{
  const hs = [];
  for (let i = 0; i < 96; i++) hs.push(heightCPU(-8 + i * 0.25, 611.5));
  console.log(`    relief ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m`);
}
setCPUWorldMix(1);
{
  const dp = [], dr = [];
  let dmn = 1e9, dmx = -1e9;
  for (let i = 0; i < 6e3; i++) {
    const a2 = Math.random() * Math.PI * 2, r = 80 + Math.random() * 560;
    const x = Math.cos(a2) * r, z = Math.sin(a2) * r;
    const h = heightCPU(x, z);
    dmn = Math.min(dmn, h);
    dmx = Math.max(dmx, h);
    const [p, q] = gradeAt(x, z, Math.random() * Math.PI * 2);
    dp.push(p);
    dr.push(q);
  }
  const stalled = dp.filter((v) => v * 57.29578 > 27.5).length / dp.length;
  console.log("");
  console.log("  destination geology \u2014 yardangs / sintered crust / glass wadi");
  console.log(`    relief ${dmn.toFixed(1)} \u2026 ${dmx.toFixed(1)} m`);
  console.log(`    pitch  mean ${mean(dp).toFixed(1)}\xB0   p95 ${pct(dp, 0.95).toFixed(1)}\xB0`);
  console.log(`    roll   mean ${mean(dr).toFixed(1)}\xB0   p95 ${pct(dr, 0.95).toFixed(1)}\xB0`);
  console.log(`    ground above 27.5\xB0 pitch: ${(stalled * 100).toFixed(1)} %`);
}
setCPUWorldMix(2);
{
  const gp = [], gr = [];
  let gmn = 1e9, gmx = -1e9;
  for (let i = 0; i < 6e3; i++) {
    const a2 = Math.random() * Math.PI * 2, r = 60 + Math.random() * 580;
    const x = Math.cos(a2) * r, z = Math.sin(a2) * r;
    const h = heightCPU(x, z);
    gmn = Math.min(gmn, h);
    gmx = Math.max(gmx, h);
    const [p, q] = gradeAt(x, z, Math.random() * Math.PI * 2);
    gp.push(p);
    gr.push(q);
  }
  const stalled = gp.filter((v) => v * 57.29578 > 27.5).length / gp.length;
  console.log("");
  console.log("  BODY 03 geology \u2014 granite swell / exfoliation domes / weathered plain");
  console.log(`    relief ${gmn.toFixed(1)} \u2026 ${gmx.toFixed(1)} m`);
  console.log(`    pitch  mean ${mean(gp).toFixed(1)}\xB0   p95 ${pct(gp, 0.95).toFixed(1)}\xB0`);
  console.log(`    roll   mean ${mean(gr).toFixed(1)}\xB0   p95 ${pct(gr, 0.95).toFixed(1)}\xB0`);
  console.log(`    ground above 27.5\xB0 pitch: ${(stalled * 100).toFixed(1)} %`);
}
setCPUWorldMix(0);
console.log("");
console.log("  derived landforms");
const a = 1, b = -BH.L2 / BH.M, c = 3 * BH.L2, disc = b * b - 4 * a * c;
const r1 = (-b - Math.sqrt(disc)) / 2, r2 = (-b + Math.sqrt(disc)) / 2;
console.log(`    barrier  r ${r1.toFixed(2)} m   height ${(veff(r1) * BH.depth).toFixed(2)} m`);
console.log(`    trough   r ${r2.toFixed(2)} m   height ${(veff(r2) * BH.depth).toFixed(2)} m`);
console.log(`    horizon  r ${BH.rs} m   floor  ${(veff(BH.rs) * BH.depth).toFixed(2)} m`);
{
  const g = [];
  for (let r = BH.rs + 0.5; r < 60; r += 0.5) g.push(Math.atan2(Math.abs((veff(r + 0.5) - veff(r)) * BH.depth), 0.5) * 57.29578);
  console.log(`    inner cliff, r ${BH.rs}\u201360 m: up to ${Math.max(...g).toFixed(0)}\xB0  \u2190 unclimbable by design`);
}
