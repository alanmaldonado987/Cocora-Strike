// server/room/interactables.js
// Puertas y ventanas del mapa: estado, interacción, daño y serialización.
// Métodos mezclados en GameRoom.prototype (usan `this` como la sala).

import { BOT_AI_CONFIG, GAME_PHASE, PLAYER_STATE } from '../../shared/mapData.js';
import { S2C } from '../../shared/protocol.js';

const _doorSpatialQueryBuf = [];

export const interactablesMethods = {
  /**
   * Abre puertas cerradas cercanas a una entidad consultando únicamente la grilla espacial
   * (filtrando colisionadores con tag === 'door') en lugar de iterar todas las puertas del mapa.
   */
  openNearbyClosedDoorsForEntity(
    entity,
    horizRadius = BOT_AI_CONFIG.doorSenseRadius,
    vertLimit = BOT_AI_CONFIG.doorSenseVertical
  ) {
    if (!this.map?.colliders) return 0;
    const nearby = this.map.colliders.queryNear(entity.x, entity.z, horizRadius, _doorSpatialQueryBuf);
    let opened = 0;
    for (let i = 0; i < nearby.length; i++) {
      const col = nearby[i];
      if (col.tag !== 'door' || col.enabled === false) continue;
      const doorId = col.meta?.doorId;
      if (!doorId) continue;
      const door = this.doorsById.get(doorId);
      if (!door || door.destroyed || door.isOpen) continue;
      if (Math.hypot(door.x - entity.x, door.z - entity.z) < horizRadius && Math.abs(door.y - entity.y) < vertLimit) {
        door.isOpen = true;
        if (door.collider) door.collider.enabled = false;
        opened++;
        this.io.emit(S2C.DOOR_STATE_CHANGED, {
          doorId: door.id,
          isOpen: true,
          hp: door.hp,
          destroyed: false,
          x: door.x,
          y: door.y,
          z: door.z
        });
      }
    }
    return opened;
  },

  syncMapInteractiveIndex() {
    this.doorsById.clear();
    this.windowsById.clear();
    for (const d of this.map.doors || []) {
      this.doorsById.set(d.id, d);
    }
    for (const w of this.map.windows || []) {
      this.windowsById.set(w.id, w);
    }
  },

  serializeDoors() {
    return (this.map.doors || []).map((d) => ({
      id: d.id,
      isOpen: Boolean(d.isOpen),
      hp: d.hp,
      destroyed: Boolean(d.destroyed)
    }));
  },

  serializeBrokenWindows() {
    return (this.map.windows || []).filter((w) => w.broken).map((w) => w.id);
  },

  handleInteractDoor(socketId, doorId) {
    if (this.phase !== GAME_PHASE.PLAYING) return;
    const p = this.players.get(socketId);
    if (!p || !p.alive || p.state !== PLAYER_STATE.GROUND) return;
    const door = this.doorsById.get(doorId);
    if (!door || door.destroyed) return;
    if (Math.hypot(door.x - p.x, door.z - p.z) > 3.8 || Math.abs(door.y - p.y) > 2.4) return;

    door.isOpen = !door.isOpen;
    if (door.collider) door.collider.enabled = !door.isOpen;
    this.io.emit(S2C.DOOR_STATE_CHANGED, {
      doorId: door.id,
      isOpen: door.isOpen,
      hp: door.hp,
      destroyed: false,
      x: door.x,
      y: door.y,
      z: door.z
    });
  },

  handleBreakWindow(socketId, windowId) {
    if (this.phase !== GAME_PHASE.PLAYING) return;
    const p = this.players.get(socketId);
    if (!p || !p.alive) return;
    const win = this.windowsById.get(windowId);
    if (!win || win.broken) return;
    if (Math.hypot(win.x - p.x, win.z - p.z) > 4.2) return;
    this.shatterWindow(win);
  },

  shatterWindow(win) {
    if (!win || win.broken) return;
    win.broken = true;
    if (win.collider) win.collider.enabled = false;
    this.io.emit(S2C.WINDOW_BROKEN, {
      windowId: win.id,
      x: win.x,
      y: win.y + win.height * 0.5,
      z: win.z
    });
  },

  damageDoor(door, amount) {
    if (!door || door.destroyed) return;
    door.hp = Math.max(0, door.hp - amount);
    if (door.hp <= 0) {
      door.destroyed = true;
      door.isOpen = true;
      if (door.collider) door.collider.enabled = false;
    }
    this.io.emit(S2C.DOOR_STATE_CHANGED, {
      doorId: door.id,
      isOpen: door.isOpen,
      hp: door.hp,
      destroyed: door.destroyed,
      x: door.x,
      y: door.y + door.height * 0.5,
      z: door.z
    });
  }
};
