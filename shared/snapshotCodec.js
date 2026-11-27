// shared/snapshotCodec.js
// Códec compacto del mensaje world_tick (servidor 20 Hz -> clientes) para cumplir el presupuesto de red LAN
// (< 30 KB/s por cliente con 2 humanos + bots). Antes cada tick enviaba objetos JSON completos (~8 KB/tick):
//   - jugadores: ~660 B cada uno, repitiendo nombre, color, inventario y armas desbloqueadas en cada tick;
//   - fauna: todo el mapa (~5 KB/tick) aunque nadie estuviera cerca.
// Ahora:
//   - jugadores: campos "calientes" como array posicional en cada tick (booleanos como 0/1) y campos "fríos"
//     solo cuando cambian, más un fotograma clave cada KEYFRAME_TICKS;
//   - fauna: a WILDLIFE_EVERY_TICKS y solo la que está cerca de algún humano (interés);
//   - avión y tormenta: la parte que cambia en cada tick y el resto en fotogramas clave.
// El decodificador del cliente reconstruye EXACTAMENTE los mismos objetos de antes ({ t, players, wildlife,
// plane, storm, aliveCount }), así que el resto del cliente no cambia.
// @ts-check

/** Fotograma clave: reenvía todo lo frío cada segundo (clientes recién llegados, paquetes perdidos). */
export const KEYFRAME_TICKS = 20;
/** Fauna a 5 Hz (el cliente la interpola con su propio reloj de snapshots, que adapta el retardo). */
export const WILDLIFE_EVERY_TICKS = 4;
/** Tormenta a 4 Hz (cambia despacio). */
export const STORM_EVERY_TICKS = 5;
/** Radio horizontal (m) de interés de la fauna alrededor de cada humano. */
export const WILDLIFE_INTEREST_RADIUS = 140;

/** Campos que cambian casi en cada tick. */
export const PLAYER_HOT_FIELDS = Object.freeze([
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'state', 'moveMode', 'alive', 'hp', 'onGround', 'animWalk',
  'isSliding', 'isCrouching', 'isSwimming', 'equipped', 'mag', 'lastSeq', 'cabinProgress', 'reloading',
  'isHealing', 'breath', 'kills'
]);
/** Campos que cambian rara vez (se envían al cambiar o en fotograma clave). */
export const PLAYER_COLD_FIELDS = Object.freeze([
  'name', 'isBot', 'colorIdx', 'seatIndex', 'maxHp', 'jumpAltitude', 'reserveAmmo', 'medkits', 'bandages',
  'healingItem', 'unlockedWeapons'
]);
const PLAYER_BOOL_FIELDS = new Set([
  'alive', 'onGround', 'isSliding', 'isCrouching', 'isSwimming', 'reloading', 'isHealing', 'isBot'
]);

export const WILDLIFE_FIELDS = Object.freeze([
  'id', 'species', 'x', 'y', 'z', 'yaw', 'hp', 'maxHp', 'aiState', 'pose', 'animPhase'
]);

/** Parte del avión que cambia en cada tick. */
export const PLANE_HOT_FIELDS = Object.freeze(['x', 'y', 'z', 'elapsed', 'active']);

function packFields(obj, fields) {
  const out = new Array(fields.length);
  for (let i = 0; i < fields.length; i++) {
    const k = fields[i];
    const v = obj[k];
    out[i] = PLAYER_BOOL_FIELDS.has(k) ? (v ? 1 : 0) : v === undefined ? null : v;
  }
  return out;
}

function unpackFields(arr, fields, into) {
  for (let i = 0; i < fields.length; i++) {
    const k = fields[i];
    into[k] = PLAYER_BOOL_FIELDS.has(k) ? arr[i] === 1 : arr[i];
  }
  return into;
}

/** Codificador del servidor (uno por sala): recuerda lo último enviado para mandar solo cambios. */
export class WorldTickEncoder {
  constructor() {
    this.tickCount = 0;
    /** @type {Map<string, string>} firma JSON de los campos fríos enviados por jugador */
    this.coldSig = new Map();
    this.planeRef = null;
    this.planeActive = null;
  }

  /** Fuerza fotograma clave en el próximo tick (nueva ronda, alguien se une). */
  reset() {
    this.tickCount = 0;
    this.coldSig.clear();
    this.planeRef = null;
    this.planeActive = null;
  }

  /**
   * @param {{ t: number, players: Record<string, any>, wildlife: any[] | null, plane: any, storm: any,
   *           aliveCount: number, interest?: Array<{ x: number, z: number }> }} full
   * @returns {Record<string, any>} mensaje compacto para el cable
   */
  encode(full) {
    const keyframe = this.tickCount % KEYFRAME_TICKS === 0;
    const msg = /** @type {Record<string, any>} */ ({ t: full.t, a: full.aliveCount });

    const hot = {};
    let cold = null;
    for (const id in full.players) {
      const p = full.players[id];
      hot[id] = packFields(p, PLAYER_HOT_FIELDS);
      const c = packFields(p, PLAYER_COLD_FIELDS);
      const sig = JSON.stringify(c);
      if (keyframe || this.coldSig.get(id) !== sig) {
        this.coldSig.set(id, sig);
        (cold ??= {})[id] = c;
      }
    }
    msg.p = hot;
    if (cold) msg.pc = cold;

    if (full.wildlife && (keyframe || this.tickCount % WILDLIFE_EVERY_TICKS === 0)) {
      const r2 = WILDLIFE_INTEREST_RADIUS * WILDLIFE_INTEREST_RADIUS;
      const interest = full.interest || [];
      const w = [];
      for (const a of full.wildlife) {
        let near = interest.length === 0;
        for (let i = 0; i < interest.length && !near; i++) {
          const dx = a.x - interest[i].x;
          const dz = a.z - interest[i].z;
          near = dx * dx + dz * dz <= r2;
        }
        if (near) w.push(packFields(a, WILDLIFE_FIELDS));
      }
      msg.w = w;
    }

    const plane = full.plane;
    if (!plane) {
      msg.pl = null;
      this.planeRef = null;
    } else if (!plane.active && !keyframe && this.planeActive === false && this.planeRef === plane) {
      // Avión ya inactivo y el cliente lo sabe: no se repite en cada tick (el decodificador lo conserva)
    } else {
      msg.pl = packFields(plane, PLANE_HOT_FIELDS);
      msg.pl[4] = plane.active ? 1 : 0;
      if (keyframe || this.planeRef !== plane || this.planeActive !== Boolean(plane.active)) {
        msg.plc = plane;
        this.planeRef = plane;
        this.planeActive = Boolean(plane.active);
      }
    }

    if (full.storm && (keyframe || this.tickCount % STORM_EVERY_TICKS === 0)) msg.s = full.storm;

    this.tickCount++;
    return msg;
  }
}

/** Decodificador del cliente: reconstruye el snapshot completo con la caché de lo frío. */
export class WorldTickDecoder {
  constructor() {
    /** @type {Map<string, Record<string, any>>} */
    this.cold = new Map();
    this.planeCold = null;
    this.lastPlane = null;
    this.storm = null;
  }

  /** Siembra la caché con la lista completa de jugadores de game_started / joined_midgame. */
  seedPlayers(players) {
    if (!players) return;
    for (const id in players) {
      const p = players[id];
      const c = {};
      for (const k of PLAYER_COLD_FIELDS) c[k] = p[k];
      this.cold.set(id, c);
    }
  }

  seedWorld({ plane, storm } = /** @type {any} */ ({})) {
    if (plane !== undefined) this.planeCold = plane;
    if (storm !== undefined) this.storm = storm;
  }

  /**
   * @param {Record<string, any>} msg
   * @returns {{ t: number, players: Record<string, any>, wildlife?: any[], plane: any, storm: any, aliveCount: number }}
   */
  decode(msg) {
    if (msg.pc) {
      for (const id in msg.pc) {
        this.cold.set(id, unpackFields(msg.pc[id], PLAYER_COLD_FIELDS, {}));
      }
    }
    const players = {};
    for (const id in msg.p) {
      const c = this.cold.get(id);
      if (!c) continue; // aún sin datos fríos (llega como mucho en el próximo fotograma clave)
      const p = Object.assign({ id }, c);
      players[id] = unpackFields(msg.p[id], PLAYER_HOT_FIELDS, p);
    }

    if (msg.plc !== undefined) this.planeCold = msg.plc;
    let plane = null;
    if (msg.pl === undefined) {
      // Avión inactivo omitido por el servidor: se conserva el último estado conocido
      plane = this.lastPlane;
    } else if (msg.pl && this.planeCold) {
      // Objeto nuevo en cada tick: el cliente detecta "dato fresco del servidor" por identidad
      plane = Object.assign({}, this.planeCold);
      for (let i = 0; i < PLANE_HOT_FIELDS.length; i++) plane[PLANE_HOT_FIELDS[i]] = msg.pl[i];
      plane.active = msg.pl[4] === 1;
    }
    this.lastPlane = plane;

    if (msg.s) this.storm = msg.s;

    const out = /** @type {any} */ ({ t: msg.t, players, plane, storm: this.storm, aliveCount: msg.a });
    if (msg.w) {
      out.wildlife = msg.w.map((arr) => {
        const a = {};
        for (let i = 0; i < WILDLIFE_FIELDS.length; i++) a[WILDLIFE_FIELDS[i]] = arr[i];
        return a;
      });
    }
    return out;
  }
}
