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

export function buildSniperRifleModel(materials: WeaponMaterialLibrary): WeaponModelResult {
  const chassisPart = createPartGroup('chasis', 'Chasis Táctico y Empuñadura', [0, -0.1, 0]);
  const boltPart = createPartGroup('cerrojo', 'Acción y Mecanismo de Cerrojo', [-0.45, 0.22, 0.62]);
  const barrelPart = createPartGroup('canon', 'Cañón Acanalado y Freno de Boca', [1.45, 0.08, 0]);
  const scopePart = createPartGroup('mira', 'Mira Telescópica de Precisión', [0, 1.05, 0]);
  const magPart = createPartGroup('cargador', 'Cargador .338 Lapua', [0.1, -1.05, 0]);
  const stockPart = createPartGroup('culata', 'Culata Esquelética Regulable', [-1.45, 0, 0]);
  const bipodPart = createPartGroup('bipode', 'Bípode Táctico', [0.85, -0.95, 0]);

  const barrelY = 0.26;
  const scopeY = 0.9;

  // ---------------------------------------------------------------------------
  // 1. PRECISION ALUMINUM CHASSIS, VENTILATED FOREND & GRIP (Chasis)
  // ---------------------------------------------------------------------------
  // Main lower precision chassis spine (x = -1.25 to +1.06)
  const chassisProfile: [number, number][] = [
    [-1.25, 0.24],
    [1.08, 0.24],
    [1.08, -0.14],
    [0.98, -0.28],
    [-0.12, -0.28],
    [-0.22, -0.16],
    [-1.25, -0.16],
  ];
  const chassisGeom = createExtrudedProfile(chassisProfile, 0.36, {
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  placeMesh(chassisPart.group, chassisGeom, materials.anodizedAlloy);

  // Two-tone contoured tactical polymer side chassis panels for authentic AX/MRAD contrast
  const sideSkin = createRoundedBox(2.12, 0.24, 0.42, 0.025, 0.012);
  placeMesh(chassisPart.group, sideSkin, materials.polymerAccent, [-0.1, 0.02, 0]);

  // Long octagonal free-float ventilated aluminum handguard / forend (x = +1.05 to +3.48)
  const fgShape = new THREE.Shape();
  const rOut = 0.245;
  const rCut = 0.16;
  fgShape.moveTo(-rCut, -rOut);
  fgShape.lineTo(rCut, -rOut);
  fgShape.lineTo(rOut, -rCut);
  fgShape.lineTo(rOut, rCut);
  fgShape.lineTo(rCut, rOut);
  fgShape.lineTo(-rCut, rOut);
  fgShape.lineTo(-rOut, rCut);
  fgShape.lineTo(-rOut, -rCut);
  fgShape.closePath();

  const fgLen = 2.42;
  const fgGeom = new THREE.ExtrudeGeometry(fgShape, {
    depth: fgLen,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  fgGeom.rotateY(Math.PI / 2);
  placeMesh(chassisPart.group, fgGeom, materials.anodizedAlloy, [1.05, barrelY - 0.02, 0]);

  // Monolithic continuous top Picatinny rail along receiver & forend
  const fullTopRail = buildPicatinnyRail({
    length: 4.54,
    width: 0.21,
    height: 0.088,
    pitch: 0.1,
    material: materials.anodizedAlloy,
  });
  fullTopRail.position.set(1.16, 0.47, 0);
  chassisPart.group.add(fullTopRail);

  // Lower Picatinny rail segment at front of forend for bipod attachment
  const bipodRail = buildPicatinnyRail({
    length: 0.72,
    width: 0.2,
    height: 0.072,
    pitch: 0.1,
    material: materials.gunmetal,
  });
  bipodRail.rotation.x = Math.PI;
  bipodRail.position.set(3.02, barrelY - 0.27, 0);
  chassisPart.group.add(bipodRail);

  // KeySlot / M-LOK ventilation slots along both flanks of the long forend
  const ventSlot = createRoundedBox(0.28, 0.078, 0.028, 0.02, 0.005);
  for (let i = 0; i < 6; i++) {
    const sx = 1.32 + i * 0.37;
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY - 0.02, 0.25]);
    placeMesh(chassisPart.group, ventSlot, materials.darkBore, [sx, barrelY - 0.02, -0.25]);
    placeMesh(
      chassisPart.group,
      ventSlot,
      materials.darkBore,
      [sx, barrelY + 0.145, 0.18],
      [Math.PI / 4, 0, 0]
    );
    placeMesh(
      chassisPart.group,
      ventSlot,
      materials.darkBore,
      [sx, barrelY + 0.145, -0.18],
      [-Math.PI / 4, 0, 0]
    );
  }

  // Precision vertical target pistol grip with lower palm shelf
  const gripProfile: [number, number][] = [
    [-1.18, -0.12],
    [-0.7, -0.15],
    [-0.72, -0.34],
    [-0.86, -1.06],
    [-1.36, -1.04],
    [-1.24, -0.34],
  ];
  const gripGeom = createExtrudedProfile(gripProfile, 0.28, {
    bevelThickness: 0.026,
    bevelSize: 0.022,
    bevelSegments: 3,
  });
  placeMesh(chassisPart.group, gripGeom, materials.polymerGrip);

  // Flared ergonomic palm rest at base of precision grip
  const palmShelf = createRoundedBox(0.56, 0.075, 0.36, 0.025, 0.012);
  placeMesh(chassisPart.group, palmShelf, materials.polymerAccent, [-1.11, -1.04, 0]);

  // Squared precision aluminum trigger guard & straight match trigger
  const guardCurve = createCurvedTube(
    [
      [-0.74, -0.46, 0],
      [-0.36, -0.49, 0],
      [-0.14, -0.44, 0],
      [-0.1, -0.26, 0],
      [-0.12, -0.14, 0],
    ],
    0.032,
    20,
    8
  );
  guardCurve.scale(1, 1, 1.5);
  placeMesh(chassisPart.group, guardCurve, materials.anodizedAlloy);

  const matchTrigger = createRoundedBox(0.045, 0.28, 0.06, 0.008, 0.004);
  placeMesh(chassisPart.group, matchTrigger, materials.chromeSteel, [-0.5, -0.3, 0], [0, 0, 0.08]);

  // Paddle magazine release behind magwell
  const magRelease = createRoundedBox(0.065, 0.2, 0.1, 0.01, 0.005);
  placeMesh(chassisPart.group, magRelease, materials.gunmetal, [-0.04, -0.32, 0], [0, 0, -0.12]);

  // ---------------------------------------------------------------------------
  // 2. BOLT-ACTION RECEIVER, FLUTED BOLT & OVERSIZED TACTICAL HANDLE (Cerrojo)
  // ---------------------------------------------------------------------------
  // Heavy faceted precision upper receiver action housing (x = -1.24 to +1.08)
  const actionCross = new THREE.Shape();
  actionCross.moveTo(-0.18, 0.12);
  actionCross.lineTo(0.18, 0.12);
  actionCross.lineTo(0.195, 0.34);
  actionCross.lineTo(0.12, 0.46);
  actionCross.lineTo(-0.12, 0.46);
  actionCross.lineTo(-0.195, 0.34);
  actionCross.closePath();

  const actionGeom = new THREE.ExtrudeGeometry(actionCross, {
    depth: 2.3,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  actionGeom.rotateY(Math.PI / 2);
  placeMesh(boltPart.group, actionGeom, materials.bluedSteel, [-1.24, 0, 0]);

  // Machined right-side ejection port opening exposing gleaming bolt body
  const portCut = createRoundedBox(0.86, 0.18, 0.06, 0.022, 0.008);
  placeMesh(boltPart.group, portCut, materials.darkBore, [0.1, 0.29, 0.18]);

  // Polished chrome cylindrical bolt body spanning receiver + exposed inside port
  const boltBody = createCylinderX(0.095, 0.095, 1.92, 22);
  placeMesh(boltPart.group, boltBody, materials.chromeSteel, [-0.14, 0.28, 0.04]);

  // Longitudinal dark fluting channels milled into visible portion of bolt body
  const boltFlute = createRoundedBox(0.68, 0.022, 0.025, 0.006, 0.002);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.33, 0.135]);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.28, 0.145]);
  placeMesh(boltPart.group, boltFlute, materials.matteSteel, [0.1, 0.23, 0.135]);

  // Machined bolt shroud at rear of action + glowing red cocked-pin indicator
  const boltShroud = createLatheAlongX(
    [
      [-1.44, 0.001],
      [-1.44, 0.078],
      [-1.38, 0.112],
      [-1.18, 0.118],
      [-1.18, 0.001],
    ],
    18
  );
  placeMesh(boltPart.group, boltShroud, materials.gunmetal, [0, 0.28, 0]);
  const cockedPin = createCylinderX(0.024, 0.024, 0.05, 10);
  placeMesh(boltPart.group, cockedPin, materials.sightRed, [-1.45, 0.28, 0]);

  // Swept tactical bolt handle arm + oversized knurled teardrop bolt knob (+Z)
  const boltArm = createCurvedTube(
    [
      [-0.98, 0.28, 0.12],
      [-1.02, 0.26, 0.32],
      [-1.12, 0.14, 0.42],
      [-1.18, 0.02, 0.44],
    ],
    0.036,
    16,
    10
  );
  placeMesh(boltPart.group, boltArm, materials.gunmetal);

  // Oversized tactical bolt knob turned via LatheGeometry
  const knobGeom = createLatheAlongX(
    [
      [0, 0.038],
      [0.05, 0.064],
      [0.14, 0.082],
      [0.2, 0.072],
      [0.24, 0.038],
      [0.25, 0.001],
    ],
    18
  );
  placeMesh(boltPart.group, knobGeom, materials.polymerGrip, [-1.18, 0.02, 0.44], [0, 0, -1.98]);

  // ---------------------------------------------------------------------------
  // 3. HEAVY FLUTED FREE-FLOATING BARREL & 3-CHAMBER MUZZLE BRAKE (Cañón)
  // ---------------------------------------------------------------------------
  const barrelGroup = buildHollowBarrel({
    xStart: 1.02,
    yCenter: barrelY,
    length: 4.94,
    outerRadiusStart: 0.135,
    outerRadiusEnd: 0.106,
    innerRadius: 0.048,
    steelMaterial: materials.bluedSteel,
    boreMaterial: materials.darkBore,
    radialSegments: 26,
    crownChamfer: 0.018,
  });
  barrelPart.group.add(barrelGroup);

  // 6 machined longitudinal cooling flutes along the free-floating exposed barrel (x = 3.55 to 5.72)
  const fluteGeom = createRoundedBox(2.12, 0.028, 0.024, 0.01, 0.004);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI * 2) / 6;
    const rad = 0.108;
    placeMesh(
      barrelPart.group,
      fluteGeom,
      materials.matteSteel,
      [4.62, barrelY + Math.sin(a) * rad, Math.cos(a) * rad],
      [a, 0, 0]
    );
  }

  // Massive rectangular 3-chamber baffled .338 Lapua tactical muzzle brake (x = 5.94 to 6.80)
  const brakeNut = createCylinderX(0.132, 0.132, 0.14, 18);
  placeMesh(barrelPart.group, brakeNut, materials.gunmetal, [5.95, barrelY, 0]);

  const brakeBody = createRoundedBox(0.84, 0.24, 0.34, 0.028, 0.014);
  placeMesh(barrelPart.group, brakeBody, materials.gunmetal, [6.39, barrelY, 0]);

  // 3 angled baffled expansion chambers passing cleanly through left-to-right
  const bafflePort = createRoundedBox(0.15, 0.16, 0.365, 0.02, 0.006);
  for (const bx of [6.15, 6.38, 6.61]) {
    placeMesh(barrelPart.group, bafflePort, materials.darkBore, [bx, barrelY, 0], [0, 0.22, 0]);
  }

  // Front bore opening on muzzle brake tip
  const brakeBore = createCylinderX(0.062, 0.062, 0.08, 16);
  placeMesh(barrelPart.group, brakeBore, materials.darkBore, [6.79, barrelY, 0]);

  // ---------------------------------------------------------------------------
  // 4. HIGH-MAGNIFICATION TELESCOPIC RIFLE SCOPE (Mira Telescópica)
  // ---------------------------------------------------------------------------
  // One-piece cantilevered tactical dual-ring scope mount
  const mountBridge = createRoundedBox(1.48, 0.11, 0.25, 0.015, 0.008);
  placeMesh(scopePart.group, mountBridge, materials.anodizedAlloy, [0.06, 0.56, 0]);

  for (const rx of [-0.48, 0.58]) {
    // Vertical ring pedestal + circular scope ring clamp
    const ped = createRoundedBox(0.24, 0.22, 0.22, 0.015, 0.008);
    placeMesh(scopePart.group, ped, materials.anodizedAlloy, [rx, 0.69, 0]);
    const ring = createCylinderX(0.185, 0.185, 0.24, 22);
    placeMesh(scopePart.group, ring, materials.gunmetal, [rx, scopeY, 0]);
    // Split ring clamping flanges & hex bolts
    const flange = createRoundedBox(0.22, 0.07, 0.42, 0.012, 0.005);
    placeMesh(scopePart.group, flange, materials.gunmetal, [rx, scopeY, 0]);
    const screw = createCylinderX(0.016, 0.016, 0.25, 10);
    placeMesh(scopePart.group, screw, materials.chromeSteel, [rx, scopeY + 0.01, 0.195]);
    placeMesh(scopePart.group, screw, materials.chromeSteel, [rx, scopeY + 0.01, -0.195]);
  }

  // Precision lathe-turned 5-25x56 telescopic rifle scope tube + flared 56mm objective + sunshade
  const scopeProfile: [number, number][] = [
    [-1.84, 0.175], // ocular lens inner recess
    [-1.92, 0.175], // ocular lens rim lip
    [-1.92, 0.21], // ocular bell
    [-1.36, 0.205],
    [-1.28, 0.192], // knurled zoom ring
    [-1.08, 0.192],
    [-1.02, 0.152], // 34mm main tube rear
    [0.86, 0.152], // 34mm main tube front
    [1.18, 0.24], // objective bell taper
    [1.46, 0.285], // 56mm objective bell outer
    [2.42, 0.285], // extended sunshade hood
    [2.42, 0.252], // hollow sunshade interior lip
    [1.92, 0.252],
  ];
  const scopeGeom = createLatheAlongX(scopeProfile, 28);
  placeMesh(scopePart.group, scopeGeom, materials.anodizedAlloy, [0, scopeY, 0]);

  // Central turret saddle block + 3 oversized tactical target turrets (elevation, windage, parallax)
  const turretSaddle = createRoundedBox(0.42, 0.34, 0.34, 0.03, 0.014);
  placeMesh(scopePart.group, turretSaddle, materials.gunmetal, [0.06, scopeY, 0]);

  // Tall knurled top elevation turret with calibration index ring
  const elevTurret = new THREE.CylinderGeometry(0.118, 0.125, 0.24, 22);
  placeMesh(scopePart.group, elevTurret, materials.gunmetal, [0.06, scopeY + 0.27, 0]);
  const elevBand = new THREE.CylinderGeometry(0.127, 0.127, 0.032, 22);
  placeMesh(scopePart.group, elevBand, materials.chromeSteel, [0.06, scopeY + 0.19, 0]);

  // Right windage turret (+Z) & left parallax focus turret (-Z)
  const sideTurret = createCylinderZ(0.105, 0.17, 20);
  placeMesh(scopePart.group, sideTurret, materials.gunmetal, [0.06, scopeY, 0.23]);
  placeMesh(scopePart.group, sideTurret, materials.gunmetal, [0.06, scopeY, -0.23]);

  // Magnification zoom throw lever on ocular power ring
  const throwLever = createRoundedBox(0.055, 0.16, 0.048, 0.012, 0.005);
  placeMesh(scopePart.group, throwLever, materials.matteSteel, [-1.18, scopeY + 0.24, 0.06], [0.25, 0, 0]);

  // Recessed multi-coated emerald/sapphire optical glass lenses (objective & ocular)
  const objLens = createCylinderX(0.252, 0.252, 0.025, 24);
  placeMesh(scopePart.group, objLens, materials.opticGlass, [1.94, scopeY, 0]);
  const ocLens = createCylinderX(0.176, 0.176, 0.025, 22);
  placeMesh(scopePart.group, ocLens, materials.opticGlass, [-1.89, scopeY, 0]);

  // ---------------------------------------------------------------------------
  // 5. PRECISION .338 LAPUA BOX MAGAZINE (Cargador)
  // ---------------------------------------------------------------------------
  const magBody = createRoundedBox(0.92, 0.96, 0.255, 0.022, 0.012);
  placeMesh(magPart.group, magBody, materials.bluedSteel, [0.42, -0.62, 0], [0, 0, 0.06]);

  // Machined side stiffening flutes on magazine body
  const magGroove = createRoundedBox(0.12, 0.68, 0.282, 0.016, 0.006);
  placeMesh(magPart.group, magGroove, materials.gunmetal, [0.22, -0.62, 0], [0, 0, 0.06]);
  placeMesh(magPart.group, magGroove, materials.gunmetal, [0.62, -0.62, 0], [0, 0, 0.06]);

  // Extended heavy polymer grip floorplate
  const magFloor = createRoundedBox(0.98, 0.1, 0.3, 0.02, 0.012);
  placeMesh(magPart.group, magFloor, materials.polymerDark, [0.45, -1.11, 0], [0, 0, 0.06]);

  // Large .338 Lapua brass cartridge seated in feed lips (visible when exploded!)
  const cartridge338 = createLatheAlongX(
    [
      [0.02, 0.062],
      [0.52, 0.058],
      [0.62, 0.042],
      [0.68, 0.042],
    ],
    14
  );
  placeMesh(magPart.group, cartridge338, materials.brass, [0, -0.1, 0]);
  const bullet338 = createLatheAlongX(
    [
      [0.67, 0.04],
      [0.82, 0.026],
      [0.92, 0.002],
    ],
    14
  );
  placeMesh(magPart.group, bullet338, materials.copperJacket, [0, -0.1, 0]);

  // ---------------------------------------------------------------------------
  // 6. SKELETONIZED PRECISION SNIPER STOCK WITH ADJUSTABLE CHEEK RISER (Culata)
  // ---------------------------------------------------------------------------
  // Folding stock hinge block behind chassis
  const hingeBlock = createRoundedBox(0.32, 0.42, 0.38, 0.028, 0.014);
  placeMesh(stockPart.group, hingeBlock, materials.gunmetal, [-1.36, 0.04, 0]);

  // Upper & lower skeletonized precision aluminum stock beams with central weight cutout
  const upperBeam = createRoundedBox(3.72, 0.24, 0.32, 0.025, 0.014);
  placeMesh(stockPart.group, upperBeam, materials.anodizedAlloy, [-3.34, 0.12, 0]);

  const lowerStrutProfile: [number, number][] = [
    [-1.48, -0.06],
    [-2.08, -0.58],
    [-4.96, -0.82],
    [-5.18, -0.82],
    [-5.18, -0.52],
    [-2.24, -0.34],
    [-1.66, 0.06],
  ];
  const lowerStrut = createExtrudedProfile(lowerStrutProfile, 0.26, {
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  placeMesh(stockPart.group, lowerStrut, materials.anodizedAlloy);

  // Rear vertical buttstock bridge & length-of-pull adjustment spacers
  const rearBridge = createRoundedBox(0.36, 1.18, 0.34, 0.03, 0.016);
  placeMesh(stockPart.group, rearBridge, materials.polymerAccent, [-5.08, -0.26, 0]);

  const buttpad = createRoundedBox(0.18, 1.24, 0.38, 0.035, 0.018);
  placeMesh(stockPart.group, buttpad, materials.rubber, [-5.34, -0.26, 0]);

  // Elevated adjustable cheek riser saddle on twin stainless guide posts + side thumbwheel!
  const riserPost = new THREE.CylinderGeometry(0.032, 0.032, 0.34, 12);
  placeMesh(stockPart.group, riserPost, materials.chromeSteel, [-2.72, 0.34, 0]);
  placeMesh(stockPart.group, riserPost, materials.chromeSteel, [-3.92, 0.34, 0]);

  const cheekPad = createRoundedBox(1.76, 0.14, 0.36, 0.05, 0.025);
  placeMesh(stockPart.group, cheekPad, materials.polymerGrip, [-3.32, 0.5, 0]);

  const riserKnob = createCylinderZ(0.075, 0.39, 16);
  placeMesh(stockPart.group, riserKnob, materials.gunmetal, [-3.32, 0.12, 0]);

  // Retractable rear precision monopod leg tucked beneath rear buttstock toe
  const monoLeg = new THREE.CylinderGeometry(0.062, 0.058, 0.52, 16);
  placeMesh(stockPart.group, monoLeg, materials.gunmetal, [-4.72, -1.04, 0]);
  const monoFoot = new THREE.CylinderGeometry(0.088, 0.095, 0.09, 16);
  placeMesh(stockPart.group, monoFoot, materials.rubber, [-4.72, -1.32, 0]);

  // ---------------------------------------------------------------------------
  // 7. DEPLOYED TWIN-LEG TACTICAL BIPOD (Bípode Táctico)
  // ---------------------------------------------------------------------------
  // Rail mount clamp & articulated pivot yoke under front forend (x = +3.02)
  const bipodMount = createRoundedBox(0.42, 0.16, 0.28, 0.02, 0.01);
  placeMesh(bipodPart.group, bipodMount, materials.gunmetal, [3.02, -0.1, 0]);

  const pivotHub = createCylinderX(0.078, 0.078, 0.32, 16);
  placeMesh(bipodPart.group, pivotHub, materials.matteSteel, [3.02, -0.24, 0]);

  // Left & right splayed telescoping bipod legs with notched extensions & rubber feet
  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(3.02, -0.24, side * 0.12);
    // Splay gracefully outward (~26°) and slightly forward (~12°)
    legGroup.rotation.x = -side * 0.44;
    legGroup.rotation.z = 0.2;

    // Upper outer leg tube
    const upperLeg = new THREE.CylinderGeometry(0.056, 0.052, 0.92, 14);
    placeMesh(legGroup, upperLeg, materials.anodizedAlloy, [0, -0.46, 0]);

    // Lower telescoping chrome inner leg + notched collar
    const collar = new THREE.CylinderGeometry(0.068, 0.068, 0.1, 14);
    placeMesh(legGroup, collar, materials.gunmetal, [0, -0.92, 0]);
    const innerLeg = new THREE.CylinderGeometry(0.04, 0.038, 0.62, 14);
    placeMesh(legGroup, innerLeg, materials.chromeSteel, [0, -1.2, 0]);

    // Ribbed rubber stabilizer foot pad
    const foot = new THREE.CylinderGeometry(0.075, 0.092, 0.12, 16);
    placeMesh(legGroup, foot, materials.rubber, [0, -1.52, 0]);

    // External return spring running parallel along upper leg
    const springRod = new THREE.CylinderGeometry(0.022, 0.022, 0.54, 10);
    placeMesh(legGroup, springRod, materials.matteSteel, [0.06, -0.34, side * 0.03]);

    bipodPart.group.add(legGroup);
  }

  return finalizeWeaponModel(
    [chassisPart, boltPart, barrelPart, scopePart, magPart, stockPart, bipodPart],
    10.4
  );
}
