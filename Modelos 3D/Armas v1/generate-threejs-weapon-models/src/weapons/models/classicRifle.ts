import * as THREE from 'three';
import {
  buildHollowBarrel,
  createCurvedTube,
  createCylinderX,
  createCylinderZ,
  createExtrudedProfile,
  createPartGroup,
  createRoundedBox,
  finalizeWeaponModel,
  placeMesh,
} from '../geometryHelpers';
import { WeaponMaterialLibrary, WeaponModelResult } from '../types';

export function buildClassicRifleModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const receiverPart = createPartGroup('cajon', 'Cajón Estampado y Cerrojo', [0, 0.1, 0]);
  const barrelPart = createPartGroup('canon', 'Cañón, Bloque de Gases y Bocacha', [1.15, 0.08, 0]);
  const handguardPart = createPartGroup('guardamanos', 'Guardamanos de Madera Laminada', [0.55, 0.48, 0]);
  const magPart = createPartGroup('cargador', 'Cargador Curvo 7.62mm', [0.28, -1.08, 0]);
  const gripPart = createPartGroup('empunadura', 'Empuñadura de Baquelita y Disparo', [-0.14, -0.68, 0]);
  const stockPart = createPartGroup('culata', 'Culata de Madera Laminada', [-1.22, -0.1, 0]);
  const sightsPart = createPartGroup('mira', 'Mira Tangencial y Poste Frontal', [0, 0.68, 0]);

  const barrelY = 0.25;

  // ---------------------------------------------------------------------------
  // 1. STAMPED STEEL RECEIVER, RIBBED DUST COVER & BOLT (Cajón y Mecanismos)
  // ---------------------------------------------------------------------------
  // Stamped lower rectangular receiver body (x = -1.62 to +0.94)
  const receiverBody = createRoundedBox(2.56, 0.38, 0.34, 0.02, 0.014);
  placeMesh(receiverPart.group, receiverBody, materials.bluedSteel, [-0.34, 0.08, 0]);

  // Iconic oval magwell stabilization dimples on left & right receiver faces
  const dimpleGeom = createRoundedBox(0.28, 0.095, 0.362, 0.038, 0.008);
  placeMesh(receiverPart.group, dimpleGeom, materials.gunmetal, [0.32, 0.04, 0]);

  // Stamped steel rivets along receiver walls
  const rivetGeom = createCylinderZ(0.022, 0.378, 10);
  const rivetCoords: [number, number][] = [
    [-1.46, 0.16],
    [-1.46, 0.0],
    [-0.78, -0.02],
    [-0.45, -0.02],
    [0.68, 0.18],
    [0.72, 0.02],
  ];
  for (const [rx, ry] of rivetCoords) {
    placeMesh(receiverPart.group, rivetGeom, materials.matteSteel, [rx, ry, 0]);
  }

  // Domed stamped steel top dust cover (x = -1.60 to +0.48)
  const dustCoverCross = new THREE.Shape();
  dustCoverCross.moveTo(-0.16, 0.25);
  dustCoverCross.lineTo(0.16, 0.25);
  dustCoverCross.lineTo(0.15, 0.39);
  dustCoverCross.quadraticCurveTo(0, 0.48, -0.15, 0.39);
  dustCoverCross.closePath();

  const dustCoverGeom = new THREE.ExtrudeGeometry(dustCoverCross, {
    depth: 2.06,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  dustCoverGeom.rotateY(Math.PI / 2);
  placeMesh(receiverPart.group, dustCoverGeom, materials.bluedSteel, [-1.58, 0, 0]);

  // Characteristic AKM transverse reinforcing ribs stamped into the dust cover
  const coverRibGeom = createRoundedBox(0.055, 0.14, 0.345, 0.02, 0.008);
  for (const x of [-1.22, -0.82, -0.42]) {
    placeMesh(receiverPart.group, coverRibGeom, materials.gunmetal, [x, 0.38, 0]);
  }

  // Rear dust-cover release button protruding from back of receiver
  const releaseBtn = createRoundedBox(0.1, 0.095, 0.09, 0.014, 0.008);
  placeMesh(receiverPart.group, releaseBtn, materials.matteSteel, [-1.63, 0.34, 0]);

  // Polished steel reciprocating bolt carrier & iconic upturned right-side charging handle
  const boltSlot = createRoundedBox(0.92, 0.12, 0.04, 0.014, 0.004);
  placeMesh(receiverPart.group, boltSlot, materials.darkBore, [0.02, 0.3, 0.158]);

  const boltCarrier = createRoundedBox(0.76, 0.105, 0.055, 0.015, 0.006);
  placeMesh(receiverPart.group, boltCarrier, materials.chromeSteel, [0.08, 0.3, 0.155]);

  // Upturned curved charging handle arm (+Z)
  const chargeHandle = createCurvedTube(
    [
      [0.24, 0.3, 0.16],
      [0.24, 0.3, 0.32],
      [0.24, 0.37, 0.42],
    ],
    0.036,
    12,
    10
  );
  placeMesh(receiverPart.group, chargeHandle, materials.chromeSteel);

  // Iconic long stamped steel AK right-side safety selector lever
  const selectorProfile: [number, number][] = [
    [-1.34, 0.17],
    [-1.24, 0.24],
    [-0.1, 0.2],
    [0.08, 0.14],
    [0.06, 0.07],
    [-0.14, 0.12],
    [-1.26, 0.12],
  ];
  const selectorGeom = createExtrudedProfile(selectorProfile, 0.026, {
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  placeMesh(receiverPart.group, selectorGeom, materials.gunmetal, [0, 0, 0.19]);

  // Finger tab protruding off the selector lever
  const selectorTab = createRoundedBox(0.11, 0.068, 0.065, 0.01, 0.005);
  placeMesh(receiverPart.group, selectorTab, materials.gunmetal, [0.01, 0.11, 0.22]);

  // ---------------------------------------------------------------------------
  // 2. BARREL, GAS SYSTEM, CLEANING ROD & SLANTED MUZZLE BRAKE (Cañón)
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: 0.9,
    yCenter: barrelY,
    length: 3.24,
    outerRadiusStart: 0.096,
    outerRadiusEnd: 0.076,
    innerRadius: 0.044,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 22,
    crownChamfer: 0.014,
  });
  barrelPart.group.add(barrelGroup);

  // Iconic AKM cylindrical 35° slanted muzzle compensator (x = 4.10 to 4.44)
  // Build a custom sliced hollow cylinder where top cuts back at x=4.26 and bottom extends to x=4.44
  const brakeCollar = createCylinderX(0.098, 0.098, 0.16, 20);
  placeMesh(barrelPart.group, brakeCollar, materials.gunmetal, [4.16, barrelY, 0]);

  const scoopShape = new THREE.Shape();
  const bOut = 0.096;
  const bIn = 0.062;
  const scoopSegs = 16;
  // Lower semi-circular scoop arc (bottom half of cylinder extending forward)
  for (let i = 0; i <= scoopSegs; i++) {
    const a = Math.PI + (i / scoopSegs) * Math.PI; // -X through -Y to +X
    const px = Math.cos(a) * bOut;
    const py = Math.sin(a) * bOut;
    if (i === 0) scoopShape.moveTo(px, py);
    else scoopShape.lineTo(px, py);
  }
  for (let i = scoopSegs; i >= 0; i--) {
    const a = Math.PI + (i / scoopSegs) * Math.PI;
    scoopShape.lineTo(Math.cos(a) * bIn, Math.sin(a) * bIn);
  }
  scoopShape.closePath();

  const scoopGeom = new THREE.ExtrudeGeometry(scoopShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  scoopGeom.rotateY(Math.PI / 2);
  scoopGeom.computeVertexNormals();
  placeMesh(barrelPart.group, scoopGeom, materials.gunmetal, [4.21, barrelY, 0]);

  const brakeBore = createCylinderX(0.06, 0.06, 0.18, 16);
  placeMesh(barrelPart.group, brakeBore, materials.darkBore, [4.18, barrelY, 0]);

  // Upper steel gas piston tube above barrel (x = 0.88 to 2.86)
  const gasTube = createCylinderX(0.088, 0.088, 1.96, 18);
  placeMesh(barrelPart.group, gasTube, materials.bluedSteel, [1.88, 0.48, 0]);

  // Iconic 45° angled AK gas block uniting barrel & gas tube (x = 2.74 to 3.04)
  const gasBlockProfile: [number, number][] = [
    [2.72, 0.15],
    [3.04, 0.15],
    [3.04, 0.34],
    [2.9, 0.56],
    [2.72, 0.56],
  ];
  const gasBlockGeom = createExtrudedProfile(gasBlockProfile, 0.175, {
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(barrelPart.group, gasBlockGeom, materials.gunmetal);

  // Iconic AK cleaning rod tucked cleanly beneath the barrel!
  const cleaningRod = createCylinderX(0.022, 0.022, 2.75, 10);
  placeMesh(barrelPart.group, cleaningRod, materials.matteSteel, [2.42, 0.125, 0]);
  const rodHead = createCylinderX(0.036, 0.028, 0.1, 12);
  placeMesh(barrelPart.group, rodHead, materials.matteSteel, [3.8, 0.125, 0]);

  // Iconic tall front sight block tower & bayonet lug near muzzle (x = 3.74 to 4.04)
  const fsbProfile: [number, number][] = [
    [3.74, 0.08],
    [4.04, 0.08],
    [4.04, 0.34],
    [3.96, 0.72],
    [3.82, 0.72],
    [3.74, 0.34],
  ];
  const fsbGeom = createExtrudedProfile(fsbProfile, 0.145, {
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  placeMesh(barrelPart.group, fsbGeom, materials.gunmetal);

  // Front barrel sling loop on left side of handguard ferrule
  const frontSling = new THREE.TorusGeometry(0.068, 0.016, 8, 16);
  placeMesh(barrelPart.group, frontSling, materials.matteSteel, [2.38, 0.24, -0.17], [0, Math.PI / 2, 0]);

  // ---------------------------------------------------------------------------
  // 3. LAMINATE WOOD TWO-PIECE HANDGUARD (Guardamanos de Madera)
  // ---------------------------------------------------------------------------
  // Lower contoured wooden handguard with ergonomic finger swells
  const lowerHgProfile: [number, number][] = [
    [0.94, 0.34],
    [2.34, 0.34],
    [2.34, 0.08],
    [1.82, 0.0],
    [1.36, -0.02],
    [0.94, 0.0],
  ];
  const lowerHgGeom = createExtrudedProfile(lowerHgProfile, 0.32, {
    bevelThickness: 0.036,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  placeMesh(handguardPart.group, lowerHgGeom, materials.woodLaminate);

  // Classic AK palm-swell bulge ridges along lower handguard sides
  const palmSwell = createRoundedBox(0.92, 0.12, 0.405, 0.04, 0.018);
  placeMesh(handguardPart.group, palmSwell, materials.woodLaminate, [1.56, 0.18, 0]);

  // Upper rounded wooden gas-tube handguard cover
  const upperHg = createCylinderX(0.145, 0.14, 1.32, 20);
  placeMesh(handguardPart.group, upperHg, materials.woodLaminate, [1.64, 0.48, 0]);

  // Steel front handguard retainer collar & upper gas-tube collars
  const hgFerrule = createRoundedBox(0.11, 0.34, 0.36, 0.02, 0.01);
  placeMesh(handguardPart.group, hgFerrule, materials.bluedSteel, [2.38, 0.22, 0]);
  const upperFerrule = createCylinderX(0.135, 0.135, 0.09, 18);
  placeMesh(handguardPart.group, upperFerrule, materials.bluedSteel, [2.32, 0.48, 0]);
  placeMesh(handguardPart.group, upperFerrule, materials.bluedSteel, [0.98, 0.48, 0]);

  // ---------------------------------------------------------------------------
  // 4. ICONIC STRONGLY CURVED 7.62mm RIBBED STEEL MAGAZINE (Cargador)
  // ---------------------------------------------------------------------------
  const magProfile: [number, number][] = [
    [0.02, -0.06],
    [0.64, -0.06],
    [0.74, -0.58],
    [0.96, -1.16],
    [1.26, -1.68],
    [1.56, -2.06],
    [0.98, -2.26],
    [0.64, -1.78],
    [0.32, -1.18],
    [0.12, -0.6],
  ];
  const magGeom = createExtrudedProfile(magProfile, 0.23, {
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  placeMesh(magPart.group, magGeom, materials.bluedSteel);

  // Stamped longitudinal reinforcing spine & curved side ribs
  const magSpine = createCurvedTube(
    [
      [0.65, -0.1, 0],
      [0.86, -0.92, 0],
      [1.24, -1.66, 0],
      [1.54, -2.06, 0],
    ],
    0.045,
    18,
    8
  );
  placeMesh(magPart.group, magSpine, materials.gunmetal);

  const magRibGeom = createRoundedBox(0.045, 0.52, 0.278, 0.008, 0.005);
  const ribSpecs: [number, number, number][] = [
    [0.44, -0.64, 0.28],
    [0.68, -1.18, 0.42],
    [0.98, -1.7, 0.56],
  ];
  for (const [rx, ry, rot] of ribSpecs) {
    placeMesh(magPart.group, magRibGeom, materials.gunmetal, [rx, ry, 0], [0, 0, rot]);
  }

  // Steel baseplate floor lip
  const floorPlate = createRoundedBox(0.68, 0.065, 0.275, 0.012, 0.008);
  placeMesh(magPart.group, floorPlate, materials.matteSteel, [1.28, -2.18, 0], [0, 0, 0.58]);

  // ---------------------------------------------------------------------------
  // 5. BAKELITE PISTOL GRIP, TRIGGER GUARD & MAG CATCH (Empuñadura)
  // ---------------------------------------------------------------------------
  const gripProfile: [number, number][] = [
    [-1.24, -0.09],
    [-0.84, -0.09],
    [-0.92, -0.34],
    [-1.18, -1.08],
    [-1.56, -1.0],
    [-1.34, -0.32],
  ];
  const gripGeom = createExtrudedProfile(gripProfile, 0.24, {
    bevelThickness: 0.025,
    bevelSize: 0.022,
    bevelSegments: 3,
  });
  placeMesh(gripPart.group, gripGeom, materials.bakelite);

  // Steel grip ferrule collar against receiver
  const gripCollar = createRoundedBox(0.42, 0.06, 0.28, 0.012, 0.006);
  placeMesh(gripPart.group, gripCollar, materials.gunmetal, [-1.04, -0.12, 0]);

  // Classic AK stamped steel trigger guard & curved trigger
  const guardCurve = createCurvedTube(
    [
      [-0.86, -0.38, 0],
      [-0.5, -0.44, 0],
      [-0.22, -0.4, 0],
      [-0.14, -0.24, 0],
      [-0.12, -0.08, 0],
    ],
    0.028,
    20,
    8
  );
  guardCurve.scale(1, 1, 1.5);
  placeMesh(gripPart.group, guardCurve, materials.bluedSteel);

  const triggerProfile: [number, number][] = [
    [-0.64, -0.09],
    [-0.54, -0.09],
    [-0.58, -0.24],
    [-0.5, -0.36],
    [-0.57, -0.37],
    [-0.68, -0.24],
  ];
  const triggerGeom = createExtrudedProfile(triggerProfile, 0.062, {
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  placeMesh(gripPart.group, triggerGeom, materials.gunmetal);

  // Iconic AK paddle magazine release lever between trigger guard & magwell
  const magCatch = createRoundedBox(0.065, 0.28, 0.095, 0.01, 0.005);
  placeMesh(gripPart.group, magCatch, materials.gunmetal, [-0.04, -0.25, 0], [0, 0, -0.18]);

  // ---------------------------------------------------------------------------
  // 6. ICONIC ANGLED LAMINATE WOOD BUTTSTOCK (Culata de Madera)
  // ---------------------------------------------------------------------------
  const stockProfile: [number, number][] = [
    [-1.6, 0.26],
    [-1.6, -0.09],
    [-2.28, -0.26],
    [-3.32, -0.68],
    [-4.34, -1.16],
    [-4.38, 0.02], // unmistakable downward-sloping AK comb line
    [-3.18, 0.1],
    [-2.14, 0.22],
  ];
  const stockGeom = createExtrudedProfile(stockProfile, 0.29, {
    bevelThickness: 0.036,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
  placeMesh(stockPart.group, stockGeom, materials.woodLaminate);

  // Stamped steel buttplate curving cleanly around rear of wooden stock
  const buttplate = createRoundedBox(0.09, 1.24, 0.355, 0.03, 0.014);
  placeMesh(stockPart.group, buttplate, materials.bluedSteel, [-4.38, -0.57, 0], [0, 0, -0.04]);

  // Rear sling swivel beneath the wooden stock
  const rearSwivel = new THREE.TorusGeometry(0.072, 0.016, 8, 16);
  placeMesh(stockPart.group, rearSwivel, materials.matteSteel, [-3.94, -1.04, 0], [0, Math.PI / 2, 0]);

  // ---------------------------------------------------------------------------
  // 7. TANGENT REAR LEAF SIGHT & HOODED FRONT POST (Mira)
  // ---------------------------------------------------------------------------
  // Sloped rear sight block on the front trunnion (x = 0.48 to 0.96)
  const rsbProfile: [number, number][] = [
    [0.46, 0.26],
    [0.98, 0.26],
    [0.98, 0.56],
    [0.74, 0.58],
    [0.46, 0.48],
  ];
  const rsbGeom = createExtrudedProfile(rsbProfile, 0.24, {
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(sightsPart.group, rsbGeom, materials.bluedSteel);

  // Graduated tangent leaf sight bar + elevation slider button
  const leafBar = createRoundedBox(0.56, 0.048, 0.12, 0.008, 0.005);
  placeMesh(sightsPart.group, leafBar, materials.matteSteel, [0.68, 0.57, 0], [0, 0, 0.16]);
  const sliderKnob = createRoundedBox(0.11, 0.07, 0.165, 0.01, 0.005);
  placeMesh(sightsPart.group, sliderKnob, materials.gunmetal, [0.58, 0.56, 0]);

  // Circular hooded AK front sight ears + central cylindrical post atop the FSB tower
  const frontHood = new THREE.TorusGeometry(0.115, 0.022, 10, 20, Math.PI * 1.45);
  frontHood.rotateZ(-Math.PI * 0.225);
  frontHood.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, frontHood, materials.gunmetal, [3.89, 0.81, 0]);

  const frontPost = new THREE.CylinderGeometry(0.018, 0.022, 0.14, 10);
  placeMesh(sightsPart.group, frontPost, materials.matteSteel, [3.89, 0.77, 0]);

  return finalizeWeaponModel(
    [receiverPart, barrelPart, handguardPart, magPart, gripPart, stockPart, sightsPart],
    8.2
  );
}
