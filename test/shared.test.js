import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  DEFAULT_MAP_SEED,
  WATER_LEVEL,
  LAGOON_CONFIG,
  SWIM_CONFIG,
  FALL_DAMAGE_CONFIG,
  WEAPONS,
  WEAPON_SLOTS,
  computeFallDamage,
  createRNG,
  getWaterChannelAt,
  getWaterDepthAt,
  generateCocoraMap,
  raycastVoxels,
  hasLineOfSight,
  getJumpHeightFactor
} from '../shared/mapData.js';

// Huella del mapa por defecto. Si cambia, el cliente y el servidor podrían
// dejar de generar el mismo mundo: actualizarla solo si el cambio es intencional.
const DEFAULT_MAP_FINGERPRINT = '89a6537abd0f4406313679e4c56d2b77f9aa8817086ebdb8dcaf6a5d93fd4cfb';

function fingerprint(map) {
  const h = createHash('sha256');
  h.update(Buffer.from(map.heightGrid.buffer));
  h.update(Buffer.from(map.surfaceGrid.buffer));
  h.update(JSON.stringify({
    b: map.buildings, d: map.doors, w: map.windows,
    l: map.lootSpawns, ws: map.wildlifeSpawns, br: map.bridges
  }));
  return h.digest('hex');
}

const map = generateCocoraMap(DEFAULT_MAP_SEED);

test('computeFallDamage: sin daño hasta la altura segura', () => {
  assert.equal(computeFallDamage(0), 0);
  assert.equal(computeFallDamage(FALL_DAMAGE_CONFIG.safeFallHeight), 0);
  assert.equal(computeFallDamage(NaN), 0);
});

test('computeFallDamage: progresivo y luego letal', () => {
  const low = computeFallDamage(FALL_DAMAGE_CONFIG.safeFallHeight + 0.1);
  const mid = computeFallDamage(8);
  const high = computeFallDamage(FALL_DAMAGE_CONFIG.severeFallHeight);
  assert.ok(low >= FALL_DAMAGE_CONFIG.minFallDamage);
  assert.ok(mid > low && mid < high + 1);
  assert.ok(high <= FALL_DAMAGE_CONFIG.maxProgressiveDamage);
  assert.equal(computeFallDamage(FALL_DAMAGE_CONFIG.severeFallHeight + 0.01), FALL_DAMAGE_CONFIG.lethalDamage);
});

test('createRNG es determinista por semilla', () => {
  const a = createRNG(42);
  const b = createRNG(42);
  const c = createRNG(43);
  const seqA = [a(), a(), a()];
  assert.deepEqual(seqA, [b(), b(), b()]);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('generateCocoraMap: misma semilla produce el mismo mapa', () => {
  assert.equal(fingerprint(generateCocoraMap(DEFAULT_MAP_SEED)), fingerprint(map));
});

test('generateCocoraMap: el mapa por defecto no cambió', () => {
  assert.equal(fingerprint(map), DEFAULT_MAP_FINGERPRINT);
});

test('generateCocoraMap: contenido esperado', () => {
  assert.equal(map.bridges.length, 4);
  assert.equal(map.caves.length, 3);
  assert.ok(map.buildings.length >= 25);
  assert.ok(map.lootSpawns.length > 0);
  assert.ok(map.doors.length > 0 && map.windows.length > 0);
});

test('alturas del terreno son finitas en todo el mundo', () => {
  for (let x = -300; x <= 300; x += 50) {
    for (let z = -300; z <= 300; z += 50) {
      const h = map.getTerrainHeightAt(x, z);
      assert.ok(Number.isFinite(h), `altura inválida en ${x},${z}`);
    }
  }
});

test('raycastVoxels hacia abajo choca con el suelo', () => {
  const ground = map.getTerrainHeightAt(0, 0);
  const hit = raycastVoxels(map, { x: 0, y: 150, z: 0 }, { x: 0, y: -1, z: 0 }, 400);
  assert.equal(hit.hit, true);
  assert.ok(Math.abs(hit.point.y - ground) < 0.5);
});

test('hasLineOfSight: cielo abierto sí, a través del terreno no', () => {
  const ground = map.getTerrainHeightAt(0, 0);
  assert.equal(hasLineOfSight(map, { x: 0, y: 200, z: 0 }, { x: 5, y: 200, z: 5 }), true);
  assert.equal(hasLineOfSight(map, { x: 0, y: ground + 100, z: 0 }, { x: 0, y: ground - 20, z: 0 }), false);
});

test('getJumpHeightFactor está acotado entre 0 y 1', () => {
  for (const h of [0, 15, 100, 205, 500]) {
    const f = getJumpHeightFactor(h);
    assert.ok(f >= 0 && f <= 1, `factor ${f} para ${h}`);
  }
});

test('todas las armas de los slots existen con datos válidos', () => {
  for (const id of WEAPON_SLOTS) {
    const w = WEAPONS[id];
    assert.ok(w, `falta ${id}`);
    assert.ok(w.damage > 0 && w.fireRateMs > 0);
  }
});

test('puentes de piedra despejados >= 1.2m sobre WATER_LEVEL, laguna nadable y rocas con 3 ejes/color', () => {
  for (const br of map.bridges) {
    assert.ok(br.deckY >= WATER_LEVEL + 1.2, `puente bajo en z=${br.z}: deckY=${br.deckY}`);
    assert.ok(br.leftGround > WATER_LEVEL && br.rightGround > WATER_LEVEL, 'estribos secos sobre el nivel del río');
  }

  const chLagoon = getWaterChannelAt(LAGOON_CONFIG.centerZ);
  assert.ok(chLagoon.halfWidth >= 38, `laguna amplia esperada: halfWidth=${chLagoon.halfWidth}`);
  const depthLagoon = getWaterDepthAt(map, chLagoon.centerX, LAGOON_CONFIG.centerZ);
  assert.ok(depthLagoon > SWIM_CONFIG.swimDepth + 1.2, `laguna nadable profunda: depth=${depthLagoon}`);

  assert.ok(map.props.boulders.length > 50 && map.props.riverCobbles.length > 30);
  const sampleRock = map.props.boulders[0];
  assert.ok(
    typeof sampleRock.rotX === 'number' &&
      typeof sampleRock.rotY === 'number' &&
      typeof sampleRock.rotZ === 'number' &&
      typeof sampleRock.colorHex === 'string'
  );
});
