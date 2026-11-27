// client/js/world/aircraftDirector.js
// Director de la aeronave de transporte en partida real (Bloque 6A): traduce el estado autoritativo que el
// servidor ya envía en cada world_tick (plane.elapsed / maxDuration / yaw y si queda alguien a bordo) en órdenes
// para la API articulada de AC-130 y CH-47 (setThrottle, setDoorsOpen, aimTurrets, setFiring).
// No añade bytes a la red: todo se deriva de forma determinista, así que todos los clientes ven lo mismo.
// Módulo puro (sin imports) para poder probarlo en Node.

/** Segundos de potencia de despegue al inicio del vuelo. */
export const TAKEOFF_POWER_S = 4.0;
/** Ciclo de ráfagas de fuego de supresión: dispara en [FIRE_WINDOW_START, FIRE_WINDOW_END) de cada ciclo. */
export const FIRE_CYCLE_S = 8.0;
export const FIRE_WINDOW_START_S = 4.0;
export const FIRE_WINDOW_END_S = 6.2;
/** No dispara durante los primeros segundos (el pasaje aún se está acomodando). */
export const FIRE_GRACE_S = 3.0;
/** Distancias del punto de impacto cosmético respecto a la aeronave (m). */
export const AIM_SIDE_M = 90;
export const AIM_AHEAD_M = 20;
export const AIM_DROP_M = 75;

/**
 * @typedef {{ throttle: number, doorsOpen: boolean, firing: boolean, aimSide: number,
 *             aimX: number, aimY: number, aimZ: number }} AircraftCommands
 */

/** @returns {AircraftCommands} */
export function createAircraftCommands() {
  return { throttle: 1, doorsOpen: true, firing: false, aimSide: 1, aimX: 0, aimY: 0, aimZ: 0 };
}

/**
 * ¿Queda algún jugador vivo dentro de la aeronave? (snapshot.players del world_tick)
 * @param {Record<string, { state?: string, alive?: boolean }> | null | undefined} players
 * @param {string} planeStateId valor de PLAYER_STATE.PLANE
 */
export function isPlaneOccupied(players, planeStateId) {
  if (!players) return false;
  for (const id in players) {
    const p = players[id];
    if (p && p.alive !== false && p.state === planeStateId) return true;
  }
  return false;
}

/**
 * Calcula las órdenes del fotograma sin asignar memoria.
 * @param {{ aircraftType?: string, elapsed?: number, yaw?: number }} planeState
 * @param {{ x: number, y: number, z: number }} planePos posición suavizada de la aeronave en el cliente
 * @param {boolean} occupied si queda alguien a bordo (la rampa se cierra al saltar el último)
 * @param {AircraftCommands} out
 * @returns {AircraftCommands}
 */
export function computeAircraftCommands(planeState, planePos, occupied, out) {
  const elapsed = Math.max(0, planeState.elapsed || 0);
  const yaw = planeState.yaw || 0;

  // Potencia: despegue al 100 %, crucero con pasaje y reducción cuando ya saltaron todos
  out.throttle = elapsed < TAKEOFF_POWER_S ? 1.0 : occupied ? 0.92 : 0.84;

  // Rampa y puertas: abiertas mientras haya pasaje para saltar; se cierran al vaciarse la bodega
  out.doorsOpen = occupied;

  // Fuego de supresión cosmético en ráfagas deterministas (mismo instante en todos los clientes)
  const cycleIndex = Math.floor(elapsed / FIRE_CYCLE_S);
  const inCycle = elapsed - cycleIndex * FIRE_CYCLE_S;
  out.firing = elapsed >= FIRE_GRACE_S && inCycle >= FIRE_WINDOW_START_S && inCycle < FIRE_WINDOW_END_S;

  // El AC-130 solo tiene afustes en estribor; el CH-47 alterna babor/estribor en cada ráfaga
  out.aimSide = planeState.aircraftType === 'ch47' && cycleIndex % 2 === 1 ? -1 : 1;

  // Eje local +X (estribor) de una rotación en Y por `yaw`: (cos yaw, 0, -sin yaw); avance: (sin yaw, 0, cos yaw)
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  out.aimX = planePos.x + rx * AIM_SIDE_M * out.aimSide + fx * AIM_AHEAD_M;
  out.aimY = planePos.y - AIM_DROP_M;
  out.aimZ = planePos.z + rz * AIM_SIDE_M * out.aimSide + fz * AIM_AHEAD_M;
  return out;
}
