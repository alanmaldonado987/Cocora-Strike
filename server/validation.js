// server/validation.js
// Validación de los mensajes que llegan del cliente y límite de frecuencia por socket.
// Cada sanitizador devuelve un payload limpio o null si el mensaje debe descartarse.

import { BOT_DIFFICULTIES, WEAPONS } from '../shared/mapData.js';

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
  return out;
}

const INPUT_STATES = new Set(['ground', 'skydiving', 'parachuting', 'plane']);

export const sanitizers = {
  join_lobby: (p) => ({ name: sanitizeName(isObject(p) ? p.name : '') }),

  configure_bots: (p) => (isObject(p) ? botConfig(p) : null),

  start_game: (p) => {
    if (!isObject(p)) return { autoFillBots: false };
    return { autoFillBots: p.autoFillBots === true, ...botConfig(p) };
  },

  player_input: (p) => {
    if (!isObject(p)) return null;
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
      // Modos como 'crouch_walk' o 'swim_idle' llevan guion bajo
      moveMode: typeof p.moveMode === 'string' && /^[a-z_]{1,16}$/.test(p.moveMode) ? p.moveMode : undefined,
      state: typeof p.state === 'string' && INPUT_STATES.has(p.state) ? p.state : undefined
    };
    // La posición solo cuenta si llega completa
    if (out.x === undefined || out.y === undefined || out.z === undefined) {
      out.x = out.y = out.z = undefined;
    }
    return out;
  },

  player_slide: (p) => ({ active: isObject(p) && p.active === true }),

  player_shoot: (p) => {
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

  player_switch_weapon: (p) => {
    if (!isObject(p) || typeof p.weapon !== 'string') return null;
    return p.weapon === 'fists' || Object.hasOwn(WEAPONS, p.weapon) ? { weapon: p.weapon } : null;
  },

  player_heal: (p) => {
    const itemType = isObject(p) ? p.itemType : undefined;
    return { itemType: itemType === 'bandage' ? 'bandage' : 'medkit' };
  },

  player_pickup: (p) => {
    const lootId = isObject(p) ? id(p.lootId) : null;
    return lootId === null ? null : { lootId };
  },

  player_interact_door: (p) => {
    const doorId = isObject(p) ? id(p.doorId) : null;
    return doorId === null ? null : { doorId };
  },

  player_break_window: (p) => {
    const windowId = isObject(p) ? id(p.windowId) : null;
    return windowId === null ? null : { windowId };
  }
};

// Mensajes por segundo permitidos (ráfaga = rate * burstSeconds).
// El cliente envía player_input cada 45 ms (~22/s); el arma más rápida dispara cada ~70 ms.
export const RATE_LIMITS = {
  player_input: 40,
  player_shoot: 30,
  player_slide: 6,
  player_jump: 6,
  player_reload: 6,
  player_switch_weapon: 12,
  player_heal: 6,
  player_cancel_heal: 6,
  player_pickup: 15,
  player_interact_door: 8,
  player_break_window: 10,
  join_lobby: 3,
  configure_bots: 6,
  add_bot: 6,
  clear_bots: 4,
  start_game: 2,
  reset_lobby: 2
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
