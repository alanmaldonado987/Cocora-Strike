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

export function buildSmgModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const receiverPart = createPartGroup('cajon', 'Cajón Tubular y Mecanismos', [0, 0.1, 0]);
  const barrelPart = createPartGroup('canon', 'Cañón y Guardamanos', [0.75, 0.05, 0]);
  const magPart = createPartGroup('cargador', 'Cargador Curvo 9mm', [0.22, -0.95, 0]);
  const gripPart = createPartGroup('empunadura', 'Empuñadura y Grupo de Disparo', [-0.1, -0.58, 0]);
  const stockPart = createPartGroup('culata', 'Culata Telescópica', [-1.05, 0, 0]);
  const sightsPart = createPartGroup('mira', 'Miras de Tambor y Óptica Réflex', [0, 0.72, 0]);

  const barrelY = 0.24;

  // ---------------------------------------------------------------------------
  // 1. TUBULAR UPPER RECEIVER & COCKING TUBE (Cajón Tubular y Mecanismos)
  // ---------------------------------------------------------------------------
  // Upper stamped cylindrical receiver spine
  const upperTube = createCylinderX(0.162, 0.162, 2.38, 24);
  placeMesh(receiverPart.group, upperTube, materials.bluedSteel, [-0.36, 0.34, 0]);

  // Lower rectangular receiver skirt integrated smoothly beneath the tube
  const receiverSkirt = createRoundedBox(2.36, 0.34, 0.31, 0.025, 0.015);
  placeMesh(receiverPart.group, receiverSkirt, materials.bluedSteel, [-0.36, 0.17, 0]);

  // Forward magazine well chute integrated into receiver
  const magwellProfile: [number, number][] = [
    [0.14, 0.12],
    [0.72, 0.14],
    [0.72, -0.22],
    [0.24, -0.26],
    [0.14, -0.14],
  ];
  const magwellGeom = createExtrudedProfile(magwellProfile, 0.3, {
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  placeMesh(receiverPart.group, magwellGeom, materials.bluedSteel);

  // Right-side ejection port & recessed chrome roller-delayed bolt carrier
  const ejectionPort = createRoundedBox(0.56, 0.16, 0.04, 0.018, 0.006);
  placeMesh(receiverPart.group, ejectionPort, materials.darkBore, [-0.08, 0.26, 0.15]);

  const boltCarrier = createRoundedBox(0.5, 0.125, 0.045, 0.014, 0.006);
  placeMesh(receiverPart.group, boltCarrier, materials.chromeSteel, [-0.08, 0.26, 0.14]);

  // Forward upper cocking tube running parallel above the barrel
  const cockingTube = createCylinderX(0.095, 0.095, 1.56, 20);
  placeMesh(receiverPart.group, cockingTube, materials.gunmetal, [1.56, 0.42, 0]);

  // Front cocking tube cap
  const cockingCap = createCylinderX(0.1, 0.085, 0.07, 20);
  placeMesh(receiverPart.group, cockingCap, materials.matteSteel, [2.36, 0.42, 0]);

  // Iconic left-side angled folding charging handle in forward cocking slot
  const chargingSlot = new THREE.BoxGeometry(0.62, 0.045, 0.03);
  placeMesh(receiverPart.group, chargingSlot, materials.darkBore, [1.52, 0.43, -0.092]);

  const chargingArm = createCylinderZ(0.032, 0.22, 12);
  placeMesh(receiverPart.group, chargingArm, materials.gunmetal, [1.76, 0.46, -0.18], [0.38, 0, 0]);
  const chargingKnob = createCylinderZ(0.052, 0.14, 14);
  placeMesh(receiverPart.group, chargingKnob, materials.polymerGrip, [1.76, 0.5, -0.28], [0.38, 0, 0]);

  // Side guide channels for the collapsible stock rods
  const guideRail = createRoundedBox(1.56, 0.078, 0.055, 0.01, 0.005);
  placeMesh(receiverPart.group, guideRail, materials.gunmetal, [-0.75, 0.18, 0.175]);
  placeMesh(receiverPart.group, guideRail, materials.gunmetal, [-0.75, 0.18, -0.175]);

  // Rear receiver end cap & takedown pins
  const endCap = createRoundedBox(0.24, 0.46, 0.36, 0.035, 0.018);
  placeMesh(receiverPart.group, endCap, materials.gunmetal, [-1.54, 0.24, 0]);
  const pinGeom = createCylinderZ(0.032, 0.39, 14);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-1.42, 0.12, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [0.16, 0.02, 0]);

  // ---------------------------------------------------------------------------
  // 2. BARREL, TRI-LUG MUZZLE & TROPICAL HANDGUARD (Cañón y Guardamanos)
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: 0.72,
    yCenter: barrelY,
    length: 2.18,
    outerRadiusStart: 0.088,
    outerRadiusEnd: 0.078,
    innerRadius: 0.048,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 22,
    crownChamfer: 0.016,
  });
  barrelPart.group.add(barrelGroup);

  // Tri-lug barrel adapter collar + 3 radial locking lugs
  const triLugBase = createCylinderX(0.102, 0.095, 0.18, 18);
  placeMesh(barrelPart.group, triLugBase, materials.gunmetal, [2.72, barrelY, 0]);
  const lugGeom = new THREE.BoxGeometry(0.08, 0.042, 0.045);
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    placeMesh(
      barrelPart.group,
      lugGeom,
      materials.gunmetal,
      [2.72, barrelY + Math.sin(a) * 0.105, Math.cos(a) * 0.105],
      [a, 0, 0]
    );
  }

  // Compact slotted muzzle flash hider
  const flashHider = createLatheAlongX(
    [
      [2.85, 0.088],
      [2.9, 0.112],
      [3.24, 0.112],
      [3.28, 0.095],
      [3.28, 0.052],
      [2.92, 0.052],
    ],
    20
  );
  placeMesh(barrelPart.group, flashHider, materials.gunmetal, [0, barrelY, 0]);

  // Dark flash hider side slots
  const slotGeom = new THREE.BoxGeometry(0.19, 0.036, 0.23);
  placeMesh(barrelPart.group, slotGeom, materials.darkBore, [3.08, barrelY + 0.04, 0]);
  placeMesh(barrelPart.group, slotGeom, materials.darkBore, [3.08, barrelY - 0.04, 0]);
  const topSlotGeom = new THREE.BoxGeometry(0.19, 0.23, 0.036);
  placeMesh(barrelPart.group, topSlotGeom, materials.darkBore, [3.08, barrelY, 0]);

  // Iconic contoured wide polymer tropical handguard (triangular profile hugging barrel)
  const handguardProfile: [number, number][] = [
    [0.72, 0.34],
    [2.16, 0.34],
    [2.24, 0.22],
    [2.14, 0.06],
    [1.46, 0.0],
    [0.72, -0.02],
  ];
  const handguardGeom = createExtrudedProfile(handguardProfile, 0.33, {
    bevelThickness: 0.032,
    bevelSize: 0.028,
    bevelSegments: 3,
  });
  placeMesh(barrelPart.group, handguardGeom, materials.polymerDark);

  // Textured grip rib inserts along sides of handguard
  const hgGripPanel = createRoundedBox(1.18, 0.14, 0.395, 0.025, 0.01);
  placeMesh(barrelPart.group, hgGripPanel, materials.polymerGrip, [1.44, 0.16, 0]);

  // Front triple-frame sight tower & sling loop collar uniting barrel and cocking tube
  const frontTowerProfile: [number, number][] = [
    [2.22, 0.14],
    [2.52, 0.14],
    [2.52, 0.56],
    [2.28, 0.56],
    [2.22, 0.44],
  ];
  const frontTower = createExtrudedProfile(frontTowerProfile, 0.2, {
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(barrelPart.group, frontTower, materials.gunmetal);

  // Front sling eye loop on left side
  const slingRing = new THREE.TorusGeometry(0.075, 0.016, 8, 16);
  placeMesh(barrelPart.group, slingRing, materials.matteSteel, [2.37, 0.32, -0.14], [0, Math.PI / 2, 0]);

  // ---------------------------------------------------------------------------
  // 3. SLIM CURVED 30-ROUND 9MM MAGAZINE (Cargador Curvo)
  // ---------------------------------------------------------------------------
  const magProfile: [number, number][] = [
    [0.29, -0.12],
    [0.64, -0.12],
    [0.69, -0.58],
    [0.82, -1.12],
    [0.98, -1.62],
    [0.64, -1.7],
    [0.48, -1.16],
    [0.35, -0.62],
  ];
  const magGeom = createExtrudedProfile(magProfile, 0.175, {
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  placeMesh(magPart.group, magGeom, materials.bluedSteel);

  // Stamped magazine baseplate lip
  const magFloor = createRoundedBox(0.39, 0.055, 0.215, 0.012, 0.008);
  placeMesh(magPart.group, magFloor, materials.matteSteel, [0.81, -1.67, 0], [0, 0, 0.24]);

  // Subtle side reinforcing rib grooves along the curved magazine
  const magSpine = createRoundedBox(0.06, 1.38, 0.208, 0.01, 0.005);
  placeMesh(magPart.group, magSpine, materials.gunmetal, [0.58, -0.88, 0], [0, 0, 0.24]);

  // ---------------------------------------------------------------------------
  // 4. CONTOURED LOWER GRIP & TRIGGER PACK (Empuñadura y Disparo)
  // ---------------------------------------------------------------------------
  const lowerPackProfile: [number, number][] = [
    [-1.44, 0.05],
    [0.14, 0.05],
    [0.14, -0.1],
    [-0.1, -0.14],
    [-0.58, -0.16],
    [-0.84, -0.34],
    [-1.08, -1.04],
    [-1.52, -0.96],
    [-1.36, -0.34],
    [-1.44, -0.06],
  ];
  const lowerPackGeom = createExtrudedProfile(lowerPackProfile, 0.26, {
    bevelThickness: 0.024,
    bevelSize: 0.02,
    bevelSegments: 3,
  });
  placeMesh(gripPart.group, lowerPackGeom, materials.polymerDark);

  // Textured stippled finger-grooved grip overlay
  const gripStippleProfile: [number, number][] = [
    [-1.32, -0.32],
    [-0.92, -0.34],
    [-1.08, -0.94],
    [-1.44, -0.88],
  ];
  const gripStipple = createExtrudedProfile(gripStippleProfile, 0.305, {
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  placeMesh(gripPart.group, gripStipple, materials.polymerGrip);

  // Trigger guard & curved trigger
  const guardCurve = createCurvedTube(
    [
      [-0.86, -0.44, 0],
      [-0.4, -0.45, 0],
      [-0.18, -0.41, 0],
      [-0.12, -0.25, 0],
      [-0.14, -0.08, 0],
    ],
    0.032,
    22,
    8
  );
  guardCurve.scale(1, 1, 1.45);
  placeMesh(gripPart.group, guardCurve, materials.polymerDark);

  const triggerProfile: [number, number][] = [
    [-0.58, -0.12],
    [-0.48, -0.12],
    [-0.52, -0.26],
    [-0.45, -0.38],
    [-0.52, -0.39],
    [-0.62, -0.26],
  ];
  const triggerGeom = createExtrudedProfile(triggerProfile, 0.06, {
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  placeMesh(gripPart.group, triggerGeom, materials.gunmetal);

  // Paddle magazine release behind magwell
  const paddleMagRel = createRoundedBox(0.065, 0.24, 0.09, 0.01, 0.006);
  placeMesh(gripPart.group, paddleMagRel, materials.gunmetal, [0.16, -0.28, 0], [0, 0, -0.15]);

  // Iconic ambidextrous fire selector levers with subtle red fire-mode indicators
  const selectorHub = createCylinderZ(0.065, 0.32, 16);
  placeMesh(gripPart.group, selectorHub, materials.polymerAccent, [-0.96, -0.1, 0]);
  const selectorLever = createRoundedBox(0.22, 0.052, 0.036, 0.01, 0.005);
  placeMesh(gripPart.group, selectorLever, materials.gunmetal, [-0.88, -0.08, 0.165], [0, 0, 0.35]);
  placeMesh(gripPart.group, selectorLever, materials.gunmetal, [-0.88, -0.08, -0.165], [0, 0, 0.35]);

  // Tiny red fire-selector pictograph dots
  const dot = new THREE.BoxGeometry(0.025, 0.025, 0.01);
  placeMesh(gripPart.group, dot, materials.sightRed, [-0.83, -0.01, 0.155]);
  placeMesh(gripPart.group, dot, materials.sightRed, [-0.79, -0.06, 0.155]);

  // ---------------------------------------------------------------------------
  // 5. TELESCOPING DUAL-RAIL COLLAPSIBLE STOCK (Culata Telescópica)
  // ---------------------------------------------------------------------------
  // Twin flat steel rails extending back along both sides of the endcap
  const railBarGeom = createRoundedBox(1.88, 0.068, 0.038, 0.008, 0.004);
  placeMesh(stockPart.group, railBarGeom, materials.gunmetal, [-2.42, 0.18, 0.18]);
  placeMesh(stockPart.group, railBarGeom, materials.gunmetal, [-2.42, 0.18, -0.18]);

  // Stock release lever under the rear end cap
  const stockRelease = createRoundedBox(0.16, 0.07, 0.12, 0.012, 0.006);
  placeMesh(stockPart.group, stockRelease, materials.matteSteel, [-1.54, -0.03, 0]);

  // Contoured curved rubberized buttplate housing
  const buttpadProfile: [number, number][] = [
    [-3.18, 0.32],
    [-3.38, 0.32],
    [-3.45, 0.16],
    [-3.42, -0.12],
    [-3.48, -0.44],
    [-3.34, -0.54],
    [-3.18, -0.42],
    [-3.18, 0.06],
  ];
  const buttpadGeom = createExtrudedProfile(buttpadProfile, 0.34, {
    bevelThickness: 0.028,
    bevelSize: 0.022,
    bevelSegments: 3,
  });
  placeMesh(stockPart.group, buttpadGeom, materials.rubber);

  // Steel reinforcing spine where rails lock into buttpad
  const stockBridge = createRoundedBox(0.18, 0.32, 0.38, 0.02, 0.01);
  placeMesh(stockPart.group, stockBridge, materials.gunmetal, [-3.24, 0.14, 0]);

  // ---------------------------------------------------------------------------
  // 6. DIOPTER DRUM SIGHTS, HOODED FRONT RING & COMPACT REFLEX OPTIC (Mira)
  // ---------------------------------------------------------------------------
  // Iconic MP5 angled rotary diopter rear sight drum
  const rearDrumBase = createRoundedBox(0.24, 0.11, 0.22, 0.015, 0.008);
  placeMesh(sightsPart.group, rearDrumBase, materials.gunmetal, [-1.18, 0.52, 0]);
  const rearDrum = new THREE.CylinderGeometry(0.105, 0.105, 0.14, 18);
  placeMesh(sightsPart.group, rearDrum, materials.bluedSteel, [-1.18, 0.62, 0], [0, 0, -0.45]);

  // Iconic hooded circular front sight ring atop the front tower
  const frontHood = new THREE.TorusGeometry(0.125, 0.022, 10, 22);
  frontHood.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, frontHood, materials.bluedSteel, [2.38, 0.68, 0]);

  // Central front sight blade post inside the circular hood
  const frontPost = new THREE.BoxGeometry(0.032, 0.125, 0.022);
  placeMesh(sightsPart.group, frontPost, materials.gunmetal, [2.38, 0.62, 0]);
  const frontTip = new THREE.BoxGeometry(0.036, 0.026, 0.024);
  placeMesh(sightsPart.group, frontTip, materials.sightGreen, [2.38, 0.68, 0]);

  // Low-profile claw mount Picatinny rail + compact micro red-dot reflex sight
  const clawMountBase = createRoundedBox(0.95, 0.09, 0.26, 0.015, 0.008);
  placeMesh(sightsPart.group, clawMountBase, materials.anodizedAlloy, [-0.26, 0.51, 0]);
  const topRail = buildPicatinnyRail({
    length: 0.92,
    width: 0.21,
    height: 0.075,
    pitch: 0.1,
    material: materials.anodizedAlloy,
  });
  topRail.position.set(-0.26, 0.555, 0);
  sightsPart.group.add(topRail);

  // Micro red-dot body (cylindrical compact optic tube + adjustment caps + coated lenses)
  const opticMount = createRoundedBox(0.38, 0.1, 0.23, 0.012, 0.006);
  placeMesh(sightsPart.group, opticMount, materials.anodizedAlloy, [-0.22, 0.67, 0]);

  const opticBody = createLatheAlongX(
    [
      [-0.5, 0.135],
      [-0.56, 0.135],
      [-0.56, 0.155],
      [-0.44, 0.16],
      [-0.32, 0.138],
      [-0.08, 0.138],
      [0.02, 0.165],
      [0.14, 0.165],
      [0.14, 0.135],
      [0.06, 0.135],
    ],
    22
  );
  placeMesh(sightsPart.group, opticBody, materials.anodizedAlloy, [0, 0.85, 0]);

  // Coated objective & ocular glass lenses
  const lensDisc = createCylinderX(0.132, 0.132, 0.02, 20);
  placeMesh(sightsPart.group, lensDisc, materials.opticGlass, [0.11, 0.85, 0]);
  placeMesh(sightsPart.group, lensDisc, materials.opticGlass, [-0.53, 0.85, 0]);

  // Subtle glowing red reticle dot suspended cleanly inside the optic
  const reticleDot = new THREE.SphereGeometry(0.015, 10, 10);
  placeMesh(sightsPart.group, reticleDot, materials.sightRed, [-0.22, 0.85, 0]);

  // Elevation & windage turret caps + side brightness dial
  const topTurret = new THREE.CylinderGeometry(0.048, 0.052, 0.06, 14);
  placeMesh(sightsPart.group, topTurret, materials.gunmetal, [-0.22, 1.01, 0]);
  const sideDial = createCylinderZ(0.062, 0.07, 16);
  placeMesh(sightsPart.group, sideDial, materials.gunmetal, [-0.22, 0.88, 0.15]);

  return finalizeWeaponModel(
    [receiverPart, barrelPart, magPart, gripPart, stockPart, sightsPart],
    6.4
  );
}
