// client/js/world/lights.js
// Luces y presupuesto de render: sol con sombra ajustada a la rejilla de texels y centrada en el jugador,
// número FIJO de luces puntuales (sin recompilar shaders) y culling por distancia/frustum del botín y anclas de luz.

import * as THREE from 'three';
import { _yAxis, isVisibleInScene } from './common.js';

// Luces puntuales: número FIJO en la escena (evita recompilar shaders cuando una luz
// aparece/desaparece) y solo se encienden las que pueden iluminar algo visible.
export const MAX_ACTIVE_POINT_LIGHTS = 6;

const POINT_LIGHT_FADE_RATE = 6.0; // fundido de ~0.17 s al cambiar de luz

// Sol: desplazamiento fijo respecto al jugador y ajuste a la rejilla de texels del mapa de sombras
const SUN_OFFSET = new THREE.Vector3(68, 118, 52);
const _sunDir = SUN_OFFSET.clone().normalize();
const _sunRight = new THREE.Vector3().crossVectors(_yAxis, _sunDir).normalize();
const _sunUp = new THREE.Vector3().crossVectors(_sunDir, _sunRight);
const _sunSnapped = new THREE.Vector3();
const _viewerVec = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projView = new THREE.Matrix4();
const _lightSphere = new THREE.Sphere();

export const lightMethods = {
  // Registra una fuente de luz puntual del mapa. En lugar de crear un THREE.PointLight
  // (cada uno encarece todos los píxeles iluminados), se guarda un anclaje que sigue a su
  // objeto padre; updateRenderBudget() asigna las luces reales del pool a los anclajes visibles.
  addLightAnchor(parent, color, intensity, distance, decay, x, y, z, persistent = false) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    anchor.userData.light = { color: new THREE.Color(color), intensity, distance, decay, persistent };
    anchor.userData.worldPos = new THREE.Vector3();
    anchor.userData.lightScore = 0;
    parent.add(anchor);
    this.lightAnchors.push(anchor);
    return anchor;
  },

  resetMapLightAnchors() {
    this.lightAnchors = this.lightAnchors.filter((a) => a.userData.light.persistent);
    for (const slot of this.pointLightSlots) {
      slot.anchor = null;
      slot.weight = 0;
      slot.light.intensity = 0;
    }
  },

  // Llamar una vez por fotograma, justo antes de renderizar, con la cámara ya actualizada.
  updateRenderBudget(viewerPos, camera, dt) {
    // Sombra solar centrada en el jugador, ajustada a la rejilla de texels para que los
    // bordes de sombra no "tiemblen" al moverse.
    if (viewerPos && this.sunLight) {
      _viewerVec.set(viewerPos.x, viewerPos.y, viewerPos.z);
      const t = this.shadowTexelSize;
      const r = Math.round(_viewerVec.dot(_sunRight) / t) * t;
      const u = Math.round(_viewerVec.dot(_sunUp) / t) * t;
      const f = _viewerVec.dot(_sunDir);
      _sunSnapped.copy(_sunRight).multiplyScalar(r)
        .addScaledVector(_sunUp, u)
        .addScaledVector(_sunDir, f);
      this.sunLight.target.position.copy(_sunSnapped);
      this.sunLight.position.copy(_sunSnapped).add(SUN_OFFSET);
    }

    // Pasto y flores: generar/mostrar los bloques cercanos al jugador
    if (viewerPos && this.groundCover) this.groundCover.update(viewerPos);

    if (!camera) return;

    // Candidatas: luces visibles cuya esfera de alcance toca el campo de visión.
    // Una luz fuera de esa esfera no aporta nada a ningún píxel en pantalla.
    camera.updateMatrixWorld();
    _projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projView);
    const candidates = this.lightCandidates;
    candidates.length = 0;
    for (let i = 0; i < this.lightAnchors.length; i++) {
      const a = this.lightAnchors[i];
      if (!isVisibleInScene(a)) continue;
      const wp = a.getWorldPosition(a.userData.worldPos);
      _lightSphere.set(wp, a.userData.light.distance);
      if (!_frustum.intersectsSphere(_lightSphere)) continue;
      a.userData.lightScore = wp.distanceToSquared(camera.position);
      candidates.push(a);
    }
    // Solo si hay más candidatas que luces se elige por cercanía y se funde el cambio;
    // si caben todas, entran a plena intensidad (idéntico a tenerlas siempre encendidas).
    const contested = candidates.length > MAX_ACTIVE_POINT_LIGHTS;
    if (contested) {
      candidates.sort(this.compareLightCandidates);
      candidates.length = MAX_ACTIVE_POINT_LIGHTS;
    }

    const slots = this.pointLightSlots;
    const step = Math.min(1, dt * POINT_LIGHT_FADE_RATE);
    // 1) Atenuar las luces que ya no están entre las elegidas
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.anchor && !candidates.includes(slot.anchor)) {
        // Sin competencia, la luz salió del campo de visión: liberarla al instante no cambia nada en pantalla
        slot.weight -= contested ? step : 1;
        if (slot.weight <= 0) {
          slot.weight = 0;
          slot.anchor = null;
        }
      }
    }
    // 2) Asignar las elegidas nuevas a ranuras libres
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];
      let assigned = false;
      for (let j = 0; j < slots.length; j++) {
        if (slots[j].anchor === a) { assigned = true; break; }
      }
      if (assigned) continue;
      for (let j = 0; j < slots.length; j++) {
        if (!slots[j].anchor) {
          slots[j].anchor = a;
          slots[j].weight = contested ? 0 : 1;
          break;
        }
      }
    }
    // 3) Aplicar posición, color e intensidad
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const light = slot.light;
      if (!slot.anchor) {
        light.intensity = 0;
        continue;
      }
      if (candidates.includes(slot.anchor)) slot.weight = Math.min(1, slot.weight + step);
      const cfg = slot.anchor.userData.light;
      if (!isVisibleInScene(slot.anchor)) {
        slot.anchor = null;
        slot.weight = 0;
        light.intensity = 0;
        continue;
      }
      slot.anchor.getWorldPosition(light.position);
      light.color.copy(cfg.color);
      light.distance = cfg.distance;
      light.decay = cfg.decay;
      light.intensity = cfg.intensity * slot.weight;
    }
  }
};
