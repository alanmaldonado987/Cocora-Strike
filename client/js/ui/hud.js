// client/js/ui/hud.js
// HUD en partida: vida, aliento, munición, ranuras de armas, banners de avión/caída/paracaídas, tormenta,
// avisos contextuales [E], toasts, hitmarker, daño flotante y barra de vida del objetivo.
// Todo el refresco usa dirty-checking (ui/hudUpdater.js) para no tocar el DOM si nada cambió.

import * as THREE from 'three';
import {
  WEAPONS,
  PARACHUTE_CONFIG,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  SWIM_CONFIG,
  CLIENT_PERF_CONFIG
} from '/shared/mapData.js';
import {
  setTextIfChanged,
  setStyleIfChanged,
  toggleClassIfChanged,
  setAttrIfChanged,
  setDatasetIfChanged,
  updateWeaponSlotIfChanged,
  stepHudSensorThrottle,
  createDamageFlashState,
  triggerDamageFlash
} from './hudUpdater.js';

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

const HP_GRAD_HIGH = 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80)';
const HP_GRAD_MID = 'linear-gradient(90deg, #d97706, #f59e0b)';
const HP_GRAD_LOW = 'linear-gradient(90deg, #b91c1c, #ef4444)';

/**
 * @param {object} deps
 * @param {object} deps.ui elementos de queryUiElements()
 * @param {object} deps.localPlayer LocalPlayerController
 * @param {THREE.Camera} deps.camera cámara principal (proyección de daño flotante y mirada para [E])
 * @param {object} deps.world VoxelWorld (findBestInteractable, stormAtmosphereFactor)
 * @param {object} deps.hudCache caché de dirty-checking compartida con main.js
 * @param {object} deps.hudSensorState limitador de sensores compartido con main.js
 * @param {() => object|null} deps.getMap mapa actual
 * @param {() => object|null} deps.getPlaneState estado actual del avión
 * @param {() => object|null} deps.getStormState estado actual de la tormenta
 */
export function createHud({ ui, localPlayer, camera, world, hudCache, hudSensorState, getMap, getPlaneState, getStormState }) {
  let currentInteractable = null;
  let hitmarkerTimeout = null;
  let toastTimeout = null;
  let targetHudTimeout = null;
  const damageFlashState = createDamageFlashState();
  const projVec = new THREE.Vector3();
  const hudLookDir = new THREE.Vector3();

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

  function flashDamage(colorRgba = 'rgba(239, 68, 68, 0.65)') {
    triggerDamageFlash(
      damageFlashState,
      ui.damageFlash,
      colorRgba,
      CLIENT_PERF_CONFIG.damageFlashDurationMs
    );
  }

  function showHitmarker(isHeadshot = false) {
    ui.hitmarker.classList.remove('hidden');
    ui.hitmarker.classList.toggle('headshot', Boolean(isHeadshot));
    clearTimeout(hitmarkerTimeout);
    hitmarkerTimeout = setTimeout(() => ui.hitmarker.classList.add('hidden'), 150);
  }

  function updateSlotClass(el, weaponKey) {
    if (!el) return;
    const unlocked = Boolean(localPlayer.weapons[weaponKey]?.unlocked);
    const active = localPlayer.equipped === weaponKey;
    updateWeaponSlotIfChanged(hudCache, `slot_${weaponKey}`, el, unlocked, active);
  }

  function updateHUD(dt = 0.016) {
    if (!localPlayer.active) return;
    const currentMap = getMap();
    const planeState = getPlaneState();
    const stormState = getStormState();

    const hpPct = Math.round(Math.max(0, Math.min(100, localPlayer.hp)) * 10) / 10;
    if (hudCache.hpPct !== hpPct) {
      hudCache.hpPct = hpPct;
      ui.hpFill.style.width = `${hpPct}%`;
    }
    const hpGrad = hpPct > 45 ? HP_GRAD_HIGH : hpPct > 22 ? HP_GRAD_MID : HP_GRAD_LOW;
    setStyleIfChanged(hudCache, 'hpBg', ui.hpFill, 'background', hpGrad);

    const hpCeil = Math.ceil(localPlayer.hp);
    if (hudCache.hpCeil !== hpCeil) {
      hudCache.hpCeil = hpCeil;
      setTextIfChanged(hudCache, 'hpText', ui.hpText, `${hpCeil}/100`);
    }

    // Aliento: visible nadando o mientras se recupera; aviso al ahogarse
    const breath = Math.max(0, Math.min(SWIM_CONFIG.maxBreath, localPlayer.breath ?? SWIM_CONFIG.maxBreath));
    const showBreath = Boolean(localPlayer.alive && (localPlayer.isSwimming || breath < SWIM_CONFIG.maxBreath));
    toggleClassIfChanged(hudCache, 'breathHidden', ui.breathBar, 'hidden', !showBreath);
    if (showBreath && ui.breathFill) {
      const breathPct = Math.round(((breath / SWIM_CONFIG.maxBreath) * 100) * 2) / 2;
      if (hudCache.breathPct !== breathPct) {
        hudCache.breathPct = breathPct;
        ui.breathFill.style.width = `${breathPct}%`;
      }
      toggleClassIfChanged(hudCache, 'breathLow', ui.breathFill, 'low', breath < 30);
    }
    const drowning = Boolean(localPlayer.alive && localPlayer.isSwimming && breath <= 0);
    toggleClassIfChanged(hudCache, 'drownHidden', ui.drownWarning, 'hidden', !drowning);

    if (hudCache.medkits !== localPlayer.medkits) {
      hudCache.medkits = localPlayer.medkits;
      setTextIfChanged(hudCache, 'medkitText', ui.medkitCount, String(localPlayer.medkits));
    }
    if (ui.bandageCount && hudCache.bandages !== localPlayer.bandages) {
      hudCache.bandages = localPlayer.bandages;
      setTextIfChanged(hudCache, 'bandageText', ui.bandageCount, String(localPlayer.bandages));
    }
    if (hudCache.kills !== localPlayer.kills) {
      hudCache.kills = localPlayer.kills;
      setTextIfChanged(hudCache, 'killsText', ui.killsCount, String(localPlayer.kills));
    }

    // Consultas contextuales pesadas (isConcealedInBush + findBestInteractable) limitadas a máximo 10 Hz
    const canSenseGround = Boolean(localPlayer.alive && localPlayer.state === 'ground');
    if (stepHudSensorThrottle(hudSensorState, dt, canSenseGround)) {
      hudSensorState.concealed = Boolean(
        currentMap &&
          (localPlayer.isCrouching || localPlayer.isSliding) &&
          currentMap.isConcealedInBush(localPlayer.x, localPlayer.z)
      );

      if (ui.interactPrompt) {
        camera.getWorldDirection(hudLookDir);
        const eyeH = localPlayer.isSliding
          ? PLAYER_SLIDE_EYE_HEIGHT
          : localPlayer.isCrouching
          ? PLAYER_CROUCH_EYE_HEIGHT
          : PLAYER_EYE_HEIGHT;
        const found = world.findBestInteractable(
          localPlayer.x,
          localPlayer.y,
          localPlayer.z,
          localPlayer.y + eyeH,
          hudLookDir.x,
          hudLookDir.y,
          hudLookDir.z
        );
        hudSensorState.interactable = found;
      }
    } else if (canSenseGround && !(localPlayer.isCrouching || localPlayer.isSliding)) {
      // Salir de sigilo visualmente al instante si deja de agacharse/deslizarse sin esperar 100 ms
      hudSensorState.concealed = false;
    }

    currentInteractable = hudSensorState.interactable;

    if (ui.stealthBadge) {
      toggleClassIfChanged(hudCache, 'stealthHidden', ui.stealthBadge, 'hidden', !hudSensorState.concealed);
    }

    if (ui.interactPrompt) {
      const showInteract = Boolean(canSenseGround && currentInteractable);
      if (showInteract) {
        setTextIfChanged(hudCache, 'interactText', ui.interactPrompt, currentInteractable.promptText);
      }
      toggleClassIfChanged(hudCache, 'interactHidden', ui.interactPrompt, 'hidden', !showInteract);
    }

    const wKey = localPlayer.equipped || 'fists';
    const wSpec = WEAPONS[wKey] || WEAPONS.fists;
    const wState = localPlayer.weapons[wKey];
    if (hudCache.weaponKey !== wKey) {
      hudCache.weaponKey = wKey;
      setTextIfChanged(hudCache, 'weaponName', ui.weaponName, wSpec.name.toUpperCase());
      setAttrIfChanged(hudCache, 'weaponIconD', ui.weaponIconPath, 'd', WEAPON_SVG_PATHS[wKey] || WEAPON_SVG_PATHS.fists);
    }

    if (wSpec.magSize === 0) {
      setTextIfChanged(hudCache, 'ammoCur', ui.ammoCurrent, '∞');
      setTextIfChanged(hudCache, 'ammoRes', ui.ammoReserve, '');
      setStyleIfChanged(hudCache, 'wChargeW', ui.weaponChargeFill, 'width', '100%');
    } else {
      const curMag = wState ? wState.mag : 0;
      if (hudCache.ammoCurNum !== curMag) {
        hudCache.ammoCurNum = curMag;
        setTextIfChanged(hudCache, 'ammoCur', ui.ammoCurrent, String(curMag));
      }
      if (hudCache.ammoResNum !== localPlayer.reserveAmmo) {
        hudCache.ammoResNum = localPlayer.reserveAmmo;
        setTextIfChanged(hudCache, 'ammoRes', ui.ammoReserve, `/${localPlayer.reserveAmmo}`);
      }
      if (ui.weaponChargeFill) {
        const rawMagPct = localPlayer.reloading
          ? Math.min(100, ((performance.now() - localPlayer.reloadStart) / Math.max(1, localPlayer.reloadDuration)) * 100)
          : Math.max(0, Math.min(100, (curMag / wSpec.magSize) * 100));
        const magPct = Math.round(rawMagPct * 2) / 2;
        if (hudCache.magPct !== magPct) {
          hudCache.magPct = magPct;
          setStyleIfChanged(hudCache, 'wChargeW', ui.weaponChargeFill, 'width', `${magPct}%`);
        }
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

    const isReloading = Boolean(localPlayer.reloading);
    toggleClassIfChanged(hudCache, 'reloadHidden', ui.reloadWrap, 'hidden', !isReloading);
    if (isReloading) {
      const prog = Math.round(
        Math.min(100, ((performance.now() - localPlayer.reloadStart) / Math.max(1, localPlayer.reloadDuration)) * 100)
      );
      if (hudCache.reloadProg !== prog) {
        hudCache.reloadProg = prog;
        setStyleIfChanged(hudCache, 'reloadW', ui.reloadFill, 'width', `${prog}%`);
      }
    }

    if (ui.healWrap) {
      const showHeal = Boolean(localPlayer.isHealing && localPlayer.alive);
      toggleClassIfChanged(hudCache, 'healHidden', ui.healWrap, 'hidden', !showHeal);
      if (showHeal) {
        const elapsedHeal = performance.now() - localPlayer.healStart;
        const dur = Math.max(1, localPlayer.healDuration);
        const pctHeal = Math.round(Math.min(100, (elapsedHeal / dur) * 100));
        const remTenths = Math.max(0, Math.round(((dur - elapsedHeal) / 1000) * 10));
        const healLabel =
          localPlayer.healItemType === 'bandage' ? '🧻 APLICANDO VENDA...' : '🩹 APLICANDO BOTIQUÍN...';
        setTextIfChanged(hudCache, 'healLabel', ui.healLabel, healLabel);
        if (hudCache.healRemTenths !== remTenths) {
          hudCache.healRemTenths = remTenths;
          setTextIfChanged(hudCache, 'healTimer', ui.healTimer, `${(remTenths / 10).toFixed(1)}s`);
        }
        if (hudCache.healPct !== pctHeal) {
          hudCache.healPct = pctHeal;
          setStyleIfChanged(hudCache, 'healW', ui.healFill, 'width', `${pctHeal}%`);
        }
      }
    }

    const sniperScoped = Boolean(localPlayer.isSniperScoped());
    toggleClassIfChanged(hudCache, 'scopeHidden', ui.sniperScopeOverlay, 'hidden', !sniperScoped);

    if (ui.crosshair) {
      setDatasetIfChanged(hudCache, 'chWeapon', ui.crosshair, 'weapon', wKey);
      const adsStr = localPlayer.aimingZoom && localPlayer.state === 'ground' ? 'true' : 'false';
      setDatasetIfChanged(hudCache, 'chAds', ui.crosshair, 'ads', adsStr);
      setStyleIfChanged(hudCache, 'chOpacity', ui.crosshair, 'opacity', sniperScoped ? '0' : '1');
    }

    if (!localPlayer.alive) {
      setTextIfChanged(
        hudCache,
        'actionBannerText',
        ui.actionBanner,
        '💀 ELIMINADO — Observando el desenlace en el Valle del Cocora...'
      );
      toggleClassIfChanged(hudCache, 'actionBannerHidden', ui.actionBanner, 'hidden', false);
    } else if (localPlayer.state === 'plane') {
      const alt = Math.round(localPlayer.currentGroundClearance);
      const rawLabel = planeState?.label || 'AC-130J Ghostrider';
      const disembark = Boolean(localPlayer.isCabinDisembarking);
      if (
        hudCache.bannerMode !== 'plane' ||
        hudCache.bannerAlt !== alt ||
        hudCache.bannerPlaneLabel !== rawLabel ||
        hudCache.bannerDisembark !== disembark
      ) {
        hudCache.bannerMode = 'plane';
        hudCache.bannerAlt = alt;
        hudCache.bannerPlaneLabel = rawLabel;
        hudCache.bannerDisembark = disembark;
        const airLabel = rawLabel.toUpperCase();
        const text = disembark
          ? `✈️ ${airLabel} · AVANZANDO POR LA BODEGA HACIA LA RAMPA...`
          : `✈️ ${airLabel} (${alt}m) · [V] Vista Cabina/Exterior — Pulsa [ESPACIO] o [F] para desembarcar`;
        setTextIfChanged(hudCache, 'actionBannerText', ui.actionBanner, text);
      }
      toggleClassIfChanged(hudCache, 'actionBannerHidden', ui.actionBanner, 'hidden', false);
    } else if (localPlayer.state === 'skydiving') {
      const alt = Math.round(localPlayer.currentGroundClearance);
      const spdTenths = Math.round(localPlayer.currentDescentSpeed * 10);
      if (hudCache.bannerMode !== 'skydiving' || hudCache.bannerAlt !== alt || hudCache.bannerSpd !== spdTenths) {
        hudCache.bannerMode = 'skydiving';
        hudCache.bannerAlt = alt;
        hudCache.bannerSpd = spdTenths;
        const spd = (spdTenths / 10).toFixed(1);
        setTextIfChanged(
          hudCache,
          'actionBannerText',
          ui.actionBanner,
          `🦅 CAÍDA LIBRE · Alt: ${alt}m (Auto: ${PARACHUTE_CONFIG.autoDeployHeight}m) · ${spd} m/s — [ESPACIO]/[F] Paracaídas`
        );
      }
      toggleClassIfChanged(hudCache, 'actionBannerHidden', ui.actionBanner, 'hidden', false);
    } else if (localPlayer.state === 'parachuting') {
      const alt = Math.round(localPlayer.currentGroundClearance);
      const spdTenths = Math.round(localPlayer.currentDescentSpeed * 10);
      if (hudCache.bannerMode !== 'parachuting' || hudCache.bannerAlt !== alt || hudCache.bannerSpd !== spdTenths) {
        hudCache.bannerMode = 'parachuting';
        hudCache.bannerAlt = alt;
        hudCache.bannerSpd = spdTenths;
        const spd = (spdTenths / 10).toFixed(1);
        setTextIfChanged(
          hudCache,
          'actionBannerText',
          ui.actionBanner,
          `🪂 PARACAÍDAS ABIERTO · Alt: ${alt}m · Vel: ${spd} m/s — Planea con WASD`
        );
      }
      toggleClassIfChanged(hudCache, 'actionBannerHidden', ui.actionBanner, 'hidden', false);
    } else {
      hudCache.bannerMode = 'ground';
      toggleClassIfChanged(hudCache, 'actionBannerHidden', ui.actionBanner, 'hidden', true);
    }

    const showPointerPrompt = Boolean(
      localPlayer.alive && !localPlayer.pointerLocked && ui.gameoverScreen.classList.contains('hidden')
    );
    toggleClassIfChanged(hudCache, 'pointerHidden', ui.pointerPrompt, 'hidden', !showPointerPrompt);

    if (stormState) {
      const dpsVal = stormState.dps || 1;
      const phaseIdx = stormState.phaseIndex;
      const stMode = stormState.state;
      if (hudCache.stormState !== stMode || hudCache.stormPhase !== phaseIdx) {
        hudCache.stormState = stMode;
        hudCache.stormPhase = phaseIdx;
        const label =
          stMode === 'shrinking'
            ? `⚡ Cerrando F${phaseIdx}`
            : stMode === 'closed'
            ? `⚡ Zona Cerrada`
            : `Zona · Fase ${phaseIdx}`;
        setTextIfChanged(hudCache, 'stormPhaseText', ui.stormPhaseText, label);
      }

      const secs = Math.max(0, stormState.timer || 0);
      if (hudCache.stormSecs !== secs) {
        hudCache.stormSecs = secs;
        const mm = String(Math.floor(secs / 60)).padStart(2, '0');
        const ss = String(secs % 60).padStart(2, '0');
        setTextIfChanged(hudCache, 'stormTimerText', ui.stormTimerText, `${mm}:${ss}`);
      }

      const distCenter = Math.hypot(
        localPlayer.x - stormState.centerX,
        localPlayer.z - stormState.centerZ
      );
      const outside = Boolean(
        localPlayer.alive && localPlayer.state !== 'plane' && distCenter > stormState.radius
      );
      if (outside && hudCache.stormWarnDps !== dpsVal) {
        hudCache.stormWarnDps = dpsVal;
        setTextIfChanged(
          hudCache,
          'stormWarningText',
          ui.stormWarning,
          `⚡ ¡FUERA DE LA ZONA SEGURA! (-${dpsVal} HP/s) · DIRÍGETE AL CÍRCULO BLANCO ⚡`
        );
      }
      toggleClassIfChanged(hudCache, 'stormWarningHidden', ui.stormWarning, 'hidden', !outside);

      const vigAlpha = Math.round(Math.min(1, (world.stormAtmosphereFactor || 0) * 1.05) * 100) / 100;
      if (hudCache.stormVig !== vigAlpha) {
        hudCache.stormVig = vigAlpha;
        setStyleIfChanged(hudCache, 'stormVigOpacity', ui.stormVignette, 'opacity', String(vigAlpha));
      }
    }
  }

  return {
    update: updateHUD,
    showToast,
    spawnFloatingDamage,
    showEnemyHealthFeedback,
    flashDamage,
    showHitmarker,
    /** Objeto interactuable [E] detectado por el último sensado (loot o puerta). */
    getInteractable: () => currentInteractable
  };
}
