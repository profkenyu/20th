export const MISSION_MEMORY_VERSION = 3;
export const REQUIRED_BODY01_SAMPLE_COUNT = 6;
export const DEFAULT_MEMORY_KEY = "terra-incognita:mission-memory:v3";

// Session-only artistic mapping. These limits do not describe physical units.
const JOURNEY = Object.freeze({
  maxStepSeconds: 0.1,
  maxStepDistance: 5,
  distanceScale: 160,
  maxDistance: 8,
  turnScale: 600,
  maxTurn: 1.5,
  stationarySpeed: 0.12,
  dwellScale: 60,
  maxDwell: 3,
  dwellHoldMs: 400,
  distanceHoldMs: 120
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const fract = (value) => value - Math.floor(value);
const textHash = (value) => {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const hash01 = (value) => fract(Math.sin(value * 12.9898 + 78.233) * 43758.5453);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const copyPoint = (source) => Array.isArray(source) ? { x: finite(source[0]), z: finite(source[1]) } : { x: finite(source?.x), z: finite(source?.z) };
function storageOrNull(candidate) {
  if (candidate) return candidate;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
function cleanSample(source, index) {
  const site = source?.site ?? source?.data ?? source;
  return {
    index,
    sample: String(source?.sample ?? `MATERIAL ${index + 1}`),
    module: String(source?.module ?? "UNRESOLVED STRUCTURE"),
    sign: String(source?.sign ?? "SPECTRAL RETURN"),
    color: finite(source?.color, 10133928) >>> 0,
    x: finite(site?.x),
    z: finite(site?.z)
  };
}
function cleanWater(source) {
  if (!source) return null;
  const site = source.site ?? source;
  const signature = site.signature ?? source.signature ?? {};
  const visual = site.visual ?? source.visual ?? {};
  const bands = (signature.absorptionBandsMicron ?? source.absorptionBandsMicron ?? []).map(Number).filter(Number.isFinite).slice(0, 8);
  return {
    id: String(site.id ?? source.id ?? "BODY02-H2O-01"),
    confirmed: source.confirmed !== false && source.complete !== false,
    x: finite(site.x),
    z: finite(site.z),
    phase: String(signature.phase ?? source.phase ?? "HYDRATED SILICA / PORE ICE"),
    thermalDeltaK: finite(signature.thermalDeltaK ?? source.thermalDeltaK, -16),
    absorptionBandsMicron: bands.length ? bands : [1.4, 1.9, 2.9],
    particleDensity: clamp01(finite(visual.particleDensity ?? source.particleDensity, 0.28)),
    spectrumRingMicron: finite(visual.spectrumRingMicron ?? source.spectrumRingMicron, bands[1] ?? 1.9)
  };
}
function fieldFromSamples(samples, journey) {
  return samples.map((sample, index) => {
    const materialHash = textHash(`${sample.sample}|${sample.sign}`);
    const bearing = Math.atan2(sample.z, sample.x);
    return {
      angle: bearing * 0.38 + (hash01(materialHash) - 0.5) * 1.15 + journey.turn,
      wavelength: 17 + index * 1.35 + hash01(materialHash + 19) * 5.5 + journey.dwell * (index + 1),
      phase: hash01(materialHash + 47) * Math.PI * 2 + journey.distance * (index + 1),
      weight: 0.72 + hash01(materialHash + 83) * 0.28
    };
  });
}
function fieldAt(field, x, z, origin) {
  if (!field.length) return { value: 0, phase: 0 };
  let sum = 0, sx = 0, sy = 0, weights = 0;
  for (const harmonic of field) {
    const projected = (x - origin.x) * Math.cos(harmonic.angle) + (z - origin.z) * Math.sin(harmonic.angle);
    const phase = projected / harmonic.wavelength * Math.PI * 2 + harmonic.phase;
    sum += Math.cos(phase) * harmonic.weight;
    sx += Math.cos(phase) * harmonic.weight;
    sy += Math.sin(phase) * harmonic.weight;
    weights += harmonic.weight;
  }
  return {
    value: sum / Math.max(weights, 1e-6),
    phase: Math.atan2(sy, sx)
  };
}
function waterFieldAt(water, x, z, origin) {
  const absorption = water.spectrumRingMicron;
  const wavelength = 14 + absorption * 7.05;
  const dx = x - origin.x, dz = z - origin.z;
  const radial = Math.hypot(dx, dz);
  const bearing = Math.atan2(dz, dx);
  const phase = radial / wavelength * Math.PI * 2 + bearing * 2 + water.thermalDeltaK * 0.031;
  return { value: Math.cos(phase), phase, wavelength };
}
export function evaluateMemoryFields(model, x, z) {
  const material = fieldAt(model.materialField ?? [], x, z, model.start);
  const water = waterFieldAt(model.water, x, z, model.start);
  const phaseDelta = Math.atan2(
    Math.sin(material.phase - water.phase),
    Math.cos(material.phase - water.phase)
  );
  return {
    material: material.value,
    water: water.value,
    materialPhase: material.phase,
    waterPhase: water.phase,
    phaseDelta,
    coherence: 0.5 + 0.5 * Math.cos(phaseDelta)
  };
}
function candidateSites(model, start) {
  const candidates = [];
  for (let ring = 1; ring <= 6; ring++) {
    const radius = 30 + ring * 25;
    const count = 18 + ring * 3;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + ring * 0.41;
      const x = start.x + Math.cos(angle) * radius;
      const z = start.z + Math.sin(angle) * radius * 0.82;
      const fields = evaluateMemoryFields(model, x, z);
      const phaseDelta = fields.phaseDelta;
      const coherence = fields.coherence;
      const reflectance = clamp01(0.5 + fields.material * 0.34 + coherence * 0.28);
      const density = clamp01(model.water.particleDensity * 0.85 + coherence * 0.62);
      candidates.push({ x, z, coherence, reflectance, density, phaseDelta, radius });
    }
  }
  return candidates.sort((a, b) => b.coherence - a.coherence || b.reflectance - a.reflectance);
}
function chooseSites(model, start) {
  const selected = [];
  for (const candidate of candidateSites(model, start)) {
    if (selected.some((site) => Math.hypot(site.x - candidate.x, site.z - candidate.z) < 48)) continue;
    selected.push(candidate);
    if (selected.length === 3) break;
  }
  selected.sort((a, b) => a.radius - b.radius);
  const objectives = [
    ["MATERIAL PHASE", "ALIGN SIX RECOVERED MATERIAL HARMONICS"],
    ["HYDRATION PHASE", "RESOLVE 1.9 \xB5M ABSORPTION IN GRANITE"],
    ["CONCORDANCE", "FIX THE GEOLOGICAL MEMORY INTERSECTION"]
  ];
  return selected.map((site, index) => ({
    ...site,
    id: `BODY03-MEM-${String(index + 1).padStart(2, "0")}`,
    order: index,
    objective: objectives[index][0],
    instruction: objectives[index][1],
    acquireRadius: 4.2,
    scanRadius: 6.4,
    scanHoldMs: 4200
  }));
}
export class MissionMemory {
  constructor(options = {}) {
    this.key = options.key ?? DEFAULT_MEMORY_KEY;
    this.storage = storageOrNull(options.storage);
    this.data = { version: MISSION_MEMORY_VERSION, samples: [], water: null };
    this.load();
    this.resetJourney();
  }

  resetJourney() {
    this.journey = { distance: 0, dwell: 0, turn: 0 };
    this.lastJourneyPoint = null;
  }

  // A bounded, session-only artistic mapping, not a geological simulation.
  recordJourney(probe, dt, world, enabled = true) {
    if (!enabled || !["terra", "desert"].includes(world)) {
      this.lastJourneyPoint = null;
      return;
    }
    if (!Number.isFinite(probe.x) || !Number.isFinite(probe.z)) return;
    const seconds = Math.max(0, Math.min(JOURNEY.maxStepSeconds, finite(dt)));
    const previous = this.lastJourneyPoint;
    if (previous?.world === world) {
      const dx = probe.x - previous.x;
      const dz = probe.z - previous.z;
      const distance = Math.hypot(dx, dz);
      if (distance < JOURNEY.maxStepDistance) {
        this.journey.distance = Math.min(
          JOURNEY.maxDistance,
          this.journey.distance + distance / JOURNEY.distanceScale
        );
        this.journey.turn = Math.max(
          -JOURNEY.maxTurn,
          Math.min(JOURNEY.maxTurn, this.journey.turn + (dx - dz) / JOURNEY.turnScale)
        );
        if (Math.abs(probe.speed) < JOURNEY.stationarySpeed) {
          this.journey.dwell = Math.min(
            JOURNEY.maxDwell,
            this.journey.dwell + seconds / JOURNEY.dwellScale
          );
        }
      }
    }
    this.lastJourneyPoint = { x: probe.x, z: probe.z, world };
  }
  get samplesReady() {
    return this.data.samples.length === REQUIRED_BODY01_SAMPLE_COUNT;
  }
  get waterReady() {
    return !!this.data.water?.confirmed;
  }
  get ready() {
    return this.samplesReady && this.waterReady;
  }
  load() {
    if (!this.storage) return this.snapshot();
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (parsed?.version !== MISSION_MEMORY_VERSION) return this.snapshot();
      this.data.samples = (parsed.samples ?? []).slice(0, REQUIRED_BODY01_SAMPLE_COUNT).map(cleanSample);
      this.data.water = cleanWater(parsed.water);
    } catch {
    }
    return this.snapshot();
  }
  persist() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data));
    } catch {
    }
  }
  recordSamples(input) {
    const raw = Array.isArray(input) ? input : input?.items ?? [];
    const sites = Array.isArray(input?.sites) ? input.sites : [];
    const count = Math.min(REQUIRED_BODY01_SAMPLE_COUNT, Math.max(0, Math.floor(input?.count ?? raw.length)));
    this.data.samples = raw.slice(0, count).map((sample, index) => cleanSample({
      ...sample,
      site: sample.site ?? sites[index]?.data ?? sites[index]
    }, index));
    this.persist();
    return this.snapshot();
  }
  recordWater(input) {
    this.data.water = cleanWater(input);
    this.persist();
    return this.snapshot();
  }
  composeBody03(options = {}) {
    if (!this.ready) return null;
    const start = copyPoint(options.start ?? { x: 120, z: 460 });
    const model = {
      id: "BODY03-GEOLOGICAL-MEMORY",
      source: { samples: this.data.samples.length, water: this.data.water.id },
      journey: { ...this.journey },
      materialField: fieldFromSamples(this.data.samples, this.journey),
      water: { ...this.data.water },
      start
    };
    model.sites = chooseSites(model, start);
    model.sites.forEach((site, index) => {
      site.scanHoldMs += Math.round(
        this.journey.dwell * JOURNEY.dwellHoldMs +
        this.journey.distance * index * JOURNEY.distanceHoldMs
      );
    });
    return model;
  }
  snapshot() {
    return {
      version: this.data.version,
      ready: this.ready,
      samplesReady: this.samplesReady,
      waterReady: this.waterReady,
      journey: this.journey ? { ...this.journey } : { distance: 0, dwell: 0, turn: 0 },
      samples: this.data.samples.map((sample) => ({ ...sample })),
      water: this.data.water ? {
        ...this.data.water,
        absorptionBandsMicron: [...this.data.water.absorptionBandsMicron]
      } : null
    };
  }
  clear() {
    this.resetJourney();
    this.data = { version: MISSION_MEMORY_VERSION, samples: [], water: null };
    try {
      this.storage?.removeItem(this.key);
    } catch {
    }
  }
}
