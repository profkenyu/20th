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
  Lens, Adaptive, Hud, Captions, Kiosk, Ambient, PlanetTransfer, Rover, Power,
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
  kiosk: { idleMs: 240000 },
  audio: { droneEmitR: BH.rs * 1.01 },
});

const LINES = [
  { r: 540.0,  ko: '통신 반송파 미검출 · 왕복 지연 산출 불가',
               en: 'COMMS · RETURN CARRIER NOT ACQUIRED' },
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

const END_LINE = {
  r: 0,
  ko: '전지 잔량 0% · 구동계 정지 · 외부 응답 없음',
  en: 'POWER 0% · DRIVE OFFLINE · NO EXTERNAL RESPONSE',
};

const TERRA_SURVEY = [
  [540, 'COMMS · RETURN CARRIER / NOT ACQUIRED'],
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
  [460, 'ATMOSPHERE · SILICATE DRIFT / ACTIVE'],
  [350, 'WIND · EASTWARD SHEAR / 5.2 M·S⁻¹'],
  [245, 'GROUND · MOBILE DUNE FIELD'],
  [140, 'MOISTURE · BELOW DETECTION LIMIT'],
  [90, 'BIOSCAN · LOCAL SIGNALS / 0'],
];

const DESERT_LINES = [
  { r: 500, ko: '통신 반송파 미검출 · 원격 운용 채널 대기', en: 'COMMS · RETURN CARRIER NOT ACQUIRED' },
  { r: 460, ko: '규산염 에어로졸 검출 · 저층 이류 활성', en: 'ATMOSPHERE · SILICATE DRIFT ACTIVE' },
  { r: 350, ko: '풍속 벡터 +X 5.2 m·s⁻¹ · 횡성분 0.72 m·s⁻¹', en: 'WIND · VECTOR +X 5.2 M·S⁻¹ / CROSS 0.72' },
  { r: 245, ko: '이동사구 변위 검출 · 지형 모델 신뢰도 저하', en: 'GROUND · DUNE DISPLACEMENT / MODEL CONFIDENCE LOW' },
  { r: 90, ko: '주변 생체 신호 0 · 응답 패킷 0', en: 'BIOSCAN · LOCAL SIGNALS 0 / RETURN PACKETS 0' },
];

const TRANSFER_LINE = {
  r: 0, ko: '탐사 메모리 패킷 송신 · 원격 몸체 연결 대기', en: 'Survey memory is transmitted to the next body',
};

const DESERT_ARRIVAL_LINE = {
  r: 0, ko: 'BODY 02 기동 대기 · 왕복 통신 응답 없음', en: 'REMOTE BODY 02 · RETURN CARRIER NOT ACQUIRED',
};

const DESERT_START = [96, 520];

const ROWS = [
  ['Instrument', [['backend', 'Backend'], ['vendor', 'Vendor'], ['tier', 'Tier'], ['limits', 'Limits']]],
  ['Surface',    [['grid', 'Grid'], ['tris', 'Triangles'], ['cell', 'Cell'], ['span', 'Span']]],
  ['Clipmap',    [['origin', 'Origin'], ['recentre', 'Recentres'],
                  ['rcT', 'rebuild · ground'], ['rcF', 'rebuild · field'], ['rcL', 'rebuild · filaments']]],
  ['Field',      [['fcount', 'Instances'], ['fverts', 'Vertices'], ['frings', 'Rings'], ['fgrid', 'Field grid']]],
  ['Probe',      [['pos', 'Position'], ['ground', 'Ground'], ['speed', 'Speed'],
                  ['odo', 'Odometer'], ['att', 'Pitch / roll'], ['trac', 'Traction'],
                  ['lamps', 'Headlights'], ['susp', 'Suspension'], ['view', 'View']]],
  ['Power',      [['cell', 'Cell'], ['array', 'Array'], ['lid', 'Lid'], ['load', 'Load'],
                  ['endur', 'Endurance']]],
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
let scene, hud, captions, ambient, kiosk, ground, field, wake, dust, storm, transferFx, scatter, beam, sky, landmark, rover, power, lens, adaptive, minimap, optics, survey, transmission;
let world = 'terra';
let ended = false;
let endedAt = 0;
let arrivalHoldUntil = 0;
let nextAutoPauseAt = 0, autoPauseUntil = 0;
let released = false;      // the prologue has let go of the rover
let running = false, hasTimestamp = false;
let tPrev = 0, tStamp = 0, tProbe = 0, frames = 0, acc = 0;
const rc = { ground: 0, field: 0, scatter: 0 };
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
transferFx = new ResolutionTransferFX(rover.group);
power = new Power(heightCPU, solarAccessCPU);
minimap = new MiniMap(document.getElementById('ti-minimap'), BH.start, {
  heightAt: heightCPU, id: 'BODY 01', label: 'TERRA',
});
optics = new Optics();
survey = new Survey(heightCPU, TERRA_SURVEY);
transmission = new PlanetTransfer({
  minimap, survey, effect: transferFx, ambient,
  onBegin: reason => {
    rover.auto = false; rover.transmitting = true; rover.disabled = reason === 'power'; rover.chase = true;
    rover.orbitYaw = 0.82; rover.orbitPitch = 0.20; rover.orbitDist = 7.8;
    rover.update(0);
    captions.force(TRANSFER_LINE, performance.now(), 5200);
    kiosk.last = performance.now();
  },
  onBlackout: enterDesert,
  onArrived: () => {
    const now = performance.now();
    rover.disabled = false; rover.transmitting = true; rover.auto = false; rover.chase = true; rover.lamps = true;
    rover.orbitYaw = 0.12; rover.orbitPitch = 0.30; rover.orbitDist = 28.5;
    arrivalHoldUntil = now + 5000;
    ambient.silenceFor(5000);
    transmission.trigger.disabled = true;
    captions.force(DESERT_ARRIVAL_LINE, now, 5200);
  },
});
transmission.bindRequest(requestTransfer);

scene.add(sky, landmark, ground.mesh, ...scatter.meshes, ...beam.meshes,
          ...(dust ? [dust.points] : []), storm.points, rover.group, survey.group, transferFx.group);

lens = off('lens') ? null : new Lens(renderer, scene, camera);
adaptive = new Adaptive(renderer, CFG.dprCeiling());
} catch (e) { fatal(e, 'build'); await HALT(); }

addEventListener('resize', () => renderer.setPixelRatio(adaptive.dpr));
addEventListener('keydown', e => {
  if (e.code === 'KeyG') {
    const on = !ground.mesh.material.wireframe;
    ground.mesh.material.wireframe = on;
    for (const m of scatter.meshes) m.visible = !on;
  }
  if (e.code === 'KeyT') requestTransfer('manual');
});

const a = await describeAdapter();
hud.set('backend', 'WebGPU');
hud.set('vendor', `${a.vendor} · ${a.arch}`);
hud.set('tier', `${CFG.tier} · ${a.storageMB} MB storage`);
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
/* The prologue holds the rover at its landing point. It then releases an
   autonomous route; keyboard driving is the operator's manual override. */
rover.auto = false;
rover.chase = true; rover.orbitYaw = 0.05; rover.orbitPitch = 0.30; rover.orbitDist = 28.5;
uObserverR.value = Math.hypot(...BH.start);
ground.syncTo(rover.pos.x, rover.pos.z);
try { await rebuild(); }
catch (e) { fatal(e, 'first compute'); await HALT(); }

running = true;
tPrev = performance.now();
window.TI_READY = true;                      // clears the watchdog in index.html
window.TI_WORLD = world;
window.TI_TRANSMIT = () => requestTransfer('manual');
requestAnimationFrame(loop);

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
  rover.auto = true; rover.chase = true;
  rover.orbitYaw = 0.05; rover.orbitPitch = 0.30; rover.orbitDist = 28.5;
  nextAutoPauseAt = performance.now() + 32000;
  kiosk.last = performance.now();   // the idle clock starts when the drive does
  removeEventListener('keydown', releasePrologue);
  removeEventListener('pointerdown', releasePrologue);
}

if (location.search.includes('embed')) {
  released = true;
  rover.auto = true;
} else {
  setTimeout(releasePrologue, PROLOGUE_MS);
  setTimeout(() => {
    if (released) return;
    document.getElementById('ti-prologue')?.classList.add('armed');
    addEventListener('keydown', releasePrologue);
    addEventListener('pointerdown', releasePrologue);
  }, ARM_MS);
}

const resume = () => { if (!running) { running = true; tPrev = performance.now(); requestAnimationFrame(loop); } };
addEventListener('pageshow', resume);
addEventListener('pagehide', () => { running = false; });
document.addEventListener('visibilitychange', () =>
  document.visibilityState === 'visible' ? resume() : (running = false));

/* ── rebuild order matters: the scatter samples both of the others ────── */
async function rebuild() {
  const t0 = performance.now(); await ground.recompute(renderer);
  const t1 = performance.now(); await field.recompute(renderer);
  const t2 = performance.now(); await scatter.recompute(renderer);
  rc.ground = t1 - t0; rc.field = t2 - t1; rc.scatter = performance.now() - t2;
}

async function loop() {
  if (!running) return;
  try { await frame(); }
  catch (e) { running = false; fatal(e, 'frame'); return; }
  requestAnimationFrame(loop);
}

async function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - tPrev) / 1000);
  const frameMs = now - tPrev;
  tPrev = now;

  if (arrivalHoldUntil && now >= arrivalHoldUntil) {
    arrivalHoldUntil = 0;
    rover.transmitting = false;
    rover.auto = true;
    nextAutoPauseAt = now + 36000;
  }
  const arrivalWaiting = arrivalHoldUntil > now;
  if (rover.auto && !transmission.active && !arrivalWaiting && !ended) {
    if (!nextAutoPauseAt) nextAutoPauseAt = now + 32000;
    if (!autoPauseUntil && now >= nextAutoPauseAt) autoPauseUntil = now + 14000;
    if (autoPauseUntil && now >= autoPauseUntil) {
      autoPauseUntil = 0;
      nextAutoPauseAt = now + 46000;
    }
    rover.missionHold = autoPauseUntil > now;
    if (rover.chase) {
      const wide = 28.6 + Math.sin(now * 0.000085) * 3.0;
      rover.orbitDist += (wide - rover.orbitDist) * Math.min(1, dt * 0.18);
      rover.orbitPitch += (0.29 + Math.sin(now * 0.000061) * 0.055 - rover.orbitPitch) * Math.min(1, dt * 0.15);
      rover.orbitYaw += dt * 0.006;
    }
  } else if (!ended) {
    rover.missionHold = arrivalWaiting;
  }

  const v = rover.update(dt);
  optics.update(now, v, camera);
  minimap.update(v, now, power.charge, !transmission.active);
  uObserverR.value = world === 'desert' ? 1e7 : v.radius;

  const prevX = ground.origin.x, prevZ = ground.origin.y;
  if (ground.syncTo(rover.pos.x, rover.pos.z)) {
    if (!off('wake')) await wake.shift(renderer, ground.origin.x - prevX, ground.origin.y - prevZ);
    await rebuild();
    adaptive.skip();          // this window contains a rebuild stall — discard
    hud.flash();
  }

  /* two tracks, in the clipmap's local frame */
  if (!off('wake')) await wake.step(renderer, dt,
    v.trackA[0] - ground.origin.x, v.trackA[1] - ground.origin.y,
    v.trackB[0] - ground.origin.x, v.trackB[1] - ground.origin.y);
  dust?.update(dt, v);
  storm.update(dt, v, now);
  await transmission.update(now);

  sky.position.copy(camera.position);
  if (lens) { lens.focusAt(v.radius); lens.render(); }
  else renderer.render(scene, camera);

  if (!transmission.active) await kiosk.update(now, returnToStart);
  else kiosk.last = now;
  adaptive.sample(frameMs, now);
  /* ── the second clock ─────────────────────────────────────────────── */
  const pw = power.update(dt, { ...v, radius: world === 'desert' ? 1e7 : v.radius, lamps: rover.lamps });
  if (!transmission.active) survey.update(v, now, pw.charge);

  if (world === 'terra' && !transmission.active) {
    if (pw.dead) requestTransfer('power');
    else if (survey.complete && survey.completedAt && now - survey.completedAt > 18000) requestTransfer('complete');
  }
  rover.disabled = pw.dead;
  rover.transmitting = transmission.active || arrivalHoldUntil > now;
  /* switch × supply. The ground, the filaments and the airborne dust all read
     the same uniform, so a jolt dims the whole lit world at once. */
  uLampPower.value = rover.lamps ? pw.bus * transmission.light : 0;
  ambient.setPower((pw.dead ? 0 : pw.charge) * transmission.audio);

  if (world === 'desert' && pw.dead && !ended && !transmission.active) {
    ended = true;
    endedAt = now;
    /* The ending needs an image, and the mast camera cannot provide one — it
       is bolted to the thing that stopped. Step outside for the last shot. */
    rover.chase = true;
    rover.orbitYaw = 0.9; rover.orbitPitch = 0.22; rover.orbitDist = 7.5;
    document.body.classList.add('fh-dead');
    captions.force(END_LINE, now, 6500);
  }
  if (ended) {
    const u = Math.max(0, Math.min(1, (now - endedAt) / 20000));
    const ease = u * u * (3 - 2 * u);
    rover.orbitDist = 7.5 + ease * 24.5;
    rover.orbitPitch = 0.22 + ease * 0.10;
    rover.orbitYaw = 0.9 + ease * 0.34;
  }
  if (ended && now - power.deadAt > CFG.power.deadHold) { await returnToStart(); }

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
    hud.set('view', v.chase ? `chase · ${v.chaseDist.toFixed(1)} m — drag to orbit` : 'mast camera');
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
    hud.set('r', world === 'desert' ? `${v.radius.toFixed(1)} m · dune field`
                                    : `${v.radius.toFixed(1)} m · ${(v.radius / BH.rs).toFixed(2)} rs`);
    hud.set('region', regionOf(v.radius), v.radius < BH.rs * 1.5);
    hud.set('lapse', world === 'desert' ? '1.0000' : v.lapse.toFixed(4));
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

function requestTransfer(reason) {
  if (!released || world !== 'terra' || transmission.active) return false;
  const atlas = minimap.snapshot();
  if (reason === 'power') atlas.trail = atlas.trail.slice(-Math.max(1, Math.ceil(atlas.trail.length * 0.35)));
  const snapshot = { ...survey.snapshot(), atlas, trail: atlas.trail };
  return transmission.request(reason, snapshot);
}

async function enterDesert(reason, snapshot) {
  world = 'desert'; window.TI_WORLD = world; setWorldMode('desert');
  rover.metricEnabled = false;
  document.body.classList.add('ti-desert');
  landmark.position.set(-230, heightCPU(-230, -340) + 8, -340);
  landmark.visible = true;
  for (const mesh of scatter.meshes) mesh.visible = false;
  for (const mesh of beam.meshes) mesh.visible = false;
  dust?.clear(); power.reset(0.86);
  rover.lamps = true; rover.lidTilt = 0; rover.auto = false; rover.disabled = false; rover.transmitting = true;
  rover.reset(DESERT_START[0], DESERT_START[1], Math.atan2(DESERT_START[0], DESERT_START[1]));
  rover.auto = false; rover.transmitting = true;
  rover.update(0);
  captions.lines = DESERT_LINES; captions.rearm();
  survey.reset(DESERT_SURVEY); survey.inherit(snapshot);
  minimap.reset(DESERT_START, {
    id: 'BODY 02', label: 'DUNE FIELD',
    archives: [...minimap.archives, snapshot.atlas].filter(Boolean).slice(-2),
  });
  uObserverR.value = 1e7;
  ground.syncTo(rover.pos.x, rover.pos.z);
  if (!off('wake')) await wake.clear(renderer);
  await rebuild();
  storm.setActive(true, { x: rover.pos.x, z: rover.pos.z });
  lens?.focusAt(520);
}

async function returnToStart() {
  ended = false; endedAt = 0; arrivalHoldUntil = 0; nextAutoPauseAt = 0; autoPauseUntil = 0;
  world = 'terra'; window.TI_WORLD = world; setWorldMode('terra');
  rover.metricEnabled = true;
  document.body.classList.remove('fh-dead', 'ti-desert');
  transmission.reset(); storm.setActive(false);
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
    rover.auto = false;
    setTimeout(releasePrologue, PROLOGUE_MS);
    setTimeout(() => {
      if (released) return;
      document.getElementById('ti-prologue')?.classList.add('armed');
      addEventListener('keydown', releasePrologue);
      addEventListener('pointerdown', releasePrologue);
    }, ARM_MS);
  }
  dust?.clear();
  power.reset();
  rover.disabled = false;
  rover.transmitting = false;
  rover.lamps = true;
  rover.lidTilt = 0;
  rover.reset(BH.start[0], BH.start[1], START_HEADING);
  rover.auto = location.search.includes('embed');
  rover.chase = true;
  rover.orbitYaw = 0.05; rover.orbitPitch = 0.30; rover.orbitDist = 28.5;
  uObserverR.value = Math.hypot(...BH.start);
  captions.lines = LINES; captions.rearm();
  survey.reset(TERRA_SURVEY);
  minimap.reset(BH.start, { id: 'BODY 01', label: 'TERRA', archives: [] });
  ground.syncTo(rover.pos.x, rover.pos.z);
  if (!off('wake')) await wake.clear(renderer);
  await rebuild();
  lens?.focusAt(uObserverR.value);
}

function regionOf(r) {
  if (world === 'desert') return 'dune archive';
  if (r > BH.rTrough) return 'outer basin';
  if (r > BH.rBarrier) return 'descent';
  if (r > BH.rs * 1.5) return 'inside barrier';
  if (r > BH.rs) return 'photon sphere';
  return 'beyond horizon';
}

const deg = rad => `${(rad * 57.29578).toFixed(1)}°`;

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
