// shared/weapons.js
// Registro maestro de armas (cliente y servidor). Antes el inventario inicial {fists, pistol, ...} estaba escrito a
// mano en 3 sitios (server/gameRoom.js, client/js/main.js y client/js/player/controller.js) y la lista de armas
// desbloqueadas se serializaba/deserializaba campo a campo. Ahora todo sale de WEAPONS/WEAPON_SLOTS (config.js).
// @ts-check

import { WEAPONS, WEAPON_SLOTS } from './config.js';

/** @typedef {{ unlocked: boolean, mag: number }} WeaponSlotState */
/** @typedef {Record<string, WeaponSlotState>} WeaponInventory */

/** Todas las armas en orden de ranura: puños/machete primero y luego las 7 de fuego. */
export const WEAPON_IDS = Object.freeze(['fists', ...WEAPON_SLOTS]);

/** Registro inmutable: id, índice de ranura en el HUD y especificación de balística/cadencia. */
export const WEAPON_REGISTRY = Object.freeze(
  WEAPON_IDS.map((id, slot) => Object.freeze({ id, slot, spec: WEAPONS[id] }))
);

/**
 * @param {string} id
 * @returns {boolean} true si `id` es un arma conocida
 */
export function isWeaponId(id) {
  return WEAPON_IDS.includes(id);
}

/**
 * Especificación de un arma con respaldo a los puños si el id no existe.
 * @param {string} id
 */
export function getWeaponSpec(id) {
  return WEAPONS[id] || WEAPONS.fists;
}

/**
 * Inventario inicial de un jugador: solo los puños desbloqueados y todos los cargadores vacíos.
 * @returns {WeaponInventory}
 */
export function createWeaponInventory() {
  /** @type {WeaponInventory} */
  const inventory = {};
  for (const id of WEAPON_IDS) inventory[id] = { unlocked: id === 'fists', mag: 0 };
  return inventory;
}

/**
 * Armas de fuego desbloqueadas tal como viajan en el snapshot (`unlockedWeapons`).
 * @param {WeaponInventory} weapons
 * @returns {Record<string, boolean>}
 */
export function serializeUnlockedWeapons(weapons) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const id of WEAPON_SLOTS) out[id] = weapons[id].unlocked;
  return out;
}

/**
 * Aplica sobre el inventario local las armas desbloqueadas recibidas del servidor.
 * @param {WeaponInventory} weapons
 * @param {Record<string, boolean>} unlocked
 */
export function applyUnlockedWeapons(weapons, unlocked) {
  for (const id of WEAPON_SLOTS) weapons[id].unlocked = Boolean(unlocked[id]);
}
