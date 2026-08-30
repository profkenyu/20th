import { float, vec3, sqrt, max, min, pow, saturate, uniform, mix } from "three/tsl";
import { cfg } from "../config.js";
import { BLUESHIFT_GAIN_MAX } from "../cpu/metric.js";
export const uObserverR = uniform(float(1e6));
export function nuRatio(rEmit, rObs) {
  const m = cfg().metric;
  if (!m) return float(1);
  const floorR = float(m.rs * 1.0000005);
  const a = sqrt(max(float(1e-7), float(1).sub(float(m.rs).div(max(rEmit, floorR)))));
  const b = sqrt(max(float(1e-7), float(1).sub(float(m.rs).div(max(rObs, floorR)))));
  return a.div(b);
}
export function redshift(colour, q) {
  if (!cfg().metric) return colour;
  const gain = min(pow(q, 4), float(BLUESHIFT_GAIN_MAX));
  const t = saturate(float(1).sub(q));
  const tint = vec3(float(1), float(1).sub(t.mul(0.55)), float(1).sub(t.mul(0.8)));
  return colour.mul(gain).mul(mix(vec3(1, 1, 1), tint, saturate(t)));
}
export { lapseAt, nuRatioCPU, blueshiftGainCPU, BLUESHIFT_GAIN_MAX } from "../cpu/metric.js";
