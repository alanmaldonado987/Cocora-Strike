// server/validation.js
// Validación de los mensajes que llegan del cliente y límite de frecuencia por socket.
// Cada sanitizador devuelve un payload limpio o null si el mensaje debe descartarse.

import { BOT_DIFFICULTIES, TRANSPORT_AIRCRAFT_TYPES, WEAPONS } from '../shared/mapData.js';
import { C2S } from '../shared/protocol.js';

const MAX_ID_LENGTH = 64;
const MAX_COORD = 10000;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function optionalFinite(v) {
  return finite(v) && Math.abs(v) <= MAX_COORD ? v : undefined;
}

function optionalBool(v) {
  return typeof v === 'boolean' ? v : undefined;
}

function vec3(v) {
  if (!isObject(v)) return null;
  const { x, y, z } = v;
  if (![x, y, z].every((n) => finite(n) && Math.abs(n) <= MAX_COORD)) return null;
  return { x, y, z };
}

function id(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH) return v;
  return null;
}

// Caracteres de control, de ancho cero y de control bidireccional (por código numérico).
const INVISIBLE_RANGES = [[0x00, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]];
const isInvisible = (code) => INVISIBLE_RANGES.some(([a, b]) => code >= a && code <= b);

// Quita caracteres invisibles; el servidor además recorta a 16 caracteres.
export function sanitizeName(v) {
  if (typeof v !== 'string') return '';
  return Array.from(v).filter((ch) => !isInvisible(ch.codePointAt(0))).join('').slice(0, 32);
}

function botConfig(p) {
  const out = {};
  if (typeof p.botDifficulty === 'string' && Object.hasOwn(BOT_DIFFICULTIES, p.botDifficulty)) {
    out.botDifficulty = p.botDifficulty;
  }
  if (finite(p.botCount)) out.botCount = clamp(Math.round(p.botCount), 0, 8);
  if (typeof p.aircraftType === 'string' && TRANSPORT_AIRCRAFT_TYPES.includes(p.aircraftType)) {
    out.aircraftType = p.aircraftType;
  }
  return out;
}

const INPUT_STATES = new Set(['ground', 'skydiving', 'parachuting', 'plane', 'swimming']);

export const sanitizers = {
  [C2S.JOIN_LOBBY]: (p) => ({ name: sanitizeName(isObject(p) ? p.name : '') }),

  [C2S.CONFIGURE_BOTS]: (p) => (isObject(p) ? botConfig(p) : null),

  [C2S.START_GAME]: (p) => {
    if (!isObject(p)) return { autoFillBots: false };
    return { autoFillBots: p.autoFillBots === true, ...botConfig(p) };
  },

  [C2S.PLAYER_INPUT]: (p) => {
    if (!isObject(p)) return null;
    let steps;
    if (Array.isArray(p.steps) && p.steps.length > 0 && p.steps.length <= 12) {
      const cleanSteps = [];
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i];
        if (!isObject(s)) continue;
        const seq = typeof s.seq === 'number' && Number.isInteger(s.seq) && s.seq > 0 ? s.seq : null;
        if (seq === null) continue;
        cleanSteps.push({
          seq,
          moveX: finite(s.moveX) ? clamp(s.moveX, -1.5, 1.5) : 0,
          moveZ: finite(s.moveZ) ? clamp(s.moveZ, -1.5, 1.5) : 0,
          yaw: finite(s.yaw) && Math.abs(s.yaw) <= MAX_COORD ? s.yaw : 0,
          pitch: finite(s.pitch) ? clamp(s.pitch, -1.45, 1.45) : 0,
          buttons: typeof s.buttons === 'number' && Number.isFinite(s.buttons) ? (s.buttons >>> 0) & 0xff : 0
        });
      }
      if (cleanSteps.length > 0) steps = cleanSteps;
    }

    const out = {
      x: optionalFinite(p.x),
      y: optionalFinite(p.y),
      z: optionalFinite(p.z),
      yaw: optionalFinite(p.yaw),
      pitch: optionalFinite(p.pitch),
      animWalk: optionalFinite(p.animWalk),
      onGround: optionalBool(p.onGround),
      isSliding: optionalBool(p.isSliding),
      isCrouching: optionalBool(p.isCrouching),
      isVaulting: optionalBool(p.isVaulting),
      isSwimming: optionalBool(p.isSwimming),
      // Modos como 'crouch_walk', 'swimming' o 'swim_idle' llevan guion bajo
      moveMode: typeof p.moveMode === 'string' && /^[a-z_]{1,16}$/.test(p.moveMode) ? p.moveMode : undefined,
      state: typeof p.state === 'string' && INPUT_STATES.has(p.state) ? p.state : undefined,
      steps
    };
    // La posición solo cuenta si llega completa
    if (out.x === undefined || out.y === undefined || out.z === undefined) {
      out.x = out.y = out.z = undefined;
    }
    return out;
  },

  [C2S.PLAYER_SLIDE]: (p) => ({ active: isObject(p) && p.active === true }),

  [C2S.PLAYER_SHOOT]: (p) => {
    if (!isObject(p)) return null;
    const origin = vec3(p.origin);
    const dir = vec3(p.dir);
    if (!origin || !dir) return null;
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-6) return null;
    // viewTime: hora del servidor que veía el tirador (el servidor la acota al rebobinar)
    const viewTime = finite(p.viewTime) ? p.viewTime : null;
    return { origin, dir: { x: dir.x / len, y: dir.y / len, z: dir.z / len }, viewTime };
  },

  [C2S.PLAYER_SWITCH_WEAPON]: (p) => {
    if (!isObject(p) || typeof p.weapon !== 'string') return null;
    return p.weapon === 'fists' || Object.hasOwn(WEAPONS, p.weapon) ? { weapon: p.weapon } : null;
  },

  [C2S.PLAYER_HEAL]: (p) => {
    const itemType = isObject(p) ? p.itemType : undefined;
    return { itemType: itemType === 'bandage' ? 'bandage' : 'medkit' };
  },

  [C2S.PLAYER_PICKUP]: (p) => {
    const lootId = isObject(p) ? id(p.lootId) : null;
    return lootId === null ? null : { lootId };
  },

  [C2S.PLAYER_INTERACT_DOOR]: (p) => {
    const doorId = isObject(p) ? id(p.doorId) : null;
    return doorId === null ? null : { doorId };
  },

  [C2S.PLAYER_BREAK_WINDOW]: (p) => {
    const windowId = isObject(p) ? id(p.windowId) : null;
    return windowId === null ? null : { windowId };
  }
};

// Mensajes por segundo permitidos (ráfaga = rate * burstSeconds).
// El cliente envía player_input cada 45 ms (~22/s); el arma más rápida dispara cada ~70 ms.
export const RATE_LIMITS = {
  [C2S.PLAYER_INPUT]: 40,
  [C2S.PLAYER_SHOOT]: 30,
  [C2S.PLAYER_SLIDE]: 6,
  [C2S.PLAYER_JUMP]: 6,
  [C2S.PLAYER_RELOAD]: 6,
  [C2S.PLAYER_SWITCH_WEAPON]: 12,
  [C2S.PLAYER_HEAL]: 6,
  [C2S.PLAYER_CANCEL_HEAL]: 6,
  [C2S.PLAYER_PICKUP]: 15,
  [C2S.PLAYER_INTERACT_DOOR]: 8,
  [C2S.PLAYER_BREAK_WINDOW]: 10,
  [C2S.JOIN_LOBBY]: 3,
  [C2S.CONFIGURE_BOTS]: 6,
  [C2S.ADD_BOT]: 6,
  [C2S.CLEAR_BOTS]: 4,
  [C2S.START_GAME]: 2,
  [C2S.RESET_LOBBY]: 2
};

export class RateLimiter {
  constructor(limits = RATE_LIMITS, burstSeconds = 1.5, now = () => Date.now()) {
    this.limits = limits;
    this.burstSeconds = burstSeconds;
    this.now = now;
    this.buckets = new Map();
  }

  allow(event) {
    const rate = this.limits[event];
    if (!rate) return true;
    const t = this.now();
    const capacity = rate * this.burstSeconds;
    let b = this.buckets.get(event);
    if (!b) {
      b = { tokens: capacity, last: t };
      this.buckets.set(event, b);
    }
    b.tokens = Math.min(capacity, b.tokens + ((t - b.last) / 1000) * rate);
    b.last = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

// Velocidad horizontal máxima creíble por estado (m/s), con margen sobre la real:
// suelo (sprint/slide en bajada ~13-16), paracaídas ~18.5, caída libre ~23.5.
export const MAX_HORIZONTAL_SPEED = {
  ground: 20,
  parachuting: 26,
  skydiving: 32
};

// Presupuesto de movimiento: acumula distancia permitida con el tiempo (tope de 0.6 s)
// para tolerar paquetes que llegan agrupados, sin permitir teletransportes.
export function consumeMoveBudget(p, state, distance, now = Date.now()) {
  const speed = MAX_HORIZONTAL_SPEED[state] ?? MAX_HORIZONTAL_SPEED.ground;
  const cap = speed * 0.6 + 1.0;
  if (p.moveBudget === undefined || p.moveBudgetAt === undefined) {
    p.moveBudget = cap;
  } else {
    p.moveBudget = Math.min(cap, p.moveBudget + ((now - p.moveBudgetAt) / 1000) * speed);
  }
  p.moveBudgetAt = now;
  const allowed = Math.min(distance, Math.max(0, p.moveBudget));
  p.moveBudget -= allowed;
  return allowed;
}
