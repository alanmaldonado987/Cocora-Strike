// test/mapFingerprint.test.js
// Guardia de la Fase 5: el mapa generado debe ser idéntico, bit a bit, al de antes de modularizar shared/.
// La huella cubre todos los datos del mapa (rejillas, edificios, puertas, props, spawns, colisionadores...) y un
// muestreo de sus funciones de consulta, para 3 semillas. La referencia se generó con el código previo a la
// Fase 5 (commit e7f9bb6). Si un cambio de diseño del mapa es intencional, regenerar el archivo de referencia.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { generateCocoraMap } from '../shared/mapData.js';

const GOLDEN = JSON.parse(fs.readFileSync(new URL('./fixtures/mapFingerprint.golden.json', import.meta.url), 'utf8'));

const shortHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);

function stable(v, seen = new WeakSet()) {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'function') return '[fn]';
    return typeof v === 'number' && Object.is(v, -0) ? '-0' : v;
  }
  if (ArrayBuffer.isView(v)) return 'typed:' + shortHash(Buffer.from(v.buffer, v.byteOffset, v.byteLength));
  if (seen.has(v)) return '[ciclo]';
  seen.add(v);
  if (v instanceof Map) return { __map: [...v.entries()].map(([k, x]) => [String(k), stable(x, seen)]) };
  if (v instanceof Set) return { __set: [...v].map((x) => stable(x, seen)) };
  if (Array.isArray(v)) return v.map((x) => stable(x, seen));
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = stable(v[k], seen);
  return out;
}

function fingerprint(seed) {
  const map = generateCocoraMap(seed);
  const data = {};
  for (const k of Object.keys(map).sort()) data[k] = shortHash(JSON.stringify(stable(map[k])));
  const samples = [];
  for (let x = -300; x <= 300; x += 37) {
    for (let z = -300; z <= 300; z += 41) {
      samples.push(
        map.getTerrainHeightAt(x, z),
        map.getGroundHeightAt(x, z, 40),
        map.getSlopeAt(x, z),
        map.getSurfaceAt(x, z),
        map.getFloorBelowY(x, 80, z),
        map.getTopSolidY(x, z),
        map.isInWater(x, 12, z),
        map.isConcealedInBush(x, z),
        JSON.stringify(map.getTerrainNormalAt(x, z)),
        JSON.stringify(map.findSafeLootPlacement(x, 20, z))
      );
    }
  }
  data.__samples = shortHash(JSON.stringify(samples));
  return data;
}

for (const seed of Object.keys(GOLDEN)) {
  test(`mapa determinista idéntico al de referencia (semilla ${seed})`, () => {
    assert.deepEqual(fingerprint(Number(seed)), GOLDEN[seed]);
  });
}
