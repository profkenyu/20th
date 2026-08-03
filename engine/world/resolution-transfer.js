/**
 * RESOLUTION TRANSFER — a machine is transmitted in functional order.
 *
 * Departure: antenna/sensors → solar array → running gear → body.
 * Arrival is the exact reverse. Four separately timed point clouds preserve
 * the rover's own graphite, metal and bronze; green survives only as a small
 * link-status core, never as the material of the machine.
 */
import * as THREE from 'three';
import { cfg } from '../config.js';

const PARTS = ['signal', 'panel', 'wheel', 'body'];
const DEPART = {
  signal: [0.00, 0.25], panel: [0.18, 0.50],
  wheel: [0.44, 0.76], body: [0.68, 1.00],
};
const ARRIVE = {
  body: [0.00, 0.34], wheel: [0.22, 0.58],
  panel: [0.50, 0.82], signal: [0.74, 1.00],
};
const COUNTS = {
  high: { signal: 140, panel: 340, wheel: 520, body: 800 },
  mid:  { signal: 90,  panel: 225, wheel: 345, body: 540 },
  low:  { signal: 55,  panel: 135, wheel: 205, body: 325 },
};
const FALLBACK_COLOUR = {
  signal: 0x9aa1a8, panel: 0x6b5235, wheel: 0x242529, body: 0x697079,
};
const DEPART_LIFT = { signal: 0.18, panel: 0.13, wheel: 0.085, body: 0.04 };
const ARRIVAL_DROP = { signal: 1.35, panel: 0.86, wheel: 0.55, body: 0.36 };
const MASS = { signal: 0.08, panel: 0.18, wheel: 0.31, body: 0.43 };

const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const local = (p, range) => smooth((p - range[0]) / (range[1] - range[0]));
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class ResolutionTransferFX {
  constructor(roverGroup) {
    this.rover = roverGroup;
    const grid = cfg().clipmap.grid;
    this.tier = grid >= 600 ? 'high' : grid >= 450 ? 'mid' : 'low';
    this.vortexCount = this.tier === 'high' ? 920 : this.tier === 'mid' ? 620 : 380;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;
    this.clouds = {};
    this.meshes = [];
    this.meshPart = new Map();
    this.originalVisibility = new Map();
    this.rigNodes = [];
    this.rigBase = new Map();
    this.chassis = null;
    this.chassisBaseY = 0;
    this.center = new THREE.Vector3();

    for (const part of PARTS) {
      const count = COUNTS[this.tier][part];
      const base = new Float32Array(count * 3);
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const phase = new Float32Array(count);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size: 1.1, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.visible = false;
      this.clouds[part] = { part, count, base, pos, col, phase, geo, mat, points };
      this.group.add(points);
    }

    this.vortexPos = new Float32Array(this.vortexCount * 3);
    const vortexGeo = new THREE.BufferGeometry();
    vortexGeo.setAttribute('position', new THREE.BufferAttribute(this.vortexPos, 3).setUsage(THREE.DynamicDrawUsage));
    const vortexMat = new THREE.PointsMaterial({
      color: 0x77716d, size: 0.9, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.vortex = new THREE.Points(vortexGeo, vortexMat);
    this.vortex.frustumCulled = false;
    this.vortex.visible = false;

    const coreGeo = new THREE.BufferGeometry();
    this.corePos = new Float32Array(3);
    coreGeo.setAttribute('position', new THREE.BufferAttribute(this.corePos, 3).setUsage(THREE.DynamicDrawUsage));
    const coreMat = new THREE.PointsMaterial({
      color: 0x78b58c, size: 3.8, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Points(coreGeo, coreMat);
    this.core.frustumCulled = false;
    this.core.visible = false;
    this.halos = [];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.RingGeometry(0.985, 1, 128);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9aa1a8, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.frustumCulled = false; ring.visible = false; ring.renderOrder = 8;
      this.halos.push(ring); this.group.add(ring);
    }
    /* A volume, not a ray: the transmission field encloses the complete rover. */
    const axisGeo = new THREE.CylinderGeometry(2.75, 2.75, 10, 64, 1, true);
    const axisMat = new THREE.MeshBasicMaterial({
      color: 0xd9dde2, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.axis = new THREE.Mesh(axisGeo, axisMat);
    this.axis.frustumCulled = false; this.axis.visible = false; this.axis.renderOrder = 8;
    this.group.add(this.vortex, this.axis, this.core);
    this.group.visible = false;

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._ab = new THREE.Vector3();
    this._ac = new THREE.Vector3();
    this._colour = new THREE.Color();
    this._dust = new THREE.Color(0xc88e58);
    this._crimson = new THREE.Color(0xc0152a);
    this.mode = 'idle';
    this.arrivalPending = false;
  }

  partOf(mesh) {
    let node = mesh;
    while (node && node !== this.rover) {
      if (node.userData?.transferPart) return node.userData.transferPart;
      node = node.parent;
    }
    return 'body';
  }

  colourOf(mesh, part) {
    let node = mesh;
    while (node && node !== this.rover) {
      if (node.userData?.transferColor != null) return node.userData.transferColor;
      node = node.parent;
    }
    return FALLBACK_COLOUR[part];
  }

  collectMeshes(saveVisibility) {
    this.meshes.length = 0;
    this.meshPart.clear();
    this.rigNodes.length = 0;
    this.rigBase.clear();
    this.chassis = null;
    if (saveVisibility) this.originalVisibility.clear();
    this.rover.traverse(mesh => {
      if (mesh.userData?.transferChassis) this.chassis = mesh;
      if (mesh.userData?.transferRig) {
        this.rigNodes.push(mesh);
        this.rigBase.set(mesh, mesh.position.clone());
      }
      if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
      const part = this.partOf(mesh);
      this.meshes.push(mesh);
      this.meshPart.set(mesh, part);
      if (saveVisibility) this.originalVisibility.set(mesh, mesh.visible);
    });
    this.chassisBaseY = this.chassis?.position.y ?? 0;
  }

  lockPulse(q) {
    if (q <= 0.54 || q >= 1) return 0;
    const x = (q - 0.54) / 0.46;
    return Math.sin(x * Math.PI * 3) * Math.exp(-x * 3.4);
  }

  chassisOffset(p, arrival) {
    let mass = 0, pulse = 0;
    const windows = arrival ? ARRIVE : DEPART;
    for (const part of PARTS) {
      const q = local(p, windows[part]);
      mass += MASS[part] * q;
      pulse += this.lockPulse(q) * MASS[part];
    }
    if (arrival) return (1 - mass) * 0.19 - pulse * 0.065;
    return mass * 0.18 + pulse * 0.052;
  }

  partVertical(part, q, arrival) {
    if (!arrival) return DEPART_LIFT[part] * smooth(q / 0.42);
    const fall = ARRIVAL_DROP[part] * (1 - smooth((q - 0.28) / 0.72));
    const settle = q > 0.58 ? this.lockPulse(q) * 0.035 : 0;
    return fall + settle;
  }

  applyMechanicalMotion(p, arrival) {
    const chassisY = this.chassisOffset(p, arrival);
    if (this.chassis) this.chassis.position.y = this.chassisBaseY + chassisY;
    const windows = arrival ? ARRIVE : DEPART;
    for (const node of this.rigNodes) {
      const base = this.rigBase.get(node);
      if (!base) continue;
      const part = this.partOf(node);
      const q = local(p, windows[part]);
      node.position.y = base.y + this.partVertical(part, q, arrival);
    }
    return chassisY;
  }

  resetMechanicalPose() {
    if (this.chassis) this.chassis.position.y = this.chassisBaseY;
    for (const [node, base] of this.rigBase) node.position.copy(base);
  }

  trianglesFor(part) {
    const triangles = [];
    let total = 0;
    for (const mesh of this.meshes) {
      if (this.meshPart.get(mesh) !== part || this.originalVisibility.get(mesh) === false) continue;
      const attr = mesh.geometry.attributes.position;
      const index = mesh.geometry.index;
      const triCount = Math.floor((index?.count ?? attr.count) / 3);
      const colour = this.colourOf(mesh, part);
      for (let i = 0; i < triCount; i++) {
        const ia = index ? index.getX(i * 3) : i * 3;
        const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
        const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
        this._a.fromBufferAttribute(attr, ia).applyMatrix4(mesh.matrixWorld);
        this._b.fromBufferAttribute(attr, ib).applyMatrix4(mesh.matrixWorld);
        this._c.fromBufferAttribute(attr, ic).applyMatrix4(mesh.matrixWorld);
        this._ab.subVectors(this._b, this._a);
        this._ac.subVectors(this._c, this._a);
        const area = this._ab.cross(this._ac).length() * 0.5;
        if (area < 1e-9) continue;
        total += area;
        triangles.push({
          ax: this._a.x, ay: this._a.y, az: this._a.z,
          bx: this._b.x, by: this._b.y, bz: this._b.z,
          cx: this._c.x, cy: this._c.y, cz: this._c.z,
          colour, end: total,
        });
      }
    }
    return { triangles, total };
  }

  capture(emergency = false, arrival = false, saveVisibility = false) {
    this.rover.updateMatrixWorld(true);
    this.collectMeshes(saveVisibility);
    this.center.setFromMatrixPosition(this.rover.matrixWorld);

    let globalIndex = 0;
    for (const part of PARTS) {
      const cloud = this.clouds[part];
      const { triangles, total } = this.trianglesFor(part);
      for (let i = 0; i < cloud.count; i++, globalIndex++) {
        const p = i * 3;
        if (!triangles.length || total <= 0) {
          cloud.base[p] = cloud.pos[p] = this.center.x;
          cloud.base[p + 1] = cloud.pos[p + 1] = this.center.y;
          cloud.base[p + 2] = cloud.pos[p + 2] = this.center.z;
          continue;
        }
        const target = hash(globalIndex + 1703) * total;
        let lo = 0, hi = triangles.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (target <= triangles[mid].end) hi = mid; else lo = mid + 1;
        }
        const tri = triangles[lo];
        const root = Math.sqrt(hash(globalIndex + 3301));
        const u = 1 - root;
        const v = root * (1 - hash(globalIndex + 5503));
        const w = 1 - u - v;
        cloud.base[p] = cloud.pos[p] = tri.ax * u + tri.bx * v + tri.cx * w;
        cloud.base[p + 1] = cloud.pos[p + 1] = tri.ay * u + tri.by * v + tri.cy * w;
        cloud.base[p + 2] = cloud.pos[p + 2] = tri.az * u + tri.bz * v + tri.cz * w;
        cloud.phase[i] = hash(globalIndex + 17) * Math.PI * 2;

        this._colour.setHex(tri.colour);
        if (arrival) this._colour.lerp(this._dust, 0.16);
        if (emergency && hash(globalIndex + 401) < 0.065) this._colour.lerp(this._crimson, 0.38);
        cloud.col[p] = this._colour.r;
        cloud.col[p + 1] = this._colour.g;
        cloud.col[p + 2] = this._colour.b;
      }
      cloud.geo.attributes.position.needsUpdate = true;
      cloud.geo.attributes.color.needsUpdate = true;
    }

    this.corePos[0] = this.center.x;
    this.corePos[1] = this.center.y + 0.22;
    this.corePos[2] = this.center.z;
    this.core.geometry.attributes.position.needsUpdate = true;
  }

  beginDeparture(reason) {
    this.emergency = reason === 'power';
    this.mode = 'departure';
    this.capture(this.emergency, false, true);
    this.group.visible = true;
    this.vortex.visible = true;
    this.vortex.material.color.setHex(0x77716d);
    this.core.visible = false;
    this.axis.visible = true;
    this.halos.forEach(ring => { ring.visible = true; ring.material.color.setHex(0x9aa1a8); });
    this.core.material.opacity = 0;
    for (const part of PARTS) {
      const cloud = this.clouds[part];
      cloud.points.visible = false;
      cloud.mat.opacity = 0;
    }
  }

  depart(amount) {
    const p = smooth(amount);
    const chassisY = this.chassisOffset(p, false);
    for (const part of PARTS) {
      const q = local(p, DEPART[part]);
      const cloud = this.clouds[part];
      cloud.points.visible = q > 0 && q < 1;
      const collapse = smooth((q - 0.14) / 0.86);
      const burst = Math.sin(Math.PI * collapse) * (this.emergency ? 0.62 : 0.42);
      const scale = 1 - collapse * 0.982 + burst;
      const spin = (this.emergency ? 5.0 : 3.2) * collapse * Math.PI;
      for (let i = 0; i < cloud.count; i++) {
        const o = i * 3;
        const dx = cloud.base[o] - this.center.x;
        const dz = cloud.base[o + 2] - this.center.z;
        const a = spin * (0.62 + hash(i + PARTS.indexOf(part) * 911) * 0.76);
        const c = Math.cos(a), s = Math.sin(a);
        cloud.pos[o] = this.center.x + (dx * c - dz * s) * scale;
        const liftFade = 1 - smooth((q - 0.30) / 0.70);
        cloud.pos[o + 1] = this.center.y + (cloud.base[o + 1] - this.center.y) * scale
          + chassisY + this.partVertical(part, q, false) * liftFade
          + Math.sin(cloud.phase[i] + q * 10) * 0.025 * q;
        cloud.pos[o + 2] = this.center.z + (dx * s + dz * c) * scale;
      }
      cloud.geo.attributes.position.needsUpdate = true;
      cloud.mat.size = 1.15 + q * (this.emergency ? 9.2 : 7.4);
      cloud.mat.opacity = Math.sin(Math.PI * q) * (this.emergency ? 0.86 : 0.76);
    }
    this.setMeshVisibility(p, false);
    this.applyMechanicalMotion(p, false);
    this.updateVortex(p, false);
    this.updateField(p, false);
    this.core.material.opacity = 0;
    this.core.material.size = 3.2 + p * 2.4;
  }

  blackout(elapsedMs = 0) {
    this.setMeshVisibility(1, false);
    for (const part of PARTS) this.clouds[part].points.visible = false;
    this.vortex.visible = false;
    const fade = 1 - smooth((elapsedMs - 2000) / 600);
    const shimmer = 0.82 + Math.sin(elapsedMs * 0.0091) * 0.11 + Math.sin(elapsedMs * 0.0037 + 1.4) * 0.07;
    this.axis.visible = fade > 0.001;
    this.axis.material.opacity = 0.065 * fade * shimmer;
    const breathe = 0.985 + Math.sin(elapsedMs * 0.0043) * 0.018;
    this.axis.scale.set(breathe, 1, breathe);
    this.halos.forEach(ring => { ring.visible = false; ring.material.opacity = 0; });
    this.core.material.opacity = 0;
    this.core.material.size = 3.4;
    this.resetMechanicalPose();
  }

  beginArrival(reason) {
    this.emergency = reason === 'power';
    this.mode = 'arrival';
    this.arrivalPending = true;
    this.group.visible = false;
  }

  prepareArrival() {
    this.capture(this.emergency, true, false);
    this.group.visible = true;
    this.vortex.visible = true;
    this.vortex.material.color.setHex(0xb77b48);
    this.core.visible = false;
    this.axis.visible = true;
    this.halos.forEach(ring => { ring.visible = true; ring.material.color.setHex(0xc88e58); });
    this.core.material.opacity = 0;
    this.core.material.size = 3.8;
    this.setMeshVisibility(0, true);
    for (const part of PARTS) {
      const cloud = this.clouds[part];
      cloud.points.visible = false;
      cloud.mat.opacity = 0;
    }
    this.arrivalPending = false;
  }

  arrive(amount) {
    if (this.arrivalPending) this.prepareArrival();
    const p = smooth(amount);
    const chassisY = this.chassisOffset(p, true);
    for (const part of PARTS) {
      const q = local(p, ARRIVE[part]);
      const cloud = this.clouds[part];
      cloud.points.visible = q > 0 && q < 1;
      const expand = smooth(q / 0.78);
      const inv = 1 - expand;
      const gather = Math.sin(Math.PI * expand) * (this.emergency ? 0.48 : 0.32);
      const scale = 0.018 + expand * 0.982 + gather;
      const spin = inv * (this.emergency ? 4.2 : 2.8) * Math.PI;
      for (let i = 0; i < cloud.count; i++) {
        const o = i * 3;
        const dx = cloud.base[o] - this.center.x;
        const dz = cloud.base[o + 2] - this.center.z;
        const a = spin * (0.65 + hash(i + PARTS.indexOf(part) * 911) * 0.70);
        const c = Math.cos(a), s = Math.sin(a);
        cloud.pos[o] = this.center.x + (dx * c - dz * s) * scale;
        cloud.pos[o + 1] = this.center.y + (cloud.base[o + 1] - this.center.y) * scale
          + chassisY + this.partVertical(part, q, true)
          + Math.sin(cloud.phase[i] + (1 - q) * 9) * 0.022 * inv;
        cloud.pos[o + 2] = this.center.z + (dx * s + dz * c) * scale;
      }
      cloud.geo.attributes.position.needsUpdate = true;
      cloud.mat.size = 1.15 + (this.emergency ? 10.2 : 8.4) * (1 - q);
      cloud.mat.opacity = Math.sin(Math.PI * q) * (this.emergency ? 0.84 : 0.74);
    }
    this.setMeshVisibility(p, true);
    this.applyMechanicalMotion(p, true);
    this.updateVortex(1 - p, true);
    this.updateField(p, true);
    this.core.material.opacity = 0;
    this.core.material.size = 3.2 + (1 - p) * 1.8;
  }

  updateVortex(amount, reverse) {
    const p = clamp(amount), t = performance.now() * 0.001;
    for (let i = 0; i < this.vortexCount; i++) {
      const o = i * 3, q = hash(i + 33);
      const baseR = 0.55 + hash(i + 77) * 6.4;
      const r = baseR * (reverse ? 0.25 + 0.75 * (1 - p) : 1 - 0.78 * p);
      const a = hash(i + 219) * Math.PI * 2 + t * (0.28 + q * 0.30)
        + (reverse ? -1 : 1) * p * (4 + q * 7);
      this.vortexPos[o] = this.center.x + Math.cos(a) * r;
      this.vortexPos[o + 1] = this.center.y - 0.55 + q * 4.4 + p * (0.24 + hash(i + 123) * 1.25);
      this.vortexPos[o + 2] = this.center.z + Math.sin(a) * r * 0.72;
    }
    this.vortex.geometry.attributes.position.needsUpdate = true;
    this.vortex.material.opacity = Math.sin(Math.PI * p) * (this.emergency ? 0.34 : 0.26);
    this.vortex.material.size = this.emergency ? 1.32 : 1.05;
  }

  updateField(amount, arrival) {
    const p = clamp(amount), now = performance.now();
    this.axis.position.set(this.center.x, this.center.y + 4.1, this.center.z);
    const axisEnvelope = arrival ? (1 - smooth(p / 0.72)) : smooth((p - 0.08) / 0.70) * (1 - smooth((p - 0.90) / 0.10));
    const shimmer = 0.82 + Math.sin(now * 0.0047) * 0.11 + Math.sin(now * 0.0019 + 1.7) * 0.07;
    this.axis.material.opacity = axisEnvelope * (arrival ? 0.075 : 0.090) * shimmer;
    const fieldBreath = 0.97 + Math.sin(p * Math.PI) * 0.035 + Math.sin(now * 0.0026) * 0.012;
    this.axis.scale.set(fieldBreath, 1, fieldBreath);
    for (let i = 0; i < this.halos.length; i++) {
      const ring = this.halos[i];
      const lag = i * 0.095;
      const q = smooth((p - lag) / (1 - lag));
      const radius = arrival ? 8.4 - q * 7.65 : 0.75 + q * 7.65;
      ring.position.set(this.center.x, this.center.y + 0.035 + i * 0.008, this.center.z);
      ring.scale.setScalar(radius);
      ring.material.opacity = Math.sin(Math.PI * q) * (arrival ? 0.070 : 0.055) * (1 - i * 0.14);
    }
  }

  setMeshVisibility(amount, arrival) {
    const p = clamp(amount);
    const windows = arrival ? ARRIVE : DEPART;
    for (const mesh of this.meshes) {
      if (this.originalVisibility.get(mesh) === false) { mesh.visible = false; continue; }
      const q = local(p, windows[this.meshPart.get(mesh) ?? 'body']);
      mesh.visible = arrival ? q >= 0.76 : q < 0.30;
    }
  }

  finish() {
    this.resetMechanicalPose();
    if (this.originalVisibility.size) {
      for (const [mesh, visible] of this.originalVisibility) mesh.visible = visible;
      this.originalVisibility.clear();
    }
    for (const part of PARTS) {
      const cloud = this.clouds[part];
      cloud.points.visible = false;
      cloud.mat.opacity = 0;
      cloud.mat.size = 1.1;
    }
    this.group.visible = false;
    this.vortex.visible = false;
    this.axis.visible = false;
    this.halos.forEach(ring => { ring.visible = false; ring.material.opacity = 0; });
    this.core.visible = false;
    this.arrivalPending = false;
    this.mode = 'idle';
  }
}
