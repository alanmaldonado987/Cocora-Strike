// shared/map/pois.data.js
// Datos (no lógica) del Valle del Cocora: coordenadas en metros de los Puntos de Interés, montañas, zonas de
// terrazas cafeteras y cruces del río Quindío. Separarlos del generador permite ajustar el mapa sin tocar código.
// Todo está congelado: shared/map/terrain.js crea copias antes de usarlos.
// @ts-check

/** Puntos de Interés (elevados sobre mesetas naturales, nunca en huecos). */
export const POIS = Object.freeze({
  salento: Object.freeze({ name: 'Salento', x: 56, z: 4, radius: 72 }),
  fincaOcaso: Object.freeze({ name: 'Finca El Ocaso', x: -162, z: 148, radius: 42 }),
  fincaPalma: Object.freeze({ name: 'Finca La Palma', x: 178, z: -148, radius: 42 }),
  lumberCamp: Object.freeze({ name: 'Campamento Maderero', x: -175, z: -148, radius: 40 }),
  bodegaRio: Object.freeze({ name: 'Bodega del Río', x: -102, z: 48, radius: 34 }),
  puestoNorte: Object.freeze({ name: 'Puesto Vigía Norte', x: 35, z: -205, radius: 30 }),
  puestoSur: Object.freeze({ name: 'Fortín del Sur', x: 58, z: 205, radius: 30 }),
  caserioEste: Object.freeze({ name: 'Caserío La Quebrada', x: 215, z: 28, radius: 36 }),
  mountainRuins: Object.freeze({ name: 'Ruinas Andinas', x: 162, z: 132, radius: 30 }),
  mirador: Object.freeze({ name: 'Mirador del Cocora', x: -148, z: -18, radius: 26 })
});


/** 3 montañas escarpadas con laderas transitables y cuevas en su base. */
export const MOUNTAIN_PEAKS = Object.freeze([
  Object.freeze({ name: 'Cerro Morrogacho', x: -98, z: -252, radius: 82, addHeight: 33.0 }),
  Object.freeze({ name: 'Peñón del Cóndor', x: 238, z: 218, radius: 88, addHeight: 35.0 }),
  Object.freeze({ name: 'Farallón Cafetero', x: -252, z: 58, radius: 78, addHeight: 31.0 })
]);

/** Zonas de terrazas cafeteras. */
export const COFFEE_TERRACE_ZONES = Object.freeze([
  Object.freeze({ x: -135, z: 112, r: 48 }),
  Object.freeze({ x: 145, z: -115, r: 48 }),
  Object.freeze({ x: 128, z: 68, r: 40 })
]);

/** z de los 4 puentes sobre el río Quindío y de los 2 vados amplios. */
export const BRIDGE_Z_COORDS = Object.freeze([-192, -64, 56, 186]);
export const FORD_Z_COORDS = Object.freeze([-128, 122]);
