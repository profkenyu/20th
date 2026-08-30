import * as THREE from "three";
import { pass, uniform, float, mix, replaceDefaultUV, smoothstep, uv, vec2 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { cfg } from "../config.js";
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
    this.uRoverPOV = uniform(float(0));
    this.uAspect = uniform(float(camera.aspect));
    const scenePass = pass(scene, camera);
    const colour = scenePass.getTextureNode();
    const viewZ = scenePass.getViewZNode();
    const defocused = dof(colour, viewZ, this.uFocus, this.uFocalLength, this.uBokeh);
    const glow = bloom(defocused, this.uBloomStrength, this.uBloomRadius, this.uBloomThreshold);
    const opticalImage = defocused.add(glow);
    const centred = uv().sub(vec2(0.5));
    const sensorPlane = vec2(centred.x.mul(this.uAspect), centred.y);
    const r2 = sensorPlane.dot(sensorPlane);
    const radialScale = float(1).div(float(1).add(r2.mul(0.18)).add(r2.mul(r2).mul(0.02)));
    const warpedUV = vec2(
      sensorPlane.x.mul(radialScale).div(this.uAspect),
      sensorPlane.y.mul(radialScale)
    ).add(vec2(0.5));
    const vignette = float(1).sub(smoothstep(float(0.33), float(0.96), r2).mul(0.14));
    const mastImage = replaceDefaultUV(() => warpedUV, opticalImage).mul(vignette);
    this.post = new THREE.RenderPipeline(renderer);
    this.post.outputNode = mix(opticalImage, mastImage, this.uRoverPOV);
    this.scenePass = scenePass;
    this.profile = "";
    this._resize = () => {
      this.uAspect.value = camera.aspect;
    };
    addEventListener("resize", this._resize);
    addEventListener("ti-viewportresize", this._resize);
  }
  setProfile(shot = "wide") {
    this.uRoverPOV.value = shot === "mast" ? 1 : 0;
    if (shot === this.profile) return;
    this.profile = shot;
    const profiles = {
      wide: [0.085, 0.18, 0.01, 0.24, 1.36],
      rear: [0.105, 0.34, 0.014, 0.27, 1.32],
      mast: [0.09, 0.2, 0.012, 0.25, 1.34],
      macro: [0.165, 0.92, 0.026, 0.32, 1.24],
      tele: [0.135, 0.58, 0.018, 0.29, 1.3],
      return: [0.105, 0.34, 0.014, 0.27, 1.34],
      ascent: [0.09, 0.22, 0.012, 0.25, 1.38]
    };
    const [focal, bokeh, strength, radius, threshold] = profiles[shot] ?? profiles.wide;
    this.uFocalLength.value = focal;
    this.uBokeh.value = bokeh;
    this.uBloomStrength.value = strength;
    this.uBloomRadius.value = radius;
    this.uBloomThreshold.value = threshold;
  }
  focusAt(distance) {
    this.uFocus.value = Math.min(cfg().post.focusMax, Math.max(cfg().post.focusMin, distance));
  }
  render() {
    this.post.render();
  }
  async prewarm() {
    await this.scenePass.compileAsync(this.renderer);
    this.post.render();
    await this.renderer.backend?.device?.queue?.onSubmittedWorkDone?.();
  }
  dispose() {
    removeEventListener("resize", this._resize);
    removeEventListener("ti-viewportresize", this._resize);
    this.post.dispose?.();
    this.scenePass.dispose?.();
  }
}
