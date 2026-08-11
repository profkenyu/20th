import * as THREE from 'three';
import { createTimeline } from 'animejs';

const CSS = `
#ti-blueprint-reveal{position:fixed;z-index:45;inset:var(--bar) 0;pointer-events:none;
  opacity:0;overflow:hidden;font:9px/1.5 'DM Mono',ui-monospace,monospace;
  letter-spacing:.2em;color:rgba(217,221,226,.7);text-transform:uppercase}
#ti-blueprint-reveal .scan{position:absolute;left:0;right:0;top:calc(var(--scan,0)*100%);
  height:1px;background:linear-gradient(90deg,transparent 8%,#c0152a 35%,#fff 50%,#c0152a 65%,transparent 92%);
  box-shadow:0 0 20px rgba(192,21,42,.55)}
#ti-blueprint-reveal .datum{position:absolute;left:5vw;top:8vh;border-left:1px solid #c0152a;
  padding-left:10px;white-space:pre;color:rgba(217,221,226,.54)}
#ti-blueprint-reveal .progress{position:absolute;right:5vw;bottom:8vh;text-align:right;color:#c0152a}
body.ti-blueprint-active #ti-prologue{background:rgba(5,5,6,.16);backdrop-filter:none}
body.ti-blueprint-active #ti-prologue .inner,
body.ti-blueprint-active #ti-prologue .controls{opacity:0}
#ti-prologue .inner,#ti-prologue .controls{transition:opacity 1.1s ease}
@media(prefers-reduced-motion:reduce){#ti-blueprint-reveal{display:none}}
`;

/**
 * The blueprint is generated from the production rover itself, never from a
 * substitute illustration. Anime.js sequences the edge field, a deterministic
 * mesh-by-mesh assembly and the final scan. The authored materials remain
 * untouched, so the same rover continues into gameplay.
 */
export class RoverReveal {
  constructor(rover, { onComplete = null } = {}) {
    this.rover = rover;
    this.onComplete = onComplete;
    this.state = { wire: 0, solid: 0, scan: 0, overlay: 0 };
    this.finished = true;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.overlay = document.createElement('div');
    this.overlay.id = 'ti-blueprint-reveal';
    this.overlay.innerHTML = `
      <div class="scan"></div>
      <div class="datum">RVR / EXPLORATION CHASSIS\n8× INDEPENDENT SUSPENSION\nSOLAR ARRAY / SENSOR MAST</div>
      <div class="progress">GEOMETRY RESOLUTION<br><b>000%</b></div>`;
    document.body.appendChild(this.overlay);
    this.progress = this.overlay.querySelector('b');

    rover.group.updateMatrixWorld(true);
    const rootInverse = rover.group.matrixWorld.clone().invert();
    this.solids = [];
    rover.group.traverse(object => {
      if (!object.isMesh || !object.geometry || object === rover.acquisitionGlow) return;
      this.solids.push({ object, visible: object.visible });
    });
    /* Assembly rises from wheels and load paths into instruments. This makes
       the change read as modelling, not a global opacity fade. */
    this.solids.sort((a, b) => {
      a.object.getWorldPosition(_a); b.object.getWorldPosition(_b);
      return _a.y - _b.y;
    });

    this.wire = new THREE.Group();
    this.wire.name = 'ROVER_BLUEPRINT_WIREFRAME';
    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0xd9dde2, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    for (const { object } of this.solids) {
      const geometry = new THREE.EdgesGeometry(object.geometry, 28);
      if (!geometry.attributes.position?.count) { geometry.dispose(); continue; }
      const line = new THREE.LineSegments(geometry, this.wireMaterial);
      line.matrixAutoUpdate = false;
      line.matrix.multiplyMatrices(rootInverse, object.matrixWorld);
      line.renderOrder = 8;
      this.wire.add(line);
    }
    this.wire.visible = false;
    rover.group.add(this.wire);

    this.timeline = createTimeline({
      autoplay: false,
      onUpdate: () => this._apply(),
      onComplete: () => this._done(),
    });
    this.timeline
      .add(this.state, { overlay: 1, wire: 1, duration: 850, ease: 'out(3)' }, 0)
      .add(this.state, { scan: 1, duration: 3100, ease: 'inOut(2)' }, 500)
      .add(this.state, { solid: 1, duration: 2200, ease: 'inOut(3)' }, 1250)
      .add(this.state, { wire: 0, overlay: 0, duration: 1050, ease: 'inOut(2)' }, 3500);
  }

  start() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.finish(); return false;
    }
    this.finished = false;
    Object.assign(this.state, { wire: 0, solid: 0, scan: 0, overlay: 0 });
    document.body.classList.add('ti-blueprint-active');
    this.overlay.style.display = 'block';
    this._apply();
    this.timeline.restart();
    return true;
  }

  snapshot() {
    return {
      active: !this.finished,
      wire: this.state.wire,
      solid: this.state.solid,
      scan: this.state.scan,
      meshes: this.solids.length,
    };
  }

  finish() {
    this.timeline.pause();
    Object.assign(this.state, { wire: 0, solid: 1, scan: 1, overlay: 0 });
    this._apply();
    this._done();
  }

  _apply() {
    const p = Math.max(0, Math.min(1, this.state.solid));
    const threshold = p * (this.solids.length + 4);
    for (let i = 0; i < this.solids.length; i++) {
      const part = this.solids[i];
      part.object.visible = part.visible && i <= threshold;
    }
    this.wire.visible = this.state.wire > 0.005;
    this.wireMaterial.opacity = Math.max(0, this.state.wire) * 0.68;
    this.overlay.style.opacity = Math.max(0, this.state.overlay).toFixed(3);
    this.overlay.style.setProperty('--scan', Math.max(0, Math.min(1, this.state.scan)).toFixed(4));
    this.progress.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
  }

  _done() {
    if (this.finished) return;
    this.finished = true;
    for (const part of this.solids) part.object.visible = part.visible;
    this.wire.visible = false;
    this.overlay.style.display = 'none';
    document.body.classList.remove('ti-blueprint-active');
    this.onComplete?.();
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
