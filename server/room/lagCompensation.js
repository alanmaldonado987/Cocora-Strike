// server/room/lagCompensation.js
// Compensación de latencia para los disparos.
// El cliente dibuja a los demás jugadores y a la fauna un poco en el pasado (interpolación de
// snapshots). Para que un disparo acierte donde el tirador VIO al objetivo, el servidor guarda un
// historial corto de posiciones y comprueba el impacto contra la posición en ese instante.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

export const MAX_REWIND_MS = 300; // nunca rebobinar más que esto (limita el abuso)
const HISTORY_MS = 1000;

function pushHistory(entity, t) {
  if (!entity.posHistory) entity.posHistory = [];
  const h = entity.posHistory;
  h.push({ t, x: entity.x, y: entity.y, z: entity.z });
  while (h.length > 2 && t - h[0].t > HISTORY_MS) h.shift();
}

// Posición interpolada de una entidad en el instante t (o la actual si no hay historial)
export function positionAt(entity, t) {
  const h = entity.posHistory;
  if (!h || h.length === 0 || t === null || t >= h[h.length - 1].t) {
    return { x: entity.x, y: entity.y, z: entity.z };
  }
  if (t <= h[0].t) return { x: h[0].x, y: h[0].y, z: h[0].z };
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1];
    const b = h[i];
    if (a.t <= t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return { x: entity.x, y: entity.y, z: entity.z };
}

// Instante al que rebobinar un disparo, o null si no corresponde
export function resolveRewindTime(viewTime, now) {
  if (typeof viewTime !== 'number' || !Number.isFinite(viewTime)) return null;
  return Math.max(now - MAX_REWIND_MS, Math.min(now, viewTime));
}

export const lagCompensationMethods = {
  recordPositionHistory(now) {
    for (const p of this.players.values()) {
      if (p.alive && !p.spectating) pushHistory(p, now);
    }
    for (const a of this.wildlife.values()) {
      if (a.alive) pushHistory(a, now);
    }
  }
};
