import * as THREE from 'three';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };

export const CAMERA_SHOTS = Object.freeze({
  WIDE: '01 · ULTRAWIDE / ROVER + WIRE LANDER',
  MACRO: '02 · MACRO / WHEEL + SPECIMEN',
  TELE: '03 · TELEPHOTO / MATERIAL FACE',
  RETURN: '04 · LOW SIDE / RETURN + STOW',
  ASCENT: '05 · UNDERSIDE / ASCENT + TRANSIT',
});

const CSS = `
#ti-shot-dissolve{position:fixed;z-index:24;inset:var(--bar) 0;pointer-events:none;
  opacity:0;background:#020304;mix-blend-mode:normal;will-change:opacity}
`;

/**
 * The camera has five and only five grammatical positions. Controllers may
 * still move machines, terrain and sequence state; this director is the final
 * writer of camera position, aim and lens on every rendered frame.
 */
export class ShotDirector {
  constructor({ camera, rover, lander, restoration, mission = null, docking, voyage, heightAt }) {
    this.camera = camera;
    this.rover = rover;
    this.lander = lander;
    this.restoration = restoration;
    this.mission = mission;
    this.docking = docking;
    this.voyage = voyage;
    this.heightAt = heightAt;
    this.current = 'wide';
    this.rendered = 'wide';
    this.transition = null;
    this.manualShot = null;
    this.lastCutAt = -Infinity;
    this.focus = new THREE.Vector3();
    this._camera = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.veil = document.createElement('div');
    this.veil.id = 'ti-shot-dissolve';
    document.body.appendChild(this.veil);
  }

  get label() { return CAMERA_SHOTS[this.rendered.toUpperCase()] ?? this.rendered; }

  get source() { return this.manualShot ? 'manual' : 'authored'; }

  _authoredLock() {
    return this.voyage.active || this.docking.started
      || !!this.restoration.event || !!this.mission?.event;
  }

  availableManualShots() {
    if (this._authoredLock() || this.restoration.complete) return [];
    const shots = ['wide'];
    const specimen = this.mission?.scanFocus ?? this.mission?.target
      ?? this.restoration.scanFocus ?? this.restoration.target;
    const specimenDistance = specimen
      ? Math.hypot(this.rover.pos.x - specimen.x, this.rover.pos.z - specimen.z)
      : Infinity;
    /* A distant waypoint cannot become a macro composition: placing the eye
       at its midpoint was the C-cycle framing error. */
    if (this.mission?.scanFocus || this.restoration.scanFocus || specimenDistance <= 7) {
      shots.push('macro');
    }
    if (this.lander.group.visible) shots.push('tele');
    return shots;
  }

  /** C never revives Rover's obsolete mast/chase writers. It cycles only
      compositions already inside the authored five-shot language. */
  cycle(now = performance.now()) {
    const shots = this.availableManualShots();
    if (shots.length < 2) return false;
    if (this.transition) {
      this.current = this.rendered;
      this.transition = null;
      this.veil.style.opacity = '0';
    }
    const from = this.manualShot ?? this.rendered;
    const at = shots.indexOf(from);
    this.manualShot = shots[(at < 0 ? 0 : at + 1) % shots.length];
    this.lastManualAt = now;
    return true;
  }

  clearManual() { this.manualShot = null; }

  desiredShot() {
    if (this.voyage.active) {
      return ['lift', 'transit', 'descent'].includes(this.voyage.phase)
        ? 'ascent' : 'return';
    }
    if (this.docking.started) return 'return';
    if (this.restoration.group.visible
        && (this.restoration.event?.committed || this.restoration.complete)) return 'tele';
    if (this.restoration.group.visible
        && (this.restoration.scanning || this.restoration.event)) return 'macro';
    if (this.mission?.event) return 'macro';
    if (this.manualShot && this.availableManualShots().includes(this.manualShot)) return this.manualShot;
    const missionDistance = this.mission?.lastDistance ?? Infinity;
    if (this.mission?.active && missionDistance <= 7.0) return 'macro';
    if (this.mission?.group?.visible && this.mission?.complete) return 'macro';
    return 'wide';
  }

  transitionKind(from, to) {
    /* A physical encounter and a machine-state change deserve a cut. The
       contemplative returns to landscape are the only dissolves. */
    if (to === 'macro' || to === 'tele' || to === 'ascent') return 'cut';
    if (from === 'return' && to === 'ascent') return 'cut';
    return 'dissolve';
  }

  update(now) {
    if (this.manualShot && !this.availableManualShots().includes(this.manualShot)) {
      this.manualShot = null;
    }
    const desired = this.desiredShot();
    /* A physical event may begin during a dissolve. Do not let a stale manual
       destination conceal the newly mandatory shot for another 2.4 seconds. */
    if (this.transition && desired !== this.transition.to) {
      this.current = this.rendered;
      this.transition = null;
      this.veil.style.opacity = '0';
    }
    if (!this.transition && desired !== this.current) {
      if (this.transitionKind(this.current, desired) === 'cut') {
        this.current = desired;
        this.lastCutAt = now;
      }
      else this.transition = { from: this.current, to: desired, t0: now, duration: 2400 };
    }

    let shot = this.current, veil = 0;
    if (this.transition) {
      const p = clamp01((now - this.transition.t0) / this.transition.duration);
      /* The old composition persists into the dark half; the new composition
         enters under the same veil. No intermediate camera grammar exists. */
      shot = p < 0.46 ? this.transition.from : this.transition.to;
      veil = Math.sin(p * Math.PI) * 0.86;
      if (p >= 1) {
        this.current = this.transition.to;
        this.transition = null;
        shot = this.current;
        veil = 0;
      }
    }
    this.veil.style.opacity = veil.toFixed(3);
    this.rendered = shot;
    this.apply(shot, now);
    return shot;
  }

  apply(shot, now) {
    if (shot === 'macro') this.macro(now);
    else if (shot === 'tele') this.telephoto(now);
    else if (shot === 'return') this.lowSide(now);
    else if (shot === 'ascent') this.underside(now);
    else this.ultrawide(now);
    this.camera.position.copy(this._camera);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._aim);
    this.focus.copy(this._aim);
    this.camera.updateProjectionMatrix();
  }

  ultrawide(now) {
    const l = this.lander.group.position, r = this.rover.group.position;
    let dx = r.x - l.x, dz = r.z - l.z;
    const separation = Math.hypot(dx, dz) || 1;
    dx /= separation; dz /= separation;
    const sideX = -dz, sideZ = dx;
    const midX = (l.x + r.x) * 0.5, midZ = (l.z + r.z) * 0.5;
    const breadth = Math.max(25, separation * 0.72);
    const breath = Math.sin(now * 0.000065) * Math.min(3, breadth * 0.035);
    const x = midX + sideX * (breadth + breath) - dx * separation * 0.06;
    const z = midZ + sideZ * (breadth + breath) - dz * separation * 0.06;
    const y = Math.max(this.heightAt(x, z) + 4.5, l.y + 9 + separation * 0.22);
    this._camera.set(x, y, z);
    this._aim.set(midX, Math.max(l.y + 3.1, this.rover.deckY + 0.28), midZ);
    this.camera.fov = 62;
  }

  macro(now) {
    const heading = this.rover.heading;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const sx = -fz, sz = fx;
    const data = this.mission?.scanFocus ?? this.mission?.target
      ?? this.restoration.scanFocus ?? this.restoration.target;
    const specimen = data
      ? { x: data.x, y: this.heightAt(data.x, data.z), z: data.z }
      : {
          x: this.rover.pos.x + fx * 1.35,
          y: this.heightAt(this.rover.pos.x + fx * 1.35, this.rover.pos.z + fz * 1.35),
          z: this.rover.pos.z + fz * 1.35,
        };
    const wheelX = this.rover.pos.x + fx * 0.66 + sx * 0.62;
    const wheelZ = this.rover.pos.z + fz * 0.66 + sz * 0.62;
    const targetX = (wheelX + specimen.x) * 0.5;
    const targetZ = (wheelZ + specimen.z) * 0.5;
    const side = Math.sin(now * 0.00017) * 0.08;
    const x = targetX + sx * (1.78 + side) - fx * 0.26;
    const z = targetZ + sz * (1.78 + side) - fz * 0.26;
    this._camera.set(x, this.heightAt(x, z) + 0.34, z);
    this._aim.set(targetX, this.heightAt(targetX, targetZ) + 0.17, targetZ);
    this.camera.fov = 29;
  }

  telephoto(now) {
    const drift = Math.sin(now * 0.000055) * 0.7;
    this._camera.copy(this.lander.dockingPoint(-25.5, 10.5 + drift, 6.7));
    this._aim.copy(this.lander.dockingPoint(-0.7, 0, 3.82));
    this.camera.fov = 23;
  }

  lowSide(now) {
    const drift = Math.sin(now * 0.00009) * 0.32;
    this._camera.copy(this.lander.dockingPoint(-7.4, 9.6 + drift, 1.34));
    this._camera.y = Math.max(this._camera.y, this.heightAt(this._camera.x, this._camera.z) + 0.42);
    this._aim.copy(this.lander.dockingPoint(-3.15, 0, 2.28));
    this.camera.fov = 42;
  }

  underside(now) {
    const transit = this.voyage.phase === 'transit';
    const drift = Math.sin(now * 0.000075) * 0.9;
    this._camera.copy(this.lander.dockingPoint(transit ? -16.5 : -11.5,
      (transit ? 16.5 : 12.5) + drift, transit ? -5.5 : -3.0));
    this._aim.copy(this.lander.dockingPoint(-0.6, 0, 1.55));
    this.camera.fov = transit ? 48 : 44;
  }

  reset() {
    this.current = 'wide';
    this.rendered = 'wide';
    this.transition = null;
    this.manualShot = null;
    this.lastCutAt = -Infinity;
    this.veil.style.opacity = '0';
  }
}
