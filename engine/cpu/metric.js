import { cfg } from "../config.js";
export const BLUESHIFT_GAIN_MAX = 6;
export function lapseAt(r) {
  const m = cfg().metric;
  if (!m) return 1;
  return Math.sqrt(Math.max(0, 1 - m.rs / Math.max(r, m.rs)));
}
export function nuRatioCPU(rEmit, rObs) {
  const m = cfg().metric;
  if (!m) return 1;
  const f = m.rs * 1.0000005;
  return Math.sqrt(Math.max(1e-7, 1 - m.rs / Math.max(rEmit, f))) / Math.sqrt(Math.max(1e-7, 1 - m.rs / Math.max(rObs, f)));
}
export function blueshiftGainCPU(rEmit, rObs) {
  return Math.min(BLUESHIFT_GAIN_MAX, Math.pow(nuRatioCPU(rEmit, rObs), 4));
}
