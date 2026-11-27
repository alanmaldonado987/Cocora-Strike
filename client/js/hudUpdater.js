// client/js/hudUpdater.js
// Utilidades puras sin allocaciones para dirty-checking del DOM en updateHUD,
// limitador de frecuencia (throttling a 10 Hz) de sensores y control limpio de temporizadores.

export function createHudCache() {
  return Object.create(null);
}

export function resetHudCache(cache) {
  for (const k in cache) {
    delete cache[k];
  }
}

export function setTextIfChanged(cache, key, el, nextText) {
  if (!el || cache[key] === nextText) return false;
  cache[key] = nextText;
  el.textContent = nextText;
  return true;
}

export function setStyleIfChanged(cache, key, el, styleProp, nextValue) {
  if (!el || cache[key] === nextValue) return false;
  cache[key] = nextValue;
  el.style[styleProp] = nextValue;
  return true;
}

export function toggleClassIfChanged(cache, key, el, className, force) {
  const boolVal = Boolean(force);
  if (!el || cache[key] === boolVal) return false;
  cache[key] = boolVal;
  el.classList.toggle(className, boolVal);
  return true;
}

export function setAttrIfChanged(cache, key, el, attrName, nextValue) {
  if (!el || cache[key] === nextValue) return false;
  cache[key] = nextValue;
  el.setAttribute(attrName, nextValue);
  return true;
}

export function setDatasetIfChanged(cache, key, el, dataProp, nextValue) {
  if (!el || cache[key] === nextValue) return false;
  cache[key] = nextValue;
  el.dataset[dataProp] = nextValue;
  return true;
}

const SLOT_CLASS_NAMES = [
  'w-slot locked',
  'w-slot',
  'w-slot locked active',
  'w-slot active'
];

export function updateWeaponSlotIfChanged(cache, slotKey, el, unlocked, active) {
  if (!el) return false;
  const stateIdx = (unlocked ? 1 : 0) | (active ? 2 : 0);
  if (cache[slotKey] === stateIdx) return false;
  cache[slotKey] = stateIdx;
  el.className = SLOT_CLASS_NAMES[stateIdx];
  return true;
}

export function createHudSensorState(intervalSec = 0.10) {
  return {
    accumSec: intervalSec, // Armado para evaluar inmediatamente en el primer frame válido
    intervalSec,
    concealed: false,
    interactable: null
  };
}

export function invalidateHudSensors(sensorState) {
  sensorState.accumSec = sensorState.intervalSec;
}

/**
 * Avanza el acumulador de sensores del HUD y retorna true solo cuando corresponde
 * ejecutar las consultas costosas (máximo 10 Hz en estado estacionario).
 */
export function stepHudSensorThrottle(sensorState, dt, canSense) {
  if (!canSense) {
    sensorState.accumSec = sensorState.intervalSec;
    sensorState.concealed = false;
    sensorState.interactable = null;
    return false;
  }
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
  sensorState.accumSec += safeDt;
  if (sensorState.accumSec < sensorState.intervalSec) {
    return false;
  }
  sensorState.accumSec %= sensorState.intervalSec;
  return true;
}

export function createDamageFlashState() {
  return { timeoutId: null };
}

export function triggerDamageFlash(
  flashState,
  el,
  colorRgba = 'rgba(239, 68, 68, 0.65)',
  durationMs = 190
) {
  if (!el) return;
  if (flashState.timeoutId !== null) {
    clearTimeout(flashState.timeoutId);
    flashState.timeoutId = null;
  }
  el.style.background = `radial-gradient(circle, transparent 48%, ${colorRgba} 100%)`;
  el.style.opacity = '1';
  flashState.timeoutId = setTimeout(() => {
    el.style.opacity = '0';
    flashState.timeoutId = null;
  }, durationMs);
}
