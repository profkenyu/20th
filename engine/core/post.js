/**
 * LENS — depth of field, then bloom.
 *
 * ORDER, AND A CORRECTION TO THE PHASE 0 SPEC
 *   Phase 0 specified Bloom → DoF → SMAA. Two changes:
 *
 *   · DoF now runs BEFORE bloom. Both are lens effects, but defocus happens
 *     at the aperture and scatter happens after it, so an out-of-focus bright
 *     point should bloom as a disc rather than a point that is then blurred.
 *     Running bloom first produces a crisp glow inside a soft image, which is
 *     the signature of a compositing mistake.
 *
 *   · SMAA was dropped. `PassNode` inherits `renderer.samples`, so the scene
 *     pass is already MSAA 4×, and this world has no textures — its only
 *     aliasing source is thin ribbon edges, which is precisely what MSAA
 *     solves in hardware. SMAA is a morphological filter operating on the
 *     resolved image; it would soften the filament silhouettes we spent
 *     Phase 2 keeping crisp, for a second full-screen pass.
 *
 * FOCUS
 *   Depth of field consumes camera-space distance, never the vehicle's radial
 *   coordinate in the world. The work supplies the current camera-to-subject
 *   distance each frame; scripted two-subject shots may instead focus their
 *   shared aim point. Confusing those two distances once put a 600 m focal
 *   plane behind a rover only 29 m from the lens, defocusing the entire image
 *   and feeding that energy into bloom.
 */

import * as THREE from 'three';
import { pass, uniform, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { cfg } from '../config.js';

export class Lens {
  constructor(renderer, scene, camera) {
    const P = cfg().post;
    this.renderer = renderer;

    this.uFocus = uniform(float(P.focusMax));
    this.uFocalLength = uniform(float(P.focalLength));
    this.uBokeh = uniform(float(P.bokeh));
    this.uBloomStrength = uniform(float(P.bloomStrength));
    this.uBloomRadius = uniform(float(P.bloomRadius));
    this.uBloomThreshold = uniform(float(P.bloomThreshold));

    const scenePass = pass(scene, camera);
    const colour = scenePass.getTextureNode();
    const viewZ = scenePass.getViewZNode();

    const defocused = dof(colour, viewZ, this.uFocus, this.uFocalLength, this.uBokeh);
    const glow = bloom(defocused, this.uBloomStrength, this.uBloomRadius, this.uBloomThreshold);

    /* PostProcessing was renamed to RenderPipeline in r185 */
    this.post = new THREE.RenderPipeline(renderer);
    this.post.outputNode = defocused.add(glow);

    this.scenePass = scenePass;
    this.profile = '';
  }

  /** Lens behaviour belongs to a shot, not to a global beauty filter. */
  setProfile(shot = 'wide') {
    if (shot === this.profile) return;
    this.profile = shot;
    const profiles = {
      wide:   [0.085, 0.18, 0.010, 0.24, 1.36],
      rear:   [0.105, 0.34, 0.014, 0.27, 1.32],
      macro:  [0.165, 0.92, 0.026, 0.32, 1.24],
      tele:   [0.135, 0.58, 0.018, 0.29, 1.30],
      return: [0.105, 0.34, 0.014, 0.27, 1.34],
      ascent: [0.090, 0.22, 0.012, 0.25, 1.38],
    };
    const [focal, bokeh, strength, radius, threshold] = profiles[shot] ?? profiles.wide;
    this.uFocalLength.value = focal;
    this.uBokeh.value = bokeh;
    this.uBloomStrength.value = strength;
    this.uBloomRadius.value = radius;
    this.uBloomThreshold.value = threshold;
  }

  /** Camera-space distance to the current subject, in metres. */
  focusAt(distance) {
    this.uFocus.value = Math.min(cfg().post.focusMax, Math.max(cfg().post.focusMin, distance));
  }

  /* renderAsync() deprecated r181 — renderer.init() is already awaited */
  render() { this.post.render(); }

  /** Compile both the scene pass and the full-screen RenderPipeline while the
      written prologue still covers the canvas. This turns the visitor's first
      visible camera transition into a normal frame instead of a shader hitch. */
  async prewarm() {
    await this.scenePass.compileAsync(this.renderer);
    this.post.render();
    await this.renderer.backend?.device?.queue?.onSubmittedWorkDone?.();
  }

  dispose() {
    this.post.dispose?.();
    this.scenePass.dispose?.();
  }
}
