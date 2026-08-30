/**
 * CPU MIRROR of engine/tsl/noise.js.
 *
 * A vehicle must stand on the ground before the frame is submitted, and a GPU
 * readback is a round trip — so the height field exists twice. The duplication
 * is managed rather than ignored: the runtime divergence probe compares the two
 * once a second at the grid vertex nearest the vehicle.
 *
 * Expected divergence ~1e-6 m, from f32 vs f64 rounding inside the pcg
 * permutation. Anything above 1 mm is a logic drift, not rounding.
 */

import { cfg } from '../config.js';

/** pcg32, bit-exact replica of three's TSL hash(). */
export function pcg(seed) {
  const state = (Math.imul(seed >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 4294967296;
}

export function latticeHash(ix, iz, salt = 0) {
  const L = cfg().lattice;
  return pcg(((ix + L.bias) + Math.imul(iz + L.bias, L.stride) + L.seed + salt) >>> 0);
}

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = latticeHash(ix, iz),     b = latticeHash(ix + 1, iz);
  const c = latticeHash(ix, iz + 1), d = latticeHash(ix + 1, iz + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return ab + (cd - ab) * uz;
}

export const fbmNorm = (oct, gain) => {
  let n = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { n += a; a *= gain; }
  return n;
};

export function fbm(x, z, oct) {
  const { lacunarity, gain } = cfg().lattice;
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) { sum += vnoise(x * freq, z * freq) * amp; amp *= gain; freq *= lacunarity; }
  return sum / fbmNorm(oct, gain);
}

export function ridge(x, z, oct) {
  const { lacunarity, gain } = cfg().lattice;
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) {
    const r = 1 - Math.abs(vnoise(x * freq, z * freq) * 2 - 1);
    sum += r * r * amp; amp *= gain; freq *= lacunarity;
  }
  return sum / fbmNorm(oct, gain);
}

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
