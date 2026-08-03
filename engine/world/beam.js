/**
 * BEAM — the shaft of the headlights, and why it exists at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE HONEST REASON
 *
 * Earlier this engine argued that a lamp on an airless world casts no visible
 * shaft: nothing scatters, so you see the lit ground and nothing between. That
 * is right about AIR and wrong about the Moon.
 *
 * Airless bodies carry a thin population of ELECTROSTATICALLY LEVITATED DUST.
 * Solar ultraviolet photoionises the surface, grains a few microns across pick
 * up charge, mutual repulsion lifts them clear, and they hang and fall back.
 * Surveyors 5, 6 and 7 photographed the resulting horizon glow after local
 * sunset, and Apollo crews reported streamers before orbital sunrise. It is a
 * real, observed, well-documented phenomenon of exactly this kind of world.
 *
 * So the beam is not a concession. It is what a lamp does when it shines
 * through levitated dust — and the shape follows from the mechanism rather
 * than from taste:
 *
 *   · the layer is DENSEST AT THE SURFACE and thins with height, so the shaft
 *     hugs the ground and is invisible where the lamp points above it;
 *   · it fades out in the last few centimetres, handing over to the lit pool
 *     the ground shader already draws — which is also why there is no hard
 *     seam where the cone meets the terrain;
 *   · it is FAINT. Optical depth through this layer is tiny; a shaft you can
 *     see clearly would be a shaft on a planet with weather.
 *
 * Depth testing is on, so a ridge cuts the beam. Depth WRITING is off and the
 * blend is additive, because light adds.
 *
 * The cone is built from the lamp uniforms in the vertex shader rather than by
 * transforming a mesh, so it cannot drift out of step with the lamps by a
 * frame — the same uniforms, the same instant.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';
import {
  Fn, attribute, varying, float, vec3, vec4,
  normalize, cross, length, exp, smoothstep, saturate, pow, abs, step, mix, clamp,
  cameraPosition,
} from 'three/tsl';
import { cfg } from '../config.js';
import { uLampA, uLampB, uLampDir, uLampPower } from '../tsl/headlight.js';

export class Beam {
  constructor(clipmap) {
    const C = cfg();
    const H = C.headlight;
    const V = C.beam;
    this.meshes = [];
    if (!H || !H.count || !V || V.strength <= 0) return;

    const geo = coneGeometry(V.segments, V.rings);
    const sinOuter = Math.sqrt(Math.max(0, 1 - H.cosOuter * H.cosOuter));

    for (const lamp of [uLampA, uLampB].slice(0, H.count)) {
      /* BackSide, not DoubleSide. Additive blending means a two-sided cone
         adds its near wall and its far wall and comes out twice as bright
         from outside and once from inside — the same beam changing value with
         the camera. Drawing only the far wall is the standard volumetric
         trick and reads identically from both. */
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true, depthWrite: false, side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });

      const t = attribute('coneT', 'float');     // 0 at the lamp, 1 at the end
      const ring = attribute('coneRing', 'vec2'); // cos, sin around the axis

      /* An orthonormal frame on the beam axis, rebuilt per vertex from the
         same uniform the lighting uses.

         THE REFERENCE VECTOR MUST NOT BE PARALLEL TO THE AXIS. Using a fixed
         world up meant that when the rover pitched past about 74° — reachable,
         since the inner cliff is 87° — the cross product collapsed, normalize
         returned NaN, and every vertex of both cones went to NaN. A single
         NaN in a position attribute takes the whole draw with it.

         So the reference is chosen per vertex: world up normally, world
         forward when the axis is within ~25° of vertical. The two agree
         nowhere near each other, so the frame is always well conditioned and
         there is no branch. */
      const dir = normalize(uLampDir);
      const upish = step(float(0.90), abs(dir.y));
      const ref = mix(vec3(0, 1, 0), vec3(0, 0, 1), upish);
      const right = normalize(cross(dir, ref));
      const up = cross(right, dir);
      const radius = t.mul(V.length * sinOuter);

      const world = lamp
        .add(dir.mul(t.mul(V.length)))
        .add(right.mul(ring.x).mul(radius))
        .add(up.mul(ring.y).mul(radius));

      mat.positionNode = world;

      const vT = varying(t);
      const vR = varying(length(ring));                       // 0 axis, 1 rim
      const vW = varying(world);
      /* height above the terrain, from the clipmap the ground itself uses */
      const vH = varying(world.y.sub(
        clipmap.sample(world.x.sub(clipmap.uOrigin.x), world.z.sub(clipmap.uOrigin.y)).x));

      mat.colorNode = Fn(() => {
        /* The levitated layer: densest at the surface, gone above it, and
           faded out at the very bottom so the lit pool takes over cleanly.

           THE HEIGHT IS CLAMPED BEFORE THE EXPONENTIAL. exp(vH / −0.52)
           overflows f32 once vH passes about −46 m, and the result is then
           multiplied by a smoothstep that is exactly zero down there — and
           0 × Infinity is NaN, not zero. A cone whose far end samples a
           clamped clipmap edge while the rover sits at the pit floor reaches
           −144 m easily. Clamping the argument costs one instruction and
           removes the whole class: below the surface the term is zero because
           the smoothstep says so, which is what was meant. */
        const h = clamp(vH, -8.0, 40.0);
        const dust = exp(h.div(-V.scaleHeight)).mul(smoothstep(0.0, V.hugFade, h));

        /* the cone's own profile — soft rim, inverse-square along the axis */
        const rim = pow(saturate(float(1.0).sub(vR)), 1.7);
        const fall = float(1.0).div(float(1.0).add(vT.mul(vT).mul(V.length * V.length / 9.0)));

        /* and it must not stab the camera: fade anything very close */
        const near = smoothstep(0.0, V.nearFade, length(vW.sub(cameraPosition)));

        const a = dust.mul(rim).mul(fall).mul(near).mul(V.strength).mul(uLampPower);
        return vec4(vec3(...H.colour).mul(a), a);
      })();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.meshes.push(mesh);
    }

    this.stats = { cones: this.meshes.length, length: V.length, scaleHeight: V.scaleHeight };
  }
}

/* A unit cone as pure parameters — no world data at all, because the vertex
   shader builds the world position from the lamp uniforms. */
function coneGeometry(seg, rings) {
  const count = (rings + 1) * seg;
  const pos = new Float32Array(count * 3);
  const tA = new Float32Array(count);
  const rA = new Float32Array(count * 2);
  let p = 0;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos[p * 3] = Math.cos(a); pos[p * 3 + 1] = Math.sin(a); pos[p * 3 + 2] = t;
      tA[p] = t;
      rA[p * 2] = Math.cos(a); rA[p * 2 + 1] = Math.sin(a);
      p++;
    }
  }
  const idx = new Uint32Array(rings * seg * 6);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * seg + i, b = r * seg + (i + 1) % seg;
      const c = a + seg, d = b + seg;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('coneT', new THREE.BufferAttribute(tA, 1));
  g.setAttribute('coneRing', new THREE.BufferAttribute(rA, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}
