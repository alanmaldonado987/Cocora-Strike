// client/js/interpolation.js
// Interpolación de snapshots con retardo fijo para entidades remotas (jugadores y fauna).
//
// El servidor envía el estado a 20 Hz (cada 50 ms). En vez de perseguir el último snapshot
// (lo que produce un avance a tirones y frenazos cuando un paquete llega tarde), cada entidad
// guarda los snapshots recientes con la marca de tiempo del servidor y se dibuja un poco en el
// pasado (INTERP_DELAY_MS), interpolando entre los dos snapshots que rodean ese instante.
// Así el movimiento es continuo y un paquete retrasado no se nota.
//
// Sin dependencias de three.js: se prueba con node:test.

export const INTERP_DELAY_MS = 100; // 2 ticks del servidor de margen
export const MAX_EXTRAPOLATION_MS = 120; // si faltan datos, prolongar el movimiento como mucho esto
export const TELEPORT_DISTANCE = 20; // saltos mayores entre snapshots no se interpolan
const BUFFER_SIZE = 10;

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Estima la hora del servidor a partir de las marcas de tiempo de los snapshots.
// Usa el menor desfase observado (el paquete que llegó más rápido) y se adapta despacio
// hacia arriba, para no contagiarse del retraso puntual de un paquete.
//
// El retardo de interpolación se adapta a la red: intervalo típico entre snapshots + retraso
// extra de los paquetes (jitter) + un margen. Con buena red queda cerca de 100 ms; con Wi-Fi
// irregular sube lo necesario para no quedarse sin datos. Cambia de forma gradual (máx. 5 % del
// tiempo real) para que el ajuste no se perciba como acelerón o frenazo.
export const MIN_INTERP_DELAY_MS = 80;
export const MAX_INTERP_DELAY_MS = 250;
const DELAY_SLEW = 0.05;

export class ServerClock {
  constructor() {
    this.offset = null; // localNow - serverTime (del paquete más rápido)
    this.lastServerTime = null;
    this.interval = 50; // intervalo típico entre snapshots (ms)
    this.jitter = 0; // retraso extra típico de los paquetes respecto al más rápido (ms)
    this.delay = INTERP_DELAY_MS; // retardo aplicado ahora
    this.lastRenderLocal = null;
  }

  observe(serverTime, localNow) {
    if (!Number.isFinite(serverTime)) return;
    const sample = localNow - serverTime;
    if (this.offset === null || sample < this.offset) {
      this.offset = sample;
    } else {
      this.offset += (sample - this.offset) * 0.002;
    }

    if (this.lastServerTime !== null && serverTime > this.lastServerTime) {
      const gap = serverTime - this.lastServerTime;
      // Seguir rápido los intervalos largos y olvidarlos despacio
      this.interval = gap > this.interval ? this.interval + (gap - this.interval) * 0.3 : this.interval + (gap - this.interval) * 0.02;
    }
    this.lastServerTime = serverTime;

    const lateness = sample - this.offset;
    this.jitter = lateness > this.jitter ? this.jitter + (lateness - this.jitter) * 0.5 : this.jitter * 0.995;
  }

  targetDelay() {
    const d = this.interval + this.jitter + 20;
    return Math.max(MIN_INTERP_DELAY_MS, Math.min(MAX_INTERP_DELAY_MS, d));
  }

  serverNow(localNow) {
    return this.offset === null ? null : localNow - this.offset;
  }

  renderTime(localNow, fixedDelay) {
    const now = this.serverNow(localNow);
    if (now === null) return null;
    if (fixedDelay !== undefined) return now - fixedDelay;
    const elapsed = this.lastRenderLocal === null ? 0 : Math.max(0, localNow - this.lastRenderLocal);
    this.lastRenderLocal = localNow;
    const target = this.targetDelay();
    const maxStep = elapsed * DELAY_SLEW;
    this.delay += Math.max(-maxStep, Math.min(maxStep, target - this.delay));
    return now - this.delay;
  }

  reset() {
    this.offset = null;
    this.lastServerTime = null;
    this.lastRenderLocal = null;
  }
}

// Buffer circular de snapshots de una entidad. Cada snapshot guarda posición, orientación y
// una referencia a los datos completos (para estados discretos como animación o arma).
export class SnapshotBuffer {
  constructor() {
    this.items = [];
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this.items.push({ t: 0, x: 0, y: 0, z: 0, yaw: 0, data: null });
    }
    this.count = 0;
    this.head = 0; // índice del más reciente
  }

  push(t, x, y, z, yaw, data = null) {
    if (this.count > 0 && t <= this.items[this.head].t) {
      // Snapshot repetido o fuera de orden: actualizar el más reciente solo si es el mismo instante
      if (t === this.items[this.head].t) {
        const s = this.items[this.head];
        s.x = x; s.y = y; s.z = z; s.yaw = yaw; s.data = data;
      }
      return;
    }
    this.head = (this.head + 1) % BUFFER_SIZE;
    const s = this.items[this.head];
    s.t = t; s.x = x; s.y = y; s.z = z; s.yaw = yaw; s.data = data;
    this.count = Math.min(BUFFER_SIZE, this.count + 1);
  }

  // i = 0 es el más reciente
  at(i) {
    return this.items[(this.head - i + BUFFER_SIZE) % BUFFER_SIZE];
  }

  latest() {
    return this.count > 0 ? this.at(0) : null;
  }

  clear() {
    this.count = 0;
  }

  // Escribe en `out` ({x, y, z, yaw, data, teleported}) el estado en renderTime.
  sample(renderTime, out) {
    if (this.count === 0) return false;
    const newest = this.at(0);

    if (renderTime === null || this.count === 1) {
      copyInto(out, newest, false);
      return true;
    }

    if (renderTime >= newest.t) {
      // Sin snapshot posterior: prolongar brevemente con la última velocidad conocida
      const prev = this.at(1);
      const span = newest.t - prev.t;
      const ahead = Math.min(renderTime - newest.t, MAX_EXTRAPOLATION_MS);
      const jump = Math.hypot(newest.x - prev.x, newest.z - prev.z);
      if (span <= 0 || jump > TELEPORT_DISTANCE) {
        copyInto(out, newest, false);
        return true;
      }
      const k = ahead / span;
      out.x = newest.x + (newest.x - prev.x) * k;
      out.y = newest.y + (newest.y - prev.y) * k;
      out.z = newest.z + (newest.z - prev.z) * k;
      out.yaw = newest.yaw;
      out.data = newest.data;
      out.teleported = false;
      return true;
    }

    for (let i = 1; i < this.count; i++) {
      const older = this.at(i);
      if (older.t <= renderTime) {
        const newer = this.at(i - 1);
        const jump = Math.hypot(newer.x - older.x, newer.z - older.z);
        if (jump > TELEPORT_DISTANCE) {
          copyInto(out, older, true);
          return true;
        }
        const t = (renderTime - older.t) / (newer.t - older.t);
        out.x = older.x + (newer.x - older.x) * t;
        out.y = older.y + (newer.y - older.y) * t;
        out.z = older.z + (newer.z - older.z) * t;
        out.yaw = lerpAngle(older.yaw, newer.yaw, t);
        out.data = older.data;
        out.teleported = false;
        return true;
      }
    }

    // renderTime anterior a todo lo guardado: usar el más antiguo
    copyInto(out, this.at(this.count - 1), false);
    return true;
  }
}

function copyInto(out, s, teleported) {
  out.x = s.x;
  out.y = s.y;
  out.z = s.z;
  out.yaw = s.yaw;
  out.data = s.data;
  out.teleported = teleported;
}

export function createSampleOut() {
  return { x: 0, y: 0, z: 0, yaw: 0, data: null, teleported: false };
}
