// client/js/world/common.js
// Temporales reutilizables (CERO asignaciones por fotograma) y utilidades comunes del mundo 3D.
// Módulo hoja: no importa otros módulos de world/ para evitar ciclos de evaluación.

import * as THREE from 'three';

export const _occSphere = new THREE.Sphere();

// Vectores, matrices y cuaterniones temporales reutilizables (CERO asignaciones por fotograma)
export const _tmpVecA = new THREE.Vector3();
export const _tmpVecB = new THREE.Vector3();
export const _tmpScale = new THREE.Vector3();
export const _tmpEuler = new THREE.Euler();
export const _tmpQuatA = new THREE.Quaternion();
export const _tmpQuatB = new THREE.Quaternion();
export const _tmpMat4 = new THREE.Matrix4();
export const _tmpInstColor = new THREE.Color();
export const _yAxis = new THREE.Vector3(0, 1, 0);

export function isVisibleInScene(obj) {
  let o = obj;
  while (o) {
    if (!o.visible) return false;
    if (o.isScene) return true;
    o = o.parent;
  }
  return false;
}
