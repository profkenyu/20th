import * as THREE from 'three';
import {
  Fn, float, uniform, vec3, vec4, normalize, dot, abs, pow,
  cameraPosition, normalWorld, positionWorld,
} from 'three/tsl';

export const RESTORATION_ITEMS = Object.freeze([
  Object.freeze({ at: 24,  sample: 'FE–NI ORE',          module: 'FOUNDATION',       color: 0xd88435, sign: 'METALLIC REFLECTANCE' }),
  Object.freeze({ at: 58,  sample: 'SILICATE',           module: 'LOAD PATHS',       color: 0xc9b58b, sign: 'SPECTRAL SPLIT' }),
  Object.freeze({ at: 96,  sample: 'CARBON PHASE',       module: 'SERVICE CELLS',    color: 0x8fa6ad, sign: 'LOW ALBEDO DENSITY' }),
  Object.freeze({ at: 138, sample: 'H₂O ICE',            module: 'PRESSURE HULL',    color: 0xa9d7e2, sign: 'COOLING SHADOW' }),
  Object.freeze({ at: 184, sample: 'RARE EARTH',         module: 'SENSOR VISOR',     color: 0xd0b46d, sign: 'SPECULAR BANDING' }),
  Object.freeze({ at: 234, sample: 'VOLATILE TRACE',     module: 'TRANSFER BRIDGE',  color: 0xc7d4d2, sign: 'PARTICLE DENSITY' }),
  Object.freeze({ at: 288, sample: 'CONDUCTIVE LATTICE', module: 'SENSOR CROWN',     color: 0xe2a94b, sign: 'METALLIC LATTICE' }),
  Object.freeze({ at: 346, sample: 'UNKNOWN ELEMENT',    module: 'SIGNAL CORE',      color: 0xffb21c, sign: 'FULL-SPECTRUM RING' }),
]);

const clamp01 = value => Math.max(0, Math.min(1, value));
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* The world contains no scene lights. Metallic evidence therefore carries a
   compact view-dependent reflectance model of its own: a dark base, a narrow
   face glint and a cool grazing return. It is an optical symptom on the real
   surface, not an emissive pickup icon. */
function reflectiveMaterial(hex, roughness = 0.3) {
  const base = uniform(new THREE.Color(hex));
  const material = new THREE.MeshBasicNodeMaterial();
  material.userData.baseColor = base;
  material.colorNode = Fn(() => {
    const view = normalize(cameraPosition.sub(positionWorld));
    const facing = abs(dot(normalize(normalWorld), view));
    const faceGlint = pow(facing, float(18 + roughness * 20)).mul(0.72 - roughness * 0.34);
    const edge = pow(float(1).sub(facing), float(1.8 + roughness * 2.4)).mul(0.34);
    const colour = base.mul(facing.mul(0.46).add(0.10))
      .add(vec3(0.76, 0.86, 0.94).mul(edge.add(faceGlint)));
    return vec4(colour, 1.0);
  })();
  return material;
}

/**
 * Eight deterministic surface recoveries. The samples are not a mass budget:
 * each one supplies the missing material signature that fixes one dormant
 * lander module from telemetry wire-state into matter.
 */
export class Restoration {
  constructor(lander, heightAt = () => 0, sites = []) {
    this.lander = lander;
    this.heightAt = heightAt;
    this.siteData = sites;
    this.items = RESTORATION_ITEMS;
    this.count = 0;
    this.event = null;
    this.holdUntil = 0;

    this.root = document.getElementById('ti-restoration');
    this.progress = document.getElementById('ti-restoration-progress');
    this.label = document.getElementById('ti-restoration-label');
    this.cells = [...document.querySelectorAll('#ti-restoration-cells i')];

    this.group = new THREE.Group();
    this.group.visible = true;

    this.siteGroup = new THREE.Group();
    this.group.add(this.siteGroup);
    this.sites = [];
    this._buildSites();

    this.sampleMaterial = reflectiveMaterial(0xffb21c, 0.24);
    this.sample = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.24), this.sampleMaterial);
    this.sample.rotation.set(0.20, 0.42, 0.14);
    this.sample.visible = false;
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
    this.ring.visible = false;
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
    this.particles.visible = false;
    this.group.add(this.particles);
    this.reset(0);
  }

  _buildSites() {
    const shardGeometry = new THREE.IcosahedronGeometry(0.18, 0);
    const ringGeometry = new THREE.RingGeometry(0.48, 0.50, 64);
    const shadowGeometry = new THREE.CircleGeometry(1.25, 40);
    for (let index = 0; index < this.items.length; index++) {
      const data = this.siteData[index];
      if (!data) continue;
      const item = this.items[index], root = new THREE.Group();
      const y = this.heightAt(data.x, data.z);
      root.position.set(data.x, y + 0.018, data.z);
      root.rotation.y = data.bearing ?? 0;

      const cool = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({
        color: index === 3 ? 0x6a93a8 : 0x17252a, transparent: true,
        opacity: index === 3 ? 0.18 : 0.07, depthWrite: false,
      }));
      cool.rotation.x = -Math.PI / 2;
      cool.scale.set(1.25, 0.55 + hash(index * 23) * 0.32, 1);
      root.add(cool);

      const metal = reflectiveMaterial(item.color, index === 0 || index === 6 ? 0.16 : 0.34);
      for (let j = 0; j < 7; j++) {
        const a = hash(index * 71 + j * 13) * Math.PI * 2;
        const r = 0.16 + hash(index * 89 + j * 17) * 0.72;
        const shard = new THREE.Mesh(shardGeometry, metal);
        shard.position.set(Math.cos(a) * r, 0.06 + hash(j * 31 + index) * 0.15, Math.sin(a) * r * 0.62);
        shard.scale.set(0.45 + hash(j * 37) * 1.2, 0.16 + hash(j * 41) * 0.42, 0.35 + hash(j * 43) * 0.9);
        shard.rotation.set(hash(j * 47) * 2, a, hash(j * 53) * 2);
        root.add(shard);
      }

      const spectra = [];
      for (let j = 0; j < 3; j++) {
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
          color: [item.color, 0x8aa5b8, 0xc0152a][j], transparent: true,
          opacity: 0.07 + (index === 1 || index === 7 ? 0.06 : 0), depthWrite: false,
          blending: THREE.AdditiveBlending,
        }));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.82 + j * 0.42);
        ring.position.y = 0.012 + j * 0.006;
        root.add(ring); spectra.push(ring);
      }

      const count = 26 + index * 4, positions = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) {
        const a = hash(index * 131 + j * 19) * Math.PI * 2;
        const r = 0.25 + hash(index * 151 + j * 29) * 1.15;
        positions[j * 3] = Math.cos(a) * r;
        positions[j * 3 + 1] = 0.04 + hash(index * 173 + j * 31) * (index === 5 ? 0.75 : 0.30);
        positions[j * 3 + 2] = Math.sin(a) * r * 0.7;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(pg, new THREE.PointsMaterial({
        color: item.color, size: index === 5 ? 0.042 : 0.026, sizeAttenuation: true,
        transparent: true, opacity: index === 5 ? 0.42 : 0.18, depthWrite: false,
      }));
      root.add(particles);
      this.siteGroup.add(root);
      this.sites.push({ root, spectra, particles, data, acquired: false });
    }
  }

  get complete() { return this.count >= this.items.length; }
  get completion() { return this.count / this.items.length; }
  holding(now) { return !!this.event && now < this.holdUntil; }
  get target() { return this.sites[this.count]?.data ?? null; }
  get scanFocus() { return this.event ? this.sites[this.event.index]?.data ?? null : null; }
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
    const site = this.sites[index];
    this.sampleBaseY = this.heightAt(site.data.x, site.data.z) + 0.24;
    this.sample.position.set(site.data.x, this.sampleBaseY, site.data.z);
    this.ring.position.set(site.data.x, this.heightAt(site.data.x, site.data.z) + 0.04, site.data.z);
    this.particles.position.set(site.data.x, this.heightAt(site.data.x, site.data.z) + 0.04, site.data.z);
    /* The grounded shards remain the specimen. Only spectrum integration and
       disturbed local particles appear during acquisition; no floating loot
       token is introduced above the geology. */
    this.sample.visible = false;
    this.ring.visible = this.particles.visible = true;
    this.sampleMaterial.userData.baseColor.value.setHex(item.color);
    this.ringMaterial.color.setHex(item.color);
    this.particleMaterial.color.setHex(item.color);
    this._seedParticles(index);
    this.event = { index, item, t0: now, committed: false };
    this.holdUntil = now + 4200;
    this._syncUi(`SCANNING · ${item.sign}`);
    this.root?.classList.add('active');
  }

  acquireAll(v, now = performance.now()) {
    if (this.complete || this.event || !this.lander.restoreAll(now)) return false;
    const forwardX = -Math.sin(v.heading), forwardZ = -Math.cos(v.heading);
    this.sample.position.set(v.x + forwardX * 0.35, v.ground + 0.18, v.z + forwardZ * 0.35);
    this.sampleBaseY = this.sample.position.y;
    this.ring.position.copy(this.sample.position); this.ring.position.y -= 0.12;
    this.particles.position.copy(this.ring.position);
    this.sample.visible = false;
    this.ring.visible = this.particles.visible = true;
    this.sampleMaterial.userData.baseColor.value.setHex(0xffb21c);
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
    this.sample.position.y = this.sampleBaseY + Math.sin(age * 3.1) * 0.035 + clamp01(age / 1.1) * 0.18;
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
    this.group.visible = active;
    if (!active) return;
    for (let i = 0; i < this.sites.length; i++) {
      const site = this.sites[i], breathe = 0.78 + Math.sin(now * 0.0012 + i * 1.7) * 0.22;
      site.root.visible = i >= this.count;
      for (const ring of site.spectra) ring.material.opacity = (i === this.count ? 0.10 : 0.035) * breathe;
      site.particles.material.opacity = (i === 5 ? 0.38 : 0.14) * breathe;
    }
    if (!this.event) {
      const target = this.target;
      if (!this.complete && target && Math.hypot(v.x - target.x, v.z - target.z) <= 4.8) this._begin(v, now);
      return;
    }
    const site = this.sites[this.event.index];
    if (!site || Math.hypot(v.x - site.data.x, v.z - site.data.z) > 6.2) {
      this.event = null; this.holdUntil = 0; this.root?.classList.remove('active');
      this.sample.visible = this.ring.visible = this.particles.visible = false;
      this._syncUi('SCAN INTERRUPTED · REAPPROACH SIGNATURE');
      return;
    }
    this._animate(now);
    const ageMs = now - this.event.t0;
    if (!this.event.committed && ageMs >= 2600) {
      if (this.lander.restorePart(this.event.index, now)) {
        this.event.committed = true;
        this.count = this.event.index + 1;
        site.acquired = true;
        this._syncUi(`SAMPLE ACQUIRED · ${this.event.item.sample}`);
      }
    }
    if (ageMs >= 4200) {
      const module = this.event.item.module;
      this.event = null;
      this.holdUntil = 0;
      this.sample.visible = this.ring.visible = this.particles.visible = false;
      this.root?.classList.remove('active');
      this._syncUi(`${module} · MATERIAL FIXED`);
    }
  }

  reset(level = 0) {
    this.count = Math.max(0, Math.min(this.items.length, Math.floor(level)));
    this.event = null;
    this.holdUntil = 0;
    this.group.visible = true;
    this.sample.visible = this.ring.visible = this.particles.visible = false;
    this.root?.classList.remove('active');
    this.lander.setRestorationLevel(this.count);
    for (let i = 0; i < this.sites.length; i++) this.sites[i].root.visible = i >= this.count;
    this._syncUi();
  }
}
