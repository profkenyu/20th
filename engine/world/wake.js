/**
 * WAKE — the only evidence that anything was here.
 *
 * A world-anchored scalar grid that records passage and relaxes back over
 * about seven seconds. Scattered instances read it in the vertex shader and
 * respond by LYING FLATTER — their direction is untouched. The field is not
 * bent by being crossed; its posture is disturbed and then recovers.
 *
 * TWO TRACKS
 *   The stamp is the union of two gaussians, not one. A vehicle on wheels
 *   leaves a left and a right track with undisturbed ground between them, and
 *   at rover scale that gap is the difference between a trail and a smear.
 *   A single-point vehicle just passes the same position twice.
 *
 * WORLD ANCHORING
 *   The recentre step is exactly `snap`, and the wake cell is defined as
 *   snap / cellsPerSnap, so the shift is always an integer number of cells —
 *   no resampling, no blur accumulating on every recentre. Two passes on
 *   recentre only (out to scratch, back again); the per-frame step is
 *   element-wise and safe in place.
 */

import {
  Fn, attributeArray, instanceIndex, uniform,
  float, int, uint, vec2, length, exp, min, max, clamp, step, round, abs, floor, mix,
} from 'three/tsl';
import { cfg } from '../config.js';

export class Wake {
  constructor() {
    const W = cfg().wake;
    const G = this.grid = W.grid;
    const CELL = this.cell = W.cell;
    const SPAN = this.span = G * CELL;
    const COUNT = G * G;

    this.buf = attributeArray(COUNT, 'float');
    this.scratch = attributeArray(COUNT, 'float');

    this.uTrackA = uniform(vec2(0, 0));      // left track,  LOCAL coordinates
    this.uTrackB = uniform(vec2(0, 0));      // right track, LOCAL coordinates
    this.uDecay = uniform(float(1));
    this.uGain = uniform(float(0));
    this.uShift = uniform(vec2(0, 0));       // whole cells, set on recentre

    const localOf = i => {
      const col = float(i.mod(uint(G)));
      const row = float(i.div(uint(G)));
      return vec2(col.sub((G - 1) * 0.5).mul(CELL), row.sub((G - 1) * 0.5).mul(CELL));
    };

    this.passStep = Fn(() => {
      const i = instanceIndex;
      const p = localOf(i);
      const r = float(W.radius);
      const g = d => exp(d.mul(d).div(r.mul(r).mul(-2.0)));
      const stamp = max(g(length(p.sub(this.uTrackA))), g(length(p.sub(this.uTrackB))));
      const prev = this.buf.element(i);
      this.buf.element(i).assign(min(float(1.0), prev.mul(this.uDecay).add(stamp.mul(this.uGain))));
    })().compute(COUNT);

    this.passShiftOut = Fn(() => {
      const i = instanceIndex;
      const col = int(i.mod(uint(G))).add(int(this.uShift.x));
      const row = int(i.div(uint(G))).add(int(this.uShift.y));
      const inside = step(float(0.0), float(col)).mul(step(float(col), float(G - 1)))
        .mul(step(float(0.0), float(row))).mul(step(float(row), float(G - 1)));
      const src = uint(clamp(row, int(0), int(G - 1)).mul(int(G)).add(clamp(col, int(0), int(G - 1))));
      this.scratch.element(i).assign(this.buf.element(src).mul(inside));
    })().compute(COUNT);

    this.passShiftBack = Fn(() => {
      this.buf.element(instanceIndex).assign(this.scratch.element(instanceIndex));
    })().compute(COUNT);

    this.sample = Fn(([lx, lz]) => {
      const gx = lx.div(CELL).add((G - 1) * 0.5);
      const gz = lz.div(CELL).add((G - 1) * 0.5);
      const inside = step(abs(lx), float(SPAN * 0.5 - CELL)).mul(step(abs(lz), float(SPAN * 0.5 - CELL)));
      const i = uint(clamp(round(gz), 0.0, G - 1).mul(G).add(clamp(round(gx), 0.0, G - 1)));
      return this.buf.element(i).mul(inside);
    });

    /* Bilinear, unlike `sample`. A gradient taken from nearest-neighbour
       reads is a staircase, and a staircase in a NORMAL is a grid of facets
       across the ground. The scatter keeps the cheap sampler — it reads once
       per instance and only needs a scalar. */
    this.sampleSmooth = Fn(([lx, lz]) => {
      const gx = clamp(lx.div(CELL).add((G - 1) * 0.5), 0.0, G - 1.002).toVar();
      const gz = clamp(lz.div(CELL).add((G - 1) * 0.5), 0.0, G - 1.002).toVar();
      const c0 = int(floor(gx)), r0 = int(floor(gz));
      const fx = gx.sub(floor(gx)), fz = gz.sub(floor(gz));
      const i00 = uint(r0.mul(int(G)).add(c0));
      const a = this.buf.element(i00);
      const b = this.buf.element(i00.add(uint(1)));
      const c = this.buf.element(i00.add(uint(G)));
      const d = this.buf.element(i00.add(uint(G + 1)));
      const inside = step(abs(lx), float(SPAN * 0.5 - CELL))
        .mul(step(abs(lz), float(SPAN * 0.5 - CELL)));
      return mix(mix(a, b, fx), mix(c, d, fx), fz).mul(inside);
    });

    /* ∇w in metres⁻¹. Forward differences over 1.5 cells: three taps rather
       than four, and the stamp is a gaussian of radius 1.45 m so the field is
       smooth at that scale anyway. Peak |∇w| ≈ 1/(r·√e) ≈ 0.42 m⁻¹. */
    this.gradient = Fn(([lx, lz]) => {
      const e = float(CELL * 1.5);
      const w0 = this.sampleSmooth(lx, lz).toVar();
      const wx = this.sampleSmooth(lx.add(e), lz);
      const wz = this.sampleSmooth(lx, lz.add(e));
      return vec2(wx.sub(w0).div(e), wz.sub(w0).div(e));
    });

    this.stats = { grid: G, cell: CELL, span: SPAN };
  }

  /** Track positions are LOCAL (relative to the shared origin). */
  async step(renderer, dt, ax, az, bx = ax, bz = az) {
    const W = cfg().wake;
    this.uTrackA.value.set(ax, az);
    this.uTrackB.value.set(bx, bz);
    this.uDecay.value = Math.exp(-dt / W.tau);
    this.uGain.value = dt * W.gain;
    await renderer.computeAsync(this.passStep);
  }

  /** Decay 0 and gain 0 zeroes the grid — the step pass already does the work. */
  async clear(renderer) {
    const d = this.uDecay.value, g = this.uGain.value;
    this.uDecay.value = 0; this.uGain.value = 0;
    await renderer.computeAsync(this.passStep);
    this.uDecay.value = d; this.uGain.value = g;
  }

  async shift(renderer, dOriginX, dOriginZ) {
    this.uShift.value.set(Math.round(dOriginX / this.cell), Math.round(dOriginZ / this.cell));
    await renderer.computeAsync(this.passShiftOut);
    await renderer.computeAsync(this.passShiftBack);
  }
}
