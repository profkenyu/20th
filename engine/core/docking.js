import * as THREE from 'three';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

/* RETURN / STOW
   This controller supplies intent, not motion. The rover's own eight contact
   points, suspension, traction and wheel rotation carry it over the lowered
   ramp. Coordinate compression is restricted to the remote 10 m staging
   point; the visible final distance is never a spline. */
export class DockingSequence {
  constructor({ rover, lander, effect, camera, onCue = null }) {
    this.rover = rover;
    this.lander = lander;
    this.effect = effect;
    this.camera = camera;
    this.onCue = onCue;
    this.phase = 'idle';
    this.t0 = 0;
    this.started = false;
    this.docked = false;
    this._target = new THREE.Vector3();
    this._camera = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._surface = (x, z, terrain) => this.lander.dockingSurface(x, z, terrain);
  }

  get active() { return this.phase !== 'idle' && this.phase !== 'docked'; }

  start(now = performance.now()) {
    if (this.started || !this.lander.restorationComplete) return false;
    this.started = true;
    this.docked = false;
    this.phase = 'compress-out';
    this.t0 = now;
    this.rover.auto = false;
    this.rover.missionHold = true;
    this.rover.operatorHold = false;
    this.rover.scriptedDrive = { throttle: 0, steer: 0 };
    this.rover.surfaceOverride = null;
    this.rover.setViewMode('cinematic', { yaw: 0, pitch: 0.18, dist: 12 });
    this.effect.beginDeparture('recall');
    this.onCue?.('recall', now);
    return true;
  }

  beforeRover(now, dt) {
    if (!this.active) return;
    const elapsed = now - this.t0;
    this.rover.missionHold = true;

    if (this.phase === 'compress-out') {
      const p = clamp01(elapsed / 760);
      this.effect.depart(p);
      if (p >= 1) {
        this.effect.finish();
        const stage = this.lander.dockingPoint(this.lander.dock.toeZ - 10, 0);
        const target = this.lander.dockingPoint(this.lander.dock.hatchZ, 0);
        const heading = Math.atan2(-(target.x - stage.x), -(target.z - stage.z));
        this.rover.teleport(stage.x, stage.z, heading);
        this.rover.scriptedDrive = { throttle: 0, steer: 0 };
        /* Resolve the new eight-wheel pose before the arrival cloud samples
           geometry. This removes the otherwise visible one-frame full-mesh
           flash between the old coordinate and the compressed coordinate. */
        this.rover.update(0);
        this.effect.beginArrival('recall');
        this.effect.arrive(0);
        this.phase = 'compress-in';
        this.t0 = now;
      }
      return;
    }

    if (this.phase === 'compress-in') {
      const p = clamp01(elapsed / 920);
      this.effect.arrive(p);
      if (p >= 1) {
        this.effect.finish();
        this.phase = 'lowering';
        this.t0 = now;
        this.onCue?.('ramp', now);
      }
      return;
    }

    if (this.phase === 'lowering') {
      this.lander.setRamp(smooth(elapsed / 2400));
      this.lander.setDockLights(1);
      if (elapsed >= 2400) {
        this.lander.setRamp(1);
        this.rover.surfaceOverride = this._surface;
        this.phase = 'approach';
        this.t0 = now;
        this.onCue?.('approach', now);
      }
      return;
    }

    if (this.phase === 'approach') {
      const local = this.lander.dockingLocal(this.rover.pos.x, this.rover.pos.z);
      this._target.copy(this.lander.dockingPoint(-0.58, 0));
      const dx = this._target.x - this.rover.pos.x;
      const dz = this._target.z - this.rover.pos.z;
      const desired = Math.atan2(-dx, -dz);
      const error = wrap(desired - this.rover.heading);
      const steer = Math.max(-0.38, Math.min(0.38, error * 1.65));
      const nearBay = local.z > this.lander.dock.hatchZ - 1.2;
      const throttle = nearBay ? 0.24 : 0.47;
      this.rover.scriptedDrive = { throttle, steer };
      if (local.z >= -0.72 || elapsed > 30000) {
        this.rover.scriptedDrive = { throttle: 0, steer: 0 };
        this.phase = 'secure';
        this.t0 = now;
        this.onCue?.('secure', now);
      }
      return;
    }

    if (this.phase === 'secure') {
      this.rover.scriptedDrive = { throttle: 0, steer: 0 };
      this.lander.setDockLights(1 - smooth(elapsed / 2500));
      if (elapsed >= 2700) {
        this.lander.setDockLights(0);
        this.phase = 'closing';
        this.t0 = now;
      }
      return;
    }

    if (this.phase === 'closing') {
      this.lander.setRamp(1 - smooth(elapsed / 2600));
      if (elapsed >= 2600) {
        this.lander.setRamp(0);
        this.rover.scriptedDrive = null;
        /* Keep the closed bay floor registered until the voyage controller
           explicitly redeploys or resets the rover. Clearing it here made the
           sprung deck solve against terrain beneath the lander. */
        this.rover.surfaceOverride = this._surface;
        this.rover.speed = 0;
        this.phase = 'docked';
        this.docked = true;
        this.onCue?.('docked', now);
      }
    }
  }

  afterRover() {
    if (!this.started || this.phase === 'compress-out') return;
    if (this.phase === 'closing' || this.phase === 'docked') this.rover.group.visible = false;
  }

  reset() {
    this.effect.finish();
    this.phase = 'idle';
    this.started = false;
    this.docked = false;
    this.rover.scriptedDrive = null;
    this.rover.surfaceOverride = null;
    this.rover.group.visible = true;
    this.lander.setRamp(0);
    this.lander.setDockLights(1);
  }
}
