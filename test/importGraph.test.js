// test/importGraph.test.js
// Guardia de la Fase 5 (modularización): cada import/export estático con ruta relativa o absoluta del servidor
// ('/shared/...', '/Modelos%203D/...') debe resolver a un archivo existente y cada nombre importado debe estar
// exportado por el módulo destino. Así detectamos rutas rotas del cliente sin necesidad de abrir el navegador.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'Animación v1', 'Animación v2', 'Armas v1', 'Armas v2', 'Aviones v1', 'e2e']);

function listJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listJsFiles(full, out);
    } else if (full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Traduce un especificador a ruta de disco (null = paquete npm o import map, no se valida aquí)
function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('/shared/')) return path.join(ROOT, spec);
  if (spec.startsWith('/Modelos%203D/')) return path.join(ROOT, 'Modelos 3D', spec.slice('/Modelos%203D/'.length));
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  return null;
}

// Quita comentarios para no confundir ejemplos en comentarios con imports reales
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const exportCache = new Map();
function exportedNames(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const target = resolveSpecifier(file, m[1]);
    if (target && fs.existsSync(target)) for (const n of exportedNames(target, seen)) names.add(n);
  }
  exportCache.set(file, names);
  return names;
}

test('grafo de imports: todas las rutas locales existen y los nombres importados están exportados', () => {
  const files = ['client', 'shared', 'server', 'test', 'Modelos 3D'].flatMap((d) => listJsFiles(path.join(ROOT, d)));
  const problems = [];
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const re = /(?:import|export)\s*(\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?|\*)?\s*from\s*['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) {
      const target = resolveSpecifier(file, m[2]);
      if (!target) continue;
      const rel = path.relative(ROOT, file);
      if (!fs.existsSync(target)) {
        problems.push(`${rel}: no existe '${m[2]}'`);
        continue;
      }
      const clause = m[1] || '';
      const braces = clause.match(/\{([^}]*)\}/);
      if (!braces) continue;
      const exported = exportedNames(target);
      for (const raw of braces[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name && name !== 'default' && !exported.has(name)) problems.push(`${rel}: '${name}' no se exporta desde '${m[2]}'`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
