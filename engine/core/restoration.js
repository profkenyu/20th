import * as THREE from 'three';

export const RESTORATION_ITEMS = Object.freeze([
  Object.freeze({ at: 24,  sample: 'FE–NI ORE',          module: 'FOUNDATION',       color: 0xd88435 }),
  Object.freeze({ at: 58,  sample: 'SILICATE',           module: 'LOAD PATHS',       color: 0xc9b58b }),
  Object.freeze({ at: 96,  sample: 'CARBON PHASE',       module: 'SERVICE CELLS',    color: 0x8fa6ad }),
  Object.freeze({ at: 138, sample: 'H₂O ICE',            module: 'PRESSURE HULL',    color: 0xa9d7e2 }),
  Object.freeze({ at: 184, sample: 'RARE EARTH',         module: 'SENSOR VISOR',     color: 0xd0b46d }),
  Object.freeze({ at: 234, sample: 'VOLATILE TRACE',     module: 'TRANSFER BRIDGE',  color: 0xc7d4d2 }),
  Object.freeze({ at: 288, sample: 'CONDUCTIVE LATTICE', module: 'SENSOR CROWN',     color: 0xe2a94b }),
  Object.freeze({ at: 346, sample: 'UNKNOWN ELEMENT',    module: 'SIGNAL CORE',      color: 0xffb21c }),
]);

const clamp01 = value => Math.max(0, Math.min(1, value));
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Eight deterministic surface recoveries. The samples are not a mass budget:
 * each one supplies the missing material signature that fixes one dormant
 * lander module from telemetry wire-state into matter.
 */
export class Restoration {
  constructor(lander) {
    this.lander = lander;
    this.items = RESTORATION_ITEMS;
    this.count = 0;
    this.event = null;
    this.holdUntil = 0;

    this.root = document.getElementById('ti-restoration');
    this.progress = document.getElementById('ti-restoration-progress');
    this.label = document.getElementById('ti-restoration-label');
    this.cells = [...document.querySelectorAll('#ti-restoration-cells i')];

    this.group = new THREE.Group();
    this.group.visible = false;

    this.sampleMaterial = new THREE.MeshBasicMaterial({ color: 0xffb21c });
    this.sample = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), this.sampleMaterial);
    this.sample.rotation.set(0.20, 0.42, 0.14);
    this.group.add(this.sample);

    const ringPositions = [];
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      ringPositions.push(Math.cos(angle), 0, Math.sin(angle));
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPositions, 3));
    this.ringMaterial = new THREE.LineBasicMaterial({
      color: 0xffb21c, transparent: true, opacity: 0.5, depthWrite: false,
    });
    // WebGPU does not support LineLoop. Repeating the first vertex closes the
    // contour while preserving the same visual with a supported line object.
    this.ring = new THREE.Line(ringGeometry, this.ringMaterial);
    this.group.add(this.ring);

    this.particleCount = 64;
    this.positions = new Float32Array(this.particleCount * 3);
    this.origins = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    const particleGeometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(this.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    particleGeometry.setAttribute('position', position);
    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xffb21c, size: 0.055, sizeAttenuation: true,
      transparent: true, opacity: 0.72, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.group.add(this.particles);
    this.reset(0);
  }

  get complete() { return this.count >= this.items.length; }
  get completion() { return this.count / this.items.length; }
  holding(now) { return !!this.event && now < this.holdUntil; }
  snapshot() { return { count: this.count, complete: this.complete }; }

  _syncUi(message = '') {
    if (this.progress) this.progress.textContent = `${this.count} / ${this.items.length}`;
    for (let i = 0; i < this.cells.length; i++) this.cells[i].classList.toggle('on', i < this.count);
    if (this.label) this.label.textContent = message || (this.complete
      ? 'MATERIAL STATE · COMPLETE'
      : this.count ? `${this.items[this.count - 1].module} · MATERIAL FIXED`
                   : 'WIRE STATE · 8 RECOVERY KEYS REQUIRED');
    this.root?.classList.toggle('complete', this.complete);
  }

  _seedParticles(index) {
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, angle = hash(index * 101 + i * 7) * Math.PI * 2;
      const radius = 0.12 + hash(index * 137 + i * 11) * 0.52;
      this.origins[p] = Math.cos(angle) * radius;
      this.origins[p + 1] = hash(index * 149 + i * 13) * 0.18;
      this.origins[p + 2] = Math.sin(angle) * radius;
      this.velocities[p] = Math.cos(angle) * (0.10 + hash(i * 17 + index) * 0.34);
      this.velocities[p + 1] = 0.18 + hash(i * 19 + index) * 0.56;
      this.velocities[p + 2] = Math.sin(angle) * (0.10 + hash(i * 23 + index) * 0.34);
    }
  }

  _begin(v, now) {
    const index = this.count, item = this.items[index];
    const forwardX = -Math.sin(v.heading), forwardZ = -Math.cos(v.heading);
    const rightX = -forwardZ, rightZ = forwardX;
    this.group.position.set(
      v.x + forwardX * 0.45 + rightX * 0.72,
      v.ground + 0.08,
      v.z + forwardZ * 0.45 + rightZ * 0.72,
    );
    this.sampleMaterial.color.setHex(item.color);
    this.ringMaterial.color.setHex(item.color);
    this.particleMaterial.color.setHex(item.color);
    this._seedParticles(index);
    this.event = { index, item, t0: now, committed: false };
    this.holdUntil = now + 4200;
    this.group.visible = true;
    this._syncUi(`SAMPLE ACQUIRED · ${item.sample}`);
    this.root?.classList.add('active');
  }

  acquireAll(v, now = performance.now()) {
    if (this.complete || this.event || !this.lander.restoreAll(now)) return false;
    const forwardX = -Math.sin(v.heading), forwardZ = -Math.cos(v.heading);
    this.group.position.set(v.x + forwardX * 0.35, v.ground + 0.18, v.z + forwardZ * 0.35);
    this.sampleMaterial.color.setHex(0xffb21c);
    this.ringMaterial.color.setHex(0xffb21c);
    this.particleMaterial.color.setHex(0xffb21c);
    this._seedParticles(8);
    this.event = {
      index: 7,
      item: { sample: 'ALL 8 SIGNATURES', module: 'EIGHT MODULES' },
      t0: now,
      committed: true,
      all: true,
    };
    this.count = this.items.length;
    this.holdUntil = now + 4200;
    this.group.visible = true;
    this.root?.classList.add('active');
    this._syncUi('8 SAMPLES ACQUIRED · SIMULTANEOUS');
    return true;
  }

  _animate(now) {
    const age = Math.max(0, (now - this.event.t0) / 1000);
    const appear = clamp01(age / 0.36);
    const dissolve = 1 - clamp01((age - 2.45) / 1.15);
    const envelope = appear * dissolve;
    this.sample.position.y = 0.18 + Math.sin(age * 3.1) * 0.035 + clamp01(age / 1.1) * 0.42;
    this.sample.rotation.y += 0.018;
    this.sample.scale.setScalar(0.72 + envelope * 0.52);
    this.ring.scale.setScalar(0.28 + age * 0.78);
    this.ringMaterial.opacity = envelope * 0.52;
    this.particleMaterial.opacity = envelope * 0.68;
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, phase = (age + hash(i * 31) * 0.58) % 1.25;
      this.positions[p] = this.origins[p] + this.velocities[p] * phase;
      this.positions[p + 1] = this.origins[p + 1] + this.velocities[p + 1] * phase - phase * phase * 0.17;
      this.positions[p + 2] = this.origins[p + 2] + this.velocities[p + 2] * phase;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  update(v, now, active = true) {
    if (!active) { this.group.visible = false; return; }
    if (!this.event) {
      if (!this.complete && v.odometer >= this.items[this.count].at) this._begin(v, now);
      return;
    }
    this.group.visible = true;
    this._animate(now);
    const ageMs = now - this.event.t0;
    if (!this.event.committed && ageMs >= 1180) {
      if (this.lander.restorePart(this.event.index, now)) {
        this.event.committed = true;
        this.count = this.event.index + 1;
        this._syncUi(`${this.event.item.module} · MATERIALISING`);
      }
    }
    if (ageMs >= 4200) {
      const module = this.event.item.module;
      this.event = null;
      this.holdUntil = 0;
      this.group.visible = false;
      this.root?.classList.remove('active');
      this._syncUi(`${module} · MATERIAL FIXED`);
    }
  }

  reset(level = 0) {
    this.count = Math.max(0, Math.min(this.items.length, Math.floor(level)));
    this.event = null;
    this.holdUntil = 0;
    this.group.visible = false;
    this.root?.classList.remove('active');
    this.lander.setRestorationLevel(this.count);
    this._syncUi();
  }
}
