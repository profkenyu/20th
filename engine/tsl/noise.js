/**
 * GPU NOISE PRIMITIVES.
 *
 * The lattice hash is three's own `hash()` — a pcg32 permutation. It is not
 * hand-rolled here, and it is replicated bit-exactly in engine/cpu/noise.js so
 * that any work can evaluate its height field on both sides and have the
 * divergence probe verify them.
 *
 * The 2D lattice key is combined in the UNSIGNED INT domain. Doing it in float
 * would exceed f32's exact-integer range and silently quantise the noise far
 * from the origin.
 *
 * Octave cascades are unrolled by a JavaScript loop that emits nodes, so the
 * emitted constant sequence is identical to the CPU mirror by construction.
 */

import { Fn, vec2, float, uint, floor, mix, abs, hash } from 'three/tsl';
import { cfg } from '../config.js';

export const fbmNorm = (oct, gain) => {
  let n = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { n += a; a *= gain; }
  return n;
};

const latticeHash = Fn(([ip]) => {
  const L = cfg().lattice;
  return hash(uint(ip.x.add(L.bias))
    .add(uint(ip.y.add(L.bias)).mul(uint(L.stride)))
    .add(uint(L.seed)));
});

export const vnoise = Fn(([p]) => {
  const i = floor(p).toVar();
  const f = p.sub(i).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = latticeHash(i);
  const b = latticeHash(i.add(vec2(1.0, 0.0)));
  const c = latticeHash(i.add(vec2(0.0, 1.0)));
  const d = latticeHash(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

export function fbm(p, oct) {
  const { lacunarity, gain } = cfg().lattice;
  let sum = null, amp = 0.5, freq = 1.0;
  for (let i = 0; i < oct; i++) {
    const n = vnoise(p.mul(freq)).mul(amp);
    sum = sum ? sum.add(n) : n;
    amp *= gain; freq *= lacunarity;
  }
  return sum.div(fbmNorm(oct, gain));
}

export function ridge(p, oct) {
  const { lacunarity, gain } = cfg().lattice;
  let sum = null, amp = 0.5, freq = 1.0;
  for (let i = 0; i < oct; i++) {
    const v = vnoise(p.mul(freq));
    const r = float(1.0).sub(abs(v.mul(2.0).sub(1.0)));
    const t = r.mul(r).mul(amp);
    sum = sum ? sum.add(t) : t;
    amp *= gain; freq *= lacunarity;
  }
  return sum.div(fbmNorm(oct, gain));
}

/** Salted cell hash for scatter: clump placement uncorrelated with relief. */
export const cellHash = Fn(([ip, salt]) => {
  const L = cfg().lattice;
  return hash(uint(ip.x.add(L.bias))
    .add(uint(ip.y.add(L.bias)).mul(uint(L.stride)))
    .add(uint(L.seed)).add(salt));
});

/** Fragment-stage micro grain. Four hashes. */
export const grain = Fn(([p]) => vnoise(p.mul(2.7)));
