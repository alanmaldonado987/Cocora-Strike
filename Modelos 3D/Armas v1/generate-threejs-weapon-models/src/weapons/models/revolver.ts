import * as THREE from 'three';
import {
  buildHollowBarrel,
  createCurvedTube,
  createCylinderX,
  createCylinderZ,
  createExtrudedProfile,
  createLatheAlongX,
  createPartGroup,
  createRoundedBox,
  finalizeWeaponModel,
  placeMesh,
} from '../geometryHelpers';
import { WeaponMaterialLibrary, WeaponModelResult } from '../types';

/**
 * Builds a realistic fluted 6-shot revolver cylinder body along the X axis
 * using a scalloped 2D Shape extruded across the cylinder length.
 */
function createFlutedCylinderBody(
  outerRadius: number,
  length: number,
  fluteCount = 6
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const steps = 96;

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    // Chambers sit at 90° + k*60° (where cos(6*theta) = -1), so flutes carve cleanly between chambers
    const fluteWave = Math.cos(fluteCount * theta);
    const carve = fluteWave > 0.2 ? Math.pow((fluteWave - 0.2) / 0.8, 1.35) * 0.036 : 0;
    const r = outerRadius - carve;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 1,
  });
  // Extrude is along Z by default -> center and rotate to align along X
  geom.translate(0, 0, -length * 0.5);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

export function buildRevolverModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const barrelPart = createPartGroup('canon', 'Cañón con Banda Ventilada', [0.48, 0.14, 0]);
  const cylinderPart = createPartGroup('tambor', 'Tambor Estriado (6 Recámaras)', [0, 0.02, 0.58]);
  const framePart = createPartGroup('armazon', 'Armazón de Acero', [0, 0, 0]);
  const gripPart = createPartGroup('empunadura', 'Empuñadura de Nogal', [-0.46, -0.34, 0]);
  const sightsPart = createPartGroup('mira', 'Miras Micrómetricas', [0.08, 0.45, 0]);
  const mechPart = createPartGroup('mecanismo', 'Martillo, Gatillo y Eyector', [-0.15, 0.15, -0.25]);

  const barrelAxisY = 0.39;
  const cylinderCenterX = -0.02;
  const cylinderCenterY = 0.265;
  const cylinderLength = 0.46;
  const cylinderRadius = 0.21;

  // ---------------------------------------------------------------------------
  // 1. VENTED-RIB BARREL & FULL UNDERLUG (Cañón)
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: 0.24,
    yCenter: barrelAxisY,
    length: 1.42,
    outerRadiusStart: 0.095,
    outerRadiusEnd: 0.088,
    innerRadius: 0.048,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 24,
    crownChamfer: 0.02,
  });
  barrelPart.group.add(barrelGroup);

  // Full-length underlug beneath barrel housing the ejector rod
  const underlugProfile: [number, number][] = [
    [0.24, 0.38],
    [1.64, 0.38],
    [1.64, 0.245],
    [1.58, 0.215],
    [0.32, 0.215],
    [0.24, 0.24],
  ];
  const underlugGeom = createExtrudedProfile(underlugProfile, 0.14, {
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  placeMesh(barrelPart.group, underlugGeom, materials.bluedSteel);

  // Side flutes / chamfer accents along underlug
  const lugGroove = createRoundedBox(1.22, 0.045, 0.172, 0.012, 0.006);
  placeMesh(barrelPart.group, lugGroove, materials.gunmetal, [0.95, 0.3, 0]);

  // Iconic ventilated top rib along the barrel (3 machined open vent bridges)
  const ribTopBar = createRoundedBox(1.36, 0.036, 0.105, 0.008, 0.006);
  placeMesh(barrelPart.group, ribTopBar, materials.bluedSteel, [0.95, 0.545, 0]);

  // Vertical rib posts separating the 3 vents
  const postXs = [0.32, 0.64, 0.98, 1.32, 1.59];
  const postGeom = createRoundedBox(0.085, 0.09, 0.088, 0.008, 0.005);
  for (const px of postXs) {
    placeMesh(barrelPart.group, postGeom, materials.bluedSteel, [px, 0.495, 0]);
  }

  // Barrel forcing cone slightly entering the frame window
  const forcingCone = createCylinderX(0.085, 0.095, 0.06, 20);
  placeMesh(barrelPart.group, forcingCone, materials.chromeSteel, [0.225, barrelAxisY, 0]);

  // ---------------------------------------------------------------------------
  // 2. FLUTED 6-SHOT CYLINDER & .357 CARTRIDGES (Tambor)
  // ---------------------------------------------------------------------------
  // Fluted central core
  const flutedCore = createFlutedCylinderBody(cylinderRadius, cylinderLength * 0.72, 6);
  placeMesh(cylinderPart.group, flutedCore, materials.bluedSteel, [
    cylinderCenterX,
    cylinderCenterY,
    0,
  ]);

  // Unfluted front & rear machined rings so flutes terminate cleanly inside cylinder
  const rearRing = createCylinderX(cylinderRadius, cylinderRadius, 0.095, 28);
  placeMesh(cylinderPart.group, rearRing, materials.bluedSteel, [
    cylinderCenterX - cylinderLength * 0.39,
    cylinderCenterY,
    0,
  ]);

  const frontRing = createCylinderX(cylinderRadius * 0.98, cylinderRadius, 0.065, 28);
  placeMesh(cylinderPart.group, frontRing, materials.bluedSteel, [
    cylinderCenterX + cylinderLength * 0.41,
    cylinderCenterY,
    0,
  ]);

  // Central cylinder arbor rod & ratchet star
  const arborRod = createCylinderX(0.042, 0.042, cylinderLength + 0.08, 16);
  placeMesh(cylinderPart.group, arborRod, materials.chromeSteel, [
    cylinderCenterX,
    cylinderCenterY,
    0,
  ]);

  // 6 Chamber bores & .357 Magnum brass cartridges visible front & rear!
  const chamberOrbit = 0.125; // top chamber aligns with y = 0.265 + 0.125 = 0.39 = barrelAxisY!
  const rimGeom = createCylinderX(0.052, 0.052, 0.022, 14);
  const primerGeom = createCylinderX(0.02, 0.02, 0.026, 10);
  const boreHoleGeom = createCylinderX(0.047, 0.047, 0.03, 14);
  const bulletNoseGeom = createLatheAlongX(
    [
      [0, 0.043],
      [0.045, 0.036],
      [0.075, 0.018],
      [0.085, 0.002],
    ],
    12
  );

  for (let i = 0; i < 6; i++) {
    // Place chamber #0 strictly at top (+Y) so it aligns with the barrel axis
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 6;
    const cy = cylinderCenterY + Math.sin(angle) * chamberOrbit;
    const cz = Math.cos(angle) * chamberOrbit;

    // Rear brass rim & silver primer
    placeMesh(cylinderPart.group, rimGeom, materials.brass, [
      cylinderCenterX - cylinderLength * 0.505,
      cy,
      cz,
    ]);
    placeMesh(cylinderPart.group, primerGeom, materials.chromeSteel, [
      cylinderCenterX - cylinderLength * 0.508,
      cy,
      cz,
    ]);

    // Front chamber opening & seated copper-jacketed bullet nose
    placeMesh(cylinderPart.group, boreHoleGeom, materials.darkBore, [
      cylinderCenterX + cylinderLength * 0.485,
      cy,
      cz,
    ]);
    placeMesh(cylinderPart.group, bulletNoseGeom, materials.copperJacket, [
      cylinderCenterX + cylinderLength * 0.34,
      cy,
      cz,
    ]);
  }

  // Swing-out cylinder crane arm beneath the cylinder
  const craneArm = createRoundedBox(0.16, 0.19, 0.075, 0.018, 0.008);
  placeMesh(cylinderPart.group, craneArm, materials.bluedSteel, [0.22, 0.12, 0]);

  // ---------------------------------------------------------------------------
  // 3. FORGED STEEL FRAME (Armazón de Acero)
  // ---------------------------------------------------------------------------
  // Top strap spanning above cylinder window
  const topStrap = createRoundedBox(0.86, 0.075, 0.18, 0.016, 0.01);
  placeMesh(framePart.group, topStrap, materials.bluedSteel, [-0.12, 0.525, 0]);

  // Rear frame & curved recoil shield behind cylinder
  const rearFrameProfile: [number, number][] = [
    [-0.58, 0.52],
    [-0.27, 0.52],
    [-0.27, 0.02],
    [0.24, 0.02],
    [0.32, 0.16],
    [0.32, 0.52],
    [0.22, 0.52],
    [0.22, 0.04],
    [-0.25, 0.04],
    [-0.25, -0.04],
    [-0.45, -0.08],
    [-0.56, 0.02],
    [-0.68, 0.24],
    [-0.64, 0.44],
  ];
  const rearFrameGeom = createExtrudedProfile(rearFrameProfile, 0.19, {
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  placeMesh(framePart.group, rearFrameGeom, materials.bluedSteel);

  // Rounded recoil shield cheeks hugging the rear of the cylinder
  const recoilShield = createCylinderX(0.205, 0.215, 0.12, 24);
  placeMesh(framePart.group, recoilShield, materials.bluedSteel, [-0.32, cylinderCenterY, 0]);

  // Lower frame housing for trigger mechanism
  const triggerHousingProfile: [number, number][] = [
    [-0.52, 0.12],
    [0.24, 0.06],
    [0.22, -0.07],
    [-0.38, -0.14],
    [-0.56, -0.05],
  ];
  const triggerHousing = createExtrudedProfile(triggerHousingProfile, 0.175, {
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(framePart.group, triggerHousing, materials.bluedSteel);

  // Classic graceful oval revolver trigger guard
  const guardCurve = createCurvedTube(
    [
      [-0.44, -0.14, 0],
      [-0.42, -0.28, 0],
      [-0.18, -0.34, 0],
      [0.08, -0.29, 0],
      [0.16, -0.16, 0],
      [0.14, -0.04, 0],
    ],
    0.028,
    24,
    10
  );
  guardCurve.scale(1, 1, 1.4);
  placeMesh(framePart.group, guardCurve, materials.bluedSteel);

  // Sideplate screw heads on right side (+Z)
  const screwGeom = createCylinderZ(0.022, 0.225, 12);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.42, 0.14, 0]);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.34, -0.02, 0]);
  placeMesh(framePart.group, screwGeom, materials.chromeSteel, [-0.08, -0.02, 0]);

  // ---------------------------------------------------------------------------
  // 4. CONTOURED WALNUT HARDWOOD GRIP (Empuñadura de Nogal)
  // ---------------------------------------------------------------------------
  // Central steel backstrap spine
  const gripSpineProfile: [number, number][] = [
    [-0.58, 0.22],
    [-0.46, 0.12],
    [-0.46, -0.1],
    [-0.64, -0.45],
    [-0.76, -0.82],
    [-1.16, -0.78],
    [-1.08, -0.46],
    [-0.86, -0.06],
    [-0.68, 0.16],
  ];
  const gripSpine = createExtrudedProfile(gripSpineProfile, 0.15, {
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(gripPart.group, gripSpine, materials.bluedSteel);

  // Sculpted left & right walnut wood grip panels (slightly wider & gracefully curved)
  const walnutPanelProfile: [number, number][] = [
    [-0.64, 0.18],
    [-0.48, 0.06],
    [-0.5, -0.16],
    [-0.64, -0.44],
    [-0.75, -0.85],
    [-1.18, -0.81],
    [-1.12, -0.52],
    [-0.95, -0.18],
    [-0.78, 0.08],
  ];
  const walnutGeom = createExtrudedProfile(walnutPanelProfile, 0.245, {
    bevelThickness: 0.032,
    bevelSize: 0.028,
    bevelSegments: 3,
  });
  placeMesh(gripPart.group, walnutGeom, materials.woodWalnut);

  // Brass circular manufacturer medallions inset on both walnut panels
  const medallionGeom = createCylinderZ(0.042, 0.312, 16);
  placeMesh(gripPart.group, medallionGeom, materials.brass, [-0.74, -0.18, 0]);

  // Grip mounting screw in lower center
  const gripScrew = createCylinderZ(0.024, 0.305, 12);
  placeMesh(gripPart.group, gripScrew, materials.chromeSteel, [-0.88, -0.54, 0]);

  // ---------------------------------------------------------------------------
  // 5. ADJUSTABLE TARGET SIGHTS (Miras Micrométricas)
  // ---------------------------------------------------------------------------
  // Rear micrometer sight housing on top strap
  const rearSightBase = createRoundedBox(0.34, 0.055, 0.145, 0.008, 0.005);
  placeMesh(sightsPart.group, rearSightBase, materials.gunmetal, [-0.36, 0.585, 0]);

  // Rear sight blade ears framing the square notch
  const rearBladeEar = createRoundedBox(0.045, 0.06, 0.052, 0.006, 0.003);
  placeMesh(sightsPart.group, rearBladeEar, materials.matteSteel, [-0.51, 0.625, 0.052]);
  placeMesh(sightsPart.group, rearBladeEar, materials.matteSteel, [-0.51, 0.625, -0.052]);

  // Sloped serrated front ramp sight with vivid red visibility insert
  const frontRampProfile: [number, number][] = [
    [1.26, 0.56],
    [1.61, 0.56],
    [1.61, 0.68],
    [1.54, 0.68],
    [1.36, 0.61],
  ];
  const frontRamp = createExtrudedProfile(frontRampProfile, 0.052, {
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  placeMesh(sightsPart.group, frontRamp, materials.bluedSteel);

  const redInsert = createRoundedBox(0.11, 0.052, 0.032, 0.005, 0.003);
  placeMesh(sightsPart.group, redInsert, materials.sightRed, [1.47, 0.638, 0], [0, 0, 0.42]);

  // ---------------------------------------------------------------------------
  // 6. MECHANISMS — SPUR HAMMER, TRIGGER, EJECTOR ROD, LATCH (Mecanismos)
  // ---------------------------------------------------------------------------
  // Classic curved exposed spur hammer
  const hammerProfile: [number, number][] = [
    [-0.56, 0.3],
    [-0.46, 0.34],
    [-0.5, 0.5],
    [-0.64, 0.58],
    [-0.76, 0.58], // hammer thumb spur tip
    [-0.75, 0.52],
    [-0.65, 0.48],
    [-0.61, 0.36],
  ];
  const hammerGeom = createExtrudedProfile(hammerProfile, 0.072, {
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  placeMesh(mechPart.group, hammerGeom, materials.chromeSteel);

  // Curved double-action chrome trigger
  const triggerProfile: [number, number][] = [
    [-0.18, -0.02],
    [-0.08, -0.02],
    [-0.12, -0.14],
    [-0.06, -0.25],
    [-0.13, -0.265],
    [-0.21, -0.15],
  ];
  const triggerGeom = createExtrudedProfile(triggerProfile, 0.062, {
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  placeMesh(mechPart.group, triggerGeom, materials.chromeSteel);

  // Under-barrel ejector rod & knurled locking knob
  const ejectorRod = createCylinderX(0.028, 0.028, 0.72, 14);
  placeMesh(mechPart.group, ejectorRod, materials.chromeSteel, [0.64, 0.255, 0]);
  const ejectorTip = createCylinderX(0.04, 0.036, 0.085, 16);
  placeMesh(mechPart.group, ejectorTip, materials.chromeSteel, [1.02, 0.255, 0]);

  // Left-side checkered thumbpiece cylinder latch
  const thumbLatch = createRoundedBox(0.16, 0.09, 0.04, 0.015, 0.008);
  placeMesh(mechPart.group, thumbLatch, materials.gunmetal, [-0.46, 0.3, -0.118]);

  return finalizeWeaponModel(
    [barrelPart, cylinderPart, framePart, gripPart, sightsPart, mechPart],
    4.2
  );
}
