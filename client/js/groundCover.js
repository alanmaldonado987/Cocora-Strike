// client/js/groundCover.js
// Cobertura vegetal densa del suelo: matas de pasto y flores silvestres alrededor del jugador.
//
// Cubre las superficies de pasto (valle, montaña, terrazas de café) para que no se vea tierra
// desnuda, sin tocar río, orillas, caminos, adoquines, roca ni el interior de construcciones.
// Para que el costo no crezca con el tamaño del mapa:
// - Se genera por bloques de 24 m bajo demanda (máx. 2 bloques por fotograma) y solo cerca del suelo.
// - Solo se dibujan los bloques a menos de ~70 m; más lejos las matas medirían pocos píxeles.
// - Cada bloque es un InstancedMesh (una llamada de dibujo) con el mismo viento en GPU que el
//   resto de la vegetación. No proyecta sombras (sí las recibe).
// - Es puramente visual y determinista por semilla: todos los clientes ven lo mismo.

import * as THREE from 'three';
import { SURFACE, WATER_LEVEL, WORLD_HALF, createRNG } from '/shared/mapData.js';

const TILE_SIZE = 24;
const VISIBLE_RADIUS = 72;
const KEEP_RADIUS = 200; // bloques más lejanos se liberan
const MAX_GROUND_CLEARANCE = 45; // por encima de esto (cayendo del avión) no hace falta generar
const GRASS_SPACING = 0.85; // separación media entre matas (con variación)
const TILES_PER_FRAME = 2;
const BOUNDS_PADDING = 1.5;

const GRASS_SURFACES = new Set([SURFACE.GRASS_VALLEY, SURFACE.GRASS_MOUNTAIN, SURFACE.COFFEE_TERRACE]);

const FLOWER_COLORS = ['#f8fafc', '#facc15', '#ef4444', '#a855f7', '#fb923c', '#f472b6', '#7dd3fc', '#fde047']
  .map((c) => new THREE.Color(c));

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

// Mata de pasto low-poly: 7 hojas triangulares abiertas, base oscura y punta clara
function createGrassClumpGeometry() {
  const positions = [];
  const colors = [];
  const base = new THREE.Color('#2f8a3a');
  const tip = new THREE.Color('#9ddf62');
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const ang = (i / blades) * Math.PI * 2 + (i % 2) * 0.35;
    const r = 0.05 + (i % 3) * 0.06;
    const h = 0.42 + ((i * 37) % 10) * 0.025;
    const lean = 0.16 + (i % 2) * 0.08;
    const cx = Math.cos(ang) * r;
    const cz = Math.sin(ang) * r;
    const px = -Math.sin(ang) * 0.05; // ancho de la hoja (perpendicular a su dirección)
    const pz = Math.cos(ang) * 0.05;
    positions.push(
      cx - px, 0, cz - pz,
      cx + px, 0, cz + pz,
      cx + Math.cos(ang) * lean, h, cz + Math.sin(ang) * lean
    );
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Normales hacia arriba: el pasto se ilumina parejo por ambas caras, como una alfombra
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Flor silvestre: tallo fino y corola de 5 pétalos; el color de la corola va por instancia
function createFlowerGeometry() {
  const positions = [];
  const colors = [];
  const stem = new THREE.Color('#3f7d2c');
  const white = new THREE.Color('#ffffff');
  // El color por instancia multiplica estos tonos: centro casi blanco para que el pétalo luzca vivo
  const center = new THREE.Color('#fff4d0');
  const headY = 0.66;
  positions.push(-0.012, 0, 0, 0.012, 0, 0, 0, headY, 0);
  colors.push(stem.r, stem.g, stem.b, stem.r, stem.g, stem.b, stem.r, stem.g, stem.b);
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / petals * 0.55;
    const am = (a0 + a1) / 2;
    // Pétalos en forma de copa (puntas levantadas) para que se vean también de lado
    positions.push(
      0, headY, 0,
      Math.cos(a0) * 0.09, headY + 0.05, Math.sin(a0) * 0.09,
      Math.cos(am) * 0.17, headY + 0.11, Math.sin(am) * 0.17,
      0, headY, 0,
      Math.cos(am) * 0.17, headY + 0.11, Math.sin(am) * 0.17,
      Math.cos(a1) * 0.09, headY + 0.05, Math.sin(a1) * 0.09
    );
    for (let k = 0; k < 6; k++) {
      const c = k === 0 || k === 3 ? center : white;
      colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  return geo;
}

export class GroundCover {
  // grassMaterial / flowerMaterial: materiales de follaje con viento (DoubleSide, vertexColors)
  constructor(scene, grassMaterial, flowerMaterial) {
    this.group = new THREE.Group();
    this.group.name = 'groundCover';
    scene.add(this.group);
    this.grassGeo = createGrassClumpGeometry();
    this.flowerGeo = createFlowerGeometry();
    this.grassMat = grassMaterial;
    this.flowerMat = flowerMaterial;
    this.tiles = new Map();
    this.map = null;
    this.seed = 0;

    // Prototipos ocultos: hacen que renderer.compile() prepare los shaders (instancing + color por
    // instancia) antes de que aparezca el primer bloque, sin tirón al aterrizar.
    this.protoGrass = new THREE.InstancedMesh(this.grassGeo, this.grassMat, 1);
    this.protoFlower = new THREE.InstancedMesh(this.flowerGeo, this.flowerMat, 1);
    this.protoFlower.setColorAt(0, FLOWER_COLORS[0]);
    for (const proto of [this.protoGrass, this.protoFlower]) {
      proto.visible = false;
      proto.receiveShadow = true;
      this.group.add(proto);
    }
  }

  reset(map, seed) {
    for (const tile of this.tiles.values()) this.disposeTile(tile);
    this.tiles.clear();
    this.map = map;
    this.seed = seed;
  }

  disposeTile(tile) {
    for (const mesh of [tile.grass, tile.flowers]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.dispose();
    }
  }

  canGrowAt(x, z) {
    const map = this.map;
    if (Math.abs(x) > WORLD_HALF - 3 || Math.abs(z) > WORLD_HALF - 3) return -Infinity;
    if (!GRASS_SURFACES.has(map.getSurfaceAt(x, z))) return -Infinity;
    if (map.getSlopeAt(x, z) > 0.75) return -Infinity;
    const h = map.getTerrainHeightAt(x, z);
    if (h <= WATER_LEVEL + 0.4) return -Infinity;
    // Algo sólido encima del terreno (piso de una casa, muro, roca, puente): no crece pasto
    if (map.getFloorBelowY(x, h + 2.5, z) > h + 0.08) return -Infinity;
    return h;
  }

  buildTile(tx, tz) {
    const rng = createRNG(this.seed * 31 + (tx + 100) * 7919 + (tz + 100) * 104729);
    const x0 = tx * TILE_SIZE - WORLD_HALF;
    const z0 = tz * TILE_SIZE - WORLD_HALF;
    const grass = [];
    const steps = Math.ceil(TILE_SIZE / GRASS_SPACING);
    for (let iz = 0; iz < steps; iz++) {
      for (let ix = 0; ix < steps; ix++) {
        const x = x0 + (ix + 0.15 + rng() * 0.7) * GRASS_SPACING;
        const z = z0 + (iz + 0.15 + rng() * 0.7) * GRASS_SPACING;
        const h = this.canGrowAt(x, z);
        if (h === -Infinity) continue;
        grass.push(x, h - 0.02, z, rng() * Math.PI * 2, 0.72 + rng() * 0.48);
      }
    }

    // Flores en manchas de un color (más algunas sueltas)
    const flowers = [];
    const patches = 3 + Math.floor(rng() * 5);
    for (let p = 0; p < patches; p++) {
      const cx = x0 + rng() * TILE_SIZE;
      const cz = z0 + rng() * TILE_SIZE;
      const color = Math.floor(rng() * FLOWER_COLORS.length);
      const count = 12 + Math.floor(rng() * 20);
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 2.8;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const h = this.canGrowAt(x, z);
        if (h === -Infinity) continue;
        flowers.push(x, h - 0.02, z, rng() * Math.PI * 2, 0.9 + rng() * 0.45, color);
      }
    }
    for (let i = 0; i < 18; i++) {
      const x = x0 + rng() * TILE_SIZE;
      const z = z0 + rng() * TILE_SIZE;
      const h = this.canGrowAt(x, z);
      if (h === -Infinity) continue;
      flowers.push(x, h - 0.02, z, rng() * Math.PI * 2, 0.9 + rng() * 0.45, Math.floor(rng() * FLOWER_COLORS.length));
    }

    const tile = { tx, tz, cx: x0 + TILE_SIZE / 2, cz: z0 + TILE_SIZE / 2, grass: null, flowers: null };
    if (grass.length > 0) {
      const n = grass.length / 5;
      const mesh = new THREE.InstancedMesh(this.grassGeo, this.grassMat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 5;
        _p.set(grass[o], grass[o + 1], grass[o + 2]);
        _e.set(0, grass[o + 3], 0);
        _q.setFromEuler(_e);
        const s = grass[o + 4];
        _s.set(s, s * (0.85 + (i % 5) * 0.08), s);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      tile.grass = this.finishMesh(mesh);
    }
    if (flowers.length > 0) {
      const n = flowers.length / 6;
      const mesh = new THREE.InstancedMesh(this.flowerGeo, this.flowerMat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        _p.set(flowers[o], flowers[o + 1], flowers[o + 2]);
        _e.set(0, flowers[o + 3], 0);
        _q.setFromEuler(_e);
        const s = flowers[o + 4];
        _s.set(s, s, s);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
        mesh.setColorAt(i, FLOWER_COLORS[flowers[o + 5]]);
      }
      tile.flowers = this.finishMesh(mesh);
    }
    return tile;
  }

  finishMesh(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += BOUNDS_PADDING;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  // Llamar una vez por fotograma con la posición del jugador (pies)
  update(viewer) {
    if (!this.map || !viewer) return;
    const groundY = this.map.getTerrainHeightAt(viewer.x, viewer.z);
    const nearGround = viewer.y - groundY < MAX_GROUND_CLEARANCE;

    if (nearGround) {
      // Generar los bloques cercanos que falten, empezando por los más próximos
      const ctx = Math.floor((viewer.x + WORLD_HALF) / TILE_SIZE);
      const ctz = Math.floor((viewer.z + WORLD_HALF) / TILE_SIZE);
      const span = Math.ceil(VISIBLE_RADIUS / TILE_SIZE) + 1;
      const maxTile = Math.ceil((WORLD_HALF * 2) / TILE_SIZE) - 1;
      let built = 0;
      for (let ring = 0; ring <= span && built < TILES_PER_FRAME; ring++) {
        for (let dz = -ring; dz <= ring && built < TILES_PER_FRAME; dz++) {
          for (let dx = -ring; dx <= ring && built < TILES_PER_FRAME; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const tx = ctx + dx;
            const tz = ctz + dz;
            if (tx < 0 || tz < 0 || tx > maxTile || tz > maxTile) continue;
            const key = tx * 1000 + tz;
            if (this.tiles.has(key)) continue;
            const cx = tx * TILE_SIZE - WORLD_HALF + TILE_SIZE / 2;
            const cz = tz * TILE_SIZE - WORLD_HALF + TILE_SIZE / 2;
            if (Math.hypot(cx - viewer.x, cz - viewer.z) > VISIBLE_RADIUS + TILE_SIZE) continue;
            this.tiles.set(key, this.buildTile(tx, tz));
            built++;
          }
        }
      }
    }

    const showDist = VISIBLE_RADIUS + TILE_SIZE * 0.5;
    for (const [key, tile] of this.tiles) {
      const d = Math.hypot(tile.cx - viewer.x, tile.cz - viewer.z);
      if (d > KEEP_RADIUS) {
        this.disposeTile(tile);
        this.tiles.delete(key);
        continue;
      }
      const visible = nearGround && d < showDist;
      if (tile.grass) tile.grass.visible = visible;
      if (tile.flowers) tile.flowers.visible = visible;
    }
  }
}
