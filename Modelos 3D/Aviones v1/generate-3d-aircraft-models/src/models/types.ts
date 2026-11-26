import * as THREE from 'three';

export type PartCategory =
  | 'airframe'
  | 'cannon'
  | 'magazine'
  | 'thrusters'
  | 'sight'
  | 'mechanisms';

export type VehicleClass = 'airplane' | 'helicopter';

export interface SubsystemNote {
  category: PartCategory;
  name: string;
  detail: string;
}

export interface AnimatedPart {
  object: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
  speed: number;
  mode?: 'spin' | 'oscillate' | 'pulse';
  baseValue?: number;
  amplitude?: number;
}

export interface BuiltModelResult {
  group: THREE.Group;
  animatedParts: AnimatedPart[];
  triangleCount: number;
  meshCount: number;
  /** Present on vehicles migrated to the articulated rig contract. */
  controller?: VehicleController;
}

/** Unified mechanical control contract shared by articulated vehicles. */
export interface VehicleController {
  /** Advances RPM inertia, door kinematics, pistons, aiming and weapon recoil. */
  update(delta: number): void;
  /** Engine demand from 0 (stopped) to 1 (full power). */
  setThrottle(value: number): void;
  setDoorsOpen(open: boolean): void;
  setFiring(firing: boolean): void;
  /** Target point in world space. */
  aimTurrets(target: THREE.Vector3): void;
  /** Objects transformed every frame; render batching must keep them live. */
  readonly dynamicObjects: THREE.Object3D[];
}

export interface AircraftDefinition {
  id: string;
  code: string;
  name: string;
  categoryLabel: string;
  vehicleClass: VehicleClass;
  scaleNote: string;
  cameraDistance: number;
  cameraElevation: number;
  subsystems: SubsystemNote[];
  build: () => BuiltModelResult;
}

export const PART_CATEGORY_META: Record<
  PartCategory,
  { label: string; shortLabel: string; accentHex: string; badgeClass: string }
> = {
  airframe: {
    label: 'Fuselaje y Superficies',
    shortLabel: 'Estructura',
    accentHex: '#38bdf8',
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  },
  cannon: {
    label: 'Cañón / Armamento Principal',
    shortLabel: 'Cañón',
    accentHex: '#f97316',
    badgeClass: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  },
  magazine: {
    label: 'Cargador / Tambor y Alimentación',
    shortLabel: 'Cargador',
    accentHex: '#eab308',
    badgeClass: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300',
  },
  thrusters: {
    label: 'Propulsores / Turbinas y Motores',
    shortLabel: 'Propulsores',
    accentHex: '#ef4444',
    badgeClass: 'border-red-500/40 bg-red-500/15 text-red-300',
  },
  sight: {
    label: 'Mira / Óptica FLIR y HUD',
    shortLabel: 'Mira',
    accentHex: '#10b981',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  mechanisms: {
    label: 'Mecanismos / Rotores y Tren',
    shortLabel: 'Mecanismos',
    accentHex: '#a855f7',
    badgeClass: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  },
};
