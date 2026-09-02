export const FIELD_ARCHIVE_VERSION = 4;
export const DEFAULT_FIELD_ARCHIVE_KEY = "terra-incognita:field-archive:v4";
export const FIELD_ARCHIVE_CAPACITY = 24;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const CAPTURE_SCHEDULE = Object.freeze({
  terra: Object.freeze(["fisheye", "wide", "tele", "macro", "rear", "panorama"]),
  desert: Object.freeze(["wide", "tele", "fisheye", "portrait", "rear", "macro", "panorama"]),
  granite: Object.freeze(["panorama", "macro", "portrait", "tele", "fisheye"])
});
export const ARCHIVE_CAPTURE_PROFILES = Object.freeze({
  fisheye: Object.freeze({ lens: "FISHEYE 8MM", viewpoint: "MAST / FORWARD", aspect: 1, zoom: 1.04, focusX: .5, focusY: .52, projection: "fisheye" }),
  wide: Object.freeze({ lens: "ULTRAWIDE 18MM", viewpoint: "LOW FRONT", aspect: 16 / 9, zoom: 1.08, focusX: .5, focusY: .56, projection: "rectilinear" }),
  rear: Object.freeze({ lens: "STANDARD 35MM", viewpoint: "REAR FOLLOW", aspect: 3 / 2, zoom: 1.28, focusX: .5, focusY: .53, projection: "rectilinear" }),
  tele: Object.freeze({ lens: "TELEPHOTO 120MM", viewpoint: "MATERIAL FACE", aspect: 4 / 3, zoom: 2.24, focusX: .53, focusY: .5, projection: "rectilinear" }),
  macro: Object.freeze({ lens: "MACRO 90MM", viewpoint: "GROUND CLOSE", aspect: 4 / 5, zoom: 2.82, focusX: .5, focusY: .68, projection: "rectilinear" }),
  portrait: Object.freeze({ lens: "WIDE 24MM", viewpoint: "LATERAL RISE", aspect: 3 / 4, zoom: 1.6, focusX: .64, focusY: .5, projection: "rectilinear" }),
  panorama: Object.freeze({ lens: "PANORAMA 24MM", viewpoint: "HORIZON SWEEP", aspect: 2.39, zoom: 1.04, focusX: .46, focusY: .5, projection: "rectilinear" })
});

const stationOrder = (source) => {
  const explicit = finite(source?.order, NaN);
  if (Number.isFinite(explicit)) return Math.max(0, Math.floor(explicit));
  const fromId = String(source?.id ?? "").match(/-(\d+)$/);
  return fromId ? Math.max(0, Number(fromId[1]) - 1) : 0;
};

export function archiveCaptureProfile(source = {}) {
  const body = String(source?.body ?? "terra");
  const schedule = CAPTURE_SCHEDULE[body] ?? CAPTURE_SCHEDULE.terra;
  const requested = String(source?.capture?.profile ?? schedule[stationOrder(source) % schedule.length]);
  const base = ARCHIVE_CAPTURE_PROFILES[requested] ?? ARCHIVE_CAPTURE_PROFILES.wide;
  const capture = source?.capture ?? {};
  return {
    profile: ARCHIVE_CAPTURE_PROFILES[requested] ? requested : "wide",
    lens: String(capture.lens ?? base.lens),
    viewpoint: String(capture.viewpoint ?? base.viewpoint),
    aspect: clamp(finite(capture.aspect, base.aspect), .5, 2.5),
    zoom: clamp(finite(capture.zoom, base.zoom), 1, 3.2),
    focusX: clamp(finite(capture.focusX, base.focusX), 0, 1),
    focusY: clamp(finite(capture.focusY, base.focusY), 0, 1),
    projection: capture.projection === "fisheye" ? "fisheye" : "rectilinear"
  };
}

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
    order: stationOrder(source),
    resourceItem: source?.resourceItem == null ? null : Math.max(0, Math.floor(finite(source.resourceItem))),
    resourceVariant: source?.resourceVariant == null ? null : Math.max(0, Math.floor(finite(source.resourceVariant))),
    archiveRole: ["unresolved", "evidence", "potential"].includes(source?.archiveRole) ? source.archiveRole : "unresolved",
    potentialCount: Math.max(0, Math.floor(finite(source?.potentialCount))),
    resolved: !!source?.resolved,
    capture: archiveCaptureProfile(source)
  };
}

function cleanRecord(source) {
  const image = typeof source?.image === "string" && source.image.startsWith("data:image/")
    && source.image.length <= 900_000
    ? source.image
    : null;
  const capture = archiveCaptureProfile(source);
  const imageWidth = Math.max(0, Math.floor(finite(source?.imageWidth)));
  const imageHeight = Math.max(0, Math.floor(finite(source?.imageHeight)));
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
    kind: source?.kind === "resource-evidence" ? "resource-evidence" : "camera-return",
    image,
    imageWidth,
    imageHeight,
    capture
  };
}

function capturePayload(image, capture, station) {
  const result = typeof image === "function" ? image(capture, station) : image;
  if (result && typeof result === "object") {
    return {
      image: result.image ?? null,
      imageWidth: result.width,
      imageHeight: result.height,
      capture: result.capture ?? capture
    };
  }
  return { image: result, capture };
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
      let stored = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (!stored && this.key === DEFAULT_FIELD_ARCHIVE_KEY) {
        for (const key of ["terra-incognita:field-archive:v3", "terra-incognita:field-archive:v2"]) {
          stored = JSON.parse(this.storage.getItem(key) ?? "null");
          if (stored) break;
        }
      }
      if (![2, 3, FIELD_ARCHIVE_VERSION].includes(stored?.version)) return this.snapshot();
      this.data.stations = (stored.stations ?? []).map(cleanStation).slice(0, FIELD_ARCHIVE_CAPACITY);
      this.data.records = (stored.records ?? []).map(cleanRecord).slice(0, FIELD_ARCHIVE_CAPACITY);
      if (stored.version !== FIELD_ARCHIVE_VERSION) this.persist();
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
      } else if (this.data.stations[index].resolved && !station.resolved && station.archiveRole === "unresolved") {
        continue;
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
      const station = cleanStation(this.data.stations.find((entry) => entry.id === source?.id) ?? source);
      if (station.body !== body || station.archiveRole === "potential" || this.has(station.id)) continue;
      if (Math.hypot(rover.pos.x - station.x, rover.pos.z - station.z) > station.radius) continue;
      const capture = archiveCaptureProfile(station);
      const record = cleanRecord({
        ...station,
        heading: rover.heading,
        shot,
        frame: this.data.records.length + 1,
        capturedAt: now,
        ...capturePayload(image, capture, station)
      });
      this.data.records.push(record);
      this.data.records.sort((a, b) => a.frame - b.frame);
      this.persist();
      return { ...record };
    }
    return null;
  }
  resolveResource({ itemIndex, site, alternatives = [], rover, shot, now = performance.now(), image = null } = {}) {
    const resourceItem = Math.floor(finite(itemIndex, -1));
    if (resourceItem < 0 || !site) return null;
    const slots = this.data.stations
      .filter((station) => station.body === "terra" && station.resourceItem === resourceItem)
      .sort((a, b) => a.order - b.order);
    if (slots.length < 2) return null;
    const exact = slots.find((station) => station.resourceVariant === Math.floor(finite(site.variant, -1)));
    const evidenceSlot = exact ?? slots[0];
    const potentialSlot = slots.find((station) => station.id !== evidenceSlot.id) ?? slots[1];
    const unresolved = alternatives.filter((candidate) =>
      Math.floor(finite(candidate?.item, -1)) === resourceItem &&
      Math.floor(finite(candidate?.variant, -1)) !== Math.floor(finite(site.variant, -1))
    );
    const centroid = unresolved.reduce((sum, candidate) => ({
      x: sum.x + finite(candidate.x),
      z: sum.z + finite(candidate.z)
    }), { x: 0, z: 0 });
    const potentialCount = unresolved.length;
    const baseLabel = String(site.label ?? evidenceSlot.label).replace(/\s*\xB7\s*(?:FIELD\s*\d+|EVIDENCE|RESOLVED POTENTIAL.*)$/i, "");
    const evidence = cleanStation({
      ...evidenceSlot,
      x: finite(site.x),
      z: finite(site.z),
      label: `${baseLabel} \xB7 EVIDENCE`,
      resourceVariant: Math.max(0, Math.floor(finite(site.variant))),
      archiveRole: "evidence",
      potentialCount: 0,
      resolved: true
    });
    const potential = cleanStation({
      ...potentialSlot,
      x: potentialCount ? centroid.x / potentialCount : potentialSlot.x,
      z: potentialCount ? centroid.z / potentialCount : potentialSlot.z,
      label: `${baseLabel} \xB7 RESOLVED POTENTIAL \xD7${potentialCount}`,
      archiveRole: "potential",
      potentialCount,
      resolved: true
    });
    this.data.stations = this.data.stations.map((station) =>
      station.id === evidence.id ? evidence : station.id === potential.id ? potential : station
    );
    this.data.records = this.data.records.filter((record) => record.id !== evidence.id && record.id !== potential.id);
    const capture = archiveCaptureProfile(evidence);
    const record = cleanRecord({
      ...evidence,
      heading: rover?.heading,
      shot,
      frame: this.data.records.length + 1,
      capturedAt: now,
      kind: "resource-evidence",
      ...capturePayload(image, capture, evidence)
    });
    this.data.records.push(record);
    this.data.records.sort((a, b) => a.frame - b.frame);
    this.persist();
    return { station: { ...evidence }, record: { ...record }, potential: { ...potential } };
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
