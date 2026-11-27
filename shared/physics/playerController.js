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
  PARACHUTE_CONFIG,
  PLAYER_INPUT_BUTTONS,
  MOVEMENT_CONFIG,
  computeTargetDescentSpeed
} from '../config.js';
import {
  getWaterDepthAt,
  isSwimmingAt,
  getSwimFloatY,
  stepCharacterPhysics,
  findVaultableObstacle
} from '../physics.js';

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
    state.isCrouching = false;
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

  // Activación de slide o alternancia de agachado
  if (state.onGround && !state.isVaulting) {
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const forwardDot = wishX * fwdX + wishZ * fwdZ;
    const wantsSlide = (slideJustPressed || (crouchJustPressed && sprintHeld && forwardDot > 0.5)) && !state.isSliding;

    if (wantsSlide && state.slideCooldownTimer <= 0 && forwardDot > 0.35) {
      state.isCrouching = false;
      state.isSliding = true;
      state.slideTimer = SLIDE_CONFIG.durationSec;
      state.slideCooldownTimer = SLIDE_CONFIG.cooldownSec;
      state.slideSpeed = SLIDE_CONFIG.initialSpeed;
      state.slideDirX = fwdX;
      state.slideDirZ = fwdZ;
      state.vx = fwdX * state.slideSpeed;
      state.vz = fwdZ * state.slideSpeed;
      if (state.isHealing) ev.cancelHeal = true;
      ev.slideStarted = true;
    } else if (crouchJustPressed && !state.isSliding && !sprinting) {
      state.isCrouching = !state.isCrouching;
    }
  }

  // Activación de salto / vaulting / reapertura de paracaídas en altura
  if (!state.isVaulting && jumpJustPressed) {
    if (state.onGround) {
      const fwdX = Math.sin(state.yaw);
      const fwdZ = Math.cos(state.yaw);
      const pressingForward = wishX * fwdX + wishZ * fwdZ > 0.45;
      const vaultTarget = pressingForward
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
        // Conserva íntegramente el impulso horizontal (state.vx, state.vz) al despegar
        state.vy = MOVEMENT_CONFIG.jumpVelocity;
        state.onGround = false;
        state.airPeakY = state.y;
        ev.jumped = true;
      }
    } else if (
      !state.onGround &&
      state.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen &&
      (state.airPeakY ?? state.y) - (state.y - state.currentGroundClearance) >= PARACHUTE_CONFIG.minJumpHeightRef
    ) {
      const floorY = state.y - state.currentGroundClearance;
      state.jumpStartAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, (state.airPeakY ?? state.y) - floorY);
      state.currentDescentSpeed = Math.max(4, -state.vy);
      state.state = 'parachuting';
      state.airPeakY = state.y;
      ev.parachuteOpened = true;
      return ev;
    }
  } else if (!state.onGround && parachutePressed && !jumpJustPressed) {
    // Tecla dedicada de paracaídas en caída desde risco/puente alto
    if (
      state.currentGroundClearance >= PARACHUTE_CONFIG.minClearanceToOpen &&
      (state.airPeakY ?? state.y) - (state.y - state.currentGroundClearance) >= PARACHUTE_CONFIG.minJumpHeightRef
    ) {
      const floorY = state.y - state.currentGroundClearance;
      state.jumpStartAltitude = Math.max(PARACHUTE_CONFIG.minJumpHeightRef, (state.airPeakY ?? state.y) - floorY);
      state.currentDescentSpeed = Math.max(4, -state.vy);
      state.state = 'parachuting';
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

  // Deslizamiento (Slide)
  if (state.isSliding) {
    state.slideTimer -= dt;
    const aheadGround = map.getGroundHeightAt(
      state.x + state.slideDirX * 1.4,
      state.z + state.slideDirZ * 1.4,
      state.y
    );
    const curGround = map.getGroundHeightAt(state.x, state.z, state.y);
    const downhillSlope = (curGround - aheadGround) / 1.4;

    if (downhillSlope > 0.08) {
      state.slideSpeed = Math.min(16.5, state.slideSpeed + downhillSlope * SLIDE_CONFIG.downhillBoostFactor * dt);
      if (downhillSlope > 0.22 && state.slideTimer > 0.05) {
        state.slideTimer = Math.min(SLIDE_CONFIG.durationSec, state.slideTimer + dt * 0.35);
      }
    } else {
      const uphillBrake = downhillSlope < -0.05 ? Math.abs(downhillSlope) * 12 : 0;
      state.slideSpeed = Math.max(
        SLIDE_CONFIG.minEndSpeed,
        state.slideSpeed - (SLIDE_CONFIG.frictionDecay + uphillBrake) * dt
      );
    }

    state.vx = state.slideDirX * state.slideSpeed;
    state.vz = state.slideDirZ * state.slideSpeed;

    const desiredX = state.x + state.vx * dt;
    const desiredZ = state.z + state.vz * dt;
    stepCharacterPhysics(
      map,
      state,
      state.vx,
      state.vz,
      dt,
      MOVEMENT_CONFIG.gravity,
      PLAYER_RADIUS,
      PLAYER_SLIDE_HEIGHT
    );
    clipVelocityAgainstCollision(state, desiredX, desiredZ);

    if (state.slideTimer <= 0 || !state.onGround) {
      state.isSliding = false;
      state.slideTimer = 0;
      ev.slideEnded = true;
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

  const desiredX = state.x + state.vx * dt;
  const desiredZ = state.z + state.vz * dt;
  stepCharacterPhysics(map, state, state.vx, state.vz, dt, MOVEMENT_CONFIG.gravity, PLAYER_RADIUS, effH);
  clipVelocityAgainstCollision(state, desiredX, desiredZ);

  const floorY = map.getFloorBelowY(state.x, state.y + 0.35, state.z);
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
    if (!wasOnGround) {
      ev.landed = true;
      ev.landingImpactSpeed = Math.max(0, -preVy);
      ev.fallDistance = Math.max(0, (state.airPeakY ?? state.y) - floorY);
      ev.waterDepth = getWaterDepthAt(map, state.x, state.z);
    }
    state.airPeakY = state.y;

    if (horizSpeed > 0.25 && moved > 0.002 * (dt / (1 / 60))) {
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
