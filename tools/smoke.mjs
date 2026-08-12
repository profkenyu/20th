/**
 * SMOKE TEST — run the built file in a real browser and report.
 *
 *   npm run smoke
 *
 * Everything in this project was verified analytically, by API audit, and by
 * CPU mirror. None of the compute passes has been executed by the author's
 * tooling, because the development container has no WebGPU adapter. This
 * script closes that gap ON THE MACHINE THAT MATTERS: run it on the gallery
 * machine before the opening.
 *
 * It fails loudly on:
 *   · any console error or page error
 *   · the adapter gate firing
 *   · the module not reaching first frame
 *
 * And it reports the numbers this project has only ever budgeted for:
 * frame time, GPU compute, rebuild cost, and the CPU/GPU divergence.
 */

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DWELL = Number(process.env.DWELL ?? 15000);
const SEQUENCE = process.env.SEQUENCE === '1';
const MOBILE = process.env.MOBILE === '1';
const TARGET = process.argv[2] ?? `file://${ROOT}/index.html?test${MOBILE ? '&quality=low' : ''}`;
const [viewportWidth, viewportHeight] = String(process.env.VIEWPORT ?? '1600x900')
  .split('x').map(Number);

const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  channel: process.env.BROWSER_CHANNEL ?? 'chrome',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({
  viewport: {
    width: Number.isFinite(viewportWidth) ? viewportWidth : 1600,
    height: Number.isFinite(viewportHeight) ? viewportHeight : 900,
  },
  isMobile: MOBILE,
  hasTouch: MOBILE,
  userAgent: MOBILE
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    : undefined,
});
if (MOBILE) await page.emulateMedia({ reducedMotion: 'reduce' });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
page.on('requestfailed', r => errors.push(`request failed: ${r.url().slice(0, 90)}`));

console.log(`→ ${TARGET}`);
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.TI_READY === true, null, { timeout: 60000 });
await page.waitForTimeout(1000);
const introObserved = await page.evaluate(() => ({
  blueprint: window.TI_BLUEPRINT?.() ?? null,
  phase: window.TI_SEQUENCE?.().prologue ?? null,
}));
/* The explicit prologue CTA accepts Enter/Space. Diagnostic or navigation keys
   must never dismiss the first reading screen. */
const startId = MOBILE ? 'ti-mobile-start' : 'ti-start';
await page.waitForFunction(id => document.getElementById(id)?.disabled === false, startId,
  { timeout: 5000 });
const mobileIntro = MOBILE ? await page.evaluate(id => {
  const el = document.getElementById(id), rect = el?.getBoundingClientRect();
  return { visible: !!rect && rect.width >= 200 && rect.height >= 44, width: rect?.width, height: rect?.height };
}, startId) : null;
if (MOBILE) await page.click(`#${startId}`);
else await page.keyboard.press('Enter');
let blueprintObserved = null;
if (MOBILE) {
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'released', null,
    { timeout: 8000 });
  blueprintObserved = await page.evaluate(() => window.TI_BLUEPRINT?.() ?? null);
} else {
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'blueprint', null,
    { timeout: 5000 });
  await page.waitForTimeout(3800);
  blueprintObserved = await page.evaluate(() => window.TI_BLUEPRINT?.() ?? null);
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'released', null,
    { timeout: 12000 });
}

let mobileControl = null;
let soundCycle = null;
if (MOBILE) {
  await page.waitForTimeout(1600);
  await page.waitForFunction(() => document.getElementById('ti-mobile-steer')?.disabled === false,
    null, { timeout: 12000 });
  mobileControl = await page.evaluate(() => {
    const root = document.getElementById('ti-mobile-drive')?.getBoundingClientRect();
    const steer = document.getElementById('ti-mobile-steer')?.getBoundingClientRect();
    const sound = document.getElementById('ti-sound')?.getBoundingClientRect();
    const monitor = document.getElementById('ti-monitor')?.getBoundingClientRect();
    const cue = document.getElementById('ti-terminal-cue')?.getBoundingClientRect();
    const overlap = (a, b) => !!a && !!b && a.width > 0 && b.width > 0
      && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return {
      rootVisible: !!root && root.width > 0 && root.height >= 48,
      steerVisible: !!steer && steer.width > 60 && steer.height >= 44,
      soundVisible: !!sound && sound.width > 0 && sound.height >= 34,
      overlapSoundControl: overlap(sound, root),
      overlapSoundMonitor: overlap(sound, monitor),
      overlapCueControl: overlap(cue, root),
      overlapCueSound: overlap(cue, sound),
      steerX: steer ? steer.left + steer.width * .88 : 0,
      steerY: steer ? steer.top + steer.height * .5 : 0,
      audio: window.TI_AUDIO?.() ?? null,
    };
  });
  mobileControl.dispatched = await page.evaluate(({ x, y }) => {
    const el = document.getElementById('ti-mobile-steer');
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y,
    }));
    return true;
  }, { x: mobileControl.steerX, y: mobileControl.steerY });
  await page.waitForTimeout(220);
  mobileControl.dragExperience = await page.evaluate(() => window.TI_EXPERIENCE?.().mode ?? null);
  await page.evaluate(({ x, y }) => {
    document.getElementById('ti-mobile-steer')?.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
      clientX: x, clientY: y,
    }));
  }, { x: mobileControl.steerX, y: mobileControl.steerY });

  await page.click('#ti-sound');
  const off = await page.evaluate(() => window.TI_AUDIO?.() ?? null);
  await page.click('#ti-sound');
  await page.waitForFunction(() => window.TI_AUDIO?.().state === 'running');
  const on = await page.evaluate(() => window.TI_AUDIO?.() ?? null);
  soundCycle = { off, on };

  const failed = !mobileIntro?.visible || !mobileControl.rootVisible
    || !mobileControl.steerVisible || !mobileControl.soundVisible
    || mobileControl.overlapSoundControl || mobileControl.overlapSoundMonitor
    || mobileControl.overlapCueControl || mobileControl.overlapCueSound
    || !mobileControl.audio?.graphReady || !mobileControl.audio?.unlocked
    || mobileControl.audio?.state !== 'running' || mobileControl.audio?.ui !== 'on'
    || !soundCycle.off?.muted || soundCycle.off?.ui !== 'off'
    || soundCycle.on?.muted || soundCycle.on?.state !== 'running' || soundCycle.on?.ui !== 'on'
    || !mobileControl.dispatched || mobileControl.dragExperience !== 'explorer' || errors.length > 0;
  console.log(`\n  mobile intro CTA       ${JSON.stringify(mobileIntro)}`);
  console.log(`  mobile controls        ${JSON.stringify(mobileControl)}`);
  console.log(`  mobile sound cycle     ${JSON.stringify(soundCycle)}`);
  if (errors.length) console.log(`  browser errors         ${errors.slice(0, 6).join(' · ')}`);
  await page.screenshot({ path: `${ROOT}/dist/mobile-smoke.png` });
  await browser.close();
  if (failed) {
    console.log('\n✗ FAIL — mobile CTA/drag/sound contract');
    process.exit(1);
  }
  console.log('\n✓ PASS — mobile CTA visible, drag steering enters Explorer, sound control visible');
  process.exit(0);
}

const sequencePhases = [];
let sequenceComplete = !SEQUENCE;
let cameraCycle = null;
let roverPOV = null;
const sequenceShots = {
  waterTravelWide: false, waterConfirmedMacro: false, body02Rear: false,
  body02ObserverReturn: false, body03Rear: false, return: false, ascent: false,
};
if (SEQUENCE) {
  /* `=` fixes BODY 01, then confirms BODY 02's single water objective. Follow
     both transfers until their persistent evidence generates BODY 03's
     three-node Geological Memory mission. */
  await page.keyboard.press('Equal');
  /* Two deliberate dock/arrival breaths add 11.6 s to the authored passage.
     The deadline remains finite, but must include those visible holds rather
     than treating natural pacing as a hang. */
  const deadline = Date.now() + 220000;
  let last = '', waterShortcut = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.TI_SEQUENCE?.() ?? null);
    if (state) {
      if (state.world === 'desert' && state.water === 'searching'
          && state.waterDistance > 8 && state.cameraShot === 'wide') {
        sequenceShots.waterTravelWide = true;
        if (!sequenceShots.body02Rear) {
          await page.keyboard.press('KeyC');
          await page.waitForTimeout(240);
          const camera = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
          sequenceShots.body02Rear = camera?.world === 'desert'
            && camera?.shot === 'rear' && camera?.source === 'manual'
            && camera?.experience === 'explorer' && !camera?.locked;
          await page.keyboard.press('Space');
          await page.waitForTimeout(2650);
          const returned = await page.evaluate(() => ({
            camera: window.TI_CAMERA?.() ?? null,
            experience: window.TI_EXPERIENCE?.() ?? null,
          }));
          sequenceShots.body02ObserverReturn = returned.camera?.shot === 'wide'
            && returned.camera?.experience === 'observer'
            && returned.experience?.auto === true;
        }
      }
      if (state.world === 'desert' && state.water === 'confirmed'
          && state.cameraShot === 'macro') sequenceShots.waterConfirmedMacro = true;
      if ((state.docking !== 'idle' || ['hold', 'settle', 'deploy', 'egress', 'close'].includes(state.voyage))
          && state.cameraShot === 'return') sequenceShots.return = true;
      if (['lift', 'transit', 'descent'].includes(state.voyage)
          && state.cameraShot === 'ascent') sequenceShots.ascent = true;
      const key = `${state.world}|${state.mission}|${state.water}|${state.tableau}|${state.docking}|${state.voyage}|${state.restoration}|${state.cameraShot ?? '—'}`;
      if (key !== last) { sequencePhases.push(key); console.log(`  · ${key}`); last = key; }
      if (!waterShortcut && state.world === 'desert' && state.mission === 'water'
          && state.water === 'searching' && state.voyage === 'arrived'
          && state.waterDistance > 8 && sequenceShots.body02ObserverReturn) {
        waterShortcut = true;
        await page.keyboard.press('Equal');
      }
      if (state.world === 'granite' && state.mission === 'searching'
          && state.planets === 3 && state.tableau === 'idle'
          && state.docking === 'idle' && state.voyage === 'arrived') {
        if (!sequenceShots.body03Rear) {
          await page.keyboard.press('KeyC');
          await page.waitForTimeout(240);
          const camera = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
          sequenceShots.body03Rear = camera?.world === 'granite'
            && camera?.shot === 'rear' && camera?.source === 'manual'
            && camera?.experience === 'explorer' && !camera?.locked;
        }
        sequenceComplete = sequenceShots.body03Rear;
        break;
      }
    }
    await page.waitForTimeout(400);
  }
} else {
  /* let it settle, then walk for a while so a recentre and a caption both fire */
  await page.waitForTimeout(2700);
  const before = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  cameraCycle = { before, after };
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(250);
  roverPOV = await page.evaluate(() => window.TI_CAMERA?.() ?? null);
  await page.screenshot({ path: `${ROOT}/dist/rover-pov-smoke.png` });
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(DWELL);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.press('Space');
  await page.waitForTimeout(2650);
  await page.waitForTimeout(1200);
  await page.waitForTimeout(900);
}

const report = await page.evaluate(() => {
  const read = k => document.querySelector(`[data-v="${k}"]`)?.textContent ?? '—';
  const monitor = document.getElementById('ti-monitor')?.getBoundingClientRect();
  const missionPanel = document.getElementById('fh-mission')?.getBoundingClientRect();
  const overlap = monitor && missionPanel
    ? !(monitor.right <= missionPanel.left || monitor.left >= missionPanel.right
        || monitor.bottom <= missionPanel.top || monitor.top >= missionPanel.bottom) : null;
  const atlas = document.getElementById('ti-minimap');
  let greenPixels = 0, redPixels = 0, measuredPixels = 0;
  if (atlas) {
    const pixels = atlas.getContext('2d').getImageData(0, 0, atlas.width, atlas.height).data;
    for (let i = 0; i < pixels.length; i += 64) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
      if (a < 8) continue;
      measuredPixels++;
      if (g > 15 && g > r * 1.25 && g > b * 1.05) greenPixels++;
      if (r > 20 && r > g * 1.15) redPixels++;
    }
  }
  return {
    started: !!window.TI_READY,
    gate: document.getElementById('fh-gate')?.textContent.trim() ?? null,
    universe: window.UNIVERSE_SEED,
    backend: read('backend'), vendor: read('vendor'), tier: read('tier'),
    fps: read('fps'), cpuFrame: read('cpu'),
    gpuCompute: read('gc'), gpuRender: read('gr'),
    rebuildGround: read('rcT'), rebuildField: read('rcF'), rebuildFilaments: read('rcL'),
    recentres: read('recentre'), pixelRatio: read('dpr'),
    r: read('r'), region: read('region'), divergence: read('delta'),
    filaments: read('fcount'), vertices: read('fverts'),
    camera: window.TI_CAMERA?.() ?? null,
    audio: window.TI_AUDIO?.() ?? null,
    experience: window.TI_EXPERIENCE?.() ?? null,
    anomalies: window.TI_ANOMALIES?.().length ?? 0,
    water: window.TI_WATER?.() ?? null,
    memory: window.TI_MEMORY?.() ?? null,
    sequence: window.TI_SEQUENCE?.() ?? null,
    monitor: {
      overlap,
      backing: atlas ? `${atlas.width}x${atlas.height}` : null,
      greenRatio: measuredPixels ? greenPixels / measuredPixels : 0,
      redRatio: measuredPixels ? redPixels / measuredPixels : 0,
    },
  };
});
report.sequenceComplete = sequenceComplete;
report.cameraCycle = cameraCycle;
report.roverPOV = roverPOV;
report.sequenceShots = sequenceShots;
report.introObserved = introObserved;
report.blueprintObserved = blueprintObserved;
report.mobileIntro = mobileIntro;
report.mobileControl = mobileControl;
report.soundCycle = soundCycle;

await page.screenshot({ path: `${ROOT}/dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png` });
await browser.close();

const pad = s => String(s).padEnd(22);
console.log('');
for (const [k, v] of Object.entries(report)) console.log(`  ${pad(k)} ${v}`);
console.log(`\n  screenshot            dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png`);

const fatal = [];
if (!report.started) fatal.push('module never reached first frame');
if (introObserved?.phase !== 'text' || introObserved?.blueprint?.active) {
  fatal.push(`written prologue did not precede blueprint: ${JSON.stringify(introObserved)}`);
}
if (!blueprintObserved?.active || blueprintObserved.wire < 0.1
    || blueprintObserved.meshes < 100) {
  fatal.push(`Anime.js rover blueprint was not observed: ${JSON.stringify(blueprintObserved)}`);
}
if (report.gate) fatal.push(`adapter gate fired: ${report.gate}`);
if (!report.audio?.graphReady || !report.audio?.unlocked
    || report.audio?.state !== 'running' || report.audio?.muted || report.audio?.ui !== 'on') {
  fatal.push(`start gesture did not unlock audible score: ${JSON.stringify(report.audio)}`);
}
if (MOBILE && (!mobileIntro?.visible || !mobileControl?.rootVisible
    || !mobileControl?.steerVisible || !mobileControl?.soundVisible
    || mobileControl?.dragExperience !== 'explorer')) {
  fatal.push(`mobile CTA/drag/sound contract failed: ${JSON.stringify({ mobileIntro, mobileControl })}`);
}
if (!['wide', 'rear', 'mast', 'macro', 'tele', 'return', 'ascent'].includes(report.camera?.shot))
  fatal.push(`camera escaped authored/operator grammar: ${report.camera?.shot ?? 'missing'}`);
if (!SEQUENCE && (cameraCycle.before.shot === cameraCycle.after?.shot
    || cameraCycle.after?.source !== 'manual'
    || cameraCycle.after?.experience !== 'explorer')) {
  fatal.push(`C did not change an available authored shot: ${JSON.stringify(cameraCycle)}`);
}
if (!SEQUENCE && (roverPOV?.shot !== 'mast' || !roverPOV?.roverPOV
    || roverPOV?.lensProfile !== 'mast' || roverPOV?.source !== 'manual')) {
  fatal.push(`second C did not engage the 8 mm rover POV/lens profile: ${JSON.stringify(roverPOV)}`);
}
if (!SEQUENCE && (report.experience?.mode !== 'observer' || report.experience?.auto !== true)) {
  fatal.push(`Space did not return Explorer to Observer: ${JSON.stringify(report.experience)}`);
}
if (report.anomalies !== 8) fatal.push(`expected 8 terrain anomalies, found ${report.anomalies}`);
if (!sequenceComplete) fatal.push('authored sequence did not generate BODY 03 Geological Memory');
if (SEQUENCE && (!report.memory?.ledger?.ready
    || report.memory?.geological?.total !== 3
    || report.memory?.geological?.sources?.samples !== 8
    || report.memory?.geological?.sources?.water !== 'BODY02-H2O-01'
    || report.memory?.geological?.gpu?.backend !== 'webgpu-storage-compute'
    || report.memory?.geological?.gpu?.dispatches < 1)) {
  fatal.push(`BODY 03 memory synthesis incomplete: ${JSON.stringify(report.memory)}`);
}
if (SEQUENCE) {
  for (const [name, seen] of Object.entries(sequenceShots)) {
    if (!seen) fatal.push(`sequence never rendered required camera state: ${name}`);
  }
}
if ((report.sequence?.planets ?? 0) !== 3) fatal.push(`expected 3 planets, found ${report.sequence?.planets ?? 0}`);
if (report.monitor?.overlap) fatal.push('mission HUD overlaps the phosphor monitor');
if (report.monitor?.backing !== '308x352' || report.monitor?.greenRatio < 0.01
    || report.monitor?.redRatio > 0.002) {
  fatal.push(`phosphor monitor palette invalid: ${JSON.stringify(report.monitor)}`);
}
if (errors.length) fatal.push(`${errors.length} console/page error(s)`);
if (report.divergence !== '—' && /mm/.test(report.divergence)) fatal.push(`CPU/GPU divergence in mm: ${report.divergence}`);

if (fatal.length) {
  console.log('\n✗ FAIL');
  fatal.forEach(f => console.log('   •', f));
  errors.slice(0, 12).forEach(e => console.log('     ', e));
  process.exit(1);
}
console.log('\n✓ PASS — no errors, adapter present, divergence within tolerance');
