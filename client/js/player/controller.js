// client/js/player/controller.js
// Controlador del jugador local: estado, avión/cabina, caída libre, paracaídas, curación, sincronía con el servidor
// y bucle de actualización. Avanza la física compartida en pasos fijos de SIM_DT (predicción del cliente).
// Repartido en mixins: ../net/prediction.js, ../core/input.js, ./weapons.js, ./viewmodel.js, ./camera.js.

import * as THREE from 'three';
import {
  HEAL_CONFIG,
  PARACHUTE_CONFIG,
  CABIN_DISEMBARK_MS,
  SIM_DT,
  CAMERA_FEEL_CONFIG,
  WEAPON_FEEL_CONFIG,
  PLAYER_INPUT_BUTTONS,
  PLAYER_RADIUS,
  PLAYER_EYE_HEIGHT,
  SWIM_CONFIG,
  stepRecoilSpring,
  applyEntitySeparation,
  createStepEvents,
  stepPlayer,
  MOVE_MODE,
  PLAYER_STATE
} from '/shared/mapData.js';
import { inputMethods } from '../core/input.js';
import { mixMethods } from '../core/mixin.js';
import { predictionMethods } from '../net/prediction.js';
import { AVATAR_COLORS, createParachuteCanopy, createVoxelAvatar } from './avatar.js';
import { _planeAnchor, cameraMethods } from './camera.js';
import { FirstPersonWeaponRig, viewmodelMethods } from './viewmodel.js';
import { weaponMethods } from './weapons.js';

// ==================== CONTROLADOR PRINCIPAL EN ESCALA MÉTRICA REAL (1.80M) ====================
export class LocalPlayerController {
  constructor(scene, camera, domElement, audio) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.audio = audio;

    this.camera.near = 0.06;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();

    this.cameraMode = 'third';
    this.planeViewMode = 'cabin_third';
    this.avatar = null;
    this.seatIndex = 0;
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.cabinDisembarkDuration = CABIN_DISEMBARK_MS / 1000;

    this.fpCanopy = createParachuteCanopy();
    this.scene.add(this.fpCanopy);
    this.fpRig = new FirstPersonWeaponRig();

    this.active = false;
    this.alive = true;
    this.state = PLAYER_STATE.LOBBY;

    this.x = 0;
    this.y = 30;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = 0;
    this.pitch = -0.1;
    this.onGround = false;
    this.walkPhase = 0;
    this.stepAccum = 0;
    this.moveMode = MOVE_MODE.IDLE;

    this.simAccum = 0;
    this.inputSeq = 0;
    this.queuedButtonsMask = 0;
    this.pendingNetSteps = [];
    this.unackedSteps = [];
    this.reconcileOffsetX = 0;
    this.reconcileOffsetY = 0;
    this.reconcileOffsetZ = 0;
    this._stepEvents = createStepEvents();
    this._reconcileEvents = createStepEvents();
    this._reconcileProbe = {};

    this.airMomentumX = 0;
    this.airMomentumZ = 0;

    this.isCrouching = false;
    this.isSliding = false;
    this.isSwimming = false;
    this.swimStrokeAccum = 0;
    this.breath = SWIM_CONFIG.maxBreath; // lo fija el servidor (autoritativo)
    this.isVaulting = false;
    this.vaultTimer = 0;
    this.vaultDuration = 0.42;
    this.vaultStartX = 0;
    this.vaultStartY = 0;
    this.vaultStartZ = 0;
    this.vaultEndX = 0;
    this.vaultEndY = 0;
    this.vaultEndZ = 0;
    this.vaultApexY = 0;
    this.slideTimer = 0;
    this.slideCooldownUntil = 0;
    this.slideSpeed = 0;
    this.slideDirX = 0;
    this.slideDirZ = 0;
    this.slideDustAccum = 0;

    this.jumpStartAltitude = PARACHUTE_CONFIG.planeHeightAboveValley;
    this.currentDescentSpeed = 0;
    this.currentGroundClearance = 0;
    this.airPeakY = 0;

    this.smoothEyeHeight = PLAYER_EYE_HEIGHT;
    this.smoothCamDist = 3.35;
    this.smoothCamPos = new THREE.Vector3(0, 40, -30);
    this.smoothCamVel = new THREE.Vector3(0, 0, 0);
    this.eyeHeightSpring = { value: PLAYER_EYE_HEIGHT, vel: 0 };
    this.camDistSpring = { value: 3.35, vel: 0 };
    this.fovSpring = { value: CAMERA_FEEL_CONFIG.baseThirdFov, vel: 0 };
    this.landingSpring = { value: 0, vel: 0 };
    this.headBobEnabled = CAMERA_FEEL_CONFIG.headBobEnabled;
    this.cameraInitializedOnFoot = false;
    this.cameraLandingOffset = 0;

    this.hp = 100;
    this.kills = 0;
    this.equipped = 'fists';
    this.weapons = {
      fists: { unlocked: true, mag: 0 },
      pistol: { unlocked: false, mag: 0 },
      revolver: { unlocked: false, mag: 0 },
      shotgun: { unlocked: false, mag: 0 },
      smg: { unlocked: false, mag: 0 },
      assault_rifle: { unlocked: false, mag: 0 },
      rifle: { unlocked: false, mag: 0 },
      sniper: { unlocked: false, mag: 0 }
    };
    this.reserveAmmo = 24;
    this.medkits = 0;
    this.bandages = 1;
    this.isHealing = false;
    this.healStart = 0;
    this.healDuration = HEAL_CONFIG.durationMs || 2000;
    this.healItemType = 'medkit';
    this.healParticleAccum = 0;
    this.shakeTimer = 0;
    this.shakeDuration = 0.35;
    this.shakeIntensity = 0;
    this.reloading = false;
    this.reloadStart = 0;
    this.reloadDuration = 1500;
    this.fireCadenceState = { cooldownSec: 0, burstActive: false };
    this.recoilState = { targetPitch: 0, targetYaw: 0, pitch: 0, pitchVel: 0, yaw: 0, yawVel: 0 };

    this.keys = {};
    this.mouseDownLeft = false;
    this.pendingShotPress = false;
    this.aimingZoom = false;
    this.pointerLocked = false;

    this.onJumpRequest = null;
    this.onShootRequest = null;
    this.onReloadRequest = null;
    this.onSwitchWeaponRequest = null;
    this.onHealRequest = null;
    this.onCancelHealRequest = null;
    this.onHealCancelledLocal = null;
    this.onSpawnHealParticles = null;
    this.onSlideChange = null;
    this.onSpawnSlideDust = null;
    this.onCameraModeChanged = null;
    this.onInteractRequest = null;
    this.onBreakWindowRequest = null;

    this.bindInputs();
  }

  ensureAvatarInWorldScene() {
    if (this.avatar && this.avatar.root.parent !== this.scene) {
      this.scene.add(this.avatar.root);
    }
  }

  spawnAvatar(name, colorIdx = 0, seatIndex = 0) {
    this.seatIndex = seatIndex;
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    if (this.avatar) {
      this.avatar.root.removeFromParent();
      this.avatar.dispose?.();
    }
    this.avatar = createVoxelAvatar(name, colorIdx, true);
    this.scene.add(this.avatar.root);

    const hex = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
    this.fpRig.setShirtColor(hex);
    this.setEquippedWeaponVisual(this.equipped, true);
    this.cameraInitializedOnFoot = false;
  }

  tryRequestHeal(preferredType = 'medkit') {
    if (!this.alive || this.state !== PLAYER_STATE.GROUND || !this.onGround || this.hp >= 100 || this.isHealing) return;
    if (this.isSwimming) return; // no se puede vendar nadando
    if (this.medkits <= 0 && this.bandages <= 0) return;
    this.endSlide();
    this.reloading = false;
    this.onHealRequest?.(preferredType);
  }

  beginClientHeal(itemType = 'medkit', durationMs = 2000) {
    this.isHealing = true;
    this.healItemType = itemType;
    this.healStart = performance.now();
    this.healDuration = durationMs;
    this.healParticleAccum = 0;
  }

  cancelClientHeal(notifyServer = false) {
    if (!this.isHealing) return;
    this.isHealing = false;
    this.audio.stopBandaging?.();
    if (notifyServer) {
      this.onCancelHealRequest?.();
      this.onHealCancelledLocal?.();
    }
  }

  endSlide() {
    if (!this.isSliding) return;
    this.isSliding = false;
    this.slideTimer = 0;
    this.onSlideChange?.(false);
  }

  startCabinDisembarkSequence() {
    if (this.state !== PLAYER_STATE.PLANE || this.isCabinDisembarking) return;
    this.isCabinDisembarking = true;
    this.cabinDisembarkTimer = 0;
    this.onJumpRequest?.();
  }

  completeLocalRampJump(planeState, worldInstance) {
    this.ensureAvatarInWorldScene();
    if (worldInstance && worldInstance.planeMesh) {
      const exitLocal = worldInstance.sampleCabinDisembarkLocalPose(this.seatIndex, 1.0);
      const bay = worldInstance.getActiveCabinBayGroup();
      _planeAnchor.set(exitLocal.x, exitLocal.y, exitLocal.z);
      bay.updateMatrixWorld(true);
      bay.localToWorld(_planeAnchor);
      this.x = _planeAnchor.x;
      this.y = _planeAnchor.y;
      this.z = _planeAnchor.z;
      this.smoothCamPos.set(_planeAnchor.x, _planeAnchor.y + 2.6, _planeAnchor.z);
    }
    if (planeState) {
      // Ligera inercia hacia adelante al saltar, quedando visiblemente atrás mientras el avión sigue a 38 m/s
      this.airMomentumX = (planeState.vx || 0) * 0.42;
      this.airMomentumZ = (planeState.vz || 0) * 0.42;
    }
    const groundY = this.currentMap ? this.currentMap.getFloorBelowY(this.x, this.y, this.z) : 8;
    this.jumpStartAltitude = Math.max(15, this.y - groundY);
    this.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.state = PLAYER_STATE.SKYDIVING;
    this.moveMode = MOVE_MODE.FALL;
    this.onGround = false;
    this.cameraInitializedOnFoot = true;
  }

  forceSyncExitFromServer(meSnapshot) {
    this.ensureAvatarInWorldScene();
    this.isCabinDisembarking = false;
    this.cabinDisembarkTimer = 0;
    this.state = meSnapshot.state;
    this.x = meSnapshot.x;
    this.y = meSnapshot.y;
    this.z = meSnapshot.z;
    if (this.lastPlaneState) {
      this.airMomentumX = (this.lastPlaneState.vx || 0) * 0.42;
      this.airMomentumZ = (this.lastPlaneState.vz || 0) * 0.42;
    }
    this.jumpStartAltitude = meSnapshot.jumpAltitude || PARACHUTE_CONFIG.planeHeightAboveValley;
    this.currentDescentSpeed = PARACHUTE_CONFIG.freefallInitialSpeed;
    this.cameraInitializedOnFoot = true;
  }

  update(dt, mapData, planeState, worldInstance = null, remoteEntities = []) {
    this.currentMap = mapData;
    this.lastPlaneState = planeState;
    this.lastWorldInstance = worldInstance;

    if (!this.active) {
      if (this.avatar) this.avatar.root.visible = false;
      this.fpCanopy.visible = false;
      this.fpRig.update(dt, { visible: false, state: PLAYER_STATE.LOBBY });
      const t = performance.now() * 0.00012;
      this.camera.position.set(Math.cos(t) * 145 + 35, 58, Math.sin(t) * 145);
      this.camera.lookAt(45, 10, 6);
      return;
    }

    stepRecoilSpring(this.recoilState, dt, WEAPON_FEEL_CONFIG);

    let movingHoriz = false;
    const sprinting =
      Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) &&
      !this.aimingZoom &&
      !this.reloading &&
      !this.isSliding;

    if (sprinting && this.isCrouching) {
      this.isCrouching = false;
    }

    if (this.alive && mapData) {
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const rightX = -Math.cos(this.yaw);
      const rightZ = Math.sin(this.yaw);

      let wishX = 0;
      let wishZ = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) { wishX += fwdX; wishZ += fwdZ; }
      if (this.keys['KeyS'] || this.keys['ArrowDown']) { wishX -= fwdX; wishZ -= fwdZ; }
      if (this.keys['KeyD'] || this.keys['ArrowRight']) { wishX += rightX; wishZ += rightZ; }
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) { wishX -= rightX; wishZ -= rightZ; }
      const wLen = Math.hypot(wishX, wishZ);
      if (wLen > 0) { wishX /= wLen; wishZ /= wLen; }

      if (this.state === PLAYER_STATE.PLANE && planeState && worldInstance) {
        if (this.isCabinDisembarking) {
          this.cabinDisembarkTimer += dt;
          if (this.cabinDisembarkTimer >= this.cabinDisembarkDuration) {
            this.completeLocalRampJump(planeState, worldInstance);
          }
        }

        if (this.state === PLAYER_STATE.PLANE) {
          const normProg = this.isCabinDisembarking
            ? Math.min(1, this.cabinDisembarkTimer / Math.max(0.1, this.cabinDisembarkDuration))
            : 0;
          const bayGroup = worldInstance.getActiveCabinBayGroup();
          const localPose = worldInstance.sampleCabinDisembarkLocalPose(this.seatIndex, normProg);

          // Anclar el avatar directamente como hijo del THREE.Group local de la bodega (hereda movimiento y balanceo)
          if (this.avatar) {
            if (bayGroup && this.avatar.root.parent !== bayGroup) {
              bayGroup.add(this.avatar.root);
            }
            this.avatar.root.visible = this.planeViewMode !== 'cabin_first';
            this.avatar.root.position.set(localPose.x, localPose.y, localPose.z);
            this.avatar.root.rotation.set(0, localPose.yaw, 0);
            this.avatar.setOpacity(1.0, false);
            this.avatar.setWeapon(this.equipped);
          }

          bayGroup.updateMatrixWorld(true);
          _planeAnchor.set(localPose.x, localPose.y, localPose.z);
          bayGroup.localToWorld(_planeAnchor);
          this.x = _planeAnchor.x;
          this.y = _planeAnchor.y;
          this.z = _planeAnchor.z;

          const groundBelow = mapData.getFloorBelowY(this.x, this.y, this.z);
          this.currentGroundClearance = Math.max(0, this.y - groundBelow);
          this.jumpStartAltitude = Math.max(15, this.currentGroundClearance);
          this.moveMode = localPose.phase === 'sit' ? MOVE_MODE.SEATED : localPose.phase;
          this.walkPhase = localPose.walkCycle;

          if (this.avatar) {
            this.avatar.animate(localPose.walkCycle, 'plane', this.equipped, 0, this.moveMode, dt, false, false);
          }
        }
      } else {
        this.ensureAvatarInWorldScene();
        this.simAccum = Math.min(0.12, this.simAccum + dt);

        while (this.simAccum >= SIM_DT) {
          this.simAccum -= SIM_DT;

          let buttons = this.queuedButtonsMask;
          this.queuedButtonsMask = 0;
          if (this.keys['Space']) buttons |= PLAYER_INPUT_BUTTONS.JUMP;
          if (this.keys['KeyF']) buttons |= PLAYER_INPUT_BUTTONS.PARACHUTE;
          if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) buttons |= PLAYER_INPUT_BUTTONS.SPRINT;
          if (this.keys['KeyC']) buttons |= PLAYER_INPUT_BUTTONS.CROUCH;
          if (this.keys['ControlLeft'] || this.keys['ControlRight']) buttons |= PLAYER_INPUT_BUTTONS.SLIDE | PLAYER_INPUT_BUTTONS.CROUCH;
          if (this.aimingZoom) buttons |= PLAYER_INPUT_BUTTONS.ADS;

          const cmd = {
            seq: ++this.inputSeq,
            moveX: wishX,
            moveZ: wishZ,
            yaw: this.yaw,
            pitch: this.pitch,
            buttons,
            equipped: this.equipped
          };

          const ev = stepPlayer(this, cmd, SIM_DT, mapData, {
            reloading: this.reloading,
            eventsOut: this._stepEvents
          });

          if (this.state === PLAYER_STATE.GROUND && !this.isVaulting && remoteEntities.length > 0) {
            applyEntitySeparation(this, remoteEntities, PLAYER_RADIUS, SIM_DT, mapData);
          }

          this.pendingNetSteps.push(cmd);
          if (this.pendingNetSteps.length > 24) this.pendingNetSteps.shift();
          this.unackedSteps.push(cmd);
          if (this.unackedSteps.length > 120) this.unackedSteps.shift();

          if (ev.cancelHeal && this.isHealing) {
            this.cancelClientHeal(true);
          }
          if (ev.parachuteOpened) {
            this.audio.playParachuteOpen();
            this.onJumpRequest?.();
          }
          if (ev.slideStarted) {
            this.slideDustAccum = 0;
            this.audio.playSlide(0);
            this.onSlideChange?.(true);
          }
          if (ev.slideEnded) {
            this.onSlideChange?.(false);
          }
          if (ev.vaultStarted) {
            this.audio.playVault?.();
            if (ev.vaultBreakWindowId) {
              this.onBreakWindowRequest?.(ev.vaultBreakWindowId);
            }
          }
          if (ev.enteredWater) {
            this.audio.playSplash?.(Math.min(1.4, 0.5 + ev.landingImpactSpeed / 12));
            this.onSpawnWaterRipples?.(this.x, this.z, true, 1.2);
          } else if (ev.exitedWater) {
            this.onSpawnWaterRipples?.(this.x, this.z, false, 0.65);
          }

          if (ev.landed && !ev.landedInDeepWater) {
            if (ev.landingImpactSpeed > 1.8) {
              this.applyLandingCameraDip(ev.landingImpactSpeed);
              if (ev.landingImpactSpeed > 4.2) {
                this.audio.playFootstep(false);
              }
            }
          }

          if (this.isSwimming) {
            if (ev.movedHorizDist > 0.004) {
              this.swimStrokeAccum += ev.movedHorizDist;
              if (this.swimStrokeAccum >= 1.6) {
                this.swimStrokeAccum = 0;
                this.audio.playSwimStroke?.();
              }
            }
            this.swimRippleAccum = (this.swimRippleAccum || 0) + SIM_DT;
            const swimMoving = this.moveMode === MOVE_MODE.SWIM || this.moveMode === MOVE_MODE.SWIM_FAST;
            if (this.swimRippleAccum >= (swimMoving ? 0.13 : 0.32)) {
              this.swimRippleAccum = 0;
              this.onSpawnWaterRipples?.(this.x, this.z, swimMoving, sprinting ? 1.15 : 0.85);
            }
          } else if (this.isSliding) {
            this.slideDustAccum += SIM_DT;
            if (this.slideDustAccum >= 0.065) {
              this.slideDustAccum = 0;
              this.onSpawnSlideDust?.(this.x, this.y, this.z, Math.atan2(this.slideDirX, this.slideDirZ));
            }
          } else if (this.onGround && ev.movedHorizDist > 0.003) {
            this.stepAccum += ev.movedHorizDist;
            if (this.stepAccum >= 2.2) {
              this.stepAccum = 0;
              this.audio.playFootstep(mapData.isInWater(this.x, this.y, this.z));
            }
          }

          if (this.isHealing && this.state === PLAYER_STATE.GROUND) {
            this.healParticleAccum += SIM_DT;
            if (this.healParticleAccum >= 0.085) {
              this.healParticleAccum = 0;
              this.onSpawnHealParticles?.(this.x, this.y, this.z);
            }
          }
        }

        movingHoriz = Math.hypot(this.vx, this.vz) > 0.25 || this.isSliding || this.isVaulting;
      }

      const reconDecay = Math.exp(-20 * dt);
      this.reconcileOffsetX *= reconDecay;
      this.reconcileOffsetY *= reconDecay;
      this.reconcileOffsetZ *= reconDecay;
    }

    const renderX = this.x + this.reconcileOffsetX;
    const renderY = this.y + this.reconcileOffsetY;
    const renderZ = this.z + this.reconcileOffsetZ;

    const sniperAds = this.isSniperScoped();
    if (this.avatar && this.state !== PLAYER_STATE.PLANE) {
      this.ensureAvatarInWorldScene();
      const camCloseFade =
        this.cameraMode === 'third'
          ? Math.max(0, Math.min(1, (this.smoothCamDist - 0.72) / 1.05))
          : 0;
      const adsAlpha = this.aimingZoom ? Math.min(camCloseFade, 0.85) : camCloseFade;
      const showLocalBody = this.alive && this.cameraMode === 'third' && !sniperAds && adsAlpha > 0.08;
      this.avatar.root.visible = showLocalBody;
      if (this.alive) {
        // Actualizar siempre posición, rotación, IK y fase de animación aunque esté en 1ra persona o mira telescópica
        if (showLocalBody) {
          this.avatar.setOpacity(adsAlpha, this.aimingZoom && this.smoothCamDist < 1.65);
        }
        this.avatar.root.position.set(renderX, renderY, renderZ);
        this.avatar.root.rotation.set(0, this.yaw, 0);
        this.avatar.setWeapon(this.equipped);
        this.avatar.animate(
          this.walkPhase,
          this.state,
          this.equipped,
          this.pitch,
          this.moveMode,
          dt,
          this.isSliding,
          this.isCrouching,
          this.isHealing,
          Math.hypot(this.vx || 0, this.vz || 0)
        );
      }
    }

    this.fpCanopy.visible = this.alive && this.cameraMode === 'first' && this.state === PLAYER_STATE.PARACHUTING;
    if (this.fpCanopy.visible) {
      this.fpCanopy.position.set(this.x, this.y + 2.85, this.z);
      this.fpCanopy.rotation.y = this.yaw;
    }

    const reloadProgress = this.reloading
      ? Math.min(1, (performance.now() - this.reloadStart) / Math.max(1, this.reloadDuration))
      : 0;

    // Primero orientar y posicionar la cámara del fotograma actual, y DESPUÉS resolver el disparo
    this.updateCamera(dt, mapData, planeState, worldInstance, movingHoriz, sprinting, sniperAds);
    this.processWeaponFireAfterCamera(dt, mapData);

    this.fpRig.update(dt, {
      visible: this.alive && this.cameraMode === 'first',
      state: this.state,
      aimingZoom: this.aimingZoom,
      sprinting,
      isSliding: this.isSliding,
      isHealing: this.isHealing,
      moving: movingHoriz,
      onGround: this.onGround,
      reloading: this.reloading,
      reloadProgress
    });
  }
}

mixMethods(
  LocalPlayerController,
  predictionMethods,
  inputMethods,
  weaponMethods,
  viewmodelMethods,
  cameraMethods
);
