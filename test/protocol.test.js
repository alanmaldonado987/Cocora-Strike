// test/protocol.test.js
// El protocolo compartido no debe cambiar lo que viaja por el cable: mismos strings de evento y misma cuantización.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2S, S2C, quantize } from '../shared/protocol.js';
import { sanitizers } from '../server/validation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('protocolo: nombres de evento únicos, congelados y en snake_case', () => {
  const all = [...Object.values(C2S), ...Object.values(S2C)];
  assert.equal(new Set(all).size, all.length);
  assert.ok(Object.isFrozen(C2S) && Object.isFrozen(S2C));
  for (const [key, value] of Object.entries({ ...C2S, ...S2C })) {
    assert.equal(key, value.toUpperCase());
    assert.match(value, /^[a-z]+(_[a-z]+)*$/);
  }
});

test('protocolo: quantize equivale exactamente a Number(x.toFixed(n))', () => {
  const samples = [0, -0, 1.23456789, -987.654321, 0.0005, 0.0015, 1e-7, 123456.789, Math.PI, -Math.E];
  for (const v of samples) {
    for (const n of [0, 1, 2, 3]) assert.equal(Object.is(quantize(v, n), Number(v.toFixed(n))), true);
  }
});

test('protocolo: los sanitizadores del servidor solo usan eventos cliente->servidor declarados', () => {
  const c2s = new Set(Object.values(C2S));
  for (const key of Object.keys(sanitizers)) assert.ok(c2s.has(key), `sanitizador sin evento declarado: ${key}`);
});

test('protocolo: servidor y cliente no usan strings sueltos de evento en emit/on', () => {
  const declared = new Set([...Object.values(C2S), ...Object.values(S2C)]);
  const files = [
    'server/index.js',
    'server/gameRoom.js',
    ...fs.readdirSync(path.join(ROOT, 'server/room')).map((f) => `server/room/${f}`),
    'client/js/net/network.js'
  ];
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/(?:\.emit|\.on|\bon)\(\s*'([a-z_]+)'/g)) {
      if (declared.has(m[1])) offenders.push(`${file}: '${m[1]}'`);
    }
  }
  assert.deepEqual(offenders, []);
});
