import { createTimeline } from "animejs";
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
export class AnimeRituals {
  constructor() {
    this.root = document.getElementById("ti-prologue");
    this.cells = [...document.querySelectorAll(
      "#ti-restoration-cells i,#ti-raw-material-gauges .raw-material-gauge"
    )];
    this.readout = document.getElementById("ti-registration-module");
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.title = { heading: 0 };
    this.receiver = { monitor: 0, instruments: 0, caption: 0 };
    this.completion = { cadence: 0, silence: 0 };
    this.completionStarted = false;
    this.titleActive = false;
    this.receiverActive = false;
    this.completionActive = false;
    this.receiverTargets = [
      ["#ti-monitor", "monitor"],
      ["#survey-log", "monitor"],
      ["#fh-hud", "instruments"],
      ["#fh-mission", "instruments"],
      ["#universe-id", "instruments"],
      ["#ti-sound", "instruments"],
      ["#fh-cap-line", "caption"]
    ];
    this.titleTimeline = createTimeline({ autoplay: false, onUpdate: () => this._renderTitle() }).add(this.title, { heading: 1, duration: 640, ease: "out(3)" }, 0);
    this.receiverTimeline = createTimeline({ autoplay: false, onUpdate: () => this._renderReceiver(), onComplete: () => {
      this.receiverActive = false;
      this._clearReceiver();
    } }).add(this.receiver, { monitor: 1, duration: 1020, ease: "out(2)" }, 0).add(this.receiver, { instruments: 1, duration: 1320, ease: "out(3)" }, 430).add(this.receiver, { caption: 1, duration: 760, ease: "out(2)" }, 1740);
    this.completionTimeline = createTimeline({ autoplay: false, onUpdate: () => this._renderCompletion(), onComplete: () => {
      this.completionActive = false;
      this._finishCompletion();
    } }).add(this.completion, { cadence: 1, duration: 105, ease: "steps(1)" }, 0).add(this.completion, { cadence: 2, duration: 185, ease: "steps(1)" }, 115).add(this.completion, { cadence: 3, duration: 310, ease: "steps(1)" }, 310).add(this.completion, { silence: 1, duration: 420, ease: "inOut(2)" }, 0);
  }
  beginTitleBinding() {
    if (!this.root) return;
    this.titleTimeline.pause();
    Object.assign(this.title, { heading: 0 });
    this.root.classList.add("ti-title-rebinding");
    this.titleActive = true;
    if (this.reduced) {
      Object.assign(this.title, { heading: 1 });
      this._renderTitle();
      return;
    }
    this.titleTimeline.restart();
  }
  beginManualReceiverLock() {
    this.receiverTimeline.pause();
    Object.assign(this.receiver, { monitor: 0, instruments: 0, caption: 0 });
    document.body.classList.add("ti-entry-receiver-sync");
    this.receiverActive = true;
    if (this.reduced) {
      Object.assign(this.receiver, { monitor: 1, instruments: 1, caption: 1 });
      this._renderReceiver();
      this._clearReceiver();
      this.receiverActive = false;
      return;
    }
    this.receiverTimeline.restart();
  }
  beginCompletionSilence() {
    if (this.completionStarted) return;
    this.completionStarted = true;
    this.completionTimeline.pause();
    Object.assign(this.completion, { cadence: 0, silence: 0 });
    document.body.classList.add("ti-docking-silence");
    this.completionActive = true;
    if (this.reduced) {
      Object.assign(this.completion, { cadence: 3, silence: 1 });
      this._renderCompletion();
      return;
    }
    this.completionTimeline.restart();
  }
  reset() {
    this.titleTimeline.pause();
    this.receiverTimeline.pause();
    this.completionTimeline.pause();
    this.completionStarted = false;
    this.titleActive = false;
    this.receiverActive = false;
    this.completionActive = false;
    this.root?.classList.remove("ti-title-rebinding");
    document.body.classList.remove("ti-docking-silence");
    this._clearReceiver();
    for (const cell of this.cells) cell.style.removeProperty("--ti-cell-silence");
    if (this.readout) this.readout.textContent = "REGISTRATION PASS \xB7 WAITING";
  }
  suspend() {
    this.titleTimeline.pause();
    this.receiverTimeline.pause();
    this.completionTimeline.pause();
  }
  resume() {
    if (this.titleActive && !this.reduced && !this.titleTimeline.completed) this.titleTimeline.resume();
    if (this.receiverActive && !this.reduced && !this.receiverTimeline.completed) this.receiverTimeline.resume();
    if (this.completionActive && !this.reduced && !this.completionTimeline.completed) this.completionTimeline.resume();
  }
  _renderTitle() {
    if (!this.root) return;
    this.root.style.setProperty("--ti-title-heading", smooth(this.title.heading).toFixed(3));
  }
  _renderReceiver() {
    for (const [selector, key] of this.receiverTargets) {
      const value = smooth(this.receiver[key]);
      const target = document.querySelector(selector);
      if (!target) continue;
      target.style.setProperty("--ti-receiver-opacity", (0.22 + value * 0.78).toFixed(3));
      target.style.setProperty("--ti-receiver-shift", `${((1 - value) * (key === "monitor" ? 7 : 4)).toFixed(2)}px`);
    }
  }
  _clearReceiver() {
    document.body.classList.remove("ti-entry-receiver-sync");
    for (const [selector] of this.receiverTargets) {
      const target = document.querySelector(selector);
      target?.style.removeProperty("--ti-receiver-opacity");
      target?.style.removeProperty("--ti-receiver-shift");
    }
  }
  _renderCompletion() {
    const silence = smooth(this.completion.silence);
    this.cells.forEach((cell, index) => {
      const cellLive = 1 - clamp01(silence * 8 - index);
      cell.style.setProperty("--ti-cell-silence", cellLive.toFixed(3));
    });
    if (!this.readout) return;
    const interval = this.completion.cadence < 1 ? "120MS" : this.completion.cadence < 2 ? "280MS" : "640MS";
    this.readout.textContent = `TELEMETRY HOLD \xB7 NEXT SAMPLE ${interval}`;
  }
  _finishCompletion() {
    if (this.readout) this.readout.textContent = "TELEMETRY HOLD \xB7 LINK QUIET";
  }
}
