import * as THREE from 'three';
import { WeaponModelResult, WeaponPartEntry } from './types';

export interface BevelConfig {
  bevelThickness?: number;
  bevelSize?: number;
  bevelSegments?: number;
}

/**
 * Creates a beveled ExtrudeGeometry from a 2D [x, y] profile, centered on Z = 0,
 * with normalized UVs so procedural wood/knurling textures map cleanly.
 */
export function createExtrudedProfile(
  points: [number, number][],
  depth: number,
  bevel: BevelConfig = {}
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const bevelThickness = bevel.bevelThickness ?? Math.min(depth * 0.12, 0.02);
  const bevelSize = bevel.bevelSize ?? Math.min(depth * 0.12, 0.02);
  const bevelSegments = bevel.bevelSegments ?? 2;

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelThickness > 0 && bevelSize > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
    curveSegments: 10,
  });

  // Center extrusion around Z = 0
  geom.translate(0, 0, -depth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a rounded rectangle beveled extrusion centered at (0, 0, 0).
 */
export function createRoundedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.02,
  bevel = 0.012
): THREE.ExtrudeGeometry {
  const r = Math.min(radius, width * 0.45, height * 0.45);
  const hw = width * 0.5;
  const hh = height * 0.5;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const innerDepth = Math.max(0.004, depth - bevel * 2);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });

  geom.translate(0, 0, -innerDepth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a LatheGeometry whose rotational axis runs along +X.
 * Each point is [xPosition, radius].
 */
export function createLatheAlongX(
  profile: [number, number][],
  radialSegments = 24
): THREE.LatheGeometry {
  const lathePoints = profile.map(([x, r]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const geom = new THREE.LatheGeometry(lathePoints, radialSegments);
  // Rotate -90 deg around Z so +Y maps to +X
  geom.rotateZ(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a CylinderGeometry aligned along the +X axis.
 */
export function createCylinderX(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  radialSegments = 20,
  openEnded = false
): THREE.CylinderGeometry {
  const geom = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    length,
    radialSegments,
    1,
    openEnded
  );
  geom.rotateZ(-Math.PI / 2);
  return geom;
}

/**
 * Creates a CylinderGeometry aligned along the Z axis (for transverse pins, axles, sights).
 */
export function createCylinderZ(
  radius: number,
  length: number,
  radialSegments = 16
): THREE.CylinderGeometry {
  const geom = new THREE.CylinderGeometry(radius, radius, length, radialSegments);
  geom.rotateX(Math.PI / 2);
  return geom;
}

/**
 * Creates a smooth curved TubeGeometry from 3D control points.
 */
export function createCurvedTube(
  points: [number, number, number][],
  radius: number,
  tubularSegments = 20,
  radialSegments = 8
): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  );
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

/**
 * Adds a realistic hollow-crowned barrel group along +X starting at xStart.
 */
export function buildHollowBarrel(options: {
  xStart: number;
  yCenter: number;
  length: number;
  outerRadiusStart: number;
  outerRadiusEnd?: number;
  innerRadius: number;
  steelMaterial: THREE.Material;
  boreMaterial: THREE.Material;
  radialSegments?: number;
  crownChamfer?: number;
}): THREE.Group {
  const {
    xStart,
    yCenter,
    length,
    outerRadiusStart,
    outerRadiusEnd = outerRadiusStart,
    innerRadius,
    steelMaterial,
    boreMaterial,
    radialSegments = 24,
    crownChamfer = 0.015,
  } = options;

  const group = new THREE.Group();
  const xEnd = xStart + length;
  const boreDepth = Math.min(length * 0.45, 0.45);

  const profile: [number, number][] = [
    [xStart, 0.001],
    [xStart, outerRadiusStart],
    [xEnd - crownChamfer, outerRadiusEnd],
    [xEnd, Math.max(innerRadius + 0.006, outerRadiusEnd - crownChamfer * 0.6)],
    [xEnd, innerRadius],
    [xEnd - boreDepth, innerRadius],
  ];

  const outerGeom = createLatheAlongX(profile, radialSegments);
  const outerMesh = new THREE.Mesh(outerGeom, steelMaterial);
  outerMesh.position.y = yCenter;
  group.add(outerMesh);

  // Dark inner bore cap slightly recessed inside muzzle
  const boreCapGeom = createCylinderX(innerRadius * 0.99, innerRadius * 0.99, boreDepth, 16);
  const boreCap = new THREE.Mesh(boreCapGeom, boreMaterial);
  boreCap.position.set(xEnd - boreDepth * 0.55, yCenter, 0);
  group.add(boreCap);

  return group;
}

/**
 * Builds a MIL-STD-1913 Picatinny rail along the X axis with slotted recoil teeth.
 */
export function buildPicatinnyRail(options: {
  length: number;
  width?: number;
  height?: number;
  pitch?: number;
  material: THREE.Material;
}): THREE.Group {
  const {
    length,
    width = 0.21,
    height = 0.085,
    pitch = 0.1,
    material,
  } = options;

  const group = new THREE.Group();

  // Lower stem running continuous along length
  const stemGeom = new THREE.BoxGeometry(length, height * 0.48, width * 0.68);
  const stem = new THREE.Mesh(stemGeom, material);
  stem.position.y = height * 0.24;
  group.add(stem);

  // Slotted transverse rail lugs using InstancedMesh for optimal performance
  const toothLength = pitch * 0.54;
  const count = Math.max(2, Math.floor(length / pitch));
  const startX = -((count - 1) * pitch) * 0.5;

  const toothGeom = new THREE.BoxGeometry(toothLength, height * 0.56, width);
  const instancedTeeth = new THREE.InstancedMesh(toothGeom, material, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    dummy.position.set(startX + i * pitch, height * 0.72, 0);
    dummy.updateMatrix();
    instancedTeeth.setMatrixAt(i, dummy.matrix);
  }
  instancedTeeth.instanceMatrix.needsUpdate = true;
  group.add(instancedTeeth);

  return group;
}

/**
 * Adds a mesh to a parent group with position/rotation convenience.
 */
export function placeMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: [number, number, number],
  rotation?: [number, number, number]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

/**
 * Helper to create a labeled weapon anatomical sub-group.
 */
export function createPartGroup(
  id: string,
  label: string,
  explodeOffset: [number, number, number]
): WeaponPartEntry {
  const group = new THREE.Group();
  group.name = id;
  return {
    id,
    label,
    group,
    explodeOffset: new THREE.Vector3(...explodeOffset),
    basePosition: new THREE.Vector3(0, 0, 0),
  };
}

/**
 * Finalizes a weapon model: mounts all parts into a centered root group, enables shadows,
 * counts total triangles & meshes, and wires clean geometry disposal.
 */
export function finalizeWeaponModel(
  parts: WeaponPartEntry[],
  defaultCameraDistance: number
): WeaponModelResult {
  const root = new THREE.Group();
  const assembly = new THREE.Group();
  assembly.name = 'weapon-assembly';
  root.add(assembly);

  for (const part of parts) {
    part.basePosition.copy(part.group.position);
    assembly.add(part.group);
  }

  // Update matrices and center the whole assembly around (0, 0, 0)
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(assembly);
  const center = new THREE.Vector3();
  const dimensions = new THREE.Vector3();
  bbox.getCenter(center);
  bbox.getSize(dimensions);

  assembly.position.set(-center.x, -center.y, -center.z);

  let triangleCount = 0;
  let meshCount = 0;
  const geometries = new Set<THREE.BufferGeometry>();

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      meshCount += 1;

      const geom = obj.geometry;
      geometries.add(geom);

      const instances = obj instanceof THREE.InstancedMesh ? obj.count : 1;
      if (geom.index) {
        triangleCount += (geom.index.count / 3) * instances;
      } else if (geom.attributes.position) {
        triangleCount += (geom.attributes.position.count / 3) * instances;
      }
    }
  });

  return {
    root,
    parts,
    defaultCameraDistance,
    triangleCount: Math.round(triangleCount),
    meshCount,
    dimensions,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      geometries.clear();
    },
  };
}
