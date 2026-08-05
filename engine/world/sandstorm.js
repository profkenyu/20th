/** Low, sparse aeolian drift for worlds with an atmosphere. */
import * as THREE from 'three';
import { cfg } from '../config.js';

const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Sandstorm {
  constructor(heightAt) {
    this.heightAt = heightAt;
    const grid = cfg().clipmap.grid;
    const tier = grid >= 600 ? 'high' : grid >= 450 ? 'mid' : 'low';
    this.count = tier === 'high' ? 920 : tier === 'mid' ? 620 : 180;
    this.pos = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.pos, 3); attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    const mat = new THREE.PointsMaterial({
      color: 0xb18a7b, size: tier === 'low' ? 1.0 : 0.78,
      transparent: true, opacity: 0.075, depthWrite: false,
      blending: THREE.NormalBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.visible = false;
    this.active = false; this.ready = false;
  }

  setActive(active, probe) {
    this.active = active; this.points.visible = active;
    if (active && probe) this.seed(probe);
  }

  seed(probe) {
    for (let i = 0; i < this.count; i++) this.place(i, probe, true);
    this.points.geometry.attributes.position.needsUpdate = true; this.ready = true;
  }

  place(i, probe, initial = false) {
    const p = i * 3, a = hash(i + 1) * Math.PI * 2;
    const r = (12 + hash(i + 31) * 72) * Math.sqrt(hash(i + 73));
    this.pos[p] = probe.x + Math.cos(a) * r - (initial ? 0 : 48);
    this.pos[p + 2] = probe.z + Math.sin(a) * r;
    this.pos[p + 1] = this.heightAt(this.pos[p], this.pos[p + 2]) + 0.15 + hash(i + 113) * 4.2;
    this.phase[i] = hash(i + 197) * Math.PI * 2;
  }

  update(dt, probe, now) {
    if (!this.active) return;
    if (!this.ready) this.seed(probe);
    const drift = 5.2 * dt, cross = 0.72 * dt;
    /* A weak electrostatic breathing: not a second wind, but a slow change in
       how many charged grains remain optically coherent in the thin air. */
    this.points.material.opacity = 0.062 + (0.5 + 0.5 * Math.sin(now * 0.00023)) * 0.026;
    for (let i = 0; i < this.count; i++) {
      const p = i * 3;
      this.pos[p] += drift;
      this.pos[p + 2] += cross + Math.sin(now * 0.0007 + this.phase[i]) * 0.003;
      this.pos[p + 1] += Math.sin(now * 0.0013 + this.phase[i]) * 0.16 * dt;
      if (this.pos[p] - probe.x > 52 || Math.abs(this.pos[p + 2] - probe.z) > 78) this.place(i, probe);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
