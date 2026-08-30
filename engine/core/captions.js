const CSS = `
#fh-cap-line {
  position: fixed;
  z-index: 31;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(var(--frame-bottom) + 78px);
  text-align: center;
  pointer-events: none;
  font-family:
    "DM Mono",
    ui-monospace,
    monospace;
  opacity: 0;
  transition: opacity 1.9s cubic-bezier(.4, 0, .2, 1);
  max-width: min(74vw, 720px);
}
#fh-cap-line.on {
  opacity: 1;
}
#fh-cap-line .ko {
  display: block;
  font-size: 14px;
  letter-spacing: .14em;
  line-height: 1.9;
  color: #d9dde2;
  font-weight: 400;
  font-family:
    "Noto Sans KR",
    "DM Mono",
    ui-monospace,
    sans-serif;
  word-break: keep-all;
}
#fh-cap-line .en {
  display: block;
  margin-top: 9px;
  font-size: 10px;
  letter-spacing: .20em;
  line-height: 1.8;
  color: #6d737b;
  text-transform: uppercase;
}
#fh-cap-line .bar {
  display: block;
  width: 34px;
  height: 1px;
  background: #c0152a;
  margin: 16px auto 0;
  opacity: .75;
}
@media (max-width: 760px) {
  #fh-cap-line {
    bottom: calc(var(--frame-bottom) + 94px);
    max-width: 84vw;
  }
  #fh-cap-line .ko {
    font-size: 12px;
  }
  #fh-cap-line .en {
    font-size: 9px;
  }
}
`;
export class Captions {
  constructor(lines = []) {
    this.lines = lines;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement("div");
    this.el.id = "fh-cap-line";
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
    this.el.setAttribute("aria-atomic", "true");
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
      this.el.classList.remove("on");
      this.hideAt = 0;
    }
  }
  rearm() {
    this.fired.clear();
    this.hideAt = 0;
    this.el.classList.remove("on");
  }
  force(line, now = performance.now(), hold = 14e3) {
    this.show(line, now);
    this.hideAt = now + hold;
  }
  show(line, now) {
    this.el.innerHTML = `<span class="ko">${line.ko}</span><span class="en">${line.en}</span><span class="bar"></span>`;
    this.el.classList.add("on");
    this.hideAt = now + 9200;
  }
}
