// shared/protocol.js
// Protocolo de red compartido por servidor (Node) y cliente (navegador): nombres de los mensajes Socket.IO y
// cuantización de números en los snapshots. Los valores en cable son EXACTAMENTE los mismos strings de siempre;
// centralizarlos evita errores tipográficos silenciosos (un evento mal escrito nunca llega y no da error).

/** Mensajes cliente -> servidor. */
export const C2S = Object.freeze({
  JOIN_LOBBY: 'join_lobby',
  CONFIGURE_BOTS: 'configure_bots',
  ADD_BOT: 'add_bot',
  CLEAR_BOTS: 'clear_bots',
  START_GAME: 'start_game',
  RESET_LOBBY: 'reset_lobby',
  PLAYER_INPUT: 'player_input',
  PLAYER_JUMP: 'player_jump',
  PLAYER_SLIDE: 'player_slide',
  PLAYER_SHOOT: 'player_shoot',
  PLAYER_RELOAD: 'player_reload',
  PLAYER_SWITCH_WEAPON: 'player_switch_weapon',
  PLAYER_HEAL: 'player_heal',
  PLAYER_CANCEL_HEAL: 'player_cancel_heal',
  PLAYER_PICKUP: 'player_pickup',
  PLAYER_INTERACT_DOOR: 'player_interact_door',
  PLAYER_BREAK_WINDOW: 'player_break_window'
});

/** Mensajes servidor -> cliente. */
export const S2C = Object.freeze({
  NETWORK_INFO: 'network_info',
  LOBBY_JOINED: 'lobby_joined',
  LOBBY_STATE: 'lobby_state',
  GAME_STARTED: 'game_started',
  JOINED_MIDGAME: 'joined_midgame',
  WORLD_TICK: 'world_tick',
  PLAYER_JUMPED: 'player_jumped',
  PLAYER_SLID: 'player_slid',
  PLAYER_CABIN_DISEMBARK: 'player_cabin_disembark',
  LOOT_PICKED: 'loot_picked',
  LOOT_SPAWNED: 'loot_spawned',
  DOOR_STATE_CHANGED: 'door_state_changed',
  WINDOW_BROKEN: 'window_broken',
  SHOT_FIRED: 'shot_fired',
  PLAYER_DAMAGED: 'player_damaged',
  PLAYER_ELIMINATED: 'player_eliminated',
  WILDLIFE_HIT: 'wildlife_hit',
  WILDLIFE_AGGRO: 'wildlife_aggro',
  WILDLIFE_ATTACK: 'wildlife_attack',
  WILDLIFE_KILLED: 'wildlife_killed',
  RELOAD_COMPLETE: 'reload_complete',
  HEAL_STARTED: 'heal_started',
  HEAL_CANCELLED: 'heal_cancelled',
  PLAYER_HEALED: 'player_healed',
  GAME_OVER: 'game_over',
  RETURNED_TO_LOBBY: 'returned_to_lobby'
});

/**
 * Redondea a `decimals` decimales para reducir el tamaño del JSON en cable (snapshots a 20 Hz).
 * Equivale exactamente a `Number(value.toFixed(decimals))`.
 * @param {number} value
 * @param {number} decimals
 * @returns {number}
 */
export function quantize(value, decimals) {
  return Number(value.toFixed(decimals));
}
