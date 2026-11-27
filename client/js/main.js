// client/js/main.js
// Punto de entrada principal del Battle Royale Cel-Shaded 3D en escala métrica (1.80m):
// - Mapa de 640x640m con Monumento COCORA + Cóndor, Helicóptero Estrellado, Cráter, Puertas/Ventanas dinámicas,
// - Parkour Vaulting (W+Espacio), Looteo automático + contextual [E] y HUD exacto de referencia a 60 FPS.

import * as THREE from 'three';
import {
  DEFAULT_MAP_SEED,
  LOOT_TYPES,
  SWIM_CONFIG,
  CLIENT_PERF_CONFIG,
  AUDIO_CONFIG
} from '/shared/mapData.js';
import { SoundEngine } from './audio/audio.js';
import { VoxelWorld } from './world.js';
import { LocalPlayerController, requestRawPointerLock } from './player.js';
import { NetworkManager } from './net/network.js';
import {
  createHudCache,
  resetHudCache,
  createHudSensorState,
  invalidateHudSensors
} from './ui/hudUpdater.js';
import { queryUiElements } from './ui/elements.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { createKillfeed } from './ui/killfeed.js';
import { createLobby } from './ui/lobby.js';
import { preloadExternalModelAssets } from '/Modelos%203D/cocoraModels.js';

const container = document.getElementById('game-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.06, 1150);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const audio = new SoundEngine(AUDIO_CONFIG);
await preloadExternalModelAssets();
const world = new VoxelWorld(scene);
let currentMap = world.buildFromSeed(DEFAULT_MAP_SEED);

const localPlayer = new LocalPlayerController(scene, camera, renderer.domElement, audio);

// Prepara la GPU antes de que algo se vea, para que no se congele el juego la primera vez que se
// dibuja algo (al saltar del avión se congelaba ~0.8-1 s y al abrir el paracaídas ~0.2 s):
//  1) warmUpGpu(): compila los shaders de todos los objetos, también de los ocultos (paracaídas,
//     armas en primera persona). renderer.compile no sube geometría y tarda ~0.1-0.3 s.
//  2) queueMapWarmUp(): las geometrías del mapa (terreno, estructuras, vegetación), el botín y la
//     fauna, que desde la cabina del avión no se ven (o están ocultos por distancia), se suben a la
//     GPU de a pocas por fotograma: en cada fotograma unas cuantas piezas se dibujan aunque estén
//     fuera de cámara o lejos (quedan recortadas, no se ven). El ritmo se adapta al tiempo de cada
//     fotograma; en el avión suele terminar en ~1-2 s, en vez de un congelón al saltar.
// Ritmo adaptativo: si el fotograma va holgado se suben más piezas, si va justo menos
const WARM_MIN_PER_FRAME = 6;
const WARM_MAX_PER_FRAME = 48;
const WARM_TARGET_FRAME_MS = 14;
let warmPerFrame = 12;
let warmQueue = [];
const warmBatch = [];
const warmForcedVisible = [];

function warmUpGpu() {
  for (const [s, cam] of [[scene, camera], [localPlayer.fpRig?.scene, localPlayer.fpRig?.camera]]) {
    if (s && cam) renderer.compile(s, cam);
  }
}

const isDrawable = (o) => o.isMesh || o.isLine || o.isPoints || o.isSprite;

function queueMapWarmUp() {
  warmQueue = [];
  // Primero (al final de la cola) botín y fauna: son lo que aparece de golpe cerca del aterrizaje
  for (const group of [world.lootGroup, world.wildlifeGroup]) {
    group.traverse((o) => {
      if (isDrawable(o) && o.visible) warmQueue.push(o);
    });
  }
  for (const group of [world.terrainGroup, world.structuresGroup, world.foliageGroup]) {
    group.traverseVisible((o) => {
      if (isDrawable(o) && o.frustumCulled) warmQueue.push(o);
    });
  }
}

function beginWarmBatch() {
  warmBatch.length = 0;
  warmForcedVisible.length = 0;
  // warmBatch guarda pares [objeto, frustumCulled previo]
  while (warmBatch.length < warmPerFrame * 2 && warmQueue.length > 0) {
    const o = warmQueue.pop();
    if (!o.parent) continue; // ya no está en la escena
    // Dibujarlo este fotograma aunque esté oculto por distancia (p. ej. botín lejano)
    for (let a = o.parent; a && !a.isScene; a = a.parent) {
      if (!a.visible) {
        a.visible = true;
        warmForcedVisible.push(a);
      }
    }
    warmBatch.push(o, o.frustumCulled);
    o.frustumCulled = false;
  }
}

function adaptWarmRate(frameMs) {
  if (frameMs < WARM_TARGET_FRAME_MS * 0.75) warmPerFrame = Math.min(WARM_MAX_PER_FRAME, Math.ceil(warmPerFrame * 1.4));
  else if (frameMs > WARM_TARGET_FRAME_MS) warmPerFrame = Math.max(WARM_MIN_PER_FRAME, Math.floor(warmPerFrame * 0.7));
}

function endWarmBatch() {
  for (let i = 0; i < warmBatch.length; i += 2) warmBatch[i].frustumCulled = warmBatch[i + 1];
  for (let i = 0; i < warmForcedVisible.length; i++) warmForcedVisible[i].visible = false;
  warmBatch.length = 0;
  warmForcedVisible.length = 0;
}

// Modo depuración (?debug en la URL): expone objetos internos para medir rendimiento desde la consola.
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__cocoro = { THREE, renderer, scene, camera, world, localPlayer };
}

// Preparar la GPU con el mapa del lobby (los materiales y variantes de shader se reutilizan en la partida)
warmUpGpu();
queueMapWarmUp();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  localPlayer.onResize(camera.aspect);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const ui = queryUiElements();

let planeState = null;
let stormState = null;
let myNickname = '';
const hudCache = createHudCache();
const hudSensorState = createHudSensorState(CLIENT_PERF_CONFIG.hudSensorIntervalSec);
const getMap = () => currentMap;
const getPlaneState = () => planeState;
const getStormState = () => stormState;
const hud = createHud({ ui, localPlayer, camera, world, hudCache, hudSensorState, getMap, getPlaneState, getStormState });
const minimap = createMinimap({ canvas: ui.minimapCanvas, world, localPlayer, getStormState, getPlaneState });
minimap.bake(currentMap);
const killfeed = createKillfeed(ui.killfeed);
const lobby = createLobby({ ui, getSelfId: () => net.selfId });
const audioLookDir = new THREE.Vector3();

const net = new NetworkManager(scene, {
  onNetworkInfo(info) {
    lobby.showNetworkInfo(info);
  },

  onLobbyJoined() {
    lobby.showWaitingRoom();
  },

  onLobbyState(data) {
    lobby.renderLobbyState(data);
  },

  onGameStarted(data) {
    currentMap = world.buildFromSeed(data.seed);
    minimap.bake(currentMap);
    world.syncLoot(data.loot || []);
    world.syncDoors(data.doors || []);
    world.syncBrokenWindows(data.brokenWindows || []);
    world.syncWildlife(data.wildlife || []);
    planeState = data.plane;
    stormState = data.storm;
    world.resetPlaneTracking(planeState);

    const me = data.players?.[net.selfId];
    localPlayer.equipped = 'fists';
    localPlayer.isSliding = false;
    localPlayer.isVaulting = false;
    localPlayer.isCrouching = false;
    localPlayer.vx = 0;
    localPlayer.vz = 0;
    localPlayer.vy = 0;
    localPlayer.resetPredictionBuffers?.();
    localPlayer.planeViewMode = 'cabin_third';
    localPlayer.cameraMode = 'third';
    localPlayer.spawnAvatar(
      myNickname || 'Cafetero',
      me ? me.colorIdx : 0,
      me ? me.seatIndex : 0
    );
    localPlayer.setEquippedWeaponVisual('fists', true);
    localPlayer.active = true;
    localPlayer.alive = true;
    localPlayer.state = 'plane';
    localPlayer.hp = 100;
    localPlayer.breath = SWIM_CONFIG.maxBreath;
    localPlayer.isSwimming = false;
    localPlayer.lastDrownHp = 100;
    localPlayer.kills = 0;
    localPlayer.weapons = {
      fists: { unlocked: true, mag: 0 },
      pistol: { unlocked: false, mag: 0 },
      revolver: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      assault_rifle: { unlocked: false, mag: 0 },
      rifle: { unlocked: false, mag: 0 },
      sniper: { unlocked: false, mag: 0 }
    };
    localPlayer.reserveAmmo = me ? me.reserveAmmo : 24;
    localPlayer.medkits = me ? me.medkits : 0;
    localPlayer.bandages = me ? me.bandages : 1;
    localPlayer.isHealing = false;
    localPlayer.reloading = false;
    if (planeState) {
      localPlayer.x = planeState.x;
      localPlayer.y = planeState.y;
      localPlayer.z = planeState.z;
      localPlayer.yaw = planeState.yaw + Math.PI;
      localPlayer.pitch = -0.08;
    }

    resetHudCache(hudCache);
    invalidateHudSensors(hudSensorState);
    ui.lobbyScreen.classList.add('hidden');
    ui.gameoverScreen.classList.add('hidden');
    ui.sniperScopeOverlay?.classList.add('hidden');
    ui.targetHud?.classList.add('hidden');
    ui.hudScreen.classList.remove('hidden');
    ui.killfeed.innerHTML = '';
    requestRawPointerLock(renderer.domElement);
    warmUpGpu();
    queueMapWarmUp();
  },

  onJoinedMidgame(data) {
    currentMap = world.buildFromSeed(data.seed);
    minimap.bake(currentMap);
    world.syncLoot(data.loot || []);
    world.syncDoors(data.doors || []);
    world.syncBrokenWindows(data.brokenWindows || []);
    world.syncWildlife(data.wildlife || []);
    planeState = data.plane;
    stormState = data.storm;
    world.resetPlaneTracking(planeState);

    localPlayer.active = true;
    localPlayer.alive = false;
    localPlayer.state = 'spectating';
    localPlayer.x = 40;
    localPlayer.y = 52;
    localPlayer.z = 0;

    ui.lobbyScreen.classList.add('hidden');
    ui.hudScreen.classList.remove('hidden');
    hud.showToast('Partida en curso: modo espectador hasta la siguiente ronda');
    warmUpGpu();
    queueMapWarmUp();
  },

  onWorldTick(snapshot) {
    planeState = snapshot.plane;
    stormState = snapshot.storm;
    if (snapshot.wildlife) {
      world.syncWildlife(snapshot.wildlife, snapshot.t);
    }
    ui.aliveCount.textContent = String(snapshot.aliveCount ?? 0);

    const me = snapshot.players?.[net.selfId];
    if (me) {
      localPlayer.hp = me.hp;
      localPlayer.kills = me.kills;
      localPlayer.medkits = me.medkits;
      localPlayer.bandages = me.bandages ?? localPlayer.bandages;
      localPlayer.reserveAmmo = me.reserveAmmo;
      // Aliento autoritativo del servidor; sonido de burbujas mientras se ahoga
      if (typeof me.breath === 'number') {
        if (me.breath <= 0 && localPlayer.isSwimming && me.hp < localPlayer.lastDrownHp) audio.playDrowning?.();
        localPlayer.lastDrownHp = me.hp;
        localPlayer.breath = me.breath;
      }
      if (me.unlockedWeapons) {
        localPlayer.weapons.pistol.unlocked = Boolean(me.unlockedWeapons.pistol);
        localPlayer.weapons.revolver.unlocked = Boolean(me.unlockedWeapons.revolver);
        localPlayer.weapons.shotgun.unlocked = Boolean(me.unlockedWeapons.shotgun);
        localPlayer.weapons.smg.unlocked = Boolean(me.unlockedWeapons.smg);
        localPlayer.weapons.assault_rifle.unlocked = Boolean(me.unlockedWeapons.assault_rifle);
        localPlayer.weapons.rifle.unlocked = Boolean(me.unlockedWeapons.rifle);
        localPlayer.weapons.sniper.unlocked = Boolean(me.unlockedWeapons.sniper);
      }

      if (localPlayer.state === 'plane' && me.state !== 'plane') {
        localPlayer.resetPredictionBuffers?.();
        localPlayer.forceSyncExitFromServer(me);
      } else if (localPlayer.state !== 'plane' && me.state !== 'plane') {
        localPlayer.reconcileWithServer?.(me, currentMap);
      }
    }
  },

  onPlayerSlid(data) {
    if (data.playerId !== net.selfId) {
      const dist = Math.hypot(data.x - localPlayer.x, data.z - localPlayer.z);
      audio.playSlide(dist, data);
    }
  },

  onDoorStateChanged(data) {
    world.applyDoorState(data, true);
    invalidateHudSensors(hudSensorState);
    const dist = Math.hypot((data.x || 0) - localPlayer.x, (data.z || 0) - localPlayer.z);
    if (data.destroyed) {
      audio.playDoorBreak(dist, data);
    } else {
      audio.playDoorToggle(data.isOpen, dist, data);
    }
  },

  onWindowBroken(data) {
    world.applyWindowBroken(data, true);
    const dist = Math.hypot((data.x || 0) - localPlayer.x, (data.z || 0) - localPlayer.z);
    audio.playGlassBreak(dist, data);
  },

  onLootPicked(data) {
    world.removeLootItem(data.lootId);
    invalidateHudSensors(hudSensorState);
    if (data.playerId === net.selfId) {
      audio.playPickup();
      localPlayer.hp = data.hp;
      localPlayer.medkits = data.medkits;
      localPlayer.bandages = data.bandages ?? localPlayer.bandages;
      localPlayer.equipped = data.equipped;
      localPlayer.weapons = data.weapons;
      localPlayer.reserveAmmo = data.reserveAmmo;
      localPlayer.setEquippedWeaponVisual(localPlayer.equipped);
      const label = LOOT_TYPES[data.type]?.label || data.type;
      hud.showToast(`+ Recogido: ${label}`);
    }
  },

  onLootSpawned(data) {
    if (data.items) world.addLootItems(data.items);
  },

  onShotFired(data) {
    world.spawnShotFX(data.origin, data.endPoint, data.hitPlayer, data.extraEnds);

    const dist = Math.hypot(
      data.origin.x - localPlayer.x,
      data.origin.y - localPlayer.y,
      data.origin.z - localPlayer.z
    );
    const isSelf = data.shooterId === net.selfId;
    audio.playShot(data.weapon, isSelf ? 0 : dist, isSelf ? null : data.origin);

    if (data.shooterId === net.selfId && localPlayer.weapons[data.weapon]) {
      localPlayer.weapons[data.weapon].mag = data.mag;
      localPlayer.reserveAmmo = data.reserveAmmo;
    }
  },

  onPlayerDamaged(data) {
    if (data.attackerId === net.selfId && data.targetId !== net.selfId) {
      audio.playHitmarker(data.isHeadshot);
      hud.showHitmarker(data.isHeadshot);
      hud.spawnFloatingDamage(data.hitPoint, data.damage, data.isHeadshot);
      hud.showEnemyHealthFeedback(data.targetName, data.hp, data.maxHp || 100);
    }
    if (data.targetId === net.selfId) {
      localPlayer.hp = data.hp;
      if (data.source === 'fall') {
        audio.playFallImpact(data.damage);
        localPlayer.triggerCameraShake(Math.min(0.45, 0.14 + data.damage * 0.004), 0.38);
        hud.flashDamage('rgba(220, 38, 38, 0.78)');
        hud.showToast(`⚠️ ¡Impacto por caída! (-${data.damage} HP)`);
      } else {
        audio.playDamage();
        hud.flashDamage('rgba(239, 68, 68, 0.65)');
      }
    }
  },

  onWildlifeHit(data) {
    world.triggerWildlifeHitFlash(data.animalId, data.hp, data.maxHp);
    if (data.attackerId === net.selfId) {
      audio.playHitmarker(false);
      hud.showHitmarker(false);
      hud.spawnFloatingDamage(data.hitPoint, data.damage || 18, false);
      hud.showEnemyHealthFeedback(data.speciesName, data.hp, data.maxHp || 100);
    }
  },

  onWildlifeAggro(data) {
    const dist = Math.hypot(data.x - localPlayer.x, data.z - localPlayer.z);
    audio.playAnimalAlert(data.species, dist, data);
    if (data.targetId === net.selfId) {
      const icon = data.species === 'bear' ? '🐻' : '🐆';
      hud.showToast(`${icon} ¡${data.speciesName} enfurecido te persigue!`);
    }
  },

  onWildlifeAttack(data) {
    const dist = Math.hypot(data.x - localPlayer.x, data.z - localPlayer.z);
    audio.playAnimalAlert(data.species, dist, data);
  },

  onWildlifeKilled(data) {
    world.removeWildlife(data.animalId);
    if (data.killerId === net.selfId) {
      hud.showToast(`🌿 ${data.speciesName} abatido (soltó suministros)`);
    }
  },

  onPlayerEliminated(data) {
    killfeed.add(data.killerName, data.victimName, data.reason);
    if (data.victimId === net.selfId) {
      localPlayer.alive = false;
      localPlayer.endSlide();
      localPlayer.isVaulting = false;
      localPlayer.cancelClientHeal(false);
      localPlayer.isCrouching = false;
      localPlayer.state = 'dead';
      ui.sniperScopeOverlay?.classList.add('hidden');
      hud.showToast(`Fuiste eliminado por ${data.killerName}`);
    } else if (data.killerId === net.selfId) {
      hud.showToast(`🔥 ¡Eliminaste a ${data.victimName}!`);
    }
  },

  onReloadComplete(data) {
    localPlayer.reloading = false;
    localPlayer.weapons = data.weapons;
    localPlayer.reserveAmmo = data.reserveAmmo;
    audio.playReload();
  },

  onHealStarted(data) {
    if (!data || data.playerId === net.selfId) {
      localPlayer.beginClientHeal(data?.itemType || 'medkit', data?.durationMs || 2000);
      audio.playBandagingStart();
    }
  },

  onHealCancelled() {
    localPlayer.cancelClientHeal(false);
  },

  onPlayerHealed(data) {
    localPlayer.isHealing = false;
    audio.stopBandaging();
    localPlayer.hp = data.hp;
    localPlayer.medkits = data.medkits;
    localPlayer.bandages = data.bandages ?? localPlayer.bandages;
    audio.playPickup();
    hud.flashDamage('rgba(16, 185, 129, 0.45)');
    const msg =
      data.itemType === 'bandage' ? '🧻 +20 Salud (Venda aplicada)' : '🩹 +50 Salud (Botiquín aplicado)';
    hud.showToast(msg);
  },

  onGameOver(data) {
    document.exitPointerLock?.();
    resetHudCache(hudCache);
    ui.stormWarning.classList.add('hidden');
    ui.sniperScopeOverlay?.classList.add('hidden');
    ui.stormVignette.style.opacity = '0';

    const iWon = data.winnerId === net.selfId;
    if (iWon) audio.playVictory();

    lobby.renderGameOver(data, iWon);
  },

  onReturnedToLobby() {
    document.exitPointerLock?.();
    localPlayer.active = false;
    localPlayer.endSlide();
    localPlayer.isVaulting = false;
    localPlayer.isCrouching = false;
    localPlayer.state = 'lobby';
    resetHudCache(hudCache);
    ui.sniperScopeOverlay?.classList.add('hidden');
    ui.hudScreen.classList.add('hidden');
    ui.gameoverScreen.classList.add('hidden');
    ui.lobbyScreen.classList.remove('hidden');
    ui.stormVignette.style.opacity = '0';
  }
});

// Fauna y jugadores comparten el reloj del servidor: se dibujan en el mismo instante y el
// disparo envía ese instante para la compensación de latencia.
world.wildlifeClock = net.serverClock;

localPlayer.onJumpRequest = () => net.requestJump();
localPlayer.onShootRequest = (payload) => net.requestShoot(payload);
localPlayer.onReloadRequest = () => net.requestReload();
localPlayer.onSwitchWeaponRequest = (w) => net.requestSwitchWeapon(w);
localPlayer.onHealRequest = (itemType) => net.requestHeal(itemType);
localPlayer.onCancelHealRequest = () => net.cancelHeal();
localPlayer.onHealCancelledLocal = () => hud.showToast('❌ Curación cancelada');
localPlayer.onSpawnHealParticles = (x, y, z) => world.spawnHealParticles(x, y, z);
localPlayer.onSlideChange = (active) => net.sendSlideState(active);
localPlayer.onSpawnSlideDust = (x, y, z, yaw) => world.spawnSlideDust(x, y, z, yaw);
localPlayer.onSpawnWaterRipples = (x, z, moving, intensity) => world.spawnWaterRipples(x, z, moving, intensity);
localPlayer.onBreakWindowRequest = (windowId) => net.requestBreakWindow(windowId);
localPlayer.onInteractRequest = () => {
  const currentInteractable = hud.getInteractable();
  if (!currentInteractable) return;
  if (currentInteractable.kind === 'loot') {
    net.requestPickup(currentInteractable.id);
  } else if (currentInteractable.kind === 'door') {
    net.requestInteractDoor(currentInteractable.id);
  }
};
localPlayer.onCameraModeChanged = (mode) => {
  const labels = {
    cabin_third: '🎥 Vista Avión: Cabina 3ra Persona',
    cabin_first: '🎥 Vista Avión: Asiento 1ra Persona',
    plane_exterior: '🎥 Vista Avión: Exterior Panorámica',
    third: '🎥 Cámara: 3ra Persona Cel-Shaded',
    first: '🎥 Cámara: 1ra Persona Táctica'
  };
  hud.showToast(labels[mode] || '🎥 Vista cambiada');
};

lobby.bindControls({
  audio,
  net,
  onNickname: (nickname) => {
    myNickname = nickname;
  }
});

const clock = new THREE.Clock();
let minimapAccum = 0;

function animate() {
  requestAnimationFrame(animate);
  renderFrame();
}

function renderFrame() {
  const dt = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  world.update(dt, elapsed, planeState, stormState, localPlayer);
  localPlayer.update(dt, currentMap, planeState, world, net.getRemoteEntityList());
  camera.getWorldDirection(audioLookDir);
  audio.updateListener(
    camera.position.x,
    camera.position.y,
    camera.position.z,
    Math.atan2(audioLookDir.x, audioLookDir.z)
  );
  net.sendPlayerState(localPlayer);
  net.updateInterpolation(dt, world, planeState, currentMap);
  hud.update(dt);

  minimapAccum += dt;
  if (minimapAccum >= 0.05 && localPlayer.active) {
    minimapAccum = 0;
    minimap.draw(elapsed);
  }

  world.updateRenderBudget(localPlayer, camera, dt);
  const warming = warmQueue.length > 0;
  if (warming) beginWarmBatch();
  const renderStart = warming ? performance.now() : 0;
  renderer.render(scene, camera);
  if (warming) adaptWarmRate(performance.now() - renderStart);
  endWarmBatch();
  localPlayer.renderViewmodel(renderer);
}

if (window.__cocoro) {
  // Permite avanzar fotogramas a mano desde la consola aunque la pestaña esté en segundo plano
  window.__cocoro.renderFrame = renderFrame;
  window.__cocoro.net = net;
}

animate();
