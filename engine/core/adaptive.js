/**
 * ADAPTIVE RESOLUTION — hand-rolled, on purpose.
 *
 * The obvious move is an off-the-shelf performance monitor. It was not used,
 * for one reason: this world stalls deliberately. Every clipmap recentre
 * blocks the frame for several milliseconds while six compute passes rebuild
 * the ground, the field and three rings of filaments. A naive monitor reads
 * those stalls as sustained load and ratchets the resolution down until the
 * image is soft — punishing the renderer for something the renderer did not
 * do.
 *
 * So `skip()` exists. main.js calls it on every recentre, and the window
 * containing a rebuild is discarded rather than measured.
 *
 * Median, not mean: one 40 ms outlier should not move the estimate at all.
 */

const LADDER = [0.5, 0.65, 0.8, 1.0, 1.25, 1.5];

export class Adaptive {
  constructor(renderer, ceiling) {
    this.renderer = renderer;
    this.max = ceiling;
    this.index = LADDER.findIndex(v => v >= ceiling);
    if (this.index < 0) this.index = LADDER.length - 1;
    this.samples = [];
    this.dirty = false;
    this.cooldown = 0;
    this.changes = 0;
    this.slowWindows = 0;
    this.locked = null;
  }

  get dpr() { return this.locked ?? Math.min(this.max, LADDER[this.index]); }

  /** Terminal mode owns resolution permanently for the rest of this visit. */
  lockAt(dpr) {
    this.locked = Math.min(this.max, dpr);
    this.renderer.setPixelRatio(this.dpr);
  }

  /** Discard the current window — a rebuild stall happened inside it. */
  skip() { this.dirty = true; }

  sample(ms, now) {
    if (this.locked != null) return null;
    this.samples.push(ms);
    if (this.samples.length < 48) return;

    const window = this.samples;
    this.samples = [];

    if (this.dirty) { this.dirty = false; return; }
    if (now < this.cooldown) return;

    window.sort((a, b) => a - b);
    const median = window[window.length >> 1];

    /* Resolution is already exhausted. Three sustained slow windows mean the
       expensive lens must yield to the archival renderer. This is one-way:
       the sudden saving would otherwise make the monitor immediately promote
       itself and the work would oscillate between two visual languages. */
    if (this.index === 0 && median > 24.0) this.slowWindows++;
    else this.slowWindows = 0;
    if (this.slowWindows >= 3) return 'critical';

    let next = this.index;
    if (median > 21.0) next = Math.max(0, this.index - 1);
    else if (median < 13.2) next = Math.min(LADDER.length - 1, this.index + 1);

    if (LADDER[next] > this.max) next = this.index;
    if (next === this.index) return;

    this.index = next;
    this.renderer.setPixelRatio(this.dpr);
    this.cooldown = now + 1800;
    this.changes++;
    return null;
  }
}
