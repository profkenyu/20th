import * as THREE from 'three';

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const hash = n => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const CSS = `
#ti-voyage{position:fixed;z-index:30;inset:var(--bar) 0;pointer-events:none;opacity:0;transition:opacity 1.2s;color:rgba(224,228,232,.78);font:9px/1.6 'DM Mono',monospace;letter-spacing:.2em}
body.ti-voyage #ti-voyage{opacity:1}
body.ti-voyage #ti-minimap,body.ti-voyage #fh-hud,body.ti-voyage #ti-transfer-trigger{opacity:0!important;pointer-events:none!important}
#ti-voyage-route{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:max(38px,calc(env(safe-area-inset-bottom) + 20px));border-left:2px solid #ffb21c;padding:3px 0 3px 13px;background:linear-gradient(90deg,rgba(2,3,4,.72),transparent)}
#ti-voyage-route b{display:block;font-weight:400;font-size:12px;color:rgba(255,178,28,.92)}
#ti-voyage-route span{display:block;color:rgba(205,214,220,.42)}
#ti-voyage-lock{position:absolute;right:max(22px,env(safe-area-inset-right));top:28px;text-align:right;color:rgba(205,214,220,.34)}
#ti-voyage-lock i{display:inline-block;width:38px;height:1px;margin:0 7px 3px;background:#ffb21c;opacity:.68}
@media(max-width:760px){#ti-voyage-route{left:max(15px,env(safe-area-inset-left));bottom:max(66px,calc(env(safe-area-inset-bottom) + 54px))}#ti-voyage-lock{right:max(14px,env(safe-area-inset-right));top:18px}}
`;

function starLayer(count, colour, size, seed) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    positions[p] = (hash(seed + i * 3) - 0.5) * 130;
    positions[p + 1] = (hash(seed + i * 5 + 11) - 0.5) * 82;
    positions[p + 2] = -8 - hash(seed + i * 7 + 29) * 112;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: colour, size, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const trailPositions = new Float32Array(count * 6);
  const trailGeometry = new THREE.BufferGeometry();
  const trailPosition = new THREE.BufferAttribute(trailPositions, 3);
  trailPosition.setUsage(THREE.DynamicDrawUsage);
  trailGeometry.setAttribute('position', trailPosition);
  const trailMaterial = new THREE.LineBasicMaterial({
    color: colour, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.NormalBlending,
  });
  const trails = new THREE.LineSegments(trailGeometry, trailMaterial);
  trails.frustumCulled = false;
  const group = new THREE.Group(); group.add(points, trails);
  return { group, points, trails, positions, trailPositions };
}

function destinationBody() {
  const geometry = new THREE.SphereGeometry(1, 48, 28);
  const normals = geometry.getAttribute('normal');
  const colours = new Float32Array(normals.count * 3);
  const sun = new THREE.Vector3(-0.72, 0.36, 0.59).normalize();
  for (let i = 0; i < normals.count; i++) {
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const light = Math.max(0, nx * sun.x + ny * sun.y + nz * sun.z);
    const limb = Math.max(0, 1 - Math.abs(nz));
    const value = 0.018 + light * 0.16 + limb * 0.012;
    colours[i * 3] = value * 0.78;
    colours[i * 3 + 1] = value * 0.84;
    colours[i * 3 + 2] = value * 0.90;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, fog: false,
  });
  const body = new THREE.Mesh(geometry, material);
  body.position.set(-26, -12, -112);
  body.rotation.set(-0.14, 0.32, 0.08);
  body.frustumCulled = false;
  return body;
}

/* A 15-second relational passage, not a flight simulator. The lander remains
   the scale-bearing silhouette while three star layers slide at different
   rates. A destination surface is rebuilt behind that interval, then revealed
   only when the descent begins. */
export class VoyageSequence {
  constructor({ lander, rover, camera, ambient, onSwap, onSpace, onCue, onComplete }) {
    this.lander = lander;
    this.rover = rover;
    this.camera = camera;
    this.ambient = ambient;
    this.onSwap = onSwap;
    this.onSpace = onSpace;
    this.onCue = onCue;
    this.onComplete = onComplete;
    this.phase = 'idle';
    this.t0 = 0;
    this.destination = null;
    this.baseY = 0;
    this.swapped = false;
    this.swapPending = false;
    this.egressPlaced = false;
    this.takeoffPurge = false;
    this.landingPurge = false;
    this._camera = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._surface = (x, z, terrain) => this.lander.dockingSurface(x, z, terrain);

    this.group = new THREE.Group();
    this.layers = [
      starLayer(172, 0x79838d, 0.55, 17),
      starLayer(104, 0xb9c0c6, 0.70, 233),
      starLayer(38, 0xe0c9a8, 0.86, 701),
    ];
    this.destinationBody = destinationBody();
    this.group.add(this.destinationBody, ...this.layers.map(layer => layer.group));
    this.group.visible = false;

    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    this.overlay = document.createElement('div'); this.overlay.id = 'ti-voyage';
    this.overlay.innerHTML = '<div id="ti-voyage-route"></div><div id="ti-voyage-lock"><i></i>INERTIAL FRAME / LONG EXPOSURE</div>';
    document.body.appendChild(this.overlay);
    this.route = this.overlay.querySelector('#ti-voyage-route');
  }

  get active() { return this.phase !== 'idle'; }
  get inSpace() { return this.phase === 'transit'; }

  start(destination, now = performance.now()) {
    if (this.active || !destination) return false;
    this.destination = destination;
    this.phase = 'hold'; this.t0 = now; this.baseY = this.lander.group.position.y;
    this.swapped = false; this.swapPending = false; this.egressPlaced = false;
    this.takeoffPurge = false; this.landingPurge = false;
    this.rover.auto = false;
    this.rover.scriptedDrive = { throttle: 0, steer: 0 };
    this.rover.surfaceOverride = null;
    this.route.innerHTML = `<b>${destination.id} · ${destination.label}</b><span>DEST X ${destination.start[0] >= 0 ? '+' : ''}${destination.start[0].toFixed(0)} · Z ${destination.start[1] >= 0 ? '+' : ''}${destination.start[1].toFixed(0)}</span>`;
    this.onCue?.('flight-lock', now, destination);
    return true;
  }

  async beforeRover(now) {
    if (!this.active) return;
    const elapsed = now - this.t0;
    this.rover.scriptedDrive = { throttle: 0, steer: 0 };

    if (this.phase === 'hold') {
      if (elapsed >= 1500) { this.phase = 'fold'; this.t0 = now; this.onCue?.('fold', now, this.destination); }
      return;
    }
    if (this.phase === 'fold') {
      this.lander.setRamp(0);
      this.lander.setLegFold(smooth(elapsed / 3200));
      if (!this.takeoffPurge && elapsed >= 900) {
        this.takeoffPurge = true;
        this.lander.forceFlightPurge(now, 3600);
      }
      if (elapsed >= 3200) {
        this.lander.setLegFold(1); this.phase = 'lift'; this.t0 = now; this.baseY = this.lander.group.position.y;
        this.ambient?.transferCue('release'); this.onCue?.('lift', now, this.destination);
      }
      return;
    }
    if (this.phase === 'lift') {
      this.lander.group.position.y = this.baseY + smooth(elapsed / 4200) * 28;
      if (elapsed >= 4200) {
        this.phase = 'transit'; this.t0 = now;
        this.group.visible = true; document.body.classList.add('ti-voyage');
        this.onSpace?.(true); this.ambient?.setVoyage(true);
        this.ambient?.transferCue('charge'); this.onCue?.('transit', now, this.destination);
      }
      return;
    }
    if (this.phase === 'transit') {
      const p = clamp01(elapsed / 15000);
      const envelope = smooth(p / 0.12) * (1 - smooth((p - 0.84) / 0.16));
      this.layers.forEach((layer, i) => {
        const acceleration = p * p;
        layer.points.material.opacity = envelope * (0.46 + i * 0.18);
        layer.trails.material.opacity = envelope * smooth((p - 0.08) / 0.58) * (0.10 + i * 0.055);
        const travel = elapsed * (0.0013 + i * 0.0011)
          + elapsed * elapsed * (0.00000011 + i * 0.00000006);
        layer.group.position.z = travel;
        layer.group.position.x = Math.sin(elapsed * 0.00017 + i) * (0.7 + i * 0.8);
        const radialScale = 1 + p * p * p * (0.28 + i * 0.12);
        layer.group.scale.set(radialScale, radialScale, 1);
        const trail = 0.006 + acceleration * (0.070 + i * 0.015);
        for (let star = 0; star < layer.positions.length / 3; star++) {
          const source = star * 3, target = star * 6;
          const x = layer.positions[source], y = layer.positions[source + 1], z = layer.positions[source + 2];
          layer.trailPositions[target] = x;
          layer.trailPositions[target + 1] = y;
          layer.trailPositions[target + 2] = z;
          layer.trailPositions[target + 3] = x * (1 - trail);
          layer.trailPositions[target + 4] = y * (1 - trail);
          layer.trailPositions[target + 5] = z - acceleration * (0.6 + i * 0.35);
        }
        layer.trails.geometry.attributes.position.needsUpdate = true;
      });
      const bodyReveal = smooth((p - 0.44) / 0.38);
      this.destinationBody.material.opacity = envelope * bodyReveal * 0.92;
      this.destinationBody.scale.setScalar(3.2 + bodyReveal * 27);
      this.destinationBody.rotation.y += 0.00018;
      if (!this.swapped && !this.swapPending && elapsed >= 6400) {
        this.swapPending = true;
        await this.onSwap?.(this.destination);
        this.swapped = true; this.swapPending = false;
        this.baseY = this.lander.group.position.y;
        this.lander.setLegFold(1);
        this.lander.group.position.y = this.baseY + 32;
      }
      if (elapsed >= 15000 && this.swapped) {
        this.group.visible = false; document.body.classList.remove('ti-voyage');
        this.ambient?.setVoyage(false); this.onSpace?.(false);
        this.phase = 'descent'; this.t0 = now; this.baseY = this.lander.site.y;
        this.ambient?.transferCue('arrival'); this.onCue?.('descent', now, this.destination);
      }
      return;
    }
    if (this.phase === 'descent') {
      const p = smooth(elapsed / 5600);
      this.lander.group.position.y = this.baseY + (1 - p) * 32;
      this.lander.setLegFold(1 - smooth((p - 0.52) / 0.48));
      if (!this.landingPurge && p >= 0.58) {
        this.landingPurge = true;
        this.lander.forceFlightPurge(now, 3800);
      }
      if (elapsed >= 5600) {
        this.lander.group.position.y = this.baseY; this.lander.setLegFold(0);
        this.phase = 'settle'; this.t0 = now; this.onCue?.('touchdown', now, this.destination);
      }
      return;
    }
    if (this.phase === 'settle') {
      if (elapsed >= 1100) { this.phase = 'deploy'; this.t0 = now; this.lander.setDockLights(1); }
      return;
    }
    if (this.phase === 'deploy') {
      this.lander.setRamp(smooth(elapsed / 2400));
      if (elapsed >= 2400) {
        this.lander.setRamp(1);
        this.rover.surfaceOverride = this._surface;
        const inside = this.lander.dockingPoint(-0.62, 0);
        const outside = this.lander.dockingPoint(this.lander.dock.toeZ - 2, 0);
        const heading = Math.atan2(-(outside.x - inside.x), -(outside.z - inside.z));
        this.rover.teleport(inside.x, inside.z, heading);
        this.rover.update(0);
        this.rover.group.visible = true;
        this.egressPlaced = true; this.phase = 'egress'; this.t0 = now;
        this.onCue?.('egress', now, this.destination);
      }
      return;
    }
    if (this.phase === 'egress') {
      const local = this.lander.dockingLocal(this.rover.pos.x, this.rover.pos.z);
      this._target.copy(this.lander.dockingPoint(this.lander.dock.toeZ - 2.0, 0));
      const dx = this._target.x - this.rover.pos.x, dz = this._target.z - this.rover.pos.z;
      const desired = Math.atan2(-dx, -dz), error = wrap(desired - this.rover.heading);
      this.rover.scriptedDrive = {
        throttle: local.z < this.lander.dock.hatchZ ? 0.34 : 0.23,
        steer: Math.max(-0.34, Math.min(0.34, error * 1.7)),
      };
      if (local.z <= this.lander.dock.toeZ - 1.2 || elapsed > 18000) {
        this.rover.scriptedDrive = { throttle: 0, steer: 0 };
        this.rover.surfaceOverride = null;
        this.phase = 'close'; this.t0 = now;
      }
      return;
    }
    if (this.phase === 'close') {
      this.lander.setRamp(1 - smooth(elapsed / 2200));
      if (elapsed >= 2200) {
        this.lander.setRamp(0); this.rover.scriptedDrive = null; this.rover.speed = 0;
        this.rover.auto = true; this.phase = 'idle';
        this.onCue?.('deployed', now, this.destination); this.onComplete?.(this.destination, now);
      }
    }
  }

  afterRover(now = performance.now()) {
    if (!this.active) return;
    const flight = ['lift', 'transit', 'descent'].includes(this.phase);
    let z = flight ? -13.5 : -7.0, x = flight ? 13.0 : 9.0, y = flight ? 7.0 : 2.7;
    if (this.phase === 'transit') {
      const p = clamp01((now - this.t0) / 15000), retreat = smooth(p);
      const underside = smooth(p / 0.20);
      x = 13 + retreat * 35;
      z = -13.5 - retreat * 48;
      y = 7 + (-2.2 - retreat * 6.5 - 7) * underside;
    }
    this._camera.copy(this.lander.dockingPoint(z, x, y));
    this._aim.copy(this.lander.dockingPoint(flight ? 0 : -3.3, 0,
      this.phase === 'transit' ? 1.55 : flight ? 3.4 : 2.2));
    if (this.phase === 'transit') {
      const drift = (now - this.t0) * 0.00015;
      this._camera.x += Math.sin(drift) * 1.8;
      this._camera.y += Math.cos(drift * 0.73) * 0.7;
    }
    this.camera.position.copy(this._camera); this.camera.up.set(0, 1, 0); this.camera.lookAt(this._aim);
    this.group.position.copy(this.camera.position);
    this.group.quaternion.copy(this.camera.quaternion);
    if (!this.egressPlaced || ['hold', 'fold', 'lift', 'transit', 'descent', 'settle', 'deploy'].includes(this.phase))
      this.rover.group.visible = false;
  }

  reset() {
    this.phase = 'idle'; this.destination = null; this.swapped = false; this.swapPending = false;
    this.group.visible = false; document.body.classList.remove('ti-voyage'); this.onSpace?.(false);
    this.ambient?.setVoyage(false);
    this.destinationBody.material.opacity = 0;
    this.destinationBody.scale.setScalar(1);
    this.layers.forEach(layer => {
      layer.points.material.opacity = 0;
      layer.trails.material.opacity = 0;
      layer.group.position.set(0, 0, 0);
      layer.group.scale.set(1, 1, 1);
    });
    this.rover.scriptedDrive = null; this.rover.surfaceOverride = null;
    this.lander.setLegFold(0);
  }
}
