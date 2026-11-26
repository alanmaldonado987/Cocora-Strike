import * as THREE from "three";
import { getMaterials } from "./materials";

import { createLoftedFuselage, revolved } from "./surfaces";
import { sweptBlade } from "./propulsion";
export { createLoftedFuselage, createWingGeometry } from "./surfaces";
export { crewStation as buildEjectionSeat } from "./cockpits";
export { sculptedTurboprop as buildTurbopropEngine } from "./propulsion";

/**
 * Multi-barrel Gatling/Vulcan/GAU-8/M134 rotary cannon pointing toward +Z.
 */
export function buildRotaryCannon(options: {
  barrelCount?: number;
  barrelLength?: number;
  barrelRadius?: number;
  clusterRadius?: number;
  receiverLength?: number;
  clampCount?: number;
}): { group: THREE.Group; barrelCluster: THREE.Group } {
  const mats = getMaterials();
  const {
    barrelCount = 6,
    barrelLength = 1.0,
    barrelRadius = 0.018,
    clusterRadius = 0.06,
    receiverLength = 0.34,
    clampCount = 3,
  } = options;

  const group = new THREE.Group();

  // Receiver & electric/hydraulic drive housing
  const receiver = new THREE.Mesh(
    new THREE.CylinderGeometry(
      clusterRadius * 1.45,
      clusterRadius * 1.5,
      receiverLength,
      14,
    ),
    mats.gunmetal,
  );
  receiver.rotation.x = Math.PI / 2;
  receiver.position.z = -receiverLength * 0.5;
  group.add(receiver);

  // Side drive motor cylinder
  const driveMotor = new THREE.Mesh(
    new THREE.CylinderGeometry(
      clusterRadius * 0.65,
      clusterRadius * 0.65,
      receiverLength * 0.78,
      10,
    ),
    mats.titanium,
  );
  driveMotor.rotation.x = Math.PI / 2;
  driveMotor.position.set(
    clusterRadius * 1.3,
    clusterRadius * 0.45,
    -receiverLength * 0.48,
  );
  group.add(driveMotor);

  // Rotating barrel cluster
  const barrelCluster = new THREE.Group();
  const barrelGeom = new THREE.CylinderGeometry(
    barrelRadius,
    barrelRadius * 1.05,
    barrelLength,
    8,
  );
  barrelGeom.rotateX(Math.PI / 2);

  for (let i = 0; i < barrelCount; i++) {
    const angle = (i / barrelCount) * Math.PI * 2;
    const barrel = new THREE.Mesh(barrelGeom, mats.bluedBarrel);
    barrel.position.set(
      Math.cos(angle) * clusterRadius,
      Math.sin(angle) * clusterRadius,
      barrelLength * 0.5,
    );
    barrelCluster.add(barrel);
  }

  // Central shaft
  const centerRod = new THREE.Mesh(
    new THREE.CylinderGeometry(
      barrelRadius * 0.85,
      barrelRadius * 0.85,
      barrelLength * 0.96,
      8,
    ),
    mats.titanium,
  );
  centerRod.rotation.x = Math.PI / 2;
  centerRod.position.z = barrelLength * 0.48;
  barrelCluster.add(centerRod);

  // Barrel support clamps / discs along the length
  const clampGeom = new THREE.CylinderGeometry(
    clusterRadius + barrelRadius * 1.45,
    clusterRadius + barrelRadius * 1.45,
    0.032,
    14,
  );
  clampGeom.rotateX(Math.PI / 2);

  for (let c = 1; c <= clampCount; c++) {
    const frac = (c / (clampCount + 0.25)) * barrelLength;
    const clamp = new THREE.Mesh(clampGeom, mats.titanium);
    clamp.position.z = frac;
    barrelCluster.add(clamp);
  }

  // Muzzle gas deflector collar
  const muzzleCap = new THREE.Mesh(
    new THREE.CylinderGeometry(
      clusterRadius + barrelRadius * 1.2,
      clusterRadius + barrelRadius * 1.5,
      0.06,
      14,
    ),
    mats.burntTitanium,
  );
  muzzleCap.rotation.x = Math.PI / 2;
  muzzleCap.position.z = barrelLength + 0.015;
  barrelCluster.add(muzzleCap);

  group.add(barrelCluster);
  return { group, barrelCluster };
}

/**
 * Single heavy autocannon / chain gun (e.g., M230, 2A42, GAU-23, 105mm howitzer) pointing +Z.
 */
export function buildAutocannon(options: {
  barrelLength?: number;
  caliberRadius?: number;
  breechLength?: number;
  hasCoolingJacket?: boolean;
  hasMuzzleBrake?: boolean;
}): THREE.Group {
  const mats = getMaterials();
  const {
    barrelLength = 1.2,
    caliberRadius = 0.028,
    breechLength = 0.42,
    hasCoolingJacket = true,
    hasMuzzleBrake = true,
  } = options;

  const group = new THREE.Group();

  // Boxy breech receiver
  const breech = new THREE.Mesh(
    new THREE.BoxGeometry(
      caliberRadius * 5.2,
      caliberRadius * 5.5,
      breechLength,
    ),
    mats.gunmetal,
  );
  breech.position.z = -breechLength * 0.5;
  group.add(breech);

  // Recoil buffer cylinder above barrel
  const recoilCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(
      caliberRadius * 1.2,
      caliberRadius * 1.2,
      barrelLength * 0.34,
      10,
    ),
    mats.chrome,
  );
  recoilCyl.rotation.x = Math.PI / 2;
  recoilCyl.position.set(0, caliberRadius * 2.1, barrelLength * 0.17);
  group.add(recoilCyl);

  if (hasCoolingJacket) {
    const jacket = new THREE.Mesh(
      new THREE.CylinderGeometry(
        caliberRadius * 1.85,
        caliberRadius * 2.0,
        barrelLength * 0.42,
        12,
      ),
      mats.gunmetal,
    );
    jacket.rotation.x = Math.PI / 2;
    jacket.position.z = barrelLength * 0.21;
    group.add(jacket);
  }

  // Main barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      caliberRadius * 0.92,
      caliberRadius * 1.18,
      barrelLength,
      12,
    ),
    mats.bluedBarrel,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = barrelLength * 0.5;
  group.add(barrel);

  if (hasMuzzleBrake) {
    const brake = new THREE.Mesh(
      new THREE.BoxGeometry(
        caliberRadius * 3.2,
        caliberRadius * 2.4,
        caliberRadius * 4.4,
      ),
      mats.burntTitanium,
    );
    brake.position.z = barrelLength + caliberRadius * 1.8;
    group.add(brake);
  }

  return group;
}

/**
 * Builds a cylindrical helical ammunition drum magazine + flexible feed chute with brass cartridges.
 */
export function buildAmmoDrumMagazine(options: {
  drumRadius?: number;
  drumLength?: number;
  axis?: "x" | "y" | "z";
  chuteCurvePoints?: THREE.Vector3[];
}): THREE.Group {
  const mats = getMaterials();
  const {
    drumRadius = 0.28,
    drumLength = 0.62,
    axis = "z",
    chuteCurvePoints,
  } = options;

  const group = new THREE.Group();
  const drumAssembly = new THREE.Group();

  // Main drum casing
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(drumRadius, drumRadius, drumLength, 18),
    mats.gunmetal,
  );
  drumAssembly.add(body);

  // Structural stiffening ribs & end caps
  const ribGeom = new THREE.TorusGeometry(
    drumRadius * 1.01,
    drumRadius * 0.055,
    8,
    20,
  );
  ribGeom.rotateX(Math.PI / 2);
  [-0.44, 0, 0.44].forEach((f) => {
    const rib = new THREE.Mesh(ribGeom, mats.titanium);
    rib.position.y = f * drumLength;
    drumAssembly.add(rib);
  });

  // Cutaway / visible brass cartridge band showing ammunition inside the drum
  const brassBand = new THREE.Mesh(
    new THREE.CylinderGeometry(
      drumRadius * 1.015,
      drumRadius * 1.015,
      drumLength * 0.28,
      18,
    ),
    mats.brass,
  );
  brassBand.position.y = drumLength * 0.16;
  drumAssembly.add(brassBand);

  // Yellow ordnance stencil band
  const stencil = new THREE.Mesh(
    new THREE.CylinderGeometry(
      drumRadius * 1.02,
      drumRadius * 1.02,
      drumLength * 0.07,
      18,
    ),
    mats.warningYellow,
  );
  stencil.position.y = -drumLength * 0.22;
  drumAssembly.add(stencil);

  if (axis === "z") {
    drumAssembly.rotation.x = Math.PI / 2;
  } else if (axis === "x") {
    drumAssembly.rotation.z = Math.PI / 2;
  }
  group.add(drumAssembly);

  // Flexible linked ammo feed chute
  if (chuteCurvePoints && chuteCurvePoints.length >= 2) {
    const curve = new THREE.CatmullRomCurve3(chuteCurvePoints);
    const chuteGeom = new THREE.TubeGeometry(
      curve,
      16,
      drumRadius * 0.26,
      8,
      false,
    );
    const chuteMesh = new THREE.Mesh(chuteGeom, mats.titanium);
    group.add(chuteMesh);

    // Visible brass rounds along feed throat
    const sampleCount = 6;
    const shellGeom = new THREE.CylinderGeometry(
      drumRadius * 0.09,
      drumRadius * 0.09,
      drumRadius * 0.46,
      8,
    );
    for (let s = 1; s < sampleCount; s++) {
      const t = s / sampleCount;
      const pt = curve.getPointAt(t);
      const shell = new THREE.Mesh(shellGeom, mats.brass);
      shell.position.copy(pt);
      shell.rotation.z = Math.PI / 2;
      group.add(shell);
    }
  }

  return group;
}

/**
 * Gimballed electro-optical / FLIR / laser targeting sight turret.
 */
export function buildOpticalSightTurret(radius = 0.18): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();

  // Azimuth base collar
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.88, radius * 1.02, radius * 0.55, 16),
    mats.gunmetal,
  );
  collar.position.y = radius * 0.85;
  group.add(collar);

  // Gimbal yoke
  const yoke = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2.15, radius * 0.9, radius * 0.9),
    mats.titanium,
  );
  yoke.position.y = radius * 0.35;
  group.add(yoke);

  // Spherical sensor ball
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 18, 14),
    mats.gunmetal,
  );
  group.add(ball);

  // Primary FLIR coated emerald lens (+Z forward)
  const mainBezel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.46, radius * 0.48, radius * 0.24, 16),
    mats.chrome,
  );
  mainBezel.rotation.x = Math.PI / 2;
  mainBezel.position.set(-radius * 0.24, 0.02 * radius, radius * 0.86);
  group.add(mainBezel);

  const mainLens = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.4, 14, 10),
    mats.opticEmerald,
  );
  mainLens.scale.set(1, 1, 0.35);
  mainLens.position.set(-radius * 0.24, 0.02 * radius, radius * 0.97);
  group.add(mainLens);

  // Secondary laser designator amber aperture
  const secBezel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.28, radius * 0.3, radius * 0.22, 14),
    mats.chrome,
  );
  secBezel.rotation.x = Math.PI / 2;
  secBezel.position.set(radius * 0.34, -radius * 0.1, radius * 0.86);
  group.add(secBezel);

  const secLens = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.24, 12, 10),
    mats.opticAmber,
  );
  secLens.scale.set(1, 1, 0.35);
  secLens.position.set(radius * 0.34, -radius * 0.1, radius * 0.96);
  group.add(secLens);

  return group;
}

/**
 * Holographic Head-Up Display (HUD) reflex sight combiner for aircraft cockpits.
 */
export function buildHudSight(scale = 1): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();

  const projectorBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.18 * scale, 0.06 * scale, 0.18 * scale),
    mats.gunmetal,
  );
  group.add(projectorBase);

  const lensProjector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055 * scale, 0.06 * scale, 0.04 * scale, 12),
    mats.opticEmerald,
  );
  lensProjector.position.y = 0.04 * scale;
  group.add(lensProjector);

  // Angled combiner glass frame
  const combinerGroup = new THREE.Group();
  combinerGroup.position.set(0, 0.11 * scale, 0.02 * scale);
  combinerGroup.rotation.x = -0.45;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16 * scale, 0.15 * scale),
    mats.hudGlow,
  );
  combinerGroup.add(glass);

  const strutL = new THREE.Mesh(
    new THREE.BoxGeometry(0.012 * scale, 0.16 * scale, 0.012 * scale),
    mats.titanium,
  );
  strutL.position.x = -0.082 * scale;
  combinerGroup.add(strutL);

  const strutR = strutL.clone();
  strutR.position.x = 0.082 * scale;
  combinerGroup.add(strutR);

  group.add(combinerGroup);
  return group;
}

/**
 * Detailed high-bypass turbofan engine pod with spinning intake fan blades.
 */
export function buildTurbofanPod(options: {
  radius: number;
  length: number;
  bodyMaterial: THREE.Material;
}): { group: THREE.Group; fanRotor: THREE.Group } {
  const mats = getMaterials();
  const { radius, length, bodyMaterial } = options;
  const group = new THREE.Group();

  // Sculpted nacelle cowling
  const nacelleGeom = createLoftedFuselage(
    [
      {
        z: -length * 0.52,
        halfWidth: radius * 0.78,
        topHeight: radius * 0.78,
        bottomHeight: radius * 0.78,
      },
      {
        z: -length * 0.2,
        halfWidth: radius * 0.98,
        topHeight: radius * 0.98,
        bottomHeight: radius * 0.98,
      },
      {
        z: length * 0.25,
        halfWidth: radius,
        topHeight: radius,
        bottomHeight: radius,
      },
      {
        z: length * 0.5,
        halfWidth: radius * 0.9,
        topHeight: radius * 0.9,
        bottomHeight: radius * 0.9,
      },
    ],
    22,
  );
  // The inlet is open; fan blades remain visible behind a rolled metal lip.
  const ids = Array.from(nacelleGeom.index!.array);
  nacelleGeom.setIndex(ids.slice(0, ids.length - 22 * 3));
  const nacelle = new THREE.Mesh(nacelleGeom, bodyMaterial);
  group.add(nacelle);

  // Polished chrome/titanium intake lip ring
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.86, radius * 0.075, 10, 24),
    mats.titanium,
  );
  lip.position.z = length * 0.49;
  group.add(lip);

  // Dark intake duct cavity
  const duct = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius * 0.82, length * 0.22, 20),
    mats.rubber,
  );
  duct.rotation.x = Math.PI / 2;
  duct.position.z = length * 0.23;
  group.add(duct);

  // Spinning turbofan rotor assembly
  const fanRotor = new THREE.Group();
  fanRotor.position.z = length * 0.38;

  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.24, radius * 0.52, 14),
    mats.gunmetal,
  );
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = radius * 0.16;
  fanRotor.add(spinner);

  const bladeCount = 14;
  const bladeGeom = sweptBlade(radius * 0.64, radius * 0.16).geometry;
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const bladeHolder = new THREE.Group();
    bladeHolder.rotation.z = angle;
    const blade = new THREE.Mesh(bladeGeom, mats.titanium);
    blade.position.y = radius * 0.18;
    blade.rotation.y = 0.48;
    bladeHolder.add(blade);
    fanRotor.add(bladeHolder);
  }
  group.add(fanRotor);

  // Exhaust core nozzle & center plug
  const coreNozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.56, radius * 0.68, length * 0.28, 18),
    mats.burntTitanium,
  );
  coreNozzle.rotation.x = Math.PI / 2;
  coreNozzle.position.z = -length * 0.58;
  group.add(coreNozzle);

  const corePlug = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.32, length * 0.34, 14),
    mats.titanium,
  );
  corePlug.rotation.x = -Math.PI / 2;
  corePlug.position.z = -length * 0.72;
  group.add(corePlug);

  return { group, fanRotor };
}

/**
 * Air-cooled 9-cylinder radial piston engine + classic mahogany 2-blade propeller.
 */
export function buildRadialEngine(
  radius = 0.46,
  propRadius = 1.15,
): {
  group: THREE.Group;
  propRotor: THREE.Group;
} {
  const mats = getMaterials();
  const group = new THREE.Group();

  // Crankcase hub
  const crankcase = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.46, radius * 0.52, 0.34, 16),
    mats.titanium,
  );
  crankcase.rotation.x = Math.PI / 2;
  group.add(crankcase);

  // Rear collector exhaust ring
  const exhaustRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.72, 0.045, 8, 20),
    mats.burntTitanium,
  );
  exhaustRing.position.z = -0.14;
  group.add(exhaustRing);

  const cylCount = 9;
  const cylGeom = new THREE.CylinderGeometry(
    radius * 0.17,
    radius * 0.15,
    radius * 0.56,
    10,
  );
  const headGeom = new THREE.BoxGeometry(
    radius * 0.34,
    radius * 0.14,
    radius * 0.3,
  );
  const pushrodGeom = new THREE.CylinderGeometry(0.01, 0.01, radius * 0.48, 6);

  for (let i = 0; i < cylCount; i++) {
    const angle = (i / cylCount) * Math.PI * 2;
    const cylGroup = new THREE.Group();
    cylGroup.rotation.z = angle;

    const cyl = new THREE.Mesh(cylGeom, mats.gunmetal);
    cyl.position.y = radius * 0.68;
    cylGroup.add(cyl);

    const head = new THREE.Mesh(headGeom, mats.classicSilver);
    head.position.y = radius * 0.96;
    cylGroup.add(head);

    // Twin chrome pushrod tubes
    [-0.05, 0.05].forEach((ox) => {
      const rod = new THREE.Mesh(pushrodGeom, mats.chrome);
      rod.position.set(ox, radius * 0.68, 0.09);
      cylGroup.add(rod);
    });

    group.add(cylGroup);
  }

  // Two-blade sculpted wooden propeller with brass hub plate
  const propRotor = new THREE.Group();
  propRotor.position.z = 0.24;

  const hubPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14),
    mats.brass,
  );
  hubPlate.rotation.x = Math.PI / 2;
  propRotor.add(hubPlate);

  const noseNut = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.16, 12),
    mats.chrome,
  );
  noseNut.rotation.x = Math.PI / 2;
  noseNut.position.z = 0.11;
  propRotor.add(noseNut);

  [-1, 1].forEach((dir) => {
    const bladeHolder = new THREE.Group();
    bladeHolder.rotation.z = dir > 0 ? 0 : Math.PI;

    const blade = sweptBlade(propRadius * 0.94, 0.16, false, true);
    blade.position.y = propRadius * 0.06;
    bladeHolder.add(blade);

    propRotor.add(bladeHolder);
  });

  group.add(propRotor);
  return { group, propRotor };
}

/**
 * Articulated helicopter main rotor head with swashplate, pitch links, dampers & blades.
 */
export function buildArticulatedRotorHead(options: {
  bladeCount: number;
  rotorRadius: number;
  bladeChord?: number;
  mastHeight?: number;
  hasRadarDome?: boolean;
}): {
  group: THREE.Group;
  spinningHead: THREE.Group;
  radarDome?: THREE.Group;
} {
  const mats = getMaterials();
  const {
    bladeCount,
    rotorRadius,
    bladeChord = 0.24,
    mastHeight = 0.45,
    hasRadarDome = false,
  } = options;

  const group = new THREE.Group();

  // Stationary lower mast housing & hydraulic servo actuators
  const mastBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, mastHeight * 0.45, 14),
    mats.gunmetal,
  );
  mastBase.position.y = mastHeight * 0.22;
  group.add(mastBase);

  // Lower stationary swashplate
  const lowerSwash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.045, 16),
    mats.titanium,
  );
  lowerSwash.position.y = mastHeight * 0.48;
  group.add(lowerSwash);

  // Three stationary servo cylinders driving lower swashplate
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2;
    const servo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, mastHeight * 0.46, 8),
      mats.chrome,
    );
    servo.position.set(
      Math.cos(a) * 0.23,
      mastHeight * 0.24,
      Math.sin(a) * 0.23,
    );
    group.add(servo);
  }

  // Rotating mast + upper swashplate + pitch links + blade grips + blades
  const spinningHead = new THREE.Group();

  const mainShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.095, mastHeight, 12),
    mats.chrome,
  );
  mainShaft.position.y = mastHeight * 0.5;
  spinningHead.add(mainShaft);

  const upperSwash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.27, 0.04, 16),
    mats.burntTitanium,
  );
  upperSwash.position.y = mastHeight * 0.54;
  spinningHead.add(upperSwash);

  const hubPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.28, 0.11, Math.max(12, bladeCount * 3)),
    mats.gunmetal,
  );
  hubPlate.position.y = mastHeight;
  spinningHead.add(hubPlate);

  const bladeLen = rotorRadius - 0.42;

  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.rotation.y = angle;

    // Blade grip yoke & elastomeric hinge
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.09, 0.32),
      mats.titanium,
    );
    grip.position.set(0, mastHeight, 0.36);
    arm.add(grip);

    // Chrome pitch-control link from upper swashplate to blade horn
    const pitchLink = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, mastHeight * 0.46, 6),
      mats.chrome,
    );
    pitchLink.position.set(0.09, mastHeight * 0.77, 0.24);
    pitchLink.rotation.z = -0.12;
    arm.add(pitchLink);

    // Lead-lag damper cylinder
    const damper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.28, 8),
      mats.brass,
    );
    damper.rotation.z = Math.PI / 2;
    damper.rotation.y = 0.52;
    damper.position.set(-0.14, mastHeight, 0.33);
    arm.add(damper);

    const blade = sweptBlade(bladeLen, bladeChord, true);
    blade.rotation.x = Math.PI / 2;
    blade.position.set(0, mastHeight, 0.42);
    arm.add(blade);

    spinningHead.add(arm);
  }

  group.add(spinningHead);

  let radarDome: THREE.Group | undefined;
  if (hasRadarDome) {
    radarDome = new THREE.Group();
    radarDome.position.y = mastHeight + 0.22;

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.18, 12),
      mats.gunmetal,
    );
    radarDome.add(neck);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 20, 14),
      mats.apacheDark,
    );
    dome.scale.set(1, 0.46, 1);
    dome.position.y = 0.14;
    radarDome.add(dome);

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.022, 8, 22),
      mats.titanium,
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.14;
    radarDome.add(band);

    group.add(radarDome);
  }

  return { group, spinningHead, radarDome };
}

/**
 * Hydra-70 19-tube rocket pod.
 */
export function buildRocketPod(radius = 0.16, length = 1.05): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.92, length, 14),
    mats.oliveOrdnance,
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const faceCap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.04, 14),
    mats.titanium,
  );
  faceCap.rotation.x = Math.PI / 2;
  faceCap.position.z = length * 0.5;
  group.add(faceCap);

  // Recessed rocket launch tubes
  const boreGeom = new THREE.CylinderGeometry(
    radius * 0.17,
    radius * 0.17,
    0.05,
    8,
  );
  boreGeom.rotateX(Math.PI / 2);

  const centerBore = new THREE.Mesh(boreGeom, mats.rubber);
  centerBore.position.z = length * 0.505;
  group.add(centerBore);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bore = new THREE.Mesh(boreGeom, mats.rubber);
    bore.position.set(
      Math.cos(a) * radius * 0.54,
      Math.sin(a) * radius * 0.54,
      length * 0.505,
    );
    group.add(bore);
  }

  return group;
}

/**
 * Air-to-air / Air-to-ground tactical guided missile (+Z nose).
 */
export function buildGuidedMissile(options?: {
  length?: number;
  radius?: number;
  darkBody?: boolean;
}): THREE.Group {
  const mats = getMaterials();
  const length = options?.length ?? 1.25;
  const radius = options?.radius ?? 0.065;
  const bodyMat = options?.darkBody ? mats.oliveOrdnance : mats.whiteMissile;

  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length * 0.82, 12),
    bodyMat,
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const seeker = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 10),
    mats.opticAmber,
  );
  seeker.scale.set(1, 1, 1.8);
  seeker.position.z = length * 0.41;
  group.add(seeker);

  // Warhead yellow band
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, length * 0.05, 12),
    mats.warningYellow,
  );
  band.rotation.x = Math.PI / 2;
  band.position.z = length * 0.22;
  group.add(band);

  // Cruciform fins (forward & aft)
  const aftFinGeom = new THREE.BoxGeometry(radius * 3.8, 0.014, length * 0.16);
  const fwdFinGeom = new THREE.BoxGeometry(radius * 2.6, 0.012, length * 0.1);

  [0, Math.PI / 2].forEach((rot) => {
    const aft = new THREE.Mesh(aftFinGeom, mats.titanium);
    aft.rotation.z = rot;
    aft.position.z = -length * 0.33;
    group.add(aft);

    const fwd = new THREE.Mesh(fwdFinGeom, mats.gunmetal);
    fwd.rotation.z = rot;
    fwd.position.z = length * 0.14;
    group.add(fwd);
  });

  return group;
}

/**
 * Oleo-pneumatic wheeled landing gear strut (+Y top mount down to ground).
 */
export function buildWheeledLandingGear(options: {
  strutHeight: number;
  wheelRadius: number;
  dualWheel?: boolean;
}): THREE.Group {
  const mats = getMaterials();
  const { strutHeight, wheelRadius, dualWheel = true } = options;

  const group = new THREE.Group();

  // Upper outer cylinder
  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, strutHeight * 0.58, 10),
    mats.titanium,
  );
  upper.position.y = -strutHeight * 0.29;
  group.add(upper);

  // Chrome shock-absorber piston
  const piston = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, strutHeight * 0.48, 10),
    mats.chrome,
  );
  piston.position.y = -strutHeight * 0.72;
  group.add(piston);

  // Torque scissor links
  const link1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, strutHeight * 0.22, 0.09),
    mats.gunmetal,
  );
  link1.position.set(0, -strutHeight * 0.55, -0.05);
  link1.rotation.x = 0.45;
  group.add(link1);

  const link2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, strutHeight * 0.22, 0.09),
    mats.gunmetal,
  );
  link2.position.set(0, -strutHeight * 0.7, -0.05);
  link2.rotation.x = -0.45;
  group.add(link2);

  // Wheel(s)
  const offsets = dualWheel ? [-wheelRadius * 0.52, wheelRadius * 0.52] : [0];
  offsets.forEach((ox) => {
    const r = wheelRadius,
      w = r * 0.33;
    const tire = revolved(
      [
        [r * 0.44, -w],
        [r * 0.77, -w],
        [r * 0.94, -w * 0.72],
        [r, -w * 0.28],
        [r, w * 0.28],
        [r * 0.94, w * 0.72],
        [r * 0.77, w],
        [r * 0.44, w],
        [r * 0.44, -w],
      ],
      mats.rubber,
      20,
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(ox, -strutHeight, 0);
    group.add(tire);
    const hub = revolved(
      [
        [0, -w * 1.1],
        [r * 0.22, -w * 1.1],
        [r * 0.33, -w * 0.86],
        [r * 0.49, -w],
        [r * 0.49, w],
        [r * 0.32, w * 0.86],
        [r * 0.2, w * 1.1],
        [0, w * 1.1],
      ],
      mats.titanium,
      18,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(tire.position);
    group.add(hub);
  });

  return group;
}
