import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAmmoDrumMagazine,
  buildEjectionSeat,
  buildHudSight,
  buildOpticalSightTurret,
  buildRotaryCannon,
  buildWheeledLandingGear,
  buildArticulatedRotorHead,
} from "../partBuilders";
import { createLoftedFuselage, fairing } from "../surfaces";
import { glazedHull } from "../cockpits";
import { aerial, machined } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildCH47Chinook(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  const fusY = 1.14;

  // Boxy crowned heavy-lift cabin fuselage
  airframe.add(
    glazedHull(
      [
        {
          z: -2.85,
          halfWidth: 0.64,
          topHeight: 0.62,
          bottomHeight: 0.42,
          yCenter: fusY + 0.12,
          squareness: 0.72,
        },
        {
          z: -2.1,
          halfWidth: 0.74,
          topHeight: 0.68,
          bottomHeight: 0.62,
          yCenter: fusY,
          squareness: 0.76,
        },
        {
          z: 1.85,
          halfWidth: 0.74,
          topHeight: 0.68,
          bottomHeight: 0.62,
          yCenter: fusY,
          squareness: 0.76,
        },
        {
          z: 2.58,
          halfWidth: 0.66,
          topHeight: 0.56,
          bottomHeight: 0.54,
          yCenter: fusY - 0.04,
          squareness: 0.55,
        },
        {
          z: 3.12,
          halfWidth: 0.38,
          topHeight: 0.28,
          bottomHeight: 0.34,
          yCenter: fusY - 0.18,
          squareness: 0.3,
        },
      ],
      mats.chinookSage,
      {
        rear: [2.12, 1.85],
        front: [3.045, 2.86],
        angle: 1.82,
        divisions: 6,
        portholes: [-1.25, -0.45, 0.35],
      },
    ),
  );

  // Dorsal synchronization shaft tunnel running between front & rear pylons
  const syncTunnel = new THREE.Mesh(
    fairing(0.42, 0.28, 4.7, mats.chinookSage, 0.45).geometry,
    mats.chinookSage,
  );
  syncTunnel.position.set(0, fusY + 0.74, -0.15);
  airframe.add(syncTunnel);

  // Forward Rotor Pylon + Taller Rear Rotor Pylon
  const fwdPylon = new THREE.Mesh(
    createLoftedFuselage(
      [
        {
          z: 0.91,
          halfWidth: 0.055,
          topHeight: 0.035,
          bottomHeight: 0.07,
          yCenter: fusY + 0.66,
        },
        {
          z: 1.62,
          halfWidth: 0.34,
          topHeight: 0.52,
          bottomHeight: 0.05,
          yCenter: fusY + 0.66,
          squareness: 0.4,
        },
        {
          z: 2.15,
          halfWidth: 0.36,
          topHeight: 0.62,
          bottomHeight: 0.05,
          yCenter: fusY + 0.66,
          squareness: 0.35,
        },
        {
          z: 2.48,
          halfWidth: 0.24,
          topHeight: 0.29,
          bottomHeight: 0.05,
          yCenter: fusY + 0.66,
          squareness: 0.3,
        },
        {
          z: 2.6,
          halfWidth: 0.065,
          topHeight: 0.04,
          bottomHeight: 0.09,
          yCenter: fusY + 0.5,
        },
      ],
      16,
    ),
    mats.chinookSage,
  );
  airframe.add(fwdPylon);

  const aftPylon = new THREE.Mesh(
    createLoftedFuselage(
      [
        {
          z: -3.04,
          halfWidth: 0.1,
          topHeight: 0.81,
          bottomHeight: 0.24,
          yCenter: fusY + 0.61,
        },
        {
          z: -2.92,
          halfWidth: 0.26,
          topHeight: 1.08,
          bottomHeight: 0.05,
          yCenter: fusY + 0.62,
          squareness: 0.35,
        },
        {
          z: -2.35,
          halfWidth: 0.42,
          topHeight: 1.12,
          bottomHeight: 0.05,
          yCenter: fusY + 0.62,
          squareness: 0.4,
        },
        {
          z: -1.45,
          halfWidth: 0.36,
          topHeight: 0.25,
          bottomHeight: 0.05,
          yCenter: fusY + 0.62,
          squareness: 0.4,
        },
        {
          z: -1.03,
          halfWidth: 0.09,
          topHeight: 0.055,
          bottomHeight: 0.1,
          yCenter: fusY + 0.67,
        },
      ],
      16,
    ),
    mats.chinookSage,
  );
  airframe.add(aftPylon);

  // Side lower fuel sponsons & round cabin windows
  ([-0.82, 0.82] as const).forEach((sx) => {
    const sponson = new THREE.Mesh(
      createLoftedFuselage(
        [
          { z: -2.05, halfWidth: 0.14, topHeight: 0.16, bottomHeight: 0.16 },
          {
            z: -1.2,
            halfWidth: 0.26,
            topHeight: 0.28,
            bottomHeight: 0.28,
            squareness: 0.45,
          },
          {
            z: 1.35,
            halfWidth: 0.26,
            topHeight: 0.28,
            bottomHeight: 0.28,
            squareness: 0.45,
          },
          { z: 2.05, halfWidth: 0.12, topHeight: 0.14, bottomHeight: 0.14 },
        ],
        14,
      ),
      mats.chinookSage,
    );
    sponson.position.set(sx, fusY - 0.42, -0.25);
    airframe.add(sponson);
  });
  addMark(
    airframe,
    "U.S. ARMY",
    0.93,
    0.2,
    0.743,
    1.1,
    0.24,
    Math.PI / 2,
    true,
  );
  aerial(airframe, 0, 1.99, 0.78, 0.16);

  ([-0.28, 0.28] as const).forEach((hx) => {
    const seat = buildEjectionSeat(0.75);
    seat.position.set(hx, fusY - 0.08, 2.28);
    airframe.add(seat);

    const hud = buildHudSight(0.75);
    hud.position.set(hx, fusY + 0.18, 2.66);
    sightGroup.add(hud);
  });

  // SIGHT: Nose weather radar pod & ventral AN/AAQ-24 / FLIR electro-optical turret
  const radarNose = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    mats.apacheDark,
  );
  radarNose.position.set(0, fusY - 0.22, 3.16);
  sightGroup.add(radarNose);

  const flirChin = buildOpticalSightTurret(0.16);
  flirChin.position.set(0.32, fusY - 0.56, 2.68);
  sightGroup.add(flirChin);

  // THRUSTERS: Twin Honeywell T55-GA-714A Turboshafts flanking the rear rotor pylon
  ([-0.68, 0.68] as const).forEach((ex) => {
    const t55 = new THREE.Group();
    t55.position.set(ex, fusY + 0.92, -2.18);

    const body = new THREE.Mesh(
      fairing(0.52, 0.48, 1.51, mats.chinookSage).geometry,
      mats.chinookSage,
    );
    body.rotation.x = 0;
    t55.add(body);

    const meshScreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 14, 10),
      mats.titanium,
    );
    meshScreen.position.z = 0.68;
    t55.add(meshScreen);

    const exhaustPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.21, 0.42, 14),
      mats.burntTitanium,
    );
    exhaustPipe.rotation.x = Math.PI / 2;
    exhaustPipe.position.z = -0.82;
    t55.add(exhaustPipe);

    thrustersGroup.add(t55);
  });

  // CANNON & MAGAZINE: Twin forward crew-window M134 6-barrel Miniguns + Cabin Ammo Hoppers
  ([-1, 1] as const).forEach((side) => {
    // Open crew gunner window frame
    const gunPort = new THREE.Mesh(
      machined(0.08, 0.42, 0.48),
      mats.cockpitInterior,
    );
    gunPort.position.set(side * 0.72, fusY + 0.14, 1.28);
    airframe.add(gunPort);

    const minigun = buildRotaryCannon({
      barrelCount: 6,
      barrelLength: 0.68,
      barrelRadius: 0.013,
      clusterRadius: 0.042,
      receiverLength: 0.28,
      clampCount: 2,
    });
    minigun.group.position.set(side * 0.74, fusY + 0.08, 1.32);
    minigun.group.rotation.order = "YXZ";
    minigun.group.rotation.y = side * 0.78;
    minigun.group.rotation.x = 0.16;
    cannonGroup.add(minigun.group);

    animatedParts.push({
      object: minigun.barrelCluster,
      axis: "z",
      speed: 18,
      mode: "spin",
    });

    // 4,000-round ammo canister & flexible belt chute
    const hopper = buildAmmoDrumMagazine({
      drumRadius: 0.17,
      drumLength: 0.42,
      axis: "y",
      chuteCurvePoints: [
        new THREE.Vector3(0, 0.18, 0),
        new THREE.Vector3(side * 0.14, 0.26, 0.06),
        new THREE.Vector3(side * 0.24, 0.22, 0.1),
      ],
    });
    hopper.position.set(side * 0.52, fusY - 0.14, 1.22);
    magazineGroup.add(hopper);
  });

  // MECHANISMS: Synchronized Tandem Counter-Rotating Twin 3-Blade Heavy Rotors + Rear Assault Ramp + Quad Gear
  const fwdRotor = buildArticulatedRotorHead({
    bladeCount: 3,
    rotorRadius: 2.95,
    bladeChord: 0.26,
    mastHeight: 0.45,
  });
  fwdRotor.group.position.set(0, fusY + 1.24, 2.08);
  fwdRotor.group.rotation.x = 0.07; // characteristic forward tilt
  mechanismsGroup.add(fwdRotor.group);

  const aftRotor = buildArticulatedRotorHead({
    bladeCount: 3,
    rotorRadius: 2.95,
    bladeChord: 0.26,
    mastHeight: 0.45,
  });
  aftRotor.group.position.set(0, fusY + 1.72, -2.38);
  aftRotor.group.rotation.x = 0.04;
  aftRotor.spinningHead.rotation.y = Math.PI / 3; // phase offset for intermeshing synchronization!
  mechanismsGroup.add(aftRotor.group);

  animatedParts.push(
    { object: fwdRotor.spinningHead, axis: "y", speed: 12.5, mode: "spin" },
    { object: aftRotor.spinningHead, axis: "y", speed: -12.5, mode: "spin" },
  );

  // Lowered hydraulic rear cargo ramp
  const rearRamp = new THREE.Mesh(machined(1.12, 0.06, 1.05), mats.chinookSage);
  rearRamp.position.set(0, fusY - 0.48, -3.12);
  rearRamp.rotation.x = -0.26;
  mechanismsGroup.add(rearRamp);

  // Quad wheeled landing gear resting on y = 0
  ([-0.94, 0.94] as const).forEach((gx) => {
    const fwdGear = buildWheeledLandingGear({
      strutHeight: fusY - 0.54 - 0.17,
      wheelRadius: 0.17,
      dualWheel: true,
    });
    fwdGear.position.set(gx, fusY - 0.54, 1.18);
    mechanismsGroup.add(fwdGear);

    const aftGear = buildWheeledLandingGear({
      strutHeight: fusY - 0.54 - 0.17,
      wheelRadius: 0.17,
    });
    aftGear.position.set(gx, fusY - 0.54, -1.78);
    mechanismsGroup.add(aftGear);
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
