// shared/spatial.js
// Índices espaciales cero-allocaciones para exclusión de props y consulta rápida de colisionadores.
// Usa claves enteras biyectivas (Smi) y sellos monotónicos (queryStamp) con buffers reutilizables.

import { SPATIAL_GRID_CONFIG } from './config.js';

const CELL_OFFSET = SPATIAL_GRID_CONFIG.coordOffset;
const CELL_SHIFT = SPATIAL_GRID_CONFIG.coordShift;
const MAX_QUERY_STAMP = SPATIAL_GRID_CONFIG.maxStamp;
const EMPTY_RESULTS = Object.freeze([]);

/**
 * Codifica coordenadas enteras de celda (positivas, cero o negativas) en un entero Smi único.
 * Válido sin colisiones para cx, cz en [-512, +511].
 */
export function encodeSpatialCellKey(cx, cz) {
  return ((((cx | 0) + CELL_OFFSET) << CELL_SHIFT) + ((cz | 0) + CELL_OFFSET)) | 0;
}

export class SpatialExclusionGrid {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  _key(cx, cz) {
    return (((cx | 0) + CELL_OFFSET) << 10) + ((cz | 0) + CELL_OFFSET);
  }

  canPlace(x, z, radius) {
    const rPad = radius + 7;
    const cs = this.cellSize;
    const cx0 = Math.floor((x - rPad) / cs) | 0;
    const cx1 = Math.floor((x + rPad) / cs) | 0;
    const cz0 = Math.floor((z - rPad) / cs) | 0;
    const cz1 = Math.floor((z + rPad) / cs) | 0;

    for (let cz = cz0; cz <= cz1; cz++) {
      const zPart = (cz + CELL_OFFSET) | 0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = (((cx + CELL_OFFSET) << 10) + zPart) | 0;
        const arr = this.buckets.get(key);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          const minSep = radius + item.r;
          const dx = x - item.x;
          const dz = z - item.z;
          if (dx * dx + dz * dz < minSep * minSep) return false;
        }
      }
    }
    return true;
  }

  register(x, z, radius) {
    const cs = this.cellSize;
    const cx = Math.floor(x / cs) | 0;
    const cz = Math.floor(z / cs) | 0;
    const key = (((cx + CELL_OFFSET) << 10) + (cz + CELL_OFFSET)) | 0;
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    arr.push({ x, z, r: radius });
  }
}

export class SpatialCollisionIndex {
  constructor(cellSize = 10) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.allColliders = [];
    this._stamps = new Int32Array(2048);
    this._queryStamp = 0;
    this._nearOut = [];
    this._segmentOut = [];
  }

  _ensureStampCapacity(id) {
    if (id < this._stamps.length) return;
    const nextCap = Math.max(id + 1, this._stamps.length * 2);
    const grown = new Int32Array(nextCap);
    grown.set(this._stamps);
    this._stamps = grown;
  }

  _nextStamp() {
    let next = (this._queryStamp + 1) | 0;
    if (next >= MAX_QUERY_STAMP || next <= 0) {
      this._stamps.fill(0);
      next = 1;
    }
    this._queryStamp = next;
    return next;
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ, walkableTop = false, tag = 'wall', meta = null) {
    const col = { type: 'box', minX, maxX, minY, maxY, minZ, maxZ, walkableTop, tag, enabled: true, meta };
    const id = this.allColliders.length;
    this.allColliders.push(col);
    this._ensureStampCapacity(id);
    const cs = this.cellSize;
    const cx0 = Math.floor(minX / cs) | 0;
    const cx1 = Math.floor(maxX / cs) | 0;
    const cz0 = Math.floor(minZ / cs) | 0;
    const cz1 = Math.floor(maxZ / cs) | 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      const zPart = (cz + CELL_OFFSET) | 0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = (((cx + CELL_OFFSET) << CELL_SHIFT) + zPart) | 0;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(id);
      }
    }
    return col;
  }

  addCylinder(x, z, radius, minY, maxY, tag = 'trunk', meta = null) {
    const col = { type: 'cylinder', x, z, r: radius, minY, maxY, walkableTop: false, tag, enabled: true, meta };
    const id = this.allColliders.length;
    this.allColliders.push(col);
    this._ensureStampCapacity(id);
    const cs = this.cellSize;
    const cx0 = Math.floor((x - radius) / cs) | 0;
    const cx1 = Math.floor((x + radius) / cs) | 0;
    const cz0 = Math.floor((z - radius) / cs) | 0;
    const cz1 = Math.floor((z + radius) / cs) | 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      const zPart = (cz + CELL_OFFSET) | 0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = (((cx + CELL_OFFSET) << CELL_SHIFT) + zPart) | 0;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(id);
      }
    }
    return col;
  }

  queryNear(x, z, radius, out) {
    const customOut = Array.isArray(out);
    const target = customOut ? out : this._nearOut;
    const cs = this.cellSize;
    const cx0 = Math.floor((x - radius) / cs) | 0;
    const cx1 = Math.floor((x + radius) / cs) | 0;
    const cz0 = Math.floor((z - radius) / cs) | 0;
    const cz1 = Math.floor((z + radius) / cs) | 0;
    let count = 0;
    const stamp = this._nextStamp();
    const stamps = this._stamps;
    const all = this.allColliders;
    for (let cz = cz0; cz <= cz1; cz++) {
      const zPart = (cz + CELL_OFFSET) | 0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = (((cx + CELL_OFFSET) << CELL_SHIFT) + zPart) | 0;
        const list = this.cells.get(key);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const id = list[i];
          if (stamps[id] !== stamp) {
            stamps[id] = stamp;
            target[count++] = all[id];
          }
        }
      }
    }
    if (count === 0 && !customOut) return EMPTY_RESULTS;
    target.length = count;
    return target;
  }

  querySegmentXZ(x0, z0, x1, z1, out) {
    const customOut = Array.isArray(out);
    const target = customOut ? out : this._segmentOut;
    const cs = this.cellSize;
    const minX = (x0 < x1 ? x0 : x1) - 1;
    const maxX = (x0 > x1 ? x0 : x1) + 1;
    const minZ = (z0 < z1 ? z0 : z1) - 1;
    const maxZ = (z0 > z1 ? z0 : z1) + 1;
    const cx0 = Math.floor(minX / cs) | 0;
    const cx1 = Math.floor(maxX / cs) | 0;
    const cz0 = Math.floor(minZ / cs) | 0;
    const cz1 = Math.floor(maxZ / cs) | 0;
    let count = 0;
    const stamp = this._nextStamp();
    const stamps = this._stamps;
    const all = this.allColliders;
    for (let cz = cz0; cz <= cz1; cz++) {
      const zPart = (cz + CELL_OFFSET) | 0;
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = (((cx + CELL_OFFSET) << CELL_SHIFT) + zPart) | 0;
        const list = this.cells.get(key);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const id = list[i];
          if (stamps[id] !== stamp) {
            stamps[id] = stamp;
            target[count++] = all[id];
          }
        }
      }
    }
    if (count === 0 && !customOut) return EMPTY_RESULTS;
    target.length = count;
    return target;
  }
}
