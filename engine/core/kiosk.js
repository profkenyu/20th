/**
 * KIOSK — the work must survive its first visitor.
 *
 * Without this, the first person to walk in leaves the piece parked at r = 41
 * with every caption spent and the wake burned into the ground, and everyone
 * after them arrives at the end of someone else's descent.
 *
 * Ninety seconds of no input and the world closes, resets, and reopens. The
 * fade out is faster than the fade in: leaving should feel like a cut,
 * arriving should feel like a dawn.
 *
 * Note that the reset is not a page reload. Reloading would rebuild every
 * compute buffer and cost seconds of black screen; this restores state in
 * place — position, heading, wake, captions — and rebuilds once.
 */

const CSS = `
#fh-veil{
  position:fixed;inset:0;z-index:40;background:#000;
  opacity:0;pointer-events:none;
  transition:opacity 3.4s cubic-bezier(.4,0,.2,1);
}
#fh-veil.on{opacity:1;transition-duration:2.2s}
`;

export class Kiosk {
  constructor(idleMs = 90000) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.veil = document.createElement('div');
    this.veil.id = 'fh-veil';
    document.body.appendChild(this.veil);

    this.idle = idleMs;
    this.last = performance.now();
    this.state = 'live';
    this.returns = 0;

    const poke = () => { if (this.state === 'live') this.last = performance.now(); };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
      addEventListener(ev, poke, { passive: true });
    }
  }

  get idleFor() { return this.state === 'live' ? (performance.now() - this.last) / 1000 : 0; }

  /** `reset` is awaited between the fade out and the fade in. */
  async update(now, reset) {
    if (this.state === 'live') {
      if (now - this.last < this.idle) return;
      this.state = 'closing';
      this.t0 = now;
      this.veil.classList.add('on');
      return;
    }

    if (this.state === 'closing' && now - this.t0 > 2300) {
      this.state = 'opening';
      await reset();
      this.t0 = performance.now();
      this.veil.classList.remove('on');
      this.returns++;
      return;
    }

    if (this.state === 'opening' && now - this.t0 > 3500) {
      this.state = 'live';
      this.last = now;
    }
  }
}
