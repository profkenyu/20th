/**
 * LANDER — a large autonomous surface habitat and descent vehicle.
 *
 * Reference 2592 is used for massing, not nostalgia: a broad pressure hull, a
 * deep service stage, large radial machinery and four articulated load paths.
 * The shield-shaped faceted shell reads as architecture unfolded on terrain,
 * not as a historical capsule or a softened aerospace toy.
 */

import * as THREE from 'three';
import {
  Fn, float, uniform, vec3, vec4, normalize, dot, abs, max, mix, exp, pow,
  cameraPosition, normalWorld, positionView, positionWorld,
  smoothstep as ss,
} from 'three/tsl';
import { cfg } from '../config.js';

const Y = new THREE.Vector3(0, 1, 0);
const RESTORATION_PARTS = Object.freeze([
  'FOUNDATION', 'LOAD PATHS', 'SERVICE CELLS', 'PRESSURE HULL',
  'SENSOR VISOR', 'TRANSFER BRIDGE', 'SENSOR CROWN', 'SIGNAL CORE',
]);

function cylinderBetween(a, b, radius, material, radial = 12) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const dir = bv.clone().sub(av), len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, radial), material);
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
  mesh.userData.baseLength = len;
  return mesh;
}

function updateCylinderBetween(mesh, a, b) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
  const dir = bv.clone().sub(av), len = dir.length();
  mesh.position.copy(av).add(bv).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y, dir.normalize());
  mesh.scale.y = len / mesh.userData.baseLength;
}

function shaded(rgb, sheen = 0.08, gloss = 26) {
  const C = cfg();
  const L = normalize(vec3(...C.sun));
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const n = normalize(normalWorld);
    const v = normalize(cameraPosition.sub(positionWorld));
    /* One-sided solar incidence. `abs(dot)` lit the anti-solar underside as
       brightly as the sun-facing armour and made the craft read like a studio
       miniature in space. The low constant is instrument visibility only. */
    const ndl = max(dot(n, L), float(0.0));
    const halfVector = normalize(L.add(v));
    const spec = pow(max(dot(n, halfVector), float(0.0)), float(gloss)).mul(sheen);
    const rim = pow(float(1.0).sub(abs(dot(n, v))), float(3.0)).mul(sheen * 0.14);
    const lit = vec3(...rgb).mul(ndl.mul(1.36).add(0.052))
      .add(vec3(1.0, 0.97, 0.91).mul(spec))
      .add(vec3(0.28, 0.34, 0.40).mul(rim));
    const fog = float(1.0).sub(exp(positionView.length().mul(-C.atmosphere.fogDensity)));
    return vec4(mix(lit, vec3(...C.color.horizon), ss(0.0, 1.0, fog)), 1.0);
  })();
  return mat;
}

function signalEnvelope(seconds, period = 3.2) {
  const phase = ((seconds % period) + period) % period;
  const pulse = start => {
    const x = phase - start;
    if (x < 0 || x > 0.16) return 0;
    return x < 0.018 ? x / 0.018 : Math.exp(-(x - 0.018) / 0.040);
  };
  return Math.max(pulse(0.00), pulse(0.17));
}

const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* In vacuum this is not atmospheric fog. A cryogenic purge flashes into a
   short-lived cloud of frozen condensate, expands ballistically and vanishes.
   One point draw-call is enough; the irregular doublets are deterministic so
   the kiosk remains repeatable and no frame-rate-dependent Math.random leaks
   into the work. */
class CryogenicPurge {
  constructor(vents) {
    const low = cfg().clipmap.grid < 450;
    this.vents = vents;
    this.count = low ? 72 : 144;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.maxLife = new Float32Array(this.count);
    this.color = new Float32Array(this.count * 3);
    this.cursor = 0;
    this.active = false;
    this.last = 0;
    this.nextBurst = 0;
    this.burstStart = -1;
    this.burstIndex = 0;
    this.activeVent = 0;
    this.carry = 0;
    this.forcedUntil = 0;
    this.forcedVentStart = 0;
    this.forcedVentCount = 1;
    this.lastCarrierY = null;
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 1] = -1e6;

    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(this.pos, 3);
    const colour = new THREE.BufferAttribute(this.color, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    colour.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', colour);
    const material = new THREE.PointsMaterial({
      size: low ? 0.72 : 0.60, sizeAttenuation: true,
      transparent: true, opacity: low ? 0.31 : 0.36,
      depthWrite: false, blending: THREE.NormalBlending, vertexColors: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  clear() {
    this.life.fill(0);
    this.vel.fill(0);
    this.color.fill(0);
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 1] = -1e6;
    this.carry = 0;
    this.burstStart = -1;
    this.forcedUntil = 0;
    this.lastCarrierY = null;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  setActive(active, now) {
    if (active === this.active) return;
    this.active = active;
    this.points.visible = active;
    this.last = now;
    if (active) this.nextBurst = now + 4800;
    else { this.clear(); this.nextBurst = 0; }
  }

  reset(now = 0) {
    this.clear();
    this.burstIndex = 0;
    this.last = now;
    this.nextBurst = this.active ? now + 4800 : 0;
  }

  forceBurst(now, ventStart = 0, ventCount = 1, duration = 2100) {
    this.setActive(true, now);
    this.burstIndex++;
    this.burstStart = now;
    this.forcedUntil = now + duration;
    this.forcedVentStart = Math.max(0, Math.min(this.vents.length - 1, ventStart));
    this.forcedVentCount = Math.max(1, Math.min(ventCount, this.vents.length - this.forcedVentStart));
    this.nextBurst = this.forcedUntil + 9000;
    this.last = now;
  }

  emit(forced = false) {
    const i = this.cursor++ % this.count, p = i * 3;
    const seed = this.cursor + this.burstIndex * 193;
    const ventIndex = forced
      ? this.forcedVentStart + (this.cursor % this.forcedVentCount)
      : this.activeVent;
    const vent = this.vents[ventIndex] ?? this.vents[0];
    const speed = forced ? 1.8 + hash(seed + 3) * 4.2 : 3.5 + hash(seed + 3) * 5.5;
    const dx = vent.direction[0] + (hash(seed + 11) - 0.5) * 0.58;
    const dy = vent.direction[1] + (hash(seed + 23) - 0.5) * 0.42;
    const dz = vent.direction[2] + (hash(seed + 43) - 0.5) * 0.58;
    const length = Math.hypot(dx, dy, dz) || 1;
    this.pos[p] = vent.position[0] + (hash(seed + 31) - 0.5) * 0.10;
    this.pos[p + 1] = vent.position[1] + (hash(seed + 37) - 0.5) * 0.10;
    this.pos[p + 2] = vent.position[2] + (hash(seed + 47) - 0.5) * 0.10;
    this.vel[p] = dx / length * speed;
    this.vel[p + 1] = dy / length * speed;
    this.vel[p + 2] = dz / length * speed;
    this.life[i] = this.maxLife[i] = forced
      ? 0.35 + hash(seed + 59) * 0.35
      : 0.65 + hash(seed + 59) * 0.82;
  }

  update(now, active, carrierY = 0) {
    this.setActive(active, now);
    if (!active) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const carrierDeltaY = this.lastCarrierY == null ? 0 : carrierY - this.lastCarrierY;
    this.lastCarrierY = carrierY;

    if (now >= this.nextBurst) {
      this.burstStart = now;
      this.burstIndex++;
      /* Alternating ports make the elevated purge appear immediately, while
         the original side port remains the next mechanical response. */
      this.activeVent = this.vents.length > 1 ? this.burstIndex % this.vents.length : 0;
      this.pulseA = 110 + hash(this.burstIndex * 17) * 130;
      this.gap = 90 + hash(this.burstIndex * 29) * 170;
      this.pulseB = 240 + hash(this.burstIndex * 41) * 390;
      this.nextBurst = now + this.pulseA + this.gap + this.pulseB
        + 11000 + hash(this.burstIndex * 53) * 27000;
    }
    const age = now - this.burstStart;
    const forced = now < this.forcedUntil;
    const emitting = forced || (age >= 0 && (age <= this.pulseA
      || (age >= this.pulseA + this.gap && age <= this.pulseA + this.gap + this.pulseB)));
    this.points.material.size = forced ? 0.62 : (this.count < 100 ? 0.72 : 0.60);
    this.points.material.opacity = forced ? 0.38 : (this.count < 100 ? 0.31 : 0.36);
    if (emitting) {
      const rate = forced ? 120 : 48 + hash(this.burstIndex * 67) * 46;
      this.carry += rate * dt;
      const emitCount = Math.min(forced ? 8 : 5, Math.floor(this.carry));
      this.carry -= emitCount;
      for (let i = 0; i < emitCount; i++) this.emit(forced);
    }

    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const p = i * 3;
      /* The point pool is parented for placement, but released condensate is
         inertial. Counter the carrier's lift/descent so a purge remains near
         the surface instead of being dragged upward with the spacecraft. */
      this.pos[p + 1] -= carrierDeltaY;
      this.life[i] -= dt;
      /* Frozen grains, not gas parcels: after the flash expansion their only
         acceleration is the body's gravity. Their life is too short to fall
         far, but the slight arc prevents a screen-space smoke look. */
      this.vel[p + 1] -= cfg().dust.gravity * dt;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.life[i] <= 0) {
        this.pos[p + 1] = -1e6;
        this.color[p] = this.color[p + 1] = this.color[p + 2] = 0;
        continue;
      }
      const fade = Math.min(1, this.life[i] / 0.22, (this.maxLife[i] - this.life[i]) / 0.075);
      this.color[p] = 0.66 * fade;
      this.color[p + 1] = 0.72 * fade;
      this.color[p + 2] = 0.75 * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/* A deliberately architectural hull. Five corresponding polygon rings create
   a lower chine, vertical sensor belt and two upper chamfers. Non-indexing the
   result gives every plane a hard normal: it reads as cut armour, never as a
   low-resolution sphere. Local -Z is the deployment/front face. */
function facetedHullGeometry() {
  const outline = [
    [0.00, -3.65], [1.95, -3.28], [3.35, -2.30], [3.65, 0.55],
    [2.85, 2.90], [1.55, 3.35], [0.00, 3.42], [-1.55, 3.35],
    [-2.85, 2.90], [-3.65, 0.55], [-3.35, -2.30], [-1.95, -3.28],
  ];
  const rings = [
    [3.05, 0.72], [3.58, 1.00], [4.38, 1.00], [5.08, 0.76], [5.45, 0.46],
  ];
  const positions = [];
  for (const [y, scale] of rings) {
    for (const [x, z] of outline) positions.push(x * scale, y, z * scale);
  }
  const indices = [];
  const n = outline.length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + (i + 1) % n;
      const d = (r + 1) * n + i, c = (r + 1) * n + (i + 1) % n;
      indices.push(a, d, b, b, d, c);
    }
  }
  const bottom = positions.length / 3;
  positions.push(0, rings[0][0], 0);
  const top = positions.length / 3;
  positions.push(0, rings.at(-1)[0], 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(bottom, i, j);
    const offset = (rings.length - 1) * n;
    indices.push(top, offset + j, offset + i);
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}

function sampleSite(heightAt, cx, cz, originX, originZ, dense = false) {
  const dxHome = originX - cx, dzHome = originZ - cz;
  const homeLength = Math.hypot(dxHome, dzHome) || 1;
  const yaw = Math.atan2(-dxHome / homeLength, -dzHome / homeLength);
  const samples = [{ dx: 0, dz: 0, h: heightAt(cx, cz) }];
  const radii = dense ? [2.8, 5.55, 6.4] : [3.0, 6.4];
  for (const radius of radii) {
    const count = dense ? 12 : (radius < 4 ? 4 : 8);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
      samples.push({ dx, dz, h: heightAt(cx + dx, cz + dz) });
    }
  }
  const mean = samples.reduce((sum, p) => sum + p.h, 0) / samples.length;
  let xx = 0, zz = 0, xh = 0, zh = 0;
  for (const p of samples) {
    xx += p.dx * p.dx; zz += p.dz * p.dz;
    xh += p.dx * (p.h - mean); zh += p.dz * (p.h - mean);
  }
  const ax = xh / Math.max(xx, 1e-6), az = zh / Math.max(zz, 1e-6);
  let residual2 = 0, maxResidual = 0;
  for (const p of samples) {
    const residual = Math.abs(p.h - (mean + ax * p.dx + az * p.dz));
    residual2 += residual * residual;
    maxResidual = Math.max(maxResidual, residual);
  }
  const feet = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3 + yaw;
    feet.push(heightAt(cx + Math.cos(angle) * 5.55, cz + Math.sin(angle) * 5.55));
  }
  const heights = samples.map(p => p.h).concat(feet);
  const rms = Math.sqrt(residual2 / samples.length);
  const slope = Math.atan(Math.hypot(ax, az)) * 180 / Math.PI;
  const footRange = Math.max(...feet) - Math.min(...feet);
  const range = Math.max(...heights) - Math.min(...heights);
  return {
    x: cx, z: cz, y: Math.max(...heights) + 0.03, yaw,
    slope, rms, maxResidual, footRange, range,
  };
}

/* Search the rear and lateral landing apron, never the rover's forward route.
   Coarse candidates cost little; full plane fitting is reserved for the best
   few. The result is cached by Lander.place(), so this never enters the RAF. */
function findLandingSite(heightAt, x, z, heading) {
  const forwardX = -Math.sin(heading), forwardZ = -Math.cos(heading);
  const backX = -forwardX, backZ = -forwardZ;
  const rightX = -forwardZ, rightZ = forwardX;
  const coarse = [];
  for (let back = 0; back <= 30; back += 2) {
    for (let side = -20; side <= 20; side += 2) {
      const distance = Math.hypot(back, side);
      if (distance < 16 || distance > 34) continue;
      const cx = x + backX * back + rightX * side;
      const cz = z + backZ * back + rightZ * side;
      const site = sampleSite(heightAt, cx, cz, x, z, false);
      site.back = back; site.side = side;
      site.rank = site.slope * 4 + site.rms * 38 + site.maxResidual * 22
        + site.footRange * 8 + Math.hypot(back - 18, Math.abs(side) - 9) * 0.16
        + (side < 0 ? 0.4 : 0);
      coarse.push(site);
    }
  }
  coarse.sort((a, b) => a.rank - b.rank);
  const refined = [];
  for (const seed of coarse.slice(0, 12)) {
    for (const db of [-1, 0, 1]) for (const ds of [-1, 0, 1]) {
      const back = seed.back + db, side = seed.side + ds;
      const distance = Math.hypot(back, side);
      if (back < 0 || distance < 16 || distance > 34) continue;
      const cx = x + backX * back + rightX * side;
      const cz = z + backZ * back + rightZ * side;
      const site = sampleSite(heightAt, cx, cz, x, z, true);
      site.back = back; site.side = side;
      site.score = site.slope * 4 + site.rms * 38 + site.maxResidual * 22
        + Math.max(0, site.footRange - 0.35) * 8
        + Math.hypot(back - 18, Math.abs(side) - 9) * 0.16
        + (side < 0 ? 0.4 : 0);
      refined.push(site);
    }
  }
  const strict = refined.filter(s => s.slope <= 2.5 && s.rms <= 0.22
    && s.maxResidual <= 0.48 && s.footRange <= 0.50 && s.range <= 1.05);
  const relaxed = refined.filter(s => s.slope <= 5 && s.rms <= 0.30
    && s.maxResidual <= 0.65 && s.footRange <= 0.85 && s.range <= 1.45);
  const candidates = strict.length ? strict : relaxed.length ? relaxed : refined;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}

export class Lander {
  constructor(heightAt) {
    this.h = heightAt;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.core = new THREE.Group();
    this.crown = new THREE.Group();
    this.beacon = uniform(0.0);
    this.beaconOverride = null;
    this.legs = [];
    this.purge = null;
    this.rampPivot = null;
    this.ramp = null;
    this.dockLights = [];
    this.dock = {
      hatchZ: -3.78, toeZ: -8.68, floorY: 2.04, halfWidth: 1.45,
      toeY: 0, openAngle: -0.36, progress: 0,
    };
    this.restorationLevel = 0;
    this.parts = RESTORATION_PARTS.map((name, index) => ({
      index, name, objects: [], wire: null, wireMaterial: null,
      state: 'wire', started: 0,
    }));
    this._wireInverse = new THREE.Matrix4();
    this._wireRelative = new THREE.Matrix4();
    this.group.add(this.core);
    this._build();
    this._prepareRestoration();
  }

  _track(part, ...objects) {
    this.parts[part].objects.push(...objects.filter(Boolean));
  }

  _build() {
    const C = cfg();
    const graphite = shaded([0.055, 0.061, 0.070], 0.10, 30);
    const ceramic = shaded([0.285, 0.300, 0.310], 0.28, 50);
    const dark = shaded([0.010, 0.013, 0.018], 0.030, 16);
    const service = shaded([0.305, 0.145, 0.038], 0.20, 36);
    const metal = shaded([0.175, 0.190, 0.205], 0.38, 58);
    const glass = shaded([0.010, 0.035, 0.052], 0.42, 74);

    const beaconMat = new THREE.MeshBasicNodeMaterial();
    beaconMat.colorNode = vec4(
      vec3(...C.color.beacon).mul(this.beacon.mul(4.2).add(0.018)), 1.0);

    /* ── descent/service stage ────────────────────────────────────────
       The octagonal keel establishes the same hard-edged language as the
       pressure hull above it. */
    const underbody = new THREE.Mesh(
      new THREE.CylinderGeometry(2.25, 2.85, 0.82, 8), dark);
    underbody.position.y = 1.12;
    this.group.add(underbody);

    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(3.05, 3.05, 1.38, 8), graphite);
    stage.position.y = 1.92;
    this.group.add(stage);

    const lowerRail = new THREE.Mesh(
      new THREE.CylinderGeometry(2.98, 2.98, 0.12, 8), metal);
    lowerRail.position.y = 1.26;
    this.group.add(lowerRail);
    const upperRail = lowerRail.clone();
    upperRail.position.y = 2.56;
    this.group.add(upperRail);
    this._track(0, underbody, stage, lowerRail, upperRail);

    /* Four flush orange service bays replace the reference's historical foil
       boxes with a single modular colour field. */
    const serviceCells = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5;
      const bay = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.88, 0.16), service);
      bay.position.set(Math.sin(a) * 3.02, 1.90, Math.cos(a) * 3.02);
      bay.rotation.y = a;
      this.group.add(bay);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.09, 0.035), dark);
      slot.position.set(Math.sin(a) * 3.115, 2.13, Math.cos(a) * 3.115);
      slot.rotation.y = a;
      this.group.add(slot);
      serviceCells.push(bay, slot);
    }
    this._track(2, ...serviceCells);

    /* ── articulated landing system ──────────────────────────────────
       Six thick two-segment arms, closer to robotic manipulators than Apollo
       struts. Every pad later samples its own world-space terrain height.
       The order is an alternating tripod, so recall reads as load transfer
       through the hull rather than six identical bars sliding at once. */
    const padRadius = 5.55;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const shoulder = [Math.cos(a) * 2.62, 2.24, Math.sin(a) * 2.62];
      const elbow = [Math.cos(a) * 4.12, 1.35, Math.sin(a) * 4.12];
      const foot = [Math.cos(a) * padRadius, 0.16, Math.sin(a) * padRadius];
      const upper = cylinderBetween(shoulder, elbow, 0.22, ceramic, 8);
      const lower = cylinderBetween(elbow, foot, 0.17, metal, 8);
      const brace = cylinderBetween(
        [shoulder[0] * 0.93, shoulder[1] - 0.30, shoulder[2] * 0.93],
        [foot[0], foot[1] + 0.18, foot[2]], 0.065, graphite, 10);
      this.group.add(upper, lower, brace);

      const shoulderJoint = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), dark);
      shoulderJoint.position.set(...shoulder);
      this.group.add(shoulderJoint);
      const elbowJoint = new THREE.Mesh(new THREE.DodecahedronGeometry(0.30, 0), service);
      elbowJoint.position.set(...elbow);
      this.group.add(elbowJoint);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.78, 0.16, 8), metal);
      pad.position.set(foot[0], 0.08, foot[2]);
      this.group.add(pad);
      const padCore = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.36, 0.19, 8), dark);
      padCore.position.copy(pad.position);
      padCore.position.y += 0.10;
      this.group.add(padCore);

      this.legs.push({
        shoulder, elbow, foot, upper, lower, brace, elbowJoint, pad, padCore,
        deployedElbow: elbow.slice(), deployedFoot: foot.slice(),
        foldOffset: [0, 2, 4, 1, 3, 5].indexOf(i) / 5,
      });
      this._track(1, upper, lower, brace, shoulderJoint, elbowJoint, pad, padCore);
    }

    /* ── suspended pressure hull ──────────────────────────────────────
       A forward-biased twelve-face shield replaces the former curved volume.
       Five height rings form large planar armour facets and a roof spine. */
    const hull = new THREE.Mesh(facetedHullGeometry(), ceramic);
    this.core.add(hull);
    this._track(3, hull);

    /* Four flat visor plates span only the forward 140 degrees. */
    const front = [
      [-3.35, -2.30], [-1.95, -3.28], [0, -3.65],
      [1.95, -3.28], [3.35, -2.30],
    ];
    const sensorVisor = [];
    for (let i = 0; i < front.length - 1; i++) {
      const a = front[i], b = front[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(length * 0.94, 0.43, 0.065), glass);
      const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
      const ml = Math.hypot(mx, mz) || 1;
      visor.position.set(mx + mx / ml * 0.045, 4.08, mz + mz / ml * 0.045);
      visor.rotation.y = Math.atan2(-dz, dx);
      this.core.add(visor);
      sensorVisor.push(visor);
    }

    /* Three large radial machine apertures quote 2592's cylindrical modules,
       but become flush docking/thermal ports with deep black throats. */
    const ports = [
      { x: -3.35, z: 0.25, rz: Math.PI / 2 },
      { x:  3.35, z: 0.25, rz: Math.PI / 2 },
      { x:  0.00, z: -3.35, rx: Math.PI / 2 },
    ];
    for (const p of ports) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.78, 10), graphite);
      collar.position.set(p.x, 3.90, p.z);
      collar.rotation.set(p.rx ?? 0, 0, p.rz ?? 0);
      this.core.add(collar);
      const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.82, 10), dark);
      throat.position.copy(collar.position);
      throat.rotation.copy(collar.rotation);
      this.core.add(throat);
      sensorVisor.push(collar, throat);
    }
    this._track(4, ...sensorVisor);

    /* ── deployment bay ───────────────────────────────────────────────
       The bay is intentionally unreadable as a room: a black receiving
       volume, a tall clear-span portal and three paired locator lights. The
       ramp is a real hinged surface and later becomes part of wheel contact. */
    /* The open bay is a clear receiving volume.  The former centre bridge and
       rear sculpture occupied the rover's wheel and hull envelope, so the
       interior now contains only a flush structural floor and perimeter. */
    const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(3.14, 0.12, 3.05), dark);
    bayFloor.position.set(0, this.dock.floorY - 0.06, -2.25);
    this.core.add(bayFloor);
    const bayFrames = [];
    for (const x of [-1.66, 1.66]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.60, 3.08), graphite);
      side.position.set(x, 3.34, -2.28);
      this.core.add(side); bayFrames.push(side);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.48, 0.18, 3.08), metal);
    lintel.position.set(0, 4.96, -2.28);
    this.core.add(lintel); bayFrames.push(lintel);

    this.rampPivot = new THREE.Group();
    this.rampPivot.position.set(0, this.dock.floorY, this.dock.hatchZ);
    this.group.add(this.rampPivot);
    const rampLength = this.dock.hatchZ - this.dock.toeZ;
    const rampGeometry = new THREE.BoxGeometry(3.14, 0.12, rampLength);
    rampGeometry.translate(0, 0, -rampLength * 0.5);
    this.ramp = new THREE.Mesh(rampGeometry, graphite);
    this.rampPivot.add(this.ramp);
    const rampRibA = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, rampLength), metal);
    rampRibA.geometry.translate(0, 0, -rampLength * 0.5);
    rampRibA.position.x = -1.47;
    const rampRibB = rampRibA.clone(); rampRibB.position.x = 1.47;
    this.rampPivot.add(rampRibA, rampRibB);

    for (let pair = 0; pair < 3; pair++) {
      for (const side of [-1, 1]) {
        const material = new THREE.MeshBasicMaterial({
          color: 0xffb21c, transparent: true, opacity: 0.92,
          depthWrite: false, toneMapped: false,
        });
        const locator = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.055, 0.42), material);
        locator.position.set(side * 1.40, 0.095, -0.82 - pair * 1.46);
        this.rampPivot.add(locator);
        this.dockLights.push(locator);
      }
    }

    /* Port-side residual volatile purge. The black aperture remains visible
       between events, so the brief cloud has a mechanical source. */
    const ventCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.17, 0.28, 8), metal);
    ventCollar.position.set(-3.60, 3.73, 0.15);
    ventCollar.rotation.z = Math.PI * 0.5;
    this.core.add(ventCollar);
    const ventMouth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.092, 0.092, 0.025, 8), dark);
    ventMouth.position.set(-3.75, 3.73, 0.15);
    ventMouth.rotation.z = Math.PI * 0.5;
    this.core.add(ventMouth);
    this._track(5, bayFloor, ...bayFrames,
      this.ramp, rampRibA, rampRibB, ...this.dockLights, ventCollar, ventMouth);
    this.purge = new CryogenicPurge([
      { position: [-3.78, 3.73, 0.15], direction: [-1.0, 0.04, 0.12] },
      { position: [0.58, 6.89, 0.41], direction: [0.18, 0.94, 0.30] },
      { position: [-1.70, 0.72, -0.72], direction: [-0.48, -0.78, -0.30] },
      { position: [ 1.70, 0.72, -0.72], direction: [ 0.48, -0.78, -0.30] },
      { position: [-1.35, 0.72,  1.08], direction: [-0.42, -0.80,  0.34] },
      { position: [ 1.35, 0.72,  1.08], direction: [ 0.42, -0.80,  0.34] },
    ]);
    this.group.add(this.purge.points);

    /* ── planar sensor crown ──────────────────────────────────────────
       A scanning blade continues the faceted silhouette; no circular halo. */
    this.crown.position.set(0, 5.55, 0);
    this.core.add(this.crown);
    const crownParts = [];
    const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 2.05, 0.42, 8), graphite);
    this.crown.add(crownBase);
    crownParts.push(crownBase);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.18, 0.48), metal);
    blade.position.y = 0.52;
    this.crown.add(blade);
    crownParts.push(blade);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), metal);
      mast.position.set(Math.cos(a) * 0.78, 0.72, Math.sin(a) * 0.78);
      this.crown.add(mast);
      const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.32), dark);
      sensor.position.set(Math.cos(a) * 0.78, 1.10, Math.sin(a) * 0.78);
      sensor.rotation.y = -a;
      this.crown.add(sensor);
      crownParts.push(mast, sensor);
    }

    /* The elevated thermal purge is deliberately visible from the gallery
       camera: it vents above the hull, not into the rover deployment face. */
    const upperDirection = new THREE.Vector3(0.18, 0.94, 0.30).normalize();
    const upperVent = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.15, 0.28, 8), metal);
    upperVent.position.set(0.55, 1.20, 0.36);
    upperVent.quaternion.setFromUnitVectors(Y, upperDirection);
    this.crown.add(upperVent);
    const upperMouth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.026, 8), dark);
    upperMouth.position.copy(upperVent.position).addScaledVector(upperDirection, 0.15);
    upperMouth.quaternion.copy(upperVent.quaternion);
    this.crown.add(upperMouth);
    crownParts.push(upperVent, upperMouth);
    this._track(6, ...crownParts);

    /* The eighth recovery key fixes the final navigation core into matter.
       Its asymmetric rectangular housing keeps the roof architectural rather
       than returning to a capsule silhouette. */
    const coreHousing = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.46, 1.18), graphite);
    coreHousing.position.set(-0.16, 0.34, 0.08);
    this.crown.add(coreHousing);
    const coreInset = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.13, 0.72), glass);
    coreInset.position.set(-0.16, 0.49, -0.18);
    this.crown.add(coreInset);

    const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.10, 8), metal);
    beaconBase.position.set(0, 0.64, 0);
    this.crown.add(beaconBase);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.16, 8), beaconMat);
    beacon.position.set(0, 0.77, 0);
    this.crown.add(beacon);
    this._track(7, coreHousing, coreInset, beaconBase, beacon);
  }

  _prepareRestoration() {
    for (const part of this.parts) {
      for (const object of part.objects) {
        object.userData.restorationScale = object.scale.clone();
        object.visible = false;
      }
      const material = new THREE.LineBasicMaterial({
        color: 0x8fa8a3, transparent: true, opacity: 0.30,
        depthWrite: false, depthTest: true,
      });
      const wire = new THREE.LineSegments(new THREE.BufferGeometry(), material);
      wire.renderOrder = 2;
      this.group.add(wire);
      part.wire = wire;
      part.wireMaterial = material;
    }
  }

  _rebuildWireframes() {
    this.group.updateMatrixWorld(true);
    this._wireInverse.copy(this.group.matrixWorld).invert();
    const point = new THREE.Vector3();
    for (const part of this.parts) {
      const vertices = [];
      for (const object of part.objects) {
        object.updateWorldMatrix(true, false);
        this._wireRelative.multiplyMatrices(this._wireInverse, object.matrixWorld);
        const edges = new THREE.EdgesGeometry(object.geometry, 18);
        const position = edges.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i).applyMatrix4(this._wireRelative);
          vertices.push(point.x, point.y, point.z);
        }
        edges.dispose();
      }
      part.wire.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeBoundingSphere();
      part.wire.geometry = geometry;
    }
  }

  setRestorationLevel(level = 0) {
    this.restorationLevel = Math.max(0, Math.min(this.parts.length, Math.floor(level)));
    for (const part of this.parts) {
      const restored = part.index < this.restorationLevel;
      part.state = restored ? 'solid' : 'wire';
      part.started = 0;
      for (const object of part.objects) {
        object.visible = restored;
        object.scale.copy(object.userData.restorationScale);
      }
      part.wire.visible = !restored;
      part.wireMaterial.color.setHex(0x8fa8a3);
      part.wireMaterial.opacity = 0.30;
    }
    this.beacon.value = 0;
    return this.restorationLevel;
  }

  restorePart(index, now = performance.now()) {
    if (index !== this.restorationLevel || index < 0 || index >= this.parts.length) return false;
    const part = this.parts[index];
    part.state = 'materialising';
    part.started = now;
    part.wire.visible = true;
    part.wireMaterial.color.setHex(0xffb21c);
    part.wireMaterial.opacity = 0.92;
    this.restorationLevel = index + 1;
    return true;
  }

  restoreAll(now = performance.now()) {
    if (this.restorationLevel >= this.parts.length) return false;
    for (const part of this.parts) {
      if (part.state === 'solid') continue;
      part.state = 'materialising';
      part.started = now;
      part.wire.visible = true;
      part.wireMaterial.color.setHex(0xffb21c);
      part.wireMaterial.opacity = 0.92;
    }
    this.restorationLevel = this.parts.length;
    return true;
  }

  _updateRestoration(now) {
    for (const part of this.parts) {
      if (part.state === 'wire') {
        part.wire.visible = true;
        part.wireMaterial.opacity = 0.25 + Math.sin(now * 0.00072 + part.index * 0.67) * 0.045;
        continue;
      }
      if (part.state === 'solid') { part.wire.visible = false; continue; }
      const progress = Math.max(0, Math.min(1, (now - part.started) / 2200));
      const eased = progress * progress * (3 - 2 * progress);
      const count = Math.max(1, part.objects.length);
      for (let i = 0; i < count; i++) {
        const object = part.objects[i];
        const local = Math.max(0, Math.min(1, progress * 1.32 - i / count * 0.32));
        const settle = local * local * (3 - 2 * local);
        object.visible = local > 0.01;
        object.scale.copy(object.userData.restorationScale).multiplyScalar(0.84 + settle * 0.16);
      }
      part.wire.visible = progress < 1;
      part.wireMaterial.opacity = (1 - eased) * 0.92;
      if (progress >= 1) {
        part.state = 'solid';
        part.wire.visible = false;
        for (const object of part.objects) {
          object.visible = true;
          object.scale.copy(object.userData.restorationScale);
        }
      }
    }
  }

  /** A final wire-to-matter registration pass used only by the 8/8 tableau.
      It changes no restoration state: solid geometry remains solid while a
      thin orange-white contour travels from the foundation to the signal
      core, then disappears before physical recall begins. */
  setCompletionHighlight(progress = null) {
    if (progress == null) {
      for (const part of this.parts) {
        part.wire.visible = part.state !== 'solid';
        part.wireMaterial.color.setHex(0x8fa8a3);
        part.wireMaterial.opacity = part.state === 'wire' ? 0.30 : 0;
      }
      return;
    }
    const p = Math.max(0, Math.min(1, progress));
    for (const part of this.parts) {
      const centre = 0.08 + part.index * 0.075;
      const distance = Math.abs(p - centre);
      const leading = Math.max(0, 1 - distance / 0.18);
      const residue = Math.max(0, 1 - p) * 0.12;
      const opacity = Math.min(0.82, leading * 0.78 + residue);
      part.wire.visible = opacity > 0.012;
      part.wireMaterial.color.setHex(part.index === 7 ? 0xffd57a : 0xffb21c);
      part.wireMaterial.opacity = opacity;
    }
    const core = Math.max(0, 1 - Math.abs(p - 0.72) / 0.10);
    this.beacon.value = Math.max(this.beacon.value, core);
  }

  place(x, z, heading, visible = true) {
    const key = `${x.toFixed(3)}:${z.toFixed(3)}:${heading.toFixed(5)}`;
    if (!this.site || this.site.key !== key) {
      this.site = { ...findLandingSite(this.h, x, z, heading), key };
    }
    const { x: px, z: pz, y: baseY, yaw } = this.site;
    this.group.position.set(px, baseY, pz);
    this.group.rotation.y = yaw;

    /* The toe is fitted once to terrain. The open ramp angle and the wheel
       collision surface then share these exact endpoints. */
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const toeX = px + this.dock.toeZ * sin;
    const toeZ = pz + this.dock.toeZ * cos;
    this.dock.toeY = this.h(toeX, toeZ) - baseY + 0.08;
    const rampLength = this.dock.hatchZ - this.dock.toeZ;
    this.dock.openAngle = Math.asin(Math.max(-0.82, Math.min(0.05,
      (this.dock.toeY - this.dock.floorY) / rampLength)));
    this.setRamp(0);
    this.setDockLights(1);

    for (const leg of this.legs) {
      const local = new THREE.Vector3(leg.foot[0], 0, leg.foot[2])
        .applyAxisAngle(Y, this.group.rotation.y);
      const footY = this.h(px + local.x, pz + local.z) - baseY;
      const foot = [leg.foot[0], footY + 0.16, leg.foot[2]];
      const elbow = [leg.elbow[0], 1.35 + footY * 0.18, leg.elbow[2]];
      updateCylinderBetween(leg.upper, leg.shoulder, elbow);
      updateCylinderBetween(leg.lower, elbow, foot);
      updateCylinderBetween(leg.brace,
        [leg.shoulder[0] * 0.93, leg.shoulder[1] - 0.30, leg.shoulder[2] * 0.93],
        [foot[0], foot[1] + 0.18, foot[2]]);
      leg.elbowJoint.position.set(...elbow);
      leg.pad.position.set(foot[0], footY + 0.08, foot[2]);
      leg.padCore.position.set(foot[0], footY + 0.18, foot[2]);
      leg.deployedElbow = elbow.slice();
      leg.deployedFoot = foot.slice();
    }
    this.setLegFold(0);
    /* Terrain fitting changes the articulated struts' Y scale. Preserve that
       fitted scale as the restoration endpoint; otherwise materialisation
       would silently snap every leg back to its flat-ground length. */
    for (const part of this.parts) for (const object of part.objects)
      object.userData.restorationScale.copy(object.scale);
    this._rebuildWireframes();
    this.purge?.reset(typeof performance === 'undefined' ? 0 : performance.now());
    this.group.visible = visible;
  }

  setRamp(progress = 0) {
    this.dock.progress = Math.max(0, Math.min(1, progress));
    if (!this.rampPivot) return;
    const eased = this.dock.progress * this.dock.progress * (3 - 2 * this.dock.progress);
    this.rampPivot.rotation.x = Math.PI * 0.5
      + (this.dock.openAngle - Math.PI * 0.5) * eased;
  }

  setDockLights(fraction = 1) {
    const remaining = Math.max(0, Math.min(1, fraction));
    const pairs = 3;
    for (let i = 0; i < this.dockLights.length; i++) {
      const pair = Math.floor(i / 2);
      this.dockLights[i].material.opacity = pair < Math.ceil(remaining * pairs) ? 0.92 : 0.025;
    }
  }

  setBeaconOverride(value = null) {
    this.beaconOverride = value == null ? null : Math.max(0, Math.min(1, value));
  }

  forceFlightPurge(now = performance.now(), duration = 2200) {
    this.purge?.forceBurst(now, 2, 4, duration);
  }

  setLegFold(progress = 0) {
    const p = Math.max(0, Math.min(1, progress));
    for (const leg of this.legs) {
      /* Alternating tripod timing makes the body appear to hand its weight
         from one load path to the next. The upper link draws the knee inward
         first; the lower link follows after a short mechanical delay. */
      const staged = Math.max(0, Math.min(1, (p - leg.foldOffset * 0.30) / 0.70));
      const ease = value => value * value * (3 - 2 * value);
      const upperEase = ease(Math.min(1, staged / 0.74));
      const lowerEase = ease(Math.max(0, (staged - 0.16) / 0.84));
      const a = Math.atan2(leg.shoulder[2], leg.shoulder[0]);
      const tuckedElbow = [Math.cos(a) * 2.78, 1.72, Math.sin(a) * 2.78];
      const tuckedFoot = [Math.cos(a) * 3.08, 1.06, Math.sin(a) * 3.08];
      const elbow = leg.deployedElbow.map((v, i) => v + (tuckedElbow[i] - v) * upperEase);
      const foot = leg.deployedFoot.map((v, i) => v + (tuckedFoot[i] - v) * lowerEase);
      updateCylinderBetween(leg.upper, leg.shoulder, elbow);
      updateCylinderBetween(leg.lower, elbow, foot);
      updateCylinderBetween(leg.brace,
        [leg.shoulder[0] * 0.93, leg.shoulder[1] - 0.30, leg.shoulder[2] * 0.93],
        [foot[0], foot[1] + 0.18, foot[2]]);
      leg.elbowJoint.position.set(...elbow);
      leg.pad.position.set(foot[0], foot[1] - 0.08, foot[2]);
      leg.padCore.position.set(foot[0], foot[1] + 0.02, foot[2]);
    }
    this.legFold = p;
  }

  /** Short load-stroke after touchdown.  The carrier settles while the pads
      remain registered to terrain; this method raises pad coordinates by the
      same amount that VoyageSequence lowers the hull. */
  setLegCompression(progress = 0, stroke = 0.11) {
    const q = Math.max(0, Math.min(1, progress));
    if (this.legFold > 0.001) return;
    for (const leg of this.legs) {
      const a = Math.atan2(leg.shoulder[2], leg.shoulder[0]);
      const elbow = leg.deployedElbow.slice();
      const foot = leg.deployedFoot.slice();
      elbow[0] += Math.cos(a) * 0.14 * q;
      elbow[1] -= 0.08 * q;
      elbow[2] += Math.sin(a) * 0.14 * q;
      foot[1] += stroke * q;
      updateCylinderBetween(leg.upper, leg.shoulder, elbow);
      updateCylinderBetween(leg.lower, elbow, foot);
      updateCylinderBetween(leg.brace,
        [leg.shoulder[0] * 0.93, leg.shoulder[1] - 0.30, leg.shoulder[2] * 0.93],
        [foot[0], foot[1] + 0.18, foot[2]]);
      leg.elbowJoint.position.set(...elbow);
      leg.pad.position.set(foot[0], foot[1] - 0.08, foot[2]);
      leg.padCore.position.set(foot[0], foot[1] + 0.02, foot[2]);
    }
    this.legCompression = q;
  }

  /* Local deployment coordinates converted without allocating matrices. */
  dockingPoint(localZ, localX = 0, localY = null) {
    const yaw = this.group.rotation.y, sin = Math.sin(yaw), cos = Math.cos(yaw);
    const y = localY == null
      ? this.group.position.y + this.hangarHeight(localZ)
      : this.group.position.y + localY;
    return new THREE.Vector3(
      this.group.position.x + localX * cos + localZ * sin,
      y,
      this.group.position.z - localX * sin + localZ * cos,
    );
  }

  dockingLocal(x, z) {
    const dx = x - this.group.position.x, dz = z - this.group.position.z;
    const yaw = this.group.rotation.y, sin = Math.sin(yaw), cos = Math.cos(yaw);
    return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
  }

  hangarHeight(localZ) {
    if (localZ <= this.dock.toeZ) return this.dock.toeY;
    if (localZ >= this.dock.hatchZ) return this.dock.floorY;
    const p = (localZ - this.dock.toeZ) / (this.dock.hatchZ - this.dock.toeZ);
    return this.dock.toeY + (this.dock.floorY - this.dock.toeY) * p;
  }

  dockingSurface(x, z, terrain) {
    if (this.dock.progress < 0.98) return terrain;
    const local = this.dockingLocal(x, z);
    if (Math.abs(local.x) > this.dock.halfWidth || local.z < this.dock.toeZ - 0.35 || local.z > 0.15) return terrain;
    return Math.max(terrain, this.group.position.y + this.hangarHeight(local.z));
  }

  update(now, active = true) {
    this.group.visible = active;
    this.purge?.update(now, active && this.restorationLevel >= 7, this.group.position.y);
    if (!active) return;
    this._updateRestoration(now);
    const t = now * 0.001;
    /* The habitat mass stays planted; only its sensor crown searches. */
    this.core.position.y = 0;
    /* Keep the final wire-state core registered with the roof. The crown only
       begins its search motion after the eighth module has fully settled. */
    this.crown.rotation.y = this.parts[7].state === 'solid'
      ? Math.sin(t * 0.095) * 0.16 : 0;
    const normalSignal = this.restorationLevel >= 8 ? signalEnvelope(t - 0.90, 3.2) : 0;
    this.beacon.value = this.beaconOverride == null ? normalSignal : this.beaconOverride;
  }
}
