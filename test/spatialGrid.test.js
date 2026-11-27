// test/spatialGrid.test.js
// Tests unitarios de la grilla espacial numérica cero-allocaciones con queryStamp.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSpatialCellKey,
  SpatialExclusionGrid,
  SpatialCollisionIndex,
  SPATIAL_GRID_CONFIG
} from '../shared/mapData.js';

test('encodeSpatialCellKey genera claves enteras únicas en cuadrantes negativos, cero y positivos', () => {
  const seen = new Set();
  for (let cx = -45; cx <= 45; cx++) {
    for (let cz = -45; cz <= 45; cz++) {
      const key = encodeSpatialCellKey(cx, cz);
      assert.equal(Number.isSafeInteger(key), true);
      assert.equal(key >= 0, true);
      assert.equal(seen.has(key), false, `Colisión detectada en (${cx}, ${cz})`);
      seen.add(key);
    }
  }
});

test('SpatialExclusionGrid registra y consulta correctamente en coordenadas negativas y positivas', () => {
  const grid = new SpatialExclusionGrid(8);
  assert.equal(grid.canPlace(-142.5, -88.2, 2.0), true);
  grid.register(-142.5, -88.2, 2.0);
  assert.equal(grid.canPlace(-141.0, -87.5, 2.0), false);
  assert.equal(grid.canPlace(142.5, 88.2, 2.0), true);
});

test('SpatialCollisionIndex deduplica colisionadores multi-celda con queryStamp y reutiliza buffers', () => {
  const index = new SpatialCollisionIndex(10);
  // Caja grande que cruza múltiples celdas negativas y positivas [-15..15, -15..15]
  const bigWall = index.addBox(-15, 15, 0, 4, -15, 15, false, 'wall');
  const negTrunk = index.addCylinder(-22, -22, 1.2, 0, 6, 'trunk');

  const r1 = index.queryNear(0, 0, 18);
  assert.equal(r1.length, 1);
  assert.equal(r1[0], bigWall);

  // Reutiliza la misma referencia de buffer por defecto (_nearOut)
  const r2 = index.queryNear(-18, -18, 8);
  assert.equal(r2, r1);
  assert.equal(r2.length, 2);
  assert.equal(r2.includes(bigWall), true);
  assert.equal(r2.includes(negTrunk), true);

  // Soporta buffer externo explícito para consultas anidadas sin pisar _nearOut
  const customOut = [];
  const seg = index.querySegmentXZ(-30, -30, 20, 20, customOut);
  assert.equal(seg, customOut);
  assert.equal(seg.length, 2);
  assert.notEqual(seg, r2);
});

test('SpatialCollisionIndex reinicia queryStamp limpiamente al alcanzar maxStamp', () => {
  const index = new SpatialCollisionIndex(10);
  const box = index.addBox(-4, 4, 0, 3, -4, 4, true, 'floor');
  index._queryStamp = SPATIAL_GRID_CONFIG.maxStamp - 1;
  index._stamps[0] = SPATIAL_GRID_CONFIG.maxStamp - 1;

  const res = index.queryNear(0, 0, 2);
  assert.equal(index._queryStamp, 1);
  assert.equal(res.length, 1);
  assert.equal(res[0], box);
  assert.equal(index._stamps[0], 1);
});
