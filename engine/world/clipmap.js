/**
 * CLIPMAP — a recentring height field driven entirely by compute passes.
 *
 * The mesh is a fixed N×N grid of local vertices. It never grows and never
 * reallocates. Two things make it infinite:
 *
 *   1. `uOrigin` — a world-space offset snapped to a whole number of cells.
 *      Heights are evaluated at (local + origin), i.e. in ABSOLUTE world
 *      coordinates, so the surface does not swim or pop when the grid moves.
 *   2. `mesh.position` — translated by the same snapped offset.
 *
 * `uOrigin` is the anchor for the field grid, the scatter rings and the wake.
 * If any of them recentred independently they would drift out of step.
 *
 * TWO PASSES, TWO BUFFERS
 *   passHeight → bufH (float)  h
 *   passNormal → bufN (vec4)   nx, nz, slope, h
 *   Separate on purpose: pass 2 reads its neighbours' heights while writing its
 *   own record, and sharing one buffer would be a cross-workgroup hazard.
 *
 * NORMAL COMPRESSION
 *   Only nx and nz are stored. For a height field ny > 0 always, so
 *   ny = √(1 − nx² − nz²) is exact — not an approximation.
 *
 * THE WORK SUPPLIES
 *   height(p: vec2) → float     the surface, in absolute world coordinates
 *   shade(ctx) → vec3           albedo and lighting, pre-atmosphere
 * The engine owns the grid, the recentring, the normals, the redshift, the fog
 * and the edge fade. The work owns what the ground is and what it looks like.
 */

import * as THREE from 'three';
import {
  Fn, attributeArray, instanceIndex, vertexIndex, uniform, varying,
  float, int, uint, vec2, vec3, vec4, positionLocal, positionWorld, positionView,
  normalize, sqrt, max, min, mix, exp, smoothstep, clamp, floor, length, abs,
} from 'three/tsl';
import { cfg } from '../config.js';
import { grain } from '../tsl/noise.js';
import { nuRatio, redshift, uObserverR } from '../tsl/relativity.js';
import { headlight } from '../tsl/headlight.js';

export class Clipmap {
  constructor({ height, shade, albedo, wake }) {
    const C = cfg();
    const N = this.N = C.clipmap.grid;
    const SPAN = this.span = C.clipmap.span;
    const CELL = this.cell = C.clipmap.cell;
    const COUNT = this.count = C.clipmap.count;

    this.uOrigin = uniform(vec2(0, 0));
    this.origin = new THREE.Vector2(0, 0);
    this.recentres = 0;

    this.bufH = attributeArray(COUNT, 'float');
    this.bufN = attributeArray(COUNT, 'vec4');

    this.passHeight = Fn(() => {
      const i = instanceIndex;
      const col = float(i.mod(uint(N)));
      const row = float(i.div(uint(N)));
      const lx = col.div(N - 1).sub(0.5).mul(SPAN);
      const lz = row.div(N - 1).sub(0.5).mul(SPAN);
      this.bufH.element(i).assign(height(vec2(lx.add(this.uOrigin.x), lz.add(this.uOrigin.y))));
    })().compute(COUNT);

    this.passNormal = Fn(() => {
      const i = instanceIndex;
      const c = int(i.mod(uint(N)));
      const r = int(i.div(uint(N)));
      const cm = max(c.sub(1), int(0)), cp = min(c.add(1), int(N - 1));
      const rm = max(r.sub(1), int(0)), rp = min(r.add(1), int(N - 1));

      const hL = this.bufH.element(uint(r.mul(int(N)).add(cm)));
      const hR = this.bufH.element(uint(r.mul(int(N)).add(cp)));
      const hD = this.bufH.element(uint(rm.mul(int(N)).add(c)));
      const hU = this.bufH.element(uint(rp.mul(int(N)).add(c)));
      const h = this.bufH.element(i);

      const dhdx = hR.sub(hL).div(float(cp.sub(cm)).mul(CELL));
      const dhdz = hU.sub(hD).div(float(rp.sub(rm)).mul(CELL));
      const n = normalize(vec3(dhdx.negate(), 1.0, dhdz.negate()));
      this.bufN.element(i).assign(vec4(n.x, n.z, float(1.0).sub(n.y), h));
    })().compute(COUNT);

    /* Bilinear, not nearest. At half-metre cells, nearest sampling puts
       scattered instances and vehicle wheels on visible steps, which reads as
       a defect rather than as geology. Four reads is cheap. */
    this.sample = Fn(([lx, lz]) => {
      const gx = clamp(lx.div(SPAN).add(0.5).mul(N - 1), 0.0, N - 1.002).toVar();
      const gz = clamp(lz.div(SPAN).add(0.5).mul(N - 1), 0.0, N - 1.002).toVar();
      const c0 = int(floor(gx)), r0 = int(floor(gz));
      const fx = gx.sub(floor(gx)), fz = gz.sub(floor(gz));
      const i00 = uint(r0.mul(int(N)).add(c0));
      const a = this.bufN.element(i00);
      const b = this.bufN.element(i00.add(uint(1)));
      const c = this.bufN.element(i00.add(uint(N)));
      const d = this.bufN.element(i00.add(uint(N + 1)));
      return vec2(mix(mix(a.w, b.w, fx), mix(c.w, d.w, fx), fz),
                  mix(mix(a.z, b.z, fx), mix(c.z, d.z, fx), fz));
    });

    this.mesh = new THREE.Mesh(buildGrid(N, SPAN), this.buildMaterial(shade, albedo, wake));
    this.mesh.frustumCulled = false;
    this.stats = { vertices: COUNT, triangles: (N - 1) * (N - 1) * 2, cell: CELL };
  }

  buildMaterial(shade, albedoFn, wake) {
    const C = cfg();
    const [f0, f1] = C.clipmap.edgeFade;
    const SPAN = C.clipmap.span;
    const mat = new THREE.MeshBasicNodeMaterial();

    mat.positionNode = Fn(() => {
      const t = this.bufN.element(vertexIndex);
      return vec3(positionLocal.x, t.w, positionLocal.z);
    })();

    const vT = varying(this.bufN.element(vertexIndex));
    const vEdge = varying(max(abs(positionLocal.x), abs(positionLocal.z)).div(SPAN * 0.5));

    /* ∇w is taken in the VERTEX stage, not the fragment stage. Three reasons,
       in order of importance:
         · the grid cell is 0.53 m and the stamp radius is 1.45 m, so a berm is
           roughly six vertices wide — the sampling is already adequate, and
           interpolating the perturbed normal across a triangle is exactly what
           interpolation is for;
         · it is three storage reads per VERTEX (409,600, shared between
           triangles) instead of per fragment (most of the screen);
         · a fragment-stage storage read does not exist under the WebGL2
           fallback, which made the whole feature untestable — the harness
           reported a zero contribution and the ground fragment shader turned
           out to contain no storage binding at all.
       `positionLocal` here IS the wake's local frame: both are anchored to
       uOrigin and the mesh carries the same offset. */
    const vWake = (wake && cfg().wake.relief > 0)
      ? varying(wake.gradient(positionLocal.x, positionLocal.z))
      : null;

    mat.colorNode = Fn(() => {
      const nx = vT.x, nz = vT.y;
      const ny = sqrt(max(float(0.0), float(1.0).sub(nx.mul(nx)).sub(nz.mul(nz))));
      const base = normalize(vec3(nx, ny, nz));

      /* THE TRAIL IS GEOMETRY, NOT PAINT.
         The wake tilts the ground normal and changes nothing else — no albedo
         term, no emissive, no decal. A displaced surface is only visible when
         light grazes it, so the track appears under whatever light is raking
         and vanishes under whatever is not.

         The consequence worth having: the sun's azimuth is FIXED, so a track
         running along it stays nearly invisible. The lamp's azimuth turns with
         the probe, so it finds the track in every direction — and switching
         the lamps off makes the machine's own passage disappear from the
         ground it is standing on. */
      const n = vWake
        ? normalize(base.add(vec3(vWake.x.negate(), 0.0, vWake.y.negate()).mul(C.wake.relief)))
        : base;

      const ctx = {
        normal: n, slope: vT.z, worldPos: positionWorld,
        sun: normalize(vec3(...C.sun)), grain: grain(positionWorld.xz),
      };
      const lit = shade(ctx);

      /* A lamp needs the surface's reflectance, which belongs to the work, not
         to the engine. `albedo` is an optional second hook rather than a
         guessed constant — a lamp on pale dust and a lamp on dark rock are not
         the same lamp, and the engine has no business deciding which. */
      const alb = albedoFn ? albedoFn(ctx) : vec3(...C.color.dust);

      /* The lamp is bolted to the camera's own chassis, so emitter and
         observer share a radius and ν_o/ν_e is exactly 1 — the headlight is
         added AFTER the redshift, never inside it. Deep in the well the world
         dims to a few per cent and the lamps do not dim at all. */
      const shifted = redshift(lit, nuRatio(length(positionWorld.xz), uObserverR))
        .add(headlight(positionWorld, n).mul(alb.mul(3.2).add(0.015)));

      /* Exponential fog never reaches 1 and cannot hide a grid boundary on its
         own. The hard edge fade does, regardless of how fog is later tuned. */
      const fog = float(1.0).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
      const dissolve = max(smoothstep(0.0, 1.0, fog), smoothstep(f0, f1, vEdge));
      return vec4(mix(shifted, vec3(...C.color.horizon), dissolve), 1.0);
    })();

    return mat;
  }

  syncTo(x, z) {
    const q = cfg().snap;
    const sx = Math.round(x / q) * q, sz = Math.round(z / q) * q;
    if (sx === this.origin.x && sz === this.origin.y && this.recentres > 0) return false;
    this.origin.set(sx, sz);
    this.uOrigin.value.set(sx, sz);
    this.mesh.position.set(sx, 0, sz);
    this.recentres++;
    return true;
  }

  async recompute(renderer) {
    await renderer.computeAsync(this.passHeight);
    await renderer.computeAsync(this.passNormal);
  }

  nearestVertex(x, z) {
    const { N, span: S } = this;
    const lx = x - this.origin.x, lz = z - this.origin.y;
    const col = Math.min(N - 1, Math.max(0, Math.round((lx / S + 0.5) * (N - 1))));
    const row = Math.min(N - 1, Math.max(0, Math.round((lz / S + 0.5) * (N - 1))));
    return { index: row * N + col,
             x: (col / (N - 1) - 0.5) * S + this.origin.x,
             z: (row / (N - 1) - 0.5) * S + this.origin.y };
  }
}

/* Authored by hand rather than PlaneGeometry: the compute passes index
   vertices arithmetically, so the vertexIndex → (col,row) mapping must be
   guaranteed, not assumed. */
function buildGrid(N, SPAN) {
  const COUNT = N * N;
  const pos = new Float32Array(COUNT * 3), uv = new Float32Array(COUNT * 2);
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0, t = 0;
  for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
    pos[p++] = (col / (N - 1) - 0.5) * SPAN; pos[p++] = 0; pos[p++] = (row / (N - 1) - 0.5) * SPAN;
    uv[t++] = col / (N - 1); uv[t++] = row / (N - 1);
  }
  let k = 0;
  for (let row = 0; row < N - 1; row++) for (let col = 0; col < N - 1; col++) {
    const a = row * N + col, b = a + 1, c = a + N, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SPAN);
  return geo;
}
