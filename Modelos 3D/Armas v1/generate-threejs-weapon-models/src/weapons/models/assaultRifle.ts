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

export function buildAssaultRifleModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const receiverPart = createPartGroup('cajon', 'Cajón de Mecanismos y Cerrojo', [0, 0.1, 0]);
  const barrelPart = createPartGroup('canon', 'Cañón, Guardamanos y Bocacha', [1.15, 0.08, 0]);
  const magPart = createPartGroup('cargador', 'Cargador Curvo 5.56mm', [0.16, -1.05, 0]);
  const gripPart = createPartGroup('empunadura', 'Empuñadura y Grupo de Disparo', [-0.12, -0.68, 0]);
  const stockPart = createPartGroup('culata', 'Culata Telescópica SOPMOD', [-1.25, 0, 0]);
  const sightsPart = createPartGroup('mira', 'Mira Holográfica y Miras Abatibles', [0, 0.85, 0]);

  const barrelY = 0.28;

  // ---------------------------------------------------------------------------
  // 1. FORGED UPPER & LOWER RECEIVER + BOLT GROUP (Cajón y Mecanismos)
  // ---------------------------------------------------------------------------
  // Upper receiver forged body
  const upperBody = createRoundedBox(2.04, 0.34, 0.35, 0.03, 0.018);
  placeMesh(receiverPart.group, upperBody, materials.anodizedAlloy, [-0.14, 0.28, 0]);

  // Continuous upper receiver Picatinny rail
  const upperRail = buildPicatinnyRail({
    length: 1.98,
    width: 0.21,
    height: 0.085,
    pitch: 0.1,
    material: materials.anodizedAlloy,
  });
  upperRail.position.set(-0.14, 0.45, 0);
  receiverPart.group.add(upperRail);

  // Lower receiver profile (integrating flared angled magwell & trigger pocket)
  const lowerProfile: [number, number][] = [
    [-1.14, 0.14],
    [0.88, 0.14],
    [0.88, -0.1],
    [0.78, -0.34], // front angled magwell bevel
    [0.14, -0.34],
    [0.06, -0.14],
    [-0.92, -0.14],
    [-1.14, -0.02],
  ];
  const lowerGeom = createExtrudedProfile(lowerProfile, 0.32, {
    bevelThickness: 0.018,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  placeMesh(receiverPart.group, lowerGeom, materials.anodizedAlloy);

  // Flared magwell lip rim
  const magwellRim = createRoundedBox(0.68, 0.075, 0.38, 0.02, 0.012);
  placeMesh(receiverPart.group, magwellRim, materials.gunmetal, [0.46, -0.325, 0]);

  // Ejection port recess + visible machined bolt carrier group on right side (+Z)
  const portRecess = createRoundedBox(0.68, 0.16, 0.05, 0.016, 0.006);
  placeMesh(receiverPart.group, portRecess, materials.darkBore, [0.16, 0.28, 0.165]);

  const boltCarrier = createRoundedBox(0.62, 0.13, 0.05, 0.015, 0.006);
  placeMesh(receiverPart.group, boltCarrier, materials.chromeSteel, [0.16, 0.28, 0.155]);

  // Gas vent holes & forward-assist serrations on the visible bolt carrier
  const boltVent = createCylinderZ(0.018, 0.04, 10);
  placeMesh(receiverPart.group, boltVent, materials.darkBore, [0.24, 0.28, 0.175]);
  placeMesh(receiverPart.group, boltVent, materials.darkBore, [0.31, 0.28, 0.175]);

  // Hinged open ejection-port dust cover folded down below port
  const dustCover = createRoundedBox(0.68, 0.14, 0.026, 0.01, 0.004);
  placeMesh(receiverPart.group, dustCover, materials.gunmetal, [0.16, 0.13, 0.19], [0.28, 0, 0]);

  // Iconic triangular brass deflector behind ejection port (+Z)
  const deflectorProfile: [number, number][] = [
    [-0.46, 0.21],
    [-0.24, 0.21],
    [-0.29, 0.38],
    [-0.44, 0.38],
  ];
  const deflectorGeom = createExtrudedProfile(deflectorProfile, 0.11, {
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  placeMesh(receiverPart.group, deflectorGeom, materials.anodizedAlloy, [0, 0, 0.2]);

  // Iconic angled forward-assist plunger housing behind brass deflector (+Z)
  const faTube = createCylinderX(0.068, 0.062, 0.38, 16);
  placeMesh(receiverPart.group, faTube, materials.anodizedAlloy, [-0.66, 0.22, 0.2], [0, 0.28, 0]);
  const faButton = createCylinderX(0.074, 0.065, 0.06, 16);
  placeMesh(receiverPart.group, faButton, materials.gunmetal, [-0.85, 0.22, 0.255], [0, 0.28, 0]);

  // Rear T-shaped ambidextrous charging handle above buffer collar
  const chargingStem = createRoundedBox(0.24, 0.055, 0.16, 0.01, 0.005);
  placeMesh(receiverPart.group, chargingStem, materials.gunmetal, [-1.18, 0.37, 0]);
  const chargingLatch = createRoundedBox(0.08, 0.075, 0.42, 0.015, 0.008);
  placeMesh(receiverPart.group, chargingLatch, materials.matteSteel, [-1.3, 0.37, 0]);

  // Left-side bolt catch paddle & right-side magazine release button + takedown pins
  const boltCatch = createRoundedBox(0.11, 0.22, 0.045, 0.012, 0.006);
  placeMesh(receiverPart.group, boltCatch, materials.gunmetal, [0.02, 0.05, -0.185]);
  const magRelBtn = createRoundedBox(0.11, 0.075, 0.04, 0.012, 0.006);
  placeMesh(receiverPart.group, magRelBtn, materials.gunmetal, [0.1, -0.02, 0.18]);

  const pinGeom = createCylinderZ(0.032, 0.375, 14);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-1.02, 0.08, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [0.78, 0.08, 0]);

  // ---------------------------------------------------------------------------
  // 2. BARREL, FREE-FLOAT VENTILATED HANDGUARD & A2 MUZZLE BRAKE (Cañón)
  // ---------------------------------------------------------------------------
  // Barrel nut / locking collar connecting receiver to handguard
  const barrelNut = createCylinderX(0.19, 0.19, 0.16, 20);
  placeMesh(barrelPart.group, barrelNut, materials.gunmetal, [0.96, barrelY, 0]);

  // Free-floating slim octagonal M-LOK aluminum handguard (x = 0.94 to 3.16)
  const hgShape = new THREE.Shape();
  const hgR = 0.225;
  const hgCut = 0.145;
  hgShape.moveTo(-hgCut, -hgR);
  hgShape.lineTo(hgCut, -hgR);
  hgShape.lineTo(hgR, -hgCut);
  hgShape.lineTo(hgR, hgCut);
  hgShape.lineTo(hgCut, hgR);
  hgShape.lineTo(-hgCut, hgR);
  hgShape.lineTo(-hgR, hgCut);
  hgShape.lineTo(-hgR, -hgCut);
  hgShape.closePath();

  const hgLength = 2.22;
  const hgGeom = new THREE.ExtrudeGeometry(hgShape, {
    depth: hgLength,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  hgGeom.rotateY(Math.PI / 2);
  placeMesh(barrelPart.group, hgGeom, materials.anodizedAlloy, [0.94, barrelY, 0]);

  // Continuous monolithic top Picatinny rail along handguard
  const hgTopRail = buildPicatinnyRail({
    length: hgLength - 0.04,
    width: 0.21,
    height: 0.085,
    pitch: 0.1,
    material: materials.anodizedAlloy,
  });
  hgTopRail.position.set(0.94 + hgLength * 0.5, barrelY + 0.17, 0);
  barrelPart.group.add(hgTopRail);

  // Dark recessed M-LOK ventilation slots along both sides & 45° diagonals (InstancedMesh!)
  const slotGeom = createRoundedBox(0.24, 0.068, 0.025, 0.018, 0.004);
  const slotCount = 5;
  for (let i = 0; i < slotCount; i++) {
    const sx = 1.24 + i * 0.38;
    // Left & right mid slots
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY, 0.232]);
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY, -0.232]);
    // Upper angled cooling vents revealing internal stainless gas tube
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY + 0.145, 0.165], [Math.PI / 4, 0, 0]);
    placeMesh(barrelPart.group, slotGeom, materials.darkBore, [sx, barrelY + 0.145, -0.165], [-Math.PI / 4, 0, 0]);
  }

  // Visible stainless steel gas tube & low-profile gas block peeking inside handguard
  const gasTube = createCylinderX(0.022, 0.022, 1.85, 10);
  placeMesh(barrelPart.group, gasTube, materials.chromeSteel, [1.88, barrelY + 0.125, 0]);
  const gasBlock = createRoundedBox(0.24, 0.24, 0.16, 0.02, 0.008);
  placeMesh(barrelPart.group, gasBlock, materials.gunmetal, [2.78, barrelY + 0.04, 0]);

  // Low-profile angled M-LOK tactical handstop / foregrip mounted under handguard
  const afgProfile: [number, number][] = [
    [1.76, 0.05],
    [2.58, 0.05],
    [2.64, -0.04],
    [2.44, -0.18],
    [1.88, -0.24],
    [1.72, -0.1],
  ];
  const afgGeom = createExtrudedProfile(afgProfile, 0.22, {
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  placeMesh(barrelPart.group, afgGeom, materials.polymerGrip);

  // Heavy profiled steel barrel protruding from handguard (x = 0.94 to 3.74)
  const barrelGroup = buildHollowBarrel({
    xStart: 0.94,
    yCenter: barrelY,
    length: 2.8,
    outerRadiusStart: 0.095,
    outerRadiusEnd: 0.082,
    innerRadius: 0.042,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 24,
    crownChamfer: 0.014,
  });
  barrelPart.group.add(barrelGroup);

  // Iconic A2 Birdcage Flash Hider / Compensator with machined ports (x = 3.70 to 4.18)
  const a2Body = createLatheAlongX(
    [
      [3.68, 0.082],
      [3.73, 0.105], // crush washer collar
      [3.76, 0.092],
      [3.82, 0.112],
      [4.14, 0.112],
      [4.18, 0.096],
      [4.18, 0.055],
      [3.8, 0.055],
    ],
    22
  );
  placeMesh(barrelPart.group, a2Body, materials.gunmetal, [0, barrelY, 0]);

  // Birdcage flash hider radial gas ports
  const portCut = new THREE.BoxGeometry(0.18, 0.036, 0.235);
  placeMesh(barrelPart.group, portCut, materials.darkBore, [3.99, barrelY + 0.038, 0]);
  placeMesh(barrelPart.group, portCut, materials.darkBore, [3.99, barrelY - 0.038, 0]);
  const topPortCut = new THREE.BoxGeometry(0.18, 0.13, 0.038);
  placeMesh(barrelPart.group, topPortCut, materials.darkBore, [3.99, barrelY + 0.075, 0]);

  // ---------------------------------------------------------------------------
  // 3. CURVED 30-ROUND POLYMER TACTICAL MAGAZINE (Cargador 5.56mm)
  // ---------------------------------------------------------------------------
  const magProfile: [number, number][] = [
    [0.18, -0.22],
    [0.74, -0.22],
    [0.79, -0.78],
    [0.92, -1.32],
    [1.08, -1.78],
    [0.52, -1.92],
    [0.36, -1.42],
    [0.24, -0.82],
  ];
  const magGeom = createExtrudedProfile(magProfile, 0.22, {
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  placeMesh(magPart.group, magGeom, materials.polymerDark);

  // Horizontal waffle/rib traction bands along magazine sides
  const ribGeom = createRoundedBox(0.54, 0.042, 0.265, 0.008, 0.005);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const rx = 0.5 + t * 0.25;
    const ry = -0.62 - t * 0.94;
    placeMesh(magPart.group, ribGeom, materials.polymerAccent, [rx, ry, 0], [0, 0, 0.22]);
  }

  // Round-count inspection window revealing brass 5.56 cartridges inside!
  const windowFrame = createRoundedBox(0.14, 0.42, 0.262, 0.025, 0.006);
  placeMesh(magPart.group, windowFrame, materials.darkBore, [0.58, -1.04, 0], [0, 0, 0.22]);
  const brassBar = createCylinderZ(0.024, 0.258, 10);
  for (let i = 0; i < 4; i++) {
    placeMesh(magPart.group, brassBar, materials.brass, [0.55 + i * 0.018, -0.92 - i * 0.08, 0]);
  }

  // Flared tactical magazine basepad
  const magPad = createRoundedBox(0.62, 0.08, 0.285, 0.018, 0.01);
  placeMesh(magPart.group, magPad, materials.rubber, [0.81, -1.88, 0], [0, 0, 0.24]);

  // ---------------------------------------------------------------------------
  // 4. ERGONOMIC PISTOL GRIP & TRIGGER GROUP (Empuñadura y Disparo)
  // ---------------------------------------------------------------------------
  const gripProfile: [number, number][] = [
    [-1.12, -0.02],
    [-0.64, -0.14],
    [-0.7, -0.32],
    [-0.96, -1.08],
    [-1.44, -1.0],
    [-1.26, -0.34],
    [-1.18, -0.12],
  ];
  const gripGeom = createExtrudedProfile(gripProfile, 0.27, {
    bevelThickness: 0.025,
    bevelSize: 0.022,
    bevelSegments: 3,
  });
  placeMesh(gripPart.group, gripGeom, materials.polymerDark);

  // Textured stippled side panels on pistol grip
  const gripPanelProfile: [number, number][] = [
    [-1.2, -0.28],
    [-0.78, -0.32],
    [-0.98, -0.96],
    [-1.36, -0.9],
  ];
  const gripPanel = createExtrudedProfile(gripPanelProfile, 0.312, {
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  placeMesh(gripPart.group, gripPanel, materials.polymerGrip);

  // Enlarged winter trigger guard & crisp flat-bow tactical trigger
  const guardCurve = createCurvedTube(
    [
      [-0.72, -0.44, 0],
      [-0.28, -0.46, 0],
      [0.06, -0.42, 0],
      [0.14, -0.28, 0],
      [0.12, -0.12, 0],
    ],
    0.03,
    20,
    8
  );
  guardCurve.scale(1, 1, 1.5);
  placeMesh(gripPart.group, guardCurve, materials.anodizedAlloy);

  const triggerBlade = createRoundedBox(0.055, 0.28, 0.065, 0.01, 0.005);
  placeMesh(gripPart.group, triggerBlade, materials.matteSteel, [-0.42, -0.26, 0], [0, 0, 0.14]);

  // Ambidextrous 90-degree fire selector switch
  const selHub = createCylinderZ(0.052, 0.365, 14);
  placeMesh(gripPart.group, selHub, materials.gunmetal, [-0.78, -0.02, 0]);
  const selArm = createRoundedBox(0.18, 0.048, 0.032, 0.008, 0.004);
  placeMesh(gripPart.group, selArm, materials.gunmetal, [-0.72, -0.02, 0.185], [0, 0, -0.25]);
  placeMesh(gripPart.group, selArm, materials.gunmetal, [-0.72, -0.02, -0.185], [0, 0, -0.25]);

  // ---------------------------------------------------------------------------
  // 5. BUFFER TUBE & SOPMOD CRANE COLLAPSIBLE STOCK (Culata Telescópica)
  // ---------------------------------------------------------------------------
  // Receiver endplate & castle nut
  const castleNut = createCylinderX(0.185, 0.185, 0.14, 18);
  placeMesh(stockPart.group, castleNut, materials.gunmetal, [-1.22, 0.25, 0]);

  // 6-position Mil-Spec buffer tube
  const bufferTube = createCylinderX(0.148, 0.148, 2.55, 22);
  placeMesh(stockPart.group, bufferTube, materials.anodizedAlloy, [-2.52, 0.25, 0]);

  // Lower position-index spine under buffer tube
  const indexSpine = createRoundedBox(2.2, 0.08, 0.09, 0.01, 0.005);
  placeMesh(stockPart.group, indexSpine, materials.gunmetal, [-2.42, 0.1, 0]);

  // SOPMOD / Crane stock main triangular body
  const stockProfile: [number, number][] = [
    [-2.24, 0.42],
    [-4.12, 0.42],
    [-4.18, -0.82],
    [-3.94, -0.86],
    [-2.96, -0.44],
    [-2.38, -0.12],
    [-2.24, 0.06],
  ];
  const stockGeom = createExtrudedProfile(stockProfile, 0.34, {
    bevelThickness: 0.028,
    bevelSize: 0.024,
    bevelSegments: 3,
  });
  placeMesh(stockPart.group, stockGeom, materials.polymerDark);

  // Dual sloped cylindrical SOPMOD cheek-weld battery storage pods along both sides!
  const cheekPod = createCylinderX(0.125, 0.125, 1.72, 16);
  placeMesh(stockPart.group, cheekPod, materials.polymerAccent, [-3.18, 0.2, 0.185]);
  placeMesh(stockPart.group, cheekPod, materials.polymerAccent, [-3.18, 0.2, -0.185]);

  // Stock release adjustment lever tucked in lower recess
  const adjustLatch = createRoundedBox(0.56, 0.1, 0.16, 0.015, 0.008);
  placeMesh(stockPart.group, adjustLatch, materials.polymerGrip, [-2.95, -0.18, 0], [0, 0, 0.42]);

  // Sling cutout slot & ribbed rubber buttpad
  const slingSlot = createRoundedBox(0.11, 0.46, 0.42, 0.025, 0.008);
  placeMesh(stockPart.group, slingSlot, materials.darkBore, [-3.84, -0.3, 0]);

  const buttPad = createRoundedBox(0.14, 1.24, 0.39, 0.035, 0.018);
  placeMesh(stockPart.group, buttPad, materials.rubber, [-4.19, -0.21, 0], [0, 0, -0.04]);

  // ---------------------------------------------------------------------------
  // 6. HOLOGRAPHIC WEAPON SIGHT & FLIP-UP BUIS IRON SIGHTS (Mira)
  // ---------------------------------------------------------------------------
  // Holographic sight base clamp & forward battery compartment
  const holoBase = createRoundedBox(0.92, 0.13, 0.32, 0.018, 0.01);
  placeMesh(sightsPart.group, holoBase, materials.anodizedAlloy, [-0.04, 0.59, 0]);

  const batteryPod = createRoundedBox(0.36, 0.22, 0.33, 0.035, 0.014);
  placeMesh(sightsPart.group, batteryPod, materials.polymerDark, [0.22, 0.72, 0]);
  const batteryCap = createCylinderZ(0.085, 0.355, 16);
  placeMesh(sightsPart.group, batteryCap, materials.gunmetal, [0.26, 0.73, 0]);

  // Iconic protective trapezoidal aluminum hood arching cleanly over optical window
  const hoodArchProfile: [number, number][] = [
    [-0.17, 0],
    [0.17, 0],
    [0.15, 0.34],
    [0.1, 0.41],
    [-0.1, 0.41],
    [-0.15, 0.34],
  ];
  const hoodShape = new THREE.Shape();
  hoodArchProfile.forEach(([z, y], idx) => {
    if (idx === 0) hoodShape.moveTo(z, y);
    else hoodShape.lineTo(z, y);
  });
  hoodShape.closePath();

  // Inner optical window cutout!
  const windowHole = new THREE.Path();
  windowHole.moveTo(-0.115, 0.05);
  windowHole.lineTo(0.115, 0.05);
  windowHole.lineTo(0.1, 0.31);
  windowHole.lineTo(0.068, 0.355);
  windowHole.lineTo(-0.068, 0.355);
  windowHole.lineTo(-0.1, 0.31);
  windowHole.closePath();
  hoodShape.holes.push(windowHole);

  const hoodGeom = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  hoodGeom.translate(0, 0, -0.23);
  hoodGeom.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, hoodGeom, materials.anodizedAlloy, [-0.22, 0.62, 0]);

  // Multi-coated optical window pane inside the holographic hood
  const holoGlass = new THREE.BoxGeometry(0.018, 0.28, 0.21);
  placeMesh(sightsPart.group, holoGlass, materials.opticGlass, [-0.14, 0.82, 0], [0, 0, -0.1]);

  // Glowing holographic reticle ring + center dot
  const reticleRing = new THREE.TorusGeometry(0.052, 0.006, 8, 20);
  reticleRing.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, reticleRing, materials.sightRed, [-0.16, 0.82, 0]);
  const reticleCenter = new THREE.SphereGeometry(0.011, 8, 8);
  placeMesh(sightsPart.group, reticleCenter, materials.sightRed, [-0.16, 0.82, 0]);

  // Rear & front low-profile flip-up backup iron sights (BUIS)
  const rearBuisBase = createRoundedBox(0.24, 0.08, 0.25, 0.012, 0.006);
  placeMesh(sightsPart.group, rearBuisBase, materials.gunmetal, [-0.98, 0.56, 0]);
  const rearAperture = new THREE.TorusGeometry(0.062, 0.016, 8, 16);
  rearAperture.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, rearAperture, materials.gunmetal, [-0.96, 0.67, 0]);

  const frontBuisBase = createRoundedBox(0.22, 0.08, 0.25, 0.012, 0.006);
  placeMesh(sightsPart.group, frontBuisBase, materials.gunmetal, [2.98, 0.56, 0]);
  const frontWing = createRoundedBox(0.055, 0.16, 0.032, 0.008, 0.004);
  placeMesh(sightsPart.group, frontWing, materials.gunmetal, [3.0, 0.68, 0.068]);
  placeMesh(sightsPart.group, frontWing, materials.gunmetal, [3.0, 0.68, -0.068]);
  const frontPin = new THREE.BoxGeometry(0.028, 0.11, 0.022);
  placeMesh(sightsPart.group, frontPin, materials.sightGreen, [3.0, 0.66, 0]);

  return finalizeWeaponModel(
    [receiverPart, barrelPart, magPart, gripPart, stockPart, sightsPart],
    7.8
  );
}
