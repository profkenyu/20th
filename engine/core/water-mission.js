import * as THREE from "three";
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const OBSERVATION_COUNT = 3;
const OBSERVATION_GAP_MS = 900;
export class WaterMission {
  constructor(heightAt, site, onConfirmed = null) {
    this.heightAt = heightAt;
    this.site = site;
    this.onConfirmed = onConfirmed;
    this.state = "inactive";
    this.event = null;
    this.confirmedAt = 0;
    this.observations = 0;
    this.lastDistance = Infinity;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.position.set(site.x, heightAt(site.x, site.z) + 0.025, site.z);
    this.group.rotation.y = site.bearing ?? 0;
    const fragmentGeometry = new THREE.IcosahedronGeometry(0.21, 1);
    const fragmentMaterial = new THREE.MeshBasicMaterial({ color: 660762 });
    for (let i = 0; i < 17; i++) {
      const a = hash(i * 17 + 2) * Math.PI * 2;
      const r = 0.18 + hash(i * 23 + 5) * 1.62;
      const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
      fragment.position.set(
        Math.cos(a) * r,
        0.025 + hash(i * 31) * 0.08,
        Math.sin(a) * r * 0.62
      );
      fragment.scale.set(
        0.35 + hash(i * 41) * 1.15,
        0.12 + hash(i * 43) * 0.26,
        0.3 + hash(i * 47) * 0.94
      );
      fragment.rotation.set(hash(i * 53), a, hash(i * 59));
      this.group.add(fragment);
    }
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8 + i * 0.39, 0.815 + i * 0.39, 96),
        new THREE.MeshBasicMaterial({
          color: [7315379, 11129301, 12588330][i],
          transparent: true,
          opacity: 0.025,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012 + i * 5e-3;
      ring.scale.y = 0.68;
      this.group.add(ring);
      this.rings.push(ring);
    }
    this.particleCount = 72;
    this.positions = new Float32Array(this.particleCount * 3);
    this.origins = new Float32Array(this.particleCount * 3);
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, a = hash(i * 71 + 11) * Math.PI * 2;
      const r = 0.22 + hash(i * 73 + 19) * 2.05;
      this.origins[p] = Math.cos(a) * r;
      this.origins[p + 1] = 0.04 + hash(i * 79 + 23) * 0.34;
      this.origins[p + 2] = Math.sin(a) * r * 0.68;
      this.positions[p] = this.origins[p];
      this.positions[p + 1] = this.origins[p + 1];
      this.positions[p + 2] = this.origins[p + 2];
    }
    const particleGeometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(this.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    particleGeometry.setAttribute("position", position);
    this.particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
      color: 9354696,
      size: 0.028,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    }));
    this.group.add(this.particles);
  }
  get active() {
    return this.state !== "inactive" && this.state !== "confirmed";
  }
  get complete() {
    return this.state === "confirmed";
  }
  get target() {
    return this.active ? this.site : null;
  }
  get scanFocus() {
    return this.event ? this.site : null;
  }
  snapshot() {
    return { state: this.state, complete: this.complete, distance: this.lastDistance, observations: this.observations, requiredObservations: OBSERVATION_COUNT };
  }
  activate(now = performance.now()) {
    this.observations = 0;
    this.state = "searching";
    this.event = null;
    this.confirmedAt = 0;
    this.lastDistance = Infinity;
    this.group.visible = true;
    this.rings.forEach((ring) => {
      ring.material.opacity = 0.025;
    });
    this.particles.material.opacity = 0.16;
    this.startedAt = now;
  }
  reset() {
    this.observations = 0;
    this.state = "inactive";
    this.event = null;
    this.confirmedAt = 0;
    this.lastDistance = Infinity;
    this.group.visible = false;
  }
  shouldHold(probe) {
    if (!this.active || !probe) return false;
    return Math.hypot(probe.x - this.site.x, probe.z - this.site.z) <= this.site.acquireRadius + 0.35;
  }
  forceAcquire(now = performance.now()) {
    if (!this.active) return false;
    this.event = { t0: now - this.site.scanHoldMs, forced: true };
    this._confirm(now);
    return true;
  }
  _confirm(now) {
    if (this.complete) return;
    this.state = "confirmed";
    this.observations = OBSERVATION_COUNT;
    this.confirmedAt = now;
    this.event = null;
    this.rings.forEach((ring, i) => {
      ring.material.opacity = 0.12 - i * 0.018;
    });
    this.particles.material.opacity = 0.08;
    this.onConfirmed?.(this.site, now);
  }
  update(probe, now, worldActive = true) {
    this.group.visible = worldActive && this.state !== "inactive";
    if (!this.group.visible) return;
    const dx = probe.x - this.site.x, dz = probe.z - this.site.z;
    this.lastDistance = Math.hypot(dx, dz);
    const passMs = this.site.scanHoldMs / OBSERVATION_COUNT;
    const elapsed = this.event ? Math.max(0, now - this.event.t0) : 0;
    const pass = Math.min(OBSERVATION_COUNT - 1, Math.floor(elapsed / (passMs + OBSERVATION_GAP_MS)));
    const passProgress = this.event ? clamp01((elapsed - pass * (passMs + OBSERVATION_GAP_MS)) / passMs) : 0;
    if (this.complete) this.observations = OBSERVATION_COUNT;
    else if (this.event) this.observations = pass + (passProgress >= 1 ? 1 : 0);
    else this.observations = 0;

    const integration = this.complete ? 1 : (pass + passProgress) / OBSERVATION_COUNT;
    this._updateVisuals(now * 1e-3, integration, pass, passProgress);

    if (this.complete) return;
    if (this.event) {
      const totalScanMs = this.site.scanHoldMs + OBSERVATION_GAP_MS * (OBSERVATION_COUNT - 1);
      if (this.lastDistance > this.site.scanRadius) {
        this.event = null;
        this.state = "searching";
      } else if (elapsed >= totalScanMs) {
        this._confirm(now);
      }
      return;
    }
    if (this.lastDistance <= this.site.acquireRadius && probe.speed <= 0.12) {
      this.event = { t0: now };
      this.state = "scanning";
    }
  }

  _updateVisuals(t, integration, pass, passProgress) {
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, phase = t * (0.28 + i % 7 * 0.017) + i * 1.73;
      const density = 1 - integration * 0.27;
      this.positions[p] = this.origins[p] * density;
      this.positions[p + 1] = this.origins[p + 1] + Math.sin(phase) * (0.012 + integration * 0.035);
      this.positions[p + 2] = this.origins[p + 2] * density;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.rings.forEach((ring, i) => {
      const stable = i < this.observations;
      ring.material.opacity = stable ? 0.09 - i * 0.012 : 0.015 + (this.event && i === pass ? passProgress * 0.07 : 0);
      ring.scale.set(stable ? 1 : 1 + Math.sin(t * 0.36 + i) * 0.012, 0.68, 1);
    });
  }
}
