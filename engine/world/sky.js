import * as THREE from "three";
import {
  Fn,
  varying,
  float,
  vec3,
  vec4,
  positionLocal,
  normalize,
  saturate,
  dot,
  abs,
  mix,
  pow
} from "three/tsl";
import { cfg } from "../config.js";
import { nuRatio, redshift, uObserverR } from "../tsl/relativity.js";
export function buildSky(shade) {
  const C = cfg();
  const L = normalize(vec3(...C.sun));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const vDir = varying(normalize(positionLocal));
  const paint = shade ?? (({ dir, elev, sunDot }) => {
    const base = mix(vec3(...C.color.horizon), vec3(...C.color.void), pow(saturate(elev.mul(2.1)), 0.7));
    const haze = pow(saturate(float(1).sub(abs(elev))), 26).mul(0.3);
    return base.add(vec3(...C.color.dust).mul(haze)).add(vec3(...C.color.crimson).mul(pow(sunDot, 12)).mul(0.075)).add(vec3(...C.color.crimson).mul(pow(sunDot, 900)).mul(1.6));
  });
  mat.colorNode = Fn(() => {
    const dir = normalize(vDir);
    const sky2 = paint({ dir, elev: dir.y, sunDot: saturate(dot(dir, L)), sun: L });
    return vec4(redshift(sky2, nuRatio(float(1e7), uObserverR)), 1);
  })();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(C.atmosphere.skyRadius, 48, 32), mat);
  sky.frustumCulled = false;
  return sky;
}
