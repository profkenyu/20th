import * as THREE from "three";
import { cfg } from "../config.js";
export class Dust {
  constructor(heightAt) {
    const D = cfg().dust;
    this.max = D.maxParticles;
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.heightAt = heightAt;
    this.cursor = 0;
    this.carry = 0;
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -1e6;
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);
    geo.setDrawRange(0, this.max);
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(...D.color),
      size: D.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: D.opacity,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  emit(source, heading, speed, severity) {
    const D = cfg().dust;
    const i = this.cursor++ % this.max;
    const p = i * 3;
    const a = (i * 2.399963229728653 + performance.now() * 17e-4) % (Math.PI * 2);
    const spread = (Math.sin(a * 1.73) + Math.cos(a * 0.61)) * 0.5;
    const forwardX = -Math.sin(heading), forwardZ = -Math.cos(heading);
    const sideX = -forwardZ, sideZ = forwardX;
    const kick = D.kickBase + speed * D.kickSpeed + severity * D.kickShock;
    this.pos[p] = source.x - forwardX * 0.1 + sideX * spread * D.spread;
    this.pos[p + 1] = source.y + D.releaseHeight;
    this.pos[p + 2] = source.z - forwardZ * 0.1 + sideZ * spread * D.spread;
    this.vel[p] = -forwardX * kick + sideX * spread * D.lateral;
    this.vel[p + 1] = D.liftBase + Math.abs(spread) * D.liftVariance + severity * D.liftShock;
    this.vel[p + 2] = -forwardZ * kick + sideZ * spread * D.lateral;
    this.life[i] = D.life;
  }
  clear() {
    this.life.fill(0);
    this.vel.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -1e6;
    this.carry = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  landingBurst(source, intensity = 1) {
    const D = cfg().dust;
    const count = Math.min(this.max, Math.round((this.max < 180 ? 72 : 126) * intensity));
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.max, p = i * 3;
      const seed = i + this.cursor * 1.618 + n * 7.31;
      const a = seed * 2.399963229728653 % (Math.PI * 2);
      const radius = 0.5 + (Math.sin(seed * 12.9898) * 43758.5453 % 1 + 1) % 1 * 1.9;
      const speed = 3 + (Math.sin(seed * 4.17) * 15731.743 % 1 + 1) % 1 * 6;
      this.pos[p] = source.x + Math.cos(a) * radius;
      this.pos[p + 1] = this.heightAt(this.pos[p], source.z + Math.sin(a) * radius) + 0.045;
      this.pos[p + 2] = source.z + Math.sin(a) * radius;
      this.vel[p] = Math.cos(a) * speed;
      this.vel[p + 1] = 0.2 + (Math.sin(seed * 8.31) * 9631.417 % 1 + 1) % 1 * 1;
      this.vel[p + 2] = Math.sin(a) * speed;
      this.life[i] = Math.min(D.life, 0.15 + (Math.sin(seed * 3.73) * 7919.123 % 1 + 1) % 1 * 0.55);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  update(dt, probe) {
    const D = cfg().dust;
    const moving = Math.max(0, probe.speed - D.minSpeed);
    const rate = moving * D.emitPerMetre * (1 + probe.slam * D.slamBoost);
    this.carry += rate * dt;
    const count = Math.min(D.maxEmitPerFrame, Math.floor(this.carry));
    this.carry -= count;
    if (count && probe.wheelContacts?.length) {
      for (let n = 0; n < count; n++) {
        const source = probe.wheelContacts[(this.cursor + n * 3) % probe.wheelContacts.length];
        this.emit(source, probe.heading, probe.speed, probe.slam);
      }
    }
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const p = i * 3;
      this.life[i] -= dt;
      this.vel[p + 1] -= D.gravity * dt;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
      if (this.life[i] <= 0 || this.pos[p + 1] <= this.heightAt(this.pos[p], this.pos[p + 2]) + 0.012) {
        this.life[i] = 0;
        this.pos[p + 1] = -1e6;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
