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

/**
 * Creates a vertical 12-gauge shotgun shell (red hull + high brass base + primer).
 */
function buildShotgunShell(materials: WeaponMaterialLibrary): THREE.Group {
  const shell = new THREE.Group();

  // Red plastic hull body (55mm long = 0.55 units, diameter ~20mm => r = 0.10)
  const hullGeom = new THREE.CylinderGeometry(0.088, 0.088, 0.44, 16);
  placeMesh(shell, hullGeom, materials.shellRed, [0, 0.06, 0]);

  // Crimped top lip
  const crimpGeom = new THREE.CylinderGeometry(0.072, 0.088, 0.04, 16);
  placeMesh(shell, crimpGeom, materials.shellRed, [0, 0.3, 0]);

  // High-brass metallic base + extraction rim
  const brassBase = new THREE.CylinderGeometry(0.091, 0.091, 0.16, 16);
  placeMesh(shell, brassBase, materials.brass, [0, -0.22, 0]);
  const brassRim = new THREE.CylinderGeometry(0.104, 0.104, 0.025, 16);
  placeMesh(shell, brassRim, materials.brass, [0, -0.305, 0]);

  // Center silver primer at base
  const primer = new THREE.CylinderGeometry(0.028, 0.028, 0.015, 12);
  placeMesh(shell, primer, materials.chromeSteel, [0, -0.315, 0]);

  return shell;
}

export function buildShotgunModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const receiverPart = createPartGroup('cajon', 'Cajón de Acero y Cerrojo', [0, 0.12, 0]);
  const barrelPart = createPartGroup('canon', 'Cañón 12G y Disipador Perforado', [1.2, 0.28, 0]);
  const magPart = createPartGroup('cargador', 'Tubo Cargador y Portacartuchos', [0.55, -0.28, -0.45]);
  const pumpPart = createPartGroup('corredera', 'Corredera de Bombeo y Barras', [0.68, -0.68, 0]);
  const stockPart = createPartGroup('culata', 'Culata Ergonómica y Cantonera', [-1.25, -0.15, 0]);
  const sightsPart = createPartGroup('mira', 'Miras Tácticas Ghost-Ring', [0, 0.72, 0]);

  const barrelY = 0.28;
  const magTubeY = 0.01;

  // ---------------------------------------------------------------------------
  // 1. HEAVY MACHINED STEEL RECEIVER & BOLT (Cajón y Mecanismos)
  // ---------------------------------------------------------------------------
  // Rounded-top receiver profile curving cleanly toward the stock wrist
  const receiverProfile: [number, number][] = [
    [-1.34, 0.26],
    [-1.08, 0.42],
    [0.58, 0.42],
    [0.64, 0.34],
    [0.64, -0.12],
    [0.52, -0.16],
    [-1.04, -0.16],
    [-1.34, -0.06],
  ];
  const receiverGeom = createExtrudedProfile(receiverProfile, 0.36, {
    bevelThickness: 0.032,
    bevelSize: 0.028,
    bevelSegments: 3,
  });
  placeMesh(receiverPart.group, receiverGeom, materials.bluedSteel);

  // Right-side ejection port opening & gleaming brushed chrome shotgun bolt!
  const ejectionRecess = createRoundedBox(0.84, 0.2, 0.055, 0.025, 0.008);
  placeMesh(receiverPart.group, ejectionRecess, materials.darkBore, [-0.04, 0.22, 0.19]);

  const chromeBolt = createRoundedBox(0.76, 0.165, 0.052, 0.02, 0.008);
  placeMesh(receiverPart.group, chromeBolt, materials.chromeSteel, [-0.05, 0.22, 0.175]);

  // Extractor groove on bolt face
  const boltGroove = new THREE.BoxGeometry(0.32, 0.032, 0.02);
  placeMesh(receiverPart.group, boltGroove, materials.matteSteel, [0.1, 0.24, 0.205]);

  // Bottom loading port recess & polished chrome elevator lifter gate
  const loadingRecess = createRoundedBox(0.86, 0.04, 0.22, 0.02, 0.006);
  placeMesh(receiverPart.group, loadingRecess, materials.darkBore, [-0.06, -0.175, 0]);
  const lifterGate = createRoundedBox(0.74, 0.026, 0.17, 0.014, 0.004);
  placeMesh(receiverPart.group, lifterGate, materials.chromeSteel, [-0.06, -0.155, 0]);

  // Trigger group housing, curved steel trigger guard & curved trigger
  const guardCurve = createCurvedTube(
    [
      [-1.02, -0.18, 0],
      [-0.98, -0.45, 0],
      [-0.72, -0.5, 0],
      [-0.46, -0.44, 0],
      [-0.4, -0.18, 0],
    ],
    0.032,
    22,
    8
  );
  guardCurve.scale(1, 1, 1.5);
  placeMesh(receiverPart.group, guardCurve, materials.gunmetal);

  const triggerProfile: [number, number][] = [
    [-0.78, -0.15],
    [-0.68, -0.15],
    [-0.72, -0.32],
    [-0.65, -0.44],
    [-0.72, -0.45],
    [-0.82, -0.32],
  ];
  const triggerGeom = createExtrudedProfile(triggerProfile, 0.065, {
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  placeMesh(receiverPart.group, triggerGeom, materials.matteSteel);

  // Mossberg-style top-tang serrated thumb safety slider on rear of receiver
  const tangSafety = createRoundedBox(0.18, 0.05, 0.11, 0.012, 0.006);
  placeMesh(receiverPart.group, tangSafety, materials.matteSteel, [-1.19, 0.37, 0], [0, 0, 0.54]);
  const safetyRedDot = new THREE.CylinderGeometry(0.018, 0.018, 0.015, 10);
  placeMesh(receiverPart.group, safetyRedDot, materials.sightRed, [-1.06, 0.435, 0]);

  // Receiver cross-pins
  const pinGeom = createCylinderZ(0.032, 0.42, 14);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-0.88, -0.04, 0]);
  placeMesh(receiverPart.group, pinGeom, materials.matteSteel, [-0.46, -0.04, 0]);

  // ---------------------------------------------------------------------------
  // 2. 12-GAUGE HEAVY BARREL & PERFORATED HEAT SHIELD (Cañón)
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: 0.56,
    yCenter: barrelY,
    length: 4.62,
    outerRadiusStart: 0.132,
    outerRadiusEnd: 0.118,
    innerRadius: 0.09,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 24,
    crownChamfer: 0.018,
  });
  barrelPart.group.add(barrelGroup);

  // Heavy tactical breacher / extended choke muzzle collar
  const muzzleChoke = createLatheAlongX(
    [
      [4.96, 0.118],
      [5.0, 0.134],
      [5.22, 0.134],
      [5.24, 0.12],
      [5.24, 0.092],
      [5.04, 0.092],
    ],
    22
  );
  placeMesh(barrelPart.group, muzzleChoke, materials.gunmetal, [0, barrelY, 0]);

  // Solid thick perforated steel C-arch heat shield wrapping over the top of the barrel (x = 0.85 to 3.91)
  const shieldShape = new THREE.Shape();
  const outerShieldR = 0.158;
  const innerShieldR = 0.138;
  const arcSpan = Math.PI * 0.64; // wraps cleanly from +115° over top (+Y) to -115°
  const arcSegs = 20;
  for (let i = 0; i <= arcSegs; i++) {
    const a = -arcSpan + (i / arcSegs) * (arcSpan * 2);
    const sx = Math.sin(a) * outerShieldR;
    const sy = Math.cos(a) * outerShieldR;
    if (i === 0) shieldShape.moveTo(sx, sy);
    else shieldShape.lineTo(sx, sy);
  }
  for (let i = arcSegs; i >= 0; i--) {
    const a = -arcSpan + (i / arcSegs) * (arcSpan * 2);
    const sx = Math.sin(a) * innerShieldR;
    const sy = Math.cos(a) * innerShieldR;
    shieldShape.lineTo(sx, sy);
  }
  shieldShape.closePath();

  const shieldGeom = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 3.04,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  shieldGeom.rotateY(Math.PI / 2);
  shieldGeom.computeVertexNormals();
  placeMesh(barrelPart.group, shieldGeom, materials.gunmetal, [0.86, barrelY + 0.006, 0]);

  // Cooling vent perforations arrayed along both upper flanks of heat shield (InstancedMesh)
  const ventGeom = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 10);
  const ventCols = 14;
  const ventRows = 3;
  const ventInstanced = new THREE.InstancedMesh(ventGeom, materials.darkBore, ventCols * ventRows);
  const dummy = new THREE.Object3D();
  let vIdx = 0;
  for (let c = 0; c < ventCols; c++) {
    const vx = 1.04 + c * 0.205;
    for (let r = 0; r < ventRows; r++) {
      // Three rows: left flank (+50°), top (0°), right flank (-50°)
      const ang = (r - 1) * 0.72;
      const rad = 0.153;
      dummy.position.set(vx, barrelY + 0.012 + Math.cos(ang) * rad, Math.sin(ang) * rad);
      dummy.rotation.set(ang, 0, 0);
      dummy.updateMatrix();
      ventInstanced.setMatrixAt(vIdx++, dummy.matrix);
    }
  }
  ventInstanced.instanceMatrix.needsUpdate = true;
  barrelPart.group.add(ventInstanced);

  // Front & rear clamping collars securing the heat shield
  const shieldClamp = createCylinderX(0.158, 0.158, 0.11, 20);
  placeMesh(barrelPart.group, shieldClamp, materials.matteSteel, [0.88, barrelY + 0.005, 0]);
  placeMesh(barrelPart.group, shieldClamp, materials.matteSteel, [3.88, barrelY + 0.005, 0]);

  // Heavy twin-tube barrel-to-magazine tactical clamp & bayonet lug near muzzle
  const clampBlock = createRoundedBox(0.24, 0.44, 0.26, 0.035, 0.014);
  placeMesh(barrelPart.group, clampBlock, materials.gunmetal, [4.38, 0.15, 0]);
  const clampBolt = createCylinderZ(0.028, 0.3, 12);
  placeMesh(barrelPart.group, clampBolt, materials.chromeSteel, [4.38, 0.15, 0]);

  // ---------------------------------------------------------------------------
  // 3. TUBULAR MAGAZINE & 5-SHELL SIDE-SADDLE CARRIER (Cargador)
  // ---------------------------------------------------------------------------
  const magTube = createCylinderX(0.112, 0.112, 4.18, 22);
  placeMesh(magPart.group, magTube, materials.bluedSteel, [2.62, magTubeY, 0]);

  // Knurled steel magazine end-cap & front sling stud
  const magCap = createLatheAlongX(
    [
      [4.66, 0.112],
      [4.7, 0.128],
      [4.9, 0.128],
      [4.94, 0.105],
      [4.94, 0.001],
    ],
    20
  );
  placeMesh(magPart.group, magCap, materials.gunmetal, [0, magTubeY, 0]);

  const frontSlingLoop = new THREE.TorusGeometry(0.055, 0.014, 8, 16);
  placeMesh(magPart.group, frontSlingLoop, materials.matteSteel, [4.95, magTubeY - 0.03, 0], [0, Math.PI / 2, 0]);

  // Side-saddle aluminum mounting plate & 5 detailed 12-gauge shells on left (-Z) side of receiver!
  const saddlePlate = createRoundedBox(1.28, 0.34, 0.06, 0.02, 0.01);
  placeMesh(magPart.group, saddlePlate, materials.anodizedAlloy, [-0.34, 0.14, -0.23]);

  const clipBar = createRoundedBox(1.24, 0.16, 0.14, 0.02, 0.008);
  placeMesh(magPart.group, clipBar, materials.polymerDark, [-0.34, 0.14, -0.29]);

  for (let i = 0; i < 5; i++) {
    const shell = buildShotgunShell(materials);
    shell.position.set(-0.82 + i * 0.24, 0.18, -0.34);
    magPart.group.add(shell);
  }

  // ---------------------------------------------------------------------------
  // 4. GROOVED SLIDING PUMP FOREND & CHROME ACTION BARS (Corredera)
  // ---------------------------------------------------------------------------
  // Turned grooved tactical pump forend via LatheGeometry (unmistakable ribbed pump grip!)
  const pumpProfile: [number, number][] = [];
  const pStart = 1.48;
  const pEnd = 3.44;
  pumpProfile.push([pStart, 0.12]);
  pumpProfile.push([pStart + 0.08, 0.195]);
  pumpProfile.push([pStart + 0.22, 0.215]);
  const grooveCount = 9;
  const gSpan = 1.46;
  const gStart = pStart + 0.26;
  for (let i = 0; i < grooveCount; i++) {
    const gx = gStart + (i / grooveCount) * gSpan;
    const step = gSpan / grooveCount;
    pumpProfile.push([gx, 0.218]);
    pumpProfile.push([gx + step * 0.22, 0.186]);
    pumpProfile.push([gx + step * 0.62, 0.186]);
    pumpProfile.push([gx + step * 0.84, 0.218]);
  }
  pumpProfile.push([pEnd - 0.16, 0.215]);
  pumpProfile.push([pEnd - 0.06, 0.185]);
  pumpProfile.push([pEnd, 0.12]);

  const pumpGeom = createLatheAlongX(pumpProfile, 24);
  placeMesh(pumpPart.group, pumpGeom, materials.polymerGrip, [0, magTubeY, 0]);

  // Twin polished chrome action bars sliding straight from pump forend into receiver
  const actionBar = createRoundedBox(1.12, 0.055, 0.025, 0.008, 0.004);
  placeMesh(pumpPart.group, actionBar, materials.chromeSteel, [1.05, magTubeY + 0.04, 0.145]);
  placeMesh(pumpPart.group, actionBar, materials.chromeSteel, [1.05, magTubeY + 0.04, -0.145]);

  // ---------------------------------------------------------------------------
  // 5. CLASSIC ERGONOMIC SHOTGUN STOCK & RECOIL PAD (Culata)
  // ---------------------------------------------------------------------------
  const stockProfile: [number, number][] = [
    [-1.24, 0.24],
    [-1.24, -0.08],
    [-1.58, -0.26], // contoured semi-pistol grip wrist
    [-1.88, -0.58],
    [-2.24, -0.58],
    [-2.58, -0.46],
    [-3.68, -0.78],
    [-4.76, -1.16],
    [-4.8, 0.08], // graceful shotgun comb
    [-3.12, 0.12],
    [-2.2, 0.08],
    [-1.66, 0.18],
  ];
  const stockGeom = createExtrudedProfile(stockProfile, 0.3, {
    bevelThickness: 0.042,
    bevelSize: 0.036,
    bevelSegments: 3,
  });
  placeMesh(stockPart.group, stockGeom, materials.polymerDark);

  // Textured grip inlay along the wrist of the shotgun stock
  const wristGripProfile: [number, number][] = [
    [-1.52, -0.06],
    [-2.08, -0.48],
    [-2.34, -0.42],
    [-1.82, 0.02],
  ];
  const wristGrip = createExtrudedProfile(wristGripProfile, 0.365, {
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  placeMesh(stockPart.group, wristGrip, materials.polymerGrip);

  // Thick ventilated shock-absorbing rubber recoil pad at butt end
  const recoilPad = createRoundedBox(0.22, 1.32, 0.375, 0.04, 0.022);
  placeMesh(stockPart.group, recoilPad, materials.rubber, [-4.86, -0.54, 0], [0, 0, -0.04]);

  // Rear sling stud beneath toe of stock
  const rearStud = new THREE.TorusGeometry(0.055, 0.014, 8, 16);
  placeMesh(stockPart.group, rearStud, materials.matteSteel, [-4.32, -1.06, 0], [0, Math.PI / 2, 0]);

  // ---------------------------------------------------------------------------
  // 6. TACTICAL GHOST-RING SIGHTS & TOP OPTIC RAIL (Mira)
  // ---------------------------------------------------------------------------
  // Compact top receiver Picatinny rail
  const topRail = buildPicatinnyRail({
    length: 1.24,
    width: 0.2,
    height: 0.072,
    pitch: 0.1,
    material: materials.anodizedAlloy,
  });
  topRail.position.set(-0.22, 0.445, 0);
  sightsPart.group.add(topRail);

  // Rear ghost-ring aperture sight with dual protective steel wings
  const rearGhostBase = createRoundedBox(0.24, 0.075, 0.25, 0.012, 0.006);
  placeMesh(sightsPart.group, rearGhostBase, materials.gunmetal, [-0.88, 0.51, 0]);

  const ghostRing = new THREE.TorusGeometry(0.068, 0.016, 10, 20);
  ghostRing.rotateY(Math.PI / 2);
  placeMesh(sightsPart.group, ghostRing, materials.matteSteel, [-0.88, 0.62, 0]);

  const ghostWing = createRoundedBox(0.18, 0.17, 0.026, 0.01, 0.005);
  placeMesh(sightsPart.group, ghostWing, materials.gunmetal, [-0.88, 0.62, 0.11]);
  placeMesh(sightsPart.group, ghostWing, materials.gunmetal, [-0.88, 0.62, -0.11]);

  // Front winged ramp sight + glowing fiber-optic red sighting bead near muzzle
  const frontRampProfile: [number, number][] = [
    [4.66, 0.39],
    [5.04, 0.39],
    [5.04, 0.56],
    [4.94, 0.56],
    [4.76, 0.45],
  ];
  const frontRamp = createExtrudedProfile(frontRampProfile, 0.085, {
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  placeMesh(sightsPart.group, frontRamp, materials.gunmetal);

  const frontGuardWing = createRoundedBox(0.14, 0.16, 0.022, 0.008, 0.004);
  placeMesh(sightsPart.group, frontGuardWing, materials.gunmetal, [4.95, 0.54, 0.072]);
  placeMesh(sightsPart.group, frontGuardWing, materials.gunmetal, [4.95, 0.54, -0.072]);

  const fiberRod = createCylinderX(0.018, 0.018, 0.16, 12);
  placeMesh(sightsPart.group, fiberRod, materials.sightRed, [4.96, 0.575, 0]);

  return finalizeWeaponModel(
    [receiverPart, barrelPart, magPart, pumpPart, stockPart, sightsPart],
    9.2
  );
}
