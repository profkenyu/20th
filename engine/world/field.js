/**
 * FIELD — a vector field baked to a coarse grid.
 *
 * WHY BAKE IT
 *   Curl noise needs three potential evaluations per sample. Doing that per
 *   scattered instance would cost hundreds of thousands of evaluations per
 *   recentre for a field whose wavelength is tens of metres — i.e. one that
 *   carries no information at instance spacing. Baking it to a grid is roughly
 *   a sevenfold saving, and instances read it back with four storage loads.
 *
 * WHAT IS STORED  vec4( dirX, dirZ, coherence, patch )
 *   coherence  |∇ψ|, normalised. Near a stagnation point the direction is
 *              meaningless and instances should stand upright rather than pick
 *              a random lean.
 *   patch      a second low-frequency scalar, used as a density mask.
 *
 * THE WORK SUPPLIES `potential(p) → float`.
 *   The field is the CURL of that scalar, so anything the work adds to it stays
 *   divergence-free automatically. Circulation, drift, braiding — all of it is
 *   another term in one potential rather than a second system bolted alongside.
 */

import {
  Fn, attributeArray, instanceIndex, float, uint, vec2, vec4,
  length, mix, max, clamp, floor, int, saturate, step,
} from 'three/tsl';
import { cfg } from '../config.js';
import { fbm } from '../tsl/noise.js';

export class Field {
  constructor(clipmap, { potential, patch, coherenceScale = 0.055 }) {
    const F = cfg().field;
    const G = this.grid = F.grid;
    const SPAN = this.span = F.span;
    const COUNT = G * G;
    this.cell = SPAN / (G - 1);
    this.buf = attributeArray(COUNT, 'vec4');
    this.uOrigin = clipmap.uOrigin;              // shared — never recentre alone

    const patchOf = patch ?? (p => fbm(p.mul(0.0075).add(63.4), 2));

    this.pass = Fn(() => {
      const i = instanceIndex;
      const col = float(i.mod(uint(G)));
      const row = float(i.div(uint(G)));
      const lx = col.div(G - 1).sub(0.5).mul(SPAN);
      const lz = row.div(G - 1).sub(0.5).mul(SPAN);
      const w = vec2(lx.add(this.uOrigin.x), lz.add(this.uOrigin.y)).toVar();

      const p0 = potential(w).toVar();
      const dpdx = potential(w.add(vec2(F.eps, 0.0))).sub(p0).div(F.eps);
      const dpdz = potential(w.add(vec2(0.0, F.eps))).sub(p0).div(F.eps);

      const v = vec2(dpdz, dpdx.negate()).toVar();   // curl of a scalar: div-free
      const mag = length(v).toVar();
      const coherence = saturate(mag.div(coherenceScale));

      /* THE DIRECTION IS THE FIELD'S, OR THE DEFAULT. Never a blend of both.

         It used to be `mix(default, v̂, coherence)`, and mixing two UNIT
         vectors is a trap: at coherence 0.5 with the field pointing exactly
         opposite the default they cancel, and normalize() of that is NaN —
         written straight into the field buffer, from which every filament in
         all three rings then reads it. Swept numerically the minimum length is
         0.0012, so the bad region is not one point but a neighbourhood where
         the direction is amplified noise.

         The blend was never needed. Coherence is already published in .z, and
         the scatter uses it to decide how far a blade leans — a slack field
         stands its blades upright without anyone rotating them. */
      const alive = step(float(1e-5), mag);
      const dir = mix(vec2(0.0, 1.0), v.div(max(mag, 1e-5)), alive);

      this.buf.element(i).assign(vec4(dir, coherence, patchOf(w)));
    })().compute(COUNT);

    this.sample = Fn(([lx, lz]) => {
      const gx = clamp(lx.div(SPAN).add(0.5).mul(G - 1), 0.0, G - 1.002).toVar();
      const gz = clamp(lz.div(SPAN).add(0.5).mul(G - 1), 0.0, G - 1.002).toVar();
      const c0 = int(floor(gx)), r0 = int(floor(gz));
      const fx = gx.sub(floor(gx)), fz = gz.sub(floor(gz));
      const i00 = uint(r0.mul(int(G)).add(c0));
      const a = this.buf.element(i00);
      const b = this.buf.element(i00.add(uint(1)));
      const c = this.buf.element(i00.add(uint(G)));
      const d = this.buf.element(i00.add(uint(G + 1)));
      return mix(mix(a, b, fx), mix(c, d, fx), fz);
    });

    this.stats = { cells: COUNT, grid: G, cell: this.cell };
  }

  async recompute(renderer) { await renderer.computeAsync(this.pass); }
}
