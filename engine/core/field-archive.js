export const FIELD_ARCHIVE_VERSION = 2;
export const DEFAULT_FIELD_ARCHIVE_KEY = "terra-incognita:field-archive:v2";
export const FIELD_ARCHIVE_CAPACITY = 24;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function storageOrNull(candidate) {
  if (candidate) return candidate;
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function cleanStation(source) {
  return {
    id: String(source?.id ?? "UNRESOLVED"),
    body: String(source?.body ?? "terra"),
    planet: String(source?.planet ?? "PLANET 01"),
    world: String(source?.world ?? "UNRESOLVED SURFACE"),
    label: String(source?.label ?? "UNRESOLVED DATUM"),
    x: finite(source?.x),
    z: finite(source?.z),
    radius: clamp(finite(source?.radius, 10), 1, 120),
    order: Math.max(0, Math.floor(finite(source?.order)))
  };
}

function cleanRecord(source) {
  const image = typeof source?.image === "string" && source.image.startsWith("data:image/")
    && source.image.length <= 900_000
    ? source.image
    : null;
  return {
    id: String(source?.id ?? "UNRESOLVED"),
    body: String(source?.body ?? "terra"),
    planet: String(source?.planet ?? "PLANET 01"),
    world: String(source?.world ?? "UNRESOLVED SURFACE"),
    label: String(source?.label ?? "UNRESOLVED DATUM"),
    x: finite(source?.x),
    z: finite(source?.z),
    heading: finite(source?.heading),
    shot: String(source?.shot ?? "WIDE"),
    frame: Math.max(0, Math.floor(finite(source?.frame))),
    capturedAt: Math.max(0, finite(source?.capturedAt)),
    image
  };
}

export class FieldArchive {
  constructor(options = {}) {
    this.key = options.key ?? DEFAULT_FIELD_ARCHIVE_KEY;
    this.storage = storageOrNull(options.storage);
    this.data = { version: FIELD_ARCHIVE_VERSION, stations: [], records: [] };
    this.load();
  }
  load() {
    if (!this.storage) return this.snapshot();
    try {
      const stored = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (stored?.version !== FIELD_ARCHIVE_VERSION) return this.snapshot();
      this.data.stations = (stored.stations ?? []).map(cleanStation).slice(0, FIELD_ARCHIVE_CAPACITY);
      this.data.records = (stored.records ?? []).map(cleanRecord).slice(0, FIELD_ARCHIVE_CAPACITY);
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
  registerStations(stations = []) {
    let changed = false;
    for (const source of stations) {
      const station = cleanStation(source);
      const index = this.data.stations.findIndex((entry) => entry.id === station.id);
      if (index < 0) {
        this.data.stations.push(station);
        changed = true;
      } else if (JSON.stringify(this.data.stations[index]) !== JSON.stringify(station)) {
        this.data.stations[index] = station;
        changed = true;
      }
    }
    this.data.stations.sort((a, b) => a.body.localeCompare(b.body) || a.order - b.order);
    this.data.stations = this.data.stations.slice(0, FIELD_ARCHIVE_CAPACITY);
    if (changed) this.persist();
    return this.snapshot();
  }
  has(id) {
    return this.data.records.some((record) => record.id === id);
  }
  observe({ stations = [], body, rover, shot, now = performance.now(), image = null, minSpeed = 0 } = {}) {
    if (!rover?.pos || !body) return null;
    if (this.data.records.length >= FIELD_ARCHIVE_CAPACITY || Math.abs(finite(rover.speed)) < Math.max(0, finite(minSpeed))) return null;
    for (const source of stations) {
      const station = cleanStation(source);
      if (station.body !== body || this.has(station.id)) continue;
      if (Math.hypot(rover.pos.x - station.x, rover.pos.z - station.z) > station.radius) continue;
      const record = cleanRecord({
        ...station,
        heading: rover.heading,
        shot,
        frame: this.data.records.length + 1,
        capturedAt: now,
        image: typeof image === "function" ? image() : image
      });
      this.data.records.push(record);
      this.data.records.sort((a, b) => a.frame - b.frame);
      this.persist();
      return { ...record };
    }
    return null;
  }
  snapshot() {
    return {
      version: this.data.version,
      stations: this.data.stations.map((station) => ({ ...station })),
      records: this.data.records.map((record) => ({ ...record })),
      captured: this.data.records.length
    };
  }
  clear() {
    this.data = { version: FIELD_ARCHIVE_VERSION, stations: [], records: [] };
    try {
      this.storage?.removeItem(this.key);
    } catch {
    }
  }
}
