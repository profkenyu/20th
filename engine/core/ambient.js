import { cfg } from "../config.js";
import { nuRatioCPU } from "../cpu/metric.js";
export class Ambient {
  constructor() {
    this.ctx = null;
    try {
      this.muted = sessionStorage.getItem("ti_audio_muted") === "1";
    } catch {
      this.muted = false;
    }
    this.started = false;
    this.graphReady = false;
    this.unlocked = false;
    this.needsGesture = !this.muted;
    this.lifecycleSuspended = false;
    this.resumeAttempts = 0;
    this.unlockCount = 0;
    this.lastError = "";
    this.powerLevel = 1;
    this.audioSessionType = "default";
    this.control = null;
    this.silenceUntil = 0;
    this.voyageActive = false;
    addEventListener("pointerup", (e) => {
      if (this.started && this.needsGesture && !this.muted && !this.control?.contains(e.target)) {
        this.activateFromGesture();
      }
    }, { passive: true });
    addEventListener("keydown", (e) => {
      if (e.code === "KeyM") this.handleSoundGesture();
      else if (this.started && this.needsGesture && !this.muted) this.activateFromGesture();
    });
  }
  start() {
    return this.activateFromGesture();
  }
  activateFromGesture({ forceAudible = false } = {}) {
    if (forceAudible) this._setMuted(false);
    if (this.ctx?.state === "closed") this._resetClosedContext();
    if (!this.ctx) this._createContextAndGraph();
    else {
      this._requestResume();
      this._unlockOutput();
    }
    if (this.master) this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.powerLevel,
      this.ctx.currentTime,
      0.035
    );
    this._syncControl();
    return this.ctx;
  }
  _createContextAndGraph() {
    try {
      if (navigator.audioSession && "type" in navigator.audioSession) {
        navigator.audioSession.type = "playback";
        this.audioSessionType = navigator.audioSession.type;
      }
    } catch (e) {
      this.lastError = `audio session: ${e?.message ?? e}`;
    }
    this.started = true;
    const A = cfg().audio;
    let ctx;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio API unavailable");
      ctx = this.ctx = new AudioContextClass();
      ctx.addEventListener?.("statechange", () => this._onStateChange());
      this._requestResume();
      this._unlockOutput();
    } catch (e) {
      this.started = false;
      this.needsGesture = true;
      this.lastError = e?.message ?? String(e);
      this._syncControl();
      return;
    }
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.powerLevel;
    this.master.connect(ctx.destination);
    this.worldGain = ctx.createGain();
    this.worldGain.gain.value = 1;
    this.worldGain.connect(this.master);
    const len = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rows = new Float32Array(16);
    let running = 0, counter = 0;
    for (let i = 0; i < len; i++) {
      counter++;
      let n = 0;
      while (n < 16 && (counter & 1 << n) === 0) n++;
      if (n < 16) {
        running -= rows[n];
        rows[n] = Math.random() * 2 - 1;
        running += rows[n];
      }
      d[i] = (running + (Math.random() * 2 - 1)) / 17;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const noiseLp = ctx.createBiquadFilter();
    noiseLp.type = "lowpass";
    noiseLp.frequency.value = 900;
    noiseLp.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = A.noiseGain;
    noise.connect(noiseLp).connect(this.noiseGain).connect(this.worldGain);
    noise.start();
    this.osc = [ctx.createOscillator(), ctx.createOscillator()];
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = "lowpass";
    droneLp.frequency.value = 1400;
    this.osc[0].type = "sine";
    this.osc[1].type = "triangle";
    this.osc.forEach((o) => {
      o.connect(this.droneGain);
      o.start();
    });
    this.droneGain.connect(droneLp).connect(this.worldGain);
    this.voyageGain = ctx.createGain();
    this.voyageGain.gain.value = this.voyageActive ? 0.022 : 0;
    const voyageLp = ctx.createBiquadFilter();
    voyageLp.type = "lowpass";
    voyageLp.frequency.value = 180;
    voyageLp.Q.value = 1.4;
    this.voyageOsc = [ctx.createOscillator(), ctx.createOscillator()];
    this.voyageOsc[0].type = "sine";
    this.voyageOsc[0].frequency.value = 43;
    this.voyageOsc[1].type = "triangle";
    this.voyageOsc[1].frequency.value = 67.3;
    this.voyageOsc.forEach((o) => {
      o.connect(voyageLp);
      o.start();
    });
    voyageLp.connect(this.voyageGain).connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = A.breath;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = A.noiseGain * 0.45;
    lfo.connect(lfoGain).connect(this.noiseGain.gain);
    lfo.start();
    this.graphReady = true;
    this._syncControl();
  }
  _unlockOutput() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      source.start(0);
      this.unlocked = true;
      this.unlockCount++;
    } catch (e) {
      this.lastError = `unlock: ${e?.message ?? e}`;
      this.needsGesture = true;
    }
  }
  _requestResume() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") {
      this.needsGesture = !this.muted;
      return;
    }
    this.resumeAttempts++;
    let attempt;
    try {
      attempt = ctx.resume();
    } catch (e) {
      this.lastError = `resume: ${e?.message ?? e}`;
      this.needsGesture = !this.muted;
      this._syncControl();
      return;
    }
    Promise.resolve(attempt).then(() => {
      this.needsGesture = !this.muted && ctx.state !== "running";
      this._syncControl();
    }).catch((e) => {
      this.lastError = `resume: ${e?.message ?? e}`;
      this.needsGesture = !this.muted;
      this._syncControl();
    });
  }
  _onStateChange() {
    if (this.ctx?.state === "running") this.needsGesture = false;
    else if (!this.lifecycleSuspended && !this.muted) this.needsGesture = true;
    this._syncControl();
  }
  _resetClosedContext() {
    this.ctx = null;
    this.started = false;
    this.graphReady = false;
    this.unlocked = false;
    this.master = this.worldGain = this.noiseGain = this.droneGain = this.voyageGain = null;
  }
  bindControl(button) {
    this.control = button;
    if (!button) return;
    button.addEventListener("pointerdown", (e) => e.stopPropagation());
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleSoundGesture();
    });
    this._syncControl();
  }
  suspend() {
    this.lifecycleSuspended = true;
    if (this.ctx?.state === "running") this.ctx.suspend().catch((e) => {
      this.lastError = `suspend: ${e?.message ?? e}`;
    });
    this._syncControl();
  }
  resume() {
    this.lifecycleSuspended = false;
    if (!this.ctx || this.muted) {
      this._syncControl();
      return;
    }
    if (this.ctx.state !== "running") this._requestResume();
    this._syncControl();
  }
  update(rO) {
    if (!this.ctx) return 0;
    const A = cfg().audio;
    const q = Math.min(1, nuRatioCPU(A.droneEmitR, rO));
    const t = this.ctx.currentTime;
    const f0 = A.droneBase * q;
    this.osc[0].frequency.setTargetAtTime(f0, t, 0.35);
    this.osc[1].frequency.setTargetAtTime(f0 * 1.4983, t, 0.35);
    this.droneGain.gain.setTargetAtTime(A.droneGain * q * q, t, 0.5);
    const phase = performance.now() * 1e-3 % 52;
    const smooth = (x) => {
      x = Math.max(0, Math.min(1, x));
      return x * x * (3 - 2 * x);
    };
    let presence = phase < 15 ? 1 : phase < 19 ? 1 - smooth((phase - 15) / 4) : phase < 36 ? 0 : phase < 41 ? smooth((phase - 36) / 5) : 1;
    if (performance.now() < this.silenceUntil || this.voyageActive) presence = 0;
    this.worldGain.gain.setTargetAtTime(presence, t, 0.85);
    return q;
  }
  silenceFor(ms) {
    this.silenceUntil = Math.max(this.silenceUntil, performance.now() + ms);
  }
  setVoyage(active) {
    this.voyageActive = !!active;
    if (!this.ctx || !this.voyageGain) return;
    this.worldGain?.gain.setTargetAtTime(
      this.voyageActive ? 0 : 1,
      this.ctx.currentTime,
      this.voyageActive ? 0.8 : 1.4
    );
    this.voyageGain.gain.setTargetAtTime(
      this.voyageActive ? 0.022 : 0,
      this.ctx.currentTime,
      this.voyageActive ? 0.8 : 1.4
    );
  }
  setPower(charge) {
    this.powerLevel = Math.max(0, Math.min(1, charge)) ** 0.7;
    if (!this.master || this.muted) return;
    this.master.gain.setTargetAtTime(this.powerLevel, this.ctx.currentTime, 0.6);
  }
  transferCue(kind = "charge") {
    if (!this.ctx || this.muted || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const profile = {
      charge: [34, 58, 4.8, 0.055],
      mass: [29, 35, 1.4, 0.045],
      release: [52, 24, 1.9, 0.06],
      arrival: [27, 49, 4.6, 0.055],
      contact: [33, 26, 1.2, 0.035],
      online: [47, 31, 2.8, 0.018]
    }[kind] ?? [38, 30, 1.5, 0.06];
    const [f0, f1, duration, level] = profile;
    const bus = ctx.createGain();
    const low = ctx.createOscillator();
    const edge = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    low.type = "sine";
    edge.type = "triangle";
    low.frequency.setValueAtTime(f0, t);
    low.frequency.exponentialRampToValueAtTime(f1, t + duration);
    edge.frequency.setValueAtTime(f0 * 2.02, t);
    edge.frequency.exponentialRampToValueAtTime(f1 * 1.51, t + duration);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(310, t);
    filter.frequency.exponentialRampToValueAtTime(95, t + duration);
    bus.gain.setValueAtTime(1e-4, t);
    bus.gain.exponentialRampToValueAtTime(level, t + Math.min(0.8, duration * 0.58));
    bus.gain.exponentialRampToValueAtTime(1e-4, t + duration);
    low.connect(filter);
    edge.connect(filter);
    filter.connect(bus).connect(this.master);
    low.start(t);
    edge.start(t);
    low.stop(t + duration + 0.05);
    edge.stop(t + duration + 0.05);
  }
  toggle() {
    return this.handleSoundGesture();
  }
  handleSoundGesture() {
    if (this.muted) {
      this._setMuted(false);
      this.activateFromGesture({ forceAudible: true });
    } else if (!this.ctx || this.ctx.state !== "running" || this.needsGesture) {
      this.activateFromGesture();
    } else {
      this._setMuted(true);
    }
    return this.muted;
  }
  _setMuted(muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.powerLevel,
      this.ctx.currentTime,
      0.12
    );
    try {
      sessionStorage.setItem("ti_audio_muted", this.muted ? "1" : "0");
    } catch {
    }
    this.needsGesture = !this.muted && this.ctx?.state !== "running";
    this._syncControl();
  }
  _syncControl() {
    if (!this.control) return;
    const state = this.muted ? "off" : !this.ctx ? "start" : this.ctx.state === "running" && !this.needsGesture ? "on" : "resume";
    const copy = {
      off: ["SOUND \xB7 OFF", "\uC570\uBE44\uC5B8\uD2B8 \uC0AC\uC6B4\uB4DC \uCF1C\uAE30 \xB7 Enable ambient sound"],
      start: ["TAP FOR SOUND", "\uD0ED\uD558\uC5EC \uC570\uBE44\uC5B8\uD2B8 \uC0AC\uC6B4\uB4DC \uC2DC\uC791 \xB7 Tap to start ambient sound"],
      on: ["SOUND \xB7 ON", "\uC570\uBE44\uC5B8\uD2B8 \uC0AC\uC6B4\uB4DC \uB044\uAE30 \xB7 Mute ambient sound"],
      resume: ["RESUME SOUND", "\uD0ED\uD558\uC5EC \uC911\uB2E8\uB41C \uC0AC\uC6B4\uB4DC \uBCF5\uC6D0 \xB7 Tap to resume ambient sound"]
    }[state];
    this.control.dataset.audioState = state;
    this.control.setAttribute("aria-pressed", String(!this.muted));
    this.control.setAttribute("aria-label", copy[1]);
    const label = this.control.querySelector("[data-sound-label]");
    if (label) label.textContent = copy[0];
  }
  snapshot() {
    return {
      started: this.started,
      muted: this.muted,
      graphReady: this.graphReady,
      unlocked: this.unlocked,
      state: this.ctx?.state ?? "uninitialized",
      ui: this.control?.dataset.audioState ?? "unbound",
      needsGesture: this.needsGesture,
      lifecycleSuspended: this.lifecycleSuspended,
      unlockCount: this.unlockCount,
      resumeAttempts: this.resumeAttempts,
      audioSession: this.audioSessionType,
      lastError: this.lastError
    };
  }
}
