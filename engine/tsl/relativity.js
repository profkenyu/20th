/**
 * GRAVITATIONAL OPTICS — optional.
 *
 * If `cfg().metric` is null the work has no mass: nuRatio() is 1 and redshift()
 * is the identity. A work without gravity pays nothing and writes no branches.
 *
 *   ν_o/ν_e = √(1 − rs/r_e) / √(1 − rs/r_o)
 *
 * The observer's own radius sits in the denominator, so this is genuinely
 * observer-dependent: as the observer descends the world stops reddening and
 * things further out begin to blueshift.
 *
 * BRIGHTNESS follows the exact specific-intensity scaling (ν_o/ν_e)⁴,
 * then shares the CPU power model's finite gain ceiling near the horizon.
 * HUE IS A DECLARED PROXY. A three-channel renderer has no spectrum to shift;
 * the per-channel gains are monotonic in (1 − ν_o/ν_e) and are a representation
 * of a spectral shift, not a computation of one.
 */

import { float, vec3, sqrt, max, min, pow, saturate, uniform, mix } from 'three/tsl';
import { cfg } from '../config.js';
import { BLUESHIFT_GAIN_MAX } from '../cpu/metric.js';

/** The observer's radial coordinate. main() writes it every frame. */
export const uObserverR = uniform(float(1e6));

export function nuRatio(rEmit, rObs) {
  const m = cfg().metric;
  if (!m) return float(1.0);
  const floorR = float(m.rs * 1.0000005);          // never divide by exactly zero
  const a = sqrt(max(float(1e-7), float(1.0).sub(float(m.rs).div(max(rEmit, floorR)))));
  const b = sqrt(max(float(1e-7), float(1.0).sub(float(m.rs).div(max(rObs, floorR)))));
  return a.div(b);
}

export function redshift(colour, q) {
  if (!cfg().metric) return colour;
  const gain = min(pow(q, 4.0), float(BLUESHIFT_GAIN_MAX));
  const t = saturate(float(1.0).sub(q));           // declared proxy for hue
  const tint = vec3(float(1.0), float(1.0).sub(t.mul(0.55)), float(1.0).sub(t.mul(0.80)));
  return colour.mul(gain).mul(mix(vec3(1.0, 1.0, 1.0), tint, saturate(t)));
}

/* The CPU mirrors live in ../cpu/metric.js so that they import no TSL and can
   run in Node. Re-exported here so callers see one module. */
export { lapseAt, nuRatioCPU, blueshiftGainCPU, BLUESHIFT_GAIN_MAX } from '../cpu/metric.js';
