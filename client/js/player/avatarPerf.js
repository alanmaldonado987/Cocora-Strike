// client/js/player/avatarPerf.js
// Operaciones sin allocaciones ni recompilación de shaders en combate para avatares y armas (player.js).

/**
 * Configura una sola vez al instanciar el avatar si sus materiales admitirán fundido de cámara cercana.
 * Evita alternar m.transparent y m.needsUpdate = true en tiempo real durante el combate.
 */
export function prepareAvatarMaterialsForFade(materials, isLocal) {
  if (!isLocal || !materials) return;
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.transparent = true;
    m.depthWrite = true;
    m.opacity = 1.0;
  }
}

/**
 * Aplica opacidad al avatar sin mutar m.transparent ni disparar m.needsUpdate = true (cero recompilación WebGL).
 * Incluye dirty-checking de opacidad para no recorrer materiales cuando alpha no cambia.
 */
export function applyAvatarOpacity(st, materials, weaponMount, healPropVisible, alpha = 1.0, hideWeapon = false) {
  const clamped = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  st.hideWeaponInAds = hideWeapon;
  if (Math.abs(clamped - st.lastAlpha) > 1e-4) {
    st.lastAlpha = clamped;
    for (let i = 0; i < materials.length; i++) {
      materials[i].opacity = clamped;
    }
  }
  if (weaponMount) {
    weaponMount.visible = !hideWeapon && clamped > 0.25 && !healPropVisible;
  }
}

/**
 * Cambia la visibilidad del arma equipada sin usar Object.entries() por frame.
 * Retorna inmediatamente en O(1) si el arma activa no cambió.
 */
export function applyActiveWeaponVisibility(weaponsMap, weaponKeys, currentKey, requestedId) {
  const targetKey = weaponsMap[requestedId] ? requestedId : 'fists';
  if (currentKey === targetKey) return currentKey;
  for (let i = 0; i < weaponKeys.length; i++) {
    const k = weaponKeys[i];
    weaponsMap[k].visible = k === targetKey;
  }
  return targetKey;
}

/**
 * Escribe la posición mundial de la boca del cañón en un objeto/vector reutilizable outTarget,
 * evitando crear literales { x, y, z } en cada disparo.
 */
export function readMuzzleWorldPosition(root, weaponsMap, activeWeaponKey, tmpWorldVec, outTarget, fallbackOut) {
  const activeMesh = weaponsMap[activeWeaponKey];
  const tip = activeMesh?.userData?.muzzleTip;
  if (tip) {
    root.updateMatrixWorld(true);
    tip.getWorldPosition(tmpWorldVec);
    outTarget.x = tmpWorldVec.x;
    outTarget.y = tmpWorldVec.y;
    outTarget.z = tmpWorldVec.z;
    return outTarget;
  }
  if (fallbackOut && fallbackOut !== outTarget) {
    outTarget.x = fallbackOut.x;
    outTarget.y = fallbackOut.y;
    outTarget.z = fallbackOut.z;
    return outTarget;
  }
  return fallbackOut || outTarget;
}
