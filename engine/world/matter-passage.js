/**
 * MATTER PASSAGE — sampled matter crosses between two surface states.
 *
 * Unlike ResolutionTransferFX (a short rover-only coordinate recall), this
 * passage samples the production rover AND lander meshes. Surface sampling is
 * an area-weighted CPU operation performed once at each end. Per-frame motion
 * lives in a WebGPU storage buffer and is advanced by one TSL compute pass;
 * Anime.js only authors the bind → dissolve → compress → reconstruct clocks.
 */
import * as THREE from 'three';
import { createTimeline } from 'animejs';
import {
  Fn, attributeArray, instanceIndex, vertexIndex, uniform,
  float, vec3, vec4, normalize, mix, sin, cos, smoothstep,
} from 'three/tsl';
import { cfg } from '../config.js';

const TAU = Math.PI * 2;
const SHARE = Object.freeze({ rover: 0.34, lander: 0.66 });
const COUNTS = Object.freeze({ high: 4600, mid: 3000, low: 1700 });
const FALLBACK = Object.freeze({ rover: 0x7c766f, lander: 0x85898b });

const clamp01 = value => Math.max(0, Math.min(1, value));
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function tierOf() {
  const grid = cfg().clipmap.grid;
  return grid >= 600 ? 'high' : grid >= 450 ? 'mid' : 'low';
}

function transferColour(mesh, fallback) {
  let node = mesh;
  while (node) {
    if (node.userData?.transferColor != null) return node.userData.transferColor;
    node = node.parent;
  }
  const colour = Array.isArray(mesh.material) ? mesh.material[0]?.color : mesh.material?.color;
  if (colour?.isColor && colour.getHex() !== 0xffffff) return colour.getHex();
  return fallback;
}

/** Build an area CDF from the actual transformed surface triangles. */
function surfaceTriangles(root, fallback) {
  root.updateMatrixWorld(true);
  const triangles = [], a = new THREE.Vector3(), b = new THREE.Vector3();
  const c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let total = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData?.matterPassage === false) return;
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    const index = mesh.geometry.index;
    const triCount = Math.floor((index?.count ?? position.count) / 3);
    const colour = transferColour(mesh, fallback);
    for (let triangle = 0; triangle < triCount; triangle++) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3;
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
      if (!Number.isFinite(area) || area < 1e-8) continue;
      total += area;
      triangles.push({
        a: a.clone(), b: b.clone(), c: c.clone(), colour, end: total,
      });
    }
  });
  return { triangles, total };
}

function triangleAt(surface, target) {
  let lo = 0, hi = surface.triangles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (target <= surface.triangles[mid].end) hi = mid;
    else lo = mid + 1;
  }
  return surface.triangles[lo];
}

function sampleSurface(surface, index, position, colour, offset, fallbackPosition) {
  const p = offset * 4;
  if (!surface.triangles.length || surface.total <= 0) {
    position.set([fallbackPosition.x, fallbackPosition.y, fallbackPosition.z, 1], p);
    const fallback = new THREE.Color(0x777777);
    colour.set([fallback.r, fallback.g, fallback.b, 1], p);
    return;
  }
  const triangle = triangleAt(surface, hash(index * 17 + 1703) * surface.total);
  const root = Math.sqrt(hash(index * 19 + 3301));
  const u = 1 - root, v = root * (1 - hash(index * 23 + 5503)), w = 1 - u - v;
  position[p] = triangle.a.x * u + triangle.b.x * v + triangle.c.x * w;
  position[p + 1] = triangle.a.y * u + triangle.b.y * v + triangle.c.y * w;
  position[p + 2] = triangle.a.z * u + triangle.b.z * v + triangle.c.z * w;
  position[p + 3] = 1;
  const c = new THREE.Color(triangle.colour);
  colour[p] = c.r; colour[p + 1] = c.g; colour[p + 2] = c.b; colour[p + 3] = 1;
}

export class MatterPassage {
  constructor({ renderer, rover, lander }) {
    this.renderer = renderer;
    this.roots = { rover, lander };
    this.tier = tierOf();
    this.count = COUNTS[this.tier];
    this.roverCount = Math.round(this.count * SHARE.rover);
    this.state = { bind: 0, dissolve: 0, compress: 0, reconstruct: 0, opacity: 0 };
    this.active = false;
    this.targetReady = false;
    this.hidden = false;
    this.savedVisibility = new Map();
    this.startedAt = 0;
    this.pausedAt = 0;

    this.sourcePosition = attributeArray(this.count, 'vec4');
    this.targetPosition = attributeArray(this.count, 'vec4');
    this.sourceColour = attributeArray(this.count, 'vec4');
    this.targetColour = attributeArray(this.count, 'vec4');
    this.meta = attributeArray(this.count, 'vec4');
    this.live = attributeArray(this.count, 'vec4');

    this.uBind = uniform(0);
    this.uDissolve = uniform(0);
    this.uCompress = uniform(0);
    this.uReconstruct = uniform(0);
    this.uOpacity = uniform(0);
    this.uTargetReady = uniform(0);
    this.uTime = uniform(0);
    this.uCore = uniform(new THREE.Vector3());

    this.compute = Fn(() => {
      const i = instanceIndex;
      const source = this.sourcePosition.element(i).xyz;
      const target = this.targetPosition.element(i).xyz;
      const seed = this.meta.element(i);
      const centre = this.uCore;
      const radial = normalize(vec3(
        source.x.sub(centre.x).add(0.0001),
        source.y.sub(centre.y).mul(0.28).add(0.0001),
        source.z.sub(centre.z).add(0.0001),
      ));
      const phase = seed.x.mul(TAU).add(this.uTime.mul(float(0.42).add(seed.y.mul(0.36))));
      const loosen = smoothstep(0.0, 1.0, this.uDissolve);
      const loose = source.add(radial.mul(loosen.mul(float(0.55).add(seed.z.mul(1.20)))))
        .add(vec3(cos(phase), seed.y.sub(0.5), sin(phase)).mul(loosen.mul(0.22)));
      const coilRadius = float(0.035).add(seed.z.mul(0.18)).mul(float(1).sub(this.uCompress));
      const coil = centre.add(vec3(
        cos(phase.add(this.uCompress.mul(8.0))).mul(coilRadius),
        seed.y.sub(0.5).mul(0.34).mul(float(1).sub(this.uCompress)),
        sin(phase.add(this.uCompress.mul(8.0))).mul(coilRadius),
      ));
      const collapsed = mix(loose, coil, smoothstep(0.0, 1.0, this.uCompress));
      const destination = mix(centre, target, this.uTargetReady);
      const reconstruction = smoothstep(0.0, 1.0, this.uReconstruct);
      const residual = vec3(cos(phase), seed.z.sub(0.5), sin(phase))
        .mul(float(1).sub(reconstruction).mul(0.24));
      const position = mix(collapsed, destination.add(residual), reconstruction);
      const bindEnvelope = float(0.10).add(this.uBind.mul(0.90));
      this.live.element(i).assign(vec4(position, this.uOpacity.mul(bindEnvelope)));
    })().compute(this.count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    const material = new THREE.PointsNodeMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    const live = this.live.element(vertexIndex);
    const sourceColour = this.sourceColour.element(vertexIndex).xyz;
    const targetColour = this.targetColour.element(vertexIndex).xyz;
    const spectral = vec3(0.10, 0.13, 0.16).mul(sin(this.meta.element(vertexIndex).x.mul(TAU)).mul(0.5).add(0.5));
    material.positionNode = live.xyz;
    material.sizeNode = float(this.tier === 'low' ? 1.05 : 1.22).add(this.uCompress.mul(1.8));
    material.colorNode = vec4(
      mix(sourceColour, targetColour, this.uReconstruct).mul(0.78).add(spectral),
      live.w,
    );
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.group = new THREE.Group();
    this.group.name = 'MATTER_PASSAGE_GPU';
    this.group.frustumCulled = false;
    this.group.visible = false;
    this.group.add(this.points);

    this.timeline = createTimeline({ autoplay: false, onComplete: () => this._timelineComplete() });
    this.timeline
      .add(this.state, { bind: 1, opacity: 1, duration: 1800, ease: 'inOut(3)' }, 0)
      .add(this.state, { dissolve: 1, duration: 3600, ease: 'inOut(3)' }, 1100)
      .add(this.state, { compress: 1, duration: 3500, ease: 'inOut(4)' }, 3600)
      .add(this.state, { reconstruct: 1, duration: 5000, ease: 'inOut(4)' }, 7200)
      .add(this.state, { opacity: 0, duration: 2600, ease: 'inOut(2)' }, 12000);
  }

  _counts() {
    return [
      { key: 'rover', start: 0, count: this.roverCount },
      { key: 'lander', start: this.roverCount, count: this.count - this.roverCount },
    ];
  }

  _capture(positionNode, colourNode) {
    const position = positionNode.value.array, colour = colourNode.value.array;
    const meta = this.meta.value.array;
    for (const partition of this._counts()) {
      const root = this.roots[partition.key];
      const fallback = new THREE.Vector3(); root.getWorldPosition(fallback);
      const surface = surfaceTriangles(root, FALLBACK[partition.key]);
      for (let local = 0; local < partition.count; local++) {
        const index = partition.start + local;
        sampleSurface(surface, index, position, colour, index, fallback);
        if (positionNode === this.sourcePosition) {
          const o = index * 4;
          meta[o] = hash(index * 31 + 71);
          meta[o + 1] = hash(index * 37 + 113);
          meta[o + 2] = hash(index * 41 + 191);
          meta[o + 3] = partition.key === 'rover' ? 0 : 1;
        }
      }
    }
    positionNode.value.needsUpdate = true;
    colourNode.value.needsUpdate = true;
    this.meta.value.needsUpdate = true;
  }

  _saveVisibility() {
    this.savedVisibility.clear();
    for (const root of Object.values(this.roots)) root.traverse(object => {
      if (object.isMesh) this.savedVisibility.set(object, object.visible);
    });
  }

  _setSurfaceVisibility(visible) {
    for (const [mesh, wasVisible] of this.savedVisibility) mesh.visible = visible ? wasVisible : false;
    this.hidden = !visible;
  }

  start(now = performance.now()) {
    if (this.active) return false;
    Object.assign(this.state, { bind: 0, dissolve: 0, compress: 0, reconstruct: 0, opacity: 0 });
    this._saveVisibility();
    this._capture(this.sourcePosition, this.sourceColour);
    this.uCore.value.copy(this.roots.lander.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 2.8, 0));
    this.targetReady = false;
    this.pausedAt = 0;
    this.uTargetReady.value = 0;
    this.active = true; this.hidden = false; this.startedAt = now;
    this.group.visible = true;
    this.timeline.restart();
    return true;
  }

  captureTarget() {
    if (!this.active) return false;
    /* Voyage deliberately shrinks the departing silhouette. Arrival samples
       must describe the full-scale reconstructed machines, not that temporary
       flight transform. */
    const scales = new Map();
    for (const root of Object.values(this.roots)) {
      scales.set(root, root.scale.clone()); root.scale.set(1, 1, 1);
    }
    this._capture(this.targetPosition, this.targetColour);
    for (const [root, scale] of scales) root.scale.copy(scale);
    this.uCore.value.copy(this.roots.lander.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 2.8, 0));
    this.targetReady = true;
    this.uTargetReady.value = 1;
    /* Destination preparation legitimately rewrites part visibility. Keep the
       solid state absent until reconstruction reaches its locking threshold. */
    this._setSurfaceVisibility(false);
    return true;
  }

  async update(now = performance.now()) {
    if (!this.active) return;
    this.uBind.value = clamp01(this.state.bind);
    this.uDissolve.value = clamp01(this.state.dissolve);
    this.uCompress.value = clamp01(this.state.compress);
    this.uReconstruct.value = clamp01(this.state.reconstruct);
    this.uOpacity.value = clamp01(this.state.opacity);
    this.uTime.value = Math.max(0, (now - this.startedAt) / 1000);
    if (!this.hidden && this.state.dissolve >= 0.58) this._setSurfaceVisibility(false);
    if (this.hidden && this.targetReady && this.state.reconstruct >= 0.76) this._setSurfaceVisibility(true);
    await this.renderer.computeAsync(this.compute);
  }

  /** Compile the later transfer compute pipeline during the prologue. The
      zeroed buffers make this preflight visually inert and deterministic. */
  async prewarm() {
    await this.renderer.computeAsync(this.compute);
  }

  suspend(now = performance.now()) {
    if (!this.active || this.pausedAt) return;
    this.pausedAt = now;
    this.timeline.pause();
  }

  resume(now = performance.now()) {
    if (!this.active || !this.pausedAt) return;
    this.startedAt += now - this.pausedAt;
    this.pausedAt = 0;
    this.timeline.resume();
  }

  _timelineComplete() {
    /* Voyage owns the exact phase boundary; leave restoration visible but
       retain active=true until finish() performs deterministic cleanup. */
    if (this.hidden && this.targetReady) this._setSurfaceVisibility(true);
    this.group.visible = false;
  }

  snapshot() {
    return {
      active: this.active, targetReady: this.targetReady, particles: this.count,
      phase: !this.active ? 'inactive'
        : this.state.reconstruct > 0 ? 'reconstruct'
        : this.state.compress > 0 ? 'compress'
          : this.state.dissolve > 0 ? 'dissolve' : 'bind',
    };
  }

  finish() {
    this.timeline.pause();
    if (this.savedVisibility.size) this._setSurfaceVisibility(true);
    this.savedVisibility.clear();
    this.group.visible = false;
    this.active = false; this.hidden = false; this.targetReady = false;
    this.pausedAt = 0;
    this.uOpacity.value = 0; this.uTargetReady.value = 0;
  }
}
