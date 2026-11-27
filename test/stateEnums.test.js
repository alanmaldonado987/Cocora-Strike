// test/stateEnums.test.js
// Estados centralizados en shared/config.js: congelados, sin duplicados y sin strings sueltos en el código.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_STATE, MOVE_MODE, GAME_PHASE, STORM_STATE, WILDLIFE_STATE } from '../shared/mapData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENUMS = { PLAYER_STATE, MOVE_MODE, GAME_PHASE, STORM_STATE, WILDLIFE_STATE };

test('estados: enums congelados, claves = valor en mayúsculas y sin valores repetidos', () => {
  for (const [name, e] of Object.entries(ENUMS)) {
    assert.ok(Object.isFrozen(e), `${name} debe estar congelado`);
    const values = Object.values(e);
    assert.equal(new Set(values).size, values.length, `${name} tiene valores repetidos`);
    for (const [k, v] of Object.entries(e)) assert.equal(k, v.toUpperCase());
  }
});

test('estados: no quedan strings sueltos de estado en comparaciones/asignaciones', () => {
  const values = new Set(Object.values(ENUMS).flatMap((e) => Object.values(e)));
  const files = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(rel);
      else if (rel.endsWith('.js')) files.push(rel);
    }
  };
  ['client/js', 'shared', 'server'].forEach(walk);
  const offenders = [];
  const re = /\b(state|moveMode|phase|aiState|effectiveMode)\s*(===|!==|=|:)\s*'([a-z_]+)'/g;
  for (const file of files) {
    if (file === 'shared/config.js') continue; // definiciones
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(re)) if (values.has(m[3])) offenders.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});
