/**
 * Terra Incognita — the surface, both implementations, side by side.
 *
 * The height field exists twice: once in TSL for the clipmap's compute pass,
 * once in JavaScript for the rover's wheel contacts. Keeping them in ONE FILE,
 * adjacent, is the point — a change to one that is not mirrored in the other
 * is visible in a diff rather than discoverable at runtime.
 *
 * The runtime divergence probe compares them once a second at the grid vertex
 * nearest the rover. Expected: single-digit µm, from f32 vs f64 rounding
 * inside the pcg permutation. Anything in millimetres is a logic drift.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PHYSICS IS EXACT. None of it is a Newtonian stand-in.
 *
 *   V(r) = −M/r + L²/2r² − M·L²/r³
 *
 * The third term is the general-relativistic correction. It is the only reason
 * this differs from a Newtonian well, and it is why the barrier exists at all.
 * Extrema solve r² − (L²/M)·r + 3L² = 0, real only when L ≥ √12·M.
 *
 * Using V(r) as a height field is a metaphor made precise: the ground IS the
 * potential a test particle would have to climb. What that buys is that THE
 * COMPOSITION IS DERIVED — the circular rampart at r = 74.23 m that hides the
 * horizon from an approaching rover is the angular-momentum barrier, sitting
 * exactly where the equation puts it. Nobody placed it.
 *
 * For r < rs the potential is not defined for an exterior observer, so the
 * ground is floored at V(rs). Nothing inside is claimed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  Fn, float, vec2, vec3, length, pow, smoothstep, mix, max, min, saturate, dot, abs, sqrt, sin, uniform,
} from 'three/tsl';
import { fbm, ridge, grain } from '../../engine/tsl/noise.js';
import { T, D, G, BH } from './spec.js';
import { heightCPU, normalCPU, veff, solarAccessCPU, setCPUWorldMix } from './surface.cpu.js';

export const uWorldMix = uniform(0);
export const uWorldGranite = uniform(0);

export function setWorldMode(mode) {
  uWorldMix.value = mode === 'desert' ? 1 : 0;
  uWorldGranite.value = mode === 'granite' ? 1 : 0;
  setCPUWorldMix(mode);
}

/* ── the effective potential ──────────────────────────────────────────── */
const veffGPU = Fn(([r]) => {
  const rc = max(r, float(BH.rs));
  return float(-BH.M).div(rc)
    .add(float(BH.L2 * 0.5).div(rc.mul(rc)))
    .sub(float(BH.M * BH.L2).div(rc.mul(rc).mul(rc)));
});

/* ── destination geology ────────────────────────────────────────────────
   One elongated ridge field made the first desert statistically identical in
   every direction. The destination now unfolds in three acts without adding
   geometry or a draw call: asymmetric transverse dunes, a broad eroded wadi,
   then exposed basalt shelves beneath two low distant mesas.

   Total noise budget remains nine octaves — the same as the old desert. */
const desertGPU = p => {
  const u = p.x.mul(D.windCos).add(p.y.mul(D.windSin)).toVar();
  const v = p.x.mul(-D.windSin).add(p.y.mul(D.windCos)).toVar();
  const regional = fbm(p.mul(D.macroFreq).add(93.7), 3).toVar();
  const warpN = fbm(vec2(u.mul(0.0022), v.mul(0.00085)).add(17.1), 2).toVar();
  const strata = ridge(vec2(u.mul(D.yardangU), v.mul(D.yardangV)).add(63.4), 2).toVar();
  const skin = fbm(p.mul(0.045).add(5.8), 2).toVar();

  const phase = u.add(warpN.sub(0.5).mul(D.warpAmp)).add(sin(v.mul(0.0048)).mul(12.0))
    .mul(6.283185307 / D.duneLambda).toVar();
  const wave = sin(phase).mul(0.72)
    .add(sin(phase.mul(2.0).sub(0.70)).mul(0.20))
    .add(sin(phase.mul(3.0).sub(1.10)).mul(0.08));
  const amp = smoothstep(float(0.26), float(0.74), regional)
    .mul(D.duneAmpHi - D.duneAmpLo).add(D.duneAmpLo);

  /* Offset from the arrival province: the rover must first read the dunes,
     then cross the wadi. Centring this contour at 0.50 placed the landing
     point inside the erosion mask for the exhibition seed. */
  const contour = abs(regional.sub(0.43)).toVar();
  const wadiNatural = float(1.0).sub(smoothstep(float(0.028), float(0.105), contour));
  const along = p.x.mul(0.181).add(p.y.mul(0.983));
  const archiveDist = abs(along.sub(365.0).add(warpN.sub(0.5).mul(42.0))).toVar();
  const wadiRoute = float(1.0).sub(smoothstep(float(16.0), float(54.0), archiveDist)).mul(0.88);
  const wadi = max(wadiNatural, wadiRoute).toVar();
  const bed = max(
    float(1.0).sub(smoothstep(float(0.014), float(0.045), contour)),
    float(1.0).sub(smoothstep(float(8.0), float(22.0), archiveDist)),
  ).toVar();

  const rock = smoothstep(float(0.72), float(0.89), strata.add(wadi.mul(0.10))).toVar();
  const dune = wave.mul(amp)
    .mul(float(1.0).sub(wadi.mul(0.88)))
    .mul(float(1.0).sub(rock.mul(0.65)));
  const yardang = pow(strata, D.yardangExp).mul(D.yardangAmp)
    .mul(float(1.0).sub(wadi.mul(0.72)));

  const crustA = abs(sin(u.mul(D.crustU)
    .add(sin(v.mul(D.crustWarpV)).mul(D.crustWarpAmp))));
  const crustB = abs(sin(v.mul(D.crustV)
    .add(sin(u.mul(D.crustWarpU)).mul(D.crustWarpAmp))));
  const crustLine = float(1.0).sub(smoothstep(float(0.025), float(0.115), min(crustA, crustB)));
  const crustBed = max(bed, wadi.mul(0.60));
  const crustCut = crustLine.mul(crustBed)
    .mul(float(1.0).sub(rock.mul(0.80))).mul(0.12);

  const a = D.mesaA, b = D.mesaB;
  const ellA = length(vec2(
    p.x.sub(a[0]).add(warpN.sub(0.5).mul(22.0)).div(a[2]),
    p.y.sub(a[1]).add(regional.sub(0.5).mul(14.0)).div(a[3]),
  ));
  const ellB = length(vec2(
    p.x.sub(b[0]).sub(warpN.sub(0.5).mul(18.0)).div(b[2]),
    p.y.sub(b[1]).add(regional.sub(0.5).mul(12.0)).div(b[3]),
  ));
  const mesaA = float(1.0).sub(smoothstep(float(0.72), float(1.08), ellA)).mul(a[4]);
  const mesaB = float(1.0).sub(smoothstep(float(0.74), float(1.10), ellB)).mul(b[4]);

  return regional.sub(0.5).mul(5.5)
    .add(dune).sub(wadi).sub(bed.mul(0.65))
    .add(yardang).sub(crustCut)
    .add(rock.mul(skin.mul(1.35).add(0.45)))
    .add(mesaA).add(mesaB)
    .add(skin.sub(0.5).mul(0.18).mul(float(1.0).sub(rock.mul(0.75))));
};

/* BODY 03 — broad, weather-softened granite rather than another directional
   dune field. Embedded stone relief remains low enough for the suspension to
   read as mass without turning the plain into an obstacle course. */
const graniteGPU = p => {
  const macro = fbm(p.mul(G.macroFreq).add(141.7), G.macroOct)
    .sub(0.5).mul(G.macroAmp);
  const shelf = pow(ridge(p.mul(G.shelfFreq).add(26.3), G.shelfOct), G.shelfExp)
    .mul(G.shelfAmp).sub(G.shelfAmp * 0.30);
  const domeSource = fbm(p.mul(G.domeFreq).add(219.4), G.domeOct);
  const dome = smoothstep(float(G.domeLo), float(G.domeHi), domeSource);
  const weather = fbm(p.mul(G.weatherFreq).add(57.8), G.weatherOct).sub(0.5)
    .mul(G.weatherAmp).mul(dome.mul(0.45).add(0.55));
  return macro.add(shelf).add(dome.mul(G.domeAmp)).add(weather);
};

/* ── the surface, GPU ─────────────────────────────────────────────────── */
export const heightGPU = Fn(([p]) => {
  const wa = fbm(p.mul(T.warpFreq).add(T.warpOffA), T.warpOct).sub(0.5);
  const wb = fbm(p.mul(T.warpFreq).add(T.warpOffB), T.warpOct).sub(0.5);
  const q = p.add(vec2(wa, wb).mul(T.warpAmp)).toVar();

  const macro = fbm(p.mul(T.macroFreq).add(T.macroOff), T.macroOct)
    .sub(0.5).mul(T.macroAmp);
  const spine = pow(ridge(q.mul(T.ridgeFreq), T.ridgeOct), T.ridgeExp).mul(T.ridgeAmp);
  const rubble = fbm(q.mul(T.rubbleFreq), T.rubbleOct).mul(T.rubbleAmp);
  const shelf = pow(fbm(q.mul(T.shelfFreq).add(T.shelfOff), T.shelfOct), 2.2).mul(T.shelfAmp);
  const basin = smoothstep(float(T.basinLo), float(T.basinHi),
    fbm(p.mul(T.basinFreq).add(T.basinOff), T.basinOct)).mul(T.basinDepth);
  const grit = fbm(p.mul(T.gritFreq).add(T.gritOff), T.gritOct).mul(T.gritAmp);
  const r = length(p);
  const well = veffGPU(r).mul(BH.depth);
  const shearPhase = r.mul(T.shearRadial).add(q.x.mul(T.shearX))
    .add(q.y.mul(T.shearZ)).add(wa.mul(T.shearWarp));
  const shearWindow = smoothstep(float(120), float(220), r)
    .mul(float(1.0).sub(smoothstep(float(680), float(820), r)));
  const lamina = pow(abs(sin(shearPhase)), T.shearExp)
    .mul(T.shearAmp).mul(shearWindow);
  const outer = smoothstep(float(800), float(1040), r);
  const core = macro.add(spine).add(rubble).add(shelf).sub(basin).add(grit).add(well).add(lamina);
  const dunes = fbm(p.mul(0.0087).add(71.3), 3).sub(0.5).mul(2.4)
    .add(fbm(p.mul(0.021).add(14.8), 2).sub(0.5).mul(0.55));
  const desert = desertGPU(p);
  const granite = graniteGPU(p);

  return mix(mix(mix(core, dunes, outer), desert, uWorldMix), granite, uWorldGranite);
});

/* ── the surface, CPU ─────────────────────────────────────────────────────
   Lives in surface.cpu.js so that it imports no TSL and therefore runs in
   Node: `npm run terrain` measures relief, slope and drivability without a
   browser. THE TWO IMPLEMENTATIONS MUST AGREE — the divergence probe checks
   them once a second at the grid vertex nearest the rover. */
export { heightCPU, normalCPU, veff, solarAccessCPU };

/* ── the potential the field is the curl of ───────────────────────────────
   For a Schwarzschild circular orbit Ω = √(M/r³) EXACTLY — Kepler's third law
   holds exactly in these coordinates — so the tangential speed is √(M/r). The
   potential ψ = 2A√(M·r) has ∂ψ/∂r = A√(M/r), precisely that profile, and its
   curl is pure circulation about the origin.

   The circulation is therefore not bolted on beside the noise; it is another
   term in the same scalar. The window multiplies ψ rather than the field, so
   the result is still a curl and still divergence-free. */
export const potential = p => {
  const r = max(length(p), float(1e-3));
  const win = float(1.0).sub(smoothstep(BH.windowIn, BH.windowOut, r));
  const orbit = float(2.0 * BH.circ).mul(sqrt(float(BH.M).mul(r))).mul(win);
  const terra = fbm(p.mul(0.021), 4).add(orbit);
  const desert = fbm(p.mul(vec2(0.004, 0.0017)).add(83.4), 4);
  const granite = fbm(p.mul(0.010).add(199.3), 3);
  return mix(mix(terra, desert, uWorldMix), granite, uWorldGranite);
};

/* ── how the ground looks ─────────────────────────────────────────────────
   Reflectance is its own function because two things need it: the sun-lit
   term below, and the engine's headlight, which is added after the redshift
   and therefore cannot be computed inside the shading callback. */
export const albedoGround = C => ({ slope, worldPos }) => {
  const sediment = fbm(worldPos.xz.mul(0.018).add(19.7), 3);
  const p = worldPos.xz;
  const mineral = mix(vec3(0.010, 0.016, 0.023), vec3(0.078, 0.085, 0.094),
    saturate(slope.mul(1.45).add(sediment.mul(0.24))));
  const tidalBand = pow(abs(sin(length(p).mul(T.shearRadial)
    .add(p.x.mul(T.shearX)).add(p.y.mul(T.shearZ)))), T.shearExp);
  const coldVein = mix(mineral, vec3(0.025, 0.105, 0.112), tidalBand.mul(0.48));
  const terra = coldVein
    .mul(float(0.72).add(sediment.mul(0.18)).add(grain(worldPos.xz).mul(0.20)));

  const u = p.x.mul(D.windCos).add(p.y.mul(D.windSin));
  const v = p.x.mul(-D.windSin).add(p.y.mul(D.windCos));
  const strata = ridge(vec2(u.mul(D.yardangU), v.mul(D.yardangV)).add(63.4), 2);
  const exposure = smoothstep(float(0.72), float(0.89), strata.add(slope.mul(0.10)));
  const windBand = sin(u.mul(6.283185307 / 8.8)).mul(0.5).add(0.5);
  const sandTone = mix(vec3(0.072, 0.050, 0.077), vec3(0.215, 0.128, 0.060),
    saturate(slope.mul(0.95).add(sediment.mul(0.34))));
  const rockTone = mix(vec3(0.021, 0.032, 0.037), vec3(0.080, 0.100, 0.086), strata);
  const dryBed = float(1.0).sub(smoothstep(float(-0.8), float(1.0), worldPos.y))
    .mul(float(1.0).sub(smoothstep(float(0.03), float(0.12), slope)));
  const paleBed = mix(vec3(0.105, 0.140, 0.130), vec3(0.195, 0.235, 0.180), sediment);
  const desertBase = mix(mix(sandTone, rockTone, exposure), paleBed, dryBed);
  const glassPatch = smoothstep(float(0.78), float(0.92), sediment.add(strata.mul(0.10)))
    .mul(float(1.0).sub(smoothstep(float(0.08), float(0.26), slope)));
  const crustA = abs(sin(u.mul(D.crustU)
    .add(sin(v.mul(D.crustWarpV)).mul(D.crustWarpAmp))));
  const crustB = abs(sin(v.mul(D.crustV)
    .add(sin(u.mul(D.crustWarpU)).mul(D.crustWarpAmp))));
  const crustLine = float(1.0).sub(smoothstep(float(0.025), float(0.115), min(crustA, crustB)))
    .mul(float(1.0).sub(smoothstep(float(0.10), float(0.30), slope)));
  const fused = mix(desertBase, vec3(0.012, 0.025, 0.045), glassPatch.mul(0.82));
  const desert = mix(fused, vec3(0.070, 0.245, 0.225), crustLine.mul(0.64))
    .mul(float(0.975).add(windBand.mul(0.025)))
    .mul(float(0.88).add(grain(p.mul(0.72)).mul(0.10)));

  const granitePattern = fbm(p.mul(0.033).add(122.6), 3);
  const quartz = smoothstep(float(0.69), float(0.90), granitePattern);
  const feldspar = smoothstep(float(0.58), float(0.84), grain(p.mul(0.48).add(17.2)));
  const graniteBase = mix(vec3(0.042, 0.050, 0.058), vec3(0.185, 0.176, 0.194),
    saturate(slope.mul(0.76).add(granitePattern.mul(0.48))));
  const quartzFace = mix(graniteBase, vec3(0.285, 0.310, 0.315), quartz.mul(0.52));
  const granite = mix(quartzFace, vec3(0.190, 0.135, 0.205), feldspar.mul(0.18))
    .mul(float(0.91).add(grain(p.mul(0.92)).mul(0.11)));
  return mix(mix(terra, desert, uWorldMix), granite, uWorldGranite);
};

export const shadeGround = C => ctx => {
  const { normal, sun, worldPos } = ctx;
  const albedo = albedoGround(C)(ctx);

  /* airless: hard terminator, faint sky bounce, nothing else */
  const ndl = saturate(dot(normal, sun));
  const ambientStrength = mix(mix(float(0.055), float(0.135), uWorldMix), float(0.108), uWorldGranite);
  const ambient = ambientStrength.mul(normal.y.mul(0.5).add(0.5));
  const outer = smoothstep(float(700), float(800), length(worldPos.xz));
  const metricWorld = float(1.0).sub(uWorldMix).sub(uWorldGranite);
  const shadow = outer.mul(metricWorld);
  const directStrength = mix(mix(float(1.42), float(1.18), uWorldMix), float(1.24), uWorldGranite);
  const direct = ndl.mul(directStrength
    .mul(float(1.0).sub(shadow.mul(0.94))));
  const bounce = ambient.mul(float(1.0).sub(shadow.mul(0.72)));
  const lit = albedo.mul(direct.add(bounce));

  /* the false sun reddens only at grazing incidence — this work's one
     licensed untruth, and the only place crimson is allowed on the ground */
  const band = saturate(float(1.0).sub(abs(ndl.sub(0.055)).mul(16.0)));
  return lit.add(vec3(...C.crimson).mul(band).mul(0.34).mul(metricWorld));
};

/** The destination has a thin dusty atmosphere. The same sky dome changes
 * during blackout, avoiding a cut to a second scene. */
export const shadeSky = ({ dir, elev, sunDot }) => {
  const terra = mix(vec3(0.0064, 0.0075, 0.0106), vec3(0.0031, 0.0031, 0.0035),
    pow(saturate(elev.mul(2.1)), 0.7))
    .add(vec3(0.055, 0.125, 0.132).mul(
      pow(saturate(float(1.0).sub(abs(elev.sub(0.018)).mul(7.5))), 9.0)).mul(0.28))
    .add(vec3(0.088, 0.094, 0.105).mul(pow(saturate(float(1.0).sub(abs(elev))), 26.0)).mul(0.22))
    .add(vec3(0.753, 0.082, 0.165).mul(pow(sunDot, 12.0)).mul(0.075));
  const desertAtmosphere = mix(vec3(0.092, 0.054, 0.060), vec3(0.010, 0.004, 0.025),
    pow(saturate(elev.mul(1.65)), 0.62))
    .add(vec3(0.220, 0.160, 0.070).mul(pow(saturate(float(1.0).sub(abs(elev))), 18.0)).mul(0.21))
    .add(vec3(0.175, 0.050, 0.205).mul(
      pow(saturate(float(1.0).sub(abs(elev.sub(0.13)).mul(5.8))), 10.0)).mul(0.22))
    .add(vec3(0.96, 0.62, 0.31).mul(pow(sunDot, 420.0)).mul(1.12));
  /* A non-luminous nearby body. Its cold limb is scattered by the charged
     silicate layer; it contributes no power and therefore does not invent a
     second energy source for the rover. */
  const bodyDot = dot(dir, vec3(-0.50, 0.075, -0.8628));
  const body = smoothstep(float(0.9940), float(0.9965), bodyDot);
  const bodyRim = smoothstep(float(0.9895), float(0.9952), bodyDot)
    .mul(float(1.0).sub(body));
  const desert = mix(desertAtmosphere, vec3(0.006, 0.013, 0.019), body.mul(0.92))
    .add(vec3(0.120, 0.250, 0.240).mul(bodyRim).mul(0.18));
  const granite = mix(vec3(0.088, 0.096, 0.112), vec3(0.006, 0.008, 0.017),
    pow(saturate(elev.mul(1.8)), 0.66))
    .add(vec3(0.155, 0.178, 0.125).mul(
      pow(saturate(float(1.0).sub(abs(elev))), 22.0)).mul(0.16))
    .add(vec3(0.125, 0.055, 0.160).mul(
      pow(saturate(float(1.0).sub(abs(elev.sub(0.20)).mul(5.2))), 12.0)).mul(0.14))
    .add(vec3(0.86, 0.82, 0.94).mul(pow(sunDot, 520.0)).mul(0.92));
  return mix(mix(terra, desert, uWorldMix), granite, uWorldGranite);
};

/* ── how the filaments look ───────────────────────────────────────────────
   Crimson reports v_φ = √(M/r), the tangential speed of a circular orbit at
   that radius, modulated by how closely the filament actually runs along the
   circulation. Both terms are properties of the field and the geometry.
   NEITHER DEPENDS ON WHERE THE OBSERVER STANDS — that job belongs to the
   redshift, and the two are kept strictly separate. */
export const shadeBlade = C => ({ t, seed, ndl, radius, dir, worldPos }) => {
  const base = mix(vec3(...C.fil).mul(0.28), vec3(...C.fil).mul(1.40), pow(t, 0.8))
    .mul(float(0.86).add(seed.mul(0.28)));

  const rE = max(radius, float(BH.rs));
  const tangential = vec2(worldPos.z.negate(), worldPos.x).div(rE);
  const align = abs(dot(dir, tangential));
  const circ = saturate(sqrt(float(BH.M).div(rE)).div(0.75));

  const crim = vec3(...C.crimson).mul(pow(align, 3.0)).mul(pow(t, 2.2)).mul(circ).mul(0.90);
  return base.mul(ndl.mul(1.55).add(0.06)).add(crim);
};
