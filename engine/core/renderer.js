import * as THREE from "three";
import { cfg } from "../config.js";
export function unsupported(reason = "api", title = "") {
  window.TI_READY = true;
  const reasons = {
    adapter: [
      "NO WEBGPU ADAPTER",
      "This browser exposes WebGPU but could not obtain a hardware adapter. Check the browser GPU status and graphics driver.",
      "\uBE0C\uB77C\uC6B0\uC800\uC5D0 WebGPU\uB294 \uC788\uC73C\uB098 \uD558\uB4DC\uC6E8\uC5B4 \uC5B4\uB311\uD130\uB97C \uC5BB\uC9C0 \uBABB\uD588\uB2E4. \uBE0C\uB77C\uC6B0\uC800 GPU \uC0C1\uD0DC\uC640 \uADF8\uB798\uD53D \uB4DC\uB77C\uC774\uBC84\uB97C \uD655\uC778\uD560 \uAC83."
    ],
    compatibility: [
      "CORE WEBGPU REQUIRED",
      "The available adapter exposes only WebGPU compatibility mode. This work requires the core feature and limit profile used by its storage-compute fields.",
      "\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uC5B4\uB311\uD130\uAC00 WebGPU \uD638\uD658 \uBAA8\uB4DC\uB9CC \uC81C\uACF5\uD55C\uB2E4. \uC774 \uC791\uD488\uC758 \uC2A4\uD1A0\uB9AC\uC9C0\xB7\uCEF4\uD4E8\uD2B8 \uC7A5\uC5D0\uB294 \uCF54\uC5B4 \uAE30\uB2A5\uACFC \uD55C\uACC4 \uD504\uB85C\uD544\uC774 \uD544\uC694\uD558\uB2E4."
    ],
    limits: [
      "GPU LIMITS BELOW PROFILE",
      "WebGPU is available, but this adapter does not meet the storage-buffer or compute-workgroup limits required by the work.",
      "WebGPU\uB294 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC73C\uB098 \uC774 \uC791\uD488\uC5D0 \uD544\uC694\uD55C \uC2A4\uD1A0\uB9AC\uC9C0 \uBC84\uD37C \uB610\uB294 \uCEF4\uD4E8\uD2B8 \uC6CC\uD06C\uADF8\uB8F9 \uD55C\uACC4\uC5D0 \uBBF8\uB2EC\uD55C\uB2E4."
    ],
    api: [
      "WEBGPU UNAVAILABLE",
      `${title || "This work"} requires WebGPU. Use a current hardware-accelerated Chrome, Edge, Safari, or supported Firefox build.`,
      "\uC774 \uC791\uD488\uC740 WebGPU\uAC00 \uD544\uC694\uD558\uB2E4. \uD558\uB4DC\uC6E8\uC5B4 \uAC00\uC18D\uC774 \uD65C\uC131\uD654\uB41C \uCD5C\uC2E0 Chrome\xB7Edge\xB7Safari \uB610\uB294 \uC9C0\uC6D0\uB418\uB294 Firefox\uC5D0\uC11C \uC5F4 \uAC83."
    ]
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
export function fatal(err, where = "") {
  window.TI_READY = true;
  const msg = err && (err.message || String(err)) || "unknown error";
  const stack = err && err.stack ? String(err.stack).split("\n").slice(0, 6).join("\n") : "";
  console.error("[TERRA INCOGNITA]", where, err);
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  document.body.innerHTML = `
    <div class="bar t"></div><div class="bar b"></div>
    <div style="position:fixed;inset:0;background:#050506;display:flex;flex-direction:column;
      justify-content:center;padding:0 8vw;gap:13px;overflow:auto;
      font-family:'DM Mono','Noto Sans KR',ui-monospace,monospace;color:#8a9099">
      <div id="fh-fatal" style="font-family:'Space Mono',monospace;font-size:13px;letter-spacing:.24em;color:#c0152a">
        RUNTIME FAULT${where ? " \xB7 " + esc(where.toUpperCase()) : ""}</div>
      <div style="width:56px;height:1px;background:#c0152a"></div>
      <p style="font-size:12px;line-height:1.8;color:#d9dde2;max-width:80ch">${esc(msg)}</p>
      <pre style="font-size:10px;line-height:1.7;color:#5a6068;white-space:pre-wrap;max-width:100ch">${esc(stack)}</pre>
      <p style="font-size:11px;line-height:1.9;max-width:60ch">
        Reload with <span style="color:#d9dde2">?safe</span> to disable the lens and the wake \u2014
        if it runs then, the fault is in one of those.</p>
      <p style="font-size:11px;line-height:1.9;max-width:60ch">
        \uC8FC\uC18C \uB05D\uC5D0 <span style="color:#d9dde2">?safe</span> \uB97C \uBD99\uC5EC \uB2E4\uC2DC \uC5F4\uBA74 \uB80C\uC988\uC640 \uD30C\uBB38\uC744 \uB048\uB2E4.
        \uADF8 \uC0C1\uD0DC\uB85C \uAD6C\uB3D9\uB418\uBA74 \uC6D0\uC778\uC740 \uB458 \uC911 \uD558\uB098\uB2E4.</p>
    </div>`;
}
export function createRenderer(canvas) {
  const C = cfg();
  const viewportSize = () => {
    const viewport = window.visualViewport;
    return {
      width: Math.max(1, Math.round(viewport?.width || innerWidth)),
      height: Math.max(1, Math.round(viewport?.height || innerHeight))
    };
  };
  const initialViewport = viewportSize();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(C.dprCeiling());
  renderer.setSize(initialViewport.width, initialViewport.height);
  renderer.setClearColor(new THREE.Color(...C.color.void), 1);
  const camera = new THREE.PerspectiveCamera(
    C.atmosphere.fov,
    initialViewport.width / initialViewport.height,
    0.1,
    C.atmosphere.far
  );
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
    dispatchEvent(new Event("ti-viewportresize"));
  };
  const scheduleViewport = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyViewport, 140);
  };
  addEventListener("resize", scheduleViewport, { passive: true });
  addEventListener("orientationchange", scheduleViewport, { passive: true });
  visualViewport?.addEventListener("resize", scheduleViewport, { passive: true });
  return { renderer, camera };
}
export function captureDeviceErrors(renderer, onError) {
  if (!renderer) return false;
  let fired = false;
  const defaultLost = renderer.onDeviceLost?.bind(renderer);
  renderer.onError = (info) => {
    if (fired) return;
    fired = true;
    const detail = info?.message || `${info?.api ?? "GPU"} ${info?.type ?? "error"}`;
    onError(new Error(detail));
  };
  renderer.onDeviceLost = (info) => {
    defaultLost?.(info);
    if (fired) return;
    fired = true;
    onError(new Error(`device lost: ${info?.reason ?? "unknown"} \u2014 ${info?.message ?? ""}`));
  };
  return true;
}
export function enableTimestamps(renderer) {
  try {
    if (!renderer.hasFeature("timestamp-query")) return false;
    renderer.trackTimestamp = true;
    return true;
  } catch {
    return false;
  }
}
const REQUIRED_LIMITS = Object.freeze({
  maxStorageBuffersPerShaderStage: 8,
  maxStorageBufferBindingSize: 128 * 1024 * 1024,
  maxBufferSize: 256 * 1024 * 1024,
  maxComputeWorkgroupSizeX: 256,
  maxComputeInvocationsPerWorkgroup: 256
});
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
  const compatibility = backend?.compatibilityMode === true || !device?.features?.has?.("core-features-and-limits");
  return {
    vendor: i.vendor || i.description || "undisclosed",
    arch: i.architecture || i.device || "\u2014",
    storageMB: limits ? Math.round(limits.maxStorageBufferBindingSize / 1048576) : 0,
    workgroupX: limits?.maxComputeWorkgroupSizeX ?? 0,
    storageBuffers: limits?.maxStorageBuffersPerShaderStage ?? 0,
    maxBufferMB: limits ? Math.round(limits.maxBufferSize / 1048576) : 0,
    compatibility,
    missing,
    supported: !!device && !compatibility && missing.length === 0
  };
}
