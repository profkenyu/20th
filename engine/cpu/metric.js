/**
 * The CPU half of the gravitational optics.
 *
 * Separate from tsl/relativity.js for one structural reason: it imports no TSL
 * and therefore runs in Node. `power.js` and `rover.js` both need the lapse,
 * and neither should drag the whole renderer in behind it — which is exactly
 * what happened until this split, and it made the power budget untestable
 * outside a browser.
 *
 * Same rule as the surface: two implementations of one document, kept apart so
 * that one of them can be measured.
 */

import { cfg } from '../config.js';

/* A coordinate-static observer makes q^4 diverge at the horizon. The rover
   cannot physically remain static there, so both the renderer and the energy
   budget use this same finite exhibition-domain regularisation. */
export const BLUESHIFT_GAIN_MAX = 6.0;

/** √(1 − rs/r) — the lapse. 1 when the work has no metric. */
export function lapseAt(r) {
  const m = cfg().metric;
  if (!m) return 1;
  return Math.sqrt(Math.max(0, 1 - m.rs / Math.max(r, m.rs)));
}

/** ν_o/ν_e = √(1 − rs/r_e) / √(1 − rs/r_o). 1 when the work has no metric. */
export function nuRatioCPU(rEmit, rObs) {
  const m = cfg().metric;
  if (!m) return 1;
  const f = m.rs * 1.0000005;
  return Math.sqrt(Math.max(1e-7, 1 - m.rs / Math.max(rEmit, f)))
       / Math.sqrt(Math.max(1e-7, 1 - m.rs / Math.max(rObs, f)));
}

/** Intensity/flux gain shared by rendering and the solar power model. */
export function blueshiftGainCPU(rEmit, rObs) {
  return Math.min(BLUESHIFT_GAIN_MAX, Math.pow(nuRatioCPU(rEmit, rObs), 4));
}
