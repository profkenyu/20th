import { cfg } from "../config.js";
import { blueshiftGainCPU } from "../cpu/metric.js";
export class Power {
  constructor(heightAt, solarAccess = () => 1) {
    this.h = heightAt;
    this.solarAccess = solarAccess;
    this.charge = 1;
    this.solar = 0;
    this.blueshiftGain = 1;
    this.load = 0;
    this.sunlit = true;
    this.dead = false;
    this.deadAt = 0;
    this.bus = 1;
    this.clock = 0;
  }
  reset(charge = 1) {
    this.charge = Math.max(0, Math.min(1, charge));
    this.dead = false;
    this.deadAt = 0;
    this.bus = 1;
    this.clock = 0;
    this.blueshiftGain = 1;
  }
  busLevel(dt, severity) {
    const L = cfg().power.lampBus;
    this.clock += dt;
    let want = 1 - L.sag * Math.min(1, severity);
    const b = Math.min(1, Math.max(0, this.charge / L.brownout));
    want *= b * b * (3 - 2 * b);
    if (severity > L.flickerAt) {
      const tick = Math.floor(this.clock * L.flickerHz);
      const h = Math.abs(Math.sin(tick * 12.9898 + 78.233) * 43758.5453) % 1;
      const bite = Math.min(1, (severity - L.flickerAt) / (1 - L.flickerAt));
      if (h < L.duty * bite) want *= 1 - L.flickerDepth;
    }
    const k = want < this.bus ? L.attack : L.release;
    this.bus += (want - this.bus) * Math.min(1, dt * k);
    return this.bus;
  }
  lit(x, z, y) {
    const P = cfg().power;
    const s = cfg().sun;
    const len = Math.hypot(s[0], s[2]) || 1e-6;
    const ax = s[0] / len, az = s[2] / len;
    const tanE = s[1] / len;
    for (const d of P.horizon) {
      if (this.h(x + ax * d, z + az * d) - y > d * tanE) return false;
    }
    return true;
  }
  update(dt, v) {
    const P = cfg().power;
    if (this.dead) {
      this.solar = 0;
      this.load = 0;
      this.bus = 0;
      return this.report();
    }
    this.busLevel(dt, v.slam ?? 0);
    const arrayPitch = v.pitch - (v.lidTilt ?? 0);
    const cp = Math.cos(arrayPitch), sp = Math.sin(arrayPitch);
    const cr = Math.cos(v.roll), sr = Math.sin(v.roll);
    const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
    const sx = fz, sz = -fx;
    const n = [
      -fx * sp * cr - sx * sr * cp,
      cp * cr,
      -fz * sp * cr - sz * sr * cp
    ];
    const s = cfg().sun;
    const sl = Math.hypot(...s);
    const ndl = Math.max(0, (n[0] * s[0] + n[1] * s[1] + n[2] * s[2]) / sl);
    const access = this.solarAccess(v.x, v.z);
    this.sunlit = this.lit(v.x, v.z, v.ground + P.deckHeight) && access > 0.05;
    this.blueshiftGain = blueshiftGainCPU(1e7, v.radius);
    this.solar = P.array * ndl * (this.sunlit ? access : 0) * this.blueshiftGain;
    this.load = P.base + (v.lamps ? P.lamps : 0) + P.drive * Math.min(1, v.speed / cfg().vehicle.cruise) * (2 - v.traction) + P.slam * (v.slam ?? 0);
    this.charge = Math.min(1, Math.max(0, this.charge + (this.solar - this.load) * dt * 0.01));
    if (this.charge <= 0 && !this.dead) {
      this.dead = true;
      this.deadAt = performance.now();
    }
    return this.report();
  }
  report() {
    const net = this.solar - this.load;
    return {
      charge: this.charge,
      solar: this.solar,
      load: this.load,
      bus: this.bus,
      blueshiftGain: this.blueshiftGain,
      sunlit: this.sunlit,
      dead: this.dead,
      net,
      endurance: net < -1e-4 ? this.charge * 100 / -net : Infinity
    };
  }
}
