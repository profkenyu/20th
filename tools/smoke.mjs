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
const TARGET = process.argv[2] ?? `file://${ROOT}/index.html`;
const DWELL = Number(process.env.DWELL ?? 15000);
const SEQUENCE = process.env.SEQUENCE === '1';

const browser = await chromium.launch({
  headless: process.env.HEADED ? false : true,
  channel: 'chromium',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
page.on('requestfailed', r => errors.push(`request failed: ${r.url().slice(0, 90)}`));

console.log(`→ ${TARGET}`);
await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 });

const sequencePhases = [];
let sequenceComplete = !SEQUENCE;
if (SEQUENCE) {
  /* `=` fixes BODY 01, then confirms BODY 02's single water objective. Follow
     both transfers until BODY 03 arrives with its mission intentionally open. */
  await page.waitForTimeout(1800);
  await page.keyboard.press('Equal');
  const deadline = Date.now() + 190000;
  let last = '', waterShortcut = false;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.TI_SEQUENCE?.() ?? null);
    if (state) {
      const key = `${state.world}|${state.mission}|${state.water}|${state.tableau}|${state.docking}|${state.voyage}|${state.restoration}|${state.cameraShot ?? '—'}`;
      if (key !== last) { sequencePhases.push(key); console.log(`  · ${key}`); last = key; }
      if (!waterShortcut && state.world === 'desert' && state.mission === 'water'
          && state.water === 'searching' && state.voyage === 'arrived') {
        waterShortcut = true;
        await page.keyboard.press('Equal');
      }
      if (state.world === 'granite' && state.mission === 'pending'
          && state.planets === 3 && state.tableau === 'idle'
          && state.docking === 'idle' && state.voyage === 'arrived') {
        sequenceComplete = true;
        break;
      }
    }
    await page.waitForTimeout(400);
  }
} else {
  /* let it settle, then walk for a while so a recentre and a caption both fire */
  await page.waitForTimeout(3000);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(DWELL);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(1200);
  await page.waitForTimeout(900);
}

const report = await page.evaluate(() => {
  const read = k => document.querySelector(`[data-v="${k}"]`)?.textContent ?? '—';
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
    anomalies: window.TI_ANOMALIES?.().length ?? 0,
    water: window.TI_WATER?.() ?? null,
    sequence: window.TI_SEQUENCE?.() ?? null,
  };
});
report.sequenceComplete = sequenceComplete;

await page.screenshot({ path: `${ROOT}/dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png` });
await browser.close();

const pad = s => String(s).padEnd(22);
console.log('');
for (const [k, v] of Object.entries(report)) console.log(`  ${pad(k)} ${v}`);
console.log(`\n  screenshot            dist/${SEQUENCE ? 'sequence-smoke' : 'smoke'}.png`);

const fatal = [];
if (!report.started) fatal.push('module never reached first frame');
if (report.gate) fatal.push(`adapter gate fired: ${report.gate}`);
if (!['wide', 'macro', 'tele', 'return', 'ascent'].includes(report.camera?.shot))
  fatal.push(`camera escaped five-shot grammar: ${report.camera?.shot ?? 'missing'}`);
if (report.anomalies !== 8) fatal.push(`expected 8 terrain anomalies, found ${report.anomalies}`);
if (!sequenceComplete) fatal.push('authored sequence did not reach BODY 03 with mission pending');
if ((report.sequence?.planets ?? 0) !== 3) fatal.push(`expected 3 planets, found ${report.sequence?.planets ?? 0}`);
if (errors.length) fatal.push(`${errors.length} console/page error(s)`);
if (report.divergence !== '—' && /mm/.test(report.divergence)) fatal.push(`CPU/GPU divergence in mm: ${report.divergence}`);

if (fatal.length) {
  console.log('\n✗ FAIL');
  fatal.forEach(f => console.log('   •', f));
  errors.slice(0, 12).forEach(e => console.log('     ', e));
  process.exit(1);
}
console.log('\n✓ PASS — no errors, adapter present, divergence within tolerance');
