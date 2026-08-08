/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ODYSSEY ENGINE — WebGPU compute clipmap for planetary works.
 * 20th solo exhibition · shared by every work in the series.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THE ENGINE OWNS
 *   the recentring height clipmap and its normals · the baked vector field ·
 *   instanced scatter with ring LOD · the world-anchored wake · the sky dome ·
 *   gravitational optics · the lens · adaptive resolution · the instrument
 *   panel · captions · the kiosk return · the score · vehicles
 *
 * WHAT A WORK OWNS
 *   its constants · its height field, written twice and kept adjacent ·
 *   its field potential · its albedo and lighting · its text
 *
 * THE ONE STRUCTURAL RULE
 *   No engine module reads cfg() at module scope. ES module imports hoist, so
 *   a work calling configure() in its own module body still runs after every
 *   engine module has been evaluated. Reads live in constructors and in TSL
 *   function bodies, both of which run later. cfg() throws if that is broken.
 *
 * A MINIMAL WORK
 *
 *   import { configure, deviceTier, Clipmap, Rover, … } from '../../engine/index.js';
 *   configure({ lattice: { seed }, scatter: { rings: […] }, metric: { rs } });
 *   const ground = new Clipmap({ height: myHeightFn, shade: myShadeFn });
 *
 * Everything else — recentring, normals, redshift, fog, the edge fade — is
 * already decided, and decided the same way for every work in the series.
 */

export { configure, cfg, defaults, deviceTier, universeSeed, DEV } from './config.js';

export { Clipmap } from './world/clipmap.js';
export { Field } from './world/field.js';
export { Scatter } from './world/scatter.js';
export { Wake } from './world/wake.js';
export { Beam } from './world/beam.js';
export { Dust } from './world/dust.js';
export { Sandstorm } from './world/sandstorm.js';
export { ResolutionTransferFX } from './world/resolution-transfer.js';
export { buildSky } from './world/sky.js';

export { fbm, ridge, vnoise, cellHash, grain, fbmNorm } from './tsl/noise.js';
export * as CPU from './cpu/noise.js';
export { nuRatio, nuRatioCPU, blueshiftGainCPU, BLUESHIFT_GAIN_MAX,
         redshift, lapseAt, uObserverR } from './tsl/relativity.js';
export { headlight, uLampA, uLampB, uLampDir, uLampPower } from './tsl/headlight.js';

export { createRenderer, describeAdapter, unsupported, fatal, enableTimestamps,
         captureDeviceErrors } from './core/renderer.js';
export { Lens } from './core/post.js';
export { Adaptive } from './core/adaptive.js';
export { Hud } from './core/hud.js';
export { Captions } from './core/captions.js';
export { Kiosk } from './core/kiosk.js';
export { Ambient } from './core/ambient.js';
export { PlanetTransfer } from './core/transfer.js';
export { MobileControl } from './core/mobile-control.js';

export { Power } from './vehicle/power.js';
export { Rover } from './vehicle/rover.js';
export { Lander } from './vehicle/lander.js';
export { Walker } from './vehicle/walker.js';
