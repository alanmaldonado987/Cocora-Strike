import * as THREE from 'three';

export type WeaponId =
  | 'pistol'
  | 'revolver'
  | 'smg'
  | 'assault-rifle'
  | 'classic-rifle'
  | 'shotgun'
  | 'sniper-rifle';

export interface WeaponPartEntry {
  id: string;
  label: string;
  group: THREE.Group;
  /** Displacement vector applied when exploded view is active */
  explodeOffset: THREE.Vector3;
  /** Original local position stored on build */
  basePosition: THREE.Vector3;
}

export interface WeaponModelResult {
  root: THREE.Group;
  parts: WeaponPartEntry[];
  defaultCameraDistance: number;
  triangleCount: number;
  meshCount: number;
  dimensions: THREE.Vector3;
  dispose: () => void;
}

export interface WeaponMaterialLibrary {
  gunmetal: THREE.MeshStandardMaterial;
  bluedSteel: THREE.MeshStandardMaterial;
  anodizedAlloy: THREE.MeshStandardMaterial;
  matteSteel: THREE.MeshStandardMaterial;
  chromeSteel: THREE.MeshStandardMaterial;
  darkBore: THREE.MeshStandardMaterial;
  polymerDark: THREE.MeshStandardMaterial;
  polymerGrip: THREE.MeshStandardMaterial;
  polymerAccent: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  woodWalnut: THREE.MeshPhysicalMaterial;
  woodLaminate: THREE.MeshPhysicalMaterial;
  bakelite: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  copperJacket: THREE.MeshStandardMaterial;
  shellRed: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshPhysicalMaterial;
  sightGreen: THREE.MeshStandardMaterial;
  sightRed: THREE.MeshStandardMaterial;
  getHighlightMaterial: (base: THREE.Material) => THREE.Material;
  dispose: () => void;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  shortName: string;
  category: string;
  description: string;
  build: (materials: WeaponMaterialLibrary) => WeaponModelResult;
}
