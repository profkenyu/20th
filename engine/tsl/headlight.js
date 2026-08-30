import {
  uniform,
  float,
  vec3,
  dot,
  max,
  min,
  abs,
  saturate,
  smoothstep,
  length
} from "three/tsl";
import { cfg } from "../config.js";
export const uLampA = uniform(vec3(0, 0, 0));
export const uLampB = uniform(vec3(0, 0, 0));
export const uLampDir = uniform(vec3(0, 0, -1));
export const uLampPower = uniform(float(1));
export function headlight(worldPos, normal, twoSided = false) {
  const H = cfg().headlight;
  if (!H || H.count === 0) return vec3(0, 0, 0);
  const lamp = (P) => {
    const d = worldPos.sub(P);
    const dist = max(length(d), float(0.05));
    const dir = d.div(dist);
    const cone = smoothstep(float(H.cosOuter), float(H.cosInner), dot(dir, uLampDir));
    const q = dist.div(H.reach);
    const atten = float(1).div(float(1).add(q.mul(q)));
    const nl = twoSided ? abs(dot(normal, dir)) : saturate(dot(normal, dir.negate()));
    return cone.mul(atten).mul(nl);
  };
  const sum = H.count === 1 ? lamp(uLampA) : lamp(uLampA).add(lamp(uLampB));
  return vec3(...H.colour).mul(min(sum, float(2))).mul(H.intensity).mul(uLampPower);
}
