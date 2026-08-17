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
  const reasons = {
    adapter: ['NO WEBGPU ADAPTER',
      'This browser exposes WebGPU but could not obtain a hardware adapter. Check the browser GPU status and graphics driver.',
      '브라우저에 WebGPU는 있으나 하드웨어 어댑터를 얻지 못했다. 브라우저 GPU 상태와 그래픽 드라이버를 확인할 것.'],
    compatibility: ['CORE WEBGPU REQUIRED',
      'The available adapter exposes only WebGPU compatibility mode. This work requires the core feature and limit profile used by its storage-compute fields.',
      '사용 가능한 어댑터가 WebGPU 호환 모드만 제공한다. 이 작품의 스토리지·컴퓨트 장에는 코어 기능과 한계 프로필이 필요하다.'],
    limits: ['GPU LIMITS BELOW PROFILE',
      'WebGPU is available, but this adapter does not meet the storage-buffer or compute-workgroup limits required by the work.',
      'WebGPU는 사용할 수 있으나 이 작품에 필요한 스토리지 버퍼 또는 컴퓨트 워크그룹 한계에 미달한다.'],
    api: ['WEBGPU UNAVAILABLE',
      `${title || 'This work'} requires WebGPU. Use a current hardware-accelerated Chrome, Edge, Safari, or supported Firefox build.`,
      '이 작품은 WebGPU가 필요하다. 하드웨어 가속이 활성화된 최신 Chrome·Edge·Safari 또는 지원되는 Firefox에서 열 것.'],
  };
  const why = reasons[reason] ?? reasons.api;
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
  const viewportSize = () => {
    const viewport = window.visualViewport;
    return {
      width: Math.max(1, Math.round(viewport?.width || innerWidth)),
      height: Math.max(1, Math.round(viewport?.height || innerHeight)),
    };
  };
  const initialViewport = viewportSize();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(C.dprCeiling());
  renderer.setSize(initialViewport.width, initialViewport.height);
  renderer.setClearColor(new THREE.Color(...C.color.void), 1);
  /* trackTimestamp is enabled AFTER init, and only if the device actually has
     the feature — asking for query sets a device cannot make is a boot-time
     throw on some drivers. See enableTimestamps(). */

  const camera = new THREE.PerspectiveCamera(
    C.atmosphere.fov, initialViewport.width / initialViewport.height, 0.1, C.atmosphere.far);

  /* NOTE: the pixel ratio is NOT reset here. Adaptive owns it after boot, and
     resetting it on resize would silently discard its decision. External-app
     browser chrome can resize only `visualViewport`, so listen to both. The
     trailing delay avoids reallocating WebGPU targets on every toolbar frame. */
  let resizeTimer = 0;
  let renderedWidth = initialViewport.width;
  let renderedHeight = initialViewport.height;
  const applyViewport = () => {
    resizeTimer = 0;
    const viewport = viewportSize();
    if (viewport.width === renderedWidth && viewport.height === renderedHeight) return;
    renderedWidth = viewport.width;
    renderedHeight = viewport.height;
    camera.aspect = renderedWidth / renderedHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(renderedWidth, renderedHeight);
    dispatchEvent(new Event('ti-viewportresize'));
  };
  const scheduleViewport = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyViewport, 140);
  };
  addEventListener('resize', scheduleViewport, { passive: true });
  addEventListener('orientationchange', scheduleViewport, { passive: true });
  visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });

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
  if (!renderer) return false;
  let fired = false;
  const defaultLost = renderer.onDeviceLost?.bind(renderer);
  renderer.onError = info => {
    if (fired) return;
    fired = true;
    const detail = info?.message || `${info?.api ?? 'GPU'} ${info?.type ?? 'error'}`;
    onError(new Error(detail));
  };
  renderer.onDeviceLost = info => {
    defaultLost?.(info);
    if (fired) return;
    fired = true;
    onError(new Error(`device lost: ${info?.reason ?? 'unknown'} — ${info?.message ?? ''}`));
  };
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

const REQUIRED_LIMITS = Object.freeze({
  maxStorageBuffersPerShaderStage: 8,
  maxStorageBufferBindingSize: 128 * 1024 * 1024,
  maxBufferSize: 256 * 1024 * 1024,
  maxComputeWorkgroupSizeX: 256,
  maxComputeInvocationsPerWorkgroup: 256,
});

/** Inspect the exact device acquired by WebGPURenderer. A second adapter
    request can select a different physical GPU, so it is never used here. */
export function describeAdapter(renderer) {
  const backend = renderer?.backend;
  const device = backend?.device;
  const limits = device?.limits;
  const i = device?.adapterInfo ?? {};
  const missing = [];
  for (const [name, minimum] of Object.entries(REQUIRED_LIMITS)) {
    const actual = Number(limits?.[name] ?? 0);
    if (actual < minimum) missing.push(`${name} ${actual} < ${minimum}`);
  }
  const compatibility = backend?.compatibilityMode === true
    || !device?.features?.has?.('core-features-and-limits');
  return {
    vendor: i.vendor || i.description || 'undisclosed',
    arch: i.architecture || i.device || '—',
    storageMB: limits ? Math.round(limits.maxStorageBufferBindingSize / 1048576) : 0,
    workgroupX: limits?.maxComputeWorkgroupSizeX ?? 0,
    storageBuffers: limits?.maxStorageBuffersPerShaderStage ?? 0,
    maxBufferMB: limits ? Math.round(limits.maxBufferSize / 1048576) : 0,
    compatibility,
    missing,
    supported: !!device && !compatibility && missing.length === 0,
  };
}
