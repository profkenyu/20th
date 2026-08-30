/**
 * SCATTER — instanced ribbons aligned to the field.
 *
 * A CORRECTION CARRIED FORWARD FROM THE ORIGINAL SPEC
 *   The plan called for "indirect draw, one draw call" with per-instance
 *   segment LOD. Those are incompatible: one indexed draw has one index buffer
 *   and therefore one segment count. three r185 does expose
 *   `IndirectStorageBufferAttribute` and `atomicAdd`, so compaction was
 *   available. It was not taken, for two reasons:
 *
 *     1. Atomic append makes draw order depend on GPU scheduling. The same seed
 *        would order instances differently on every run and every machine. For
 *        a deterministic seed-based practice that is a real cost.
 *     2. LOD here is a function of distance from the vehicle, and the scatter
 *        grid is already recentred on the vehicle — so distance is known from
 *        the SLOT INDEX at build time. Runtime classification solves a problem
 *        the layout can avoid having.
 *
 *   Hence concentric rings, each a fixed-size InstancedBufferGeometry with its
 *   own segment count. The price is that instances behind the camera still get
 *   vertex invocations; they collapse to degenerate triangles and rasterise
 *   nothing. If the vertex stage ever measures as the bottleneck, indirect
 *   compaction is the escalation, and determinism can be recovered by sorting
 *   the compacted list by slot index.
 *
 * RING SIZING
 *   Cell sizes should be chosen so density × distance² is constant across
 *   rings — constant SCREEN density, which is what the eye reads, not constant
 *   world density. Rings overlap by `fadeBand` and cross-fade, so the
 *   transitions carry no seam.
 *
 * BLADE SHAPE
 *   A circular arc of fixed length, not a bent quad. For total turn θ and arc
 *   length ℓ the tip sits at ℓ·sin θ/θ vertically and ℓ·(1−cos θ)/θ along the
 *   lean. ARC LENGTH IS PRESERVED EXACTLY as θ breathes: the blade bends
 *   without stretching.
 *
 *   The width axis is perpendicular to the lean, which puts the face normal
 *   along the field direction — so the field becomes legible as bands of light
 *   and dark depending on whether you look along a field line or across it.
 *
 * NOT InstancedMesh: hundreds of thousands of identity matrices would cost
 * tens of megabytes of instanceMatrix for transforms that are never used.
 */

import * as THREE from 'three';
import {
  Fn, instancedArray, instanceIndex, varying, hash, time,
  float, uint, vec2, vec3, vec4, positionLocal, positionView,
  normalize, length, cross, dot, abs, min, max, mix, sin, cos, pow, step, clamp,
  smoothstep, floor, fract, exp, cameraPosition, screenSize,
} from 'three/tsl';
import { cfg } from '../config.js';
import { cellHash } from '../tsl/noise.js';
import { nuRatio, redshift, uObserverR } from '../tsl/relativity.js';
import { headlight } from '../tsl/headlight.js';

const TAU = 6.283185307;

export class Scatter {
  constructor(clipmap, field, wake, { shade, lengthOf, dirOf } = {}) {
    const S = cfg().scatter;
    this.rings = S.rings.map(r => this.buildRing(r, clipmap, field, wake, { shade, lengthOf, dirOf }));
    this.meshes = this.rings.map(r => r.mesh);
    this.stats = { instances: S.count, vertices: S.vertices,
                   rings: S.rings.map(r => `${r.count.toLocaleString()}·${r.seg}s`) };
  }

  buildRing(ring, clipmap, field, wake, hooks) {
    const C = cfg();
    const S = C.scatter;
    const CNT = ring.count, SIDE = ring.side, CELL = ring.cell;
    const uOrigin = clipmap.uOrigin;

    const bufA = instancedArray(CNT, 'vec4');   // worldX, height, worldZ, length
    const bufB = instancedArray(CNT, 'vec4');   // dirX, dirZ, bend, phase

    const pass = Fn(() => {
      const i = instanceIndex;
      const col = float(i.mod(uint(SIDE)));
      const row = float(i.div(uint(SIDE)));
      const jx = hash(i).sub(0.5), jz = hash(i.add(uint(7717))).sub(0.5);
      const lx = col.sub((SIDE - 1) * 0.5).add(jx).mul(CELL).toVar();
      const lz = row.sub((SIDE - 1) * 0.5).add(jz).mul(CELL).toVar();
      const rr = length(vec2(lx, lz)).toVar();

      const gate = float(1.0).sub(smoothstep(ring.r1 - S.fadeBand, ring.r1, rr)).toVar();
      if (ring.r0 > 0) gate.mulAssign(smoothstep(ring.r0, ring.r0 + S.fadeBand, rr));

      const ts = clipmap.sample(lx, lz).toVar();   // height, slope
      const fs = field.sample(lx, lz).toVar();     // dirX, dirZ, coherence, patch

      const slopeFall = float(1.0).sub(smoothstep(S.slopeGate[0], S.slopeGate[1], ts.y));
      const patch = smoothstep(0.30, 0.62, fs.w);
      const alive = step(hash(i.add(uint(31337))), gate.mul(slopeFall).mul(patch));

      /* Voronoi clumping: jittered lattice, 3×3 search. Centres lie strictly
         inside their own cell, so the true nearest is always in the block —
         exact Voronoi, not an approximation. One hash per cell; jitter,
         orientation and height are decorrelated from it by fract(h·k). */
      const cp = vec2(lx.add(uOrigin.x), lz.add(uOrigin.y)).div(S.clumpCell).toVar();
      const cc = floor(cp).toVar();
      const best = float(1e9).toVar(), bh = float(0.0).toVar();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cell = cc.add(vec2(dx, dz));
        const h = cellHash(cell, uint(12007));
        const centre = cell.add(vec2(fract(h.mul(7.13)), fract(h.mul(13.71))));
        const d = length(cp.sub(centre));
        const closer = step(d, best);
        bh.assign(mix(bh, h, closer));
        best.assign(min(best, d));
      }

      const clumpAng = bh.mul(TAU);
      const clumpDir = vec2(cos(clumpAng), sin(clumpAng));
      const clumpH = float(0.75).add(fract(bh.mul(3.37)).mul(0.55));
      const seed = hash(i.add(uint(5501)));
      const world = vec2(lx.add(uOrigin.x), lz.add(uOrigin.y));

      const ctx = { seed, clumpH, height: ts.x, slope: ts.y, field: fs, world, alive };
      const len = (hooks.lengthOf ?? defaultLength)(ctx).mul(alive);
      const dir = (hooks.dirOf ?? defaultDir)({ ...ctx, clumpDir });
      const bend = float(S.bend).mul(float(0.55).add(fs.z.mul(0.75)));
      const phase = fract(bh.mul(19.7)).mul(TAU).add(seed.mul(1.7));

      bufA.element(i).assign(vec4(world.x, ts.x, world.y, len));
      bufB.element(i).assign(vec4(dir.x, dir.y, bend, phase));
    })().compute(CNT);

    /* ── material ─────────────────────────────────────────────────────── */
    const A = bufA.element(instanceIndex);
    const B = bufB.element(instanceIndex);
    const t = positionLocal.y;                       // 0 at base, 1 at tip
    const sideS = positionLocal.x;                   // ±0.5 across the ribbon

    const dir = vec2(B.x, B.y);
    const perp = vec2(dir.y.negate(), dir.x);

    const wakeAt = wake.sample(A.x.sub(uOrigin.x), A.z.sub(uOrigin.y));
    /* Clamped at BOTH ends. An arc of more than a right angle curls its own
       tip back under the base, which reads as a defect rather than as a blade
       lying down — and with the wake's disturbance added the total could reach
       111°. The ceiling is a property of the shape, so it belongs here rather
       than in whatever parameters happen to be set. */
    const theta = clamp(B.z
      .add(sin(time.mul(S.breathRate).add(B.w)).mul(S.breath))
      .add(wakeAt.mul(cfg().wake.flatten)), 0.05, 1.55);

    const tt = theta.mul(t), st = sin(tt), ct = cos(tt);

    /* A 19 mm ribbon at a hundred metres is a fraction of a pixel, and a
       fraction of a pixel shimmers. The first fix widened everything linearly
       with distance, which was a guess: it still left the far ring at 0.56 px
       while making the middle distance visibly fat.

       This is the principled version — a MINIMUM WIDTH IN PIXELS, converted
       back to world units at the instance's own distance:

           w_min = 2·tan(fov/2)·minPixels·d / screenHeight

       Below that distance the ribbon is geometrically true; beyond it the
       ribbon holds a constant apparent width and stops boiling. It adapts to
       resolution and field of view instead of assuming both. */
    const dist = length(A.xyz.sub(cameraPosition));
    const tanHalf = Math.tan(C.atmosphere.fov * Math.PI / 360);
    const minW = float(2 * tanHalf * S.minPixels).mul(dist).div(screenSize.y);
    const w = max(float(S.width), minW).mul(float(1.0).sub(pow(t, 1.6)));

    const lean = float(1.0).sub(ct).div(theta);
    const rise = st.div(theta);

    const live = vec3(
      A.x.add(dir.x.mul(A.w).mul(lean)).add(perp.x.mul(sideS).mul(w)),
      A.y.add(A.w.mul(rise)),
      A.z.add(dir.y.mul(A.w).mul(lean)).add(perp.y.mul(sideS).mul(w)));

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    /* culled instances collapse every vertex onto the base: degenerate
       triangles, zero rasterisation, no branch in the shader */
    mat.positionNode = mix(live, A.xyz, step(A.w, 1e-4));

    const vN = varying(cross(vec3(dir.x.mul(st), ct, dir.y.mul(st)), vec3(perp.x, 0.0, perp.y)));
    const vT = varying(t);
    const vSeed = varying(hash(instanceIndex));
    const vR = varying(length(vec2(A.x, A.z)));
    const vDir = varying(dir);
    const vPos = varying(A.xyz);
    const L = normalize(vec3(...C.sun));

    mat.colorNode = Fn(() => {
      const n = normalize(vN);
      const ndl = abs(dot(n, L));                    // DoubleSide, so unsigned
      const lit = shadeOr(hooks.shade)({
        t: vT, seed: vSeed, ndl, radius: vR, dir: vDir, worldPos: vPos, colour: C.color,
      });
      /* added after the redshift for the same reason as the ground: the lamp
         and the camera share a radius, so its light is not shifted at all */
      const shifted = redshift(lit, nuRatio(vR, uObserverR))
        .add(headlight(vPos, n, true).mul(vec3(...C.color.fil).mul(5.0)));
      const fog = float(1.0).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
      return vec4(mix(shifted, vec3(...C.color.horizon), smoothstep(0.0, 1.0, fog)), 1.0);
    })();

    const mesh = new THREE.Mesh(ribbonGeometry(ring.seg, CNT), mat);
    mesh.frustumCulled = false;
    return { ring, pass, mesh, bufA, bufB };
  }

  async recompute(renderer) {
    for (const r of this.rings) await renderer.computeAsync(r.pass);
  }
}

const defaultLength = ({ seed, clumpH }) =>
  float(cfg().scatter.length).mul(clumpH).mul(float(0.72).add(seed.mul(0.56)));

const defaultDir = ({ field, clumpDir }) =>
  normalize(mix(vec2(field.x, field.y), clumpDir, 0.30));

const shadeOr = fn => fn ?? (({ t, seed, ndl, colour }) =>
  mix(vec3(...colour.fil).mul(0.28), vec3(...colour.fil).mul(1.40), pow(t, 0.8))
    .mul(float(0.86).add(seed.mul(0.28)))
    .mul(ndl.mul(1.55).add(0.06)));

/* The geometry carries no world data — only parametric coordinates.
   position.x is the side (±0.5), position.y the arc parameter (0…1). */
function ribbonGeometry(seg, count) {
  const verts = (seg + 1) * 2;
  const pos = new Float32Array(verts * 3);
  for (let r = 0; r <= seg; r++) {
    const t = r / seg;
    pos[(r * 2) * 3] = -0.5;    pos[(r * 2) * 3 + 1] = t;
    pos[(r * 2 + 1) * 3] = 0.5; pos[(r * 2 + 1) * 3 + 1] = t;
  }
  const idx = new Uint32Array(seg * 6);
  for (let r = 0, k = 0; r < seg; r++) {
    const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return geo;
}
