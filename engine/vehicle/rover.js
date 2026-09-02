import * as THREE from "three";
import {
  Fn,
  float,
  uniform,
  vec3,
  vec4,
  normalize,
  dot,
  abs,
  fract,
  max,
  mix,
  exp,
  pow,
  sin,
  smoothstep as ss,
  cameraPosition,
  normalWorld,
  positionLocal,
  positionView,
  positionWorld
} from "three/tsl";
import { cfg } from "../config.js";
import { lapseAt } from "../cpu/metric.js";
import { uLampA, uLampB, uLampDir, uLampPower } from "../tsl/headlight.js";
const B = {
  turnRate: 1.15,
  gradeLimit: 0.48,
  gradeMax: 0.7,
  tiltLimit: 0.62,
  crawl: 0.1,
  slamGrip: 0.55,
  bodyHz: 0.9,
  bodyZeta: 0.85,
  camClear: 0.85,
  camDamp: 6.5,
  orbitPitch: [-0.16, 1.1],
  orbitDist: [2.6, 34],
  settle: 2.6
};
let D = null;
const VIEW_ORDER = ["mast", "rear", "front"];
const VIEW_PRESET = {
  rear: { yaw: 0.05, pitch: 0.3, dist: 28.5 },
  front: { yaw: Math.PI, pitch: 0.16, dist: 6.6 }
};
function automaticLidTarget(pitch, roll, heading, maxLid) {
  const sun = cfg().sun;
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const sx = fz, sz = -fx;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const A = -cr * (fx * sun[0] + fz * sun[2]);
  const B2 = -sr * (sx * sun[0] + sz * sun[2]) + cr * sun[1];
  const lo = pitch - maxLid, hi = pitch;
  let bestA = lo, bestDot = A * Math.sin(lo) + B2 * Math.cos(lo);
  const test = (a) => {
    if (a < lo || a > hi) return;
    const value = A * Math.sin(a) + B2 * Math.cos(a);
    if (value > bestDot) {
      bestDot = value;
      bestA = a;
    }
  };
  test(hi);
  const optimum = Math.atan2(A, B2);
  for (let turn = -2; turn <= 2; turn++) test(optimum + turn * Math.PI * 2);
  return clamp(pitch - bestA, 0, maxLid);
}
export class Rover {
  constructor(camera, dom, heightAt) {
    D = { ...cfg().vehicle.chassis, ...B };
    this.camera = camera;
    this.h = heightAt;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.lookYaw = 0;
    this.lookPitch = -0.04;
    this.pitch = 0;
    this.roll = 0;
    this.deckY = 0;
    this.sus = new Float64Array(8);
    this.susV = new Float64Array(8);
    this.slam = 0;
    this.stops = 0;
    this.speed = 0;
    this.odometer = 0;
    this.traction = 1;
    this.grade = 0;
    this.chase = false;
    this.viewMode = "mast";
    this.orbitYaw = 0;
    this.orbitPitch = 0.3;
    this.orbitDist = 6.4;
    this.camAt = new THREE.Vector3();
    this.cameraControl = true;
    this.externalDriveMode = false;
    this.manualInputEnabled = true;
    this.onSpace = null;
    this._aim = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this.lamps = true;
    this.lidTilt = 0;
    this.disabled = false;
    this.transmitting = false;
    this.metricEnabled = true;
    this.auto = true;
    this.autoSteer = 0;
    this.autoSpeedScale = 1;
    this.missionHold = false;
    this.mobileMode = false;
    this.mobileInputEnabled = true;
    this.mobileSteer = 0;
    this.mobileThrottle = 1;
    this.operatorHold = false;
    this.scriptedDrive = null;
    this.surfaceOverride = null;
    this.arrayAuto = true;
    this.beaconLevel = 0;
    this.keys = new Set();
    this.settled = false;
    const built = buildRover();
    this.group = built.group;
    this.chassis = built.chassis;
    this.head = built.head;
    this.wheels = built.wheels;
    this.lid = built.lid;
    this.wings = built.wings;
    this.beaconPulse = built.beaconPulse;
    this.signalPower = 1;
    this.signalFast = false;
    this.wheelSpin = 0;
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 16757276,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    });
    this.acquisitionGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), glowMaterial);
    this.acquisitionGlow.position.y = 0.18;
    this.acquisitionGlow.scale.set(1.55, 0.78, 1.28);
    this.acquisitionGlow.visible = false;
    this.group.add(this.acquisitionGlow);
    this.acquisitionGlowStart = -Infinity;
    addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        if (this.onSpace) this.onSpace(performance.now());
        else if (!this.externalDriveMode) this.auto = !this.auto;
        e.preventDefault();
      }
      if (!this.externalDriveMode && ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        this.auto = false;
      }
      if (e.code === "KeyL" && !this.mobileMode && !this.disabled) this.lamps = !this.lamps;
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }
  setViewMode(mode, framing = {}) {
    if (![...VIEW_ORDER, "orbit", "cinematic"].includes(mode)) mode = "mast";
    this.viewMode = mode;
    this.chase = mode !== "mast";
    const preset = VIEW_PRESET[mode];
    if (preset) {
      this.orbitYaw = preset.yaw;
      this.orbitPitch = preset.pitch;
      this.orbitDist = preset.dist;
    }
    if (Number.isFinite(framing.yaw)) this.orbitYaw = framing.yaw;
    if (Number.isFinite(framing.pitch)) this.orbitPitch = framing.pitch;
    if (Number.isFinite(framing.dist)) this.orbitDist = framing.dist;
    return this.viewMode;
  }
  cycleViewMode() {
    const at = VIEW_ORDER.indexOf(this.viewMode);
    const next = at < 0 ? "mast" : VIEW_ORDER[(at + 1) % VIEW_ORDER.length];
    return this.setViewMode(next);
  }
  contacts() {
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const sx = -fz, sz = fx;
    const foot = D.wheelR * 0.85;
    const out = [];
    for (const dz of D.axles) {
      for (const dx of [-D.track, D.track]) {
        const x = this.pos.x + fx * dz + sx * dx;
        const z = this.pos.z + fz * dz + sz * dx;
        const sample = (px, pz) => {
          const terrain = this.h(px, pz);
          return this.surfaceOverride ? this.surfaceOverride(px, pz, terrain) : terrain;
        };
        const y = Math.max(
          sample(x - fx * foot, z - fz * foot),
          sample(x, z),
          sample(x + fx * foot, z + fz * foot)
        );
        out.push({ x, z, y });
      }
    }
    return out;
  }
  update(dt) {
    const V = cfg().vehicle;
    const k = this.keys;
    let throttle = 0, steer = 0;
    if (this.manualInputEnabled) {
      if (k.has("KeyW") || k.has("ArrowUp")) throttle += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) throttle -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) steer += 1;
      if (k.has("KeyD") || k.has("ArrowRight")) steer -= 1;
    }
    if (this.auto && throttle === 0 && !this.missionHold) {
      throttle = 1;
      if (steer === 0) steer = this.autoSteer;
    }
    if (this.mobileMode && this.mobileInputEnabled) {
      steer = this.operatorHold || this.missionHold ? 0 : this.mobileSteer;
      throttle = this.operatorHold || this.missionHold ? 0 : this.mobileThrottle;
    }
    if (this.scriptedDrive) {
      throttle = this.scriptedDrive.throttle ?? 0;
      steer = this.scriptedDrive.steer ?? 0;
    }
    let boosting = this.manualInputEnabled && (k.has("ShiftLeft") || k.has("ShiftRight"));
    if (this.disabled || this.transmitting) {
      throttle = 0;
      steer = 0;
      boosting = false;
    }
    if (this.disabled) this.lamps = false;
    if (!this.disabled && !this.transmitting) {
      if (this.arrayAuto) {
        const targetLid = automaticLidTarget(this.pitch, this.roll, this.heading, D.lidMax);
        const error = targetLid - this.lidTilt;
        if (Math.abs(error) > Math.PI / 90) {
          this.lidTilt += clamp(error, -D.lidRate * dt, D.lidRate * dt);
        }
      } else {
        const lidIn = (k.has("BracketRight") ? 1 : 0) - (k.has("BracketLeft") ? 1 : 0);
        if (lidIn) this.lidTilt = clamp(this.lidTilt + lidIn * D.lidRate * dt, 0, D.lidMax);
      }
    }
    if (this.lid) this.lid.rotation.x = -this.lidTilt;
    if (this.wings) for (const wing of this.wings)
      wing.rotation.z = wing.userData.side * this.lidTilt * 0.78;
    const c = this.contacts();
    const rest = D.wheelR + D.clearance;
    const mean = (a) => a.reduce((t, i) => t + c[i].y, 0) / a.length;
    const front = mean([0, 1]), rear = mean([6, 7]);
    const left = mean([0, 2, 4, 6]), right = mean([1, 3, 5, 7]);
    const tDeck = mean([0, 1, 2, 3, 4, 5, 6, 7]) + rest;
    const tPitch = Math.atan2(front - rear, D.wheelBase * 2);
    const tRoll = Math.atan2(right - left, D.track * 2);
    if (!this.settled) {
      this.deckY = tDeck;
      this.pitch = tPitch;
      this.roll = tRoll;
      this.deckV = 0;
      this.pitchV = 0;
      this.rollV = 0;
      this.sus.fill(0);
      this.susV.fill(0);
      this.slam = 0;
      this.stops = 0;
      this.settled = true;
    } else {
      const bw = 2 * Math.PI * D.bodyHz;
      const bk = bw * bw, bc = 2 * D.bodyZeta * bw;
      this.deckV += (bk * (tDeck - this.deckY) - bc * this.deckV) * dt;
      this.pitchV += (bk * (tPitch - this.pitch) - bc * this.pitchV) * dt;
      this.rollV += (bk * (tRoll - this.roll) - bc * this.rollV) * dt;
      this.deckY += this.deckV * dt;
      this.pitch += this.pitchV * dt;
      this.roll += this.rollV * dt;
    }
    let exDeck = 0, exF = 0, exR = 0, exL = 0, exRt = 0;
    for (let i = 0; i < 8; i++) {
      const dz = D.axles[i >> 1], dx = i & 1 ? D.track : -D.track;
      const mount = this.deckY - rest + dz * Math.sin(this.pitch) + dx * Math.sin(this.roll);
      const raw = c[i].y - mount;
      this.sus[i] = clamp(raw, -D.travel, D.travel);
      const ex = raw - this.sus[i];
      exDeck += ex / 8;
      if (dz > 0.7) exF += ex / 2;
      else if (dz < -0.7) exR += ex / 2;
      if (dx < 0) exL += ex / 4;
      else exRt += ex / 4;
    }
    if (exDeck || exF || exR || exL || exRt) {
      this.deckY += exDeck;
      this.pitch += Math.atan2(exF - exR, D.wheelBase * 2);
      this.roll += Math.atan2(exRt - exL, D.track * 2);
      this.deckV += exDeck / Math.max(dt, 1e-3) * 0.25;
      for (let i = 0; i < 8; i++) {
        const dz = D.axles[i >> 1], dx = i & 1 ? D.track : -D.track;
        const mount = this.deckY - rest + dz * Math.sin(this.pitch) + dx * Math.sin(this.roll);
        this.sus[i] = clamp(c[i].y - mount, -D.travel, D.travel);
      }
    }
    this.artic = Math.max(...Array.from(this.sus, Math.abs));
    let onStop = 0;
    for (let i = 0; i < 8; i++) if (Math.abs(this.sus[i]) >= D.travel - 1e-6) onStop++;
    this.stops = onStop / 8;
    this.slam = this.stops * Math.min(1, Math.abs(this.speed) / cfg().vehicle.cruise);
    this.grade = this.pitch;
    const climb = Math.abs(this.pitch);
    const gradeFall = 1 - smoothstep(D.gradeLimit, D.gradeMax, climb);
    const tiltFall = 1 - smoothstep(D.tiltLimit * 0.72, D.tiltLimit, Math.abs(this.roll));
    const slamFall = 1 - this.slam * D.slamGrip;
    this.traction = D.crawl + (1 - D.crawl) * gradeFall * tiltFall * slamFall;
    this.radius = Math.hypot(this.pos.x, this.pos.z);
    this.lapse = this.metricEnabled ? lapseAt(this.radius) : 1;
    const target = (boosting ? V.boost : V.cruise) * throttle * (this.auto ? this.autoSpeedScale : 1) * this.traction * Math.max(4e-3, this.lapse);
    this.speed += (target - this.speed) * Math.min(1, dt * 3.2);
    if (Math.abs(this.speed) < 1e-4) this.speed = 0;
    const authority = 0.3 + 0.7 * Math.min(1, Math.abs(this.speed) / Math.max(V.cruise, 1e-3));
    this.heading += steer * D.turnRate * authority * dt;
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.odometer += Math.abs(this.speed) * dt;
    this.group.position.set(this.pos.x, this.deckY, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
    this.chassis.rotation.set(this.pitch, 0, this.roll);
    this.wheelSpin += this.speed * dt / D.wheelR;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.rotation.x = this.wheelSpin;
      w.position.y = w.userData.restY + this.sus[i];
      const u = w.userData;
      u.arm.position.y = u.armY + this.sus[i] * 0.5;
      u.arm.scale.y = Math.max(0.05, 1 + this.sus[i] / 0.3);
      u.hub.position.y = u.restY + this.sus[i];
      u.spring.position.y = u.springY + this.sus[i] * 0.5;
      u.spring.scale.y = Math.max(0.24, 1 + this.sus[i] / 0.34);
      u.shock.position.y = u.springY + this.sus[i] * 0.5;
      u.shock.scale.y = Math.max(0.24, 1 + this.sus[i] / 0.34);
    }
    this.group.updateMatrixWorld(true);
    if (this.acquisitionGlow) {
      const age = (performance.now() - this.acquisitionGlowStart) / 1e3;
      const active = age >= 0 && age < 2.8;
      this.acquisitionGlow.visible = active;
      if (active) {
        const rise = Math.min(1, age / 0.1);
        const fall = Math.min(1, (2.8 - age) / 0.75);
        const pulse = 0.58 + Math.sin(age * 20) * 0.16;
        this.acquisitionGlow.material.opacity = rise * fall * pulse * 0.3;
        const scale = 1 + Math.sin(Math.min(1, age / 1.5) * Math.PI) * 0.16;
        this.acquisitionGlow.scale.set(1.55 * scale, 0.78 * scale, 1.28 * scale);
        this.acquisitionGlow.rotation.y += 0.018;
      }
    }
    if (this.beaconPulse) {
      const period = this.signalFast ? 1.6 : 3.2;
      const phase = (performance.now() * 1e-3 % period + period) % period;
      const pulse = (start) => {
        const x = phase - start;
        if (x < 0 || x > 0.16) return 0;
        return x < 0.018 ? x / 0.018 : Math.exp(-(x - 0.018) / 0.04);
      };
      this.beaconLevel = this.disabled ? 0 : this.signalPower * Math.max(pulse(0), pulse(0.17));
      this.beaconPulse.value = this.beaconLevel;
    }
    if (this.chase && this.viewMode === "mast") this.viewMode = "orbit";
    if (!this.chase && this.viewMode !== "mast") this.viewMode = "mast";
    if (!this.cameraControl) {
      this.group.visible = true;
    } else if (this.chase) {
      this.placeChase(dt);
      this.group.visible = true;
    } else {
      this.camera.position.setFromMatrixPosition(this.head.matrixWorld);
      this.camera.quaternion.setFromRotationMatrix(this.head.matrixWorld);
      this.camera.rotateY(this.lookYaw);
      this.camera.rotateX(this.lookPitch);
      this.group.visible = false;
    }
    const sx = -fz, sz = fx;
    const H = cfg().headlight;
    if (H && H.count) {
      const lampY = this.deckY + H.rise;
      const bx = this.pos.x + fx * H.ahead, bz = this.pos.z + fz * H.ahead;
      uLampA.value.set(bx + sx * H.offset, lampY, bz + sz * H.offset);
      uLampB.value.set(bx - sx * H.offset, lampY, bz - sz * H.offset);
      const a = H.tilt - this.pitch;
      const ca = Math.cos(a);
      uLampDir.value.set(fx * ca, -Math.sin(a), fz * ca);
    }
    return {
      speed: Math.abs(this.speed),
      ground: this.deckY - D.wheelR - D.clearance,
      lamps: this.lamps,
      radius: this.radius,
      lapse: this.lapse,
      x: this.pos.x,
      z: this.pos.z,
      heading: this.heading,
      pitch: this.pitch,
      roll: this.roll,
      traction: this.traction,
      grade: climb,
      odometer: this.odometer,
      chase: this.chase,
      viewMode: this.viewMode,
      boosting,
      lidTilt: this.lidTilt,
      lidMax: D.lidMax,
      artic: this.artic,
      travel: D.travel,
      slam: this.slam,
      stops: this.stops,
      stroke: this.sus,
      chaseDist: this.chaseDist ?? this.orbitDist,
      wheelContacts: c,
      trackA: [this.pos.x + sx * D.track, this.pos.z + sz * D.track],
      trackB: [this.pos.x - sx * D.track, this.pos.z - sz * D.track]
    };
  }
  placeChase(dt) {
    const aim = this._aim.setFromMatrixPosition(this.head.matrixWorld);
    aim.y = this.deckY + 0.25;
    const pitch = clamp(this.orbitPitch, D.orbitPitch[0], D.orbitPitch[1]);
    const want = clamp(this.orbitDist, D.orbitDist[0], D.orbitDist[1]);
    const yaw = this.heading + this.orbitYaw;
    const cp = Math.cos(pitch);
    const dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
    let dist = want;
    for (let t = 0.15; t <= 1; t += 0.085) {
      const d = want * t;
      if (this.h(aim.x + dx * d, aim.z + dz * d) + D.camClear > aim.y + dy * d) {
        dist = Math.max(D.orbitDist[0], want * (t - 0.085));
        break;
      }
    }
    const p = this._want.set(aim.x + dx * dist, aim.y + dy * dist, aim.z + dz * dist);
    p.y = Math.max(p.y, this.h(p.x, p.z) + D.camClear);
    if (this.camAt.lengthSq() === 0) this.camAt.copy(p);
    this.camAt.lerp(p, Math.min(1, dt * D.camDamp));
    this.camAt.y = Math.max(this.camAt.y, this.h(this.camAt.x, this.camAt.z) + D.camClear);
    const ax = this.camAt.x - aim.x, ay = this.camAt.y - aim.y, az = this.camAt.z - aim.z;
    const len = Math.hypot(ax, ay, az);
    if (len > 1e-4 && len < D.orbitDist[0]) {
      const k = D.orbitDist[0] / len;
      this.camAt.set(aim.x + ax * k, aim.y + ay * k, aim.z + az * k);
      this.camAt.y = Math.max(this.camAt.y, this.h(this.camAt.x, this.camAt.z) + D.camClear);
    }
    this.camera.position.copy(this.camAt);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(aim);
    this.chaseDist = this.camAt.distanceTo(aim);
  }
  reset(x, z, heading = 0) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.lookYaw = 0;
    this.lookPitch = -0.04;
    this.speed = 0;
    this.odometer = 0;
    this.settled = false;
    this.sus.fill(0);
    this.susV.fill(0);
    this.slam = 0;
    this.stops = 0;
    this.deckV = 0;
    this.pitchV = 0;
    this.rollV = 0;
    this.camAt.set(0, 0, 0);
    this.orbitYaw = 0;
    this.orbitPitch = 0.3;
    this.lidTilt = 0;
    this.arrayAuto = true;
    this.transmitting = false;
    this.missionHold = false;
    this.auto = true;
    this.autoSteer = 0;
    this.autoSpeedScale = 1;
    this.mobileSteer = 0;
    this.mobileThrottle = 1;
    this.operatorHold = false;
    this.scriptedDrive = null;
    this.surfaceOverride = null;
    this.acquisitionGlowStart = -Infinity;
    if (this.acquisitionGlow) this.acquisitionGlow.visible = false;
  }
  teleport(x, z, heading = this.heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.settled = false;
    this.sus.fill(0);
    this.susV.fill(0);
    this.deckV = 0;
    this.pitchV = 0;
    this.rollV = 0;
    this.camAt.set(0, 0, 0);
    return this;
  }
  flashAcquisition(now = performance.now()) {
    this.acquisitionGlowStart = now;
    if (this.acquisitionGlow) this.acquisitionGlow.visible = true;
  }
  setSignalState(charge = 1, transmitting = false) {
    this.signalPower = charge < 0.3 ? Math.max(0, charge / 0.3) : 1;
    this.signalFast = transmitting;
  }
  setMobileMode(active) {
    this.mobileMode = !!active;
    this.arrayAuto = true;
    this.mobileSteer = 0;
    this.mobileThrottle = 1;
    this.operatorHold = false;
    this.acquisitionGlowStart = -Infinity;
    if (this.acquisitionGlow) this.acquisitionGlow.visible = false;
    if (this.mobileMode && !this.disabled) this.lamps = true;
  }
}
function Merged() {
  const parts = [];
  return {
    add(geo, matrix) {
      parts.push(geo.clone().applyMatrix4(matrix));
      return this;
    },
    build() {
      let vc = 0, ic = 0;
      for (const g of parts) {
        vc += g.attributes.position.count;
        ic += g.index ? g.index.count : g.attributes.position.count;
      }
      const pos = new Float32Array(vc * 3), nrm = new Float32Array(vc * 3);
      const idx = new Uint32Array(ic);
      let vo = 0, io = 0;
      for (const g of parts) {
        pos.set(g.attributes.position.array, vo * 3);
        nrm.set(g.attributes.normal.array, vo * 3);
        const n = g.attributes.position.count;
        if (g.index) {
          const gi = g.index.array;
          for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
          io += gi.length;
        } else {
          for (let i = 0; i < n; i++) idx[io + i] = vo + i;
          io += n;
        }
        vo += n;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      return out;
    }
  };
}
const xf = (p, r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(...p),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
  new THREE.Vector3(...s)
);
function buildWheel() {
  const R = D.wheelR, W = D.wheelW;
  const tyre = Merged(), rim = Merged();
  const drum = new THREE.CylinderGeometry(R * 0.88, R * 0.88, W, 40, 1, true);
  tyre.add(drum, xf([0, 0, 0], [0, 0, Math.PI / 2]));
  const sidewall = new THREE.TorusGeometry(R * 0.76, R * 0.035, 8, 40);
  tyre.add(sidewall, xf([-W * 0.49, 0, 0], [0, Math.PI / 2, 0]));
  tyre.add(sidewall, xf([W * 0.49, 0, 0], [0, Math.PI / 2, 0]));
  const hoop = new THREE.TorusGeometry(R * 0.98, R * 0.05, 7, 40);
  rim.add(hoop, xf([-W / 2, 0, 0], [0, Math.PI / 2, 0]));
  rim.add(hoop, xf([W / 2, 0, 0], [0, Math.PI / 2, 0]));
  const g = new THREE.BoxGeometry(W * 0.96, R * 0.075, R * 0.18);
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    tyre.add(g, xf([0, Math.sin(a) * R * 0.96, Math.cos(a) * R * 0.96], [-a, 0, i & 1 ? 0.16 : -0.16]));
  }
  rim.add(
    new THREE.CylinderGeometry(R * 0.24, R * 0.24, W * 1.18, 20),
    xf([0, 0, 0], [0, 0, Math.PI / 2])
  );
  rim.add(
    new THREE.CylinderGeometry(R * 0.11, R * 0.11, W * 1.27, 20),
    xf([0, 0, 0], [0, 0, Math.PI / 2])
  );
  const spoke = new THREE.BoxGeometry(W * 0.1, R * 0.66, R * 0.055);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      rim.add(spoke, xf(
        [side * W * 0.54, Math.sin(a) * R * 0.55, Math.cos(a) * R * 0.55],
        [-a, 0, 0]
      ));
    }
  }
  const bead = new THREE.TorusGeometry(R * 0.43, R * 0.018, 5, 32);
  const lug = new THREE.CylinderGeometry(R * 0.025, R * 0.025, W * 0.1, 6);
  for (const side of [-1, 1]) {
    rim.add(bead, xf([side * W * 0.6, 0, 0], [0, Math.PI / 2, 0]));
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      rim.add(lug, xf(
        [side * W * 0.64, Math.sin(a) * R * 0.33, Math.cos(a) * R * 0.33],
        [0, 0, Math.PI / 2]
      ));
    }
  }
  return { tyre: tyre.build(), rim: rim.build() };
}
function wedgeGeometry(width, height, length, frontScale = 0.72) {
  const wb = width * 0.5, wf = wb * frontScale;
  const y0 = -height * 0.5, y1 = height * 0.5, yf = height * 0.12;
  const zf = -length * 0.5, zb = length * 0.5;
  const p = new Float32Array([
    -wf,
    y0,
    zf,
    wf,
    y0,
    zf,
    -wf,
    yf,
    zf,
    wf,
    yf,
    zf,
    -wb,
    y0,
    zb,
    wb,
    y0,
    zb,
    -wb,
    y1,
    zb,
    wb,
    y1,
    zb
  ]);
  const i = new Uint16Array([
    0,
    1,
    3,
    0,
    3,
    2,
    4,
    6,
    7,
    4,
    7,
    5,
    0,
    2,
    6,
    0,
    6,
    4,
    1,
    5,
    7,
    1,
    7,
    3,
    2,
    3,
    7,
    2,
    7,
    6,
    0,
    4,
    5,
    0,
    5,
    1
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setIndex(new THREE.BufferAttribute(i, 1));
  g.computeVertexNormals();
  return g;
}
function buildCoil() {
  const m = Merged();
  const ring = new THREE.TorusGeometry(0.05, 7e-3, 6, 17);
  for (let i = 0; i < 9; i++)
    m.add(ring, xf([0, -0.14 + i * 0.035, 0], [Math.PI / 2, 0, 0]));
  return m.build();
}
function cylinderBetween(a, b, radius, material, radial = 9) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const dir = bv.clone().sub(av), len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial), material);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}
function buildRover() {
  const C = cfg();
  const group = new THREE.Group();
  const chassis = new THREE.Group();
  group.add(chassis);
  const L = normalize(vec3(...C.sun));
  const paint = (rgb, emissive = 0, sheen = 0.08, gloss = 24, grain = 0.02, dust = 0.02) => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      const n = normalize(normalWorld);
      const v = normalize(cameraPosition.sub(positionWorld));
      const ndl = max(dot(n, L), float(0));
      const halfVector = normalize(L.add(v));
      const grainHash = fract(sin(dot(positionLocal, vec3(91.17, 47.31, 113.53))).mul(43758.5453));
      const surface = vec3(...rgb).mul(grainHash.mul(grain * 2).add(1 - grain));
      const dustMask = pow(max(n.y, float(0)), float(4)).mul(dust).mul(grainHash.mul(0.45).add(0.55));
      const coated = mix(surface, vec3(0.3, 0.215, 0.145), dustMask);
      const specular = pow(max(dot(n, halfVector), float(0)), float(gloss)).mul(sheen).mul(ndl.add(0.12)).mul(grainHash.mul(0.28).add(0.82));
      const rim = pow(float(1).sub(abs(dot(n, v))), float(3)).mul(sheen * 0.16);
      const lit = coated.mul(ndl.mul(1.35).add(0.085)).add(vec3(1, 0.97, 0.91).mul(specular)).add(vec3(0.34, 0.4, 0.46).mul(rim)).add(vec3(...C.color.crimson).mul(emissive));
      const fog = float(1).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
      return vec4(mix(lit, vec3(...C.color.horizon), ss(0, 1, fog)), 1);
    })();
    return mat;
  };
  const hull = paint([0.095, 0.101, 0.111], 0, 0.1, 30, 0.045, 0.06);
  const dark = paint([0.022, 0.023, 0.027], 0, 0.035, 18, 0.07, 0.075);
  const metal = paint([0.19, 0.198, 0.208], 0, 0.34, 52, 0.025, 0.022);
  const armour = paint([0.135, 0.139, 0.145], 0, 0.16, 36, 0.036, 0.045);
  const wheelRubber = paint([0.017, 0.017, 0.019], 0, 0.018, 12, 0.105, 0.14);
  const wheelMetal = paint([0.145, 0.151, 0.158], 0, 0.27, 44, 0.035, 0.08);
  const mark = paint(C.color.crimson, 0.85, 0.12, 34, 0.025, 0.015);
  const beaconPulse = uniform(0);
  const beaconGlow = new THREE.MeshBasicNodeMaterial();
  beaconGlow.colorNode = vec4(
    vec3(...C.color.beacon).mul(beaconPulse.mul(4.4).add(0.018)),
    1
  );
  const cell = new THREE.MeshBasicNodeMaterial();
  cell.colorNode = Fn(() => {
    const n = normalize(normalWorld);
    const v = normalize(cameraPosition.sub(positionWorld));
    const ndl = max(dot(n, L), float(0));
    const halfVector = normalize(L.add(v));
    const crystal = sin(positionLocal.x.mul(83).add(positionLocal.z.mul(51))).mul(0.5).add(0.5);
    const angle = ss(0, 1, ndl.mul(0.72).add(crystal.mul(0.1)));
    const base = mix(vec3(6e-3, 0.017, 0.032), vec3(0.025, 0.082, 0.135), angle);
    const glint = pow(max(dot(n, halfVector), float(0)), float(78)).mul(0.52);
    const edge = pow(float(1).sub(abs(dot(n, v))), float(2.2)).mul(0.065);
    const lit = base.mul(ndl.mul(0.62).add(0.38)).add(vec3(0.72, 0.87, 1).mul(glint)).add(vec3(0.08, 0.18, 0.28).mul(edge));
    const fog = float(1).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
    return vec4(mix(lit, vec3(...C.color.horizon), ss(0, 1, fog)), 1);
  })();
  const transferTag = (object, part, colour, rig = false) => {
    object.userData.transferPart = part;
    if (colour != null) object.userData.transferColor = colour;
    if (rig) object.userData.transferRig = true;
    return object;
  };
  chassis.userData.transferChassis = true;
  const deck = 0;
  const W = D.track * 2, LEN = D.wheelBase * 2;
  const tub = Merged();
  tub.add(new THREE.BoxGeometry(W * 0.84, 0.34, LEN * 0.58), xf([0, deck + 0.03, LEN * 0.09]));
  tub.add(wedgeGeometry(W * 0.84, 0.34, LEN * 0.43), xf([0, deck + 0.03, -LEN * 0.35]));
  tub.add(new THREE.BoxGeometry(W * 0.66, 0.1, LEN * 0.94), xf([0, deck - 0.17, 0]));
  for (const side of [-1, 1]) {
    tub.add(new THREE.BoxGeometry(0.11, 0.24, LEN * 0.48), xf([side * W * 0.455, deck + 0.015, LEN * 0.09]));
    tub.add(new THREE.BoxGeometry(0.055, 0.09, LEN * 1.1), xf([side * D.track * 0.8, deck - 0.19, 0]));
  }
  tub.add(new THREE.BoxGeometry(W * 0.78, 0.1, 0.1), xf([0, deck - 0.1, -LEN * 0.57]));
  tub.add(new THREE.BoxGeometry(W * 0.7, 0.1, 0.08), xf([0, deck - 0.1, LEN * 0.51]));
  const tubMesh = new THREE.Mesh(tub.build(), hull);
  tubMesh.userData.designRole = "armoured-hull";
  chassis.add(tubMesh);
  const access = Merged();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++)
      access.add(
        new THREE.BoxGeometry(0.014, 0.024, 0.16),
        xf([side * W * 0.515, deck + 0.055 + i * 0.045, LEN * 0.15], [0, 0, 0])
      );
    access.add(
      new THREE.BoxGeometry(0.015, 0.18, 0.26),
      xf([side * W * 0.515, deck + 0.02, LEN * 0.35])
    );
  }
  chassis.add(transferTag(new THREE.Mesh(access.build(), metal), "body", 10133928));
  const servicePanels = transferTag(new THREE.Group(), "body", 6910073, true);
  servicePanels.userData.designRole = "service-panels";
  const panelPlate = Merged(), panelFastener = Merged(), panelRecess = Merged();
  for (const side of [-1, 1]) {
    for (const z of [-LEN * 0.13, LEN * 0.31]) {
      panelPlate.add(
        new THREE.BoxGeometry(0.018, 0.215, 0.34),
        xf([side * W * 0.514, deck + 0.025, z])
      );
      panelRecess.add(
        new THREE.BoxGeometry(0.022, 0.145, 0.255),
        xf([side * W * 0.526, deck + 0.025, z])
      );
      for (const y of [deck - 0.055, deck + 0.105]) {
        for (const dz of [-0.125, 0.125])
          panelFastener.add(
            new THREE.CylinderGeometry(0.014, 0.014, 0.027, 10),
            xf([side * W * 0.541, y, z + dz], [0, 0, Math.PI / 2])
          );
      }
    }
  }
  for (const x of [-W * 0.22, W * 0.22]) {
    panelPlate.add(
      new THREE.BoxGeometry(W * 0.3, 0.025, LEN * 0.24),
      xf([x, deck + 0.215, LEN * 0.03])
    );
    panelFastener.add(
      new THREE.BoxGeometry(0.09, 0.028, 0.035),
      xf([x, deck + 0.242, -LEN * 0.035])
    );
  }
  servicePanels.add(new THREE.Mesh(panelPlate.build(), armour));
  servicePanels.add(new THREE.Mesh(panelRecess.build(), dark));
  servicePanels.add(new THREE.Mesh(panelFastener.build(), metal));
  chassis.add(servicePanels);
  const mechanicalMetal = Merged(), mechanicalDark = Merged();
  for (const side of [-1, 1]) {
    mechanicalMetal.add(
      new THREE.CylinderGeometry(0.026, 0.026, LEN * 0.88, 12),
      xf([side * W * 0.455, deck + 0.205, LEN * 0.01], [Math.PI / 2, 0, 0])
    );
    for (const dz of D.axles) {
      mechanicalMetal.add(
        new THREE.CylinderGeometry(0.062, 0.062, 0.038, 18),
        xf([side * W * 0.505, deck - 0.155, -dz], [0, 0, Math.PI / 2])
      );
      mechanicalDark.add(
        new THREE.TorusGeometry(0.045, 8e-3, 6, 18),
        xf([side * W * 0.528, deck - 0.155, -dz], [0, Math.PI / 2, 0])
      );
    }
  }
  for (let i = 0; i < 6; i++)
    mechanicalDark.add(
      new THREE.BoxGeometry(W * 0.3, 0.018, 0.026),
      xf([0, deck + 0.213, -LEN * (0.12 + i * 0.035)])
    );
  const mechanicalGroup = transferTag(new THREE.Group(), "body", 10133928, true);
  mechanicalGroup.userData.designRole = "suspension-pivots";
  mechanicalGroup.add(new THREE.Mesh(mechanicalMetal.build(), metal));
  mechanicalGroup.add(new THREE.Mesh(mechanicalDark.build(), dark));
  chassis.add(mechanicalGroup);
  const frontDetail = transferTag(new THREE.Group(), "body", 10133928, true);
  frontDetail.userData.designRole = "front-service-array";
  const fascia = Merged();
  fascia.add(
    wedgeGeometry(W * 0.72, 0.3, 0.12, 0.86),
    xf([0, deck + 0.015, -LEN * 0.575])
  );
  for (const side of [-1, 1]) {
    fascia.add(
      new THREE.BoxGeometry(W * 0.19, 0.235, 0.145),
      xf([side * W * 0.365, deck + 0.035, -LEN * 0.558], [0, side * 0.1, 0])
    );
    fascia.add(
      new THREE.BoxGeometry(W * 0.17, 0.045, 0.105),
      xf([side * W * 0.365, deck + 0.175, -LEN * 0.56], [0, side * 0.1, 0])
    );
  }
  frontDetail.add(new THREE.Mesh(fascia.build(), armour));
  const recess = Merged();
  recess.add(
    new THREE.BoxGeometry(W * 0.38, 0.155, 0.026),
    xf([0, deck - 0.02, -LEN * 0.611])
  );
  for (const side of [-1, 1])
    recess.add(
      new THREE.BoxGeometry(W * 0.145, 0.09, 0.03),
      xf([side * W * 0.365, deck + 0.06, -LEN * 0.601])
    );
  frontDetail.add(new THREE.Mesh(recess.build(), dark));
  const grille = Merged();
  for (let i = -3; i <= 3; i++)
    grille.add(
      new THREE.BoxGeometry(0.02, 0.125, 0.022),
      xf([i * 0.06, deck - 0.02, -LEN * 0.621])
    );
  for (const x of [-W * 0.29, W * 0.29])
    grille.add(
      new THREE.CylinderGeometry(0.024, 0.024, 0.026, 12),
      xf([x, deck - 0.105, -LEN * 0.62], [Math.PI / 2, 0, 0])
    );
  frontDetail.add(new THREE.Mesh(grille.build(), metal));
  const noseHardware = Merged();
  noseHardware.add(
    new THREE.BoxGeometry(W * 0.58, 0.045, 0.075),
    xf([0, deck + 0.185, -LEN * 0.56])
  );
  noseHardware.add(
    new THREE.BoxGeometry(W * 0.86, 0.075, 0.075),
    xf([0, deck - 0.165, -LEN * 0.605])
  );
  noseHardware.add(
    new THREE.BoxGeometry(W * 0.47, 0.07, 0.045),
    xf([0, deck - 0.235, -LEN * 0.595], [0.1, 0, 0])
  );
  for (const side of [-1, 1]) {
    noseHardware.add(
      new THREE.BoxGeometry(0.035, 0.205, 0.055),
      xf([side * W * 0.435, deck - 0.045, -LEN * 0.619])
    );
    noseHardware.add(
      new THREE.BoxGeometry(W * 0.16, 0.028, 0.05),
      xf([side * W * 0.365, deck + 0.13, -LEN * 0.615])
    );
  }
  for (const x of [-W * 0.25, W * 0.25])
    noseHardware.add(
      new THREE.TorusGeometry(0.058, 0.012, 6, 18),
      xf([x, deck - 0.205, -LEN * 0.63])
    );
  frontDetail.add(new THREE.Mesh(noseHardware.build(), metal));
  chassis.add(frontDetail);
  const wheelGeo = buildWheel();
  const strutGeo = new THREE.BoxGeometry(0.05, 0.3, 0.07);
  const hubGeo = new THREE.BoxGeometry(D.track * 0.38, 0.05, 0.06);
  const rockerGeo = new THREE.BoxGeometry(D.track * 0.34, 0.055, 0.075);
  const shockGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.34, 14);
  const coilGeo = buildCoil();
  const fenderGeo = new THREE.TorusGeometry(D.wheelR * 1.12, 0.025, 6, 24, Math.PI);
  const wheels = [];
  for (const dz of D.axles) {
    for (const dx of [-D.track, D.track]) {
      const lz = -dz;
      const w = transferTag(new THREE.Group(), "wheel", null, true);
      const tyre = transferTag(new THREE.Mesh(wheelGeo.tyre, wheelRubber), "wheel", 2368809);
      const rim = transferTag(new THREE.Mesh(wheelGeo.rim, wheelMetal), "wheel", 9410206);
      w.add(tyre, rim);
      const restY = deck - D.clearance;
      w.position.set(dx, restY, lz);
      chassis.add(w);
      const strut = new THREE.Mesh(strutGeo, hull);
      strut.position.set(dx * 0.84, deck - 0.15, lz);
      chassis.add(strut);
      const hub = new THREE.Mesh(hubGeo, hull);
      hub.position.set(dx * 0.88, restY, lz);
      chassis.add(hub);
      const rocker = new THREE.Mesh(rockerGeo, metal);
      rocker.position.set(dx * 0.86, deck - 0.27, lz);
      chassis.add(rocker);
      const shock = new THREE.Mesh(shockGeo, dark);
      const springY = deck - 0.3;
      shock.position.set(dx * 0.75, springY, lz + (lz < 0 ? 0.1 : -0.1));
      shock.rotation.z = dx < 0 ? -0.28 : 0.28;
      chassis.add(shock);
      const coil = new THREE.Mesh(coilGeo, metal);
      coil.position.copy(shock.position);
      coil.rotation.copy(shock.rotation);
      coil.userData.designRole = "suspension-coil";
      chassis.add(coil);
      const fender = new THREE.Mesh(fenderGeo, hull);
      fender.position.set(dx, deck - D.clearance + D.wheelR * 0.2, lz);
      fender.rotation.y = Math.PI / 2;
      chassis.add(fender);
      transferTag(strut, "wheel", 6910073, true);
      transferTag(hub, "wheel", 6910073, true);
      transferTag(rocker, "wheel", 10133928, true);
      transferTag(shock, "wheel", 2368809, true);
      transferTag(coil, "wheel", 10133928, true);
      transferTag(fender, "wheel", 6910073, true);
      Object.assign(w.userData, {
        restY,
        arm: strut,
        armY: deck - 0.15,
        hub,
        spring: coil,
        shock,
        springY
      });
      wheels.push(w);
    }
  }
  const panelRig = transferTag(new THREE.Group(), "panel", 10133928, true);
  panelRig.userData.designRole = "solar-gimbal";
  for (const x of [-0.2, 0.2]) {
    panelRig.add(cylinderBetween([x, deck + 0.18, 0.18], [x, deck + 0.72, -D.lidLen * 0.5], 0.027, metal));
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 18), dark);
    joint.position.set(x, deck + 0.72, -D.lidLen * 0.5);
    joint.rotation.z = Math.PI / 2;
    panelRig.add(joint);
  }
  chassis.add(panelRig);
  const lid = new THREE.Group();
  transferTag(lid, "panel", null, true);
  lid.userData.designRole = "solar-array";
  lid.position.set(0, deck + 0.72, -D.lidLen / 2);
  chassis.add(lid);
  const frame = Merged();
  frame.add(new THREE.BoxGeometry(D.lidWidth, 0.035, D.lidLen), xf([0, 0, D.lidLen / 2]));
  for (const x of [-D.lidWidth * 0.485, D.lidWidth * 0.485])
    frame.add(new THREE.BoxGeometry(0.032, 0.055, D.lidLen), xf([x, 0.012, D.lidLen / 2]));
  for (const z of [0.015, D.lidLen * 0.5, D.lidLen - 0.015])
    frame.add(new THREE.BoxGeometry(D.lidWidth, 0.055, 0.032), xf([0, 0.012, z]));
  const backplane = transferTag(new THREE.Mesh(frame.build(), hull), "panel", 6910073);
  backplane.userData.designRole = "solar-backplane";
  lid.add(backplane);
  const cellW = D.lidWidth * 0.9, cellL = D.lidLen * 0.9;
  const array = new THREE.Mesh(new THREE.BoxGeometry(cellW, 0.012, cellL), cell);
  array.position.set(0, 0.04, D.lidLen * 0.5);
  array.userData.designRole = "solar-cell-matrix";
  lid.add(transferTag(array, "panel", 2182003));
  const arrayGrid = Merged(), arrayBus = Merged();
  for (let row = 1; row < 12; row++)
    arrayGrid.add(
      new THREE.BoxGeometry(cellW, 8e-3, 8e-3),
      xf([0, 0.05, D.lidLen * 0.05 + cellL * row / 12])
    );
  for (let col = 1; col < 6; col++)
    arrayGrid.add(
      new THREE.BoxGeometry(9e-3, 8e-3, cellL),
      xf([-cellW / 2 + cellW * col / 6, 0.05, D.lidLen * 0.5])
    );
  for (let col = 0; col < 6; col++)
    arrayBus.add(
      new THREE.BoxGeometry(35e-4, 9e-3, cellL * 0.97),
      xf([-cellW / 2 + cellW * (col + 0.5) / 6, 0.054, D.lidLen * 0.5])
    );
  for (const x of [-cellW / 2, cellW / 2])
    for (const z of [D.lidLen * 0.05, D.lidLen * 0.95])
      arrayBus.add(new THREE.BoxGeometry(0.045, 0.016, 0.045), xf([x, 0.052, z]));
  arrayBus.add(
    new THREE.BoxGeometry(cellW * 0.96, 0.011, 8e-3),
    xf([0, 0.055, D.lidLen * 0.5])
  );
  lid.add(transferTag(new THREE.Mesh(arrayGrid.build(), dark), "panel", 2368809));
  lid.add(transferTag(new THREE.Mesh(arrayBus.build(), metal), "panel", 12040629));
  const underside = transferTag(new THREE.Group(), "panel", 10133928);
  const torqueTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, D.lidWidth * 1.04, 18),
    metal
  );
  torqueTube.position.set(0, -0.04, D.lidLen * 0.08);
  torqueTube.rotation.z = Math.PI / 2;
  underside.add(torqueTube);
  underside.add(cylinderBetween(
    [-D.lidWidth * 0.43, -0.035, D.lidLen * 0.1],
    [D.lidWidth * 0.43, -0.035, D.lidLen * 0.9],
    0.014,
    metal,
    8
  ));
  underside.add(cylinderBetween(
    [D.lidWidth * 0.43, -0.035, D.lidLen * 0.1],
    [-D.lidWidth * 0.43, -0.035, D.lidLen * 0.9],
    0.014,
    metal,
    8
  ));
  const junction = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.075, 0.16), armour);
  junction.position.set(0, -0.065, D.lidLen * 0.62);
  underside.add(junction);
  lid.add(underside);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = transferTag(new THREE.Group(), "panel", null);
    wing.userData.side = side;
    wing.position.set(side * D.lidWidth * 0.49, 0.02, D.lidLen * 0.5);
    const wingW = D.lidWidth * 0.44, wingL = D.lidLen * 0.78;
    const wingX = side * wingW * 0.5;
    const wingBack = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.026, wingL), hull);
    wingBack.position.set(wingX, 0, 0);
    wing.add(transferTag(wingBack, "panel", 6910073));
    const wingCellW = wingW * 0.88, wingCellL = wingL * 0.9;
    const wingCell = new THREE.Mesh(new THREE.BoxGeometry(wingCellW, 0.011, wingCellL), cell);
    wingCell.position.set(wingX, 0.022, 0);
    wing.add(transferTag(wingCell, "panel", 2182003));
    const wingGrid = Merged(), wingRail = Merged();
    for (let row = 1; row < 8; row++)
      wingGrid.add(
        new THREE.BoxGeometry(wingCellW, 8e-3, 7e-3),
        xf([wingX, 0.031, -wingCellL / 2 + wingCellL * row / 8])
      );
    for (let col = 1; col < 3; col++)
      wingGrid.add(
        new THREE.BoxGeometry(8e-3, 8e-3, wingCellL),
        xf([wingX - wingCellW / 2 + wingCellW * col / 3, 0.031, 0])
      );
    for (const x of [wingX - side * wingW * 0.48, wingX + side * wingW * 0.48])
      wingRail.add(new THREE.BoxGeometry(0.024, 0.042, wingL), xf([x, 0.01, 0]));
    for (const z of [-wingL * 0.49, wingL * 0.49])
      wingRail.add(new THREE.BoxGeometry(wingW, 0.042, 0.024), xf([wingX, 0.01, z]));
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.16, 16), metal);
    hinge.position.set(0, -5e-3, 0);
    hinge.rotation.x = Math.PI / 2;
    wing.add(transferTag(new THREE.Mesh(wingGrid.build(), dark), "panel", 2368809));
    wing.add(transferTag(new THREE.Mesh(wingRail.build(), metal), "panel", 12040629));
    wing.add(hinge);
    lid.add(wing);
    wings.push(wing);
  }
  const avionics = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 0.25, LEN * 0.25), armour);
  avionics.position.set(0, deck + 0.3, LEN * 0.34);
  avionics.userData.designRole = "avionics-pod";
  chassis.add(transferTag(avionics, "body", 6910073));
  const radiator = Merged();
  for (let i = 0; i < 8; i++)
    radiator.add(
      new THREE.BoxGeometry(0.055, 0.13, 0.018),
      xf([-0.23 + i * 0.066, deck + 0.44, LEN * 0.43])
    );
  chassis.add(transferTag(new THREE.Mesh(radiator.build(), dark), "body", 2368809));
  const surveyDrums = transferTag(new THREE.Group(), "signal", 6910073, true);
  surveyDrums.userData.designRole = "survey-canisters";
  for (const side of [-1, 1]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.3, 18), armour);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(side * W * 0.57, deck + 0.33, LEN * 0.28);
    surveyDrums.add(drum);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.055, 18), dark);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(side * W * 0.71, deck + 0.33, LEN * 0.28);
    surveyDrums.add(cap);
    surveyDrums.add(cylinderBetween(
      [side * W * 0.46, deck + 0.18, LEN * 0.13],
      [side * W * 0.56, deck + 0.44, LEN * 0.34],
      0.016,
      metal,
      8
    ));
  }
  chassis.add(surveyDrums);
  const arm = transferTag(new THREE.Group(), "body", 10133928, true);
  arm.userData.designRole = "sample-arm";
  arm.position.set(-W * 0.44, deck - 0.01, -LEN * 0.18);
  const armPts = [
    [0, 0, 0],
    [-0.16, 0.08, -0.28],
    [-0.12, -0.14, -0.58],
    [-0.03, -0.25, -0.82]
  ];
  for (let i = 0; i < armPts.length - 1; i++) {
    arm.add(cylinderBetween(armPts[i], armPts[i + 1], i === 0 ? 0.038 : 0.03, metal, 16));
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.06 - i * 6e-3, 0.06 - i * 6e-3, 0.055, 18), dark);
    joint.position.set(...armPts[i]);
    joint.rotation.z = Math.PI / 2;
    arm.add(joint);
  }
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.047, 0.1, 16), dark);
  wrist.position.set(...armPts.at(-1));
  wrist.rotation.x = Math.PI / 2;
  arm.add(wrist);
  for (const side of [-1, 1]) {
    const tine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.19), metal);
    tine.position.set(armPts.at(-1)[0] + side * 0.034, armPts.at(-1)[1] - 0.015, armPts.at(-1)[2] - 0.08);
    tine.rotation.y = side * 0.16;
    arm.add(tine);
  }
  chassis.add(arm);
  const mastMount = transferTag(new THREE.Group(), "signal", 6910073, true);
  mastMount.userData.designRole = "camera-mast-structure";
  const baseZ = D.camZ + 0.09;
  const tower = Merged();
  tower.add(
    new THREE.BoxGeometry(0.48, 0.06, 0.31),
    xf([0, deck + 0.12, baseZ])
  );
  for (const x of [-0.085, 0.085])
    tower.add(
      new THREE.BoxGeometry(0.075, 0.42, 0.12),
      xf([x, deck + 0.345, baseZ - 0.025])
    );
  tower.add(
    new THREE.BoxGeometry(0.38, 0.08, 0.22),
    xf([0, deck + 0.555, D.camZ + 0.035])
  );
  tower.add(
    new THREE.BoxGeometry(0.46, 0.18, 0.2),
    xf([0, deck + D.camY, D.camZ])
  );
  mastMount.add(new THREE.Mesh(tower.build(), hull));
  for (const side of [-1, 1]) {
    mastMount.add(cylinderBetween(
      [side * 0.205, deck + 0.145, baseZ + 0.105],
      [side * 0.165, deck + 0.545, D.camZ + 0.045],
      0.014,
      metal,
      8
    ));
    mastMount.add(cylinderBetween(
      [side * 0.06, deck + 0.145, baseZ + 0.115],
      [side * 0.14, deck + 0.545, D.camZ + 0.045],
      0.012,
      metal,
      8
    ));
  }
  const mastJoint = Merged();
  for (const x of [-0.185, 0.185])
    mastJoint.add(
      new THREE.CylinderGeometry(0.055, 0.055, 0.075, 14),
      xf([x, deck + 0.57, D.camZ], [0, 0, Math.PI / 2])
    );
  mastMount.add(new THREE.Mesh(mastJoint.build(), metal));
  const cableDuct = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.34, 0.04), dark);
  cableDuct.position.set(0, deck + 0.33, baseZ + 0.08);
  mastMount.add(cableDuct);
  chassis.add(mastMount);
  const lidar = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.15), armour);
  lidar.position.set(0, deck + D.camY + 0.145, D.camZ + 0.015);
  lidar.userData.designRole = "lidar-cluster";
  chassis.add(transferTag(lidar, "signal", 6910073, true));
  const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.034, 0.36, 16), metal);
  dishStem.position.set(0.28, deck + 0.34, 0.24);
  dishStem.rotation.z = -0.18;
  chassis.add(transferTag(dishStem, "signal", 10133928, true));
  const dishFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.06, 12), armour);
  dishFoot.position.set(0.248, deck + 0.19, 0.24);
  chassis.add(transferTag(dishFoot, "signal", 6910073, true));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), metal);
  dish.position.set(0.24, deck + 0.52, 0.22);
  dish.rotation.x = -0.88;
  chassis.add(transferTag(dish, "signal", 10133928, true));
  const instrument = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.21, 18), dark);
  instrument.position.set(-0.3, deck + 0.29, 0.27);
  instrument.rotation.z = Math.PI / 2;
  chassis.add(transferTag(instrument, "signal", 2368809, true));
  const instrumentSaddle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.12), armour);
  instrumentSaddle.position.set(-0.3, deck + 0.205, 0.27);
  chassis.add(transferTag(instrumentSaddle, "signal", 6910073, true));
  const glass = new THREE.MeshBasicNodeMaterial();
  glass.colorNode = Fn(() => {
    const n = normalize(normalWorld);
    const v = normalize(cameraPosition.sub(positionWorld));
    const halfVector = normalize(L.add(v));
    const glint = pow(max(dot(n, halfVector), float(0)), float(70)).mul(0.72);
    const edge = pow(float(1).sub(abs(dot(n, v))), float(2));
    return vec4(vec3(0.015, 0.04, 0.052).add(vec3(0.18, 0.34, 0.38).mul(edge)).add(vec3(0.82, 0.93, 0.9).mul(glint)), 1);
  })();
  const lensGeo = new THREE.CylinderGeometry(0.047, 0.047, 0.04, 20);
  const lensBezelGeo = new THREE.TorusGeometry(0.057, 9e-3, 7, 24);
  for (const sx of [-0.135, 0.135]) {
    const l = new THREE.Mesh(lensGeo, glass);
    l.rotation.x = Math.PI / 2;
    l.position.set(sx, deck + D.camY, D.camZ - 0.11);
    chassis.add(transferTag(l, "signal", 8885157, true));
    const bezel = new THREE.Mesh(lensBezelGeo, metal);
    bezel.position.set(sx, deck + D.camY, D.camZ - 0.134);
    chassis.add(transferTag(bezel, "signal", 10133928, true));
  }
  const lidarLens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.042, 24), glass);
  lidarLens.rotation.x = Math.PI / 2;
  lidarLens.position.set(0, deck + D.camY + 0.145, D.camZ - 0.067);
  chassis.add(transferTag(lidarLens, "signal", 8885157, true));
  const lidarBezel = new THREE.Mesh(new THREE.TorusGeometry(0.071, 0.01, 7, 28), metal);
  lidarBezel.position.set(0, deck + D.camY + 0.145, D.camZ - 0.092);
  chassis.add(transferTag(lidarBezel, "signal", 10133928, true));
  const sensorBrow = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.025, 0.055), armour);
  sensorBrow.position.set(0, deck + D.camY + 0.095, D.camZ - 0.105);
  chassis.add(transferTag(sensorBrow, "signal", 6910073, true));
  const crown = transferTag(new THREE.Group(), "signal", 6910073, true);
  crown.userData.designRole = "panoramic-optical-crown";
  const crownShell = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.105, 0.19), armour);
  crownShell.position.set(0, deck + D.camY + 0.035, D.camZ - 0.015);
  crown.add(crownShell);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.075), dark);
  visor.position.set(0, deck + D.camY + 0.095, D.camZ - 0.105);
  crown.add(visor);
  for (const x of [-0.255, 0, 0.255]) {
    const optic = new THREE.Mesh(new THREE.CylinderGeometry(x ? 0.042 : 0.052, x ? 0.042 : 0.052, 0.045, 20), glass);
    optic.rotation.x = Math.PI / 2;
    optic.position.set(x, deck + D.camY + 0.03, D.camZ - 0.125);
    crown.add(optic);
  }
  chassis.add(crown);
  for (const x of [-0.38, 0.38]) {
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(8e-3, 0.012, 0.38, 7), dark);
    whip.position.set(x, deck + 0.4, LEN * 0.16);
    whip.rotation.z = x < 0 ? -0.1 : 0.1;
    chassis.add(transferTag(whip, "signal", 2368809, true));
  }
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vec4(vec3(...C.headlight.colour).mul(uLampPower.mul(1.9).add(0.018)), 1);
  const canGeo = new THREE.BoxGeometry(0.18, 0.105, 0.1);
  const lensG = new THREE.PlaneGeometry(0.135, 0.024);
  for (const sgn of [-1, 1]) {
    const can = new THREE.Mesh(canGeo, hull);
    can.position.set(sgn * C.headlight.offset, deck + 0.07, -LEN * 0.585);
    chassis.add(transferTag(can, "body", 6910073));
    for (const dy of [-0.025, 0.025]) {
      const le = new THREE.Mesh(lensG, glow);
      le.position.set(sgn * C.headlight.offset, deck + 0.07 + dy, -LEN * 0.617);
      le.rotation.y = Math.PI;
      chassis.add(transferTag(le, "body", 14210498));
    }
  }
  const beaconRig = transferTag(new THREE.Group(), "signal", 16757276, true);
  beaconRig.userData.designRole = "communications-beacon";
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.078, 0.065, 16), dark);
  beaconBase.position.set(W * 0.34, deck + 0.245, LEN * 0.31);
  beaconRig.add(beaconBase);
  const beaconLens = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.115, 18), beaconGlow);
  beaconLens.position.set(W * 0.34, deck + 0.33, LEN * 0.31);
  beaconRig.add(beaconLens);
  for (const y of [deck + 0.275, deck + 0.385]) {
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 20), metal);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(W * 0.34, y, LEN * 0.31);
    beaconRig.add(guard);
  }
  chassis.add(beaconRig);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.34), mark);
  stripe.position.set(-W * 0.42, deck + 0.02, -0.26);
  chassis.add(transferTag(stripe, "body", 12588330));
  const head = new THREE.Object3D();
  head.position.set(0, deck + D.camY, D.camZ - 0.13);
  chassis.add(head);
  group.frustumCulled = false;
  return { group, chassis, head, wheels, lid, wings, beaconPulse };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
