import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAmmoDrumMagazine,
  buildEjectionSeat,
  buildGuidedMissile,
  buildHudSight,
  buildRotaryCannon,
  buildWheeledLandingGear,
} from "../partBuilders";
import { createLoftedFuselage, createWingGeometry, fairing } from "../surfaces";
import { framedCanopy } from "../cockpits";
import { aerial, machined } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildF22Raptor(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  const fusY = 1.02;

  // Chined stealth fuselage
  const hullGeom = createLoftedFuselage(
    [
      {
        z: -3.35,
        halfWidth: 0.68,
        topHeight: 0.24,
        bottomHeight: 0.2,
        yCenter: fusY,
        chinePinch: 0.65,
      },
      {
        z: -2.2,
        halfWidth: 0.88,
        topHeight: 0.34,
        bottomHeight: 0.26,
        yCenter: fusY,
        chinePinch: 0.7,
      },
      {
        z: -0.4,
        halfWidth: 0.96,
        topHeight: 0.38,
        bottomHeight: 0.29,
        yCenter: fusY,
        chinePinch: 0.74,
      },
      {
        z: 1.15,
        halfWidth: 0.82,
        topHeight: 0.36,
        bottomHeight: 0.28,
        yCenter: fusY,
        chinePinch: 0.76,
      },
      {
        z: 2.35,
        halfWidth: 0.52,
        topHeight: 0.26,
        bottomHeight: 0.22,
        yCenter: fusY - 0.02,
        chinePinch: 0.8,
      },
      {
        z: 3.35,
        halfWidth: 0.22,
        topHeight: 0.12,
        bottomHeight: 0.1,
        yCenter: fusY - 0.05,
        chinePinch: 0.82,
      },
      {
        z: 3.92,
        halfWidth: 0.015,
        topHeight: 0.015,
        bottomHeight: 0.015,
        yCenter: fusY - 0.07,
        chinePinch: 0.85,
      },
    ],
    24,
  );
  airframe.add(new THREE.Mesh(hullGeom, mats.stealthDark));

  // Dorsal spine behind cockpit
  const spineGeom = createLoftedFuselage(
    [
      {
        z: -2.6,
        halfWidth: 0.28,
        topHeight: 0.12,
        bottomHeight: 0.04,
        yCenter: fusY + 0.28,
      },
      {
        z: -0.4,
        halfWidth: 0.42,
        topHeight: 0.22,
        bottomHeight: 0.05,
        yCenter: fusY + 0.3,
      },
      {
        z: 0.75,
        halfWidth: 0.38,
        topHeight: 0.26,
        bottomHeight: 0.05,
        yCenter: fusY + 0.32,
      },
    ],
    16,
  );
  airframe.add(new THREE.Mesh(spineGeom, mats.stealthMid));

  // Main trapezoidal stealth wings (+X left, -X right)
  ([1, -1] as const).forEach((side) => {
    const wingGeom = createWingGeometry({
      span: 2.48,
      rootChord: 2.55,
      tipChord: 0.68,
      sweepZ: -0.82,
      dihedralY: -0.04,
      rootThickness: 0.13,
      tipThickness: 0.045,
      camber: 0.008,
      side,
    });
    const wing = new THREE.Mesh(wingGeom, mats.stealthDark);
    wing.position.set(side * 0.68, fusY + 0.04, -0.38);
    airframe.add(wing);

    // Articulated trailing-edge flaperon (mechanisms)
    const flaperon = new THREE.Mesh(
      machined(1.45, 0.038, 0.28),
      mats.stealthMid,
    );
    flaperon.position.set(side * 1.55, fusY + 0.01, -1.48);
    flaperon.rotation.y = -side * 0.16;
    flaperon.rotation.x = 0.12;
    mechanismsGroup.add(flaperon);

    // Wingtip nav lights
    const navLight = new THREE.Mesh(
      machined(0.06, 0.04, 0.22),
      side > 0 ? mats.navRed : mats.navGreen,
    );
    navLight.position.set(side * 3.16, fusY, -1.2);
    airframe.add(navLight);

    // All-moving horizontal stabilators
    const stabGeom = createWingGeometry({
      span: 1.15,
      rootChord: 1.25,
      tipChord: 0.36,
      sweepZ: -0.52,
      dihedralY: 0,
      rootThickness: 0.07,
      tipThickness: 0.028,
      camber: 0,
      side,
    });
    const stab = new THREE.Mesh(stabGeom, mats.stealthDark);
    stab.position.set(side * 0.66, fusY + 0.02, -2.78);
    mechanismsGroup.add(stab);

    // Canted V-tail vertical stabilizers
    const finGroup = new THREE.Group();
    finGroup.position.set(side * 0.62, fusY + 0.22, -2.28);
    finGroup.rotation.z = -side * 0.46;

    const finGeom = createWingGeometry({
      span: 1.28,
      rootChord: 1.42,
      tipChord: 0.48,
      sweepZ: -0.58,
      dihedralY: 0,
      rootThickness: 0.075,
      tipThickness: 0.03,
      camber: 0,
      side: 1,
    });
    finGroup.rotation.z = -side * 0.46;
    const finMesh = new THREE.Mesh(finGeom, mats.stealthMid);
    finMesh.rotation.z = Math.PI / 2;
    finGroup.add(finMesh);
    airframe.add(finGroup);

    // Caret supersonic side air intakes
    const intake = new THREE.Mesh(
      fairing(0.56, 0.46, 1.63, mats.stealthMid, 0.85).geometry,
      mats.stealthMid,
    );
    intake.position.set(side * 0.72, fusY - 0.14, 0.98);
    intake.rotation.z = side * 0.22;
    airframe.add(intake);

    const intakeCavity = new THREE.Mesh(
      machined(0.36, 0.32, 0.18),
      mats.rubber,
    );
    intakeCavity.position.set(side * 0.72, fusY - 0.14, 1.62);
    intakeCavity.rotation.z = side * 0.22;
    thrustersGroup.add(intakeCavity);
  });

  aerial(airframe, 0, fusY + 0.46, -0.65, 0.09);
  addMark(airframe, "AF / 022", 0.41, 0.13, 0.966, fusY + 0.83, -2.62);
  // Cockpit interior + Gold-tinted stealth bubble canopy + HUD sight
  const seat = buildEjectionSeat(0.95);
  seat.position.set(0, fusY + 0.24, 1.42);
  airframe.add(seat);

  const hud = buildHudSight(1.05);
  hud.position.set(0, fusY + 0.42, 2.08);
  sightGroup.add(hud);

  // Faceted under-nose EOTS electro-optical targeting prism
  const eotsHousing = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    mats.titanium,
  );
  eotsHousing.scale.set(0.85, 0.55, 1.6);
  eotsHousing.position.set(0, fusY - 0.24, 2.55);
  sightGroup.add(eotsHousing);

  const eotsLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 10),
    mats.opticEmerald,
  );
  eotsLens.position.set(0, fusY - 0.26, 2.66);
  sightGroup.add(eotsLens);

  airframe.add(
    framedCanopy(
      [
        {
          z: 0.65,
          halfWidth: 0.26,
          topHeight: 0.24,
          bottomHeight: 0.02,
          yCenter: fusY + 0.34,
        },
        {
          z: 1.45,
          halfWidth: 0.34,
          topHeight: 0.44,
          bottomHeight: 0.02,
          yCenter: fusY + 0.33,
        },
        {
          z: 2.15,
          halfWidth: 0.28,
          topHeight: 0.32,
          bottomHeight: 0.02,
          yCenter: fusY + 0.29,
        },
        {
          z: 2.65,
          halfWidth: 0.08,
          topHeight: 0.06,
          bottomHeight: 0.01,
          yCenter: fusY + 0.21,
        },
      ],
      mats.stealthMid,
      [0.76],
      false,
      airframe.children[0] as THREE.Mesh,
    ),
  );

  // THRUSTERS: Twin F119 2D Thrust-Vectoring Rectangular Nozzles + Glowing Afterburners
  ([-0.38, 0.38] as const).forEach((nx) => {
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(nx, fusY, -3.42);

    const shroud = new THREE.Mesh(
      machined(0.56, 0.36, 0.52),
      mats.burntTitanium,
    );
    nozzleGroup.add(shroud);

    // Upper & lower thrust-vectoring titanium paddles
    const upperPaddle = new THREE.Mesh(
      machined(0.52, 0.055, 0.38),
      mats.titanium,
    );
    upperPaddle.position.set(0, 0.16, -0.34);
    upperPaddle.rotation.x = 0.18;
    nozzleGroup.add(upperPaddle);

    const lowerPaddle = upperPaddle.clone();
    lowerPaddle.position.set(0, -0.16, -0.34);
    lowerPaddle.rotation.x = -0.18;
    nozzleGroup.add(lowerPaddle);

    // Vectoring actuator rods (mechanisms)
    const actuator = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8),
      mats.chrome,
    );
    actuator.rotation.x = Math.PI / 2;
    actuator.position.set(0, 0.21, -0.15);
    actuator.position.x += nx;
    actuator.position.y += fusY;
    actuator.position.z += -3.42;
    mechanismsGroup.add(actuator);

    // Incandescent afterburner core & shock cone
    const coreGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.19, 0.42, 14, 1, true),
      mats.afterburnerBlue,
    );
    coreGlow.rotation.x = Math.PI / 2;
    coreGlow.position.z = -0.22;
    nozzleGroup.add(coreGlow);

    const innerFlame = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.58, 12),
      mats.afterburnerAmber,
    );
    innerFlame.rotation.x = -Math.PI / 2;
    innerFlame.position.z = -0.44;
    nozzleGroup.add(innerFlame);

    animatedParts.push({
      object: innerFlame,
      axis: "z",
      speed: 8,
      mode: "pulse",
      baseValue: 1,
      amplitude: 0.14,
    });

    thrustersGroup.add(nozzleGroup);
  });

  // CANNON: Starboard Wing-Root M61A2 20mm Vulcan Rotary Cannon with open stealth port
  const vulcan = buildRotaryCannon({
    barrelCount: 6,
    barrelLength: 0.72,
    barrelRadius: 0.014,
    clusterRadius: 0.045,
    receiverLength: 0.32,
    clampCount: 2,
  });
  vulcan.group.position.set(-0.64, fusY + 0.22, 0.62);
  cannonGroup.add(vulcan.group);
  animatedParts.push({
    object: vulcan.barrelCluster,
    axis: "z",
    speed: 12,
    mode: "spin",
  });

  // Open gun port fairing door
  const gunDoor = new THREE.Mesh(machined(0.18, 0.025, 0.52), mats.stealthEdge);
  gunDoor.position.set(-0.74, fusY + 0.32, 0.92);
  gunDoor.rotation.z = -0.65;
  mechanismsGroup.add(gunDoor);

  // MAGAZINE: Linkless helical 20mm drum magazine in opened dorsal bay + ventral missile bay
  const vulcanDrum = buildAmmoDrumMagazine({
    drumRadius: 0.18,
    drumLength: 0.44,
    axis: "x",
    chuteCurvePoints: [
      new THREE.Vector3(0.05, 0.04, 0.14),
      new THREE.Vector3(-0.08, 0.06, 0.32),
      new THREE.Vector3(-0.12, 0.02, 0.5),
    ],
  });
  vulcanDrum.position.set(-0.5, fusY + 0.22, 0.02);
  magazineGroup.add(vulcanDrum);

  // Ventral internal weapon bay with opened sawtooth doors & 4 AIM-120C missiles
  const bayRecess = new THREE.Mesh(
    machined(0.86, 0.12, 1.65),
    mats.cockpitInterior,
  );
  bayRecess.position.set(0, fusY - 0.25, 0.08);
  magazineGroup.add(bayRecess);

  [-0.27, -0.09, 0.09, 0.27].forEach((mx) => {
    const aim = buildGuidedMissile({ length: 1.28, radius: 0.042 });
    aim.position.set(mx, fusY - 0.31, 0.08);
    cannonGroup.add(aim);
  });

  ([-1, 1] as const).forEach((s) => {
    const bayDoor = new THREE.Mesh(
      machined(0.36, 0.025, 1.62),
      mats.stealthMid,
    );
    bayDoor.position.set(s * 0.52, fusY - 0.38, 0.08);
    bayDoor.rotation.z = s * 0.95;
    mechanismsGroup.add(bayDoor);
  });

  // MECHANISMS: Retractable tricycle landing gear resting on y = 0
  const noseGear = buildWheeledLandingGear({
    strutHeight: fusY - 0.25 - 0.14,
    wheelRadius: 0.14,
  });
  noseGear.position.set(0, fusY - 0.25, 2.18);
  mechanismsGroup.add(noseGear);

  ([-0.82, 0.82] as const).forEach((gx) => {
    const mainGear = buildWheeledLandingGear({
      strutHeight: fusY - 0.18 - 0.2,
      wheelRadius: 0.2,
    });
    mainGear.position.set(gx, fusY - 0.18, -0.58);
    mechanismsGroup.add(mainGear);
  });

  root.add(
    tagPart(airframe, "airframe"),
    tagPart(cannonGroup, "cannon"),
    tagPart(magazineGroup, "magazine"),
    tagPart(thrustersGroup, "thrusters"),
    tagPart(sightGroup, "sight"),
    tagPart(mechanismsGroup, "mechanisms"),
  );

  const stats = computeGeometryStats(root);
  return { group: root, animatedParts, ...stats };
}
