/**
 * HEADLIGHT — the only light in this engine that is not the sun.
 *
 * WHY IT IS NOT A THREE.js LIGHT
 *   Nothing in these worlds uses a light object. The ground, the sky, the
 *   scatter and the vehicle each solve one raking sun in their own colorNode,
 *   because that is cheaper than a lighting pass and because the sun here is a
 *   compositional decision rather than a physical one. A SpotLight added to
 *   the scene would therefore do exactly nothing. A lamp has to be a term in
 *   the same expression.
 *
 * THE MODEL IS PHYSICAL
 *   cone × inverse-square × N·L. The cone is a smoothstep between the cosines
 *   of the inner and outer half-angles — the standard spot falloff, done on
 *   cosines so no arccos is needed per fragment. Attenuation is
 *   1/(1 + (d/reach)²), which is inverse-square with the singularity removed
 *   rather than a linear fade dressed up as one.
 *
 * THERE IS NO BEAM
 *   On a world with no atmosphere nothing scatters, so the shaft of light is
 *   invisible: you see the lit ground and nothing between. Every instinct says
 *   to add a volumetric cone, and every instinct is wrong here. The absence is
 *   the fact.
 *
 * AND IT IS NOT REDSHIFTED
 *   ν_o/ν_e depends on the emitter's radius and the observer's. The lamp and
 *   the camera are bolted to the same chassis, so the ratio is exactly one.
 *   The engine therefore adds this term AFTER the redshift, never inside it.
 *
 *   The consequence is the best thing about the whole feature: as the probe
 *   descends and the world dims to a few per cent of its emitted brightness,
 *   the headlights do not dim at all. Deep enough, the planet is only what the
 *   machine's own lamps are touching.
 */

import {
  uniform, float, vec3, dot, max, min, abs, saturate, smoothstep, length,
} from 'three/tsl';
import { cfg } from '../config.js';

export const uLampA = uniform(vec3(0, 0, 0));
export const uLampB = uniform(vec3(0, 0, 0));
export const uLampDir = uniform(vec3(0, 0, -1));
export const uLampPower = uniform(float(1));

/**
 * @param worldPos  fragment position, world space
 * @param normal    surface normal, world space
 * @param twoSided  ribbons are DoubleSide, so their N·L is unsigned
 */
export function headlight(worldPos, normal, twoSided = false) {
  const H = cfg().headlight;
  if (!H || H.count === 0) return vec3(0, 0, 0);

  const lamp = P => {
    const d = worldPos.sub(P);
    const dist = max(length(d), float(0.05));
    const dir = d.div(dist);                       // lamp → surface
    const cone = smoothstep(float(H.cosOuter), float(H.cosInner), dot(dir, uLampDir));
    const q = dist.div(H.reach);
    const atten = float(1.0).div(float(1.0).add(q.mul(q)));
    const nl = twoSided ? abs(dot(normal, dir)) : saturate(dot(normal, dir.negate()));
    return cone.mul(atten).mul(nl);
  };

  const sum = H.count === 1 ? lamp(uLampA) : lamp(uLampA).add(lamp(uLampB));
  return vec3(...H.colour).mul(min(sum, float(2.0))).mul(H.intensity).mul(uLampPower);
}
