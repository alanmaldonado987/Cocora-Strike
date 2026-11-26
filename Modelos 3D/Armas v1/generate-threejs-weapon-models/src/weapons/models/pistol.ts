import * as THREE from 'three';
import {
  buildHollowBarrel,
  buildPicatinnyRail,
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

export function buildPistolModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const slidePart = createPartGroup('corredera', 'Corredera', [0, 0.45, 0]);
  const barrelPart = createPartGroup('canon', 'Cañón y Recámara', [0.42, 0.22, 0]);
  const framePart = createPartGroup('empunadura', 'Armazón y Empuñadura', [0, -0.15, 0]);
  const magPart = createPartGroup('cargador', 'Cargador', [-0.26, -0.82, 0]);
  const sightsPart = createPartGroup('mira', 'Miras de 3 Puntos', [0, 0.68, 0]);
  const mechPart = createPartGroup('mecanismo', 'Mecanismos y Controles', [0.18, -0.02, 0.25]);

  // ---------------------------------------------------------------------------
  // 1. SLIDE (Corredera) — Iconic chamfered profile + front/rear serrations
  // ---------------------------------------------------------------------------
  // Build cross-section of slide in YZ plane and extrude along X for crisp upper bevels
  const slideCrossSection = new THREE.Shape();
  slideCrossSection.moveTo(-0.145, 0.085);
  slideCrossSection.lineTo(0.145, 0.085);
  slideCrossSection.lineTo(0.145, 0.315);
  slideCrossSection.lineTo(0.105, 0.39);
  slideCrossSection.lineTo(-0.105, 0.39);
  slideCrossSection.lineTo(-0.145, 0.315);
  slideCrossSection.closePath();

  // Rear slide block (behind ejection port: x = -0.96 to -0.15)
  const rearSlideGeom = new THREE.ExtrudeGeometry(slideCrossSection, {
    depth: 0.81,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  rearSlideGeom.rotateY(Math.PI / 2);
  placeMesh(slidePart.group, rearSlideGeom, materials.bluedSteel, [-0.96, 0, 0]);

  // Front slide block (ahead of ejection port: x = +0.28 to +1.04)
  const frontSlideGeom = new THREE.ExtrudeGeometry(slideCrossSection, {
    depth: 0.76,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  frontSlideGeom.rotateY(Math.PI / 2);
  placeMesh(slidePart.group, frontSlideGeom, materials.bluedSteel, [0.28, 0, 0]);

  // Left-side bridge connecting front & rear slide across ejection port (z < 0 side)
  const leftBridge = createRoundedBox(0.47, 0.295, 0.075, 0.012, 0.008);
  placeMesh(slidePart.group, leftBridge, materials.bluedSteel, [0.065, 0.238, -0.11]);

  // Lower right bridge below ejection port
  const lowerRightBridge = createRoundedBox(0.47, 0.085, 0.08, 0.01, 0.006);
  placeMesh(slidePart.group, lowerRightBridge, materials.bluedSteel, [0.065, 0.13, 0.108]);

  // Slight front bevel nose cap
  const noseCap = createRoundedBox(0.06, 0.26, 0.24, 0.02, 0.01);
  placeMesh(slidePart.group, noseCap, materials.bluedSteel, [1.035, 0.23, 0]);

  // Recessed rear slide striker plate
  const backplate = createRoundedBox(0.025, 0.21, 0.19, 0.015, 0.006);
  placeMesh(slidePart.group, backplate, materials.matteSteel, [-0.97, 0.21, 0]);

  // Front & rear angled cocking serrations on both sides
  const serrationGeom = new THREE.BoxGeometry(0.024, 0.21, 0.016);
  const rearSerrationXs = [-0.84, -0.77, -0.7, -0.63, -0.56, -0.49];
  const frontSerrationXs = [0.56, 0.63, 0.7, 0.77];

  for (const x of [...rearSerrationXs, ...frontSerrationXs]) {
    placeMesh(slidePart.group, serrationGeom, materials.matteSteel, [x, 0.205, 0.146], [0, 0, -0.14]);
    placeMesh(slidePart.group, serrationGeom, materials.matteSteel, [x, 0.205, -0.146], [0, 0, -0.14]);
  }

  // External extractor bar on right side behind ejection port
  const extractor = createRoundedBox(0.24, 0.055, 0.024, 0.008, 0.004);
  placeMesh(slidePart.group, extractor, materials.gunmetal, [-0.28, 0.26, 0.142]);

  // ---------------------------------------------------------------------------
  // 2. BARREL & CHAMBER (Cañón y Recámara) — Visible stainless hood & crowned muzzle
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: -0.12,
    yCenter: 0.265,
    length: 1.24,
    outerRadiusStart: 0.072,
    outerRadiusEnd: 0.072,
    innerRadius: 0.046,
    steelMaterial: materials.chromeSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 24,
    crownChamfer: 0.016,
  });
  barrelPart.group.add(barrelGroup);

  // Locking block / square chamber hood visible right through the ejection port!
  const chamberHood = createRoundedBox(0.41, 0.17, 0.175, 0.02, 0.012);
  placeMesh(barrelPart.group, chamberHood, materials.chromeSteel, [0.06, 0.285, 0.01]);

  // Subtle dark chamber gap line for mechanical depth
  const breechFace = new THREE.BoxGeometry(0.04, 0.15, 0.15);
  placeMesh(barrelPart.group, breechFace, materials.darkBore, [-0.15, 0.265, 0.01]);

  // Recoil guide rod & captive recoil spring underneath barrel (visible at muzzle & in exploded view)
  const guideRod = createCylinderX(0.032, 0.032, 0.96, 14);
  placeMesh(barrelPart.group, guideRod, materials.matteSteel, [0.56, 0.145, 0]);
  const springCoilGeom = new THREE.TorusGeometry(0.044, 0.008, 8, 16);
  springCoilGeom.rotateY(Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    placeMesh(barrelPart.group, springCoilGeom, materials.chromeSteel, [0.22 + i * 0.065, 0.145, 0]);
  }
  const guideCap = createCylinderX(0.042, 0.042, 0.04, 16);
  placeMesh(barrelPart.group, guideCap, materials.gunmetal, [1.045, 0.145, 0]);

  // ---------------------------------------------------------------------------
  // 3. LOWER POLYMER FRAME & ERGONOMIC GRIP (Armazón y Empuñadura)
  // ---------------------------------------------------------------------------
  // Main frame dust cover & rail body
  const frameProfile: [number, number][] = [
    [-1.06, 0.06], // sculpted beavertail tang tip
    [-0.92, 0.085],
    [1.01, 0.085],
    [1.01, -0.02],
    [0.95, -0.065],
    [0.36, -0.065],
    [0.32, -0.04],
    [-0.25, -0.04],
    [-0.36, -0.14],
    [-0.9, -0.14],
    [-0.95, -0.01],
    [-1.06, 0.02],
  ];
  const frameGeom = createExtrudedProfile(frameProfile, 0.25, {
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(framePart.group, frameGeom, materials.polymerDark);

  // Under-barrel 3-slot Picatinny accessory rail
  const underRail = buildPicatinnyRail({
    length: 0.52,
    width: 0.21,
    height: 0.065,
    pitch: 0.14,
    material: materials.polymerDark,
  });
  underRail.rotation.x = Math.PI; // invert downward
  underRail.position.set(0.68, -0.06, 0);
  framePart.group.add(underRail);

  // Sculpted ergonomic grip (angled ~18 deg rearwards) with palm swell & undercut
  const gripProfile: [number, number][] = [
    [-0.89, -0.02],
    [-0.34, -0.04],
    [-0.4, -0.18], // finger undercut behind trigger guard
    [-0.45, -0.34],
    [-0.5, -0.54],
    [-0.56, -0.74],
    [-0.61, -0.92],
    [-1.12, -0.92],
    [-1.09, -0.74],
    [-1.06, -0.52], // ergonomic palm swell
    [-0.98, -0.26],
    [-0.92, -0.09],
  ];
  const gripGeom = createExtrudedProfile(gripProfile, 0.255, {
    bevelThickness: 0.022,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  placeMesh(framePart.group, gripGeom, materials.polymerDark);

  // Knurled/stippled recessed grip panels on both sides of the grip
  const panelProfile: [number, number][] = [
    [-0.86, -0.16],
    [-0.47, -0.18],
    [-0.64, -0.82],
    [-1.02, -0.82],
  ];
  const panelGeom = createExtrudedProfile(panelProfile, 0.292, {
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  placeMesh(framePart.group, panelGeom, materials.polymerGrip);

  // Slight flared tactical magwell collar at bottom of grip
  const magwell = createRoundedBox(0.58, 0.075, 0.31, 0.025, 0.012);
  placeMesh(framePart.group, magwell, materials.polymerAccent, [-0.865, -0.91, 0]);

  // Squared tactical trigger guard with front finger rest
  const guardCurve = createCurvedTube(
    [
      [-0.36, -0.34, 0],
      [0.24, -0.35, 0],
      [0.34, -0.31, 0],
      [0.36, -0.16, 0],
      [0.32, -0.05, 0],
    ],
    0.036,
    24,
    8
  );
  // Flatten Z slightly so guard looks squared-off like polymer frames
  guardCurve.scale(1, 1, 1.45);
  placeMesh(framePart.group, guardCurve, materials.polymerDark);

  // ---------------------------------------------------------------------------
  // 4. REMOVABLE DOUBLE-STACK MAGAZINE (Cargador)
  // ---------------------------------------------------------------------------
  // Angled metallic magazine body aligned with the ~16 deg grip angle
  const magAngle = -0.27; // radians
  const magSubGroup = new THREE.Group();
  magSubGroup.position.set(-0.74, -0.58, 0);
  magSubGroup.rotation.z = magAngle;

  const magTube = createRoundedBox(0.32, 0.94, 0.195, 0.025, 0.01);
  placeMesh(magSubGroup, magTube, materials.bluedSteel, [0, 0.04, 0]);

  // Witness round-count holes on the back face of magazine
  const witnessDot = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 10);
  witnessDot.rotateZ(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    placeMesh(magSubGroup, witnessDot, materials.brass, [-0.162, -0.22 + i * 0.14, 0]);
  }

  // Feed lips & visible top 9mm cartridge (awesome detail when inspecting exploded view!)
  const cartridgeCasing = createCylinderX(0.048, 0.048, 0.18, 14);
  placeMesh(magSubGroup, cartridgeCasing, materials.brass, [-0.01, 0.54, 0]);
  const bulletTip = createLatheAlongX(
    [
      [0.08, 0.046],
      [0.14, 0.04],
      [0.18, 0.022],
      [0.2, 0.002],
    ],
    14
  );
  placeMesh(magSubGroup, bulletTip, materials.copperJacket, [0, 0.54, 0]);

  magPart.group.add(magSubGroup);

  // Extended contoured polymer basepad protruding below the magwell
  const basepadProfile: [number, number][] = [
    [-1.14, -0.945],
    [-0.57, -0.945],
    [-0.55, -1.03],
    [-0.63, -1.08],
    [-1.13, -1.08],
    [-1.16, -1.01],
  ];
  const basepadGeom = createExtrudedProfile(basepadProfile, 0.25, {
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  placeMesh(magPart.group, basepadGeom, materials.polymerGrip);

  // ---------------------------------------------------------------------------
  // 5. TRITIUM 3-DOT IRON SIGHTS (Miras de 3 Puntos)
  // ---------------------------------------------------------------------------
  // Rear sight dovetail base
  const rearBase = createRoundedBox(0.11, 0.028, 0.22, 0.008, 0.004);
  placeMesh(sightsPart.group, rearBase, materials.gunmetal, [-0.84, 0.4, 0]);

  // Rear sight left & right wings forming a crisp U-notch
  const rearWing = createRoundedBox(0.085, 0.082, 0.068, 0.008, 0.005);
  placeMesh(sightsPart.group, rearWing, materials.gunmetal, [-0.85, 0.445, 0.068]);
  placeMesh(sightsPart.group, rearWing, materials.gunmetal, [-0.85, 0.445, -0.068]);

  // Rear glowing tritium dots
  const dotGeom = createCylinderX(0.015, 0.015, 0.012, 12);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [-0.892, 0.448, 0.068]);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [-0.892, 0.448, -0.068]);

  // Front blade sight + bright dot
  const frontBlade = createRoundedBox(0.12, 0.088, 0.036, 0.006, 0.004);
  placeMesh(sightsPart.group, frontBlade, materials.gunmetal, [0.92, 0.432, 0]);
  placeMesh(sightsPart.group, dotGeom, materials.sightGreen, [0.858, 0.446, 0]);

  // ---------------------------------------------------------------------------
  // 6. MECHANISMS & CONTROLS (Mecanismos y Controles)
  // ---------------------------------------------------------------------------
  // Curved trigger with central safety blade
  const triggerProfile: [number, number][] = [
    [-0.03, -0.02],
    [0.05, -0.02],
    [0.02, -0.14],
    [0.08, -0.25],
    [0.02, -0.27],
    [-0.05, -0.15],
  ];
  const triggerGeom = createExtrudedProfile(triggerProfile, 0.065, {
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  placeMesh(mechPart.group, triggerGeom, materials.gunmetal, [0.02, -0.01, 0]);

  // Inner safety lever inside trigger
  const safetyBlade = createRoundedBox(0.024, 0.16, 0.022, 0.004, 0.002);
  placeMesh(mechPart.group, safetyBlade, materials.polymerAccent, [0.04, -0.14, 0], [0, 0, 0.22]);

  // Slide stop lever (both sides — ambidextrous)
  const slideStop = createRoundedBox(0.24, 0.042, 0.026, 0.008, 0.004);
  placeMesh(mechPart.group, slideStop, materials.gunmetal, [-0.26, 0.06, 0.148]);
  placeMesh(mechPart.group, slideStop, materials.gunmetal, [-0.26, 0.06, -0.148]);

  // Takedown lever (forward above trigger guard)
  const takedown = createRoundedBox(0.11, 0.042, 0.305, 0.012, 0.005);
  placeMesh(mechPart.group, takedown, materials.matteSteel, [0.16, 0.042, 0]);

  // Magazine release button behind trigger guard
  const magRelease = createRoundedBox(0.075, 0.068, 0.305, 0.012, 0.006);
  placeMesh(mechPart.group, magRelease, materials.gunmetal, [-0.39, -0.16, 0]);

  // Cross pins in frame
  const pinGeom = createCylinderZ(0.018, 0.278, 12);
  placeMesh(mechPart.group, pinGeom, materials.chromeSteel, [-0.04, 0.025, 0]);
  placeMesh(mechPart.group, pinGeom, materials.chromeSteel, [-0.72, 0.025, 0]);

  return finalizeWeaponModel(
    [slidePart, barrelPart, framePart, magPart, sightsPart, mechPart],
    3.6
  );
}
