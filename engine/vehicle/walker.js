/**
 * WALKER — the only body on this planet.
 *
 * Ground contact is evaluated on the CPU (heightCPU.js) because it must be
 * known before the frame is submitted, and a GPU readback is a round trip.
 * The eye is critically damped toward the surface so that stepping over a
 * rubble field does not read as a camera fault.
 *
 * Auto-advance exists to verify clipmap recentring hands-free. Sprint exists
 * to break it: 15 m/s forces a recompute roughly four times a second.
 */

import * as THREE from 'three';
import { cfg } from '../config.js';
import { lapseAt } from '../tsl/relativity.js';

export class Walker {
  constructor(camera, dom, heightAt) {
    this.h = heightAt;
    this.camera = camera;
    this.yaw = 0.6;
    this.pitch = -0.045;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.eyeSmooth = null;
    this.keys = new Set();
    this.auto = matchMedia('(pointer: coarse)').matches;
    this.sprinting = false;

    let dragging = false, lx = 0, ly = 0;

    dom.addEventListener('pointerdown', e => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('pointercancel', () => { dragging = false; });
    dom.addEventListener('pointermove', e => {
      if (!dragging) return;
      this.yaw -= (e.clientX - lx) * cfg().vehicle.lookSpeed;
      this.pitch = clamp(this.pitch - (e.clientY - ly) * cfg().vehicle.lookSpeed, -0.62, 0.42);
      lx = e.clientX; ly = e.clientY;
    }, { passive: true });

    addEventListener('keydown', e => {
      if (e.code === 'Space') { this.auto = !this.auto; e.preventDefault(); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  update(dt) {
    const k = this.keys;
    this.sprinting = k.has('ShiftLeft') || k.has('ShiftRight');
    /* ── the horizon is an event, not a wall ──────────────────────────
       Coordinate speed scales by the lapse √(1 − rs/r). At 620 m that is
       0.967 and costs nothing; at 45 m it is 0.333; at 40.01 m it is 0.016.
       The walker therefore approaches the horizon asymptotically and never
       crosses it — in FINITE COORDINATE TIME, which is exactly what the
       metric says for a distant description of an infalling body.

       Nothing blocks the way. No trigger fires. The geometry simply takes
       longer and longer, and that is the whole statement. */
    this.radius = Math.hypot(this.pos.x, this.pos.z);
    this.lapse = lapseAt(this.radius);
    const speed = (this.sprinting ? cfg().vehicle.boost : cfg().vehicle.cruise) * Math.max(0.004, this.lapse);

    let fwd = 0, side = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) side -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) side += 1;
    if (this.auto && fwd === 0 && side === 0) fwd = 1;

    if (fwd || side) {
      const len = Math.hypot(fwd, side);
      const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
      this.pos.x += ((-sx * fwd + cz * side) / len) * speed * dt;
      this.pos.z += ((-cz * fwd - sx * side) / len) * speed * dt;
    }

    /* ground contact — damped, not snapped */
    const target = this.h(this.pos.x, this.pos.z) + cfg().vehicle.eye;
    this.eyeSmooth = this.eyeSmooth === null
      ? target
      : this.eyeSmooth + (target - this.eyeSmooth) * Math.min(1, dt * 9.0);

    this.camera.position.set(this.pos.x, this.eyeSmooth, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    return {
      speed: (fwd || side) ? speed : 0,
      ground: target - cfg().vehicle.eye,
      radius: this.radius,
      lapse: this.lapse,
    };
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
