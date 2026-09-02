import * as THREE from "three";
import {
  Fn,
  float,
  uniform,
  vec3,
  vec4,
  normalize,
  dot,
  abs,
  pow,
  cameraPosition,
  normalWorld,
  positionWorld
} from "three/tsl";
import { installDotMatrixStyles, renderDotMatrix } from "./dot-matrix.js";
export const RESTORATION_ITEMS = Object.freeze([
  Object.freeze({
    at: 24,
    kind: "structure",
    structure: 0,
    sample: "FE\u2013NI ALLOY",
    module: "FOUNDATION",
    color: 14189621,
    sign: "METALLIC REFLECTANCE",
    form: "plates",
    grammar: "shear-alignment"
  }),
  Object.freeze({
    at: 58,
    kind: "structure",
    structure: 1,
    sample: "SILICATE CERAMIC",
    module: "LOAD PATHS",
    color: 13219211,
    sign: "SPECTRAL SPLIT",
    form: "prisms",
    grammar: "spectral-split"
  }),
  Object.freeze({
    at: 96,
    kind: "structure",
    structure: 2,
    sample: "CARBON COMPOSITE",
    module: "SERVICE / PRESSURE",
    color: 9414317,
    sign: "LOW ALBEDO DENSITY",
    form: "nodules",
    grammar: "signal-absorption"
  }),
  Object.freeze({
    at: 138,
    kind: "structure",
    structure: 3,
    sample: "CONDUCTIVE LATTICE",
    module: "TRANSFER / VISOR",
    color: 14854475,
    sign: "METALLIC LATTICE",
    form: "lattice",
    grammar: "phase-lock"
  }),
  Object.freeze({
    at: 184,
    kind: "raw",
    raw: 0,
    sample: "N\u2082 FEEDSTOCK",
    module: "ATMOSPHERIC FEEDSTOCK",
    gauge: "N\u2082",
    color: 12175812,
    sign: "RAMAN N\u2082 BAND",
    form: "frost",
    grammar: "molecular-dispersion"
  }),
  Object.freeze({
    at: 234,
    kind: "raw",
    raw: 1,
    sample: "ALCOHOL FEEDSTOCK \xB7 C\u2082H\u2085OH",
    module: "CHEMICAL FEEDSTOCK",
    gauge: "EtOH",
    color: 16757276,
    sign: "C\u2013O / O\u2013H SPECTRUM",
    form: "crystals",
    grammar: "dual-band"
  })
]);
export const STRUCTURAL_MATERIAL_COUNT = 4;
export const RAW_MATERIAL_COUNT = 2;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const DETECT_RADIUS = 12;
const HOLD_RADIUS = 1.95;
const SCAN_RADIUS = 2;
const CANCEL_RADIUS = 2.85;
const SCAN_SPEED = 0.12;
const SCAN_MS = 3600;
const EVENT_MS = 5400;
const RAW_FILL_MS = 1600;
const FIELD_SUBTRACTION_MS = 1800;
const COMPLETION_GAUGE_START = 0.08;
const COMPLETION_GAUGE_END = 0.58;
const smoothstep = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function reflectiveMaterial(hex, roughness = 0.3) {
  const base = uniform(new THREE.Color(hex));
  const material = new THREE.MeshBasicNodeMaterial();
  material.userData.baseColor = base;
  material.colorNode = Fn(() => {
    const view = normalize(cameraPosition.sub(positionWorld));
    const facing = abs(dot(normalize(normalWorld), view));
    const faceGlint = pow(facing, float(18 + roughness * 20)).mul(0.72 - roughness * 0.34);
    const edge = pow(float(1).sub(facing), float(1.8 + roughness * 2.4)).mul(0.34);
    const colour = base.mul(facing.mul(0.46).add(0.1)).add(vec3(0.76, 0.86, 0.94).mul(edge.add(faceGlint)));
    return vec4(colour, 1);
  })();
  return material;
}
function resourceGeometry(form) {
  if (form === "plates") return new THREE.BoxGeometry(0.34, 0.07, 0.24);
  if (form === "prisms") return new THREE.CylinderGeometry(0.1, 0.17, 0.46, 6);
  if (form === "lattice") return new THREE.TetrahedronGeometry(0.24, 0);
  if (form === "frost") return new THREE.OctahedronGeometry(0.2, 0);
  if (form === "crystals") return new THREE.ConeGeometry(0.16, 0.52, 5);
  return new THREE.IcosahedronGeometry(0.18, 0);
}
export class Restoration {
  constructor(lander, heightAt = () => 0, sites = []) {
    installDotMatrixStyles();
    this.lander = lander;
    this.heightAt = heightAt;
    this.siteData = sites;
    this.items = RESTORATION_ITEMS;
    this.count = 0;
    this.acquiredItems = new Uint8Array(this.items.length);
    this.gaugeValues = new Float32Array(RAW_MATERIAL_COUNT);
    this.gaugeDisplayValues = new Float32Array(RAW_MATERIAL_COUNT);
    this.event = null;
    this.subtraction = null;
    this.acquisitions = [];
    this.holdUntil = 0;
    this.state = "approach";
    this.lastDistance = Infinity;
    this.root = document.getElementById("ti-restoration");
    this.progress = document.getElementById("ti-restoration-progress");
    this.label = document.getElementById("ti-restoration-label");
    this.cells = [...document.querySelectorAll("#ti-restoration-cells i")];
    this.gaugeElements = [...document.querySelectorAll("#ti-raw-material-gauges .raw-material-gauge")];
    this.registrationPhase = document.getElementById("ti-registration-phase");
    this.registrationSample = document.getElementById("ti-registration-sample");
    this.registrationModule = document.getElementById("ti-registration-module");
    this.registrationFixedCode = document.getElementById("ti-registration-fixed-code");
    renderDotMatrix(this.registrationFixedCode, "04/04", { label: "4 / 4 structures restored" });
    this.registrationReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.registrationReadoutKey = "";
    this._buildRegistrationCells();
    this.group = new THREE.Group();
    this.group.visible = true;
    this.siteGroup = new THREE.Group();
    this.group.add(this.siteGroup);
    this.sites = [];
    this._buildSites();
    this.sampleMaterial = reflectiveMaterial(16757276, 0.24);
    this.sample = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.24), this.sampleMaterial);
    this.sample.rotation.set(0.2, 0.42, 0.14);
    this.sample.visible = false;
    this.group.add(this.sample);
    const ringPositions = [];
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      ringPositions.push(Math.cos(angle), 0, Math.sin(angle));
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.Float32BufferAttribute(ringPositions, 3));
    this.ringMaterial = new THREE.LineBasicMaterial({
      color: 16757276,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    this.ring = new THREE.Line(ringGeometry, this.ringMaterial);
    this.ring.visible = false;
    this.group.add(this.ring);
    this.particleCount = 64;
    this.positions = new Float32Array(this.particleCount * 3);
    this.origins = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    const particleGeometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(this.positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    particleGeometry.setAttribute("position", position);
    this.particleMaterial = new THREE.PointsMaterial({
      color: 16757276,
      size: 0.055,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial);
    this.particles.visible = false;
    this.group.add(this.particles);
    this.reset(0);
  }
  _buildSites() {
    const ringGeometry = new THREE.RingGeometry(0.48, 0.5, 64);
    const shadowGeometry = new THREE.CircleGeometry(1.25, 40);
    const traceGeometry = new THREE.BufferGeometry();
    traceGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.34, 0, 0, 0.34, 0, 0,
      0, 0, -0.34, 0, 0, 0.34
    ], 3));
    for (let index = 0; index < this.siteData.length; index++) {
      const data = this.siteData[index];
      if (!data) continue;
      const itemIndex = Math.max(0, Math.min(this.items.length - 1, Math.floor(data.item ?? index)));
      const item = this.items[itemIndex], root = new THREE.Group();
      const matter = new THREE.Group();
      const shards = [];
      const shardGeometry = resourceGeometry(item.form);
      const y = this.heightAt(data.x, data.z);
      root.position.set(data.x, y + 0.018, data.z);
      root.rotation.y = data.bearing ?? 0;
      root.userData.resource = { item: itemIndex, variant: data.variant ?? 0, form: item.form, grammar: item.grammar };
      root.add(matter);
      const cool = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({
        color: itemIndex === 4 ? 6984616 : 1516842,
        transparent: true,
        opacity: itemIndex === 4 ? 0.18 : 0.07,
        depthWrite: false
      }));
      cool.rotation.x = -Math.PI / 2;
      cool.scale.set(1.25, 0.55 + hash(index * 23) * 0.32, 1);
      matter.add(cool);
      const metal = reflectiveMaterial(item.color, itemIndex === 0 || itemIndex === 3 ? 0.16 : 0.34);
      for (let j = 0; j < 7; j++) {
        const a = hash(index * 71 + j * 13) * Math.PI * 2;
        const r = 0.16 + hash(index * 89 + j * 17) * 0.72;
        const shard = new THREE.Mesh(shardGeometry, metal);
        shard.position.set(Math.cos(a) * r, 0.06 + hash(j * 31 + index) * 0.15, Math.sin(a) * r * 0.62);
        const variantScale = 0.9 + (data.variant ?? 0) * 0.12;
        shard.scale.set(
          (0.45 + hash(j * 37) * 1.2) * variantScale,
          (0.16 + hash(j * 41) * (item.form === "crystals" ? 1.1 : 0.42)) * variantScale,
          (0.35 + hash(j * 43) * 0.9) / variantScale
        );
        shard.rotation.set(hash(j * 47) * 2, a, hash(j * 53) * 2);
        shard.userData.basePosition = shard.position.clone();
        shard.userData.baseRotation = shard.rotation.clone();
        matter.add(shard);
        shards.push(shard);
      }
      const spectra = [];
      for (let j = 0; j < 3; j++) {
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
          color: [item.color, 9086392, 12588330][j],
          transparent: true,
          opacity: 0.07 + (itemIndex === 1 || itemIndex === 5 ? 0.06 : 0),
          depthWrite: false,
          blending: THREE.AdditiveBlending
        }));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.82 + j * 0.42);
        ring.position.y = 0.012 + j * 6e-3;
        matter.add(ring);
        spectra.push(ring);
      }
      const count = 24 + itemIndex * 4 + (data.variant ?? 0) * 3;
      const positions = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) {
        const a = hash(index * 131 + j * 19) * Math.PI * 2;
        const r = 0.25 + hash(index * 151 + j * 29) * 1.15;
        positions[j * 3] = Math.cos(a) * r;
        positions[j * 3 + 1] = 0.04 + hash(index * 173 + j * 31) * (itemIndex === 4 ? 0.75 : 0.3);
        positions[j * 3 + 2] = Math.sin(a) * r * 0.7;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(pg, new THREE.PointsMaterial({
        color: item.color,
        size: itemIndex === 4 ? 0.042 : 0.026,
        sizeAttenuation: true,
        transparent: true,
        opacity: itemIndex === 4 ? 0.42 : 0.18,
        depthWrite: false
      }));
      matter.add(particles);
      const traceMaterial = new THREE.LineBasicMaterial({
        color: item.color,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const trace = new THREE.LineSegments(traceGeometry, traceMaterial);
      trace.position.y = 0.035;
      trace.rotation.y = -(data.bearing ?? 0);
      trace.visible = false;
      root.add(trace);
      this.siteGroup.add(root);
      this.sites.push({ root, matter, cool, shards, spectra, particles, trace, data, itemIndex, acquired: false });
    }
  }
  get complete() {
    return this.count >= this.items.length;
  }
  get completion() {
    return this.count / this.items.length;
  }
  get structuralCount() {
    let count = 0;
    for (let index = 0; index < STRUCTURAL_MATERIAL_COUNT; index++) count += this.acquiredItems[index];
    return count;
  }
  get structureComplete() {
    return this.structuralCount >= STRUCTURAL_MATERIAL_COUNT;
  }
  get rawCount() {
    let count = 0;
    for (let index = STRUCTURAL_MATERIAL_COUNT; index < this.items.length; index++) count += this.acquiredItems[index];
    return count;
  }
  get rawMaterials() {
    return this.items.slice(STRUCTURAL_MATERIAL_COUNT).map((item, index) => ({
      code: item.gauge,
      label: item.module,
      sample: item.sample,
      value: Number(this.gaugeValues[index] ?? 0),
      acquired: !!this.acquiredItems[STRUCTURAL_MATERIAL_COUNT + index]
    }));
  }
  get acquiredSites() {
    return this.items.map((_item, itemIndex) => this.sites.find(
      (site) => site.itemIndex === itemIndex && site.acquired
    )).filter(Boolean);
  }
  get subtractionProgress() {
    return this.subtraction?.progress ?? (this.complete ? 1 : 0);
  }
  consumeAcquisitions() {
    return this.acquisitions.splice(0);
  }
  get scanning() {
    return !!this.event && !this.event.committed;
  }
  holding(now) {
    return !!this.event && now < this.holdUntil;
  }
  shouldHold(probe) {
    if (this.complete || !probe) return false;
    const site = this._nearestAvailableSite(probe);
    return !!site && Math.hypot(probe.x - site.data.x, probe.z - site.data.z) <= HOLD_RADIUS;
  }
  get target() {
    const itemIndex = this.acquiredItems.findIndex((acquired) => !acquired);
    if (itemIndex < 0) return null;
    return this.sites.find((site) => site.itemIndex === itemIndex && site.data.primary)?.data ??
      this.sites.find((site) => site.itemIndex === itemIndex)?.data ?? null;
  }
  get scanFocus() {
    return this.event ? this.sites[this.event.index]?.data ?? null : null;
  }
  _nearestAvailableSite(probe) {
    let nearest = null;
    let distance = Infinity;
    for (const site of this.sites) {
      if (this.acquiredItems[site.itemIndex]) continue;
      const nextDistance = Math.hypot(probe.x - site.data.x, probe.z - site.data.z);
      if (nextDistance >= distance) continue;
      nearest = site;
      distance = nextDistance;
    }
    return nearest;
  }
  snapshot() {
    return {
      count: this.count,
      complete: this.complete,
      state: this.state,
      structure: {
        count: this.structuralCount,
        total: STRUCTURAL_MATERIAL_COUNT,
        complete: this.structureComplete
      },
      rawMaterials: {
        count: this.rawCount,
        total: RAW_MATERIAL_COUNT,
        gauges: this.rawMaterials
      },
      fieldSubtraction: {
        active: !!this.subtraction && !this.subtraction.complete,
        complete: !!this.subtraction?.complete,
        progress: this.subtractionProgress,
        traces: this.sites.reduce((count, site) => count + (site.acquired ? 1 : 0), 0),
        potentials: this.subtraction?.complete ? 0 : this.sites.reduce((count, site) => count + (!!this.acquiredItems[site.itemIndex] && !site.acquired ? 1 : 0), 0),
        subtracted: this.subtraction?.complete ? this.sites.reduce((count, site) => count + (!!this.acquiredItems[site.itemIndex] && !site.acquired ? 1 : 0), 0) : 0
      },
      distance: this.lastDistance,
      scanning: this.scanning,
      registration: {
        active: !!this.root?.classList.contains("registering"),
        fixed: !!this.root?.classList.contains("registration-fixed"),
        out: !!this.root?.classList.contains("registration-out"),
        progress: Number(this.root?.style.getPropertyValue("--registration-progress") || 0),
        registered: this.cells.reduce((sum, cell) => sum + (cell.classList.contains("registered") ? 1 : 0), 0),
        activeIndex: this.cells.findIndex((cell) => cell.classList.contains("registration-active")),
        phase: this.registrationPhase?.textContent ?? "",
        sample: this.registrationSample?.textContent ?? "",
        module: this.registrationModule?.textContent ?? "",
        resources: this.rawMaterials.map((resource, index) => ({
          ...resource,
          displayedValue: Number(this.gaugeDisplayValues[index] ?? 0)
        })),
        reduced: this.registrationReduced
      }
    };
  }
  _syncUi(message = "") {
    if (this.progress) this.progress.textContent = `SHELL ${this.structuralCount} / ${STRUCTURAL_MATERIAL_COUNT} \xB7 RAW ${this.rawCount} / ${RAW_MATERIAL_COUNT}`;
    for (let i = 0; i < this.cells.length; i++)
      this.cells[i].classList.toggle("on", !!this.acquiredItems[i]);
    this._syncGauges();
    if (this.label) this.label.textContent = message || (this.complete ? "LANDER + RAW MATERIALS \xB7 COMPLETE" : this.structureComplete ? `LANDER FIXED \xB7 RAW ${this.rawCount} / ${RAW_MATERIAL_COUNT}` : this.count ? "FIELD MATERIAL \xB7 REGISTERED" : "WIRE STATE \xB7 4 STRUCTURES + 2 RAW MATERIALS REQUIRED");
    this.root?.classList.toggle("complete", this.complete);
  }
  _syncGauges(values = this.gaugeValues, completionCharge = false) {
    this.gaugeElements.forEach((element, index) => {
      const value = clamp01(values[index] ?? 0);
      this.gaugeDisplayValues[index] = value;
      const percent = Math.round(value * 100);
      element.style.setProperty("--raw-material-level", value.toFixed(3));
      element.classList.toggle("on", value >= 0.999);
      element.classList.toggle("active", completionCharge || (this.event?.item?.kind === "raw" && this.event.item.raw === index));
      const output = element.querySelector("small");
      if (output) output.textContent = `${String(percent).padStart(3, "0")}%`;
      const meter = element.querySelector('[role="meter"]');
      meter?.setAttribute("aria-valuenow", String(percent));
    });
  }
  _buildRegistrationCells() {
    this.cells.forEach((cell, index) => {
      const item = this.items[index];
      if (!item) return;
      const number = document.createElement("b");
      const sample = document.createElement("span");
      const module = document.createElement("small");
      number.textContent = String(index + 1).padStart(2, "0");
      sample.textContent = item.sample;
      module.textContent = item.module;
      cell.replaceChildren(number, sample, module);
      cell.style.setProperty(
        "--material-colour",
        `#${item.color.toString(16).padStart(6, "0")}`
      );
    });
    this.gaugeElements.forEach((element, index) => {
      const item = this.items[STRUCTURAL_MATERIAL_COUNT + index];
      if (!item) return;
      const code = document.createElement("b");
      const label = document.createElement("span");
      const value = document.createElement("small");
      const meter = document.createElement("i");
      const fill = document.createElement("em");
      code.textContent = item.gauge;
      label.textContent = item.module;
      value.textContent = "000%";
      meter.className = "raw-material-track";
      meter.setAttribute("role", "meter");
      meter.setAttribute("aria-label", `${item.gauge} ${item.module}`);
      meter.setAttribute("aria-valuemin", "0");
      meter.setAttribute("aria-valuemax", "100");
      meter.setAttribute("aria-valuenow", "0");
      meter.appendChild(fill);
      element.replaceChildren(code, label, value, meter);
      element.style.setProperty(
        "--material-colour",
        `#${item.color.toString(16).padStart(6, "0")}`
      );
    });
    this._syncGauges();
  }
  setCompletionRegistration(registration = null, timelineProgress = 0) {
    if (!this.root) return;
    if (!registration) {
      this.root.classList.remove("registering", "registration-fixed", "registration-out");
      this.root.style.removeProperty("--registration-progress");
      this.registrationReadoutKey = "";
      for (const cell of this.cells) {
        cell.classList.remove("registered", "registration-active");
        cell.style.removeProperty("--registration-weight");
        cell.style.removeProperty("--registration-opacity");
      }
      this._syncGauges();
      return;
    }
    const timeline = clamp01(timelineProgress);
    const completionGaugeLevel = smoothstep(
      (timeline - COMPLETION_GAUGE_START) /
      (COMPLETION_GAUGE_END - COMPLETION_GAUGE_START)
    );
    this._syncGauges(
      new Array(RAW_MATERIAL_COUNT).fill(completionGaugeLevel),
      completionGaugeLevel > 0 && completionGaugeLevel < 0.999
    );
    const allSolid = this.lander.parts.every((part) => part.state === "solid");
    let registered = this.registrationReduced ? this.cells.length : 0;
    if (!this.registrationReduced) {
      for (let index = 0; index < registration.registered.length; index++) {
        if (registration.registered[index]) registered++;
      }
    }
    const fixed = allSolid && (this.registrationReduced || registration.progress >= 0.7);
    const activeIndex = this.registrationReduced || fixed ? STRUCTURAL_MATERIAL_COUNT - 1 : Math.max(0, Math.min(STRUCTURAL_MATERIAL_COUNT - 1, registration.activeIndex));
    this.root.classList.add("registering");
    this.root.classList.toggle("registration-fixed", fixed);
    this.root.classList.toggle("registration-out", timeline >= 0.82);
    this.root.style.setProperty("--registration-progress", timeline.toFixed(4));
    this.cells.forEach((cell, index) => {
      const isRegistered = this.registrationReduced || !!registration.registered[index];
      cell.classList.toggle("registered", isRegistered);
      cell.classList.toggle("registration-active", !fixed && index === activeIndex);
      const weight = this.registrationReduced ? 1 : Number(registration.weights[index] ?? 0);
      cell.style.setProperty("--registration-weight", weight.toFixed(3));
      cell.style.setProperty("--registration-opacity", Math.min(0.13, weight * 0.13).toFixed(3));
    });
    const item = this.items[activeIndex];
    const key = fixed ? "fixed" : `${activeIndex}:${registered}`;
    if (key === this.registrationReadoutKey) return;
    this.registrationReadoutKey = key;
    if (fixed) {
      if (this.registrationPhase) this.registrationPhase.textContent = "PLANNED 04 \u2192 OBSERVED 04";
      if (this.registrationSample) this.registrationSample.textContent = "LANDER / STRUCTURE FIXED";
      if (this.registrationModule) this.registrationModule.textContent = "\uAD00\uCE21 \uC644\uB8CC \xB7 \uC678\uBD80 \uAD6C\uC870\uC7AC 4\uC885 \uACE0\uC815 \xB7 \uC6D0\uB8CC 2\uC885 \uCDA9\uC804";
    } else {
      if (this.registrationPhase) this.registrationPhase.textContent = `REGISTRATION PASS \xB7 ${String(registered).padStart(2, "0")} / 04`;
      if (this.registrationSample) this.registrationSample.textContent = item.sample;
      if (this.registrationModule) this.registrationModule.textContent = `${item.sign} \u2192 ${item.module}`;
    }
  }
  _beginFieldSubtraction(now) {
    this.subtraction = { t0: now, progress: 0, complete: false };
  }
  _updateFieldSubtraction(now) {
    if (!this.subtraction || this.subtraction.complete) return;
    this.subtraction.progress = smoothstep((now - this.subtraction.t0) / FIELD_SUBTRACTION_MS);
    this.subtraction.complete = this.subtraction.progress >= 0.999;
  }
  _animateSiteGrammar(site, now, index) {
    const t = now * 0.001;
    const phase = t + index * 0.73;
    const pulse = 0.5 + Math.sin(phase * 1.1) * 0.5;
    const targetGain = site.data === this.target ? 1 : 0.55;
    site.matter.rotation.set(0, 0, 0);
    site.matter.scale.setScalar(1);
    site.particles.scale.setScalar(1);
    site.cool.material.opacity = site.itemIndex === 4 ? 0.18 : 0.07;
    for (let i = 0; i < site.shards.length; i++) {
      const shard = site.shards[i];
      const position = shard.userData.basePosition;
      const rotation = shard.userData.baseRotation;
      shard.position.copy(position);
      shard.rotation.copy(rotation);
    }
    site.spectra.forEach((ring, ringIndex) => {
      ring.scale.setScalar(0.82 + ringIndex * 0.42);
      ring.material.opacity = (ringIndex < 2 ? 0.055 : 0.032) * targetGain;
    });
    site.particles.material.opacity = (site.itemIndex === 4 ? 0.38 : 0.14) * targetGain;

    if (site.itemIndex === 0) {
      const alignment = 0.58 + pulse * 0.3;
      site.matter.scale.z = 0.72;
      site.shards.forEach((shard, shardIndex) => {
        const base = shard.userData.baseRotation;
        shard.rotation.x = base.x * (1 - alignment);
        shard.rotation.y = base.y * 0.16 + (shardIndex % 2 ? 0.035 : -0.035);
        shard.rotation.z = base.z * (1 - alignment);
      });
    } else if (site.itemIndex === 1) {
      const split = Math.sin(phase * 1.45) * 0.12;
      site.spectra.forEach((ring, ringIndex) => {
        const base = 0.82 + ringIndex * 0.42;
        ring.scale.set(base * (1 + split * (ringIndex + 1)), base * (1 - split), 1);
        ring.material.opacity = (0.075 + ringIndex * 0.025) * targetGain;
      });
      site.shards.forEach((shard, shardIndex) => {
        shard.position.y += (shardIndex % 2 ? 1 : -1) * split * 0.18;
      });
    } else if (site.itemIndex === 2) {
      const absorption = 0.9 - pulse * 0.1;
      site.matter.scale.setScalar(absorption);
      site.spectra.forEach((ring) => { ring.material.opacity = 0.012 * targetGain; });
      site.particles.material.opacity = 0.035 * targetGain;
      site.shards.forEach((shard) => { shard.position.y *= 0.68; });
    } else if (site.itemIndex === 3) {
      const locked = Math.floor((phase * 0.42 % 1) * 4) * Math.PI * 0.5;
      site.matter.rotation.y = locked * 0.08;
      site.shards.forEach((shard, shardIndex) => {
        shard.rotation.x = Math.round(shard.userData.baseRotation.x / (Math.PI * 0.5)) * Math.PI * 0.5;
        shard.rotation.y = shardIndex % 4 * Math.PI * 0.5;
        shard.rotation.z = 0;
      });
      site.spectra.forEach((ring) => { ring.material.opacity = (0.055 + pulse * 0.055) * targetGain; });
    } else if (site.itemIndex === 4) {
      const dispersion = (phase * 0.28) % 1;
      site.particles.scale.set(0.72 + dispersion * 0.95, 0.8 + dispersion * 1.35, 0.72 + dispersion * 0.95);
      site.particles.material.opacity = (1 - dispersion) * 0.48 * targetGain;
      site.shards.forEach((shard, shardIndex) => {
        shard.position.y += Math.sin(phase * 1.25 + shardIndex) * 0.04 + dispersion * 0.05;
      });
    } else {
      site.spectra.forEach((ring, ringIndex) => {
        const band = ringIndex < 2 ? 0.5 + Math.sin(phase * (ringIndex ? 1.72 : 1.08) + ringIndex * 1.6) * 0.5 : 0;
        const base = 0.86 + ringIndex * 0.48;
        ring.scale.setScalar(base + band * 0.16);
        ring.material.opacity = (ringIndex < 2 ? 0.055 + band * 0.13 : 0.008) * targetGain;
      });
      site.shards.forEach((shard, shardIndex) => {
        shard.rotation.y += (shardIndex % 2 ? 1 : -1) * Math.sin(phase * 0.72) * 0.18;
      });
    }
  }
  _syncSiteState(site, now, index) {
    this._animateSiteGrammar(site, now, index);
    const itemResolved = !!this.acquiredItems[site.itemIndex];
    const selected = itemResolved && site.acquired;
    const potential = itemResolved && !selected;
    const subtraction = this.subtractionProgress;
    site.trace.visible = selected;
    site.trace.material.opacity = selected ? 0.26 + subtraction * 0.22 : 0;
    site.trace.scale.setScalar(0.86 + Math.sin(now * 7e-4 + index) * 0.035);
    if (selected) {
      site.matter.visible = false;
      site.root.visible = true;
      return;
    }
    if (potential) {
      const remainder = this.complete ? 1 - subtraction : 1;
      site.matter.visible = remainder > 0.001;
      site.root.visible = site.matter.visible;
      site.matter.scale.multiplyScalar((0.24 + Math.sin(now * 8e-4 + index) * 0.015) * remainder);
      site.cool.material.opacity *= 0.18 * remainder;
      site.particles.material.opacity *= 0.16 * remainder;
      site.spectra.forEach((ring) => { ring.material.opacity *= 0.22 * remainder; });
      return;
    }
    site.matter.visible = true;
    site.root.visible = true;
  }
  _seedParticles(index) {
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, angle = hash(index * 101 + i * 7) * Math.PI * 2;
      const radius = 0.12 + hash(index * 137 + i * 11) * 0.52;
      this.origins[p] = Math.cos(angle) * radius;
      this.origins[p + 1] = hash(index * 149 + i * 13) * 0.18;
      this.origins[p + 2] = Math.sin(angle) * radius;
      this.velocities[p] = Math.cos(angle) * (0.1 + hash(i * 17 + index) * 0.34);
      this.velocities[p + 1] = 0.18 + hash(i * 19 + index) * 0.56;
      this.velocities[p + 2] = Math.sin(angle) * (0.1 + hash(i * 23 + index) * 0.34);
    }
  }
  _begin(v, now, siteIndex) {
    const site = this.sites[siteIndex];
    const item = this.items[site.itemIndex];
    this.sampleBaseY = this.heightAt(site.data.x, site.data.z) + 0.24;
    this.sample.position.set(site.data.x, this.sampleBaseY, site.data.z);
    this.ring.position.set(site.data.x, this.heightAt(site.data.x, site.data.z) + 0.04, site.data.z);
    this.particles.position.set(site.data.x, this.heightAt(site.data.x, site.data.z) + 0.04, site.data.z);
    this.sample.visible = false;
    this.ring.visible = this.particles.visible = true;
    this.sampleMaterial.userData.baseColor.value.setHex(item.color);
    this.ringMaterial.color.setHex(item.color);
    this.particleMaterial.color.setHex(item.color);
    this._seedParticles(siteIndex);
    this.event = { index: siteIndex, itemIndex: site.itemIndex, item, t0: now, committed: false };
    this.state = "scanning";
    this.holdUntil = now + EVENT_MS;
    this._syncUi(`SIGNAL LOCK \xB7 ${item.sign}`);
    this.root?.classList.add("active");
  }
  acquireAll(v, now = performance.now()) {
    if (this.complete) return false;
    this.event = null;
    this.holdUntil = 0;
    if (!this.lander.restorationComplete && !this.lander.restoreAll(now)) return false;
    const forwardX = -Math.sin(v.heading), forwardZ = -Math.cos(v.heading);
    this.sample.position.set(v.x + forwardX * 0.35, v.ground + 0.18, v.z + forwardZ * 0.35);
    this.sampleBaseY = this.sample.position.y;
    this.ring.position.copy(this.sample.position);
    this.ring.position.y -= 0.12;
    this.particles.position.copy(this.ring.position);
    this.sample.visible = false;
    this.ring.visible = this.particles.visible = true;
    this.sampleMaterial.userData.baseColor.value.setHex(16757276);
    this.ringMaterial.color.setHex(16757276);
    this.particleMaterial.color.setHex(16757276);
    this._seedParticles(this.items.length);
    this.event = {
      index: 0,
      itemIndex: 0,
      item: { sample: "4 STRUCTURES + 2 RAW MATERIALS", module: "MISSION LOADOUT" },
      t0: now,
      committed: true,
      all: true
    };
    this.count = this.items.length;
    this.acquiredItems.fill(1);
    for (const site of this.sites) site.acquired = false;
    for (let itemIndex = 0; itemIndex < this.items.length; itemIndex++) {
      const primary = this.sites.find((site) => site.itemIndex === itemIndex && site.data.primary) ??
        this.sites.find((site) => site.itemIndex === itemIndex);
      if (primary) {
        primary.acquired = true;
        this.acquisitions.push({
          itemIndex,
          siteIndex: this.sites.indexOf(primary),
          at: now
        });
      }
    }
    this._beginFieldSubtraction(now);
    this.gaugeValues.fill(1);
    this.holdUntil = now + EVENT_MS;
    this.state = "acquired";
    this.group.visible = true;
    this.root?.classList.add("active");
    this._syncUi("4 STRUCTURES + 2 RAW MATERIALS \xB7 ACQUIRED");
    return true;
  }
  _animate(now) {
    const age = Math.max(0, (now - this.event.t0) / 1e3);
    const integration = clamp01(age / (SCAN_MS / 1e3));
    const appear = clamp01(age / 0.44);
    const dissolve = 1 - clamp01((age - 4.25) / 0.95);
    const envelope = appear * dissolve;
    this.sample.position.y = this.sampleBaseY + Math.sin(age * 3.1) * 0.035 + clamp01(age / 1.1) * 0.18;
    this.sample.rotation.y += 0.018;
    this.sample.scale.setScalar(0.72 + envelope * 0.52);
    this.ring.scale.setScalar(0.42 + integration * 1.48);
    this.ringMaterial.opacity = envelope * (0.2 + integration * 0.38);
    this.particleMaterial.opacity = envelope * (0.28 + integration * 0.44);
    for (let i = 0; i < this.particleCount; i++) {
      const p = i * 3, phase = (age + hash(i * 31) * 0.58) % 1.25;
      this.positions[p] = this.origins[p] + this.velocities[p] * phase;
      this.positions[p + 1] = this.origins[p + 1] + this.velocities[p + 1] * phase - phase * phase * 0.17;
      this.positions[p + 2] = this.origins[p + 2] + this.velocities[p + 2] * phase;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }
  update(v, now, active = true) {
    this.group.visible = active;
    if (!active) return;
    this._updateFieldSubtraction(now);
    for (let i = 0; i < this.sites.length; i++) this._syncSiteState(this.sites[i], now, i);
    if (!this.event) {
      const site = this._nearestAvailableSite(v);
      this.lastDistance = site ? Math.hypot(v.x - site.data.x, v.z - site.data.z) : Infinity;
      if (this.complete) {
        this.state = "complete";
      } else if (site) {
        this.state = this.lastDistance <= SCAN_RADIUS ? "settling" : this.lastDistance <= DETECT_RADIUS ? "detected" : "approach";
        if (this.lastDistance <= SCAN_RADIUS && Math.abs(v.speed) <= SCAN_SPEED) {
          this._begin(v, now, this.sites.indexOf(site));
        } else if (this.lastDistance <= HOLD_RADIUS) {
          this._syncUi(`HOLD CONTACT \xB7 ${this.items[site.itemIndex].sign}`);
        }
      }
      return;
    }
    if (this.event.all) {
      this.lastDistance = 0;
      this._animate(now);
      if (now - this.event.t0 >= EVENT_MS) {
        this.event = null;
        this.holdUntil = 0;
        this.state = "complete";
        this.sample.visible = this.ring.visible = this.particles.visible = false;
        this.root?.classList.remove("active");
        this._syncUi("LANDER FIXED \xB7 TWO RAW MATERIALS CHARGED");
      }
      return;
    }
    const site = this.sites[this.event.index];
    this.lastDistance = site ? Math.hypot(v.x - site.data.x, v.z - site.data.z) : Infinity;
    if (!site || this.lastDistance > CANCEL_RADIUS || Math.abs(v.speed) > 0.18) {
      if (this.event.committed && this.event.item.kind === "raw")
        this.gaugeValues[this.event.item.raw] = 1;
      this.event = null;
      this.holdUntil = 0;
      this.root?.classList.remove("active");
      this.state = "detected";
      this.sample.visible = this.ring.visible = this.particles.visible = false;
      this._syncUi("SCAN INTERRUPTED \xB7 REAPPROACH SIGNATURE");
      return;
    }
    this._animate(now);
    if (this.event.committed && this.event.item.kind === "raw") {
      const gaugeIndex = this.event.item.raw;
      const value = smoothstep((now - this.event.committedAt) / RAW_FILL_MS);
      if (value !== this.gaugeValues[gaugeIndex]) {
        this.gaugeValues[gaugeIndex] = value;
        this._syncGauges();
      }
    }
    const ageMs = now - this.event.t0;
    if (!this.event.committed && ageMs >= SCAN_MS) {
      const fixed = this.event.item.kind === "structure" ? this.lander.restorePart(this.event.item.structure, now) : true;
      if (fixed) {
        this.event.committed = true;
        this.event.committedAt = now;
        this.state = "acquired";
        this.acquiredItems[this.event.itemIndex] = 1;
        this.count++;
        site.acquired = true;
        this.acquisitions.push({ itemIndex: this.event.itemIndex, siteIndex: this.event.index, at: now });
        if (this.complete) {
          this._beginFieldSubtraction(now);
          this._syncUi("FIELD SUBTRACTION \xB7 SIX COORDINATE TRACES");
        } else {
          this._syncUi(`SAMPLE ACQUIRED \xB7 ${this.event.item.sample}`);
        }
      }
    }
    if (ageMs >= EVENT_MS) {
      const module = this.event.item.module;
      if (this.event.item.kind === "raw")
        this.gaugeValues[this.event.item.raw] = 1;
      this.event = null;
      this.holdUntil = 0;
      this.state = this.complete ? "complete" : "approach";
      this.sample.visible = this.ring.visible = this.particles.visible = false;
      this.root?.classList.remove("active");
      this._syncUi(this.complete ? "FIELD SUBTRACTION \xB7 06 TRACES REMAIN" : `${module} \xB7 MATERIAL FIXED`);
    }
  }
  reset(level = 0) {
    this.count = Math.max(0, Math.min(this.items.length, Math.floor(level)));
    this.acquiredItems.fill(0);
    for (let index = 0; index < this.count; index++) this.acquiredItems[index] = 1;
    for (let i = 0; i < this.gaugeValues.length; i++)
      this.gaugeValues[i] = this.acquiredItems[STRUCTURAL_MATERIAL_COUNT + i] ? 1 : 0;
    this.gaugeDisplayValues.set(this.gaugeValues);
    this.event = null;
    this.subtraction = null;
    this.acquisitions.length = 0;
    this.holdUntil = 0;
    this.state = this.complete ? "complete" : "approach";
    this.lastDistance = Infinity;
    this.group.visible = true;
    this.sample.visible = this.ring.visible = this.particles.visible = false;
    this.root?.classList.remove("active");
    this.setCompletionRegistration(null);
    this.lander.setRestorationLevel(this.structuralCount);
    for (const site of this.sites) {
      site.acquired = false;
      site.root.visible = !this.acquiredItems[site.itemIndex];
    }
    for (let itemIndex = 0; itemIndex < this.acquiredItems.length; itemIndex++) {
      if (!this.acquiredItems[itemIndex]) continue;
      const primary = this.sites.find((site) => site.itemIndex === itemIndex && site.data.primary) ??
        this.sites.find((site) => site.itemIndex === itemIndex);
      if (primary) primary.acquired = true;
    }
    if (this.complete) this.subtraction = { t0: 0, progress: 1, complete: true };
    this._syncUi();
  }
}
