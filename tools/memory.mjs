/** Pure-data verification for the three-body Geological Memory chain. */
import assert from 'node:assert/strict';
import { MissionMemory, MISSION_MEMORY_VERSION } from '../engine/core/mission-memory.js';

const rows = new Map();
const storage = {
  getItem: key => rows.get(key) ?? null,
  setItem: (key, value) => rows.set(key, value),
  removeItem: key => rows.delete(key),
};
const samples = [
  ['FE–NI ORE', 'METALLIC REFLECTANCE'],
  ['SILICATE', 'SPECTRAL SPLIT'],
  ['CARBON PHASE', 'LOW ALBEDO DENSITY'],
  ['H₂O ICE', 'COOLING SHADOW'],
  ['RARE EARTH', 'SPECULAR BANDING'],
  ['VOLATILE TRACE', 'PARTICLE DENSITY'],
  ['CONDUCTIVE LATTICE', 'METALLIC LATTICE'],
  ['UNKNOWN ELEMENT', 'FULL-SPECTRUM RING'],
].map(([sample, sign], index) => ({
  sample, sign, module: `MODULE ${index + 1}`,
  color: 0x778899 + index, x: 530 - index * 31, z: 180 + index * 37,
}));
const water = {
  complete: true,
  site: {
    id: 'BODY02-H2O-01', x: 52, z: 428,
    signature: {
      phase: 'SUBSURFACE PORE ICE / HYDRATED SILICA',
      thermalDeltaK: -16,
      absorptionBandsMicron: [1.4, 1.9, 2.9],
    },
    visual: { particleDensity: 0.28, spectrumRingMicron: 1.9 },
  },
};

const key = 'test:mission-memory';
const memory = new MissionMemory({ storage, key });
assert.equal(memory.data.version, MISSION_MEMORY_VERSION);
memory.recordSamples(samples.slice(0, 7));
memory.recordWater(water);
assert.equal(memory.ready, false, 'BODY 03 must not exist with seven material signatures');
assert.equal(memory.composeBody03({ start: [120, 460] }), null);

memory.recordSamples(samples);
assert.equal(memory.ready, true, 'eight samples + confirmed water must unlock composition');
const model = memory.composeBody03({ start: { x: 120, z: 460 } });
assert.equal(model.source.samples, 8);
assert.equal(model.source.water, 'BODY02-H2O-01');
assert.equal(model.materialField.length, 8);
assert.equal(model.sites.length, 3);
assert.deepEqual(model.sites.map(site => site.order), [0, 1, 2]);
assert.deepEqual(model.sites.map(site => site.objective),
  ['MATERIAL PHASE', 'HYDRATION PHASE', 'CONCORDANCE']);
for (let i = 0; i < model.sites.length; i++) {
  const site = model.sites[i];
  assert.ok(Number.isFinite(site.x) && Number.isFinite(site.z));
  assert.ok(site.coherence >= 0 && site.coherence <= 1);
  for (let j = i + 1; j < model.sites.length; j++)
    assert.ok(Math.hypot(site.x - model.sites[j].x, site.z - model.sites[j].z) >= 48 - 1e-9,
      'mission sites must remain visually and mechanically distinct');
}

const restored = new MissionMemory({ storage, key });
assert.equal(restored.ready, true, 'mission evidence must survive controller reconstruction');
assert.deepEqual(restored.composeBody03({ start: { x: 120, z: 460 } }), model,
  'the same evidence must generate the same geological mission');

const changed = new MissionMemory({ storage: null, key: 'unpersisted' });
changed.recordSamples(samples);
changed.recordWater({ ...water, site: { ...water.site,
  visual: { ...water.site.visual, spectrumRingMicron: 2.9 } } });
const alternate = changed.composeBody03({ start: { x: 120, z: 460 } });
assert.notDeepEqual(alternate.sites.map(site => [site.x, site.z]),
  model.sites.map(site => [site.x, site.z]), 'BODY 02 spectrum must influence BODY 03 sites');

console.log('  ✓ BODY 01 requires eight finite material signatures');
console.log('  ✓ BODY 02 hydration survives controller reconstruction');
console.log('  ✓ two evidence fields deterministically generate three separated objectives');
console.log('  ✓ changing the 1.9 µm source changes the BODY 03 interference field');
console.log('\n✓ PASS — persistent three-body Geological Memory is finite and deterministic');

