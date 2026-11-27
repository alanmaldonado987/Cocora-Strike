// client/js/main.js
// Punto de entrada principal del Battle Royale Cel-Shaded 3D en escala métrica (1.80m):
// - Mapa de 640x640m con Monumento COCORA + Cóndor, Helicóptero Estrellado, Cráter, Puertas/Ventanas dinámicas,
// - Parkour Vaulting (W+Espacio), Looteo automático + contextual [E] y HUD exacto de referencia a 60 FPS.

import * as THREE from 'three';
import {
  WATER_LEVEL,
  GRID_SIZE,
  WORLD_HALF,
  DEFAULT_MAP_SEED,
  SURFACE,
  WEAPONS,
  LOOT_TYPES,
  PARACHUTE_CONFIG,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  SWIM_CONFIG
} from '/shared/mapData.js';
import { SoundEngine } from './audio.js';
import { VoxelWorld } from './world.js';
import { AVATAR_COLORS, LocalPlayerController, requestRawPointerLock } from './player.js';
import { NetworkManager } from './network.js';
import { preloadExternalModelAssets } from '/Modelos%203D/cocoraModels.js';

const WEAPON_SVG_PATHS = {
  fists: 'M12 25 L28 23 L32 18 L106 14 L112 19 L32 25 L28 29 L12 29 Z',
  pistol: 'M32 12 L86 12 L86 19 L54 19 L48 33 L36 33 L41 19 L32 19 Z',
  revolver: 'M28 15 L44 15 L48 11 L66 11 L68 14 L94 14 L94 18 L68 18 L66 23 L50 23 L45 34 L34 33 L40 22 L28 19 Z',
  shotgun: 'M8 22 L28 16 L112 16 L112 20 L62 20 L58 24 L34 24 L20 31 L8 29 Z',
  smg: 'M20 15 L96 15 L96 19 L74 19 L74 28 L68 28 L68 20 L54 20 L56 34 L49 34 L47 20 L34 20 L30 31 L22 31 L26 19 L20 19 Z',
  assault_rifle: 'M8 18 L26 17 L28 14 L52 14 L55 10 L69 10 L71 14 L112 14 L112 18 L74 18 L70 22 L59 22 L61 34 L53 34 L51 22 L38 22 L33 32 L26 32 L30 22 L10 25 Z',
  rifle: 'M6 21 L26 16 L46 14 L112 15 L112 18 L78 18 L74 22 L58 22 L63 34 L54 35 L50 22 L36 22 L31 32 L24 32 L28 22 L6 26 Z',
  sniper: 'M4 21 L26 17 L48 17 L50 11 L78 11 L80 17 L116 17 L116 20 L74 20 L66 24 L56 32 L49 32 L53 22 L28 22 L8 27 Z'
};

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

const audio = new SoundEngine();
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

const ui = {
  btnMute: document.getElementById('btn-mute'),
  lobbyScreen: document.getElementById('lobby-screen'),
  lanBanner: document.getElementById('lan-url-banner'),
  joinPanel: document.getElementById('join-panel'),
  waitingPanel: document.getElementById('waiting-panel'),
  nicknameInput: document.getElementById('nickname-input'),
  btnJoin: document.getElementById('btn-join-lobby'),
  lobbyCount: document.getElementById('lobby-count'),
  lobbyCountdown: document.getElementById('lobby-countdown'),
  lobbyPlayersList: document.getElementById('lobby-players-list'),
  botDifficultySelect: document.getElementById('bot-difficulty-select'),
  botCountSelect: document.getElementById('bot-count-select'),
  aircraftTypeSelect: document.getElementById('aircraft-type-select'),
  btnAddBot: document.getElementById('btn-add-bot'),
  btnClearBots: document.getElementById('btn-clear-bots'),
  btnStartSolo: document.getElementById('btn-start-solo'),
  btnStartMatch: document.getElementById('btn-start-match'),

  hudScreen: document.getElementById('hud-screen'),
  sniperScopeOverlay: document.getElementById('sniper-scope-overlay'),
  minimapCanvas: document.getElementById('minimap-canvas'),
  stormPhaseText: document.getElementById('storm-phase-text'),
  stormTimerText: document.getElementById('storm-timer-text'),
  stormWarning: document.getElementById('storm-warning'),
  stormVignette: document.getElementById('storm-vignette'),
  damageFlash: document.getElementById('damage-flash'),
  aliveCount: document.getElementById('alive-count'),
  killsCount: document.getElementById('kills-count'),
  killfeed: document.getElementById('killfeed'),
  actionBanner: document.getElementById('action-banner'),
  pointerPrompt: document.getElementById('pointer-prompt'),
  crosshair: document.getElementById('crosshair'),
  hitmarker: document.getElementById('hitmarker'),
  floatingDmgLayer: document.getElementById('floating-dmg-layer'),
  targetHud: document.getElementById('target-hud'),
  targetHudName: document.getElementById('target-hud-name'),
  targetHudHp: document.getElementById('target-hud-hp'),
  targetHudFill: document.getElementById('target-hud-fill'),
  statusToast: document.getElementById('status-toast'),
  interactPrompt: document.getElementById('interact-prompt'),
  healWrap: document.getElementById('heal-bar-wrap'),
  healLabel: document.getElementById('heal-bar-label'),
  healTimer: document.getElementById('heal-bar-timer'),
  healFill: document.getElementById('heal-bar-fill'),

  hpFill: document.getElementById('hp-fill'),
  hpText: document.getElementById('hp-text'),
  breathBar: document.getElementById('breath-bar'),
  breathFill: document.getElementById('breath-fill'),
  drownWarning: document.getElementById('drown-warning'),
  medkitCount: document.getElementById('medkit-count'),
  bandageCount: document.getElementById('bandage-count'),
  stealthBadge: document.getElementById('stealth-badge'),
  reloadWrap: document.getElementById('reload-bar-wrap'),
  reloadFill: document.getElementById('reload-bar-fill'),
  weaponName: document.getElementById('weapon-name'),
  weaponIconPath: document.getElementById('weapon-icon-path'),
  weaponChargeFill: document.getElementById('weapon-charge-fill'),
  ammoCurrent: document.getElementById('ammo-current'),
  ammoReserve: document.getElementById('ammo-reserve'),
  slotFists: document.getElementById('slot-fists'),
  slotPistol: document.getElementById('slot-pistol'),
  slotRevolver: document.getElementById('slot-revolver'),
  slotShotgun: document.getElementById('slot-shotgun'),
  slotSmg: document.getElementById('slot-smg'),
  slotAssaultRifle: document.getElementById('slot-assault-rifle'),
  slotRifle: document.getElementById('slot-rifle'),
  slotSniper: document.getElementById('slot-sniper'),

  gameoverScreen: document.getElementById('gameover-screen'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverWinner: document.getElementById('gameover-winner'),
  gameoverRanking: document.getElementById('gameover-ranking'),
  btnBackLobby: document.getElementById('btn-back-lobby')
};

let planeState = null;
let stormState = null;
let myNickname = '';
let lastRenderedWeaponIcon = '';
let currentInteractable = null;
let hitmarkerTimeout = null;
let toastTimeout = null;
let targetHudTimeout = null;
const projVec = new THREE.Vector3();
const hudLookDir = new THREE.Vector3();

const minimapBg = document.createElement('canvas');
minimapBg.width = 176;
minimapBg.height = 176;
const minimapCtx = ui.minimapCanvas.getContext('2d');

function bakeMinimapTerrain(mapData) {
  const ctx = minimapBg.getContext('2d');
  const size = minimapBg.width;
  ctx.clearRect(0, 0, size, size);

  const V = GRID_SIZE + 1;
  const cell = size / GRID_SIZE;

  for (let gz = 0; gz < GRID_SIZE; gz += 2) {
    for (let gx = 0; gx < GRID_SIZE; gx += 2) {
      const surf = mapData.surfaceGrid[gz * V + gx];
      const h = mapData.heightGrid[gz * V + gx];

      if (surf === SURFACE.RIVER_BED) ctx.fillStyle = WATER_LEVEL - h > 2.65 ? '#0e8aa8' : '#18b8d4';
      else if (surf === SURFACE.RIVER_SAND) ctx.fillStyle = '#ded09c';
      else if (surf === SURFACE.DIRT_TRAIL) ctx.fillStyle = '#b58250';
      else if (surf === SURFACE.SCORCHED_EARTH) ctx.fillStyle = '#382c25';
      else if (surf === SURFACE.LUMBER_EARTH) ctx.fillStyle = '#8b5e34';
      else if (surf === SURFACE.RUINS_STONE) ctx.fillStyle = '#78716c';
      else if (surf === SURFACE.CAVE_ROCK) ctx.fillStyle = '#475569';
      else if (surf === SURFACE.COFFEE_TERRACE) ctx.fillStyle = '#5a4b2c';
      else if (surf === SURFACE.TOWN_COBBLESTONE) ctx.fillStyle = '#94a3b8';
      else if (surf === SURFACE.ROCK_CLIFF) ctx.fillStyle = '#64748b';
      else if (h >= 24) ctx.fillStyle = '#256035';
      else ctx.fillStyle = '#3ca346';

      ctx.fillRect(gx * cell, gz * cell, Math.ceil(cell * 2), Math.ceil(cell * 2));
    }
  }

  const toPx = (val) => ((val + WORLD_HALF) / (WORLD_HALF * 2)) * size;

  // Puentes arqueados de piedra
  ctx.fillStyle = '#cbd5e1';
  for (const br of mapData.bridges) {
    const bw = Math.max(8, ((br.totalHalf || br.spanHalf) * 2 / (WORLD_HALF * 2)) * size);
    ctx.fillRect(toPx(br.x) - bw * 0.5, toPx(br.z) - 2, bw, 4);
  }

  // Monumento COCORA
  if (mapData.cocoraMonument) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(toPx(mapData.cocoraMonument.x) - 5, toPx(mapData.cocoraMonument.z) - 2, 10, 4);
  }

  // Helicóptero estrellado
  if (mapData.helicopterWreck) {
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(toPx(mapData.helicopterWreck.x), toPx(mapData.helicopterWreck.z), 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Casas Paisas
  ctx.fillStyle = '#ea580c';
  for (const b of mapData.buildings) {
    const bw = Math.max(3, (b.w / (WORLD_HALF * 2)) * size);
    const bd = Math.max(3, (b.d / (WORLD_HALF * 2)) * size);
    ctx.fillRect(toPx(b.x) - bw * 0.5, toPx(b.z) - bd * 0.5, bw, bd);
  }

  // Retícula sutil tipo radar
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, 0);
  ctx.lineTo(size * 0.5, size);
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.arc(size * 0.5, size * 0.5, size * 0.30, 0, Math.PI * 2);
  ctx.stroke();
}
bakeMinimapTerrain(currentMap);

function drawMinimap(elapsedSec = 0) {
  const size = ui.minimapCanvas.width;
  minimapCtx.drawImage(minimapBg, 0, 0);

  const toMapCoord = (worldVal) => ((worldVal + WORLD_HALF) / (WORLD_HALF * 2)) * size;

  if (stormState) {
    const cx = toMapCoord(stormState.centerX);
    const cz = toMapCoord(stormState.centerZ);
    const r = (stormState.radius / (WORLD_HALF * 2)) * size;
    const tr = (stormState.targetRadius / (WORLD_HALF * 2)) * size;

    // Sombreado púrpura de la tormenta exterior en el minimapa
    minimapCtx.save();
    minimapCtx.beginPath();
    minimapCtx.rect(0, 0, size, size);
    minimapCtx.arc(cx, cz, Math.max(1, r), 0, Math.PI * 2, true);
    minimapCtx.fillStyle = 'rgba(126, 34, 206, 0.36)';
    minimapCtx.fill();
    minimapCtx.restore();

    minimapCtx.strokeStyle = 'rgba(255,255,255,0.65)';
    minimapCtx.lineWidth = 1.2;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cz, Math.max(1, tr), 0, Math.PI * 2);
    minimapCtx.stroke();

    minimapCtx.strokeStyle = '#c084fc';
    minimapCtx.lineWidth = 2.4;
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cz, Math.max(1, r), 0, Math.PI * 2);
    minimapCtx.stroke();
  }

  // Línea sutil de barrido radar
  const sweepAng = elapsedSec * 1.4;
  minimapCtx.strokeStyle = 'rgba(74, 222, 128, 0.25)';
  minimapCtx.lineWidth = 1.4;
  minimapCtx.beginPath();
  minimapCtx.moveTo(size * 0.5, size * 0.5);
  minimapCtx.lineTo(size * 0.5 + Math.cos(sweepAng) * size * 0.5, size * 0.5 + Math.sin(sweepAng) * size * 0.5);
  minimapCtx.stroke();

  if (planeState && planeState.active && world.planeMesh.visible) {
    const px = toMapCoord(world.planeMesh.position.x);
    const pz = toMapCoord(world.planeMesh.position.z);
    minimapCtx.fillStyle = '#facc15';
    minimapCtx.beginPath();
    minimapCtx.arc(px, pz, 4, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  if (localPlayer.active && localPlayer.alive) {
    const mx = toMapCoord(localPlayer.x);
    const mz = toMapCoord(localPlayer.z);
    minimapCtx.save();
    minimapCtx.translate(mx, mz);
    minimapCtx.rotate(-localPlayer.yaw + Math.PI);

    // Cono de visión + Flecha direccional blanca con borde oscuro
    minimapCtx.fillStyle = 'rgba(250, 204, 21, 0.20)';
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, 0);
    minimapCtx.lineTo(-9, -18);
    minimapCtx.lineTo(9, -18);
    minimapCtx.closePath();
    minimapCtx.fill();

    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.strokeStyle = '#090d16';
    minimapCtx.lineWidth = 1.8;
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, -6.5);
    minimapCtx.lineTo(5.2, 5.2);
    minimapCtx.lineTo(0, 2.6);
    minimapCtx.lineTo(-5.2, 5.2);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.stroke();
    minimapCtx.restore();
  }
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function showToast(msg) {
  ui.statusToast.textContent = msg;
  ui.statusToast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.statusToast.classList.add('hidden'), 2200);
}

function spawnFloatingDamage(hitPoint, damage, isCrit = false) {
  if (!ui.floatingDmgLayer || !hitPoint) return;
  projVec.set(hitPoint.x, hitPoint.y + 0.4, hitPoint.z);
  projVec.project(camera);

  let sx = (projVec.x * 0.5 + 0.5) * window.innerWidth;
  let sy = (-projVec.y * 0.5 + 0.5) * window.innerHeight;
  if (projVec.z > 1) {
    sx = window.innerWidth * 0.5;
    sy = window.innerHeight * 0.46;
  }

  const el = document.createElement('div');
  el.className = `dmg-pop${isCrit ? ' crit' : ''}`;
  el.style.left = `${sx + (Math.random() - 0.5) * 24}px`;
  el.style.top = `${sy}px`;
  el.textContent = isCrit ? `-${damage} ★` : `-${damage}`;
  ui.floatingDmgLayer.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

function showEnemyHealthFeedback(name, hp, maxHp = 100) {
  if (!ui.targetHud) return;
  const clampedHp = Math.max(0, Math.ceil(hp));
  const pct = Math.max(0, Math.min(100, (clampedHp / (maxHp || 100)) * 100));

  ui.targetHudName.textContent = name || 'Enemigo';
  ui.targetHudHp.textContent = `${clampedHp} / ${maxHp}`;
  ui.targetHudFill.style.width = `${pct}%`;
  ui.targetHudFill.style.background =
    pct > 55
      ? 'linear-gradient(90deg, #16a34a, #4ade80)'
      : pct > 25
      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
      : 'linear-gradient(90deg, #dc2626, #ef4444)';

  ui.targetHud.classList.remove('hidden');
  clearTimeout(targetHudTimeout);
  targetHudTimeout = setTimeout(() => ui.targetHud.classList.add('hidden'), 2200);
}

function addKillfeedItem(killer, victim, reason) {
  const div = document.createElement('div');
  div.className = 'kill-item';
  if (reason === 'storm') {
    div.textContent = `⚡ La Tormenta consumió a ${victim}`;
  } else if (reason === 'bear') {
    div.textContent = `🐻 Un Oso de Anteojos abatió a ${victim}`;
  } else if (reason === 'jaguar') {
    div.textContent = `🐆 Un Jaguar Colombiano cazó a ${victim}`;
  } else if (reason === 'fall') {
    div.textContent = `⛰️ ${victim} cayó desde gran altura`;
  } else if (reason === 'drown') {
    div.textContent = `🌊 ${victim} se ahogó en el río Quindío`;
  } else {
    div.textContent = `🎯 ${killer} eliminó a ${victim}`;
  }
  ui.killfeed.prepend(div);
  setTimeout(() => div.remove(), 5500);
}

function flashDamage(colorRgba = 'rgba(239, 68, 68, 0.65)') {
  ui.damageFlash.style.background = `radial-gradient(circle, transparent 48%, ${colorRgba} 100%)`;
  ui.damageFlash.style.opacity = '1';
  setTimeout(() => {
    ui.damageFlash.style.opacity = '0';
  }, 190);
}

function showHitmarker(isHeadshot = false) {
  ui.hitmarker.classList.remove('hidden');
  ui.hitmarker.classList.toggle('headshot', Boolean(isHeadshot));
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => ui.hitmarker.classList.add('hidden'), 150);
}

function updateSlotClass(el, weaponKey) {
  if (!el) return;
  const unlocked = localPlayer.weapons[weaponKey]?.unlocked;
  const active = localPlayer.equipped === weaponKey;
  el.className = `w-slot${!unlocked ? ' locked' : ''}${active ? ' active' : ''}`;
}

function updateHUD() {
  if (!localPlayer.active) return;

  const hpPct = Math.max(0, Math.min(100, localPlayer.hp));
  ui.hpFill.style.width = `${hpPct}%`;
  ui.hpFill.style.background =
    hpPct > 45
      ? 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80)'
      : hpPct > 22
      ? 'linear-gradient(90deg, #d97706, #f59e0b)'
      : 'linear-gradient(90deg, #b91c1c, #ef4444)';
  ui.hpText.textContent = `${Math.ceil(localPlayer.hp)}/100`;

  // Aliento: visible nadando o mientras se recupera; aviso al ahogarse
  const breath = Math.max(0, Math.min(SWIM_CONFIG.maxBreath, localPlayer.breath ?? SWIM_CONFIG.maxBreath));
  const showBreath = localPlayer.alive && (localPlayer.isSwimming || breath < SWIM_CONFIG.maxBreath);
  ui.breathBar?.classList.toggle('hidden', !showBreath);
  if (showBreath && ui.breathFill) {
    ui.breathFill.style.width = `${(breath / SWIM_CONFIG.maxBreath) * 100}%`;
    ui.breathFill.classList.toggle('low', breath < 30);
  }
  const drowning = localPlayer.alive && localPlayer.isSwimming && breath <= 0;
  ui.drownWarning?.classList.toggle('hidden', !drowning);
  ui.medkitCount.textContent = String(localPlayer.medkits);
  if (ui.bandageCount) ui.bandageCount.textContent = String(localPlayer.bandages);
  ui.killsCount.textContent = String(localPlayer.kills);

  // Indicador de ocultamiento sigiloso en arbustos altos
  if (ui.stealthBadge && currentMap) {
    const concealed =
      localPlayer.alive &&
      localPlayer.state === 'ground' &&
      (localPlayer.isCrouching || localPlayer.isSliding) &&
      currentMap.isConcealedInBush(localPlayer.x, localPlayer.z);
    ui.stealthBadge.classList.toggle('hidden', !concealed);
  }

  // Aviso contextual [E] RECOGER... o [E] ABRIR PUERTA sobre la barra de salud
  if (ui.interactPrompt) {
    if (localPlayer.alive && localPlayer.state === 'ground') {
      camera.getWorldDirection(hudLookDir);
      const eyeH = localPlayer.isSliding
        ? PLAYER_SLIDE_EYE_HEIGHT
        : localPlayer.isCrouching
        ? PLAYER_CROUCH_EYE_HEIGHT
        : PLAYER_EYE_HEIGHT;
      currentInteractable = world.findBestInteractable(
        localPlayer.x,
        localPlayer.y,
        localPlayer.z,
        localPlayer.y + eyeH,
        hudLookDir.x,
        hudLookDir.y,
        hudLookDir.z
      );
      if (currentInteractable) {
        ui.interactPrompt.textContent = currentInteractable.promptText;
        ui.interactPrompt.classList.remove('hidden');
      } else {
        ui.interactPrompt.classList.add('hidden');
      }
    } else {
      currentInteractable = null;
      ui.interactPrompt.classList.add('hidden');
    }
  }

  const wKey = localPlayer.equipped || 'fists';
  const wSpec = WEAPONS[wKey] || WEAPONS.fists;
  const wState = localPlayer.weapons[wKey];
  ui.weaponName.textContent = wSpec.name.toUpperCase();

  if (lastRenderedWeaponIcon !== wKey && ui.weaponIconPath) {
    lastRenderedWeaponIcon = wKey;
    ui.weaponIconPath.setAttribute('d', WEAPON_SVG_PATHS[wKey] || WEAPON_SVG_PATHS.fists);
  }

  if (wSpec.magSize === 0) {
    ui.ammoCurrent.textContent = '∞';
    ui.ammoReserve.textContent = '';
    if (ui.weaponChargeFill) ui.weaponChargeFill.style.width = '100%';
  } else {
    const curMag = wState ? wState.mag : 0;
    ui.ammoCurrent.textContent = String(curMag);
    ui.ammoReserve.textContent = `/${localPlayer.reserveAmmo}`;
    if (ui.weaponChargeFill) {
      const magPct = localPlayer.reloading
        ? Math.min(100, ((performance.now() - localPlayer.reloadStart) / Math.max(1, localPlayer.reloadDuration)) * 100)
        : Math.max(0, Math.min(100, (curMag / wSpec.magSize) * 100));
      ui.weaponChargeFill.style.width = `${magPct}%`;
    }
  }

  updateSlotClass(ui.slotFists, 'fists');
  updateSlotClass(ui.slotPistol, 'pistol');
  updateSlotClass(ui.slotRevolver, 'revolver');
  updateSlotClass(ui.slotShotgun, 'shotgun');
  updateSlotClass(ui.slotSmg, 'smg');
  updateSlotClass(ui.slotAssaultRifle, 'assault_rifle');
  updateSlotClass(ui.slotRifle, 'rifle');
  updateSlotClass(ui.slotSniper, 'sniper');

  if (localPlayer.reloading) {
    ui.reloadWrap.classList.remove('hidden');
    const prog = Math.min(
      100,
      ((performance.now() - localPlayer.reloadStart) / Math.max(1, localPlayer.reloadDuration)) * 100
    );
    ui.reloadFill.style.width = `${prog}%`;
  } else {
    ui.reloadWrap.classList.add('hidden');
  }

  if (ui.healWrap) {
    if (localPlayer.isHealing && localPlayer.alive) {
      ui.healWrap.classList.remove('hidden');
      const elapsedHeal = performance.now() - localPlayer.healStart;
      const dur = Math.max(1, localPlayer.healDuration);
      const pctHeal = Math.min(100, (elapsedHeal / dur) * 100);
      const remSec = Math.max(0, (dur - elapsedHeal) / 1000).toFixed(1);
      ui.healLabel.textContent =
        localPlayer.healItemType === 'bandage' ? '🧻 APLICANDO VENDA...' : '🩹 APLICANDO BOTIQUÍN...';
      ui.healTimer.textContent = `${remSec}s`;
      ui.healFill.style.width = `${pctHeal}%`;
    } else {
      ui.healWrap.classList.add('hidden');
    }
  }

  const sniperScoped = localPlayer.isSniperScoped();
  if (ui.sniperScopeOverlay) {
    ui.sniperScopeOverlay.classList.toggle('hidden', !sniperScoped);
  }

  if (ui.crosshair) {
    ui.crosshair.dataset.weapon = wKey;
    ui.crosshair.dataset.ads = String(Boolean(localPlayer.aimingZoom && localPlayer.state === 'ground'));
    ui.crosshair.style.opacity = sniperScoped ? '0' : '1';
  }

  if (!localPlayer.alive) {
    ui.actionBanner.textContent = '💀 ELIMINADO — Observando el desenlace en el Valle del Cocora...';
    ui.actionBanner.classList.remove('hidden');
  } else if (localPlayer.state === 'plane') {
    const alt = Math.round(localPlayer.currentGroundClearance);
    const airLabel = (planeState?.label || 'AC-130J Ghostrider').toUpperCase();
    ui.actionBanner.textContent = localPlayer.isCabinDisembarking
      ? `✈️ ${airLabel} · AVANZANDO POR LA BODEGA HACIA LA RAMPA...`
      : `✈️ ${airLabel} (${alt}m) · [V] Vista Cabina/Exterior — Pulsa [ESPACIO] o [F] para desembarcar`;
    ui.actionBanner.classList.remove('hidden');
  } else if (localPlayer.state === 'skydiving') {
    const alt = Math.round(localPlayer.currentGroundClearance);
    const spd = localPlayer.currentDescentSpeed.toFixed(1);
    ui.actionBanner.textContent = `🦅 CAÍDA LIBRE · Alt: ${alt}m (Auto: ${PARACHUTE_CONFIG.autoDeployHeight}m) · ${spd} m/s — [ESPACIO]/[F] Paracaídas`;
    ui.actionBanner.classList.remove('hidden');
  } else if (localPlayer.state === 'parachuting') {
    const alt = Math.round(localPlayer.currentGroundClearance);
    const spd = localPlayer.currentDescentSpeed.toFixed(1);
    ui.actionBanner.textContent = `🪂 PARACAÍDAS ABIERTO · Alt: ${alt}m · Vel: ${spd} m/s — Planea con WASD`;
    ui.actionBanner.classList.remove('hidden');
  } else {
    ui.actionBanner.classList.add('hidden');
  }

  if (localPlayer.alive && !localPlayer.pointerLocked && ui.gameoverScreen.classList.contains('hidden')) {
    ui.pointerPrompt.classList.remove('hidden');
  } else {
    ui.pointerPrompt.classList.add('hidden');
  }

  if (stormState) {
    const dpsVal = stormState.dps || 1;
    const label =
      stormState.state === 'shrinking'
        ? `⚡ Cerrando F${stormState.phaseIndex}`
        : stormState.state === 'closed'
        ? `⚡ Zona Cerrada`
        : `Zona · Fase ${stormState.phaseIndex}`;
    ui.stormPhaseText.textContent = label;
    const secs = Math.max(0, stormState.timer || 0);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    ui.stormTimerText.textContent = `${mm}:${ss}`;

    const distCenter = Math.hypot(
      localPlayer.x - stormState.centerX,
      localPlayer.z - stormState.centerZ
    );
    const outside =
      localPlayer.alive && localPlayer.state !== 'plane' && distCenter > stormState.radius;
    if (outside) {
      ui.stormWarning.textContent = `⚡ ¡FUERA DE LA ZONA SEGURA! (-${dpsVal} HP/s) · DIRÍGETE AL CÍRCULO BLANCO ⚡`;
    }
    ui.stormWarning.classList.toggle('hidden', !outside);
    ui.stormVignette.style.opacity = String(Math.min(1, (world.stormAtmosphereFactor || 0) * 1.05));
  }
}

const net = new NetworkManager(scene, {
  onNetworkInfo(info) {
    if (ui.lanBanner && info.lanUrls && info.lanUrls.length > 0) {
      ui.lanBanner.textContent = `🌐 Red Local Wi-Fi / LAN: ${info.lanUrls[0]}`;
      ui.lanBanner.classList.remove('hidden');
    }
  },

  onLobbyJoined() {
    ui.joinPanel.classList.add('hidden');
    ui.waitingPanel.classList.remove('hidden');
  },

  onLobbyState(data) {
    ui.lobbyCount.textContent = String(data.players.length);

    if (ui.botDifficultySelect && data.botDifficulty) {
      ui.botDifficultySelect.value = data.botDifficulty;
    }
    if (ui.botCountSelect && typeof data.botCount === 'number') {
      const optExists = Array.from(ui.botCountSelect.options).some(
        (o) => Number(o.value) === data.botCount
      );
      if (optExists) ui.botCountSelect.value = String(data.botCount);
    }
    if (ui.aircraftTypeSelect && data.aircraftType) {
      ui.aircraftTypeSelect.value = data.aircraftType;
    }

    if (data.countdown !== null) {
      ui.lobbyCountdown.textContent = `⏱️ Despegue automático en ${data.countdown}s...`;
    } else {
      ui.lobbyCountdown.textContent =
        data.players.length >= 2
          ? '¡Sala lista! Inicia la partida o espera más jugadores en tu red Wi-Fi / LAN.'
          : 'Elige la cantidad de Bots IA o comparte la dirección LAN para jugar con amigos.';
    }

    ui.lobbyPlayersList.innerHTML = '';
    for (const p of data.players) {
      const li = document.createElement('li');
      li.className = 'player-chip';
      const dotColor = AVATAR_COLORS[p.colorIdx % AVATAR_COLORS.length];
      li.innerHTML = `
        <span class="chip-dot" style="background:${dotColor}"></span>
        <span>${escapeHtml(p.name)}</span>
        <span class="chip-tag">${p.isBot ? 'BOT IA' : p.id === net.selfId ? 'TÚ' : 'LAN'}</span>
      `;
      ui.lobbyPlayersList.appendChild(li);
    }
  },

  onGameStarted(data) {
    currentMap = world.buildFromSeed(data.seed);
    bakeMinimapTerrain(currentMap);
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
    bakeMinimapTerrain(currentMap);
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
    showToast('Partida en curso: modo espectador hasta la siguiente ronda');
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
      audio.playSlide(dist);
    }
  },

  onDoorStateChanged(data) {
    world.applyDoorState(data, true);
    const dist = Math.hypot((data.x || 0) - localPlayer.x, (data.z || 0) - localPlayer.z);
    if (data.destroyed) {
      audio.playDoorBreak(dist);
    } else {
      audio.playDoorToggle(data.isOpen, dist);
    }
  },

  onWindowBroken(data) {
    world.applyWindowBroken(data, true);
    const dist = Math.hypot((data.x || 0) - localPlayer.x, (data.z || 0) - localPlayer.z);
    audio.playGlassBreak(dist);
  },

  onLootPicked(data) {
    world.removeLootItem(data.lootId);
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
      showToast(`+ Recogido: ${label}`);
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
    audio.playShot(data.weapon, data.shooterId === net.selfId ? 0 : dist);

    if (data.shooterId === net.selfId && localPlayer.weapons[data.weapon]) {
      localPlayer.weapons[data.weapon].mag = data.mag;
      localPlayer.reserveAmmo = data.reserveAmmo;
    }
  },

  onPlayerDamaged(data) {
    if (data.attackerId === net.selfId && data.targetId !== net.selfId) {
      audio.playHitmarker(data.isHeadshot);
      showHitmarker(data.isHeadshot);
      spawnFloatingDamage(data.hitPoint, data.damage, data.isHeadshot);
      showEnemyHealthFeedback(data.targetName, data.hp, data.maxHp || 100);
    }
    if (data.targetId === net.selfId) {
      localPlayer.hp = data.hp;
      if (data.source === 'fall') {
        audio.playFallImpact(data.damage);
        localPlayer.triggerCameraShake(Math.min(0.45, 0.14 + data.damage * 0.004), 0.38);
        flashDamage('rgba(220, 38, 38, 0.78)');
        showToast(`⚠️ ¡Impacto por caída! (-${data.damage} HP)`);
      } else {
        audio.playDamage();
        flashDamage('rgba(239, 68, 68, 0.65)');
      }
    }
  },

  onWildlifeHit(data) {
    world.triggerWildlifeHitFlash(data.animalId, data.hp, data.maxHp);
    if (data.attackerId === net.selfId) {
      audio.playHitmarker(false);
      showHitmarker(false);
      spawnFloatingDamage(data.hitPoint, data.damage || 18, false);
      showEnemyHealthFeedback(data.speciesName, data.hp, data.maxHp || 100);
    }
  },

  onWildlifeAggro(data) {
    const dist = Math.hypot(data.x - localPlayer.x, data.z - localPlayer.z);
    audio.playAnimalAlert(data.species, dist);
    if (data.targetId === net.selfId) {
      const icon = data.species === 'bear' ? '🐻' : '🐆';
      showToast(`${icon} ¡${data.speciesName} enfurecido te persigue!`);
    }
  },

  onWildlifeAttack(data) {
    const dist = Math.hypot(data.x - localPlayer.x, data.z - localPlayer.z);
    audio.playAnimalAlert(data.species, dist);
  },

  onWildlifeKilled(data) {
    world.removeWildlife(data.animalId);
    if (data.killerId === net.selfId) {
      showToast(`🌿 ${data.speciesName} abatido (soltó suministros)`);
    }
  },

  onPlayerEliminated(data) {
    addKillfeedItem(data.killerName, data.victimName, data.reason);
    if (data.victimId === net.selfId) {
      localPlayer.alive = false;
      localPlayer.endSlide();
      localPlayer.isVaulting = false;
      localPlayer.cancelClientHeal(false);
      localPlayer.isCrouching = false;
      localPlayer.state = 'dead';
      ui.sniperScopeOverlay?.classList.add('hidden');
      showToast(`Fuiste eliminado por ${data.killerName}`);
    } else if (data.killerId === net.selfId) {
      showToast(`🔥 ¡Eliminaste a ${data.victimName}!`);
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
    flashDamage('rgba(16, 185, 129, 0.45)');
    const msg =
      data.itemType === 'bandage' ? '🧻 +20 Salud (Venda aplicada)' : '🩹 +50 Salud (Botiquín aplicado)';
    showToast(msg);
  },

  onGameOver(data) {
    document.exitPointerLock?.();
    ui.stormWarning.classList.add('hidden');
    ui.sniperScopeOverlay?.classList.add('hidden');
    ui.stormVignette.style.opacity = '0';

    const iWon = data.winnerId === net.selfId;
    if (iWon) audio.playVictory();

    ui.gameoverTitle.textContent = iWon
      ? '🏆 ¡VICTORIA MAGISTRAL EN EL COCORA!'
      : '🌄 PARTIDA FINALIZADA';
    ui.gameoverWinner.textContent = `Campeón: ${data.winnerName} (${data.winnerKills} bajas)`;

    ui.gameoverRanking.innerHTML = '';
    for (const row of data.ranking || []) {
      const tr = document.createElement('tr');
      if (row.id === net.selfId) tr.style.background = 'rgba(34, 197, 94, 0.18)';
      tr.innerHTML = `
        <td><strong>#${escapeHtml(row.placement)}</strong></td>
        <td>${escapeHtml(row.name)} ${row.id === net.selfId ? '(Tú)' : ''}</td>
        <td>${row.isBot ? '🤖 Bot IA' : '🧑 Jugador'}</td>
        <td><strong>${escapeHtml(row.kills)}</strong></td>
      `;
      ui.gameoverRanking.appendChild(tr);
    }

    ui.gameoverScreen.classList.remove('hidden');
  },

  onReturnedToLobby() {
    document.exitPointerLock?.();
    localPlayer.active = false;
    localPlayer.endSlide();
    localPlayer.isVaulting = false;
    localPlayer.isCrouching = false;
    localPlayer.state = 'lobby';
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
localPlayer.onHealCancelledLocal = () => showToast('❌ Curación cancelada');
localPlayer.onSpawnHealParticles = (x, y, z) => world.spawnHealParticles(x, y, z);
localPlayer.onSlideChange = (active) => net.sendSlideState(active);
localPlayer.onSpawnSlideDust = (x, y, z, yaw) => world.spawnSlideDust(x, y, z, yaw);
localPlayer.onSpawnWaterRipples = (x, z, moving, intensity) => world.spawnWaterRipples(x, z, moving, intensity);
localPlayer.onBreakWindowRequest = (windowId) => net.requestBreakWindow(windowId);
localPlayer.onInteractRequest = () => {
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
  showToast(labels[mode] || '🎥 Vista cambiada');
};

function submitJoinLobby() {
  audio.init();
  const raw = ui.nicknameInput.value.trim();
  myNickname = raw || `Arriero_${Math.floor(100 + Math.random() * 899)}`;
  net.joinLobby(myNickname);
}

ui.btnJoin.addEventListener('click', submitJoinLobby);
ui.nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitJoinLobby();
});

function sendBotConfigFromSelectors() {
  audio.init();
  const botDifficulty = ui.botDifficultySelect?.value || 'easy';
  const botCount = Number(ui.botCountSelect?.value ?? 6);
  const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
  net.configureBots({ botDifficulty, botCount, aircraftType });
}

ui.botDifficultySelect?.addEventListener('change', sendBotConfigFromSelectors);
ui.botCountSelect?.addEventListener('change', sendBotConfigFromSelectors);
ui.aircraftTypeSelect?.addEventListener('change', sendBotConfigFromSelectors);

ui.btnAddBot.addEventListener('click', () => {
  audio.init();
  net.addBot();
});

ui.btnClearBots.addEventListener('click', () => {
  audio.init();
  if (ui.botCountSelect) ui.botCountSelect.value = '0';
  net.clearBots();
});

ui.btnStartSolo.addEventListener('click', () => {
  audio.init();
  const botDifficulty = ui.botDifficultySelect?.value || 'easy';
  const selectedBots = Math.max(1, Number(ui.botCountSelect?.value || 6));
  const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
  net.startGame({ autoFillBots: true, botCount: selectedBots, botDifficulty, aircraftType });
});

ui.btnStartMatch.addEventListener('click', () => {
  audio.init();
  const botDifficulty = ui.botDifficultySelect?.value || 'easy';
  const botCount = Number(ui.botCountSelect?.value ?? 6);
  const aircraftType = ui.aircraftTypeSelect?.value || 'auto';
  net.startGame({ autoFillBots: false, botCount, botDifficulty, aircraftType });
});

ui.btnBackLobby.addEventListener('click', () => {
  audio.init();
  net.resetLobby();
});

function handleToggleMute() {
  const muted = audio.toggleMute();
  ui.btnMute.textContent = muted ? '🔇 Silenciado' : '🔊 Audio ON';
}

ui.btnMute.addEventListener('click', handleToggleMute);
window.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
  if (e.code === 'KeyM') handleToggleMute();
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
  net.sendPlayerState(localPlayer);
  net.updateInterpolation(dt, world, planeState, currentMap);
  updateHUD();

  minimapAccum += dt;
  if (minimapAccum >= 0.05 && localPlayer.active) {
    minimapAccum = 0;
    drawMinimap(elapsed);
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
