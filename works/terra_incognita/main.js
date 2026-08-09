/**
 * Terra Incognita
 * 20th solo exhibition · work 01
 *
 * An unmanned probe crosses an airless planet toward a Schwarzschild mass.
 * The ground is the effective potential, so the circular rampart that hides
 * the horizon is the angular-momentum barrier and not a designed landform.
 * The probe cannot climb it head-on — traction runs out first — so the route
 * is found by driving along the equation until it opens.
 *
 * Everything structural is the engine. This file is what THIS world is.
 */

import * as THREE from 'three';
import {
  configure, deviceTier, universeSeed, DEV,
  Clipmap, Field, Scatter, Wake, Dust, Sandstorm, ResolutionTransferFX, Beam, buildSky,
  createRenderer, describeAdapter, unsupported, fatal, enableTimestamps, captureDeviceErrors,
  Lens, Adaptive, Hud, Captions, Kiosk, Ambient, PlanetTransfer, MobileControl, Restoration, DockingSequence, VoyageSequence, Rover, Lander, Power,
  uObserverR, nuRatioCPU, uLampPower,
} from '../../engine/index.js';
import { T, BH } from './spec.js';
import {
  heightGPU, heightCPU, solarAccessCPU, potential, shadeGround, albedoGround,
  shadeBlade, shadeSky, setWorldMode,
} from './surface.js';
import { MiniMap, Optics, Survey } from '../../engine/core/survey.js';

/* ── this world ───────────────────────────────────────────────────────── */
const tier = deviceTier();
const pick = o => o[tier];
const ARCHIVE_AT_BOOT = tier === 'low';

const CFG = configure({
  tier,
  lattice: { seed: (T.seedBase + universeSeed()) >>> 0 },
  metric: { rs: BH.rs },
  scatter: {
    rings: [
      { r0: 0,  r1: 25.5, seg: 6, cell: pick({ high: 0.085, mid: 0.125, low: 0.210 }) },
      { r0: 22, r1: 67.5, seg: 3, cell: pick({ high: 0.290, mid: 0.420, low: 0.700 }) },
      { r0: 64, r1: 136,  seg: 1, cell: pick({ high: 0.660, mid: 1.000, low: 1.750 }) },
    ],
    fadeBand: 3.5, clumpCell: 2.35, minPixels: 1.3,
    length: 0.58, width: 0.019, bend: 0.62, breath: 0.17, breathRate: 0.21,
    spineBoost: 0.95, slopeGate: [0.055, 0.300],
  },
  /* Deliberate survey pace: enough time for distance to register as distance. */
  vehicle: { cruise: 2.0, boost: 6.0 },
  /* Exponential fog previously reached 50% at 42.0 m. At this density the
     half-distance is 86.6 m, so the plain remains legible beyond 60 m. */
  atmosphere: { fogDensity: 0.0080 },
  /* Full-colour optics retain a restrained halo around true signals while
     preserving the rover's facets and the terrain's crimson bands. Archive
     mode bypasses Lens entirely, so this has no low-tier cost. */
  post: { bloomStrength: 0.035, bloomRadius: 0.34, bloomThreshold: 1.20,
          focusMin: 2.0, focusMax: 90, focalLength: 0.16, bokeh: 1.15 },
  kiosk: { idleMs: 240000 },
  audio: { droneEmitR: BH.rs * 1.01 },
});

const LINES = [
  { r: 540.0,  ko: '통신 반송파 미검출 · 왕복 지연 산출 불가',
               en: 'COMMS · RETURN CARRIER NOT ACQUIRED' },
  { r: 500.0,  ko: '광물층 비등방 전단 배열 검출 · 방사 대칭 불일치',
               en: 'GEOLOGY · ANISOTROPIC SHEAR LAMINAE' },
  { r: 380.0,  ko: '대기 성분 미량 검출 · 신호대잡음비 기준 미달',
               en: 'ATMOSPHERE · TRACE BELOW CONFIDENCE THRESHOLD' },
  { r: 312.97, ko: '중력 퍼텐셜 국소 극값 · r = 312.97 m',
               en: 'GRAVITY · LOCAL EXTREMUM / R 312.97 M' },
  { r: 250.0,  ko: '주변 생체 신호 0 · 수동 응답 채널 무입력',
               en: 'BIOSCAN · LOCAL SIGNALS 0 / MANUAL CHANNEL IDLE' },
  { r: 150.0,  ko: '방사선 플럭스 상승 · 태양전지 출력 유지',
               en: 'RADIATION · FLUX RISING / ARRAY OUTPUT NOMINAL' },
  { r: 74.23,  ko: '각운동량 장벽 검출 · 불안정 원궤도 r = 74.23 m',
               en: 'GRAVITY · UNSTABLE ORBIT / R 74.23 M' },
  { r: 60.0,   ko: '폐곡선 광경로 검출 · 광자구면 r = 60.00 m',
               en: 'OPTICS · CLOSED NULL PATH / R 60.00 M' },
  { r: 45.0,   ko: '관측 광도 1.4% · 적색편이 보정 한계 접근',
               en: 'OPTICS · OBSERVED LUMINANCE 1.4% / CORRECTION LIMIT' },
  { r: 41.0,   ko: '좌표 시간 발산 · 외부 기준 도달값 없음',
               en: 'METRIC · COORDINATE TIME DIVERGENT / ARRIVAL UNDEFINED' },
];

const TERRA_SURVEY = [
  [540, 'COMMS · RETURN CARRIER / NOT ACQUIRED'],
  [500, 'GEOLOGY · ANISOTROPIC SHEAR LAMINAE'],
  [380, 'ATMOSPHERE · TRACE / BELOW THRESHOLD'],
  [313, 'GRAVITY · ORBITAL ANOMALY / LOCKED'],
  [250, 'BIOSCAN · LOCAL SIGNALS / 0'],
  [150, 'RADIATION · FLUX RISING'],
  [74.23, 'GRAVITY · ANGULAR BARRIER'],
  [60, 'OPTICS · PHOTON SHELL'],
  [45, 'ATMOSPHERE · SIGNAL LOST'],
];

const DESERT_SURVEY = [
  [500, 'COMMS · RETURN CARRIER / NOT ACQUIRED'],
  [460, 'ATMOSPHERE · CHARGED SILICATE DRIFT'],
  [350, 'WIND · EASTWARD SHEAR / 5.2 M·S⁻¹'],
  [245, 'GROUND · YARDANG / SINTERED CRUST'],
  [140, 'MINERAL · GLASS PHASE / DISCONTINUOUS'],
  [90, 'BIOSCAN · LOCAL SIGNALS / 0'],
];

const DESERT_LINES = [
  { r: 500, ko: '통신 반송파 미검출 · 원격 운용 채널 대기', en: 'COMMS · RETURN CARRIER NOT ACQUIRED' },
  { r: 460, ko: '규산염 하전 입자 검출 · 저층 이류 활성', en: 'ATMOSPHERE · CHARGED SILICATE DRIFT' },
  { r: 350, ko: '풍속 벡터 +X 5.2 m·s⁻¹ · 횡성분 0.72 m·s⁻¹', en: 'WIND · VECTOR +X 5.2 M·S⁻¹ / CROSS 0.72' },
  { r: 245, ko: '야르당 능선·소결 지각 교차 검출 · 표면 모델 갱신', en: 'GROUND · YARDANG / SINTERED CRUST' },
  { r: 140, ko: '유리질 광물상 불연속 분포 · 반사율 편차 증가', en: 'MINERAL · GLASS PHASE / ALBEDO VARIANCE' },
  { r: 90, ko: '주변 생체 신호 0 · 응답 패킷 0', en: 'BIOSCAN · LOCAL SIGNALS 0 / RETURN PACKETS 0' },
];

const GRANITE_SURVEY = [
  [500, 'COMMS · RETURN CARRIER / NOT ACQUIRED'],
  [460, 'PETROLOGY · QUARTZ / ALKALI FELDSPAR'],
  [365, 'GROUND · WEATHERED GRANITE PLAIN'],
  [280, 'WEATHERING · SPHEROIDAL EXFOLIATION'],
  [190, 'FRACTURE · JOINT SET / LOW DENSITY'],
  [95, 'ATMOSPHERE · INERT TRACE / STABLE'],
  [60, 'BIOSCAN · LOCAL SIGNALS / 0'],
];

const GRANITE_LINES = [
  { r: 500, ko: '통신 반송파 미검출 · 원격 운용 채널 대기', en: 'COMMS · RETURN CARRIER NOT ACQUIRED' },
  { r: 460, ko: '광물 조성 분석 · 규산염 성분 우세', en: 'PETROLOGY · QUARTZ / ALKALI FELDSPAR DOMINANT' },
  { r: 365, ko: '완만한 지표 구조 검출 · 경사 편차 낮음', en: 'GROUND · WEATHERED GRANITE PLAIN' },
  { r: 280, ko: '완만한 바위 구조 검출 · 표면 경사 완만', en: 'WEATHERING · SPHEROIDAL EXFOLIATION' },
  { r: 190, ko: '바위 간격 증가 · 표면 파열 감소', en: 'FRACTURE · JOINT SPACING WIDE / DENSITY LOW' },
  { r: 95, ko: '불활성 대기 미량 검출 · 층류 상태 안정', en: 'ATMOSPHERE · INERT TRACE / LAMINAR STABLE' },
  { r: 60, ko: '주변 생체 신호 0 · 응답 패킷 0', en: 'BIOSCAN · LOCAL SIGNALS 0 / RETURN PACKETS 0' },
];

const TRANSFER_LINE = {
  r: 0, ko: '탐사 메모리 패킷 송신 · 원격 몸체 연결 대기', en: 'Survey memory is transmitted to the next body',
};

const DOCKING_LINES = Object.freeze({
  recall: { r: 0, ko: '복원 키 8/8 · 귀환 좌표 압축', en: 'RECOVERY 8/8 · COORDINATE RECALL' },
  ramp: { r: 0, ko: '착륙선 격납 경로 개방', en: 'LANDER · STOW PATH OPENING' },
  approach: { r: 0, ko: '실접지 귀환 · 8륜 구동 유지', en: 'FINAL APPROACH · EIGHT CONTACTS LIVE' },
  secure: { r: 0, ko: '격납 위치 고정 · 구조광 소거', en: 'ROVER SECURED · LOCATORS FALL SILENT' },
  docked: { r: 0, ko: '탐사선 격납 완료 · 비행 잠금', en: 'ROVER STOWED · FLIGHT INTERLOCK' },
});

const VOYAGE_LINES = Object.freeze({
  'flight-lock': { r: 0, ko: '격납 질량 고정 · 비행 인터록 해제', en: 'STOW MASS LOCKED · FLIGHT INTERLOCK RELEASED' },
  fold: { r: 0, ko: '6개 착륙 지지계 수납', en: 'SIX LANDING LOAD PATHS · RETRACTING' },
  lift: { r: 0, ko: '표면 기준 분리 · 저속 상승', en: 'SURFACE DATUM RELEASED · LOW ASCENT' },
  transit: { r: 0, ko: '관성 기준 전환 · 목적지 좌표 동기', en: 'INERTIAL FRAME · DESTINATION COORDINATES LOCKED' },
  descent: { r: 0, ko: '다음 행성 지표 획득 · 하강', en: 'NEXT BODY ACQUIRED · CONTROLLED DESCENT' },
  touchdown: { r: 0, ko: '6점 접지 확인', en: 'SIX-POINT GROUND CONTACT CONFIRMED' },
  egress: { r: 0, ko: '격납 해제 · 탐사선 재배치', en: 'STOW RELEASE · ROVER REDEPLOYMENT' },
  deployed: { r: 0, ko: 'BODY 02 탐사 운행 재개', en: 'BODY 02 · SURVEY DRIVE RESUMED' },
});

const DESERT_ARRIVAL_LINE = {
  r: 0, ko: 'BODY 02 기동 대기 · 왕복 통신 응답 없음', en: 'REMOTE BODY 02 · RETURN CARRIER NOT ACQUIRED',
};

const TERRA_ARRIVAL_LINE = {
  r: 0, ko: 'BODY 01 재연결 · 전단 지질 좌표계 복구', en: 'REMOTE BODY 01 · SHEAR FRAME RESTORED',
};

const GRANITE_ARRIVAL_LINE = {
  r: 0, ko: 'BODY 03 기동 대기 · 지표 기준 좌표 동기 완료', en: 'REMOTE BODY 03 · LITHIC FRAME SYNCHRONIZED',
};

const DESERT_START = [96, 520];
const GRANITE_START = [-168, 486];

const PLANETS = Object.freeze({
  terra: Object.freeze({
    key: 'terra', number: 1, id: 'BODY 01', label: 'SHEAR BODY', start: BH.start,
    mode: 'terra', metric: true, storm: false, initialCharge: 1,
    lines: LINES, survey: TERRA_SURVEY, arrivalLine: TERRA_ARRIVAL_LINE,
    arrivalKo: '전단 행성 · 원격 몸체 연결', arrivalEn: 'SHEAR BODY · REMOTE BODY 01',
  }),
  desert: Object.freeze({
    key: 'desert', number: 2, id: 'BODY 02', label: 'YARDANG FIELD', start: DESERT_START,
    mode: 'desert', metric: false, storm: true, initialCharge: 0.86,
    lines: DESERT_LINES, survey: DESERT_SURVEY, arrivalLine: DESERT_ARRIVAL_LINE,
    arrivalKo: '야르당 행성 · 원격 몸체 연결', arrivalEn: 'YARDANG ARCHIVE · REMOTE BODY 02',
  }),
  granite: Object.freeze({
    key: 'granite', number: 3, id: 'BODY 03', label: 'GRANITE PLAIN', start: GRANITE_START,
    mode: 'granite', metric: false, storm: false, initialCharge: 0.82,
    lines: GRANITE_LINES, survey: GRANITE_SURVEY, arrivalLine: GRANITE_ARRIVAL_LINE,
    arrivalKo: '돌·바위 행성 · 원격 몸체 연결', arrivalEn: 'GRANITE PLAIN · REMOTE BODY 03',
  }),
});
const PLANET_KEY_BY_CODE = Object.freeze({
  Digit1: 'terra', Digit2: 'desert', Digit3: 'granite',
  Numpad1: 'terra', Numpad2: 'desert', Numpad3: 'granite',
});
const TRANSFER_CAMERA = Object.freeze({
  departMs: 2800,
  arriveMs: 4400,
  front: Object.freeze({ yaw: Math.PI, pitch: 0.18, dist: 7.8 }),
  rear: Object.freeze({ yaw: 0.05, pitch: 0.30, dist: 28.5 }),
});
const OPENING_CAMERA_MS = 6000;
const openingCam = {
  midpoint: new THREE.Vector3(), position: new THREE.Vector3(), aim: new THREE.Vector3(),
  rearPosition: new THREE.Vector3(), rearQuaternion: new THREE.Quaternion(),
};

const ROWS = [
  ['Instrument', [['backend', 'Backend'], ['vendor', 'Vendor'], ['tier', 'Tier'], ['mode', 'Render mode'], ['limits', 'Limits']]],
  ['Surface',    [['grid', 'Grid'], ['tris', 'Triangles'], ['cell', 'Cell'], ['span', 'Span']]],
  ['Clipmap',    [['origin', 'Origin'], ['recentre', 'Recentres'],
                  ['rcT', 'rebuild · ground'], ['rcF', 'rebuild · field'], ['rcL', 'rebuild · filaments']]],
  ['Field',      [['fcount', 'Instances'], ['fverts', 'Vertices'], ['frings', 'Rings'], ['fgrid', 'Field grid']]],
  ['Probe',      [['pos', 'Position'], ['ground', 'Ground'], ['speed', 'Speed'],
                  ['odo', 'Odometer'], ['att', 'Pitch / roll'], ['trac', 'Traction'],
                  ['lamps', 'Headlights'], ['susp', 'Suspension'], ['view', 'View']]],
  ['Power',      [['cell', 'Cell'], ['array', 'Array'], ['lid', 'Lid'], ['load', 'Load'],
                  ['endur', 'Endurance']]],
  ['Reconstruction', [['recon', 'Lander modules']]],
  ['Metric',     [['r', 'r · observer'], ['region', 'Region'], ['lapse', '√(1−rs/r)'], ['nu', 'ν at barrier']]],
  ['Lens',       [['dpr', 'Pixel ratio'], ['focus', 'Focus'], ['score', 'Score']]],
  ['Gallery',    [['universe', 'Universe'], ['idle', 'Idle']]],
  ['Verification', [['hcpu', 'h · cpu'], ['hgpu', 'h · gpu'], ['delta', 'Divergence']]],
];

/* ── gate ─────────────────────────────────────────────────────────────── */
const HALT = () => new Promise(() => {});

/* `?safe` disables the lens and the wake — the two subsystems that can fail
   independently of the world itself. If the work runs in safe mode, the fault
   is in one of them, and that is one reload rather than a bisect. */
const SAFE = location.search.includes('safe');

/* Subsystems that can be switched off from the address bar, for bisecting a
   fault on a machine that is not the author's. `?safe` implies all of them,
   and the instrument panel names whatever is off, so one screenshot says
   which build it is. */
const OFF = new Set(location.search.replace(/^\?/, '').split(/[&,]/).filter(Boolean));
const off = name => SAFE || OFF.has('no' + name);

/* Nothing may fail silently. A throw inside a top-level-await module is an
   unhandled rejection and leaves a black screen, which in a gallery is
   indistinguishable from a work that is simply very dark. */
addEventListener('error', e => fatal(e.error ?? e.message, 'window'));
addEventListener('unhandledrejection', e => fatal(e.reason, 'promise'));
if (!navigator.gpu) { unsupported('api', 'Terra Incognita'); await HALT(); }

const canvas = document.getElementById('gl');
let renderer, camera;
try { ({ renderer, camera } = createRenderer(canvas)); }
catch (e) { fatal(e, 'renderer'); await HALT(); }

/* Initialise and verify the backend BEFORE anything is built: three falls back
   to WebGL2 without throwing when no adapter is available, and on that path
   every compute pass here is impossible. */
try { await renderer.init(); }
catch (e) { fatal(e, 'device'); await HALT(); }
if (renderer.backend?.isWebGPUBackend !== true) { unsupported('adapter'); await HALT(); }

/* A WebGPU validation error does not throw — it goes to the device, three logs
   it, and the visitor gets a black screen. Put it on the wall instead. */
captureDeviceErrors(renderer, err => { running = false; fatal(err, 'gpu'); });

/* ── module state ──────────────────────────────────────────────────────────
   EVERY piece of module-scope state is declared here, above the first line
   that could touch it. This is not tidiness. `rebuild()` writes to `rc`, and
   `rc` used to be declared below the first `await rebuild()` — a temporal dead
   zone that threw `Cannot access 'rc' before initialization` on every machine
   that got past the adapter gate. Inside a top-level-await module that throw
   is an unhandled rejection, so the only symptom was a black screen.
   Declarations are hoisted; initialisations are not. */
let scene, hud, captions, ambient, kiosk, ground, field, wake, dust, storm, transferFx, scatter, beam, sky, landmark, rover, lander, restoration, docking, voyage, power, lens, adaptive, minimap, optics, survey, transmission, mobileControl;
let world = 'terra';
let landerPresent = true;
let archiveMode = false, lastArchiveFrame = 0, archiveCueTimer = 0;
let arrivalHoldUntil = 0;
let departureOrbit = null, arrivalOrbit = null;
let openingShot = null;
let nextAutoPauseAt = 0, autoPauseUntil = 0;
let released = false;      // the prologue has let go of the rover
let running = false, hasTimestamp = false;
let rafId = 0;
let tPrev = 0, tStamp = 0, tProbe = 0, frames = 0, acc = 0;
const rc = { ground: 0, field: 0, scatter: 0 };
const planetMemory = new Map();
try {
scene = new THREE.Scene();
hud = new Hud(ROWS);
captions = new Captions(LINES);
ambient = new Ambient();
kiosk = new Kiosk(CFG.kiosk.idleMs);

wake = new Wake();                       // built first: the ground reads it
dust = off('dust') ? null : new Dust(heightCPU);   // low-gravity ejecta returns to this terrain
storm = new Sandstorm(heightCPU);
ground = new Clipmap({
  height: heightGPU, shade: shadeGround(CFG.color),
  albedo: albedoGround(CFG.color), wake,
});
field = new Field(ground, { potential });
scatter = new Scatter(ground, field, wake, { shade: shadeBlade(CFG.color) });
beam = off('beam') ? { meshes: [] } : new Beam(ground);
sky = buildSky(shadeSky);
/* A non-emissive, unreachable datum on the destination horizon. Unlike a
   celestial flare it cannot bloom or reward approach; it only supplies scale. */
landmark = new THREE.Mesh(
  new THREE.ConeGeometry(0.85, 16, 3),
  new THREE.MeshBasicMaterial({ color: 0x08090b, transparent: true, opacity: 0.72 }),
);
landmark.rotation.set(0.10, 0.42, -0.035);
landmark.visible = false;
rover = new Rover(camera, canvas, heightCPU);
mobileControl = new MobileControl(rover);
lander = new Lander(heightCPU);
restoration = new Restoration(lander);
transferFx = new ResolutionTransferFX(rover.group);
docking = new DockingSequence({
  rover, lander, effect: transferFx, camera,
  onCue: (phase, now) => {
    openingShot = null;
    const line = DOCKING_LINES[phase];
    if (line) captions.force(line, now, phase === 'docked' ? 12000 : 4600);
    if (phase === 'recall') {
      transmission.trigger.disabled = true;
      kiosk.last = now;
    }
    if (phase === 'docked') transmission.trigger.textContent = 'ROVER STOWED · FLIGHT LOCK';
  },
});
voyage = new VoyageSequence({
  rover, lander, camera, ambient,
  onSwap: prepareVoyageDestination,
  onSpace: active => {
    sky.visible = !active; ground.mesh.visible = !active;
    for (const mesh of scatter.meshes) mesh.visible = !active && PLANETS[world].metric;
    for (const mesh of beam.meshes) mesh.visible = !active && PLANETS[world].metric;
    landmark.visible = !active && world === 'desert';
    if (active) { dust?.clear(); storm.setActive(false); }
  },
  onCue: (phase, now, destination) => {
    const line = VOYAGE_LINES[phase];
    if (line) captions.force(line, now, phase === 'transit' ? 11800 : 4800);
    transmission.trigger.disabled = true;
    transmission.trigger.textContent = phase === 'transit'
      ? `${destination.id} · COORDINATE LOCK` : 'LANDER FLIGHT · SEQUENCE';
    kiosk.last = now;
  },
  onComplete: (destination, now) => {
    rover.auto = true; rover.missionHold = false; rover.disabled = false;
    nextAutoPauseAt = now + 36000;
    storm.setActive(destination.storm, { x: rover.pos.x, z: rover.pos.z });
    transmission.trigger.disabled = true;
    transmission.trigger.textContent = `${destination.id} · SURVEY ACTIVE`;
    captions.force(destination.arrivalLine, now, 6200);
  },
});
power = new Power(heightCPU, solarAccessCPU);
minimap = new MiniMap(document.getElementById('ti-minimap'), BH.start, {
  heightAt: heightCPU, id: 'BODY 01', label: 'SHEAR BODY', restoration,
});
optics = new Optics();
survey = new Survey(heightCPU, TERRA_SURVEY);
transmission = new PlanetTransfer({
  minimap, survey, effect: transferFx, ambient, orientMs: TRANSFER_CAMERA.departMs,
  onBegin: reason => {
    openingShot = null;
    camera.fov = CFG.atmosphere.fov; camera.updateProjectionMatrix();
    rover.auto = false; rover.transmitting = true; rover.disabled = reason === 'power';
    beginDepartureOrbit();
    rover.update(0);
    captions.force(TRANSFER_LINE, performance.now(), 7600);
    kiosk.last = performance.now();
  },
  onOrient: p => updateDepartureOrbit(p),
  onBlackout: enterPlanet,
  onArrived: (_reason, _snapshot, destination) => {
    const now = performance.now();
    const planet = PLANETS[destination.key];
    rover.disabled = false; rover.transmitting = true; rover.auto = false; rover.lamps = true;
    rover.setViewMode('cinematic', TRANSFER_CAMERA.front);
    beginArrivalOrbit(now);
    arrivalHoldUntil = now + TRANSFER_CAMERA.arriveMs;
    ambient.silenceFor(TRANSFER_CAMERA.arriveMs);
    transmission.trigger.disabled = true;
    captions.force(planet.arrivalLine, now, 5200);
  },
});
transmission.bindRequest(() => requestNextPlanet('manual'));

scene.add(sky, landmark, ground.mesh, ...scatter.meshes, ...beam.meshes, lander.group, restoration.group, voyage.group,
          ...(dust ? [dust.points] : []), storm.points, rover.group, survey.group, transferFx.group);

lens = (off('lens') || ARCHIVE_AT_BOOT) ? null : new Lens(renderer, scene, camera);
adaptive = new Adaptive(renderer, CFG.dprCeiling());
if (ARCHIVE_AT_BOOT) activateArchive('device', false);
} catch (e) { fatal(e, 'build'); await HALT(); }

addEventListener('resize', () => renderer.setPixelRatio(adaptive.dpr));
addEventListener('keydown', e => {
  if (!e.repeat && (e.code === 'Equal' || e.code === 'NumpadEqual' || e.key === '=')) {
    e.preventDefault();
    if (!released) releasePrologue();
    if (world === 'terra' && !transmission.active && !docking.started
        && !voyage.active && !restoration.complete) {
      const now = performance.now();
      openingShot = null;
      rover.setViewMode('rear');
      const acquired = restoration.acquireAll({
        x: rover.pos.x, z: rover.pos.z, heading: rover.heading,
        ground: heightCPU(rover.pos.x, rover.pos.z),
      }, now);
      if (acquired) {
        rover.flashAcquisition(now);
        captions.force({
          r: 0,
          ko: '8개 표본 동시 획득 · 전체 복원 키 고정',
          en: 'EIGHT SAMPLES ACQUIRED · ALL RECOVERY KEYS FIXED',
        }, now, 5200);
        kiosk.last = now;
      }
    }
  }
  const target = PLANET_KEY_BY_CODE[e.code];
  if (target) {
    e.preventDefault();
    if (!released) releasePrologue();
    requestPlanet(target, 'manual');
  }
  if (e.code === 'KeyG') {
    const on = !ground.mesh.material.wireframe;
    ground.mesh.material.wireframe = on;
    for (const m of scatter.meshes) m.visible = !on;
  }
});
canvas.addEventListener('pointerdown', () => {
  if (!released) return;
  openingShot = null;
  camera.fov = CFG.atmosphere.fov;
  camera.updateProjectionMatrix();
}, { passive: true });

const a = await describeAdapter();
hud.set('backend', 'WebGPU');
hud.set('vendor', `${a.vendor} · ${a.arch}`);
hud.set('tier', `${CFG.tier} · ${a.storageMB} MB storage`);
hud.set('mode', archiveMode ? 'ARCHIVAL · PHOSPHOR' : 'CINEMATIC · FULL COLOUR');
hud.set('grid', `${CFG.clipmap.grid} × ${CFG.clipmap.grid}`);
hud.set('tris', ground.stats.triangles.toLocaleString());
hud.set('cell', `${CFG.clipmap.cell.toFixed(3)} m`);
hud.set('span', `${CFG.clipmap.span} m`);
hud.set('fcount', scatter.stats.instances.toLocaleString());
hud.set('fverts', `${(scatter.stats.vertices / 1e6).toFixed(2)} M`);
hud.set('frings', scatter.stats.rings.join(' / '));
hud.set('fgrid', `${field.stats.grid}² · ${field.stats.cell.toFixed(2)} m`);
hud.set('nu', nuRatioCPU(BH.rBarrier, BH.start[1]).toFixed(3));

hud.set('limits', `${a.storageBuffers} storage / ${a.maxBufferMB} MB buffer`);
hasTimestamp = enableTimestamps(renderer);
if (!hasTimestamp) { hud.set('gc', 'unsupported'); hud.set('gr', 'unsupported'); }
const disabled = ['beam', 'dust', 'lens', 'wake'].filter(off);
if (disabled.length) hud.set('backend', `WebGPU · without ${disabled.join(', ')}`, true);

/* nose toward the origin: for a position (x,z) the heading that points at it
   is atan2(x, z), because heading 0 looks down −Z */
const START_HEADING = Math.atan2(BH.start[0], BH.start[1]);
rover.reset(BH.start[0], BH.start[1], START_HEADING);
lander.place(BH.start[0], BH.start[1], START_HEADING, true);
/* The prologue holds the rover at its landing point. It then releases an
   autonomous route; keyboard driving is the operator's manual override. */
rover.auto = false;
rover.setViewMode('rear');
transmission.trigger.disabled = true;
uObserverR.value = Math.hypot(...BH.start);
ground.syncTo(rover.pos.x, rover.pos.z);
try { await rebuild(); }
catch (e) { fatal(e, 'first compute'); await HALT(); }

running = true;
tPrev = performance.now();
window.TI_READY = true;                      // clears the watchdog in index.html
window.TI_WORLD = world;
window.TI_PLANET = number => requestPlanet(['terra', 'desert', 'granite'][Number(number) - 1], 'manual');
window.TI_TRANSMIT = () => requestNextPlanet('manual');
window.TI_RENDER_MODE = () => ({ archive: archiveMode, dpr: adaptive.dpr, lens: !!lens });
window.TI_CAMERA = () => ({
  mode: rover.viewMode, yaw: rover.orbitYaw, pitch: rover.orbitPitch,
  distance: rover.orbitDist, cue: arrivalOrbit ? 'arrival' : departureOrbit ? 'departure' : 'none',
});
window.TI_RESTORATION = level => {
  if (level == null) return restoration.snapshot();
  restoration.reset(level);
  return restoration.snapshot();
};
window.TI_SEQUENCE = () => ({
  world, restoration: restoration.count,
  docking: docking.phase, voyage: voyage.phase,
  landerPresent, roverVisible: rover.group.visible,
});
queueLoop();

/* ── releasing the prologue ────────────────────────────────────────────────
   One gate, whether it opens on its own or because the visitor pressed
   something. Two paths that each set `rover.auto` would double-release: the
   key press starts the drive, the timer fires eight seconds later and starts
   it again, and the kiosk's idle clock is reset from under a visitor who is
   already driving.

   The skip is armed a beat late. A key struck in the first moment is almost
   always someone still settling in front of the screen, and dismissing the
   text before it has been seen is worse than making them wait a second. The
   line offering the skip fades in at the same moment it becomes true — the
   affordance and the capability appear together, so it never lies.

   A pointer counts too. On a gallery machine there may be no keyboard. */
const PROLOGUE_MS = 12000;
const ARM_MS = 1600;

function releasePrologue() {
  if (released) return;
  released = true;
  document.body.classList.add('ti-prologue-out');
  rover.auto = true;
  rover.setViewMode('rear');
  if (!transmission.active && !arrivalHoldUntil) transmission.trigger.disabled = !restoration.complete;
  const mobileStart = document.getElementById('ti-mobile-start');
  if (mobileStart) mobileStart.disabled = true;
  const now = performance.now();
  openingShot = { t0: now };
  lander.purge?.reset(now);
  nextAutoPauseAt = now + 32000;
  kiosk.last = now;   // the idle clock starts when the drive does
  removeEventListener('keydown', releasePrologue);
  removeEventListener('pointerdown', releasePrologue);
  if (archiveMode) showArchiveCue();
}

mobileControl.bindStart(releasePrologue);

function armPrologue() {
  if (released) return;
  document.getElementById('ti-prologue')?.classList.add('armed');
  const mobileStart = document.getElementById('ti-mobile-start');
  if (mobileStart) mobileStart.disabled = false;
  addEventListener('keydown', releasePrologue);
  addEventListener('pointerdown', releasePrologue);
}

if (location.search.includes('embed')) {
  released = true;
  rover.auto = true;
  transmission.trigger.disabled = false;
} else {
  setTimeout(releasePrologue, PROLOGUE_MS);
  setTimeout(armPrologue, ARM_MS);
}

const resume = () => {
  if (archiveMode) {
    document.body.classList.add('ti-terminal');
    adaptive.lockAt(0.58);
  }
  if (!running) { running = true; tPrev = performance.now(); }
  queueLoop();
  mobileControl?.recalibrate();
};
const pause = () => {
  running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
};
addEventListener('pageshow', resume);
addEventListener('pagehide', pause);
document.addEventListener('visibilitychange', () =>
  document.visibilityState === 'visible' ? resume() : pause());

/* ── rebuild order matters: the scatter samples both of the others ────── */
async function rebuild() {
  const t0 = performance.now(); await ground.recompute(renderer);
  const t1 = performance.now(); await field.recompute(renderer);
  const t2 = performance.now(); await scatter.recompute(renderer);
  rc.ground = t1 - t0; rc.field = t2 - t1; rc.scatter = performance.now() - t2;
}

async function loop(now = performance.now()) {
  rafId = 0;
  if (!running) return;
  /* Terminal cadence is intentionally 30 Hz. Input events still arrive at the
     browser's native rate, while simulation, compute and raster work happen
     once per archival frame. */
  if (archiveMode && now - lastArchiveFrame < 30) {
    queueLoop();
    return;
  }
  lastArchiveFrame = now;
  try { await frame(); }
  catch (e) { running = false; fatal(e, 'frame'); return; }
  queueLoop();
}

function queueLoop() {
  if (running && !rafId) rafId = requestAnimationFrame(loop);
}

async function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - tPrev) / 1000);
  const frameMs = now - tPrev;
  tPrev = now;

  docking.beforeRover(now, dt);
  if (world === 'terra' && docking.docked && !voyage.active) {
    voyage.start(PLANETS.desert, now);
  }
  await voyage.beforeRover(now, dt);

  updateArrivalOrbit(now);
  if (arrivalHoldUntil && now >= arrivalHoldUntil) {
    arrivalHoldUntil = 0;
    arrivalOrbit = null;
    rover.setViewMode('rear', TRANSFER_CAMERA.rear);
    rover.transmitting = false;
    rover.auto = true;
    transmission.trigger.disabled = false;
    nextAutoPauseAt = now + 36000;
  }
  const arrivalWaiting = arrivalHoldUntil > now;
  const restorationHold = world === 'terra' && restoration.holding(now);
  if (rover.auto && !transmission.active && !arrivalWaiting && !docking.started && !voyage.active) {
    if (!nextAutoPauseAt) nextAutoPauseAt = now + 32000;
    if (!autoPauseUntil && now >= nextAutoPauseAt) autoPauseUntil = now + 14000;
    if (autoPauseUntil && now >= autoPauseUntil) {
      autoPauseUntil = 0;
      nextAutoPauseAt = now + 46000;
    }
    rover.missionHold = autoPauseUntil > now || restorationHold;
    if (rover.viewMode === 'rear') {
      const wide = 28.6 + Math.sin(now * 0.000085) * 3.0;
      rover.orbitDist += (wide - rover.orbitDist) * Math.min(1, dt * 0.18);
      rover.orbitPitch += (0.29 + Math.sin(now * 0.000061) * 0.055 - rover.orbitPitch) * Math.min(1, dt * 0.15);
      rover.orbitYaw += dt * 0.006;
    } else if (rover.viewMode === 'front') {
      /* A close, low inspection composition: the machine advances into the
         lens while an almost imperceptible drift keeps it from reading as a
         turntable render. The orbit remains heading-relative, so the camera
         stays on the nose throughout a turn. */
      const frontDist = 6.6 + Math.sin(now * 0.00011) * 0.12;
      const frontPitch = 0.16 + Math.sin(now * 0.000073) * 0.012;
      const frontYaw = Math.PI + Math.sin(now * 0.000057) * 0.025;
      const yawError = Math.atan2(Math.sin(frontYaw - rover.orbitYaw), Math.cos(frontYaw - rover.orbitYaw));
      rover.orbitDist += (frontDist - rover.orbitDist) * Math.min(1, dt * 1.4);
      rover.orbitPitch += (frontPitch - rover.orbitPitch) * Math.min(1, dt * 1.2);
      rover.orbitYaw += yawError * Math.min(1, dt * 1.0);
    }
  } else {
    rover.missionHold = arrivalWaiting || restorationHold;
  }

  /* The autonomous route is a chain of broad, overlapping survey arcs. The
     odometer—not wall time—drives the curve, so pauses for samples do not make
     the parked rover rotate, and every kiosk replay traces the same field. */
  if (rover.auto && !docking.started && !voyage.active) {
    const start = PLANETS[world].start;
    const base = Math.atan2(start[0], start[1]);
    const phase = rover.odometer * 0.020 + PLANETS[world].number * 1.17;
    const desired = base + Math.sin(phase) * 0.34
      + Math.sin(rover.odometer * 0.0065 + restoration.count * 0.83) * 0.17;
    const error = Math.atan2(Math.sin(desired - rover.heading), Math.cos(desired - rover.heading));
    rover.autoSteer = Math.max(-0.38, Math.min(0.38, error * 1.18));
  } else rover.autoSteer = 0;

  mobileControl.update(now, dt, {
    released,
    blocked: transmission.active || arrivalWaiting || docking.started || voyage.active,
    missionHold: rover.missionHold,
  });
  const v = rover.update(dt);
  restoration.update(v, now, world === 'terra' && !transmission.active);
  if (world === 'terra' && restoration.complete && !restoration.event
      && lander.parts[7].state === 'solid' && !docking.started) docking.start(now);
  updateOpeningCamera(now);
  docking.afterRover();
  voyage.afterRover(now);
  optics.update(now, v, camera);
  minimap.update(v, now, power.charge, !transmission.active && !voyage.active);
  uObserverR.value = PLANETS[world].metric ? v.radius : 1e7;

  const prevX = ground.origin.x, prevZ = ground.origin.y;
  if (!voyage.inSpace && ground.syncTo(rover.pos.x, rover.pos.z)) {
    if (!off('wake')) await wake.shift(renderer, ground.origin.x - prevX, ground.origin.y - prevZ);
    await rebuild();
    adaptive.skip();          // this window contains a rebuild stall — discard
    hud.flash();
  }

  /* two tracks, in the clipmap's local frame */
  if (!off('wake') && !voyage.active) await wake.step(renderer, dt,
    v.trackA[0] - ground.origin.x, v.trackA[1] - ground.origin.y,
    v.trackB[0] - ground.origin.x, v.trackB[1] - ground.origin.y);
  if (!voyage.active) dust?.update(dt, v);
  if (!voyage.active) storm.update(dt, v, now);
  lander.update(now, landerPresent || voyage.active);
  if (released && !transmission.active && !arrivalWaiting) {
    transmission.trigger.disabled = world !== 'terra' || voyage.active || docking.started
      || !restoration.complete || restoration.holding(now);
  }
  await transmission.update(now);

  sky.position.copy(camera.position);
  if (lens) {
    const focusTarget = openingShot ? openingCam.aim
      : (docking.started || voyage.active) ? lander.group.position : rover.group.position;
    lens.focusAt(camera.position.distanceTo(focusTarget));
    lens.render();
  }
  else renderer.render(scene, camera);

  if (!transmission.active && !docking.active && !voyage.active) await kiosk.update(now, returnToStart);
  else kiosk.last = now;
  if (adaptive.sample(frameMs, now) === 'critical') activateArchive('measured');
  /* ── the second clock ─────────────────────────────────────────────── */
  const pw = power.update(dt, { ...v, radius: PLANETS[world].metric ? v.radius : 1e7, lamps: rover.lamps });
  rover.setSignalState(pw.charge, transmission.active || arrivalWaiting);
  mobileControl.syncSignal();
  if (!transmission.active && !voyage.active) survey.update(v, now, pw.charge);

  if (!transmission.active && !arrivalWaiting && !docking.started && !voyage.active) {
    if (pw.dead && world === 'terra' && !restoration.complete) requestNextPlanet('power');
  }
  rover.disabled = pw.dead && !docking.active && !voyage.active;
  rover.transmitting = transmission.active || arrivalHoldUntil > now;
  /* switch × supply. The ground, the filaments and the airborne dust all read
     the same uniform, so a jolt dims the whole lit world at once. */
  const roverVisibleForFlight = !voyage.active || voyage.phase === 'egress' || voyage.phase === 'close';
  uLampPower.value = rover.lamps && roverVisibleForFlight
    ? pw.bus * transmission.light * openingLampGain(now) : 0;
  ambient.setPower((pw.dead ? 0 : pw.charge) * transmission.audio);

  const q = ambient.update(v.radius);
  if (!transmission.active) captions.update(v.radius, now);

  acc += frameMs; frames++;
  if (acc >= 320) {
    hud.frame(frameMs);
    hud.set('fps', ((frames * 1000) / acc).toFixed(1));
    hud.set('cpu', `${frameMs.toFixed(2)} ms`);
    hud.set('origin', `${ground.origin.x.toFixed(1)} / ${ground.origin.y.toFixed(1)}`);
    hud.set('recentre', String(ground.recentres));
    hud.set('rcT', `${rc.ground.toFixed(1)} ms`);
    hud.set('rcF', `${rc.field.toFixed(1)} ms`);
    hud.set('rcL', `${rc.scatter.toFixed(1)} ms`, rc.scatter > 12);
    hud.set('pos', `${rover.pos.x.toFixed(1)} / ${rover.pos.z.toFixed(1)}`);
    hud.set('ground', `${v.ground.toFixed(2)} m`);
    hud.set('speed', v.speed > 0.01
      ? `${v.speed.toFixed(2)} m/s${v.boosting ? ' · fast' : ''}` : 'halted');
    hud.set('odo', `${v.odometer.toFixed(0)} m`);
    hud.set('att', `${deg(v.pitch)} / ${deg(v.roll)}`, Math.abs(v.roll) > 0.4);
    hud.set('trac', `${(v.traction * 100).toFixed(0)} %`, v.traction < 0.6);
    hud.set('susp', v.stops > 0
      ? `${(v.artic * 100).toFixed(0)} / ${(v.travel * 100).toFixed(0)} cm · ${(v.stops * 8).toFixed(0)} on stops`
      : `${(v.artic * 100).toFixed(0)} / ${(v.travel * 100).toFixed(0)} cm`,
      v.slam > 0.05);
    const viewLabel = v.viewMode === 'mast' ? 'Mast / 1인칭'
      : v.viewMode === 'rear' ? `Rear chase / 3인칭 · ${v.chaseDist.toFixed(1)} m`
      : v.viewMode === 'front' ? `Front inspection / 정면 · ${v.chaseDist.toFixed(1)} m`
      : `${v.viewMode === 'cinematic' ? 'Cinematic' : 'Free orbit'} · ${v.chaseDist.toFixed(1)} m`;
    hud.set('view', viewLabel);
    hud.set('lamps', v.lamps
      ? (pw.bus > 0.92 ? `on · ${CFG.headlight.reach.toFixed(0)} m reach`
                       : `on · bus ${(pw.bus * 100).toFixed(0)} %`)
      : 'off', !v.lamps || pw.bus < 0.7);
    hud.set('cell', pw.dead ? 'EMPTY' : `${(pw.charge * 100).toFixed(1)} %`, pw.charge < 0.25);
    hud.set('array', pw.sunlit ? `${pw.solar.toFixed(2)} %/s` : 'shadowed', !pw.sunlit);
    hud.set('lid', `${(v.lidTilt * 57.29578).toFixed(0)}° / ${(v.lidMax * 57.29578).toFixed(0)}°   [ ]`);
    hud.set('load', `${pw.load.toFixed(2)} %/s`);
    hud.set('endur', pw.dead ? '—'
      : (pw.endurance === Infinity ? `charging +${pw.net.toFixed(2)} %/s`
         : `${Math.floor(pw.endurance / 60)}m ${Math.round(pw.endurance % 60)}s`),
      pw.endurance < 90);
    hud.set('recon', world === 'terra'
      ? `${restoration.count} / 8 · ${restoration.complete ? 'material fixed' : 'wire recovery'}`
      : `archive ${restoration.count} / 8`);
    hud.set('r', PLANETS[world].metric ? `${v.radius.toFixed(1)} m · ${(v.radius / BH.rs).toFixed(2)} rs`
      : world === 'desert' ? `${v.radius.toFixed(1)} m · yardang field`
                           : `${v.radius.toFixed(1)} m · granite plain`);
    hud.set('region', regionOf(v.radius), v.radius < BH.rs * 1.5);
    hud.set('lapse', PLANETS[world].metric ? v.lapse.toFixed(4) : '1.0000');
    hud.set('dpr', `${adaptive.dpr.toFixed(2)} · ${adaptive.changes} steps`);
    hud.set('focus', lens ? `${lens.uFocus.value.toFixed(0)} m` : 'safe mode');
    hud.set('score', ambient.started
      ? (ambient.muted ? 'muted' : `${(CFG.audio.droneBase * q).toFixed(0)} Hz · q ${q.toFixed(3)}`)
      : 'tap to begin');
    hud.set('idle', kiosk.state === 'live' ? `${kiosk.idleFor.toFixed(0)} s / 90`
                                           : `${kiosk.state} · ${kiosk.returns} returns`);
    hud.set('universe', window.UNIVERSE_SEED ? `#${window.UNIVERSE_SEED}` : 'unseeded');
    acc = 0; frames = 0;
  }

  if (hasTimestamp && now - tStamp > 480) {
    tStamp = now;
    try {
      const gc = await renderer.resolveTimestampsAsync(THREE.TimestampQuery.COMPUTE);
      const gr = await renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER);
      if (gc != null) hud.set('gc', `${Number(gc).toFixed(3)} ms`);
      if (gr != null) hud.set('gr', `${Number(gr).toFixed(3)} ms`);
    } catch { hud.set('gc', 'unavailable'); hud.set('gr', 'unavailable'); }
  }

  if (DEV && now - tProbe > 1200) { tProbe = now; probeDivergence().catch(() => {}); }
}

function showArchiveCue() {
  const cue = document.getElementById('ti-terminal-cue');
  if (!cue) return;
  cue.setAttribute('aria-hidden', 'false');
  cue.classList.add('on');
  clearTimeout(archiveCueTimer);
  archiveCueTimer = setTimeout(() => {
    cue.classList.remove('on');
    cue.setAttribute('aria-hidden', 'true');
  }, 3600);
}

/** One-way visual state: the work does not oscillate after the lens is shed. */
function activateArchive(reason = 'device', announce = true) {
  if (archiveMode) return;
  archiveMode = true;
  document.body.classList.add('ti-terminal');
  adaptive?.lockAt(0.58);
  lens?.dispose?.();
  lens = null;
  hud?.set('mode', `ARCHIVAL · ${reason.toUpperCase()}`);
  hud?.set('tier', `${CFG.tier} · LOW BANDWIDTH`);
  if (announce && released) showArchiveCue();
}

function orbitEase(p) {
  const t = Math.max(0, Math.min(1, p));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function updateOpeningCamera(now) {
  if (!openingShot || world !== 'terra' || !lander.group.visible || transmission.active) return;
  if (rover.viewMode !== 'rear') {
    openingShot = null;
    camera.fov = CFG.atmosphere.fov;
    camera.updateProjectionMatrix();
    return;
  }
  const p = Math.max(0, Math.min(1, (now - openingShot.t0) / OPENING_CAMERA_MS));
  if (p >= 1) {
    openingShot = null;
    camera.fov = CFG.atmosphere.fov;
    camera.updateProjectionMatrix();
    return;
  }

  /* Rover.update() has already produced the live rear-follow camera. Preserve
     it as the destination, then override the eye with a low oblique view that
     stacks the rover in the foreground and the habitat behind it. Aligning
     mostly along their connecting axis keeps both masses inside a portrait
     phone without reducing the habitat to a distant thumbnail. */
  openingCam.rearPosition.copy(camera.position);
  openingCam.rearQuaternion.copy(camera.quaternion);
  const l = lander.group.position, r = rover.group.position;
  let ux = r.x - l.x, uz = r.z - l.z;
  const length = Math.hypot(ux, uz) || 1;
  ux /= length; uz /= length;
  const sx = -uz, sz = ux;
  openingCam.midpoint.set(
    l.x * 0.52 + r.x * 0.48,
    l.y + 2.85,
    l.z * 0.52 + r.z * 0.48,
  );
  /* A wide screen can hold the two machines in profile at nearly equal
     camera distance, making their scale ratio explicit. A portrait phone
     cannot: there the view folds them into depth so neither leaves frame. */
  const portrait = camera.aspect < 0.80;
  const along = portrait ? -31.0 : 0.0;
  const lateral = portrait ? 20.0 : 22.0;
  const cx = openingCam.midpoint.x + ux * along + sx * lateral;
  const cz = openingCam.midpoint.z + uz * along + sz * lateral;
  const cy = Math.max(l.y + 8.2, heightCPU(cx, cz) + 3.0);
  openingCam.position.set(cx, cy, cz);
  openingCam.aim.set(
    l.x * (portrait ? 0.55 : 0.50) + r.x * (portrait ? 0.45 : 0.50),
    Math.max(l.y + 2.95, rover.deckY + 0.75),
    l.z * (portrait ? 0.55 : 0.50) + r.z * (portrait ? 0.45 : 0.50),
  );
  camera.position.copy(openingCam.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(openingCam.aim);

  /* Hold the scale image, then hand it to the already-running rear camera.
     Position and orientation share the same quintic easing, so there is no
     visible hinge at the edit. */
  const blend = orbitEase(Math.max(0, (p - 0.60) / 0.40));
  camera.fov = 52 + (CFG.atmosphere.fov - 52) * blend;
  camera.updateProjectionMatrix();
  camera.position.lerp(openingCam.rearPosition, blend);
  camera.quaternion.slerp(openingCam.rearQuaternion, blend);
}

function openingLampGain(now) {
  if (!openingShot) return 1;
  const p = Math.max(0, Math.min(1, (now - openingShot.t0) / OPENING_CAMERA_MS));
  return 0.015 + 0.985 * orbitEase(Math.max(0, (p - 0.55) / 0.45));
}

function beginDepartureOrbit() {
  const tau = Math.PI * 2;
  let fromYaw = rover.viewMode === 'mast' ? 0 : rover.orbitYaw;
  fromYaw = ((fromYaw + Math.PI) % tau + tau) % tau - Math.PI;
  let toYaw = Math.PI;
  while (toYaw <= fromYaw) toYaw += tau;
  if (toYaw - fromYaw < 0.35) toYaw += tau;
  departureOrbit = {
    fromYaw, toYaw,
    fromPitch: rover.viewMode === 'mast' ? 0.30 : rover.orbitPitch,
    fromDist: rover.viewMode === 'mast' ? 6.4 : rover.orbitDist,
  };
  rover.setViewMode('cinematic', {
    yaw: departureOrbit.fromYaw,
    pitch: departureOrbit.fromPitch,
    dist: departureOrbit.fromDist,
  });
}

function updateDepartureOrbit(progress) {
  if (!departureOrbit) return;
  const e = orbitEase(progress), front = TRANSFER_CAMERA.front;
  rover.orbitYaw = departureOrbit.fromYaw + (departureOrbit.toYaw - departureOrbit.fromYaw) * e;
  rover.orbitPitch = departureOrbit.fromPitch + (front.pitch - departureOrbit.fromPitch) * e;
  rover.orbitDist = departureOrbit.fromDist + (front.dist - departureOrbit.fromDist) * e;
  if (progress >= 1) {
    rover.orbitYaw = departureOrbit.toYaw;
    rover.orbitPitch = front.pitch;
    rover.orbitDist = front.dist;
    departureOrbit = null;
  }
}

function beginArrivalOrbit(now) {
  const front = TRANSFER_CAMERA.front, rear = TRANSFER_CAMERA.rear;
  arrivalOrbit = {
    t0: now,
    fromYaw: front.yaw,
    toYaw: Math.PI * 2 + rear.yaw,
    fromPitch: front.pitch,
    toPitch: rear.pitch,
    fromDist: front.dist,
    toDist: rear.dist,
  };
}

function updateArrivalOrbit(now) {
  if (!arrivalOrbit) return;
  const p = Math.max(0, Math.min(1, (now - arrivalOrbit.t0) / TRANSFER_CAMERA.arriveMs));
  const e = orbitEase(p);
  rover.orbitYaw = arrivalOrbit.fromYaw + (arrivalOrbit.toYaw - arrivalOrbit.fromYaw) * e;
  rover.orbitPitch = arrivalOrbit.fromPitch + (arrivalOrbit.toPitch - arrivalOrbit.fromPitch) * e;
  rover.orbitDist = arrivalOrbit.fromDist + (arrivalOrbit.toDist - arrivalOrbit.fromDist) * e;
}

function requestPlanet(targetKey, reason = 'manual') {
  if (!released || !PLANETS[targetKey] || targetKey === world || transmission.active
      || arrivalHoldUntil > performance.now() || docking.started || voyage.active
      || world !== 'terra') return false;
  /* The ordinary route remains on BODY 01 until all eight material signatures
     have fixed the lander. A power failure keeps its emergency relay path. */
  if (world === 'terra' && !restoration.complete && reason !== 'power') return false;
  if (world === 'terra' && restoration.holding(performance.now())) return false;
  const atlas = minimap.snapshot();
  if (reason === 'power') atlas.trail = atlas.trail.slice(-Math.max(1, Math.ceil(atlas.trail.length * 0.35)));
  const surveyState = survey.snapshot();
  const live = minimap.state();
  if (reason === 'power') live.trail = live.trail.slice(-Math.max(1, Math.ceil(live.trail.length * 0.35)));
  planetMemory.set(world, {
    atlas, live, survey: surveyState, charge: power.charge,
    restoration: restoration.snapshot(),
    position: { x: rover.pos.x, z: rover.pos.z }, heading: rover.heading,
  });
  const snapshot = { ...surveyState, atlas, trail: atlas.trail, charge: power.charge, source: world };
  const target = PLANETS[targetKey];
  return transmission.request(reason, snapshot, {
    key: target.key, number: target.number, id: target.id,
    arrivalKo: target.arrivalKo, arrivalEn: target.arrivalEn,
  });
}

function requestNextPlanet(reason = 'manual') {
  const next = ['terra', 'desert', 'granite'][PLANETS[world].number % 3];
  return requestPlanet(next, reason);
}

async function prepareVoyageDestination(destination) {
  const planet = PLANETS[destination.key];
  if (!planet) throw new Error(`Unknown voyage destination: ${destination.key}`);

  docking.reset();
  landerPresent = true;
  world = planet.key; window.TI_WORLD = world; setWorldMode(planet.mode);
  rover.metricEnabled = planet.metric;
  document.body.classList.toggle('ti-desert', world === 'desert');
  document.body.classList.toggle('ti-granite', world === 'granite');
  document.body.classList.remove('fh-dead');
  landmark.position.set(-230, heightCPU(-230, -340) + 8, -340);
  landmark.visible = false;                 // space interval still owns frame
  for (const mesh of scatter.meshes) mesh.visible = false;
  for (const mesh of beam.meshes) mesh.visible = false;
  storm.setActive(false); dust?.clear();

  power.reset(planet.initialCharge);
  const heading = Math.atan2(planet.start[0], planet.start[1]);
  rover.reset(planet.start[0], planet.start[1], heading);
  rover.auto = false; rover.disabled = false; rover.transmitting = false;
  rover.lamps = true; rover.group.visible = false;
  rover.setViewMode('cinematic', { yaw: 0.18, pitch: 0.22, dist: 13 });

  lander.place(planet.start[0], planet.start[1], heading, true);
  restoration.reset(8);
  captions.lines = planet.lines; captions.rearm();
  survey.reset(planet.survey);
  minimap.reset(planet.start, { id: planet.id, label: planet.label, archives: [] });
  uObserverR.value = planet.metric ? Math.hypot(...planet.start) : 1e7;
  ground.syncTo(lander.group.position.x, lander.group.position.z);
  if (!off('wake')) await wake.clear(renderer);
  await rebuild();
  lens?.focusAt(camera.position.distanceTo(lander.group.position));
}

async function enterPlanet(reason, snapshot, destination) {
  const planet = PLANETS[destination.key];
  if (!planet) throw new Error(`Unknown destination: ${destination.key}`);
  const memory = planetMemory.get(planet.key);
  world = planet.key; window.TI_WORLD = world; setWorldMode(planet.mode);
  rover.metricEnabled = planet.metric;
  document.body.classList.toggle('ti-desert', world === 'desert');
  document.body.classList.toggle('ti-granite', world === 'granite');
  document.body.classList.remove('fh-dead');
  landmark.visible = world === 'desert';
  if (landmark.visible) landmark.position.set(-230, heightCPU(-230, -340) + 8, -340);
  for (const mesh of scatter.meshes) mesh.visible = planet.metric;
  for (const mesh of beam.meshes) mesh.visible = planet.metric;
  storm.setActive(false);
  dust?.clear();
  const rememberedCharge = memory?.charge;
  const arrivalCharge = rememberedCharge == null ? planet.initialCharge
    : Math.max(reason === 'power' ? 0.38 : 0.08, rememberedCharge);
  power.reset(arrivalCharge);
  const rememberedPosition = memory?.position ?? memory?.live?.trail?.at(-1);
  const start = rememberedPosition ? [rememberedPosition.x, rememberedPosition.z] : planet.start;
  rover.lamps = true; rover.lidTilt = 0; rover.auto = false; rover.disabled = false; rover.transmitting = true;
  rover.reset(start[0], start[1], memory?.heading ?? Math.atan2(start[0], start[1]));
  if (world === 'terra') {
    landerPresent = true;
    lander.place(BH.start[0], BH.start[1], START_HEADING, true);
    restoration.reset(memory?.restoration?.count ?? restoration.count);
  }
  else { landerPresent = false; lander.group.visible = false; }
  rover.auto = false; rover.transmitting = true;
  /* The destination is reconstructed squarely toward the rover's face.  The
     post-arrival orbit begins only after every wheel has locked into place. */
  rover.setViewMode('cinematic', TRANSFER_CAMERA.front);
  rover.update(0);
  captions.lines = planet.lines; captions.rearm();
  survey.reset(planet.survey);
  survey.restore(memory?.survey);
  survey.inherit(snapshot);
  const archives = [...planetMemory.entries()]
    .filter(([key]) => key !== planet.key)
    .map(([, state]) => state.atlas)
    .filter(Boolean).slice(-2);
  minimap.reset(start, {
    id: planet.id, label: planet.label, archives, memory: memory?.live,
  });
  uObserverR.value = planet.metric ? Math.hypot(...start) : 1e7;
  ground.syncTo(rover.pos.x, rover.pos.z);
  if (!off('wake')) await wake.clear(renderer);
  await rebuild();
  storm.setActive(planet.storm, { x: rover.pos.x, z: rover.pos.z });
  lens?.focusAt(camera.position.distanceTo(rover.group.position));
}

async function returnToStart() {
  voyage.reset();
  docking.reset();
  arrivalHoldUntil = 0; departureOrbit = null; arrivalOrbit = null;
  openingShot = null;
  camera.fov = CFG.atmosphere.fov; camera.updateProjectionMatrix();
  nextAutoPauseAt = 0; autoPauseUntil = 0;
  planetMemory.clear();
  world = 'terra'; window.TI_WORLD = world; setWorldMode('terra');
  landerPresent = true;
  rover.metricEnabled = true;
  document.body.classList.remove('fh-dead', 'ti-desert', 'ti-granite');
  transmission.reset();
  transmission.trigger.textContent = '1 · 2 · 3  PLANET SELECT';
  storm.setActive(false);
  landmark.visible = false;
  for (const mesh of scatter.meshes) mesh.visible = true;
  for (const mesh of beam.meshes) mesh.visible = true;

  /* THE NEXT VISITOR GETS THE FIRST APPROACH, NOT THE SECOND.
     The captions were already re-armed here; the prologue was not, so after
     the first visitor everyone else arrived at a rover already driving with
     no title and no statement of what they were looking at. It is the one
     screen that says what the work is. */
  if (!location.search.includes('embed')) {
    released = false;
    document.body.classList.remove('ti-prologue-out');
    document.getElementById('ti-prologue')?.classList.remove('armed');
    const mobileStart = document.getElementById('ti-mobile-start');
    if (mobileStart) mobileStart.disabled = true;
    transmission.trigger.disabled = true;
    rover.auto = false;
    setTimeout(releasePrologue, PROLOGUE_MS);
    setTimeout(armPrologue, ARM_MS);
  }
  dust?.clear();
  power.reset();
  rover.disabled = false;
  rover.transmitting = false;
  rover.lamps = true;
  rover.lidTilt = 0;
  rover.reset(BH.start[0], BH.start[1], START_HEADING);
  mobileControl.reset();
  lander.place(BH.start[0], BH.start[1], START_HEADING, true);
  restoration.reset(0);
  rover.auto = location.search.includes('embed');
  rover.setViewMode('rear');
  uObserverR.value = Math.hypot(...BH.start);
  captions.lines = LINES; captions.rearm();
  survey.reset(TERRA_SURVEY);
  minimap.reset(BH.start, { id: 'BODY 01', label: 'SHEAR BODY', archives: [] });
  ground.syncTo(rover.pos.x, rover.pos.z);
  if (!off('wake')) await wake.clear(renderer);
  await rebuild();
  lens?.focusAt(camera.position.distanceTo(rover.group.position));
}

function regionOf(r) {
  if (world === 'desert') return 'sintered archive';
  if (world === 'granite') return 'weathered lithic plain';
  if (r > BH.rTrough) return 'outer basin';
  if (r > BH.rBarrier) return 'descent';
  if (r > BH.rs * 1.5) return 'inside barrier';
  if (r > BH.rs) return 'photon sphere';
  return 'beyond horizon';
}

function deg(rad) { return `${(rad * 57.29578).toFixed(1)}°`; }

/* ── does the GPU agree with the CPU about the ground? ─────────────────── */
async function probeDivergence() {
  const p = ground.nearestVertex(rover.pos.x, rover.pos.z);
  const buf = new Float32Array(await renderer.getArrayBufferAsync(ground.bufN.value));
  const gpu = buf[p.index * 4 + 3];
  const cpu = heightCPU(p.x, p.z);
  const d = Math.abs(gpu - cpu);
  hud.set('hcpu', `${cpu.toFixed(4)} m`);
  hud.set('hgpu', `${gpu.toFixed(4)} m`);
  hud.set('delta', d < 1e-3 ? `${(d * 1e6).toFixed(1)} µm` : `${(d * 1e3).toFixed(2)} mm`, d >= 1e-3);
}
