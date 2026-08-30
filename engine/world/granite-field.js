/**
 * GRANITE FIELD — sparse, world-anchored clasts for lithic planets.
 *
 * The clipmap supplies every load-bearing outcrop. These instances are the
 * smaller loose stones that give the plain scale; keeping them non-colliding
 * prevents decorative geometry from disagreeing with wheel contact. Absolute
 * lattice cells make the pattern stable while the render field recentres.
 */
import * as THREE from 'three';
import { float, vec3, mix, sin, abs, pow, dot, normalize, saturate, normalWorld, positionWorld } from 'three/tsl';
import { cfg } from '../config.js';

const fract = x => x - Math.floor(x);
const hash2 = (x, z, salt) => fract(Math.sin(x * 127.1 + z * 311.7 + salt * 74.73) * 43758.5453);

export class GraniteField {
  constructor(heightAt) {
    this.heightAt = heightAt;
    const grid = cfg().clipmap.grid;
    this.radius = grid >= 600 ? 21 : grid >= 450 ? 18 : 15;
    this.cell = grid >= 600 ? 15.5 : 18.0;
    this.capacity = (this.radius * 2 + 1) ** 2;
    this.anchorX = Infinity; this.anchorZ = Infinity;

    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshBasicNodeMaterial();
    const sun = cfg().sun, sl = Math.hypot(...sun) || 1;
    const ndl = saturate(dot(normalize(normalWorld), vec3(sun[0] / sl, sun[1] / sl, sun[2] / sl)));
    const fleck = sin(positionWorld.x.mul(2.17).add(positionWorld.z.mul(2.83)))
      .mul(0.5).add(0.5);
    const quartz = pow(abs(sin(positionWorld.x.mul(5.41).sub(positionWorld.z.mul(3.73)))), 14.0);
    const mica = pow(abs(sin(positionWorld.x.mul(9.17).add(positionWorld.y.mul(11.3)))), 24.0);
    const stone = mix(vec3(0.052, 0.058, 0.064), vec3(0.225, 0.204, 0.218), fleck.mul(0.34))
      .add(vec3(0.20, 0.23, 0.25).mul(quartz.mul(0.25)))
      .add(vec3(0.34, 0.32, 0.38).mul(mica.mul(0.18)));
    material.colorNode = stone.mul(ndl.mul(0.92).add(float(0.16)));

    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.count = 0;
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.scale = new THREE.Vector3();
    this.active = false;
    const triangleCount = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    this.stats = { instances: 0, triangles: triangleCount };
  }

  setActive(active, probe) {
    this.active = active;
    this.mesh.visible = active;
    if (active && probe) this.syncTo(probe.x, probe.z, true);
  }

  syncTo(x, z, force = false) {
    if (!this.active) return false;
    const stride = 6;
    const ax = Math.floor(x / (this.cell * stride)) * stride;
    const az = Math.floor(z / (this.cell * stride)) * stride;
    if (!force && ax === this.anchorX && az === this.anchorZ) return false;
    this.anchorX = ax; this.anchorZ = az;

    let n = 0;
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const ix = ax + dx, iz = az + dz;
        if (hash2(ix, iz, 1) < 0.43) continue;
        const px = (ix + 0.16 + hash2(ix, iz, 2) * 0.68) * this.cell;
        const pz = (iz + 0.16 + hash2(ix, iz, 3) * 0.68) * this.cell;
        const rare = hash2(ix, iz, 4) > 0.945;
        const sx = rare ? 0.62 + hash2(ix, iz, 5) * 0.72 : 0.13 + hash2(ix, iz, 5) * 0.34;
        const sz = sx * (0.74 + hash2(ix, iz, 6) * 0.52);
        /* Granite clasts split along pre-existing joints: broad in plan and
           compressed vertically, with rare blocky tors rather than spheres. */
        const sy = sx * (rare ? 0.28 + hash2(ix, iz, 7) * 0.22 : 0.24 + hash2(ix, iz, 7) * 0.25);
        this.position.set(px, this.heightAt(px, pz) + sy * 0.72, pz);
        this.euler.set(hash2(ix, iz, 8) * 0.24, hash2(ix, iz, 9) * Math.PI * 2, hash2(ix, iz, 10) * 0.20);
        this.rotation.setFromEuler(this.euler);
        this.scale.set(sx, sy, sz);
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.mesh.setMatrixAt(n++, this.matrix);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.stats.instances = n;
    return true;
  }
}
