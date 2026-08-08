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

    this.uFocus = uniform(float(P.focusMax));

    const scenePass = pass(scene, camera);
    const colour = scenePass.getTextureNode();
    const viewZ = scenePass.getViewZNode();

    const defocused = dof(colour, viewZ, this.uFocus, float(P.focalLength), float(P.bokeh));
    const glow = bloom(defocused, P.bloomStrength, P.bloomRadius, P.bloomThreshold);

    /* PostProcessing was renamed to RenderPipeline in r185 */
    this.post = new THREE.RenderPipeline(renderer);
    this.post.outputNode = defocused.add(glow);

    this.scenePass = scenePass;
  }

  /** Camera-space distance to the current subject, in metres. */
  focusAt(distance) {
    this.uFocus.value = Math.min(cfg().post.focusMax, Math.max(cfg().post.focusMin, distance));
  }

  /* renderAsync() deprecated r181 — renderer.init() is already awaited */
  render() { this.post.render(); }

  dispose() {
    this.post.dispose?.();
    this.scenePass.dispose?.();
  }
}
