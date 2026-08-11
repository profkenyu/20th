/**
 * CAPTIONS — the text is not a guide.
 *
 * The lines belong to the work, not the engine: `new Captions(lines)` where
 * each entry is { r, ko, en } and fires once on first descent past r.
 *
 * Each line fires once, on first descent past a radius that means something
 * in the geometry: the circulation window, the stable circular orbit, the
 * angular-momentum barrier, the photon sphere. The text states a computed
 * fact and stops. No line explains what to do, and no line describes a
 * feeling. If a line could have been written before the code existed, it
 * has been cut.
 *
 * They fire on descent only. Walking back out does not re-arm them —
 * the second approach is not the first one.
 */


const CSS = `
#fh-cap-line{
  position:fixed;z-index:31;left:50%;transform:translateX(-50%);
  bottom:calc(var(--bar) + 78px);
  text-align:center;pointer-events:none;
  font-family:'DM Mono',ui-monospace,monospace;
  opacity:0;transition:opacity 1.9s cubic-bezier(.4,0,.2,1);
  max-width:min(74vw,720px);
}
#fh-cap-line.on{opacity:1}
#fh-cap-line .ko{
  display:block;font-size:14px;letter-spacing:.14em;line-height:1.9;
  color:#d9dde2;font-weight:400;
  font-family:'Noto Sans KR','DM Mono',ui-monospace,sans-serif;
}
#fh-cap-line .en{
  display:block;margin-top:9px;font-size:10px;letter-spacing:.20em;
  line-height:1.8;color:#6d737b;text-transform:uppercase;
}
#fh-cap-line .bar{
  display:block;width:34px;height:1px;background:#c0152a;
  margin:16px auto 0;opacity:.75;
}
@media (max-width:760px){
  #fh-cap-line{bottom:calc(var(--bar) + max(94px,env(safe-area-inset-bottom)));max-width:84vw}
  #fh-cap-line .ko{font-size:12px}
  #fh-cap-line .en{font-size:9px}
}
`;

export class Captions {
  constructor(lines = []) {
    this.lines = lines;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.id = 'fh-cap-line';
    document.body.appendChild(this.el);

    this.fired = new Set();
    this.hideAt = 0;
  }

  update(r, now) {
    for (const line of this.lines) {
      if (this.fired.has(line.r) || r > line.r) continue;
      this.fired.add(line.r);
      this.show(line, now);
      break;
    }
    if (this.hideAt && now > this.hideAt) {
      this.el.classList.remove('on');
      this.hideAt = 0;
    }
  }

  /** Kiosk return: the next visitor gets the first approach, not the second. */
  rearm() {
    this.fired.clear();
    this.hideAt = 0;
    this.el.classList.remove('on');
  }

  /** Fire a line regardless of radius — for an ending, which is not a place. */
  force(line, now = performance.now(), hold = 14000) {
    this.show(line, now);
    this.hideAt = now + hold;
  }

  show(line, now) {
    this.el.innerHTML =
      `<span class="ko">${line.ko}</span>` +
      `<span class="en">${line.en}</span>` +
      `<span class="bar"></span>`;
    this.el.classList.add('on');
    this.hideAt = now + 9200;
  }
}
