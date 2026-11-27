// client/js/player/camera.js
// Cámara del jugador local: 1ra/3ra persona, vistas del avión, resorte crítico, sacudidas, head-bob, caída al
// aterrizar y anti-clipping en 3ra persona (raycast + bigotes). Métodos mezclados en LocalPlayerController.prototype.

import * as THREE from 'three';
import {
  WEAPONS,
  MOVEMENT_CONFIG,
  CAMERA_FEEL_CONFIG,
  PLAYER_EYE_HEIGHT,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_SLIDE_EYE_HEIGHT,
  stepCriticallyDampedSpring,
  stepCriticallyDampedSpring3D,
  raycastVoxels,
  PLAYER_STATE
} from '/shared/mapData.js';

const _camLookDir = new THREE.Vector3();
const _camRightVec = new THREE.Vector3();
const _camBackDir = new THREE.Vector3();
const _camPivot = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
export const _planeAnchor = new THREE.Vector3();

// Margen de seguridad (0.3 unidades) y estructuras reutilizables para anti-clipping de cámara en 3ra persona
export const CAMERA_COLLISION_OFFSET = 0.30;
const _camRaycaster = new THREE.Raycaster();
const _camRayHits = [];
const _camNearbyMeshes = [];
const _camWhiskerOrigin = new THREE.Vector3();

export const cameraMethods = {
  onResize(aspect) {
    this.fpRig.setAspect(aspect);
  },

  triggerCameraShake(intensity = 0.24, durationSec = 0.36) {
    this.shakeIntensity = intensity;
    this.shakeDuration = Math.max(0.05, durationSec);
    this.shakeTimer = this.shakeDuration;
  },

  setHeadBobEnabled(enabled) {
    this.headBobEnabled = Boolean(enabled);
  },

  applyLandingCameraDip(impactSpeedMps) {
    if (!(impactSpeedMps > 1.8)) return;
    const dip = Math.min(CAMERA_FEEL_CONFIG.landingMaxDip, impactSpeedMps * CAMERA_FEEL_CONFIG.landingDipPerMps);
    this.landingSpring.value = Math.max(-CAMERA_FEEL_CONFIG.landingMaxDip, this.landingSpring.value - dip * 0.65);
    this.landingSpring.vel -= dip * CAMERA_FEEL_CONFIG.landingSpringOmega * 1.4;
    this.cameraLandingOffset = this.landingSpring.value;
  },

  toggleCameraMode() {
    if (this.state === PLAYER_STATE.PLANE) {
      if (this.planeViewMode === 'cabin_third') {
        this.planeViewMode = 'cabin_first';
        this.cameraMode = 'first';
        this.onCameraModeChanged?.('cabin_first');
      } else if (this.planeViewMode === 'cabin_first') {
        this.planeViewMode = 'plane_exterior';
        this.cameraMode = 'third';
        this.onCameraModeChanged?.('plane_exterior');
      } else {
        this.planeViewMode = 'cabin_third';
        this.cameraMode = 'third';
        this.onCameraModeChanged?.('cabin_third');
      }
      return;
    }

    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    this.onCameraModeChanged?.(this.cameraMode);
  },

  updateCamera(dt, mapData, planeState, worldInstance, movingHoriz, sprinting, sniperAds) {
    this.cameraLandingOffset = stepCriticallyDampedSpring(
      this.landingSpring,
      0,
      CAMERA_FEEL_CONFIG.landingSpringOmega,
      dt
    );

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / this.shakeDuration;
      const amp = this.shakeIntensity * decay;
      shakeX = (Math.random() - 0.5) * 2 * amp;
      shakeY = (Math.random() - 0.5) * 2 * amp;
    }

    const viewYaw = this.yaw + (this.recoilState?.yaw || 0);
    const viewPitch = Math.max(-1.42, Math.min(1.32, this.pitch + (this.recoilState?.pitch || 0)));
    const cosP = Math.cos(viewPitch);
    _camLookDir.set(Math.sin(viewYaw) * cosP, Math.sin(viewPitch), Math.cos(viewYaw) * cosP).normalize();
    _camRightVec.set(-Math.cos(viewYaw), 0, Math.sin(viewYaw));

    if (this.alive && this.state === PLAYER_STATE.PLANE && planeState && worldInstance) {
      const rig = worldInstance.getActiveAircraftRig?.();
      const targetPlaneFov = this.planeViewMode === 'plane_exterior' ? 74 : 76;
      const newPlaneFov = stepCriticallyDampedSpring(this.fovSpring, targetPlaneFov, CAMERA_FEEL_CONFIG.fovSpringOmega, dt);
      if (Math.abs(newPlaneFov - this.camera.fov) > 0.005) {
        this.camera.fov = newPlaneFov;
        this.camera.updateProjectionMatrix();
      }

      if (this.planeViewMode === 'cabin_first') {
        const eyeLift = this.isCabinDisembarking ? 1.56 : 1.18;
        this.camera.position.set(this.x, this.y + eyeLift, this.z);
        _camTarget.copy(this.camera.position).addScaledVector(_camLookDir, 30);
        this.camera.lookAt(_camTarget);
      } else if (this.planeViewMode === 'plane_exterior') {
        const extDist = rig?.cameraExteriorDistance || 24.5;
        worldInstance.getPlaneSmoothAnchor(0, 1.2, 0, _planeAnchor);
        _camPos.copy(_planeAnchor).addScaledVector(_camLookDir, -extDist);
        _camPos.y = Math.max(_planeAnchor.y - 6, _camPos.y);
        this.camera.position.copy(_camPos);
        this.camera.lookAt(_planeAnchor);
      } else {
        const camLocal = rig?.cameraInteriorAnchor;
        worldInstance.getPlaneSmoothAnchor(
          camLocal ? camLocal.x : 0,
          camLocal ? camLocal.y : 0.48,
          camLocal ? camLocal.z : 1.85,
          _planeAnchor
        );
        this.camera.position.copy(_planeAnchor);
        _camTarget.copy(_planeAnchor).addScaledVector(_camLookDir, 30);
        this.camera.lookAt(_camTarget);
      }

      this.smoothCamPos.copy(this.camera.position);
      this.smoothCamVel.set(0, 0, 0);
      return;
    }

    const wSpec = WEAPONS[this.equipped] || WEAPONS.fists;
    const camX = this.x + (this.reconcileOffsetX || 0);
    const camY = this.y + (this.reconcileOffsetY || 0);
    const camZ = this.z + (this.reconcileOffsetZ || 0);

    // Apertura progresiva de FOV (+3° a +5°) proporcional a la velocidad real alcanzada al esprintar/deslizarse
    const horizSpeed = Math.hypot(this.vx || 0, this.vz || 0);
    const speedOverWalk = Math.max(
      0,
      Math.min(1, (horizSpeed - MOVEMENT_CONFIG.walkSpeed * 0.85) / Math.max(0.5, MOVEMENT_CONFIG.sprintSpeed - MOVEMENT_CONFIG.walkSpeed * 0.85))
    );
    const sprintFovFactor = this.isSliding ? 1.0 : sprinting ? speedOverWalk : 0;
    const sprintFovDelta = CAMERA_FEEL_CONFIG.sprintFovBoostDeg * sprintFovFactor;

    const canApplyBob =
      this.headBobEnabled &&
      this.state === PLAYER_STATE.GROUND &&
      movingHoriz &&
      this.onGround &&
      !this.isSliding &&
      !this.isSwimming;
    const bobSpeedWeight = Math.min(1.0, horizSpeed / Math.max(1, MOVEMENT_CONFIG.walkSpeed));
    const bobSprintScale = sprinting ? CAMERA_FEEL_CONFIG.headBobSprintMult : 1.0;
    const adsBobAtten = this.aimingZoom ? 0.22 : 1.0;

    if ((this.cameraMode === 'first' || sniperAds) && this.alive) {
      let targetFov = CAMERA_FEEL_CONFIG.baseFirstFov + sprintFovDelta;
      if (this.state === PLAYER_STATE.SKYDIVING) targetFov = 86 + Math.min(8, this.currentDescentSpeed * 0.18);
      else if (this.aimingZoom && this.equipped !== 'fists') targetFov = wSpec.adsFov || 56;
      const newFirstFov = stepCriticallyDampedSpring(this.fovSpring, targetFov, CAMERA_FEEL_CONFIG.fovSpringOmega, dt);
      if (Math.abs(newFirstFov - this.camera.fov) > 0.005) {
        this.camera.fov = newFirstFov;
        this.camera.updateProjectionMatrix();
      }

      const targetEye = this.isSliding
        ? PLAYER_SLIDE_EYE_HEIGHT
        : this.isCrouching
        ? PLAYER_CROUCH_EYE_HEIGHT
        : PLAYER_EYE_HEIGHT;
      this.smoothEyeHeight = stepCriticallyDampedSpring(
        this.eyeHeightSpring,
        targetEye,
        CAMERA_FEEL_CONFIG.pivotSpringOmega,
        dt
      );

      let bobX = 0;
      let bobY = 0;
      if (canApplyBob) {
        const ampScale = bobSpeedWeight * bobSprintScale * adsBobAtten;
        bobX = Math.cos(this.walkPhase) * CAMERA_FEEL_CONFIG.headBobFirstAmpX * ampScale;
        bobY = Math.sin(this.walkPhase * 2) * CAMERA_FEEL_CONFIG.headBobFirstAmpY * ampScale;
      }

      this.camera.position.set(
        camX + _camRightVec.x * bobX + shakeX,
        camY + this.smoothEyeHeight + bobY + this.cameraLandingOffset + shakeY,
        camZ + _camRightVec.z * bobX
      );
      _camTarget.copy(this.camera.position).addScaledVector(_camLookDir, 35);
      this.camera.lookAt(_camTarget);
      this.smoothCamPos.copy(this.camera.position);
      this.smoothCamVel.set(0, 0, 0);
      return;
    }

    let targetFov = this.aimingZoom
      ? (wSpec.adsFov || 54)
      : CAMERA_FEEL_CONFIG.baseThirdFov + sprintFovDelta;
    if (this.state === PLAYER_STATE.SKYDIVING) targetFov = 76 + Math.min(8, this.currentDescentSpeed * 0.2);
    const newThirdFov = stepCriticallyDampedSpring(this.fovSpring, targetFov, CAMERA_FEEL_CONFIG.fovSpringOmega, dt);
    if (Math.abs(newThirdFov - this.camera.fov) > 0.005) {
      this.camera.fov = newThirdFov;
      this.camera.updateProjectionMatrix();
    }

    let desiredDist = this.aimingZoom ? 2.15 : 3.35;
    let shoulderOffset = this.aimingZoom ? 0.78 : 0.54;
    let targetPivotH = this.isSliding ? 1.05 : this.isCrouching ? 1.30 : this.aimingZoom ? 1.74 : 1.66;

    if (this.state === PLAYER_STATE.SKYDIVING || this.state === PLAYER_STATE.PARACHUTING) {
      desiredDist = 5.8;
      shoulderOffset = 0.18;
      targetPivotH = 1.75;
    } else if (!this.alive) {
      desiredDist = 10;
      shoulderOffset = 0;
      targetPivotH = 4.5;
    }

    this.smoothEyeHeight = stepCriticallyDampedSpring(
      this.eyeHeightSpring,
      targetPivotH,
      CAMERA_FEEL_CONFIG.pivotSpringOmega,
      dt
    );

    const thirdBobY = canApplyBob
      ? Math.sin(this.walkPhase * 2) * CAMERA_FEEL_CONFIG.headBobThirdAmpY * bobSpeedWeight * bobSprintScale * adsBobAtten
      : 0;

    _camPivot.set(
      camX + _camRightVec.x * shoulderOffset,
      camY + this.smoothEyeHeight + thirdBobY + this.cameraLandingOffset,
      camZ + _camRightVec.z * shoulderOffset
    );

    _camBackDir.copy(_camLookDir).negate();
    let unobstructedDist = desiredDist;
    const maxRayCheckDist = desiredDist + CAMERA_COLLISION_OFFSET + 0.05;
    let closestHitDist = Infinity;

    // 1. Raycaster 3D exacto de Three.js desde el pivote de cabeza/hombro contra muros, techos, puentes y terreno
    if (worldInstance && worldInstance.collectCameraOccludersNear) {
      const occluders = worldInstance.collectCameraOccludersNear(
        _camPivot.x,
        _camPivot.z,
        maxRayCheckDist + 16,
        _camNearbyMeshes
      );
      if (occluders.length > 0) {
        _camRaycaster.set(_camPivot, _camBackDir);
        _camRaycaster.near = 0.05;
        _camRaycaster.far = maxRayCheckDist;
        _camRayHits.length = 0;
        _camRaycaster.intersectObjects(occluders, false, _camRayHits);
        if (_camRayHits.length > 0 && _camRayHits[0].distance < closestHitDist) {
          closestHitDist = _camRayHits[0].distance;
        }
      }
    }

    // 2. Respaldo analítico contra volúmenes de colisión y sondas laterales (tipo esfera) para evitar roce en esquinas
    if (mapData) {
      const centerHit = raycastVoxels(mapData, _camPivot, _camBackDir, maxRayCheckDist);
      if (centerHit.hit && centerHit.dist < closestHitDist) {
        closestHitDist = centerHit.dist;
      }
      for (const sideSign of [-1, 1]) {
        _camWhiskerOrigin.copy(_camPivot).addScaledVector(_camRightVec, sideSign * 0.16);
        const sideHit = raycastVoxels(mapData, _camWhiskerOrigin, _camBackDir, maxRayCheckDist);
        if (sideHit.hit && sideHit.dist < closestHitDist) {
          closestHitDist = sideHit.dist;
        }
      }
    }

    if (closestHitDist < Infinity) {
      unobstructedDist = Math.max(0.42, closestHitDist - CAMERA_COLLISION_OFFSET);
    }

    const distOmega =
      unobstructedDist < this.camDistSpring.value
        ? CAMERA_FEEL_CONFIG.distPullInOmega
        : CAMERA_FEEL_CONFIG.distRecoverOmega;
    this.smoothCamDist = stepCriticallyDampedSpring(this.camDistSpring, unobstructedDist, distOmega, dt);

    _camPos.copy(_camPivot).addScaledVector(_camBackDir, this.smoothCamDist);
    if (mapData) {
      const minGroundCamY = mapData.getGroundHeightAt(_camPos.x, _camPos.z, _camPivot.y) + CAMERA_COLLISION_OFFSET;
      if (_camPos.y < minGroundCamY) _camPos.y = minGroundCamY;
    }

    if (!this.cameraInitializedOnFoot) {
      this.smoothCamPos.copy(_camPos);
      this.smoothCamVel.set(0, 0, 0);
      this.cameraInitializedOnFoot = true;
    } else {
      stepCriticallyDampedSpring3D(
        this.smoothCamPos,
        this.smoothCamVel,
        _camPos,
        CAMERA_FEEL_CONFIG.followSpringOmega,
        dt
      );
    }

    this.camera.position.set(
      this.smoothCamPos.x + shakeX,
      this.smoothCamPos.y + shakeY,
      this.smoothCamPos.z
    );
    _camTarget.copy(_camPivot).addScaledVector(_camLookDir, 35);
    this.camera.lookAt(_camTarget);
  }
};
