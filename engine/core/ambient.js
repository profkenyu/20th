/**
 * AMBIENT — there is no air on this planet.
 *
 * Nothing here could physically be heard. Every sound is score, not world,
 * and it is built from the one quantity the world actually has: ν_o/ν_e.
 *
 * THE DRONE IS EMITTED BY THE MASS
 *   A static source sits just outside the horizon, at r_e = 40.4 m. What the
 *   walker hears is that source shifted by
 *
 *       ν_o/ν_e = √(1 − rs/r_e) / √(1 − rs/r_o)
 *
 *   From 620 m out, q ≈ 0.10: the drone is 30 Hz, barely a pressure. At the
 *   barrier, q ≈ 0.18. At 41 m, q ≈ 0.64 and it has climbed to 190 Hz. The
 *   tone RISES as the walker descends, which is the correct and unintuitive
 *   consequence of the observer's own radius sitting in the denominator.
 *   Gain follows q as well, so the hole is inaudible until it is close.
 *
 * PINK NOISE
 *   A fixed bed, generated with the Voss-McCartney cascade rather than a
 *   filtered white source: it holds a true −3 dB/octave slope instead of
 *   approximating one. It does not respond to anything. It is the floor.
 *
 * Audio contexts require a gesture, so nothing starts until the first input.
 */

import { cfg } from '../config.js';
import { nuRatioCPU } from '../cpu/metric.js';

export class Ambient {
  constructor() {
    this.ctx = null;
    try { this.muted = sessionStorage.getItem('ti_audio_muted') === '1'; }
    catch { this.muted = false; }
    this.started = false;
    this.graphReady = false;
    this.unlocked = false;
    this.needsGesture = !this.muted;
    this.lifecycleSuspended = false;
    this.resumeAttempts = 0;
    this.unlockCount = 0;
    this.lastError = '';
    this.powerLevel = 1;
    this.audioSessionType = 'default';
    this.control = null;
    this.silenceUntil = 0;
    this.voyageActive = false;
    /* Touch/pen activation is granted at pointerup, not pointerdown. After an
       iOS interruption, the next real visitor gesture is allowed to restore
       audio even when it lands on the canvas rather than the sound button. */
    addEventListener('pointerup', e => {
      if (this.started && this.needsGesture && !this.muted && !this.control?.contains(e.target)) {
        this.activateFromGesture();
      }
    }, { passive: true });
    addEventListener('keydown', e => {
      if (e.code === 'KeyM') this.handleSoundGesture();
      else if (this.started && this.needsGesture && !this.muted) this.activateFromGesture();
    });
  }

  start() {
    return this.activateFromGesture();
  }

  /** Must be entered synchronously from click/pointerup/keydown on iOS. */
  activateFromGesture({ forceAudible = false } = {}) {
    if (forceAudible) this._setMuted(false);
    if (this.ctx?.state === 'closed') this._resetClosedContext();
    if (!this.ctx) this._createContextAndGraph();
    else {
      this._requestResume();
      this._unlockOutput();
    }
    if (this.master) this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.powerLevel, this.ctx.currentTime, 0.035);
    this._syncControl();
    return this.ctx;
  }

  _createContextAndGraph() {
    try {
      /* On supporting iPhones this requests media-style playback so the work
         behaves like a film score rather than an alert and is not silently
         suppressed by the hardware ring/silent switch. */
      if (navigator.audioSession && 'type' in navigator.audioSession) {
        navigator.audioSession.type = 'playback';
        this.audioSessionType = navigator.audioSession.type;
      }
    } catch (e) { this.lastError = `audio session: ${e?.message ?? e}`; }

    this.started = true;
    const A = cfg().audio;
    let ctx;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio API unavailable');
      ctx = this.ctx = new AudioContextClass();
      ctx.addEventListener?.('statechange', () => this._onStateChange());
      /* Both calls occur before any awaited work: this is the iOS transient
         activation window. The one-frame source is inaudible but forces the
         destination path to open on older WebKit releases. */
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

    /* ── pink bed, Voss-McCartney ───────────────────────────────────── */
    const len = ctx.sampleRate * 8;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rows = new Float32Array(16);
    let running = 0, counter = 0;
    for (let i = 0; i < len; i++) {
      counter++;
      let n = 0;
      while (n < 16 && (counter & (1 << n)) === 0) n++;
      if (n < 16) { running -= rows[n]; rows[n] = Math.random() * 2 - 1; running += rows[n]; }
      d[i] = (running + (Math.random() * 2 - 1)) / 17;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const noiseLp = ctx.createBiquadFilter();
    noiseLp.type = 'lowpass'; noiseLp.frequency.value = 900; noiseLp.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = A.noiseGain;
    noise.connect(noiseLp).connect(this.noiseGain).connect(this.worldGain);
    noise.start();

    /* ── the drone, two detuned partials ────────────────────────────── */
    this.osc = [ctx.createOscillator(), ctx.createOscillator()];
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass'; droneLp.frequency.value = 1400;

    this.osc[0].type = 'sine';
    this.osc[1].type = 'triangle';
    this.osc.forEach(o => { o.connect(this.droneGain); o.start(); });
    this.droneGain.connect(droneLp).connect(this.worldGain);

    /* A restrained carrier for the interplanetary interval. It bypasses the
       planetary world bus but not the visitor's master mute: a low 43 Hz
       reference with an incommensurate 67 Hz edge, heard as communication
       infrastructure rather than engine sound. */
    this.voyageGain = ctx.createGain();
    this.voyageGain.gain.value = this.voyageActive ? 0.022 : 0;
    const voyageLp = ctx.createBiquadFilter();
    voyageLp.type = 'lowpass'; voyageLp.frequency.value = 180; voyageLp.Q.value = 1.4;
    this.voyageOsc = [ctx.createOscillator(), ctx.createOscillator()];
    this.voyageOsc[0].type = 'sine'; this.voyageOsc[0].frequency.value = 43;
    this.voyageOsc[1].type = 'triangle'; this.voyageOsc[1].frequency.value = 67.3;
    this.voyageOsc.forEach(o => { o.connect(voyageLp); o.start(); });
    voyageLp.connect(this.voyageGain).connect(this.master);

    /* ── breathing ──────────────────────────────────────────────────── */
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
    if (!ctx || ctx.state === 'closed') return;
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
    if (!ctx || ctx.state === 'closed') { this.needsGesture = !this.muted; return; }
    this.resumeAttempts++;
    let attempt;
    try { attempt = ctx.resume(); }
    catch (e) {
      this.lastError = `resume: ${e?.message ?? e}`;
      this.needsGesture = !this.muted;
      this._syncControl();
      return;
    }
    Promise.resolve(attempt).then(() => {
      this.needsGesture = !this.muted && ctx.state !== 'running';
      this._syncControl();
    }).catch(e => {
      this.lastError = `resume: ${e?.message ?? e}`;
      this.needsGesture = !this.muted;
      this._syncControl();
    });
  }

  _onStateChange() {
    if (this.ctx?.state === 'running') this.needsGesture = false;
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
    button.addEventListener('pointerdown', e => e.stopPropagation());
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.handleSoundGesture();
    });
    this._syncControl();
  }

  suspend() {
    this.lifecycleSuspended = true;
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(e => {
      this.lastError = `suspend: ${e?.message ?? e}`;
    });
    this._syncControl();
  }

  resume() {
    this.lifecycleSuspended = false;
    if (!this.ctx || this.muted) { this._syncControl(); return; }
    /* Safari exposes `interrupted` in addition to the standard states. */
    if (this.ctx.state !== 'running') this._requestResume();
    this._syncControl();
  }

  /** q = ν_o/ν_e for a source at droneEmitR heard from radius rO.
      With no metric the ratio is 1 and the drone simply holds its pitch. */
  update(rO) {
    if (!this.ctx) return 0;
    const A = cfg().audio;
    const q = Math.min(1, nuRatioCPU(A.droneEmitR, rO));

    const t = this.ctx.currentTime;
    const f0 = A.droneBase * q;
    this.osc[0].frequency.setTargetAtTime(f0, t, 0.35);
    this.osc[1].frequency.setTargetAtTime(f0 * 1.4983, t, 0.35);   // just fifth, detuned
    this.droneGain.gain.setTargetAtTime(A.droneGain * q * q, t, 0.5);
    const phase = (performance.now() * 0.001) % 52;
    const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    let presence = phase < 15 ? 1
      : phase < 19 ? 1 - smooth((phase - 15) / 4)
      : phase < 36 ? 0
      : phase < 41 ? smooth((phase - 36) / 5) : 1;
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
    this.worldGain?.gain.setTargetAtTime(this.voyageActive ? 0 : 1,
      this.ctx.currentTime, this.voyageActive ? 0.8 : 1.4);
    this.voyageGain.gain.setTargetAtTime(this.voyageActive ? 0.022 : 0,
      this.ctx.currentTime, this.voyageActive ? 0.8 : 1.4);
  }

  /** The score is powered by the same cell. As the charge falls the world goes
      quiet, and an empty probe hears nothing at all — there is no receiver. */
  setPower(charge) {
    this.powerLevel = Math.max(0, Math.min(1, charge)) ** 0.7;
    if (!this.master || this.muted) return;
    this.master.gain.setTargetAtTime(this.powerLevel, this.ctx.currentTime, 0.6);
  }

  /** Low-frequency, non-diegetic mass cues for interplanetary transfer. */
  transferCue(kind = 'charge') {
    if (!this.ctx || this.muted || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const profile = {
      charge:  [34, 58, 4.8, .055],
      mass:    [29, 35, 1.4, .045],
      release: [52, 24, 1.9, .060],
      arrival: [27, 49, 4.6, .055],
      contact: [33, 26, 1.2, .035],
      online:  [47, 31, 2.8, .018],
    }[kind] ?? [38, 30, 1.5, .06];
    const [f0, f1, duration, level] = profile;
    const bus = ctx.createGain();
    const low = ctx.createOscillator();
    const edge = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    low.type = 'sine'; edge.type = 'triangle';
    low.frequency.setValueAtTime(f0, t); low.frequency.exponentialRampToValueAtTime(f1, t + duration);
    edge.frequency.setValueAtTime(f0 * 2.02, t); edge.frequency.exponentialRampToValueAtTime(f1 * 1.51, t + duration);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(310, t); filter.frequency.exponentialRampToValueAtTime(95, t + duration);
    bus.gain.setValueAtTime(.0001, t);
    bus.gain.exponentialRampToValueAtTime(level, t + Math.min(.80, duration * .58));
    bus.gain.exponentialRampToValueAtTime(.0001, t + duration);
    low.connect(filter); edge.connect(filter); filter.connect(bus).connect(this.master);
    low.start(t); edge.start(t); low.stop(t + duration + .05); edge.stop(t + duration + .05);
  }

  toggle() {
    return this.handleSoundGesture();
  }

  handleSoundGesture() {
    /* OFF → ON always reopens the destination in this same user gesture.
       ON but interrupted means resume, never the surprising action of mute. */
    if (this.muted) {
      this._setMuted(false);
      this.activateFromGesture({ forceAudible: true });
    } else if (!this.ctx || this.ctx.state !== 'running' || this.needsGesture) {
      this.activateFromGesture();
    } else {
      this._setMuted(true);
    }
    return this.muted;
  }

  _setMuted(muted) {
    this.muted = !!muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(
      this.muted ? 0 : this.powerLevel, this.ctx.currentTime, 0.12);
    try { sessionStorage.setItem('ti_audio_muted', this.muted ? '1' : '0'); } catch {}
    this.needsGesture = !this.muted && this.ctx?.state !== 'running';
    this._syncControl();
  }

  _syncControl() {
    if (!this.control) return;
    const state = this.muted ? 'off'
      : !this.ctx ? 'start'
      : this.ctx.state === 'running' && !this.needsGesture ? 'on' : 'resume';
    const copy = {
      off:    ['SOUND · OFF', '앰비언트 사운드 켜기 · Enable ambient sound'],
      start:  ['TAP FOR SOUND', '탭하여 앰비언트 사운드 시작 · Tap to start ambient sound'],
      on:     ['SOUND · ON', '앰비언트 사운드 끄기 · Mute ambient sound'],
      resume: ['RESUME SOUND', '탭하여 중단된 사운드 복원 · Tap to resume ambient sound'],
    }[state];
    this.control.dataset.audioState = state;
    this.control.setAttribute('aria-pressed', String(!this.muted));
    this.control.setAttribute('aria-label', copy[1]);
    const label = this.control.querySelector('[data-sound-label]');
    if (label) label.textContent = copy[0];
  }

  snapshot() {
    return {
      started: this.started,
      muted: this.muted,
      graphReady: this.graphReady,
      unlocked: this.unlocked,
      state: this.ctx?.state ?? 'uninitialized',
      ui: this.control?.dataset.audioState ?? 'unbound',
      needsGesture: this.needsGesture,
      lifecycleSuspended: this.lifecycleSuspended,
      unlockCount: this.unlockCount,
      resumeAttempts: this.resumeAttempts,
      audioSession: this.audioSessionType,
      lastError: this.lastError,
    };
  }
}
