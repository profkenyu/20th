const LADDER = [0.5, 0.65, 0.8, 1, 1.25, 1.5];
export class Adaptive {
  constructor(renderer, ceiling) {
    this.renderer = renderer;
    this.max = ceiling;
    this.index = LADDER.findIndex((v) => v >= ceiling);
    if (this.index < 0) this.index = LADDER.length - 1;
    this.samples = [];
    this.dirty = false;
    this.cooldown = 0;
    this.changes = 0;
    this.slowWindows = 0;
    this.locked = null;
  }
  get dpr() {
    return this.locked ?? Math.min(this.max, LADDER[this.index]);
  }
  lockAt(dpr) {
    this.locked = Math.min(this.max, dpr);
    this.renderer.setPixelRatio(this.dpr);
  }
  skip() {
    this.dirty = true;
  }
  sample(ms, now) {
    if (this.locked != null) return null;
    this.samples.push(ms);
    if (this.samples.length < 48) return;
    const window = this.samples;
    this.samples = [];
    if (this.dirty) {
      this.dirty = false;
      return;
    }
    if (now < this.cooldown) return;
    window.sort((a, b) => a - b);
    const median = window[window.length >> 1];
    if (this.index === 0 && median > 24) this.slowWindows++;
    else this.slowWindows = 0;
    if (this.slowWindows >= 3) return "critical";
    let next = this.index;
    if (median > 21) next = Math.max(0, this.index - 1);
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
