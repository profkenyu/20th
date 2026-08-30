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
const AUTO_PROLOGUE = process.env.AUTO_PROLOGUE === '1';
const CAPTURE_BLUEPRINT = process.env.CAPTURE_BLUEPRINT === '1';
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
  opening: window.TI_OPENING?.() ?? null,
  blueprint: window.TI_BLUEPRINT?.() ?? null,
  phase: window.TI_SEQUENCE?.().prologue ?? null,
  cover: (() => {
    const el = document.getElementById('arrive');
    return el ? {
      revealSource: el.dataset.revealSource ?? '',
      opacity: Number.parseFloat(getComputedStyle(el).opacity),
    } : null;
  })(),
}));
let blueprintLayout = null;
if (MOBILE) {
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty('--safe-top', '44px');
    root.style.setProperty('--safe-bottom', '34px');
    root.style.setProperty('--safe-left', '8px');
    root.style.setProperty('--safe-right', '8px');
    dispatchEvent(new Event('ti-viewportresize'));
  });
  /* Reduced-motion still presents both static plates. Observe the second one
     after its black-datum separation rather than treating reduced motion as a
     reason to skip the lander. */
  await page.waitForFunction(() => {
    const state = window.TI_BLUEPRINT?.();
    return state?.current?.startsWith('lander') && state.annotationCount === 5;
  }, null, { timeout: 12000 });
  blueprintLayout = await page.evaluate(() => {
    const section = document.getElementById('ti-opening-blueprints')?.getBoundingClientRect();
    const frame = document.querySelector('#ti-opening-blueprints .bp-frame')?.getBoundingClientRect();
    const drawing = document.querySelector('#ti-opening-blueprints .bp-drawing')?.getBoundingClientRect();
    const spec = document.querySelector('#ti-opening-blueprints .bp-spec');
    const specRect = spec?.getBoundingClientRect();
    const specStyle = spec ? getComputedStyle(spec) : null;
    const canvas = document.querySelector('#ti-opening-blueprints canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const topFrame = document.querySelector('.bar.t')?.getBoundingClientRect().height ?? 0;
    const bottomFrame = document.querySelector('.bar.b')?.getBoundingClientRect().height ?? 0;
    const state = window.TI_BLUEPRINT?.() ?? null;
    return {
      visible: !!section && section.width > 0 && section.height > 0,
      current: state?.current,
      shown: state?.shown,
      scan: state?.scan,
      scanDirection: state?.scanDirection,
      scanSpeed: state?.scanSpeed,
      annotationCount: state?.annotationCount,
      sectionInsideFrame: !!section && section.top >= topFrame - 1
        && section.bottom <= innerHeight - bottomFrame + 1,
      frameInsideViewport: !!frame && frame.top >= topFrame
        && frame.bottom <= innerHeight - bottomFrame && frame.left >= 8 && frame.right <= innerWidth - 8,
      drawingVisible: !!drawing && drawing.width > 120 && drawing.height > 120,
      specVisible: !!specRect && specRect.width > 120 && specRect.height > 70,
      specOverflow: !!spec && spec.scrollHeight > spec.clientHeight + 1,
      gridConfinedToDrawing: specStyle?.backgroundImage === 'none',
      canvasReady: !!canvas && canvas.width > 0 && canvas.height > 0
        && !!canvasRect && canvasRect.width > 120 && canvasRect.height > 120,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      section: section ? { top: section.top, bottom: section.bottom, width: section.width, height: section.height } : null,
      frame: frame ? { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right } : null,
    };
  });
}
let openingLifecycle = null;
let openingMotion = null;
if (!MOBILE && introObserved.opening?.active) {
  const lifecycleBefore = introObserved.opening;
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  openingLifecycle = { before: lifecycleBefore, hidden, resumed };
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === 'rover' && state.scanDirection === 1
      && state.scan > .10 && state.scan < .90;
  }, null, { timeout: 9000 });
  const before = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === 'rover' && state.scanDirection === -1 && state.scan > .96;
  }, null, { timeout: 9000 });
  const afterTurn = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  await page.waitForFunction(() => {
    const state = window.TI_OPENING?.();
    return state?.current === 'rover' && state.scanDirection === -1 && state.scan < .12;
  }, null, { timeout: 5000 });
  const nearReturn = await page.evaluate(() => window.TI_OPENING?.() ?? null);
  openingMotion = { before, afterTurn, nearReturn };
  if (CAPTURE_BLUEPRINT) {
    await page.screenshot({ path: resolve(ROOT, 'dist/blueprint-rover-return.png') });
    await page.waitForFunction(() => {
      const state = window.TI_OPENING?.();
      return state?.current?.startsWith('lander') && state.annotationCount === 5;
    }, null, { timeout: 9000 });
    await page.screenshot({ path: resolve(ROOT, 'dist/blueprint-lander-return.png') });
  }
}
/* The explicit prologue CTA accepts Enter/Space. Diagnostic or navigation keys
   must never dismiss the first reading screen. */
const startId = MOBILE ? 'ti-mobile-start' : 'ti-start';
await page.waitForFunction(id => document.getElementById(id)?.disabled === false, startId,
  { timeout: 30000 });
const readInputGate = () => page.evaluate(() => {
  const sound = document.getElementById('ti-sound');
  const green = document.getElementById('ti-green');
  const soundRect = sound?.getBoundingClientRect();
  const greenRect = green?.getBoundingClientRect();
  const hit = soundRect && document.elementFromPoint(
    soundRect.left + soundRect.width * .5, soundRect.top + soundRect.height * .5);
  const greenHit = greenRect && document.elementFromPoint(
    greenRect.left + greenRect.width * .5, greenRect.top + greenRect.height * .5);
  const drive = document.getElementById('ti-mobile-drive')?.getBoundingClientRect();
  return {
    phase: window.TI_SEQUENCE?.().prologue ?? null,
    controlsReady: window.TI_PROLOGUE?.().controlsReady ?? null,
    soundDisabled: !!sound?.disabled,
    soundOwnsPoint: !!sound && (hit === sound || sound.contains(hit)),
    greenDisabled: !!green?.disabled,
    greenOwnsPoint: !!green && (greenHit === green || green.contains(greenHit)),
    driveVisible: !!drive && drive.width > 0 && drive.height > 0,
    audio: window.TI_AUDIO?.() ?? null,
  };
});
const preReleaseInput = await readInputGate();
let blueprintObserved = await page.evaluate(() => window.TI_BLUEPRINT?.() ?? null);
let prologueLifecycle = null;
if (!MOBILE) {
  const before = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  prologueLifecycle = { text: { before, hidden, resumed }, blueprint: null };
}
const mobileIntro = MOBILE ? await page.evaluate(id => {
  const el = document.getElementById(id);
  const root = document.documentElement;
  const rect = el?.getBoundingClientRect();
  const style = el ? getComputedStyle(el) : null;
  const topFrame = document.querySelector('.bar.t')?.getBoundingClientRect().height ?? 0;
  const bottomFrame = document.querySelector('.bar.b')?.getBoundingClientRect().height ?? 0;
  const prologue = document.getElementById('ti-prologue')?.getBoundingClientRect();
  const inner = document.querySelector('#ti-prologue .inner');
  const innerRect = inner?.getBoundingClientRect();
  const controlsRect = document.querySelector('#ti-prologue .controls')?.getBoundingClientRect();
  const overlaps = (a, b) => !!a && !!b && a.width > 0 && b.width > 0
    && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  return {
    visible: !!rect && rect.width >= 58 && rect.height >= 58,
    label: el?.textContent?.trim() ?? '',
    circular: !!rect && Math.abs(rect.width - rect.height) <= 2
      && (!!style?.borderTopLeftRadius?.includes('%')
        || parseFloat(style?.borderTopLeftRadius ?? '0') >= rect.width * .45),
    insideViewport: !!rect && rect.top >= topFrame && rect.bottom <= innerHeight - bottomFrame,
    prologueInsideViewport: !!prologue && prologue.top >= 0 && prologue.bottom <= innerHeight + 1,
    innerInsideFrame: !!innerRect && innerRect.left >= 8 && innerRect.right <= innerWidth - 8
      && innerRect.top >= topFrame && innerRect.bottom <= innerHeight - bottomFrame,
    innerOverflow: !!inner && inner.scrollHeight > inner.clientHeight + 1,
    overlapsControls: overlaps(innerRect, controlsRect),
    viewportReady: root.classList.contains('ti-viewport-ready'),
    viewportWidth: getComputedStyle(root).getPropertyValue('--viewport-width').trim(),
    viewportHeight: getComputedStyle(root).getPropertyValue('--viewport-height').trim(),
    topFrame, bottomFrame, width: rect?.width, height: rect?.height,
  };
}, startId) : null;
if (AUTO_PROLOGUE) {
  /* The title is an eight-second idle gate: no input must enter the work. */
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'release', null,
    { timeout: 11000 });
} else if (MOBILE) await page.click(`#${startId}`);
else await page.keyboard.press('Enter');
await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'release', null,
  { timeout: 5000 });
const blueprintInput = await readInputGate();
if (MOBILE) {
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'released', null,
    { timeout: 8000 });
} else {
  const before = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(240);
  const hidden = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  await page.evaluate(() => dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(120);
  const resumed = await page.evaluate(() => window.TI_PROLOGUE?.() ?? null);
  prologueLifecycle.blueprint = { before, hidden, resumed };
  await page.waitForFunction(() => window.TI_SEQUENCE?.().prologue === 'released', null,
    { timeout: 12000 });
}

let mobileControl = null;
let soundCycle = null;
let greenMode = null;
const readGreenMode = () => page.evaluate(() => {
  const button = document.getElementById('ti-green');
  const rect = button?.getBoundingClientRect();
  const screen = document.getElementById('ti-terminal-screen');
  const render = window.TI_RENDER_MODE?.() ?? null;
  return {
    label: button?.textContent?.trim() ?? '',
    pressed: button?.getAttribute('aria-pressed') === 'true',
    disabled: !!button?.disabled,
    state: button?.dataset.greenState ?? '',
    visible: !!rect && rect.width >= 44 && rect.width <= 72 && rect.height >= 24 && rect.height <= 32,
    soundHeight: document.getElementById('ti-sound')?.getBoundingClientRect().height ?? 0,
    classActive: document.body.classList.contains('ti-green-monitor'),
    terminal: document.body.classList.contains('ti-terminal'),
    screenVisible: screen ? getComputedStyle(screen).display !== 'none' : false,
    canvasFilter: getComputedStyle(document.getElementById('gl')).filter,
    render,
    rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
  };
});
if (!MOBILE) {
  await page.waitForTimeout(3200);
  const before = await readGreenMode();
  await page.click('#ti-green');
  await page.waitForTimeout(950);
  const on = await readGreenMode();
  await page.screenshot({ path: `${ROOT}/dist/green-monitor-desktop.png` });
  await page.click('#ti-green');
  await page.waitForTimeout(950);
  const off = await readGreenMode();
  greenMode = { before, on, off };
}
if (MOBILE) {
  await page.waitForTimeout(1600);
  await page.waitForFunction(() => document.getElementById('ti-mobile-steer')?.disabled === false,
    null, { timeout: 12000 });
  mobileControl = await page.evaluate(() => {
    const root = document.getElementById('ti-mobile-drive')?.getBoundingClientRect();
    const steer = document.getElementById('ti-mobile-steer')?.getBoundingClientRect();
    const sound = document.getElementById('ti-sound')?.getBoundingClientRect();
    const green = document.getElementById('ti-green')?.getBoundingClientRect();
    const monitor = document.getElementById('ti-monitor')?.getBoundingClientRect();
    const cue = document.getElementById('ti-terminal-cue')?.getBoundingClientRect();
    const overlap = (a, b) => !!a && !!b && a.width > 0 && b.width > 0
      && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return {
      rootVisible: !!root && root.width > 0 && root.height >= 48,
      steerVisible: !!steer && steer.width > 60 && steer.height >= 44,
      soundVisible: !!sound && sound.width > 0 && sound.height >= 24 && sound.height <= 28,
      greenVisible: !!green && green.width >= 44 && green.width <= 72 && green.height >= 24 && green.height <= 32,
      balancedButtons: !!sound && !!green && Math.abs(sound.height - green.height) <= 1,
      overlapSoundControl: overlap(sound, root),
      overlapSoundMonitor: overlap(sound, monitor),
      overlapGreenControl: overlap(green, root),
      overlapGreenMonitor: overlap(green, monitor),
      overlapGreenSound: overlap(green, sound),
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
  greenMode = { locked: await readGreenMode() };

  const failed = !mobileIntro?.visible || !mobileIntro?.insideViewport
    || !blueprintLayout?.visible || blueprintLayout.current !== 'lander'
    || !blueprintLayout.sectionInsideFrame || !blueprintLayout.frameInsideViewport
    || !blueprintLayout.drawingVisible || !blueprintLayout.specVisible
    || blueprintLayout.specOverflow || !blueprintLayout.gridConfinedToDrawing
    || !blueprintLayout.canvasReady
    || blueprintLayout.horizontalOverflow
    || blueprintLayout.annotationCount !== 5
    || Math.abs(blueprintLayout.scan - .5) > .01 || blueprintLayout.scanDirection !== 0
    || blueprintLayout.scanSpeed !== 0
    || blueprintObserved?.active || blueprintObserved?.current !== 'complete'
    || !blueprintObserved?.shown?.includes('rover')
    || !blueprintObserved?.shown?.includes('lander')
    || blueprintObserved?.models?.rover?.segments < 700
    || blueprintObserved?.models?.lander?.segments < 700
    || !preReleaseInput.soundDisabled || preReleaseInput.soundOwnsPoint
    || !preReleaseInput.greenDisabled || preReleaseInput.greenOwnsPoint
    || preReleaseInput.driveVisible || preReleaseInput.controlsReady
    || !blueprintInput.soundDisabled || blueprintInput.soundOwnsPoint
    || !blueprintInput.greenDisabled || blueprintInput.greenOwnsPoint
    || blueprintInput.driveVisible || blueprintInput.controlsReady
    || mobileIntro?.label !== 'START' || !mobileIntro?.circular
    || !mobileIntro?.prologueInsideViewport || !mobileIntro?.innerInsideFrame
    || mobileIntro?.innerOverflow || mobileIntro?.overlapsControls || !mobileIntro?.viewportReady
    || !mobileControl.rootVisible
    || !mobileControl.steerVisible || !mobileControl.soundVisible || !mobileControl.greenVisible || !mobileControl.balancedButtons
    || mobileControl.overlapSoundControl || mobileControl.overlapSoundMonitor
    || mobileControl.overlapGreenControl || mobileControl.overlapGreenMonitor || mobileControl.overlapGreenSound
    || mobileControl.overlapCueControl || mobileControl.overlapCueSound
    || !mobileControl.audio?.graphReady || !mobileControl.audio?.unlocked
    || mobileControl.audio?.state !== 'running' || mobileControl.audio?.ui !== 'on'
    || !soundCycle.off?.muted || soundCycle.off?.ui !== 'off'
    || soundCycle.on?.muted || soundCycle.on?.state !== 'running' || soundCycle.on?.ui !== 'on'
    || greenMode.locked?.label !== 'GREEN' || !greenMode.locked?.visible
    || !greenMode.locked?.pressed || !greenMode.locked?.disabled
    || greenMode.locked?.state !== 'on' || !greenMode.locked?.terminal
    || !greenMode.locked?.screenVisible || !greenMode.locked?.render?.archive
    || !greenMode.locked?.canvasFilter?.includes('grayscale(1)')
    || !mobileControl.dispatched || mobileControl.dragExperience !== 'explorer' || errors.length > 0;
  console.log(`\n  mobile intro CTA       ${JSON.stringify(mobileIntro)}`);
  console.log(`  blueprint safe frame   ${JSON.stringify(blueprintLayout)}`);
  console.log(`  pre-release input      ${JSON.stringify(preReleaseInput)}`);
  console.log(`  blueprint input gate   ${JSON.stringify(blueprintInput)}`);
  console.log(`  mobile controls        ${JSON.stringify(mobileControl)}`);
  console.log(`  mobile sound cycle     ${JSON.stringify(soundCycle)}`);
  console.log(`  green monitor          ${JSON.stringify(greenMode)}`);
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
report.openingLifecycle = openingLifecycle;
report.openingMotion = openingMotion;
report.prologueLifecycle = prologueLifecycle;
report.preReleaseInput = preReleaseInput;
report.blueprintInput = blueprintInput;
report.blueprintObserved = blueprintObserved;
report.blueprintLayout = blueprintLayout;
report.mobileIntro = mobileIntro;
report.mobileControl = mobileControl;
report.soundCycle = soundCycle;
report.greenMode = greenMode;

await page.screenshot({ path: `${ROOT}/dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png` });
await browser.close();

const pad = s => String(s).padEnd(22);
console.log('');
for (const [k, v] of Object.entries(report)) console.log(`  ${pad(k)} ${v}`);
console.log(`\n  screenshot            dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png`);

const fatal = [];
if (!report.started) fatal.push('module never reached first frame');
if (introObserved?.phase !== 'blueprints'
    || introObserved?.cover?.revealSource !== 'blueprint'
    || !introObserved?.opening?.seen
    || !introObserved?.opening?.active
    || !['noise', 'rover'].includes(introObserved?.opening?.current)
    || introObserved?.opening?.models?.rover?.meshes < 80
    || introObserved?.opening?.models?.lander?.meshes < 40
    || introObserved?.opening?.models?.rover?.segments < 700
    || introObserved?.opening?.models?.lander?.segments < 700
    || introObserved?.opening?.models?.lander?.parts !== 5
    || !['x', 'y', 'z'].every(axis =>
      Number.isFinite(introObserved?.opening?.models?.rover?.dimensions?.[axis])
      && introObserved.opening.models.rover.dimensions[axis] > 0
      && Number.isFinite(introObserved?.opening?.models?.lander?.dimensions?.[axis])
      && introObserved.opening.models.lander.dimensions[axis] > 0)) {
  fatal.push(`production rover blueprint did not precede lander/text: ${JSON.stringify(introObserved)}`);
}
if (!MOBILE && openingLifecycle && (!openingLifecycle.hidden?.suspended
    || openingLifecycle.resumed?.suspended || !openingLifecycle.resumed?.active
    || Math.abs(openingLifecycle.hidden.progress - openingLifecycle.before.progress) > 0.03)) {
  fatal.push(`opening lifecycle did not pause/resume in place: ${JSON.stringify(openingLifecycle)}`);
}
if (!MOBILE && (!openingMotion
    || openingMotion.before?.scanDirection !== 1
    || openingMotion.afterTurn?.scanDirection !== -1
    || openingMotion.afterTurn?.scan < .96
    || openingMotion.afterTurn?.scanSpeed > .35
    || openingMotion.afterTurn?.annotationCount > 1
    || openingMotion.nearReturn?.scanDirection !== -1
    || openingMotion.nearReturn?.scan > .12
    || openingMotion.nearReturn?.annotationCount !== 6
    || openingMotion.afterTurn.scan - openingMotion.nearReturn.scan < .8)) {
  fatal.push(`CRT scan did not reverse with gradual velocity: ${JSON.stringify(openingMotion)}`);
}
if (!MOBILE && (!prologueLifecycle?.text?.hidden?.timers?.release?.paused
    || !prologueLifecycle.text.resumed?.timers?.release?.active
    || prologueLifecycle.text.resumed?.timers?.release?.paused
    || prologueLifecycle.text.hidden?.phase !== 'text'
    || !prologueLifecycle?.blueprint?.hidden?.timers?.blueprint?.paused
    || !prologueLifecycle.blueprint.resumed?.timers?.blueprint?.active
    || prologueLifecycle.blueprint.resumed?.timers?.blueprint?.paused
    || prologueLifecycle.blueprint.hidden?.phase !== 'release')) {
  fatal.push(`prologue timers did not pause/resume in place: ${JSON.stringify(prologueLifecycle)}`);
}
if (!preReleaseInput.soundDisabled || preReleaseInput.soundOwnsPoint
    || preReleaseInput.driveVisible || preReleaseInput.controlsReady
    || !preReleaseInput.greenDisabled || preReleaseInput.greenOwnsPoint
    || !blueprintInput.soundDisabled || blueprintInput.soundOwnsPoint
    || !blueprintInput.greenDisabled || blueprintInput.greenOwnsPoint
    || blueprintInput.driveVisible || blueprintInput.controlsReady) {
  fatal.push(`opening input gate leaked through an obscuring layer: ${JSON.stringify({ preReleaseInput, blueprintInput })}`);
}
if (blueprintObserved?.active || blueprintObserved?.current !== 'complete'
    || blueprintObserved?.scan !== 0 || blueprintObserved?.scanDirection !== 0
    || blueprintObserved?.scanSpeed !== 0
    || blueprintObserved?.annotationCount !== 5
    || !blueprintObserved?.shown?.includes('rover')
    || !blueprintObserved?.shown?.includes('lander')
    || blueprintObserved?.models?.rover?.sourceSegments < blueprintObserved?.models?.rover?.segments
    || blueprintObserved?.models?.lander?.sourceSegments < blueprintObserved?.models?.lander?.segments) {
  fatal.push(`rover → lander production blueprint sequence was incomplete: ${JSON.stringify(blueprintObserved)}`);
}
if (report.gate) fatal.push(`adapter gate fired: ${report.gate}`);
if (!report.audio?.graphReady || !report.audio?.unlocked
    || report.audio?.state !== 'running' || report.audio?.muted || report.audio?.ui !== 'on') {
  fatal.push(`start gesture did not unlock audible score: ${JSON.stringify(report.audio)}`);
}
if (!MOBILE && (!greenMode?.before?.visible || greenMode.before.label !== 'GREEN'
    || greenMode.before.pressed || greenMode.before.disabled || greenMode.before.state !== 'off'
    || Math.abs(greenMode.before.soundHeight - greenMode.before.rect.height) > 1
    || !greenMode?.on?.visible || !greenMode.on.pressed || greenMode.on.disabled
    || greenMode.on.state !== 'on' || !greenMode.on.classActive || !greenMode.on.screenVisible
    || !greenMode.on.canvasFilter?.includes('grayscale(1)')
    || greenMode.on.render?.archive || !greenMode.on.render?.green || !greenMode.on.render?.greenManual
    || greenMode.off.pressed || greenMode.off.disabled || greenMode.off.state !== 'off'
    || greenMode.off.classActive || greenMode.off.screenVisible
    || greenMode.off.canvasFilter !== greenMode.before.canvasFilter
    || greenMode.off.render?.archive || greenMode.off.render?.green || greenMode.off.render?.greenManual)) {
  fatal.push(`GREEN monitor toggle did not preserve the high-tier renderer: ${JSON.stringify(greenMode)}`);
}
if (MOBILE && (!mobileIntro?.visible || mobileIntro?.label !== 'START' || !mobileIntro?.circular
    || !mobileControl?.rootVisible
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
