// client/js/network.js
// Cliente Socket.IO optimizado (desacopla ticks del servidor a 20 Hz del renderizado a 60+ FPS):
// - Interpolación de snapshots con retardo fijo (interpolation.js): los jugadores remotos se dibujan
//   ~100 ms en el pasado entre los dos snapshots del servidor que rodean ese instante, sin tirones
// - Liberación completa de memoria WebGL (avatar.dispose) al desconectarse o reiniciar partida
// - Soporte para animación canalizada de curación (2.0s) con partículas verdes ascendentes

import { createVoxelAvatar } from './player.js';
import { ServerClock, SnapshotBuffer, createSampleOut } from './interpolation.js';

const _sample = createSampleOut();

export class NetworkManager {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.socket = window.io();
    this.selfId = null;

    this.remotePlayers = new Map();
    this.serverClock = new ServerClock();
    this.lastRenderTime = null;
    this.lastSendTime = 0;
    this._remoteEntityBuffer = [];

    this.registerSocketEvents();
  }

  registerSocketEvents() {
    const s = this.socket;

    s.on('network_info', (data) => {
      this.callbacks.onNetworkInfo?.(data);
    });

    s.on('lobby_joined', (data) => {
      this.selfId = data.selfId;
      this.callbacks.onLobbyJoined?.(data);
    });

    s.on('lobby_state', (data) => {
      this.callbacks.onLobbyState?.(data);
    });

    s.on('game_started', (data) => {
      this.clearRemoteAvatars();
      this.syncSnapshotPlayers(data.players || {});
      this.callbacks.onGameStarted?.(data);
    });

    s.on('joined_midgame', (data) => {
      this.selfId = data.selfId;
      this.clearRemoteAvatars();
      this.callbacks.onJoinedMidgame?.(data);
    });

    s.on('world_tick', (snapshot) => {
      this.serverClock.observe(snapshot.t, performance.now());
      this.syncSnapshotPlayers(snapshot.players || {}, snapshot.t);
      this.callbacks.onWorldTick?.(snapshot);
    });

    s.on('player_slid', (data) => {
      this.callbacks.onPlayerSlid?.(data);
    });

    s.on('loot_picked', (data) => {
      this.callbacks.onLootPicked?.(data);
    });

    s.on('loot_spawned', (data) => {
      this.callbacks.onLootSpawned?.(data);
    });

    s.on('door_state_changed', (data) => {
      this.callbacks.onDoorStateChanged?.(data);
    });

    s.on('window_broken', (data) => {
      this.callbacks.onWindowBroken?.(data);
    });

    s.on('shot_fired', (data) => {
      const shooterEntry = this.remotePlayers.get(data.shooterId);
      if (shooterEntry) {
        shooterEntry.avatar.triggerFireEffect();
      }
      this.callbacks.onShotFired?.(data);
    });

    s.on('player_damaged', (data) => {
      const targetEntry = this.remotePlayers.get(data.targetId);
      if (targetEntry) {
        targetEntry.hp = data.hp;
        targetEntry.maxHp = data.maxHp || 100;
        targetEntry.avatar.setHealth(targetEntry.hp, targetEntry.maxHp);
        targetEntry.avatar.triggerDamageFlash();
      }
      this.callbacks.onPlayerDamaged?.(data);
    });

    s.on('player_eliminated', (data) => {
      this.callbacks.onPlayerEliminated?.(data);
    });

    s.on('wildlife_hit', (data) => {
      this.callbacks.onWildlifeHit?.(data);
    });

    s.on('wildlife_aggro', (data) => {
      this.callbacks.onWildlifeAggro?.(data);
    });

    s.on('wildlife_attack', (data) => {
      this.callbacks.onWildlifeAttack?.(data);
    });

    s.on('wildlife_killed', (data) => {
      this.callbacks.onWildlifeKilled?.(data);
    });

    s.on('reload_complete', (data) => {
      this.callbacks.onReloadComplete?.(data);
    });

    s.on('heal_started', (data) => {
      this.callbacks.onHealStarted?.(data);
    });

    s.on('heal_cancelled', (data) => {
      this.callbacks.onHealCancelled?.(data);
    });

    s.on('player_healed', (data) => {
      this.callbacks.onPlayerHealed?.(data);
    });

    s.on('game_over', (data) => {
      this.callbacks.onGameOver?.(data);
    });

    s.on('returned_to_lobby', () => {
      this.clearRemoteAvatars();
      this.callbacks.onReturnedToLobby?.();
    });
  }

  syncSnapshotPlayers(playersObj, serverTime) {
    const activeIds = new Set(Object.keys(playersObj));
    // Snapshots sin hora (p. ej. game_started) se fechan con la hora estimada del servidor
    const hasTime = Number.isFinite(serverTime);
    const t = hasTime ? serverTime : (this.serverClock.serverNow(performance.now()) ?? 0);

    for (const [id, entry] of this.remotePlayers.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.avatar.root);
        entry.avatar.dispose?.();
        this.remotePlayers.delete(id);
      }
    }

    for (const [id, pData] of Object.entries(playersObj)) {
      if (id === this.selfId) continue;

      let entry = this.remotePlayers.get(id);
      if (!entry) {
        const avatar = createVoxelAvatar(pData.name, pData.colorIdx, false);
        avatar.root.position.set(pData.x, pData.y, pData.z);
        avatar.root.rotation.set(0, pData.yaw || 0, 0);
        avatar.setHealth(pData.hp ?? 100, pData.maxHp ?? 100);
        this.scene.add(avatar.root);
        entry = {
          id,
          name: pData.name,
          avatar,
          hp: pData.hp ?? 100,
          maxHp: pData.maxHp ?? 100,
          seatIndex: pData.seatIndex || 0,
          buffer: new SnapshotBuffer(),
          yaw: pData.yaw || 0,
          pitch: pData.pitch || 0,
          animWalk: pData.animWalk || 0,
          moveMode: pData.moveMode || 'idle',
          isSliding: Boolean(pData.isSliding),
          isCrouching: Boolean(pData.isCrouching),
          isHealing: Boolean(pData.isHealing),
          dustAccum: 0,
          healPartAccum: 0,
          state: pData.state,
          equipped: pData.equipped,
          alive: pData.alive,
          entityProxy: { x: pData.x, y: pData.y, z: pData.z, alive: true, state: 'ground' }
        };
        this.remotePlayers.set(id, entry);
      } else {
        // Datos que deben reflejarse al instante (vida, muerte, arma, asiento)
        entry.seatIndex = pData.seatIndex ?? entry.seatIndex;
        entry.hp = pData.hp ?? entry.hp;
        entry.maxHp = pData.maxHp ?? entry.maxHp;
        entry.avatar.setHealth(entry.hp, entry.maxHp);
        entry.equipped = pData.equipped;
        entry.alive = pData.alive;
      }

      if (!hasTime) entry.buffer.clear();
      entry.buffer.push(t, pData.x, pData.y, pData.z, pData.yaw || 0, pData);
    }
  }

  // Copia el estado de animación del snapshot interpolado, para que pose y posición coincidan
  applySampledPose(entry, data) {
    if (!data) return;
    entry.pitch = data.pitch || 0;
    entry.animWalk = data.animWalk || 0;
    entry.moveMode = data.moveMode || 'idle';
    entry.isSliding = Boolean(data.isSliding);
    entry.isCrouching = Boolean(data.isCrouching);
    entry.isHealing = Boolean(data.isHealing);
    entry.state = data.state;
  }

  updateInterpolation(dt, worldInstance = null, planeState = null, mapData = null) {
    const renderTime = this.serverClock.renderTime(performance.now());
    this.lastRenderTime = renderTime; // se envía con cada disparo (compensación de latencia)

    for (const entry of this.remotePlayers.values()) {
      const hasSample = entry.buffer.sample(renderTime, _sample);
      if (hasSample) this.applySampledPose(entry, _sample.data);

      if (!entry.alive || entry.state === 'lobby') {
        entry.avatar.root.visible = false;
        continue;
      }

      if (entry.state === 'plane') {
        if (planeState && planeState.active && worldInstance) {
          entry.avatar.root.visible = true;
          const seat = worldInstance.getCabinSeatTransform(entry.seatIndex);
          entry.avatar.root.position.set(seat.x, seat.y, seat.z);
          entry.avatar.root.rotation.set(seat.pitch || 0, seat.yaw, seat.roll || 0);
          entry.avatar.setWeapon(entry.equipped);
          entry.avatar.animate(0, 'plane', entry.equipped, 0, 'seated', dt, false, false, false);
        } else {
          entry.avatar.root.visible = false;
        }
        continue;
      }

      if (!hasSample) continue;
      // Posición y orientación interpoladas entre los snapshots que rodean renderTime
      entry.yaw = _sample.yaw;
      entry.avatar.root.position.set(_sample.x, _sample.y, _sample.z);

      if (mapData) {
        const minG = mapData.getGroundHeightAt(_sample.x, _sample.z, _sample.y);
        if (entry.avatar.root.position.y < minG) {
          entry.avatar.root.position.y = minG;
        }
      }

      entry.avatar.root.visible = true;
      entry.avatar.root.rotation.set(0, entry.yaw, 0);
      entry.avatar.setWeapon(entry.equipped);
      entry.avatar.animate(
        entry.animWalk,
        entry.state,
        entry.equipped,
        entry.pitch,
        entry.moveMode,
        dt,
        entry.isSliding,
        entry.isCrouching,
        entry.isHealing
      );

      if (entry.isSliding && worldInstance) {
        entry.dustAccum += dt;
        if (entry.dustAccum >= 0.08) {
          entry.dustAccum = 0;
          worldInstance.spawnSlideDust(
            entry.avatar.root.position.x,
            entry.avatar.root.position.y,
            entry.avatar.root.position.z,
            entry.yaw
          );
        }
      }

      if (entry.isHealing && worldInstance) {
        entry.healPartAccum += dt;
        if (entry.healPartAccum >= 0.10) {
          entry.healPartAccum = 0;
          worldInstance.spawnHealParticles(
            entry.avatar.root.position.x,
            entry.avatar.root.position.y,
            entry.avatar.root.position.z
          );
        }
      }
    }
  }

  // Reutiliza buffer preasignado (cero arrays u objetos nuevos en cada frame de animate)
  getRemoteEntityList() {
    this._remoteEntityBuffer.length = 0;
    for (const entry of this.remotePlayers.values()) {
      if (entry.alive && entry.state === 'ground') {
        entry.entityProxy.x = entry.avatar.root.position.x;
        entry.entityProxy.y = entry.avatar.root.position.y;
        entry.entityProxy.z = entry.avatar.root.position.z;
        this._remoteEntityBuffer.push(entry.entityProxy);
      }
    }
    return this._remoteEntityBuffer;
  }

  clearRemoteAvatars() {
    for (const entry of this.remotePlayers.values()) {
      this.scene.remove(entry.avatar.root);
      entry.avatar.dispose?.();
    }
    this.remotePlayers.clear();
  }

  sendPlayerState(localPlayer) {
    const now = performance.now();
    if (now - this.lastSendTime < 45) return; // Sincronizado con 20 Hz del servidor
    this.lastSendTime = now;

    if (!localPlayer.active || !localPlayer.alive) return;

    this.socket.emit('player_input', {
      x: localPlayer.x,
      y: localPlayer.y,
      z: localPlayer.z,
      yaw: localPlayer.yaw,
      pitch: localPlayer.pitch,
      onGround: localPlayer.onGround,
      state: localPlayer.state,
      animWalk: localPlayer.walkPhase,
      moveMode: localPlayer.moveMode,
      isSliding: localPlayer.isSliding,
      isCrouching: localPlayer.isCrouching,
      isVaulting: Boolean(localPlayer.isVaulting)
    });
  }

  sendSlideState(active) {
    this.socket.emit('player_slide', { active });
  }

  joinLobby(name) {
    this.socket.emit('join_lobby', { name });
  }

  configureBots(payload) {
    this.socket.emit('configure_bots', payload);
  }

  addBot() {
    this.socket.emit('add_bot');
  }

  clearBots() {
    this.socket.emit('clear_bots');
  }

  startGame(options = {}) {
    if (typeof options === 'boolean') {
      this.socket.emit('start_game', { autoFillBots: options });
    } else {
      this.socket.emit('start_game', options);
    }
  }

  requestJump() {
    this.socket.emit('player_jump');
  }

  requestShoot(payload) {
    // viewTime: instante del servidor que se veía en pantalla al disparar
    this.socket.emit('player_shoot', { ...payload, viewTime: this.lastRenderTime ?? undefined });
  }

  requestReload() {
    this.socket.emit('player_reload');
  }

  requestSwitchWeapon(weapon) {
    this.socket.emit('player_switch_weapon', { weapon });
  }

  requestHeal(itemType = 'medkit') {
    this.socket.emit('player_heal', { itemType });
  }

  cancelHeal() {
    this.socket.emit('player_cancel_heal');
  }

  requestPickup(lootId) {
    if (lootId) this.socket.emit('player_pickup', { lootId });
  }

  requestInteractDoor(doorId) {
    if (doorId) this.socket.emit('player_interact_door', { doorId });
  }

  requestBreakWindow(windowId) {
    if (windowId) this.socket.emit('player_break_window', { windowId });
  }

  resetLobby() {
    this.socket.emit('reset_lobby');
  }
}
