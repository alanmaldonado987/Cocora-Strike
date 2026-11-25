// shared/spatial.js
// Índices espaciales para exclusión de props y consulta rápida de colisionadores.

export class SpatialExclusionGrid {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.buckets = new Map();
  }

  _key(cx, cz) {
    return `${cx},${cz}`;
  }

  canPlace(x, z, radius) {
    const rPad = radius + 7;
    const cx0 = Math.floor((x - rPad) / this.cellSize);
    const cx1 = Math.floor((x + rPad) / this.cellSize);
    const cz0 = Math.floor((z - rPad) / this.cellSize);
    const cz1 = Math.floor((z + rPad) / this.cellSize);

    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.buckets.get(this._key(cx, cz));
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
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const key = this._key(cx, cz);
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
  }

  addBox(minX, maxX, minY, maxY, minZ, maxZ, walkableTop = false, tag = 'wall', meta = null) {
    const col = { type: 'box', minX, maxX, minY, maxY, minZ, maxZ, walkableTop, tag, enabled: true, meta };
    this.allColliders.push(col);
    const cx0 = Math.floor(minX / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cz0 = Math.floor(minZ / this.cellSize);
    const cz1 = Math.floor(maxZ / this.cellSize);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(col);
      }
    }
    return col;
  }

  addCylinder(x, z, radius, minY, maxY, tag = 'trunk', meta = null) {
    const col = { type: 'cylinder', x, z, r: radius, minY, maxY, walkableTop: false, tag, enabled: true, meta };
    this.allColliders.push(col);
    const cx0 = Math.floor((x - radius) / this.cellSize);
    const cx1 = Math.floor((x + radius) / this.cellSize);
    const cz0 = Math.floor((z - radius) / this.cellSize);
    const cz1 = Math.floor((z + radius) / this.cellSize);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(col);
      }
    }
    return col;
  }

  queryNear(x, z, radius) {
    const cx0 = Math.floor((x - radius) / this.cellSize);
    const cx1 = Math.floor((x + radius) / this.cellSize);
    const cz0 = Math.floor((z - radius) / this.cellSize);
    const cz1 = Math.floor((z + radius) / this.cellSize);
    const out = [];
    const seen = new Set();
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (!seen.has(c)) {
            seen.add(c);
            out.push(c);
          }
        }
      }
    }
    return out;
  }

  querySegmentXZ(x0, z0, x1, z1) {
    const minX = Math.min(x0, x1) - 1;
    const maxX = Math.max(x0, x1) + 1;
    const minZ = Math.min(z0, z1) - 1;
    const maxZ = Math.max(z0, z1) + 1;
    const cx0 = Math.floor(minX / this.cellSize);
    const cx1 = Math.floor(maxX / this.cellSize);
    const cz0 = Math.floor(minZ / this.cellSize);
    const cz1 = Math.floor(maxZ / this.cellSize);
    const out = [];
    const seen = new Set();
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (!seen.has(c)) {
            seen.add(c);
            out.push(c);
          }
        }
      }
    }
    return out;
  }
}
