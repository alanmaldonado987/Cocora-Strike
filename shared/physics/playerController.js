// shared/physics/playerController.js
// Controlador cinemático determinista compartido entre cliente y servidor.
// Integra aceleración progresiva en suelo, fricción, control aéreo limitado conservando impulso,
// nado, vaulting, deslizamiento y caída libre/paracaídas sin depender de Three.js ni del DOM.

import {
  WATER_LEVEL,
  SWIM_CONFIG,
  PLAYER_RADIUS,
  PLAYER_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_SLIDE_HEIGHT,
  WEAPONS,
  HEAL_CONFIG,
  SLIDE_CONFIG,
  SLIDE_FEEL_CONFIG,
  PARACHUTE_CONFIG,
  PLAYER_INPUT_BUTTONS,
  MOVEMENT_CONFIG,
  computeTargetDescentSpeed
} from '../config.js';
import {
  getWaterDepthAt,
  isSwimmingAt,
  getSwimFloatY,
  resolveSlidingHorizontal,
  stepCharacterPhysics
} from './collision.js';
import { findVaultableObstacle } from './vault.js';

function dampScalar(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createStepEvents() {
  return {
    jumped: false,
    landed: false,
    fromParachute: false,
    landingImpactSpeed: 0,
    fallDistance: 0,
    wasUnprotectedSkydive: false,
    landedInDeepWater: false,
    waterDepth: 0,
    enteredWater: false,
    exitedWater: false,
    vaultStarted: false,
    vaultBreakWindowId: null,
    slideStarted: false,
    slideEnded: false,
    slideEndedToCrouch: false,
    parachuteOpened: false,
    cancelHeal: false,
    stepUpDeltaY: 0,
    movedHorizDist: 0
  };
}

export function resetStepEvents(ev) {
  ev.jumped = false;
  ev.landed = false;
  ev.fromParachute = false;
  ev.landingImpactSpeed = 0;
  ev.fallDistance = 0;
  ev.wasUnprotectedSkydive = false;
  ev.landedInDeepWater = false;
  ev.waterDepth = 0;
  ev.enteredWater = false;
  ev.exitedWater = false;
  ev.vaultStarted = false;
  ev.vaultBreakWindowId = null;
  ev.slideStarted = false;
  ev.slideEnded = false;
  ev.slideEndedToCrouch = false;
  ev.parachuteOpened = false;
  ev.cancelHeal = false;
  ev.stepUpDeltaY = 0;
  ev.movedHorizDist = 0;
  return ev;
}

export function createPlayerKinematicState(overrides = {}) {
  return {
    x: 0,
    y: 20,
    z: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    state: 'ground',
    moveMode: 'idle',
    walkPhase: 0,
    isCrouching: false,
    isSliding: false,
    isSwimming: false,
    isVaulting: false,
    isHealing: false,
    equipped: 'fists',
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    prevJumpHeld: false,
    prevCrouchHeld: false,
    prevSlideHeld: false,
    slideTimer: 0,
    slideCooldownTimer: 0,
    slideSpeed: 0,
    slideDirX: 0,
    slideDirZ: 1,
    vaultTimer: 0,
    vaultDuration: 0.42,
    vaultStartX: 0,
    vaultStartY: 0,
    vaultStartZ: 0,
    vaultEndX: 0,
    vaultEndY: 0,
    vaultEndZ: 0,
    vaultApexY: 0,
    jumpStartAltitude: PARACHUTE_CONFIG.planeHeightAboveValley,
    currentDescentSpeed: 0,
    airMomentumX: 0,
    airMomentumZ: 0,
    airPeakY: 20,
    currentGroundClearance: 0,
    ...overrides
  };
}

// Fricción progresiva en suelo: frena suavemente al soltar teclas o al superar la velocidad objetivo
export function applyGroundFriction(state, dt, cfg = MOVEMENT_CONFIG) {
  const speed = Math.hypot(state.vx || 0, state.vz || 0);
  if (speed < 1e-5) {
    state.vx = 0;
    state.vz = 0;
    return;
  }
  const control = Math.max(speed, cfg.stopSpeed);
  const drop = control * cfg.groundFriction * dt;
  const newSpeed = Math.max(0, speed - drop);
  const scale = newSpeed / speed;
  state.vx *= scale;
  state.vz *= scale;
}

// Arrastre horizontal sutil en el aire: conserva el impulso del salto/slide
export function applyAirFriction(state, dt, cfg = MOVEMENT_CONFIG) {
  if (cfg.airFriction <= 0) return;
  const factor = Math.max(0, 1 - cfg.airFriction * dt);
  state.vx = (state.vx || 0) * factor;
  state.vz = (state.vz || 0) * factor;
}

// Aceleración direccional proyectada (estilo Quake/Source): no recorta velocidad excedente previa
export function accelerateHorizontal(state, wishDirX, wishDirZ, wishSpeed, accel, dt) {
  if (wishSpeed <= 0 || (wishDirX === 0 && wishDirZ === 0)) return;
  const vx = state.vx || 0;
  const vz = state.vz || 0;
  const currentProj = vx * wishDirX + vz * wishDirZ;
  const addSpeed = wishSpeed - currentProj;
  if (addSpeed <= 0) return;
  const accelSpeed = Math.min(addSpeed, accel * dt);
  state.vx = vx + wishDirX * accelSpeed;
  state.vz = vz + wishDirZ * accelSpeed;
}

function clipVelocityAgainstCollision(state, desiredX, desiredZ) {
  const pushX = state.x - desiredX;
  const pushZ = state.z - desiredZ;
  const pushLen = Math.hypot(pushX, pushZ);
  if (pushLen <= 1e-5) return;
  const nx = pushX / pushLen;
  const nz = pushZ / pushLen;
  const intoWall = state.vx * nx + state.vz * nz;
  if (intoWall < 0) {
    state.vx -= intoWall * nx;
    state.vz -= intoWall * nz;
  }
}

// Comprueba que la cápsula completa [footY + 0.05, footY + height] esté libre de techos y muros sólidos
export function hasCapsuleClearance(map, x, footY, z, radius = PLAYER_RADIUS, height = PLAYER_HEIGHT) {
  if (!map?.colliders) return true;
  const yBottom = footY + 0.05;
  const yTop = footY + height - 0.01;
  const rCheck = radius * 0.92;
  const nearby = map.colliders.queryNear(x, z, rCheck + 0.5);

  for (let i = 0; i < nearby.length; i++) {
    const c = nearby[i];
    if (c.enabled === false) continue;
    if (yTop <= c.minY || yBottom >= c.maxY) continue;
    if (c.type === 'cylinder') {
      const dx = x - c.x;
      const dz = z - c.z;
      const minD = rCheck + c.r;
      if (dx * dx + dz * dz < minD * minD) return false;
    } else if (c.type === 'box') {
      const cx = Math.max(c.minX, Math.min(c.maxX, x));
      const cz = Math.max(c.minZ, Math.min(c.maxZ, z));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rCheck * rCheck) return false;
    }
  }
  return true;
}

// Obtiene la superficie de soporte bajo los pies incluyendo escalones/bordillos sólidos hasta maxReachAboveFeet
function querySupportSurfaceY(map, wx, wy, wz, radius = PLAYER_RADIUS, maxReachAboveFeet = 0.10) {
  let bestY = map.getFloorBelowY(wx, wy + maxReachAboveFeet, wz);
  if (!map?.colliders) return bestY;

  const footR = radius;
  const near = map.colliders.queryNear(wx, wz, footR + 0.35);
  for (let i = 0; i < near.length; i++) {
    const c = near[i];
    if (c.enabled === false) continue;
    if (c.maxY > wy + maxReachAboveFeet || c.maxY <= bestY) continue;
    if (c.type === 'box') {
      const cx = Math.max(c.minX, Math.min(c.maxX, wx));
      const cz = Math.max(c.minZ, Math.min(c.maxZ, wz));
      const dx = wx - cx;
      const dz = wz - cz;
      if (dx * dx + dz * dz <= footR * footR) {
        bestY = c.maxY;
      }
    } else if (c.type === 'cylinder') {
      const dx = wx - c.x;
      const dz = wz - c.z;
      const rSum = c.r + footR;
      if (dx * dx + dz * dz <= rSum * rSum) {
        bestY = c.maxY;
      }
    }
  }
  return bestY;
}

// Integrador horizontal + vertical con subida automática de escalones (stepUp <= 0.45 m) y adhesión en bajadas (snapToGround)
function integrateGroundAirMotor(map, state, dt, radius, height, wasOnGround, jumpedThisTick, ev, cfg = MOVEMENT_CONFIG) {
  const startX = state.x;
  const startY = state.y;
  const startZ = state.z;
  const desiredX = startX + state.vx * dt;
  const desiredZ = startZ + state.vz * dt;

  const curGround = map.getGroundHeightAt(startX, startZ, startY);
  const nextGround = map.getGroundHeightAt(desiredX, desiredZ, startY + cfg.maxStepHeight);
  let targetX = desiredX;
  let targetZ = desiredZ;

  const stepDist = Math.hypot(desiredX - startX, desiredZ - startZ);
  const terrainRise = nextGround - curGround;
  if (
    state.onGround &&
    stepDist > 0.001 &&
    terrainRise > cfg.maxStepHeight &&
    terrainRise / stepDist > cfg.maxWalkableSlope
  ) {
    const gxOnly = map.getGroundHeightAt(desiredX, startZ, startY);
    const gzOnly = map.getGroundHeightAt(startX, desiredZ, startY);
    const rx = gxOnly - curGround;
    const rz = gzOnly - curGround;
    if (rx < rz && (rx <= cfg.maxStepHeight || rx / (Math.abs(desiredX - startX) || 1) <= cfg.maxWalkableSlope)) {
      targetZ = startZ;
    } else if (rz <= cfg.maxStepHeight || rz / (Math.abs(desiredZ - startZ) || 1) <= cfg.maxWalkableSlope) {
      targetX = startX;
    } else {
      targetX = startX;
      targetZ = startZ;
    }
  }

  const slidLow = resolveSlidingHorizontal(map, targetX, startY, targetZ, radius, height);
  let finalX = slidLow.x;
  let finalZ = slidLow.z;
  let steppedUp = false;

  const horizSpeed = Math.hypot(state.vx, state.vz);
  const canAttemptStep = (wasOnGround || state.onGround || state.vy <= 0) && !jumpedThisTick && horizSpeed >= cfg.stepMinHorizSpeed;

  // Caso A: un obstáculo bloqueó el avance horizontal en startY -> probar elevar hasta maxStepHeight (0.45 m)
  const lowBlockedDist = Math.hypot(slidLow.x - targetX, slidLow.z - targetZ);
  if (canAttemptStep && lowBlockedDist > 0.004) {
    const testHighY = startY + cfg.maxStepHeight;
    const slidHigh = resolveSlidingHorizontal(map, targetX, testHighY, targetZ, radius, height);
    const highBlockedDist = Math.hypot(slidHigh.x - targetX, slidHigh.z - targetZ);

    if (highBlockedDist + 0.008 < lowBlockedDist) {
      const moveDirLen = Math.hypot(targetX - startX, targetZ - startZ) || 1;
      const dirX = (targetX - startX) / moveDirLen;
      const dirZ = (targetZ - startZ) / moveDirLen;
      const probeX = slidHigh.x + dirX * 0.12;
      const probeZ = slidHigh.z + dirZ * 0.12;
      const candSurfaceY = Math.max(
        querySupportSurfaceY(map, slidHigh.x, startY, slidHigh.z, radius + 0.02, cfg.maxStepHeight + 0.02),
        querySupportSurfaceY(map, probeX, startY, probeZ, radius, cfg.maxStepHeight + 0.02)
      );
      const stepDelta = candSurfaceY - startY;
      if (
        stepDelta > 0.01 &&
        stepDelta <= cfg.maxStepHeight + 1e-4 &&
        hasCapsuleClearance(map, slidHigh.x, candSurfaceY, slidHigh.z, radius, height) &&
        hasCapsuleClearance(map, probeX, candSurfaceY, probeZ, radius, height)
      ) {
        finalX = slidHigh.x;
        finalZ = slidHigh.z;
        state.x = finalX;
        state.z = finalZ;
        state.y = candSurfaceY;
        state.vy = 0;
        state.onGround = true;
        ev.stepUpDeltaY = stepDelta;
        steppedUp = true;
      }
    }
  }

  // Caso B: escalón bajo (< 0.38 m) que no bloqueó yBottom pero eleva el piso bajo los pies
  if (!steppedUp && canAttemptStep) {
    const lowStepSurfaceY = querySupportSurfaceY(map, finalX, startY, finalZ, radius, cfg.maxStepHeight + 0.01);
    const lowDelta = lowStepSurfaceY - startY;
    if (lowDelta > 0.015 && lowDelta <= cfg.maxStepHeight + 1e-4) {
      if (hasCapsuleClearance(map, finalX, lowStepSurfaceY, finalZ, radius, height)) {
        state.x = finalX;
        state.z = finalZ;
        state.y = lowStepSurfaceY;
        state.vy = 0;
        state.onGround = true;
        ev.stepUpDeltaY = lowDelta;
        steppedUp = true;
      } else {
        // Sin espacio libre de techo sobre el escalón: impedir penetrar bajo el techo bajo
        finalX = startX;
        finalZ = startZ;
      }
    }
  }

  if (!steppedUp) {
    state.x = finalX;
    state.z = finalZ;

    const minTerrainY = map.getTerrainHeightAt
      ? map.getTerrainHeightAt(state.x, state.z)
      : map.getGroundHeightAt(state.x, state.z, state.y);

    const supportY = querySupportSurfaceY(map, state.x, state.y, state.z, radius, 0.10);
    state.vy = (state.vy || 0) - cfg.gravity * dt;
    let nextY = state.y + state.vy * dt;

    // Colisión vertical de cabeza contra techos al subir saltando
    if (state.vy > 0 && map.colliders) {
      const near = map.colliders.queryNear(state.x, state.z, radius);
      const headTop = nextY + height;
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (c.enabled === false) continue;
        if (c.type === 'box' && state.x >= c.minX - radius * 0.6 && state.x <= c.maxX + radius * 0.6 && state.z >= c.minZ - radius * 0.6 && state.z <= c.maxZ + radius * 0.6) {
          if (state.y + height <= c.minY + 0.22 && headTop >= c.minY) {
            state.vy = 0;
            nextY = c.minY - height - 0.02;
            break;
          }
        }
      }
    }

    if (state.vy <= 0 && nextY <= supportY + 0.09) {
      state.y = supportY;
      state.vy = 0;
      state.onGround = true;
    } else if (wasOnGround && !jumpedThisTick && state.vy <= 0 && state.y - supportY <= cfg.groundSnapDist && state.y >= supportY - 0.08) {
      // snapToGround: adhesión continua al bajar escaleras, puentes y pendientes pronunciadas sin rebotar
      state.y = supportY;
      state.vy = 0;
      state.onGround = true;
    } else {
      state.y = Math.max(minTerrainY, nextY);
      if (state.y <= minTerrainY + 0.001 && state.vy < 0) {
        state.vy = 0;
        state.onGround = true;
      } else {
        state.onGround = false;
      }
    }
  }

  clipVelocityAgainstCollision(state, desiredX, desiredZ);
}

export function stepPlayer(state, input, dt, map, options = {}) {
  const ev = options.eventsOut ? resetStepEvents(options.eventsOut) : createStepEvents();
  if (!state || !map || !(dt > 0)) return ev;

  state.vx = Number.isFinite(state.vx) ? state.vx : 0;
  state.vz = Number.isFinite(state.vz) ? state.vz : 0;
  state.vy = Number.isFinite(state.vy) ? state.vy : 0;
  state.walkPhase = Number.isFinite(state.walkPhase) ? state.walkPhase : 0;
  state.slideCooldownTimer = Math.max(0, (state.slideCooldownTimer || 0) - dt);

  if (typeof input?.yaw === 'number' && Number.isFinite(input.yaw)) {
    state.yaw = input.yaw;
  }
  if (typeof input?.pitch === 'number' && Number.isFinite(input.pitch)) {
    state.pitch = Math.max(-1.45, Math.min(1.45, input.pitch));
  }
  if (typeof input?.equipped === 'string') {
    state.equipped = input.equipped;
  }

  const buttons = input?.buttons >>> 0;
  const jumpHeld = Boolean(buttons & PLAYER_INPUT_BUTTONS.JUMP);
  const jumpJustPressed = jumpHeld && !state.prevJumpHeld;
  const crouchHeld = Boolean(buttons & PLAYER_INPUT_BUTTONS.CROUCH);
  const crouchJustPressed = crouchHeld && !state.prevCrouchHeld;
  const slideHeld = Boolean(buttons & PLAYER_INPUT_BUTTONS.SLIDE);
  const slideJustPressed = slideHeld && !state.prevSlideHeld;
  const sprintHeld = Boolean(buttons & PLAYER_INPUT_BUTTONS.SPRINT);
  const adsHeld = Boolean(buttons & PLAYER_INPUT_BUTTONS.ADS);
  const parachutePressed = Boolean(buttons & PLAYER_INPUT_BUTTONS.PARACHUTE) || jumpJustPressed;

  state.prevJumpHeld = jumpHeld;
  state.prevCrouchHeld = crouchHeld;
  state.prevSlideHeld = slideHeld;

  if (state.state === 'plane' || state.state === 'lobby' || state.state === 'dead' || state.state === 'spectating') {
    return ev;
  }

  // Dirección de movimiento deseada en el plano horizontal (espacio mundo)
  let wishX = Number.isFinite(input?.moveX) ? input.moveX : 0;
  let wishZ = Number.isFinite(input?.moveZ) ? input.moveZ : 0;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-5) {
    wishX /= wishLen;
    wishZ /= wishLen;
  } else {
    wishX = 0;
    wishZ = 0;
  }

  const sprinting = sprintHeld && !adsHeld && !options.reloading && !state.isSliding;
  if (sprinting && state.isCrouching) {
    if (hasCapsuleClearance(map, state.x, state.y, state.z, PLAYER_RADIUS, PLAYER_HEIGHT)) {
      state.isCrouching = false;
    }
  }

  // ==================== 1. CAÍDA LIBRE Y PARACAÍDAS ====================
  if (state.state === 'skydiving' || state.state === 'parachuting') {
    if (state.isSliding) {
      state.isSliding = false;
      state.slideTimer = 0;
      ev.slideEnded = true;
    }
    state.isCrouching = false;

    const floorY = map.getFloorBelowY(state.x, state.y, state.z);
    state.currentGroundClearance = Math.max(0, state.y - floorY);

    if (state.state === 'skydiving' && parachutePressed && state.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen) {
      state.state = 'parachuting';
      state.airPeakY = state.y;
      ev.parachuteOpened = true;
    }

    state.airMomentumX = (state.airMomentumX || 0) * Math.exp(-1.9 * dt);
    state.airMomentumZ = (state.airMomentumZ || 0) * Math.exp(-1.9 * dt);

    const hSpeed =
      state.state === 'skydiving'
        ? PARACHUTE_CONFIG.freefallHorizontalSpeed
        : PARACHUTE_CONFIG.canopyHorizontalSpeed;

    const targetDescent = computeTargetDescentSpeed(
      state.jumpStartAltitude || PARACHUTE_CONFIG.planeHeightAboveValley,
      state.state,
      state.pitch,
      PARACHUTE_CONFIG
    );

    let descent = state.currentDescentSpeed || PARACHUTE_CONFIG.freefallInitialSpeed;
    if (state.state === 'parachuting' && descent > targetDescent) {
      descent = Math.max(targetDescent, descent - PARACHUTE_CONFIG.canopyOpenDecel * dt);
    } else if (descent < targetDescent) {
      const ratio = descent / Math.max(1, targetDescent);
      const aeroAccel = PARACHUTE_CONFIG.freefallGravityAccel * Math.max(0.25, 1 - ratio * ratio * 0.72);
      descent = Math.min(targetDescent, descent + aeroAccel * dt);
    } else {
      descent = dampScalar(descent, targetDescent, 5.0, dt);
    }
    state.currentDescentSpeed = descent;

    const prevX = state.x;
    const prevZ = state.z;
    const airVx = wishX * hSpeed + state.airMomentumX;
    const airVz = wishZ * hSpeed + state.airMomentumZ;
    stepCharacterPhysics(map, state, airVx, airVz, dt, 0, PLAYER_RADIUS, PLAYER_HEIGHT);
    state.vx = airVx;
    state.vz = airVz;
    state.vy = -descent;
    state.y += state.vy * dt;
    ev.movedHorizDist = Math.hypot(state.x - prevX, state.z - prevZ);

    if (state.state === 'skydiving' && state.y - floorY <= PARACHUTE_CONFIG.autoDeployHeight) {
      state.state = 'parachuting';
      state.airPeakY = state.y;
      ev.parachuteOpened = true;
    }

    const wasUnprotectedSkydive = state.state === 'skydiving';
    const wasParachuting = state.state === 'parachuting';
    if (wasUnprotectedSkydive) {
      state.airPeakY = Math.max(state.airPeakY ?? state.y, state.y);
    } else {
      state.airPeakY = state.y;
    }

    const updatedFloorY = map.getFloorBelowY(state.x, state.y + 0.7, state.z);
    const splashWaterDepth = getWaterDepthAt(map, state.x, state.z);
    if (splashWaterDepth > SWIM_CONFIG.swimDepth && state.y <= WATER_LEVEL + 0.20) {
      const floatY = getSwimFloatY(map, state.x, state.z);
      ev.landed = true;
      ev.fromParachute = wasParachuting;
      ev.landedInDeepWater = true;
      ev.enteredWater = true;
      ev.waterDepth = splashWaterDepth;
      ev.landingImpactSpeed = descent;
      ev.fallDistance = Math.max(0, (state.airPeakY ?? state.y) - floatY);
      ev.wasUnprotectedSkydive = wasUnprotectedSkydive;
      state.y = floatY;
      state.vy = 0;
      state.vx = 0;
      state.vz = 0;
      state.currentDescentSpeed = 0;
      state.airMomentumX = 0;
      state.airMomentumZ = 0;
      state.onGround = true;
      state.isSwimming = true;
      state.state = 'ground';
      state.moveMode = 'swim_idle';
      state.airPeakY = state.y;
    } else if (state.y <= updatedFloorY + 0.12) {
      ev.landed = true;
      ev.fromParachute = wasParachuting;
      ev.waterDepth = splashWaterDepth;
      ev.landingImpactSpeed = descent;
      ev.fallDistance = Math.max(0, (state.airPeakY ?? state.y) - updatedFloorY);
      ev.wasUnprotectedSkydive = wasUnprotectedSkydive;
      state.y = updatedFloorY;
      state.vy = 0;
      state.vx *= 0.5;
      state.vz *= 0.5;
      state.currentDescentSpeed = 0;
      state.airMomentumX = 0;
      state.airMomentumZ = 0;
      state.onGround = true;
      state.state = 'ground';
      state.airPeakY = updatedFloorY;
      state.moveMode = 'fall';
    } else {
      state.moveMode = 'fall';
    }

    const minG = map.getTerrainHeightAt ? map.getTerrainHeightAt(state.x, state.z) : map.getGroundHeightAt(state.x, state.z, state.y);
    if (state.y < minG) state.y = minG;
    return ev;
  }

  // ==================== 2. ESTADO EN TIERRA / AIRE CORTO / AGUA ====================
  const wasOnGround = Boolean(state.onGround);
  const preVy = state.vy;
  const prevX = state.x;
  const prevY = state.y;
  const prevZ = state.z;

  // Ventanas de Coyote Time (~100 ms tras dejar borde) y Jump Buffering (~120 ms antes de tocar suelo)
  if (wasOnGround) {
    state.coyoteTimer = MOVEMENT_CONFIG.coyoteTimeSec;
  } else {
    state.coyoteTimer = Math.max(0, (state.coyoteTimer || 0) - dt);
  }
  if (jumpJustPressed) {
    state.jumpBufferTimer = MOVEMENT_CONFIG.jumpBufferTimeSec;
  } else {
    state.jumpBufferTimer = Math.max(0, (state.jumpBufferTimer || 0) - dt);
  }

  const swimmingNow = !state.isVaulting && isSwimmingAt(map, state.x, state.y, state.z);
  if (swimmingNow) {
    if (!state.isSwimming) {
      state.isSwimming = true;
      if (state.isSliding) {
        state.isSliding = false;
        state.slideTimer = 0;
        ev.slideEnded = true;
      }
      state.isCrouching = false;
      if (state.isHealing) ev.cancelHeal = true;
      ev.enteredWater = true;
      ev.landingImpactSpeed = Math.abs(preVy);
    }

    const swimTargetSpeed = sprinting ? SWIM_CONFIG.swimSprintSpeed : SWIM_CONFIG.swimSpeed;
    applyGroundFriction(state, dt, MOVEMENT_CONFIG);
    accelerateHorizontal(state, wishX, wishZ, swimTargetSpeed, MOVEMENT_CONFIG.groundAccel * 0.65, dt);

    stepCharacterPhysics(map, state, state.vx, state.vz, dt, 0, PLAYER_RADIUS, PLAYER_HEIGHT);
    const targetFloatY = getSwimFloatY(map, state.x, state.z);
    state.y = dampScalar(state.y, targetFloatY, 6, dt);
    state.vy = 0;
    state.onGround = true;
    state.airPeakY = state.y;
    state.currentGroundClearance = 0;

    const moved = Math.hypot(state.x - prevX, state.z - prevZ);
    ev.movedHorizDist = moved;
    if (moved > 0.004 * (dt / (1 / 60))) {
      state.walkPhase += dt * (sprinting ? 7.5 : 5.2);
      state.moveMode = sprinting ? 'swim_fast' : 'swim';
    } else {
      state.moveMode = 'swim_idle';
    }

    const minG = map.getTerrainHeightAt ? map.getTerrainHeightAt(state.x, state.z) : map.getGroundHeightAt(state.x, state.z, state.y);
    if (state.y < minG) state.y = minG;
    return ev;
  } else if (state.isSwimming) {
    state.isSwimming = false;
    ev.exitedWater = true;
  }

  // Activación de slide en carrera o alternancia de postura agachada
  if (state.onGround && !state.isVaulting) {
    const curHorizSpeed = Math.hypot(state.vx, state.vz);
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const velDirX = curHorizSpeed > 0.1 ? state.vx / curHorizSpeed : fwdX;
    const velDirZ = curHorizSpeed > 0.1 ? state.vz / curHorizSpeed : fwdZ;
    const forwardAlign = velDirX * fwdX + velDirZ * fwdZ;
    const wantsSlide = (slideJustPressed || (crouchJustPressed && sprintHeld)) && !state.isSliding;

    if (
      wantsSlide &&
      state.slideCooldownTimer <= 0 &&
      curHorizSpeed >= SLIDE_FEEL_CONFIG.minEntrySpeed &&
      forwardAlign > 0.25
    ) {
      state.isCrouching = false;
      state.isSliding = true;
      state.slideTimer = SLIDE_CONFIG.durationSec;
      state.slideCooldownTimer = SLIDE_CONFIG.cooldownSec;
      state.slideSpeed = Math.min(
        SLIDE_FEEL_CONFIG.maxDownhillSpeed,
        Math.min(SLIDE_CONFIG.initialSpeed, curHorizSpeed + SLIDE_FEEL_CONFIG.impulseBonus)
      );
      state.slideDirX = velDirX;
      state.slideDirZ = velDirZ;
      state.vx = velDirX * state.slideSpeed;
      state.vz = velDirZ * state.slideSpeed;
      if (state.isHealing) ev.cancelHeal = true;
      ev.slideStarted = true;
    } else if (crouchJustPressed && !state.isSliding) {
      if (state.isCrouching) {
        if (hasCapsuleClearance(map, state.x, state.y, state.z, PLAYER_RADIUS, PLAYER_HEIGHT)) {
          state.isCrouching = false;
        }
      } else {
        state.isCrouching = true;
      }
    }
  }

  // Activación de salto (suelo + coyote time + jump buffer) / vaulting / paracaídas en altura
  const canCoyoteOrGroundJump = state.onGround || state.coyoteTimer > 0;
  if (!state.isVaulting && state.jumpBufferTimer > 0 && canCoyoteOrGroundJump) {
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const pressingForward = wishX * fwdX + wishZ * fwdZ > 0.45;
    const vaultTarget =
      state.onGround && pressingForward
        ? findVaultableObstacle(map, state.x, state.y, state.z, state.yaw)
        : null;

    if (vaultTarget) {
      if (state.isSliding) {
        state.isSliding = false;
        state.slideTimer = 0;
        ev.slideEnded = true;
      }
      state.isCrouching = false;
      if (state.isHealing) ev.cancelHeal = true;
      state.isVaulting = true;
      state.vaultTimer = 0;
      state.vaultDuration = 0.42;
      state.vaultStartX = state.x;
      state.vaultStartY = state.y;
      state.vaultStartZ = state.z;
      state.vaultEndX = vaultTarget.endX;
      state.vaultEndY = vaultTarget.endY;
      state.vaultEndZ = vaultTarget.endZ;
      state.vaultApexY = vaultTarget.apexY;
      state.vy = 0;
      state.onGround = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      state.moveMode = 'vault';
      ev.vaultStarted = true;
      ev.vaultBreakWindowId = vaultTarget.breakWindowId || null;
    } else {
      if (state.isSliding) {
        state.isSliding = false;
        state.slideTimer = 0;
        ev.slideEnded = true;
      }
      state.isCrouching = false;
      if (state.isHealing) ev.cancelHeal = true;
      // Conserva el impulso horizontal (state.vx, state.vz) y consume coyote + buffer
      state.vy = MOVEMENT_CONFIG.jumpVelocity;
      state.onGround = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      state.airPeakY = state.y;
      ev.jumped = true;
    }
  } else if (!state.isVaulting && !state.onGround && state.coyoteTimer <= 0 && (jumpJustPressed || parachutePressed)) {
    if (
      state.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen &&
      (state.airPeakY ?? state.y) - (state.y - state.currentGroundClearance) >= PARACHUTE_CONFIG.minJumpHeightRef
    ) {
      const floorY = state.y - state.currentGroundClearance;
      state.jumpStartAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, (state.airPeakY ?? state.y) - floorY);
      state.currentDescentSpeed = Math.max(4, -state.vy);
      state.state = 'parachuting';
      state.jumpBufferTimer = 0;
      state.airPeakY = state.y;
      ev.parachuteOpened = true;
      return ev;
    }
  }

  // Vaulting cinemático sobre obstáculos
  if (state.isVaulting) {
    state.vaultTimer += dt;
    const vt = Math.min(1, state.vaultTimer / Math.max(0.1, state.vaultDuration));
    const smoothT = vt * vt * (3 - 2 * vt);
    state.x = state.vaultStartX + (state.vaultEndX - state.vaultStartX) * smoothT;
    state.z = state.vaultStartZ + (state.vaultEndZ - state.vaultStartZ) * smoothT;
    const baseLinearY = state.vaultStartY + (state.vaultEndY - state.vaultStartY) * smoothT;
    const arcLift = Math.sin(vt * Math.PI) * Math.max(0.35, state.vaultApexY - baseLinearY);
    state.y = baseLinearY + arcLift;
    state.vy = 0;
    state.vx = (state.x - prevX) / dt;
    state.vz = (state.z - prevZ) / dt;
    state.moveMode = 'vault';
    ev.movedHorizDist = Math.hypot(state.x - prevX, state.z - prevZ);
    if (vt >= 1) {
      state.isVaulting = false;
      state.y = state.vaultEndY;
      state.onGround = true;
      state.airPeakY = state.y;
      ev.landed = true;
      ev.landingImpactSpeed = 2.8;
    }
    return ev;
  }

  // Deslizamiento dinámico (Slide): impulso en carrera, respuesta continua a pendiente y salida suave a agachado
  if (state.isSliding) {
    state.slideTimer -= dt;
    const sampleSpan = 0.75;
    const behindY = map.getGroundHeightAt(
      state.x - state.slideDirX * sampleSpan,
      state.z - state.slideDirZ * sampleSpan,
      state.y
    );
    const aheadY = map.getGroundHeightAt(
      state.x + state.slideDirX * sampleSpan,
      state.z + state.slideDirZ * sampleSpan,
      state.y
    );
    // slope > 0 cuesta abajo, slope < 0 cuesta arriba
    const slope = (behindY - aheadY) / (sampleSpan * 2);

    let netAccel = -SLIDE_FEEL_CONFIG.flatFriction;
    if (slope > 0.01) {
      netAccel += slope * (SLIDE_FEEL_CONFIG.flatFriction + SLIDE_FEEL_CONFIG.downhillAccelFactor);
      if (slope > 0.16 && state.slideTimer > 0.04) {
        state.slideTimer = Math.min(SLIDE_CONFIG.durationSec * 1.35, state.slideTimer + dt * Math.min(0.85, slope * 1.8));
      }
    } else if (slope < -0.01) {
      netAccel += slope * SLIDE_FEEL_CONFIG.uphillBrakeFactor;
    }

    state.slideSpeed = Math.max(
      0,
      Math.min(SLIDE_FEEL_CONFIG.maxDownhillSpeed, state.slideSpeed + netAccel * dt)
    );

    state.vx = state.slideDirX * state.slideSpeed;
    state.vz = state.slideDirZ * state.slideSpeed;

    integrateGroundAirMotor(
      map,
      state,
      dt,
      PLAYER_RADIUS,
      PLAYER_SLIDE_HEIGHT,
      wasOnGround,
      ev.jumped,
      ev,
      MOVEMENT_CONFIG
    );

    const postSpeed = Math.hypot(state.vx, state.vz);
    state.slideSpeed = Math.min(state.slideSpeed, postSpeed);

    if (!state.onGround) {
      state.isSliding = false;
      state.slideTimer = 0;
      ev.slideEnded = true;
    } else if (state.slideSpeed <= SLIDE_FEEL_CONFIG.exitToCrouchSpeed || state.slideTimer <= 0) {
      state.isSliding = false;
      state.slideTimer = 0;
      state.isCrouching = true;
      ev.slideEnded = true;
      ev.slideEndedToCrouch = true;
      state.moveMode = postSpeed > 0.25 ? 'crouch_walk' : 'crouch_idle';
      ev.movedHorizDist = Math.hypot(state.x - prevX, state.z - prevZ);
      return ev;
    }

    state.moveMode = 'slide';
    ev.movedHorizDist = Math.hypot(state.x - prevX, state.z - prevZ);
    return ev;
  }

  // Locomoción estándar en suelo o aire con aceleración y fricción progresivas
  if (state.isHealing && ((sprinting && wishLen > 0) || !state.onGround)) {
    ev.cancelHeal = true;
  }

  const wMoveMult = WEAPONS[state.equipped]?.moveSpeedMult || 1.0;
  const healMult = state.isHealing ? HEAL_CONFIG.moveSpeedMult || 0.45 : 1.0;
  const baseSpeed = state.isCrouching
    ? MOVEMENT_CONFIG.crouchSpeed
    : sprinting
    ? MOVEMENT_CONFIG.sprintSpeed
    : MOVEMENT_CONFIG.walkSpeed;
  const wading = state.y < WATER_LEVEL - 0.4 && getWaterDepthAt(map, state.x, state.z) > 0.45;
  const wadeMult = wading ? SWIM_CONFIG.wadeSpeedMult : 1.0;
  const targetSpeed = wishLen > 0 ? baseSpeed * wMoveMult * healMult * wadeMult : 0;
  const effH = state.isCrouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;

  if (state.onGround) {
    applyGroundFriction(state, dt, MOVEMENT_CONFIG);
    accelerateHorizontal(state, wishX, wishZ, targetSpeed, MOVEMENT_CONFIG.groundAccel, dt);
  } else {
    applyAirFriction(state, dt, MOVEMENT_CONFIG);
    const airWishCap = Math.min(targetSpeed, MOVEMENT_CONFIG.maxAirWishSpeed);
    accelerateHorizontal(state, wishX, wishZ, airWishCap, MOVEMENT_CONFIG.airAccel, dt);
  }

  integrateGroundAirMotor(map, state, dt, PLAYER_RADIUS, effH, wasOnGround, ev.jumped, ev, MOVEMENT_CONFIG);

  const floorY = querySupportSurfaceY(map, state.x, state.y, state.z, PLAYER_RADIUS, 0.35);
  state.currentGroundClearance = Math.max(0, state.y - floorY);

  const moved = Math.hypot(state.x - prevX, state.z - prevZ);
  ev.movedHorizDist = moved;
  const horizSpeed = Math.hypot(state.vx, state.vz);

  if (!state.onGround) {
    if (wasOnGround && !ev.jumped) {
      state.airPeakY = prevY;
    } else {
      state.airPeakY = Math.max(state.airPeakY ?? state.y, state.y);
    }
    state.moveMode = state.vy > 0.6 ? 'jump' : 'fall';
  } else {
    state.coyoteTimer = MOVEMENT_CONFIG.coyoteTimeSec;
    if (!wasOnGround) {
      ev.landed = true;
      ev.landingImpactSpeed = Math.max(0, -preVy);
      ev.fallDistance = Math.max(0, (state.airPeakY ?? state.y) - floorY);
      ev.waterDepth = getWaterDepthAt(map, state.x, state.z);
    }
    state.airPeakY = state.y;

    // Jump Buffering: si se pulsó salto <= 120 ms antes de tocar tierra, despegar al instante
    if (!wasOnGround && state.jumpBufferTimer > 0) {
      state.vy = MOVEMENT_CONFIG.jumpVelocity;
      state.onGround = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      ev.jumped = true;
      state.moveMode = 'jump';
    } else if (horizSpeed > 0.25 && moved > 0.002 * (dt / (1 / 60))) {
      const speedRatio = Math.min(1.35, horizSpeed / Math.max(1, baseSpeed));
      const baseFreq = sprinting ? 13 : state.isCrouching ? 7 : 9.5;
      state.walkPhase += dt * baseFreq * Math.max(0.45, speedRatio);
      state.moveMode = sprinting && horizSpeed > 6.2 ? 'sprint' : state.isCrouching ? 'crouch_walk' : 'walk';
    } else {
      state.moveMode = state.isCrouching ? 'crouch_idle' : 'idle';
    }
  }

  const minG = map.getTerrainHeightAt ? map.getTerrainHeightAt(state.x, state.z) : map.getGroundHeightAt(state.x, state.z, state.y);
  if (state.y < minG) state.y = minG;

  return ev;
}
