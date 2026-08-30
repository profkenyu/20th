import * as THREE from "three";
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
export const CAMERA_SHOTS = Object.freeze({
  WIDE: "01 \xB7 ULTRAWIDE / ROVER + WIRE LANDER",
  REAR: "OP \xB7 REAR / ROVER FOLLOW",
  MAST: "OP \xB7 ROVER POV / 8MM WIDE",
  MACRO: "02 \xB7 MACRO / WHEEL + SPECIMEN",
  TELE: "03 \xB7 TELEPHOTO / MATERIAL FACE",
  RETURN: "04 \xB7 LOW SIDE / RETURN + STOW",
  ASCENT: "05 \xB7 UNDERSIDE / ASCENT + TRANSIT"
});
const CSS = `
#ti-shot-dissolve {
  position: fixed;
  z-index: 24;
  inset: var(--frame-top) 0 var(--frame-bottom);
  pointer-events: none;
  opacity: 0;
  background: #020304;
  mix-blend-mode: normal;
  will-change: opacity;
}
#ti-shot-cue {
  position: fixed;
  z-index: 32;
  left: 50%;
  top: calc(var(--frame-top) + 22px);
  pointer-events: none;
  font:
    700 8px/1.5 "DM Mono",
    ui-monospace,
    monospace;
  letter-spacing: .15em;
  text-transform: uppercase;
  color: rgba(217, 221, 226, .72);
  opacity: 0;
  transform: translate(-50%, 3px);
  transition: opacity .42s ease, transform .42s ease;
  white-space: nowrap;
  text-shadow: 0 1px 10px #000;
}
#ti-shot-cue.on {
  opacity: 1;
  transform: translate(-50%, 0);
}
#ti-shot-cue.locked {
  color: rgba(192, 21, 42, .78);
}
`;
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
    this.current = "wide";
    this.rendered = "wide";
    this.transition = null;
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.manualShot = null;
    this.experience = "observer";
    this.forceDissolveOnce = false;
    this.introActive = false;
    this.openingActive = false;
    this.lastCutAt = -Infinity;
    this.focus = new THREE.Vector3();
    this._camera = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.veil = document.createElement("div");
    this.veil.id = "ti-shot-dissolve";
    document.body.appendChild(this.veil);
    this.cue = document.createElement("div");
    this.cue.id = "ti-shot-cue";
    document.body.appendChild(this.cue);
  }
  get label() {
    return CAMERA_SHOTS[this.rendered.toUpperCase()] ?? this.rendered;
  }
  get source() {
    return this.introActive ? "intro" : this.manualShot && !this._authoredLock() ? "manual" : "authored";
  }
  get manualLocked() {
    return this.availableManualShots().length < 2;
  }
  get lockLabel() {
    return this.manualLocked ? this._lockLabel() : "";
  }
  _authoredLock() {
    return this.introActive || this.openingActive || this.voyage.active || this.docking.started || !!this.restoration.event || !!this.mission?.event || this.mission?.state === "complete";
  }
  _lockLabel() {
    if (this.introActive || this.openingActive) return "OPENING SEQUENCE";
    if (this.voyage.active) return "FLIGHT SEQUENCE";
    if (this.docking.started) return "STOW SEQUENCE";
    if (this.restoration.event || this.mission?.event) return "ACTIVE SCAN";
    if (this.mission?.state === "complete") return "FINAL TABLEAU";
    if (this.restoration.group.visible && this.restoration.complete) return "RESTORATION TABLEAU";
    return "AUTHORED SHOT";
  }
  _announce(message, locked = false) {
    this.cue.textContent = message;
    this.cue.classList.toggle("locked", locked);
    this.cue.classList.remove("on");
    void this.cue.offsetWidth;
    this.cue.classList.add("on");
    clearTimeout(this._cueTimer);
    this._cueTimer = setTimeout(() => this.cue.classList.remove("on"), locked ? 1200 : 1550);
  }
  availableManualShots() {
    if (this._authoredLock() || this.restoration.group.visible && this.restoration.complete) return [];
    const shots = ["wide", "rear", "mast"];
    const specimen = this.mission?.scanFocus ?? this.mission?.target ?? this.restoration.scanFocus ?? this.restoration.target;
    const specimenDistance = specimen ? Math.hypot(this.rover.pos.x - specimen.x, this.rover.pos.z - specimen.z) : Infinity;
    if (this.mission?.scanFocus || this.restoration.scanFocus || specimenDistance <= 7) {
      shots.push("macro");
    }
    if (this.lander.group.visible) shots.push("tele");
    return shots;
  }
  cycle(now = performance.now()) {
    const shots = this.availableManualShots();
    if (shots.length < 2) {
      this._announce(`SHOT LOCK \xB7 ${this._lockLabel()}`, true);
      return false;
    }
    if (this.transition) {
      this.current = this.rendered;
      this.transition = null;
      this.veil.style.opacity = "0";
    }
    if (!this.manualShot && shots.includes("rear")) this.manualShot = "rear";
    else {
      const from = this.manualShot ?? this.rendered;
      const at = shots.indexOf(from);
      this.manualShot = shots[(at < 0 ? 0 : at + 1) % shots.length];
    }
    this.lastManualAt = now;
    this._announce(`CAMERA \xB7 ${CAMERA_SHOTS[this.manualShot.toUpperCase()] ?? this.manualShot}`);
    return true;
  }
  selectRear(now = performance.now(), announce = true) {
    const shots = this.availableManualShots();
    if (!shots.includes("rear")) return false;
    if (this.transition) {
      this.current = this.rendered;
      this.transition = null;
      this.veil.style.opacity = "0";
    }
    this.manualShot = "rear";
    this.lastManualAt = now;
    if (announce) this._announce(`CAMERA \xB7 ${CAMERA_SHOTS.REAR}`);
    return true;
  }
  clearManual({ dissolve = false } = {}) {
    const hadManual = !!this.manualShot;
    this.manualShot = null;
    this.forceDissolveOnce = dissolve && hadManual;
  }
  setExperience(mode, now = performance.now()) {
    this.experience = mode === "explorer" ? "explorer" : "observer";
    if (this.experience === "observer") this.clearManual({ dissolve: true });
    this.lastExperienceAt = now;
  }
  setIntro(active) {
    this.introActive = !!active;
    if (active) this.manualShot = null;
  }
  setOpening(active) {
    this.openingActive = !!active;
    if (active) this.manualShot = null;
  }
  desiredShot() {
    if (this.introActive) return "rear";
    if (this.openingActive) return "wide";
    if (this.voyage.active) {
      return ["lift", "transit", "descent"].includes(this.voyage.phase) ? "ascent" : "return";
    }
    if (this.docking.started) return "return";
    if (this.restoration.group.visible && (this.restoration.event?.committed || this.restoration.complete)) return "tele";
    if (this.restoration.group.visible && (this.restoration.scanning || this.restoration.event)) return "macro";
    if (this.mission?.event) return "macro";
    if (this.mission?.group?.visible && this.mission?.complete) return "macro";
    if (this.manualShot && this.availableManualShots().includes(this.manualShot)) return this.manualShot;
    const missionDistance = this.mission?.lastDistance ?? Infinity;
    if (this.mission?.active && missionDistance <= 7) return "macro";
    return this.experience === "observer" ? "wide" : "rear";
  }
  transitionKind(from, to) {
    if (to === "rear" || to === "mast" || to === "macro" || to === "tele" || to === "ascent") return "cut";
    if (from === "return" && to === "ascent") return "cut";
    return "dissolve";
  }
  update(now) {
    if (this.manualShot && !this._authoredLock() && !this.availableManualShots().includes(this.manualShot)) {
      this.manualShot = null;
    }
    const desired = this.desiredShot();
    if (this.transition && desired !== this.transition.to) {
      this.current = this.rendered;
      this.transition = null;
      this.veil.style.opacity = "0";
    }
    if (!this.transition && desired !== this.current) {
      const forcedDissolve = this.forceDissolveOnce && !this._authoredLock();
      this.forceDissolveOnce = false;
      if (this.reducedMotion || !forcedDissolve && this.transitionKind(this.current, desired) === "cut") {
        this.current = desired;
        this.lastCutAt = now;
      } else this.transition = { from: this.current, to: desired, t0: now, duration: 2400 };
    } else if (!this.transition && desired === this.current) this.forceDissolveOnce = false;
    let shot = this.current, veil = 0;
    if (this.transition) {
      const p = clamp01((now - this.transition.t0) / this.transition.duration);
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
    if (shot === "mast") {
      this.mast();
      this.camera.updateProjectionMatrix();
      return;
    }
    this.rover.group.visible = true;
    if (shot === "rear") this.rear(now);
    else if (shot === "macro") this.macro(now);
    else if (shot === "tele") this.telephoto(now);
    else if (shot === "return") this.lowSide(now);
    else if (shot === "ascent") this.underside(now);
    else this.ultrawide(now);
    this.applyPortraitSafeFrame(shot);
    this.camera.position.copy(this._camera);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._aim);
    this.focus.copy(this._aim);
    this.camera.updateProjectionMatrix();
  }
  mast() {
    this.rover.head.updateWorldMatrix(true, false);
    this.camera.position.setFromMatrixPosition(this.rover.head.matrixWorld);
    this.camera.quaternion.setFromRotationMatrix(this.rover.head.matrixWorld);
    this.camera.rotateY(this.rover.lookYaw);
    this.camera.rotateX(this.rover.lookPitch);
    this.camera.fov = 112;
    this._aim.set(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(18).add(this.camera.position);
    this.focus.copy(this._aim);
    this.rover.group.visible = false;
  }
  ultrawide(now) {
    const l = this.lander.group.position, r = this.rover.group.position;
    let dx = r.x - l.x, dz = r.z - l.z;
    const separation = Math.hypot(dx, dz) || 1;
    dx /= separation;
    dz /= separation;
    const sideX = -dz, sideZ = dx;
    const includeLander = this.openingActive || separation <= 52;
    const midX = includeLander ? (l.x + r.x) * 0.5 : r.x - dx * 5.5;
    const midZ = includeLander ? (l.z + r.z) * 0.5 : r.z - dz * 5.5;
    const breadth = includeLander ? Math.max(25, separation * 0.72) : 27;
    const breath = this.reducedMotion ? 0 : Math.sin(now * 65e-6) * Math.min(3, breadth * 0.035);
    const axial = includeLander ? separation * 0.06 : 3.8;
    const x = midX + sideX * (breadth + breath) - dx * axial;
    const z = midZ + sideZ * (breadth + breath) - dz * axial;
    const subjectY = includeLander ? l.y + 9 + separation * 0.22 : this.rover.deckY + 8.4;
    const y = Math.max(this.heightAt(x, z) + 4.5, subjectY);
    this._camera.set(x, y, z);
    this._aim.set(midX, Math.max(l.y + 3.1, this.rover.deckY + 0.28), midZ);
    this.camera.fov = 62;
  }
  rear(now) {
    const heading = this.rover.heading;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const sx = -fz, sz = fx;
    const breathe = this.reducedMotion ? 0 : Math.sin(now * 8e-5) * 0.1;
    const x = this.rover.pos.x - fx * 5.2 + sx * (0.34 + breathe);
    const z = this.rover.pos.z - fz * 5.2 + sz * (0.34 + breathe);
    this._camera.set(x, Math.max(this.heightAt(x, z) + 1.05, this.rover.deckY + 0.72), z);
    this._aim.set(
      this.rover.pos.x + fx * 0.58,
      this.rover.deckY + 0.22,
      this.rover.pos.z + fz * 0.58
    );
    this.camera.fov = 38;
  }
  macro(now) {
    const heading = this.rover.heading;
    const fx = -Math.sin(heading), fz = -Math.cos(heading);
    const sx = -fz, sz = fx;
    const data = this.mission?.scanFocus ?? this.mission?.target ?? this.restoration.scanFocus ?? this.restoration.target;
    const specimenDistance = data ? Math.hypot(this.rover.pos.x - data.x, this.rover.pos.z - data.z) : Infinity;
    const specimen = data && specimenDistance <= 7 ? { x: data.x, y: this.heightAt(data.x, data.z), z: data.z } : {
      x: this.rover.pos.x + fx * 1.35,
      y: this.heightAt(this.rover.pos.x + fx * 1.35, this.rover.pos.z + fz * 1.35),
      z: this.rover.pos.z + fz * 1.35
    };
    const wheelX = this.rover.pos.x + fx * 0.66 + sx * 0.62;
    const wheelZ = this.rover.pos.z + fz * 0.66 + sz * 0.62;
    const targetX = (wheelX + specimen.x) * 0.5;
    const targetZ = (wheelZ + specimen.z) * 0.5;
    const side = this.reducedMotion ? 0 : Math.sin(now * 17e-5) * 0.08;
    const x = targetX + sx * (2.34 + side) - fx * 0.38;
    const z = targetZ + sz * (2.34 + side) - fz * 0.38;
    this._camera.set(x, this.heightAt(x, z) + 0.76, z);
    this._aim.set(targetX, this.heightAt(targetX, targetZ) + 0.3, targetZ);
    this.camera.fov = 39;
  }
  applyPortraitSafeFrame(shot) {
    const aspect = this.camera.aspect || 16 / 9;
    if (aspect >= 1) return;
    const scale = Math.min(1.66, 0.88 / Math.max(0.42, aspect));
    this._camera.sub(this._aim).multiplyScalar(scale).add(this._aim);
    if (shot !== "ascent" && shot !== "tele") {
      this._camera.y = Math.max(
        this._camera.y,
        this.heightAt(this._camera.x, this._camera.z) + (shot === "macro" ? 0.3 : 0.42)
      );
    }
  }
  telephoto(now) {
    const drift = this.reducedMotion ? 0 : Math.sin(now * 55e-6) * 0.7;
    this._camera.copy(this.lander.dockingPoint(-25.5, 10.5 + drift, 6.7));
    this._aim.copy(this.lander.dockingPoint(-0.7, 0, 3.82));
    this.camera.fov = 23;
  }
  lowSide(now) {
    const drift = this.reducedMotion ? 0 : Math.sin(now * 9e-5) * 0.32;
    this._camera.copy(this.lander.dockingPoint(-7.4, 9.6 + drift, 1.34));
    this._camera.y = Math.max(this._camera.y, this.heightAt(this._camera.x, this._camera.z) + 0.42);
    this._aim.copy(this.lander.dockingPoint(-3.15, 0, 2.28));
    this.camera.fov = 42;
  }
  underside(now) {
    const transit = this.voyage.phase === "transit";
    const drift = this.reducedMotion ? 0 : Math.sin(now * 75e-6) * 0.9;
    this._camera.copy(this.lander.dockingPoint(
      transit ? -16.5 : -11.5,
      (transit ? 16.5 : 12.5) + drift,
      transit ? -5.5 : -3
    ));
    this._aim.copy(this.lander.dockingPoint(-0.6, 0, 1.55));
    this.camera.fov = transit ? 48 : 44;
  }
  reset() {
    this.current = "wide";
    this.rendered = "wide";
    this.transition = null;
    this.manualShot = null;
    this.experience = "observer";
    this.forceDissolveOnce = false;
    this.introActive = false;
    this.openingActive = false;
    this.lastCutAt = -Infinity;
    this.veil.style.opacity = "0";
    clearTimeout(this._cueTimer);
    this.cue.classList.remove("on", "locked");
  }
}
