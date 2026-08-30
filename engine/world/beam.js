import * as THREE from "three";
import {
  Fn,
  attribute,
  varying,
  float,
  vec3,
  vec4,
  normalize,
  cross,
  length,
  exp,
  smoothstep,
  saturate,
  pow,
  abs,
  step,
  mix,
  clamp,
  cameraPosition
} from "three/tsl";
import { cfg } from "../config.js";
import { uLampA, uLampB, uLampDir, uLampPower } from "../tsl/headlight.js";
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
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
      });
      const t = attribute("coneT", "float");
      const ring = attribute("coneRing", "vec2");
      const dir = normalize(uLampDir);
      const upish = step(float(0.9), abs(dir.y));
      const ref = mix(vec3(0, 1, 0), vec3(0, 0, 1), upish);
      const right = normalize(cross(dir, ref));
      const up = cross(right, dir);
      const radius = t.mul(V.length * sinOuter);
      const world = lamp.add(dir.mul(t.mul(V.length))).add(right.mul(ring.x).mul(radius)).add(up.mul(ring.y).mul(radius));
      mat.positionNode = world;
      const vT = varying(t);
      const vR = varying(length(ring));
      const vW = varying(world);
      const vH = varying(world.y.sub(
        clipmap.sample(world.x.sub(clipmap.uOrigin.x), world.z.sub(clipmap.uOrigin.y)).x
      ));
      mat.colorNode = Fn(() => {
        const h = clamp(vH, -8, 40);
        const dust = exp(h.div(-V.scaleHeight)).mul(smoothstep(0, V.hugFade, h));
        const rim = pow(saturate(float(1).sub(vR)), 1.7);
        const fall = float(1).div(float(1).add(vT.mul(vT).mul(V.length * V.length / 9)));
        const near = smoothstep(0, V.nearFade, length(vW.sub(cameraPosition)));
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
function coneGeometry(seg, rings) {
  const count = (rings + 1) * seg;
  const pos = new Float32Array(count * 3);
  const tA = new Float32Array(count);
  const rA = new Float32Array(count * 2);
  let p = 0;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2;
      pos[p * 3] = Math.cos(a);
      pos[p * 3 + 1] = Math.sin(a);
      pos[p * 3 + 2] = t;
      tA[p] = t;
      rA[p * 2] = Math.cos(a);
      rA[p * 2 + 1] = Math.sin(a);
      p++;
    }
  }
  const idx = new Uint32Array(rings * seg * 6);
  let k = 0;
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * seg + i, b = r * seg + (i + 1) % seg;
      const c = a + seg, d = b + seg;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("coneT", new THREE.BufferAttribute(tA, 1));
  g.setAttribute("coneRing", new THREE.BufferAttribute(rA, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}
