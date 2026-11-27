// client/js/world/loot.js
// Botín en el suelo (armas, munición, botiquines, vendas) y detección contextual [E] de botín y puertas.

import * as THREE from 'three';
import { createExternalMedkitLootMesh } from '/Modelos%203D/cocoraModels.js';
import { LOOT_TYPES } from '/shared/mapData.js';
import { createDetailedWeaponMesh } from '../player/weapons.js';
import { _yAxis } from './common.js';

export const LOOT_VISIBLE_DISTANCE = 150; // metros

export const lootMethods = {
  syncLoot(items) {
    for (const obj of this.lootMeshes.values()) {
      this.lootGroup.remove(obj);
      this.disposeObjectTree(obj);
    }
    this.lootMeshes.clear();
    this.lootItemsData.clear();
    this.addLootItems(items);
  },

  addLootItems(items) {
    const slopeNorm = new THREE.Vector3();
    const bbox = new THREE.Box3();
    const firearmIds = new Set([
      'pistol',
      'revolver',
      'shotgun',
      'smg',
      'assault_rifle',
      'rifle',
      'sniper'
    ]);

    for (const item of items) {
      if (this.lootMeshes.has(item.id)) continue;
      this.lootItemsData.set(item.id, item);
      const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
      const accentColor = new THREE.Color(spec.color);

      const root = new THREE.Group();
      root.position.set(item.x, item.y, item.z);

      // Halo brillante suave en el suelo para identificar el objeto claramente
      const ringMat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 18), ringMat);
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.03;

      const slopeHolder = new THREE.Group();
      if (!item.onFlatStructure && this.mapData) {
        const n = this.mapData.getTerrainNormalAt(item.x, item.z);
        slopeNorm.set(n.x, n.y, n.z).normalize();
        slopeHolder.quaternion.setFromUnitVectors(_yAxis, slopeNorm);
      }
      slopeHolder.add(glowRing);
      root.add(slopeHolder);

      const realShape = new THREE.Group();
      realShape.rotation.y = ((item.x * 13.7 + item.z * 7.3) % 6.28);
      const highlightMeshes = [];

      if (firearmIds.has(item.type)) {
        const wScale = item.type === 'pistol' || item.type === 'revolver' ? 1.38 : 1.15;
        const gunModel = createDetailedWeaponMesh(item.type, wScale);
        gunModel.rotation.z = Math.PI / 2 - 0.12;
        gunModel.rotation.x = 0.04;
        realShape.add(gunModel);

        realShape.traverse((child) => {
          if (child.isMesh && child.material && child.material.isMeshStandardMaterial) {
            const cloned = child.material.clone();
            cloned.emissive = accentColor;
            cloned.emissiveIntensity = 0.24;
            child.material = cloned;
            highlightMeshes.push(cloned);
          }
        });
      } else if (item.type === 'medkit') {
        const extMed = createExternalMedkitLootMesh();
        realShape.add(extMed.group);
        for (let i = 0; i < extMed.highlightMats.length; i++) {
          highlightMeshes.push(extMed.highlightMats[i]);
        }
      } else if (item.type === 'bandage') {
        const gauzeMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7 });
        const bandMat = new THREE.MeshStandardMaterial({
          color: '#2dd4bf',
          emissive: '#0d9488',
          emissiveIntensity: 0.42,
          roughness: 0.4
        });
        const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), gauzeMat);
        r1.position.set(-0.09, 0.11, 0);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.114, 0.06, 12), bandMat);
        stripe.position.set(-0.09, 0.11, 0);
        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.20, 12), gauzeMat);
        r2.rotation.z = Math.PI / 2;
        r2.position.set(0.12, 0.10, 0.04);
        realShape.add(r1, stripe, r2);
        highlightMeshes.push(bandMat);
      } else {
        const pouchMat = new THREE.MeshStandardMaterial({
          color: '#4d7c0f',
          emissive: '#3f6212',
          emissiveIntensity: 0.28,
          roughness: 0.55
        });
        const brassMat = new THREE.MeshStandardMaterial({
          color: '#facc15',
          emissive: '#ca8a04',
          emissiveIntensity: 0.34,
          roughness: 0.25,
          metalness: 0.85
        });
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.26), pouchMat);
        for (let b = 0; b < 4; b++) {
          const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.16, 8), brassMat);
          bullet.rotation.z = Math.PI / 2;
          bullet.position.set(0, 0.11, -0.075 + b * 0.05);
          realShape.add(bullet);
        }
        realShape.add(pack);
        highlightMeshes.push(brassMat, pouchMat);
      }

      realShape.updateMatrixWorld(true);
      bbox.setFromObject(realShape);
      if (Number.isFinite(bbox.min.y)) {
        realShape.position.y -= bbox.min.y - 0.015;
      }

      slopeHolder.add(realShape);
      root.userData.highlightMats = highlightMeshes;
      root.userData.glowRingMat = ringMat;
      root.userData.phase = Math.random() * Math.PI * 2;

      this.lootGroup.add(root);
      this.lootMeshes.set(item.id, root);
    }
  },

  removeLootItem(lootId) {
    const obj = this.lootMeshes.get(lootId);
    if (obj) {
      this.lootGroup.remove(obj);
      this.disposeObjectTree(obj);
      this.lootMeshes.delete(lootId);
    }
    this.lootItemsData.delete(lootId);
  },

  // Búsqueda sin allocs del mejor objeto o puerta interactiva cercana ([E] RECOGER... / [E] ABRIR PUERTA)
  findBestInteractable(px, py, pz, eyeY, lookDirX, lookDirY, lookDirZ) {
    const out = this._interactResult;
    out.kind = null;
    out.id = null;
    out.promptText = '';

    let bestScore = Infinity;

    for (const item of this.lootItemsData.values()) {
      const dx = item.x - px;
      const dz = item.z - pz;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 3.45 || Math.abs(item.y - py) > 2.1) continue;

      const vx = item.x - px;
      const vy = (item.y + 0.2) - eyeY;
      const vz = item.z - pz;
      const dist3 = Math.hypot(vx, vy, vz) || 0.001;
      const dot = (vx * lookDirX + vy * lookDirY + vz * lookDirZ) / dist3;
      if (horiz > 1.85 && dot < 0.55) continue;

      const score = horiz - Math.max(0, dot) * 1.65;
      if (score < bestScore) {
        bestScore = score;
        const spec = LOOT_TYPES[item.type] || LOOT_TYPES.ammo;
        out.kind = 'loot';
        out.id = item.id;
        out.promptText = `[E] RECOGER ${spec.label.toUpperCase()}`;
      }
    }

    if (out.kind) return out;

    for (const entry of this.doorVisuals.values()) {
      const d = entry.data;
      if (d.destroyed) continue;
      const horiz = Math.hypot(d.x - px, d.z - pz);
      if (horiz > 3.1 || Math.abs(d.y - py) > 2.0) continue;
      const vx = d.x - px;
      const vy = (d.y + 1.1) - eyeY;
      const vz = d.z - pz;
      const dist3 = Math.hypot(vx, vy, vz) || 0.001;
      const dot = (vx * lookDirX + vy * lookDirY + vz * lookDirZ) / dist3;
      if (horiz > 1.7 && dot < 0.45) continue;

      const score = horiz - Math.max(0, dot) * 1.2;
      if (score < bestScore) {
        bestScore = score;
        out.kind = 'door';
        out.id = d.id;
        out.promptText = d.isOpen ? '[E] CERRAR PUERTA' : '[E] ABRIR PUERTA';
      }
    }

    return out.kind ? out : null;
  }
};
