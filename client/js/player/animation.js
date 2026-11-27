// client/js/player/animation.js
// Animación procedural por fotograma del avatar (local y remotos): mezcla de poses (caminar, correr, agacharse,
// deslizarse, nadar, curarse, caída libre, paracaídas), respiración, retroceso, aterrizaje, flash de daño e IK de
// brazos hacia el arma. Opera sobre las piezas del rig creadas en ./avatar.js sin asignar memoria por fotograma.

import * as THREE from 'three';
import { solveArmIK } from '/Modelos%203D/cocoraModels.js';
import {
  ANIMATION_FEEL_CONFIG,
  stepPoseWeights,
  damp,
  MOVE_MODE,
  PLAYER_STATE
} from '/shared/mapData.js';

// Vectores temporales reutilizables para la IK de brazos (CERO asignaciones por fotograma)
const _ikTargetWorld = new THREE.Vector3();
const _ikTargetTorso = new THREE.Vector3();
const _ikPoleL = new THREE.Vector3();
const _ikPoleR = new THREE.Vector3();

/**
 * Crea la función de animación de un avatar. Recibe las piezas del rig y el estado mutable `st` del avatar.
 * @param {object} rig piezas del rig y estado (ver createVoxelAvatar)
 * @returns {Function} animate(walkPhase, state, equipped, pitch, moveMode, dt, isSliding, isCrouching, isHealing, horizSpeed)
 */
export function createAvatarAnimator(rig) {
  const {
    pelvisGroup,
    torsoGroup,
    chestGroup,
    ruanaGroup,
    ruanaFrontPivot,
    ruanaBackPivot,
    backpackGroup,
    neckGroup,
    headPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    healProp,
    hitFlashMats,
    weapons,
    parachute,
    st
  } = rig;

  return function animate(
    walkPhase,
    state,
    equipped,
    pitch = 0,
    moveMode = MOVE_MODE.IDLE,
    dt = 0.016,
    isSliding = false,
    isCrouching = false,
    isHealing = false,
    horizSpeed = null
  ) {
    st.breathClock += dt * 2.3;
    st.recoilAmount = damp(st.recoilAmount, 0, 16, dt);
    parachute.visible = state === PLAYER_STATE.PARACHUTING;
    const activeHeal = Boolean(isHealing && state === PLAYER_STATE.GROUND && !isSliding);
    healProp.visible = activeHeal;
    weaponMount.visible = !activeHeal && !st.hideWeaponInAds && st.lastAlpha > 0.25;

    if (st.damageFlashTimer > 0) {
      st.damageFlashTimer -= dt;
      const activeHex = st.damageFlashTimer > 0 ? 0xdc2626 : 0x000000;
      for (let i = 0; i < hitFlashMats.length; i++) {
        hitFlashMats[i].emissive.setHex(activeHex);
      }
    }

    const activeW = weapons[equipped] || weapons.fists;
    const flash = activeW?.userData?.muzzleFlash;
    if (st.flashTimer > 0) {
      st.flashTimer -= dt;
      if (flash) {
        flash.visible = true;
        flash.rotation.z = Math.random() * Math.PI;
      }
    } else if (flash) {
      flash.visible = false;
    }
    const slideGrp = activeW?.userData?.slideGroup;
    if (slideGrp && !activeW.userData.isRevolver) {
      slideGrp.position.z = -st.recoilAmount * 0.042;
    }

    const speed = 13;

    // Nado ("swimming" / swim / swim_fast / swim_idle): crol fluido con brazadas alternas, pataleo con tobillo
    // extendido y flotabilidad horizontal; o pataleo vertical suave al mantenerse en el sitio. El arma va guardada.
    const isSwimPose =
      state === PLAYER_STATE.SWIMMING ||
      moveMode === MOVE_MODE.SWIMMING ||
      moveMode === MOVE_MODE.SWIM ||
      moveMode === MOVE_MODE.SWIM_FAST ||
      moveMode === MOVE_MODE.SWIM_IDLE;

    if (isSwimPose) {
      weaponMount.visible = false;
      const moving = moveMode !== MOVE_MODE.SWIM_IDLE;
      const stroke = walkPhase;
      pelvisGroup.position.y = damp(pelvisGroup.position.y, moving ? 1.02 : 0.90, 8, dt);
      pelvisGroup.rotation.set(
        damp(pelvisGroup.rotation.x, moving ? 1.08 : 0.14, 7, dt),
        damp(pelvisGroup.rotation.y || 0, moving ? Math.sin(stroke) * 0.08 : 0, 8, dt),
        damp(pelvisGroup.rotation.z || 0, moving ? Math.cos(stroke) * 0.06 : 0, 8, dt)
      );
      torsoGroup.rotation.set(
        damp(torsoGroup.rotation.x, moving ? 0.10 : 0.04, 8, dt),
        damp(torsoGroup.rotation.y, moving ? Math.sin(stroke) * 0.24 : 0, 8, dt),
        damp(torsoGroup.rotation.z, 0, 8, dt)
      );
      if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, moving ? 0.16 : 0.06, 8, dt);
      if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, moving ? -0.38 : -0.14, 8, dt);
      if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, moving ? -0.32 : -0.05, 8, dt), 0, 0);

      if (moving) {
        rightArm.shoulder.rotation.set(-1.55 + Math.sin(stroke) * 1.55, 0, -0.18);
        leftArm.shoulder.rotation.set(-1.55 - Math.sin(stroke) * 1.55, 0, 0.18);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.25 - Math.max(0, Math.cos(stroke)) * 0.72, 14, dt), 0, 0);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.25 - Math.max(0, -Math.cos(stroke)) * 0.72, 14, dt), 0, 0);
        const kick = Math.sin(stroke * 3) * 0.34;
        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, kick, 18, dt), 0, 0.04);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -kick, 18, dt), 0, -0.04);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.22 + Math.max(0, kick), 18, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.22 + Math.max(0, -kick), 18, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.42, 14, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.42, 14, dt);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.68, 10, dt), Math.sin(stroke) * 0.14, 0);
      } else {
        const tread = Math.sin(st.breathClock * 2.6);
        rightArm.shoulder.rotation.set(-0.55 + tread * 0.22, 0, -0.75 - tread * 0.28);
        leftArm.shoulder.rotation.set(-0.55 - tread * 0.22, 0, 0.75 + tread * 0.28);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.52, 10, dt), 0, 0);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.52, 10, dt), 0, 0);
        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.35 + tread * 0.35, 10, dt), 0, 0.06);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.35 - tread * 0.35, 10, dt), 0, -0.06);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.78, 10, dt);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.78, 10, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.24 - tread * 0.18, 10, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.24 + tread * 0.18, 10, dt);
        headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.5, 10, dt), 0, 0);
      }
      return;
    }

    if (state === PLAYER_STATE.PLANE) {
      if (moveMode === MOVE_MODE.STAND) {
        // 1. Levantarse suavemente desde el banco lateral de la bodega (~0.35s)
        const u = Math.max(0, Math.min(1, walkPhase / 1.6));
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.50 + u * 0.46, 14, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.14 * (1 - u), 14, dt), 0, 0);
        torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.28 - u * 0.18, 14, dt), 0, 0);
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.26 - u * 0.18, 14, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.06, 14, dt);
        if (neckGroup) neckGroup.rotation.set(0, 0, 0);

        const hipTarget = -1.48 + u * 1.38;
        const kneeTarget = 1.52 - u * 1.38;
        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, hipTarget, 14, dt), 0, 0.05);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeTarget, 14, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, hipTarget + 0.08 * u, 14, dt), 0, -0.05);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeTarget, 14, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -0.10 * u, 14, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -0.10 * u, 14, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.45 + u * 0.15, 14, dt), 0, 0.10);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.85 + u * 0.30, 14, dt), 0, 0);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45 + u * 0.15, 14, dt), 0, -0.10);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.85 + u * 0.30, 14, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, 0.05 * (1 - u), 14, dt), 0, 0);
        return;
      }

      if (moveMode === MOVE_MODE.WALK_CABIN) {
        // 2. Avanzar por el pasillo central antideslizante hacia el borde de la rampa trasera abierta
        const sPhi = Math.sin(walkPhase);
        const cPhi = Math.cos(walkPhase);
        const thL = -0.52 * sPhi;
        const thR = 0.52 * sPhi;
        const kneeL = 0.12 + 0.92 * Math.pow(Math.max(0, cPhi), 1.4);
        const kneeR = 0.12 + 0.92 * Math.pow(Math.max(0, -cPhi), 1.4);

        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.95 - 0.03 * sPhi * sPhi, 16, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.08, 14, dt), 0.06 * sPhi, 0);
        torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.14, 14, dt), -0.05 * sPhi, 0);
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.12, 14, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.18, 14, dt);
        if (neckGroup) neckGroup.rotation.set(-0.04, 0, 0);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, thL, 18, dt), 0, 0.04);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, kneeL, 18, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, thR, 18, dt), 0, -0.04);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, kneeR, 18, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, -(thL + kneeL) * 0.55, 16, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, -(thR + kneeR) * 0.55, 16, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.35 - 0.42 * sPhi, 16, dt), 0, 0.08);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.62, 16, dt), 0, 0);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45 + 0.36 * sPhi, 16, dt), 0, -0.08);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.68, 16, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.04, 14, dt), 0, 0);
        return;
      }

      if (moveMode === MOVE_MODE.RAMP_JUMP) {
        // 3. Salto atlético desde el labio de la rampa hacia el vacío antes de desacoplarse a skydiving
        pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.92, 18, dt);
        pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.48, 18, dt), 0, 0);
        torsoGroup.rotation.set(damp(torsoGroup.rotation.x, 0.28, 18, dt), 0, 0);
        if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.18, 18, dt);
        if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.62, 18, dt);
        if (neckGroup) neckGroup.rotation.set(-0.22, 0, 0);

        leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.92, 18, dt), 0, 0.12);
        leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.24, 18, dt);
        rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, 0.38, 18, dt), 0, -0.12);
        rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.32, 18, dt);
        if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.35, 18, dt);
        if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.45, 18, dt);

        leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -1.55, 18, dt), 0, -0.42);
        leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.35, 18, dt), 0, 0);
        rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -1.55, 18, dt), 0, 0.42);
        rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.35, 18, dt), 0, 0);
        headPivot.rotation.set(damp(headPivot.rotation.x, -0.24, 18, dt), 0, 0);
        st.wasAirborne = true;
        return;
      }
    }

    if (state === PLAYER_STATE.PLANE || moveMode === MOVE_MODE.SEATED) {
      const turb = Math.sin(st.breathClock * 1.4) * 0.035;
      pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.50, speed, dt);
      pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0, speed, dt), 0, 0);
      torsoGroup.rotation.set(
        damp(torsoGroup.rotation.x, 0.06 + turb, speed, dt),
        0,
        damp(torsoGroup.rotation.z, turb * 1.1, speed, dt)
      );
      if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.28, speed, dt);
      if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.04, speed, dt);
      if (neckGroup) neckGroup.rotation.set(0, 0, 0);
      leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -1.48, speed, dt), 0, 0.05);
      leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 1.52, speed, dt);
      rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -1.48, speed, dt), 0, -0.05);
      rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.52, speed, dt);
      if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0, speed, dt);
      if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0, speed, dt);

      leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -0.45, speed, dt), 0, 0.08);
      leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.95, speed, dt), 0, 0);
      rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -0.45, speed, dt), 0, -0.08);
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.95, speed, dt), 0, 0);
      headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.5, speed, dt), 0, 0);
      return;
    }

    if (state === PLAYER_STATE.SKYDIVING) {
      // Animación v2 ('fall'): caída libre en arco de paracaidista con aleteo independiente de ruanaF y ruanaB
      const t = st.breathClock * 0.44;
      const flutter = Math.sin(st.breathClock * 8) * 0.075;
      pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.86, speed, dt);
      pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 1.05 - pitch * 0.32, 10, dt), 0, 0);
      torsoGroup.rotation.set(damp(torsoGroup.rotation.x, -0.22, 10, dt), 0, flutter * 0.5);
      if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, -0.35, 10, dt), 0, 0);
      headPivot.rotation.set(damp(headPivot.rotation.x, -0.28, 10, dt), 0, 0);

      if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.46 + 0.10 * Math.sin(t * 13), 14, dt);
      if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.76 + 0.10 * Math.sin(t * 11), 14, dt);

      leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -2.18 + flutter, 10, dt), 0, -0.52);
      leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, -0.38, 10, dt), 0, 0);
      rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -2.18 - flutter, 10, dt), 0, 0.52);
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.38, 10, dt), 0, 0);

      leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, 0.25, 10, dt), 0, 0.18);
      leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.90 + 0.10 * Math.sin(t * 7), 10, dt);
      rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, 0.25, 10, dt), 0, -0.18);
      rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.90 + 0.10 * Math.sin(t * 7 + 2), 10, dt);
      if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.40, 10, dt);
      if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.40, 10, dt);
      st.wasAirborne = true;
      return;
    }

    if (state === PLAYER_STATE.PARACHUTING) {
      // Animación v2 ('parachute'): manos en las bandas resueltas con IK analítico de 2 huesos (solveArmIK)
      const sway = Math.sin(st.breathClock * 1.3) * 0.05;
      pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.88, speed, dt);
      pelvisGroup.rotation.set(damp(pelvisGroup.rotation.x, 0.05 + sway, speed, dt), 0, sway * 0.6);
      torsoGroup.rotation.set(damp(torsoGroup.rotation.x, -0.04, speed, dt), 0, sway);
      parachute.rotation.z = sway;
      if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, -0.06 + sway * 0.8, 10, dt);
      if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, 0.04, 10, dt);
      if (neckGroup) neckGroup.rotation.set(damp(neckGroup.rotation.x, -0.12, speed, dt), 0, 0);

      _ikTargetTorso.set(0.30, 0.94, 0.06);
      _ikPoleL.set(1.0, -0.3, 0);
      solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

      _ikTargetTorso.set(-0.30, 0.94, 0.06);
      _ikPoleR.set(-1.0, -0.3, 0);
      solveArmIK(rightArm.shoulder, rightArm.elbow, _ikTargetTorso, _ikPoleR, 0.28, 0.31);

      leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, -0.30, speed, dt), 0, 0.08);
      leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.40, speed, dt);
      rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -0.12, speed, dt), 0, -0.08);
      rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 0.25, speed, dt);
      if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.35, speed, dt);
      if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.30, speed, dt);
      headPivot.rotation.set(damp(headPivot.rotation.x, -0.15 - pitch * 0.35, speed, dt), sway * 0.8, 0);
      st.wasAirborne = true;
      return;
    }

    pelvisGroup.rotation.set(
      damp(pelvisGroup.rotation.x, 0, speed, dt),
      damp(pelvisGroup.rotation.y || 0, 0, speed, dt),
      damp(pelvisGroup.rotation.z || 0, 0, speed, dt)
    );

    if (moveMode === MOVE_MODE.VAULT) {
      // Animación v2 ('vault'): pierna derecha flexionada sobre el obstáculo, pierna izquierda impulsando,
      // torso inclinado lateralmente y mano izquierda apoyada al frente mediante IK de 2 huesos.
      pelvisGroup.position.y = damp(pelvisGroup.position.y, 0.92, 18, dt);
      pelvisGroup.rotation.set(
        damp(pelvisGroup.rotation.x, 0.15, 18, dt),
        0,
        damp(pelvisGroup.rotation.z || 0, -0.15, 18, dt)
      );
      torsoGroup.rotation.set(
        damp(torsoGroup.rotation.x, 0.22, 18, dt),
        damp(torsoGroup.rotation.y, 0.12, 18, dt),
        damp(torsoGroup.rotation.z, -0.20, 18, dt)
      );
      if (ruanaFrontPivot) ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, 0.50, 18, dt);
      if (ruanaBackPivot) ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, -0.30, 18, dt);
      if (neckGroup) neckGroup.rotation.set(0, 0.18, 0.05);

      rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, -1.45, 18, dt), 0, damp(rightLeg.hip.rotation.z || 0, -0.42, 18, dt));
      rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, 1.85, 18, dt);
      if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, 0.20, 18, dt);

      leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, 0.50, 18, dt), 0, damp(leftLeg.hip.rotation.z || 0, 0.12, 18, dt));
      leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, 0.45, 18, dt);
      if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, 0.55, 18, dt);

      _ikTargetTorso.set(0.22, -0.02, 0.36);
      _ikPoleL.set(0.7, -1.0, -0.2);
      solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

      rightArm.shoulder.rotation.set(damp(rightArm.shoulder.rotation.x, -1.15, 18, dt), 0.15, -0.22);
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.45, 18, dt), 0, 0);
      headPivot.rotation.set(damp(headPivot.rotation.x, -0.14, 16, dt), 0.08, 0.12);
      st.wasAirborne = true;
      return;
    }

    // Mezcla continua de poses por pesos (blending: idle, walk, sprint, crouch, slide y salto/caída)
    const isJump = moveMode === MOVE_MODE.JUMP;
    const isFall = moveMode === MOVE_MODE.FALL;
    const isAir = isJump || isFall;
    const isSlideNow = Boolean(isSliding || moveMode === MOVE_MODE.SLIDE);
    const isSprint = moveMode === MOVE_MODE.SPRINT;
    const isWalk = moveMode === MOVE_MODE.WALK || isSprint || moveMode === MOVE_MODE.CROUCH_WALK;

    const w = stepPoseWeights(
      st.poseWeights,
      {
        isSliding: isSlideNow,
        isAir,
        isCrouching: Boolean(isCrouching),
        isSprint,
        isWalk,
        horizSpeed
      },
      dt,
      ANIMATION_FEEL_CONFIG
    );

    if (st.wasAirborne && !isAir && !isSlideNow) {
      st.landingCompression = 0.18;
    }
    st.wasAirborne = isAir;
    st.landingCompression = damp(st.landingCompression, 0, 10, dt);

    const breath = Math.sin(st.breathClock * 0.75);
    const sw = Math.sin(st.breathClock * 0.35);
    const sPhi = Math.sin(walkPhase);
    const cPhi = Math.cos(walkPhase);
    const locoWeight = w.walk + w.sprint + w.crouch * (moveMode === MOVE_MODE.CROUCH_WALK || (horizSpeed || 0) > 0.25 ? 1 : 0);
    const runFactor = w.sprint;

    const strideAmp = activeHeal
      ? 0.28 * locoWeight
      : w.walk * 0.44 + w.sprint * 0.78 + w.crouch * (moveMode === MOVE_MODE.CROUCH_WALK || (horizSpeed || 0) > 0.25 ? 0.40 : 0);
    const thL = -strideAmp * sPhi;
    const thR = strideAmp * sPhi;

    const walkVertBob = -(0.02 + 0.03 * runFactor) - (0.035 + 0.03 * runFactor) * sPhi * sPhi;
    const idleVertBob = -0.008 * (1 + Math.sin(st.breathClock * 0.8));
    const blendedPelvisY =
      (w.idle + w.walk + w.sprint + w.air) * (activeHeal ? 0.92 : 0.985) +
      w.crouch * 0.64 +
      w.slide * 0.44 +
      (w.walk + w.sprint) * walkVertBob +
      w.idle * idleVertBob -
      st.landingCompression * (1 - w.slide);

    const blendedPelvisRotX =
      (w.walk + w.sprint) * (0.04 + 0.08 * runFactor) +
      w.slide * -0.48;
    const blendedPelvisRotY = (w.walk + w.sprint) * (0.07 * sPhi);
    const blendedPelvisRotZ = (w.walk + w.sprint) * (0.025 * cPhi);

    pelvisGroup.position.y = damp(pelvisGroup.position.y, blendedPelvisY, 16, dt);
    pelvisGroup.rotation.set(
      damp(pelvisGroup.rotation.x, blendedPelvisRotX, 15, dt),
      damp(pelvisGroup.rotation.y || 0, blendedPelvisRotY, 15, dt),
      damp(pelvisGroup.rotation.z || 0, blendedPelvisRotZ, 15, dt)
    );

    if (chestGroup) {
      chestGroup.scale.y = 1 + breath * 0.015;
    }
    if (ruanaFrontPivot && ruanaBackPivot) {
      const ruanaFWalk = 0.05 + Math.max(0, Math.max(-thL, -thR) - 0.15) * 0.6;
      const targetRuanaF =
        w.slide * 0.58 +
        w.air * 0.35 +
        (w.walk + w.sprint) * ruanaFWalk +
        (w.idle + w.crouch) * 0.04;
      const ruanaBWalk = -0.05 - 0.28 * runFactor + 0.05 * Math.sin(st.breathClock * 3.8) * runFactor;
      const targetRuanaB =
        w.slide * -0.16 +
        w.air * -0.25 +
        (w.walk + w.sprint) * ruanaBWalk +
        (w.idle + w.crouch) * -0.03;
      ruanaFrontPivot.rotation.x = damp(ruanaFrontPivot.rotation.x, targetRuanaF, 14, dt);
      ruanaBackPivot.rotation.x = damp(ruanaBackPivot.rotation.x, targetRuanaB, 14, dt);
    }
    if (ruanaGroup) {
      const targetRuanaZ = (w.walk + w.sprint) * (thL * 0.07) + w.idle * (breath * 0.012);
      ruanaGroup.rotation.set(0, 0, damp(ruanaGroup.rotation.z, targetRuanaZ, 12, dt));
    }
    if (backpackGroup) {
      const targetPack =
        (w.walk + w.sprint) * (0.05 * Math.sin(walkPhase * 2) * (0.5 + runFactor)) +
        w.idle * (0.012 * breath);
      backpackGroup.rotation.x = damp(backpackGroup.rotation.x, targetPack, 14, dt);
    }

    const idleTorsoPitch = 0.06 - pitch * 0.35 + st.landingCompression * 0.5 + breath * 0.015;
    const targetTorsoPitch = activeHeal
      ? 0.16
      : w.slide * (0.38 - pitch * 0.45) +
        w.crouch * 0.32 +
        w.sprint * 0.26 +
        w.air * 0.14 +
        (w.idle + w.walk) * idleTorsoPitch;
    const targetTorsoYaw = w.slide * -0.18 + (w.walk + w.sprint) * (-0.06 * sPhi);
    const targetTorsoRoll = w.slide * 0.12;
    torsoGroup.rotation.set(
      damp(torsoGroup.rotation.x, targetTorsoPitch - st.recoilAmount * 0.05, speed, dt),
      damp(torsoGroup.rotation.y, targetTorsoYaw, speed, dt),
      damp(torsoGroup.rotation.z, targetTorsoRoll, speed, dt)
    );
    if (neckGroup) {
      const neckPitch = activeHeal ? 0.22 : -0.12 * w.sprint;
      neckGroup.rotation.set(damp(neckGroup.rotation.x, neckPitch, 14, dt), 0, 0);
    }

    // Poses individuales de tren inferior para mezcla ponderada sin cortes
    const landingKnee = st.landingCompression * 1.5 * (1 - w.slide);

    // 1) Idle
    const idleKL = 0.11 + 0.03 * sw + landingKnee;
    const idleKR = 0.11 - 0.03 * sw + landingKnee;
    const idleHipL = -0.10 - landingKnee * 0.5;
    const idleHipR = 0.08 - landingKnee * 0.5;
    const idleAnkleL = -idleKL * 0.85;
    const idleAnkleR = -idleKR * 0.85;

    // 2) Walk + Sprint
    const wsWeight = w.walk + w.sprint;
    const wsRunRatio = wsWeight > 1e-4 ? w.sprint / wsWeight : 0;
    const kAmp = 0.85 + 0.70 * wsRunRatio;
    const walkKL = 0.10 + kAmp * Math.pow(Math.max(0, cPhi), 1.5) + 0.12 * Math.max(0, sPhi) * wsRunRatio + landingKnee;
    const walkKR = 0.10 + kAmp * Math.pow(Math.max(0, -cPhi), 1.5) + 0.12 * Math.max(0, -sPhi) * wsRunRatio + landingKnee;
    const pushL = strideAmp > 1e-4 ? Math.max(0, thL / strideAmp) : 0;
    const pushR = strideAmp > 1e-4 ? Math.max(0, thR / strideAmp) : 0;
    const walkAnkleL = -(thL + walkKL) * 0.65 + 0.32 * pushL * (0.6 + wsRunRatio);
    const walkAnkleR = -(thR + walkKR) * 0.65 + 0.32 * pushR * (0.6 + wsRunRatio);
    const walkHipL = thL - landingKnee * 0.5;
    const walkHipR = thR - landingKnee * 0.5;

    // 3) Crouch
    const crouchHipL = -0.78 + thL * 0.5;
    const crouchHipR = -0.78 + thR * 0.5;
    const crouchK = 1.38;
    const crouchAnkle = -0.25;

    // 4) Slide
    const slideHipL = -1.02;
    const slideHipR = -0.18;
    const slideKL = 0.12;
    const slideKR = 2.02;
    const slideAnkleL = -0.15;
    const slideAnkleR = 0.35;

    // 5) Air (Jump / Fall)
    const rising = isJump ? 1.0 : 0.25;
    const airHipL = -0.55 - 0.35 * rising;
    const airHipR = -0.25 - 0.30 * rising;
    const airKL = 0.78 + 0.52 * rising;
    const airKR = 0.58 + 0.40 * rising;
    const airAnkleL = 0.34;
    const airAnkleR = 0.28;

    const finalHipLX = w.idle * idleHipL + wsWeight * walkHipL + w.crouch * crouchHipL + w.slide * slideHipL + w.air * airHipL;
    const finalHipRX = w.idle * idleHipR + wsWeight * walkHipR + w.crouch * crouchHipR + w.slide * slideHipR + w.air * airHipR;
    const finalHipLZ = 0.04 * (1 - w.slide) + 0.08 * w.slide;
    const finalHipRZ = -0.04 * (1 - w.slide) - 0.38 * w.slide;
    const finalKL = w.idle * idleKL + wsWeight * walkKL + w.crouch * crouchK + w.slide * slideKL + w.air * airKL;
    const finalKR = w.idle * idleKR + wsWeight * walkKR + w.crouch * crouchK + w.slide * slideKR + w.air * airKR;
    const finalAnkleL = w.idle * idleAnkleL + wsWeight * walkAnkleL + w.crouch * crouchAnkle + w.slide * slideAnkleL + w.air * airAnkleL;
    const finalAnkleR = w.idle * idleAnkleR + wsWeight * walkAnkleR + w.crouch * crouchAnkle + w.slide * slideAnkleR + w.air * airAnkleR;

    leftLeg.hip.rotation.set(damp(leftLeg.hip.rotation.x, finalHipLX, 16, dt), 0, damp(leftLeg.hip.rotation.z || 0, finalHipLZ, 16, dt));
    rightLeg.hip.rotation.set(damp(rightLeg.hip.rotation.x, finalHipRX, 16, dt), 0, damp(rightLeg.hip.rotation.z || 0, finalHipRZ, 16, dt));
    leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, finalKL, 16, dt);
    rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, finalKR, 16, dt);
    if (leftLeg.ankle) leftLeg.ankle.rotation.x = damp(leftLeg.ankle.rotation.x, finalAnkleL, 16, dt);
    if (rightLeg.ankle) rightLeg.ankle.rotation.x = damp(rightLeg.ankle.rotation.x, finalAnkleR, 16, dt);

    const recoilKick = st.recoilAmount * 0.28;
    const isTwoHandLongGun =
      equipped === 'assault_rifle' ||
      equipped === 'rifle' ||
      equipped === 'shotgun' ||
      equipped === 'smg' ||
      equipped === 'sniper';
    const sprintCarryW = st.recoilAmount < 0.05 ? w.sprint * (1 - w.slide) : 0;

    if (activeHeal) {
      // Animación v2 ('heal'): botiquín sostenido entre ambas manos mediante IK analítico de 2 huesos
      const wrapMotion = Math.sin(st.breathClock * 6.5) * 0.035;
      healProp.position.set(0, 0.20 + Math.abs(wrapMotion) * 0.6, 0.34);
      healProp.rotation.z = wrapMotion * 2.2;

      _ikTargetTorso.set(0.10, 0.22 + wrapMotion, 0.33);
      _ikPoleL.set(0.8, -1.0, -0.2);
      solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);

      _ikTargetTorso.set(-0.10, 0.22 - wrapMotion, 0.33);
      _ikPoleR.set(-0.8, -1.0, -0.2);
      solveArmIK(rightArm.shoulder, rightArm.elbow, _ikTargetTorso, _ikPoleR, 0.28, 0.31);

      headPivot.rotation.set(damp(headPivot.rotation.x, 0.26, 14, dt), 0, 0);
      return;
    }

    if (isTwoHandLongGun) {
      const aimShoulderX = -1.34 - pitch * 0.72 + recoilKick;
      const aimShoulderY = -0.08;
      const aimElbowX = -0.26 - recoilKick * 0.6;
      const targetShX = aimShoulderX * (1 - sprintCarryW) + -0.98 * sprintCarryW;
      const targetShY = aimShoulderY * (1 - sprintCarryW) + 0.38 * sprintCarryW;
      const targetShZ = -0.06 * sprintCarryW;
      const targetElX = aimElbowX * (1 - sprintCarryW) + -0.68 * sprintCarryW;

      rightArm.shoulder.rotation.set(
        damp(rightArm.shoulder.rotation.x, targetShX, 18, dt),
        damp(rightArm.shoulder.rotation.y, targetShY, speed, dt),
        damp(rightArm.shoulder.rotation.z || 0, targetShZ, speed, dt)
      );
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, targetElX, 18, dt), 0, 0);
      // IK analítico de 2 huesos (solveArmIK): mano izquierda sujeta exactamente el guardamanos de cada arma de Armas v1
      torsoGroup.updateMatrixWorld(true);
      if (activeW?.userData?.forendGripPos) {
        _ikTargetWorld.copy(activeW.userData.forendGripPos);
        activeW.localToWorld(_ikTargetWorld);
      } else {
        _ikTargetWorld.set(0.0, 0.02, 0.24);
        weaponMount.localToWorld(_ikTargetWorld);
      }
      _ikTargetTorso.copy(_ikTargetWorld);
      torsoGroup.worldToLocal(_ikTargetTorso);
      _ikPoleL.set(0.55, -1.0, 0.10);
      solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);
    } else if (equipped === 'pistol' || equipped === 'revolver') {
      const handgunKick = equipped === 'revolver' ? recoilKick * 1.55 : recoilKick * 1.2;
      rightArm.shoulder.rotation.set(
        damp(rightArm.shoulder.rotation.x, -1.42 - pitch * 0.8 + handgunKick, 18, dt),
        damp(rightArm.shoulder.rotation.y, -0.05, speed, dt),
        0
      );
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.15 - recoilKick * 0.5, 18, dt), 0, 0);
      torsoGroup.updateMatrixWorld(true);
      _ikTargetWorld.set(0.03, -0.02, 0.04);
      weaponMount.localToWorld(_ikTargetWorld);
      _ikTargetTorso.copy(_ikTargetWorld);
      torsoGroup.worldToLocal(_ikTargetTorso);
      _ikPoleL.set(0.65, -1.0, 0.05);
      solveArmIK(leftArm.shoulder, leftArm.elbow, _ikTargetTorso, _ikPoleL, 0.28, 0.31);
    } else {
      const armSwing =
        moveMode === MOVE_MODE.WALK || moveMode === MOVE_MODE.SPRINT
          ? Math.sin(walkPhase) * (moveMode === MOVE_MODE.SPRINT ? 0.8 : 0.48)
          : Math.sin(st.breathClock) * 0.04;
      const slash = st.recoilAmount * 1.35;
      rightArm.shoulder.rotation.set(
        damp(rightArm.shoulder.rotation.x, -0.58 + armSwing - slash, 16, dt),
        0.1,
        -0.12
      );
      rightArm.elbow.rotation.set(damp(rightArm.elbow.rotation.x, -0.55 + slash * 0.4, 16, dt), 0, 0);
      leftArm.shoulder.rotation.set(damp(leftArm.shoulder.rotation.x, -armSwing, 16, dt), 0, 0.06);
      leftArm.elbow.rotation.set(damp(leftArm.elbow.rotation.x, moveMode === MOVE_MODE.SPRINT ? -0.85 : -0.32, 16, dt), 0, 0);
    }

    headPivot.rotation.set(damp(headPivot.rotation.x, -pitch * 0.58 - st.recoilAmount * 0.03, 16, dt), 0, 0);
  };
}
