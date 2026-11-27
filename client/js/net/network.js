// client/js/net/network.js
// Cliente Socket.IO optimizado (desacopla ticks del servidor a 20 Hz del renderizado a 60+ FPS):
// - Interpolación de snapshots con retardo fijo (interpolation.js): los jugadores remotos se dibujan
//   ~100 ms en el pasado entre los dos snapshots del servidor que rodean ese instante, sin tirones
// - Liberación completa de memoria WebGL (avatar.dispose) al desconectarse o reiniciar partida
// - Soporte para animación canalizada de curación (2.0s) con partículas verdes ascendentes

import {
  CABIN_DISEMBARK_MS,
  ANIMATION_FEEL_CONFIG,
  MOVE_MODE,
  PLAYER_STATE
} from '/shared/mapData.js';
import { createVoxelAvatar } from '../player/avatar.js';
import { ServerClock, SnapshotBuffer, createSampleOut } from './interpolation.js';
import { C2S, S2C } from '/shared/protocol.js';
import { WorldTickDecoder } from '/shared/snapshotCodec.js';

const _sample = createSampleOut();

export class NetworkManager {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.socket = window.io();
    this.selfId = null;

    this.remotePlayers = new Map();
    this.serverClock = new ServerClock();
    this.tickDecoder = new WorldTickDecoder();
    this.lastWorldTick = null; // último snapshot decodificado (útil para depuración y E2E)
    this.lastRenderTime = null;
    this.lastSendTime = 0;
    this._remoteEntityBuffer = [];

    this.registerSocketEvents();
  }

  registerSocketEvents() {
    const s = this.socket;

    s.on(S2C.NETWORK_INFO, (data) => {
      this.callbacks.onNetworkInfo?.(data);
    });

    s.on(S2C.LOBBY_JOINED, (data) => {
      this.selfId = data.selfId;
      this.callbacks.onLobbyJoined?.(data);
    });

    s.on(S2C.LOBBY_STATE, (data) => {
      this.callbacks.onLobbyState?.(data);
    });

    s.on(S2C.GAME_STARTED, (data) => {
      this.tickDecoder.seedPlayers(data.players);
      this.clearRemoteAvatars();
      this.syncSnapshotPlayers(data.players || {});
      this.callbacks.onGameStarted?.(data);
    });

    s.on(S2C.JOINED_MIDGAME, (data) => {
      this.selfId = data.selfId;
      this.clearRemoteAvatars();
      this.callbacks.onJoinedMidgame?.(data);
    });

    s.on(S2C.WORLD_TICK, (raw) => {
      // Mensaje compacto -> snapshot completo de siempre (ver shared/snapshotCodec.js)
      const snapshot = this.tickDecoder.decode(raw);
      this.lastWorldTick = snapshot;
      this.serverClock.observe(snapshot.t, performance.now());
      this.syncSnapshotPlayers(snapshot.players || {}, snapshot.t);
      this.callbacks.onWorldTick?.(snapshot);
    });

    s.on(S2C.PLAYER_SLID, (data) => {
      this.callbacks.onPlayerSlid?.(data);
    });

    s.on(S2C.PLAYER_CABIN_DISEMBARK, (data) => {
      const entry = this.remotePlayers.get(data?.playerId);
      if (entry) {
        entry.cabinDisembarking = true;
        entry.localCabinProg = Math.max(entry.localCabinProg || 0.01, 0.01);
      }
      this.callbacks.onPlayerCabinDisembark?.(data);
    });

    s.on(S2C.LOOT_PICKED, (data) => {
      this.callbacks.onLootPicked?.(data);
    });

    s.on(S2C.LOOT_SPAWNED, (data) => {
      this.callbacks.onLootSpawned?.(data);
    });

    s.on(S2C.DOOR_STATE_CHANGED, (data) => {
      this.callbacks.onDoorStateChanged?.(data);
    });

    s.on(S2C.WINDOW_BROKEN, (data) => {
      this.callbacks.onWindowBroken?.(data);
    });

    s.on(S2C.SHOT_FIRED, (data) => {
      const shooterEntry = this.remotePlayers.get(data.shooterId);
      if (shooterEntry) {
        shooterEntry.avatar.triggerFireEffect();
      }
      this.callbacks.onShotFired?.(data);
    });

    s.on(S2C.PLAYER_DAMAGED, (data) => {
      const targetEntry = this.remotePlayers.get(data.targetId);
      if (targetEntry) {
        targetEntry.hp = data.hp;
        targetEntry.maxHp = data.maxHp || 100;
        targetEntry.avatar.setHealth(targetEntry.hp, targetEntry.maxHp);
        targetEntry.avatar.triggerDamageFlash();
      }
      this.callbacks.onPlayerDamaged?.(data);
    });

    s.on(S2C.PLAYER_ELIMINATED, (data) => {
      this.callbacks.onPlayerEliminated?.(data);
    });

    s.on(S2C.WILDLIFE_HIT, (data) => {
      this.callbacks.onWildlifeHit?.(data);
    });

    s.on(S2C.WILDLIFE_AGGRO, (data) => {
      this.callbacks.onWildlifeAggro?.(data);
    });

    s.on(S2C.WILDLIFE_ATTACK, (data) => {
      this.callbacks.onWildlifeAttack?.(data);
    });

    s.on(S2C.WILDLIFE_KILLED, (data) => {
      this.callbacks.onWildlifeKilled?.(data);
    });

    s.on(S2C.RELOAD_COMPLETE, (data) => {
      this.callbacks.onReloadComplete?.(data);
    });

    s.on(S2C.HEAL_STARTED, (data) => {
      this.callbacks.onHealStarted?.(data);
    });

    s.on(S2C.HEAL_CANCELLED, (data) => {
      this.callbacks.onHealCancelled?.(data);
    });

    s.on(S2C.PLAYER_HEALED, (data) => {
      this.callbacks.onPlayerHealed?.(data);
    });

    s.on(S2C.GAME_OVER, (data) => {
      this.callbacks.onGameOver?.(data);
    });

    s.on(S2C.RETURNED_TO_LOBBY, () => {
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
        entry.avatar.root.removeFromParent();
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
          cabinDisembarking: (pData.cabinProgress || 0) > 0,
          serverCabinProg: pData.cabinProgress || 0,
          localCabinProg: pData.cabinProgress || 0,
          buffer: new SnapshotBuffer(),
          yaw: pData.yaw || 0,
          pitch: pData.pitch || 0,
          animWalk: pData.animWalk || 0,
          localWalkPhase: pData.animWalk || 0,
          horizSpeed: 0,
          moveMode: pData.moveMode || MOVE_MODE.IDLE,
          isSliding: Boolean(pData.isSliding),
          isCrouching: Boolean(pData.isCrouching),
          isSwimming: Boolean(pData.isSwimming),
          isHealing: Boolean(pData.isHealing),
          dustAccum: 0,
          healPartAccum: 0,
          waterRippleAccum: 0,
          state: pData.state,
          equipped: pData.equipped,
          alive: pData.alive,
          entityProxy: { x: pData.x, y: pData.y, z: pData.z, alive: true, state: PLAYER_STATE.GROUND }
        };
        this.remotePlayers.set(id, entry);
      } else {
        // Datos que deben reflejarse al instante (vida, muerte, arma, asiento)
        entry.seatIndex = pData.seatIndex ?? entry.seatIndex;
        entry.serverCabinProg = pData.cabinProgress || 0;
        if (entry.serverCabinProg > 0) entry.cabinDisembarking = true;
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
    entry.moveMode = data.moveMode || MOVE_MODE.IDLE;
    entry.isSliding = Boolean(data.isSliding);
    entry.isCrouching = Boolean(data.isCrouching);
    entry.isSwimming = Boolean(data.isSwimming);
    entry.isHealing = Boolean(data.isHealing);
    entry.state = data.state;
  }

  updateInterpolation(dt, worldInstance = null, planeState = null, mapData = null) {
    const renderTime = this.serverClock.renderTime(performance.now());
    this.lastRenderTime = renderTime; // se envía con cada disparo (compensación de latencia)

    // Desacoplamiento Simulación vs Renderizado: interpola posiciones y fases de animación de TODOS los
    // jugadores remotos y bots en cada fotograma sin ningún filtro de cámara o frustum (el GPU aplica frustumCulled).
    for (const entry of this.remotePlayers.values()) {
      const hasSample = entry.buffer.sample(renderTime, _sample);
      if (hasSample) this.applySampledPose(entry, _sample.data);

      if (!entry.alive || entry.state === PLAYER_STATE.LOBBY) {
        entry.avatar.root.visible = false;
        continue;
      }

      if (entry.state === PLAYER_STATE.PLANE) {
        if (planeState && planeState.active && worldInstance) {
          const bayGroup = worldInstance.getActiveCabinBayGroup();
          if (bayGroup && entry.avatar.root.parent !== bayGroup) {
            bayGroup.add(entry.avatar.root);
          }
          if (entry.cabinDisembarking) {
            entry.localCabinProg = Math.min(
              1,
              Math.max(entry.localCabinProg || 0, entry.serverCabinProg || 0) + dt / (CABIN_DISEMBARK_MS / 1000)
            );
          } else {
            entry.localCabinProg = 0;
          }
          const localPose = worldInstance.sampleCabinDisembarkLocalPose(entry.seatIndex, entry.localCabinProg);
          entry.avatar.root.visible = true;
          entry.avatar.root.position.set(localPose.x, localPose.y, localPose.z);
          entry.avatar.root.rotation.set(0, localPose.yaw, 0);
          entry.avatar.setWeapon(entry.equipped);
          const cabinMode = localPose.phase === 'sit' ? 'seated' : localPose.phase;
          entry.avatar.animate(localPose.walkCycle, 'plane', entry.equipped, 0, cabinMode, dt, false, false, false);
        } else {
          entry.avatar.root.visible = false;
        }
        continue;
      }

      // Al desacoplarse de la rampa hacia skydiving/ground, reanclar el avatar al espacio global de la escena
      entry.cabinDisembarking = false;
      entry.localCabinProg = 0;
      if (entry.avatar.root.parent !== this.scene) {
        this.scene.add(entry.avatar.root);
      }

      let horizSpeed = 0;
      let sampleVy = 0;
      if (hasSample) {
        // Posición, velocidad y orientación interpoladas entre los snapshots que rodean renderTime
        entry.yaw = _sample.yaw;
        entry.avatar.root.position.set(_sample.x, _sample.y, _sample.z);
        horizSpeed = Math.hypot(_sample.vx || 0, _sample.vz || 0);
        sampleVy = _sample.vy || 0;
        entry.horizSpeed = horizSpeed;
      }

      if (mapData) {
        const curX = entry.avatar.root.position.x;
        const curY = entry.avatar.root.position.y;
        const curZ = entry.avatar.root.position.z;
        const minG = mapData.getTerrainHeightAt
          ? mapData.getTerrainHeightAt(curX, curZ)
          : mapData.getGroundHeightAt(curX, curZ, curY);
        if (entry.avatar.root.position.y < minG) {
          entry.avatar.root.position.y = minG;
        }
      }

      entry.avatar.root.visible = true;
      entry.avatar.root.rotation.set(0, entry.yaw, 0);
      entry.avatar.setWeapon(entry.equipped);

      let effectiveMode =
        entry.isSwimming && entry.moveMode !== MOVE_MODE.SWIM && entry.moveMode !== MOVE_MODE.SWIM_FAST && entry.moveMode !== MOVE_MODE.SWIM_IDLE
          ? MOVE_MODE.SWIM
          : entry.moveMode;

      if (hasSample && entry.state === PLAYER_STATE.GROUND && !entry.isSwimming && !entry.isSliding && effectiveMode !== MOVE_MODE.VAULT) {
        if (Math.abs(sampleVy) > 2.4 && _sample.data?.onGround === false) {
          effectiveMode = sampleVy > 0.5 ? MOVE_MODE.JUMP : MOVE_MODE.FALL;
        } else if (horizSpeed >= ANIMATION_FEEL_CONFIG.sprintWeightThreshold) {
          effectiveMode = entry.isCrouching ? MOVE_MODE.CROUCH_WALK : MOVE_MODE.SPRINT;
        } else if (horizSpeed >= ANIMATION_FEEL_CONFIG.minMoveSpeedForWalk) {
          effectiveMode = entry.isCrouching ? MOVE_MODE.CROUCH_WALK : MOVE_MODE.WALK;
        } else if (horizSpeed < 0.12 && (effectiveMode === MOVE_MODE.WALK || effectiveMode === MOVE_MODE.SPRINT || effectiveMode === MOVE_MODE.CROUCH_WALK)) {
          effectiveMode = entry.isCrouching ? MOVE_MODE.CROUCH_IDLE : MOVE_MODE.IDLE;
        }
      }

      // Integrar y adelantar ligeramente la fase de zancada según el vector de velocidad real del avatar remoto
      let animPhaseToRender = entry.animWalk;
      if (hasSample) {
        const stepRate =
          effectiveMode === MOVE_MODE.SWIM || effectiveMode === MOVE_MODE.SWIM_FAST
            ? (effectiveMode === MOVE_MODE.SWIM_FAST ? 7.5 : 5.2)
            : effectiveMode === MOVE_MODE.SPRINT
            ? 13.0 * Math.max(0.65, Math.min(1.25, horizSpeed / 8.2))
            : effectiveMode === MOVE_MODE.CROUCH_WALK
            ? 7.0 * Math.max(0.55, Math.min(1.25, horizSpeed / 3.4))
            : horizSpeed >= ANIMATION_FEEL_CONFIG.minMoveSpeedForWalk
            ? 9.5 * Math.max(0.50, Math.min(1.25, horizSpeed / 5.5))
            : 0;
        if (_sample.teleported) {
          entry.localWalkPhase = entry.animWalk || 0;
        } else if (stepRate > 0) {
          entry.localWalkPhase = (entry.localWalkPhase || entry.animWalk || 0) + dt * stepRate;
        }
        const basePhase = stepRate > 0 ? entry.localWalkPhase : entry.animWalk;
        animPhaseToRender = basePhase + stepRate * ANIMATION_FEEL_CONFIG.remoteAnimLeadSec;
      }

      entry.avatar.animate(
        animPhaseToRender,
        entry.state,
        entry.equipped,
        entry.pitch,
        effectiveMode,
        dt,
        entry.isSliding,
        entry.isCrouching,
        entry.isHealing,
        horizSpeed
      );

      if ((entry.isSwimming || effectiveMode === MOVE_MODE.SWIM || effectiveMode === MOVE_MODE.SWIM_FAST || effectiveMode === MOVE_MODE.SWIM_IDLE) && worldInstance) {
        const swimMoving = effectiveMode === MOVE_MODE.SWIM || effectiveMode === MOVE_MODE.SWIM_FAST;
        entry.waterRippleAccum += dt;
        if (entry.waterRippleAccum >= (swimMoving ? 0.14 : 0.34)) {
          entry.waterRippleAccum = 0;
          worldInstance.spawnWaterRipples?.(
            entry.avatar.root.position.x,
            entry.avatar.root.position.z,
            swimMoving,
            0.8
          );
        }
      }

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
      if (entry.alive && entry.state === PLAYER_STATE.GROUND) {
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
      entry.avatar.root.removeFromParent();
      entry.avatar.dispose?.();
    }
    this.remotePlayers.clear();
  }

  sendPlayerState(localPlayer) {
    const now = performance.now();
    if (now - this.lastSendTime < 45) return; // Sincronizado con ~22 Hz de red
    this.lastSendTime = now;

    if (!localPlayer.active || !localPlayer.alive) return;

    const steps = localPlayer.flushPendingNetworkSteps?.();
    if (localPlayer.state !== PLAYER_STATE.PLANE && (!steps || steps.length === 0)) return;

    this.socket.emit(C2S.PLAYER_INPUT, {
      yaw: Math.round(localPlayer.yaw * 10000) / 10000,
      pitch: Math.round(localPlayer.pitch * 10000) / 10000,
      steps: steps && steps.length > 0 ? steps : undefined
    });
  }

  sendSlideState(active) {
    this.socket.emit(C2S.PLAYER_SLIDE, { active });
  }

  joinLobby(name) {
    this.socket.emit(C2S.JOIN_LOBBY, { name });
  }

  configureBots(payload) {
    this.socket.emit(C2S.CONFIGURE_BOTS, payload);
  }

  addBot() {
    this.socket.emit(C2S.ADD_BOT);
  }

  clearBots() {
    this.socket.emit(C2S.CLEAR_BOTS);
  }

  startGame(options = {}) {
    if (typeof options === 'boolean') {
      this.socket.emit(C2S.START_GAME, { autoFillBots: options });
    } else {
      this.socket.emit(C2S.START_GAME, options);
    }
  }

  requestJump() {
    this.socket.emit(C2S.PLAYER_JUMP);
  }

  requestShoot(payload) {
    // viewTime: instante del servidor que se veía en pantalla al disparar
    this.socket.emit(C2S.PLAYER_SHOOT, { ...payload, viewTime: this.lastRenderTime ?? undefined });
  }

  requestReload() {
    this.socket.emit(C2S.PLAYER_RELOAD);
  }

  requestSwitchWeapon(weapon) {
    this.socket.emit(C2S.PLAYER_SWITCH_WEAPON, { weapon });
  }

  requestHeal(itemType = 'medkit') {
    this.socket.emit(C2S.PLAYER_HEAL, { itemType });
  }

  cancelHeal() {
    this.socket.emit(C2S.PLAYER_CANCEL_HEAL);
  }

  requestPickup(lootId) {
    if (lootId) this.socket.emit(C2S.PLAYER_PICKUP, { lootId });
  }

  requestInteractDoor(doorId) {
    if (doorId) this.socket.emit(C2S.PLAYER_INTERACT_DOOR, { doorId });
  }

  requestBreakWindow(windowId) {
    if (windowId) this.socket.emit(C2S.PLAYER_BREAK_WINDOW, { windowId });
  }

  resetLobby() {
    this.socket.emit(C2S.RESET_LOBBY);
  }
}
