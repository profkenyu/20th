import * as THREE from 'three';
import { cfg } from '../config.js';

/**
 * Two distinct failures, and they must be distinguished.
 *
 *   'api'     — navigator.gpu is absent. An old browser.
 *   'adapter' — navigator.gpu exists but requestAdapter returned null. A
 *               blocklisted driver, a headless session, a machine with no
 *               usable GPU. THIS IS THE DANGEROUS ONE: three does not throw,
 *               it silently falls back to the WebGL2 backend, where compute
 *               passes cannot run. Without this gate the visitor gets a black
 *               screen and a console full of shader errors.
 *
 * Verified by execution: in a headless container `navigator.gpu` is present,
 * the adapter is null, and the renderer proceeds to a VALIDATE_STATUS failure.
 * Checking `navigator.gpu` alone is not enough.
 */
export function unsupported(reason = 'api', title = '') {
  window.TI_READY = true;      // the module ran and reached a verdict
  const why = reason === 'adapter'
    ? ['NO WEBGPU ADAPTER',
       'This browser exposes WebGPU but could not obtain an adapter — usually a blocklisted driver or a machine without a usable GPU. Check that <span style="color:#d9dde2">chrome://gpu</span> reports WebGPU as hardware accelerated.',
       '브라우저에 WebGPU는 있으나 어댑터를 얻지 못했다. 드라이버 차단이거나 사용 가능한 GPU가 없는 경우다. chrome://gpu에서 WebGPU 항목을 확인할 것.']
    : ['WEBGPU UNAVAILABLE',
       `${title || 'This work'} requires WebGPU. Open in Chrome or Edge 121+ on desktop, or Safari 26+.`,
       '이 작품은 WebGPU를 요구한다. 데스크톱 Chrome/Edge 121 이상 또는 Safari 26 이상에서 열 것.'];
  document.body.innerHTML = `
    <div class="bar t"></div><div class="bar b"></div>
    <div style="position:fixed;inset:0;background:#050506;display:flex;flex-direction:column;
      justify-content:center;padding:0 12vw;gap:14px;
      font-family:'DM Mono','Noto Sans KR',ui-monospace,monospace;color:#8a9099">
      <div id="fh-gate" style="font-family:'Space Mono',monospace;font-size:13px;letter-spacing:.24em;color:#c0152a">
        ${why[0]}</div>
      <div style="width:56px;height:1px;background:#c0152a"></div>
      <p style="font-size:11px;line-height:1.9;max-width:48ch">${why[1]}</p>
      <p style="font-size:11px;line-height:1.9;max-width:48ch">${why[2]}</p>
    </div>`;
}

/**
 * FATAL — the screen must never fail silently.
 *
 * The adapter gate covers the case where WebGPU is missing. It does not cover
 * a shader that will not compile, a limit that is exceeded, or any throw
 * inside the boot sequence — and because the boot runs inside a module with
 * top-level await, such a throw surfaces as an unhandled rejection and leaves
 * a BLACK SCREEN WITH NO MESSAGE. That is the worst possible failure in a
 * gallery: indistinguishable from a work that is simply very dark.
 *
 * Everything routes here instead. The message is on the wall, in both
 * languages, with the first frames of the stack, so a failure can be reported
 * in one sentence rather than described.
 */
export function fatal(err, where = '') {
  window.TI_READY = true;
  const msg = (err && (err.message || String(err))) || 'unknown error';
  const stack = (err && err.stack ? String(err.stack).split('\n').slice(0, 6).join('\n') : '');
  console.error('[TERRA INCOGNITA]', where, err);
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  document.body.innerHTML = `
    <div class="bar t"></div><div class="bar b"></div>
    <div style="position:fixed;inset:0;background:#050506;display:flex;flex-direction:column;
      justify-content:center;padding:0 8vw;gap:13px;overflow:auto;
      font-family:'DM Mono','Noto Sans KR',ui-monospace,monospace;color:#8a9099">
      <div id="fh-fatal" style="font-family:'Space Mono',monospace;font-size:13px;letter-spacing:.24em;color:#c0152a">
        RUNTIME FAULT${where ? ' · ' + esc(where.toUpperCase()) : ''}</div>
      <div style="width:56px;height:1px;background:#c0152a"></div>
      <p style="font-size:12px;line-height:1.8;color:#d9dde2;max-width:80ch">${esc(msg)}</p>
      <pre style="font-size:10px;line-height:1.7;color:#5a6068;white-space:pre-wrap;max-width:100ch">${esc(stack)}</pre>
      <p style="font-size:11px;line-height:1.9;max-width:60ch">
        Reload with <span style="color:#d9dde2">?safe</span> to disable the lens and the wake —
        if it runs then, the fault is in one of those.</p>
      <p style="font-size:11px;line-height:1.9;max-width:60ch">
        주소 끝에 <span style="color:#d9dde2">?safe</span> 를 붙여 다시 열면 렌즈와 파문을 끈다.
        그 상태로 구동되면 원인은 둘 중 하나다.</p>
    </div>`;
}

export function createRenderer(canvas) {
  const C = cfg();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
  renderer.setPixelRatio(C.dprCeiling());
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(new THREE.Color(...C.color.void), 1);
  /* trackTimestamp is enabled AFTER init, and only if the device actually has
     the feature — asking for query sets a device cannot make is a boot-time
     throw on some drivers. See enableTimestamps(). */

  const camera = new THREE.PerspectiveCamera(
    C.atmosphere.fov, innerWidth / innerHeight, 0.1, C.atmosphere.far);

  /* NOTE: the pixel ratio is NOT reset here. Adaptive owns it after boot, and
     resetting it on resize would silently discard its decision. */
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, camera };
}

/**
 * WEBGPU VALIDATION ERRORS DO NOT THROW. They are reported asynchronously to
 * the device, three logs them and carries on, and what the visitor gets is a
 * black screen and a console nobody is reading. On a gallery machine that is
 * indistinguishable from a work that is simply very dark — and on a machine
 * that is not mine, it is indistinguishable from nothing at all.
 *
 * This routes the device's own error stream to the on-screen fault panel, so
 * the FIRST validation failure is legible without a console: what the driver
 * actually objected to, in the driver's own words.
 *
 * Only the first is shown. One validation error usually causes a cascade, and
 * the first is the one that means anything.
 */
export function captureDeviceErrors(renderer, onError) {
  const device = renderer.backend?.device;
  if (!device) return false;
  let fired = false;
  device.addEventListener?.('uncapturederror', e => {
    if (fired) return;
    fired = true;
    onError(e.error ?? e);
  });
  device.lost?.then(info => {
    if (fired) return;
    fired = true;
    onError(new Error(`device lost: ${info.reason} — ${info.message}`));
  });
  return true;
}

/** Safe to call after init. Returns whether GPU timings are available. */
export function enableTimestamps(renderer) {
  try {
    if (!renderer.hasFeature('timestamp-query')) return false;
    renderer.trackTimestamp = true;
    return true;
  } catch { return false; }
}

export async function describeAdapter() {
  const a = await navigator.gpu?.requestAdapter();
  const i = a?.info ?? {};
  return {
    vendor: i.vendor || 'undisclosed',
    arch: i.architecture || i.device || '—',
    storageMB: a ? Math.round(a.limits.maxStorageBufferBindingSize / 1048576) : 0,
    workgroupX: a ? a.limits.maxComputeWorkgroupSizeX : 0,
    storageBuffers: a ? a.limits.maxStorageBuffersPerShaderStage : 0,
    maxBufferMB: a ? Math.round(a.limits.maxBufferSize / 1048576) : 0,
  };
}
