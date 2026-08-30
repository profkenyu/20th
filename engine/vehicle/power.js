/**
 * POWER — the second clock.
 *
 * The metric already refuses the horizon: coordinate speed scales by the lapse,
 * so the probe approaches and never arrives. That is a refusal of ARRIVAL.
 * This is a refusal of ATTEMPT. When the cell is empty the machine stops being
 * able to try, and the two endings are not the same ending.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SUN IS 6.6° UP
 *
 * cos incidence on a level deck is therefore 0.115, and a flat array barely
 * covers the load. Two things change it, and both are physical:
 *
 *   the ground — a slope tilted toward the sun charges hard, the far side of
 *     the same ridge drains, and the deck normal comes from the WHEELS rather
 *     than from a control. Nobody wrote a charging minigame; it fell out of
 *     putting a panel on a body that pitches and rolls under a low sun.
 *
 *   the lid — hinged at the nose and adjustable, exactly as the Lunokhod
 *     lineage's was. Raising the rear edge aims the array forward, so a probe
 *     driving toward the sun can catch it and one driving away cannot. The
 *     angle used here is the angle the panel is visibly at.
 *
 * Neither helps in shadow, which is the whole point: the lid is a strategy for
 * the open plain, and the pit does not care about strategy.
 *
 * TERRAIN OCCLUSION IS THE REAL MECHANISM
 *   Eight samples of the height field along the sun azimuth, out to 80 m,
 *   against the sun's elevation line. If anything rises above it, the deck is
 *   in shadow and the array delivers nothing. On the open plain this almost
 *   never fires. Inside the angular-momentum rampart it fires constantly, and
 *   below the inner cliff — 87° of wall — it never stops firing.
 *
 *   So the work does not end because a number was set to run out. It ends
 *   because the shape of the potential eventually stands between a flat panel
 *   and a low sun.
 *
 * AND THE SUNLIGHT IS BLUESHIFTED
 *   The sun is at infinity, so descending BLUESHIFTS it: ν_o/ν_e = 1/√(1−rs/r)
 *   and the flux scales as the fourth power. At the ISCO that is a factor of
 *   3.3 — the well gives the probe more light, right up until the walls take
 *   all of it. A coordinate-static observer makes this idealised gain diverge
 *   at the horizon, where a rover cannot remain static. The renderer and this
 *   budget therefore share one 6× operational ceiling: the image and the
 *   available energy can no longer contradict each other.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { cfg } from '../config.js';
import { blueshiftGainCPU } from '../cpu/metric.js';

export class Power {
  constructor(heightAt, solarAccess = () => 1) {
    this.h = heightAt;
    this.solarAccess = solarAccess;
    this.charge = 1;              // 0…1
    this.solar = 0;
    this.blueshiftGain = 1;
    this.load = 0;
    this.sunlit = true;
    this.dead = false;
    this.deadAt = 0;
    this.bus = 1;                 // lamp supply, 0…1
    this.clock = 0;
  }

  reset(charge = 1) { this.charge = Math.max(0, Math.min(1, charge)); this.dead = false; this.deadAt = 0; this.bus = 1; this.clock = 0; this.blueshiftGain = 1; }

  /**
   * THE LAMP BUS.
   *
   * A steady sag proportional to how hard the suspension is being slammed,
   * plus contact chatter above a threshold, plus a brownout as the cell
   * empties. Fast attack and slow release, because a contact opens instantly
   * and a supply recovers through a capacitor.
   *
   * The chatter is a hash of quantised time rather than Math.random(): it
   * runs at its own rate whatever the frame rate, and the same drive produces
   * the same flicker twice.
   */
  busLevel(dt, severity) {
    const L = cfg().power.lampBus;
    this.clock += dt;

    let want = 1 - L.sag * Math.min(1, severity);
    /* the cell failing takes the lamps with it, before it takes the drive */
    const b = Math.min(1, Math.max(0, this.charge / L.brownout));
    want *= b * b * (3 - 2 * b);

    if (severity > L.flickerAt) {
      const tick = Math.floor(this.clock * L.flickerHz);
      const h = Math.abs(Math.sin(tick * 12.9898 + 78.233) * 43758.5453) % 1;
      const bite = Math.min(1, (severity - L.flickerAt) / (1 - L.flickerAt));
      if (h < L.duty * bite) want *= 1 - L.flickerDepth;
    }

    const k = want < this.bus ? L.attack : L.release;
    this.bus += (want - this.bus) * Math.min(1, dt * k);
    return this.bus;
  }

  /** Is the deck in the shadow of its own terrain? */
  lit(x, z, y) {
    const P = cfg().power;
    const s = cfg().sun;
    const len = Math.hypot(s[0], s[2]) || 1e-6;
    const ax = s[0] / len, az = s[2] / len;      // azimuth toward the sun
    const tanE = s[1] / len;                     // its elevation, as a slope
    for (const d of P.horizon) {
      if (this.h(x + ax * d, z + az * d) - y > d * tanE) return false;
    }
    return true;
  }

  /**
   * @returns { charge, solar, load, sunlit, dead, endurance }
   *   `endurance` is seconds to empty at the current net rate, or Infinity.
   */
  update(dt, v) {
    const P = cfg().power;
    if (this.dead) { this.solar = 0; this.load = 0; this.bus = 0; return this.report(); }
    this.busLevel(dt, v.slam ?? 0);

    /* THE ARRAY NORMAL, not the deck normal.
       Positive pitch is nose-up and tips the normal BACKWARD, so aiming the
       array forward — at a sun the probe is driving toward — means subtracting.
       The lid is therefore hinged at the nose with its rear edge lifting, and
       the geometry is built to match.

       Worth recording how this nearly went wrong. The harness reported
       0.00 %/s at every hinge angle, so the sign was flipped to `+` on the
       assumption that it was inverted. It was not: the test was standing in
       SHADOW — a ridge 30–46 m toward the sun blocks a 6.6° elevation — and
       zero was the honest answer to a question about a shaded panel. A broken
       test is worse than no test, because it will happily talk you out of code
       that was already right. The test now finds sunlit ground first. */
    const arrayPitch = v.pitch - (v.lidTilt ?? 0);
    const cp = Math.cos(arrayPitch), sp = Math.sin(arrayPitch);
    const cr = Math.cos(v.roll), sr = Math.sin(v.roll);
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    const sx = fz, sz = -fx;
    /* up, tilted back by pitch and sideways by roll */
    const n = [
      -fx * sp * cr - sx * sr * cp,
      cp * cr,
      -fz * sp * cr - sz * sr * cp,
    ];
    const s = cfg().sun;
    const sl = Math.hypot(...s);
    const ndl = Math.max(0, (n[0] * s[0] + n[1] * s[1] + n[2] * s[2]) / sl);

    const access = this.solarAccess(v.x, v.z);
    this.sunlit = this.lit(v.x, v.z, v.ground + P.deckHeight) && access > 0.05;

    /* flux from infinity, blueshifted by the well: I ∝ (ν_o/ν_e)⁴ */
    this.blueshiftGain = blueshiftGainCPU(1e7, v.radius);
    this.solar = P.array * ndl * (this.sunlit ? access : 0) * this.blueshiftGain;

    this.load = P.base
      + (v.lamps ? P.lamps : 0)
      + P.drive * Math.min(1, v.speed / cfg().vehicle.cruise) * (2 - v.traction)
      /* the drive fighting its own bump stops. Speed is not free: past the
         suspension's stroke the motors are working against a rigid arm. */
      + P.slam * (v.slam ?? 0);

    this.charge = Math.min(1, Math.max(0, this.charge + (this.solar - this.load) * dt * 0.01));
    if (this.charge <= 0 && !this.dead) { this.dead = true; this.deadAt = performance.now(); }
    return this.report();
  }

  report() {
    const net = this.solar - this.load;
    return {
      charge: this.charge, solar: this.solar, load: this.load, bus: this.bus,
      blueshiftGain: this.blueshiftGain,
      sunlit: this.sunlit, dead: this.dead, net,
      endurance: net < -1e-4 ? (this.charge * 100) / -net : Infinity,
    };
  }
}
