import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAmmoDrumMagazine,
  buildEjectionSeat,
  buildGuidedMissile,
  buildHudSight,
  buildOpticalSightTurret,
  buildRocketPod,
  buildRotaryCannon,
  buildTurbofanPod,
  buildWheeledLandingGear,
} from "../partBuilders";
import { createLoftedFuselage, createWingGeometry, fairing } from "../surfaces";
import { framedCanopy } from "../cockpits";
import { aerial, machined, vent, flushHatch } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildA10Warthog(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  const fusY = 1.1;

  // Armored fuselage with rounded spine and flat tactical belly
  const fusGeom = createLoftedFuselage(
    [
      {
        z: -3.28,
        halfWidth: 0.28,
        topHeight: 0.24,
        bottomHeight: 0.18,
        yCenter: fusY + 0.06,
        squareness: 0.25,
      },
      {
        z: -1.8,
        halfWidth: 0.44,
        topHeight: 0.38,
        bottomHeight: 0.3,
        yCenter: fusY + 0.04,
        squareness: 0.3,
      },
      {
        z: 0.1,
        halfWidth: 0.54,
        topHeight: 0.46,
        bottomHeight: 0.38,
        yCenter: fusY,
        squareness: 0.35,
      },
      {
        z: 1.85,
        halfWidth: 0.5,
        topHeight: 0.44,
        bottomHeight: 0.38,
        yCenter: fusY - 0.02,
        squareness: 0.32,
      },
      {
        z: 2.85,
        halfWidth: 0.36,
        topHeight: 0.3,
        bottomHeight: 0.28,
        yCenter: fusY - 0.08,
        squareness: 0.2,
      },
      {
        z: 3.35,
        halfWidth: 0.18,
        topHeight: 0.16,
        bottomHeight: 0.16,
        yCenter: fusY - 0.14,
        squareness: 0.1,
      },
      {
        z: 3.62,
        halfWidth: 0.13,
        topHeight: 0.13,
        bottomHeight: 0.12,
        yCenter: fusY - 0.2,
      },
      {
        z: 3.88,
        halfWidth: 0.086,
        topHeight: 0.085,
        bottomHeight: 0.081,
        yCenter: fusY - 0.25,
      },
    ],
    22,
  );
  airframe.add(new THREE.Mesh(fusGeom, mats.tacticalGrey));

  // Straight low-mounted wings with drooped tips + underwing gear pods
  ([1, -1] as const).forEach((side) => {
    const innerWing = new THREE.Mesh(
      createWingGeometry({
        span: 3.18,
        rootChord: 1.48,
        tipChord: 0.98,
        sweepZ: -0.14,
        dihedralY: 0.12,
        rootThickness: 0.18,
        tipThickness: 0.11,
        camber: 0.02,
        side,
      }),
      mats.tacticalGrey,
    );
    innerWing.position.set(side * 0.48, fusY - 0.24, 0.25);
    airframe.add(innerWing);

    // Drooped aerodynamic wingtip fairing
    const tipFairing = new THREE.Mesh(
      fairing(0.19, 0.19, 0.96, mats.tacticalLight).geometry,
      mats.tacticalLight,
    );
    tipFairing.position.set(side * 3.68, fusY - 0.18, 0.11);
    tipFairing.rotation.z = side * 0.32;
    airframe.add(tipFairing);

    // Split deceleron airbrakes at wingtip trailing edge (mechanisms)
    const upperBrake = new THREE.Mesh(
      createWingGeometry({
        span: 0.74,
        rootChord: 0.29,
        tipChord: 0.23,
        sweepZ: -0.017,
        side,
        rootThickness: 0.029,
        tipThickness: 0.018,
      }),
      mats.tacticalLight,
    );
    upperBrake.position.set(side * 2.75, fusY - 0.118, -0.34);
    upperBrake.rotation.x = -0.12;
    mechanismsGroup.add(upperBrake);

    // Semi-retracted main wheel pod fairing under wing
    const podGeom = createLoftedFuselage(
      [
        { z: -0.55, halfWidth: 0.12, topHeight: 0.12, bottomHeight: 0.12 },
        { z: 0.1, halfWidth: 0.22, topHeight: 0.2, bottomHeight: 0.22 },
        { z: 0.72, halfWidth: 0.16, topHeight: 0.15, bottomHeight: 0.16 },
      ],
      14,
    );
    const gearPod = new THREE.Mesh(podGeom, mats.tacticalLight);
    gearPod.position.set(side * 1.38, fusY - 0.38, 0.35);
    mechanismsGroup.add(gearPod);

    // Underwing ordnance pylons
    [0.95, 1.95, 2.62].forEach((px, idx) => {
      const pylon = new THREE.Mesh(
        machined(0.08, 0.24, 0.68),
        mats.tacticalLight,
      );
      pylon.position.set(side * px, fusY - 0.38, 0.28);
      mechanismsGroup.add(pylon);

      if (idx === 0) {
        const maverick = buildGuidedMissile({
          length: 1.15,
          radius: 0.075,
          darkBody: true,
        });
        maverick.position.set(side * px, fusY - 0.56, 0.32);
        cannonGroup.add(maverick);
      } else if (idx === 1 && side > 0) {
        const hydra = buildRocketPod(0.15, 0.98);
        hydra.position.set(side * px, fusY - 0.56, 0.3);
        cannonGroup.add(hydra);
      } else if (idx === 2) {
        const hydra = buildRocketPod(0.14, 0.92);
        hydra.position.set(side * px, fusY - 0.54, 0.28);
        cannonGroup.add(hydra);
      }
    });
  });

  // SIGHT: AN/AAQ-28 LITENING Electro-Optical / Laser Targeting Pod on starboard station + Cockpit HUD
  const liteningGroup = new THREE.Group();
  liteningGroup.position.set(-1.95, fusY - 0.56, 0.38);

  const podTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 1.38, 16),
    mats.gunshipSlate,
  );
  podTube.rotation.x = Math.PI / 2;
  liteningGroup.add(podTube);

  const podSensor = buildOpticalSightTurret(0.13);
  podSensor.position.set(0, 0, 0.72);
  liteningGroup.add(podSensor);
  sightGroup.add(liteningGroup);

  // H-Tail: Wide horizontal tailplane + twin vertical tail fins
  const hTail = new THREE.Mesh(machined(2.65, 0.08, 0.82), mats.tacticalGrey);
  hTail.position.set(0, fusY + 0.16, -2.92);
  airframe.add(hTail);

  ([-1.32, 1.32] as const).forEach((tx) => {
    const vFin = new THREE.Mesh(
      createWingGeometry({
        span: 1.28,
        rootChord: 1.05,
        tipChord: 0.62,
        sweepZ: -0.22,
        rootThickness: 0.09,
        tipThickness: 0.05,
        camber: 0,
        side: 1,
      }),
      mats.tacticalGrey,
    );
    vFin.rotation.z = Math.PI / 2;
    vFin.position.set(tx, fusY + 0.05, -2.88);
    airframe.add(vFin);

    const rudder = new THREE.Mesh(
      machined(0.05, 1.12, 0.24),
      mats.tacticalLight,
    );
    rudder.position.set(tx, fusY + 0.66, -3.38);
    mechanismsGroup.add(rudder);
  });

  // THRUSTERS: Twin high-mounted rear General Electric TF34 Turbofan Pods
  ([-0.86, 0.86] as const).forEach((ex) => {
    // Angled engine pylon
    const pylon = new THREE.Mesh(
      fairing(0.57, 0.21, 1.16, mats.tacticalGrey, 0.48).geometry,
      mats.tacticalGrey,
    );
    pylon.position.set(ex * 0.56, fusY + 0.42, -1.28);
    pylon.rotation.z = ex > 0 ? 0.52 : -0.52;
    airframe.add(pylon);

    const tf34 = buildTurbofanPod({
      radius: 0.44,
      length: 1.62,
      bodyMaterial: mats.tacticalLight,
    });
    tf34.group.position.set(ex, fusY + 0.64, -1.25);
    tf34.group.rotation.x = -0.06;
    thrustersGroup.add(tf34.group);

    animatedParts.push({
      object: tf34.fanRotor,
      axis: "z",
      speed: ex > 0 ? 18 : -18,
      mode: "spin",
    });
  });

  addMark(airframe, "AF\n1032", 0.43, 0.28, 1.361, 1.94, -3.03);
  aerial(airframe, 0, 1.55, 0.45, 0.13);
  vent(airframe, 0.535, 1.17, 0.33, 0.35, 0.12);
  // Armored titanium cockpit bathtub + canopy + HUD sight
  const seat = buildEjectionSeat(0.95);
  seat.position.set(0, fusY + 0.34, 1.62);
  airframe.add(seat);

  const hud = buildHudSight(1.0);
  hud.position.set(0, fusY + 0.5, 2.22);
  sightGroup.add(hud);

  airframe.add(
    framedCanopy(
      [
        {
          z: 0.95,
          halfWidth: 0.28,
          topHeight: 0.24,
          bottomHeight: 0.02,
          yCenter: fusY + 0.42,
        },
        {
          z: 1.72,
          halfWidth: 0.34,
          topHeight: 0.42,
          bottomHeight: 0.02,
          yCenter: fusY + 0.41,
        },
        {
          z: 2.45,
          halfWidth: 0.26,
          topHeight: 0.26,
          bottomHeight: 0.02,
          yCenter: fusY + 0.34,
        },
      ],
      mats.tacticalGrey,
      [0.7],
      false,
      airframe.children[0] as THREE.Mesh,
    ),
  );

  // CANNON: Iconic 30mm 7-barrel GAU-8/A Avenger Rotary Cannon under nose
  const gau8 = buildRotaryCannon({
    barrelCount: 7,
    barrelLength: 1.18,
    barrelRadius: 0.022,
    clusterRadius: 0.075,
    receiverLength: 0.55,
    clampCount: 3,
  });
  gau8.group.position.set(0.05, fusY - 0.26, 2.95);
  gau8.group.rotation.x = 0.03;
  cannonGroup.add(gau8.group);
  animatedParts.push({
    object: gau8.barrelCluster,
    axis: "z",
    speed: 15,
    mode: "spin",
  });

  // MAGAZINE: Massive 1,174-round helical 30mm ammunition drum + linkless feed chute
  const ammoDrum = buildAmmoDrumMagazine({
    drumRadius: 0.34,
    drumLength: 0.86,
    axis: "z",
    chuteCurvePoints: [
      new THREE.Vector3(0.04, -0.08, 0.44),
      new THREE.Vector3(0.05, -0.14, 0.92),
      new THREE.Vector3(0.05, -0.1, 1.38),
    ],
  });
  ammoDrum.position.set(0, fusY - 0.14, 1.25);
  magazineGroup.add(ammoDrum);

  mechanismsGroup.add(flushHatch(fusGeom.userData.sections, 1.25, 0.86));

  // Landing gear resting on y = 0 (offset nose gear to clear GAU-8 cannon, just like real A-10!)
  const noseGear = buildWheeledLandingGear({
    strutHeight: fusY - 0.36 - 0.16,
    wheelRadius: 0.16,
  });
  noseGear.position.set(-0.18, fusY - 0.36, 2.45);
  mechanismsGroup.add(noseGear);

  ([-1.38, 1.38] as const).forEach((gx) => {
    const mainGear = buildWheeledLandingGear({
      strutHeight: fusY - 0.44 - 0.22,
      wheelRadius: 0.22,
    });
    mainGear.position.set(gx, fusY - 0.44, 0.12);
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
