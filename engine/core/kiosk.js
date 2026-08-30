const CSS = `
#fh-veil {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: #000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 3.4s cubic-bezier(.4, 0, .2, 1);
}
#fh-veil.on {
  opacity: 1;
  transition-duration: 2.2s;
}
`;
export class Kiosk {
  constructor(idleMs = 9e4) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.veil = document.createElement("div");
    this.veil.id = "fh-veil";
    document.body.appendChild(this.veil);
    this.idle = idleMs;
    this.last = performance.now();
    this.state = "live";
    this.returns = 0;
    const poke = () => {
      if (this.state === "live") this.last = performance.now();
    };
    for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) {
      addEventListener(ev, poke, { passive: true });
    }
  }
  get idleFor() {
    return this.state === "live" ? (performance.now() - this.last) / 1e3 : 0;
  }
  requestReturn(now = performance.now()) {
    if (this.state !== "live") return false;
    this.last = now - this.idle;
    return true;
  }
  async update(now, reset) {
    if (this.state === "live") {
      if (now - this.last < this.idle) return;
      this.state = "closing";
      this.t0 = now;
      this.veil.classList.add("on");
      return;
    }
    if (this.state === "closing" && now - this.t0 > 2300) {
      this.state = "opening";
      await reset();
      this.t0 = performance.now();
      this.veil.classList.remove("on");
      this.returns++;
      return;
    }
    if (this.state === "opening" && now - this.t0 > 3500) {
      this.state = "live";
      this.last = now;
    }
  }
}
