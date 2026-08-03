/**
 * SKY — a dome, not a screen-space gradient.
 *
 * A screenUV gradient is cheaper but does not rotate with the head, which
 * destroys the horizon the moment the viewer looks around. The dome is locked
 * to the camera each frame, so it behaves as an infinite backdrop while
 * staying inside the far plane.
 *
 * If the work has a metric, the sky is emitted at infinity and therefore
 * BLUESHIFTS as the observer descends: ν_o/ν_e = 1/√(1 − rs/r_o). Nothing
 * about the sky changed — only where it is being looked at from.
 */

import * as THREE from 'three';
import {
  Fn, varying, float, vec3, vec4, positionLocal,
  normalize, saturate, dot, abs, mix, pow,
} from 'three/tsl';
import { cfg } from '../config.js';
import { nuRatio, redshift, uObserverR } from '../tsl/relativity.js';

export function buildSky(shade) {
  const C = cfg();
  const L = normalize(vec3(...C.sun));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const vDir = varying(normalize(positionLocal));

  const paint = shade ?? (({ dir, elev, sunDot }) => {
    const base = mix(vec3(...C.color.horizon), vec3(...C.color.void), pow(saturate(elev.mul(2.1)), 0.7));
    const haze = pow(saturate(float(1.0).sub(abs(elev))), 26.0).mul(0.30);
    return base
      .add(vec3(...C.color.dust).mul(haze))
      .add(vec3(...C.color.crimson).mul(pow(sunDot, 12.0)).mul(0.075))
      .add(vec3(...C.color.crimson).mul(pow(sunDot, 900.0)).mul(1.6));
  });

  mat.colorNode = Fn(() => {
    const dir = normalize(vDir);
    const sky = paint({ dir, elev: dir.y, sunDot: saturate(dot(dir, L)), sun: L });
    return vec4(redshift(sky, nuRatio(float(1e7), uObserverR)), 1.0);
  })();

  const sky = new THREE.Mesh(new THREE.SphereGeometry(C.atmosphere.skyRadius, 48, 32), mat);
  sky.frustumCulled = false;
  return sky;
}
