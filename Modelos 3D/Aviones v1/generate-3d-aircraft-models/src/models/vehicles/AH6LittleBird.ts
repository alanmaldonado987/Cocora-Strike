import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAmmoDrumMagazine,
  buildEjectionSeat,
  buildHudSight,
  buildOpticalSightTurret,
  buildRocketPod,
  buildRotaryCannon,
  buildArticulatedRotorHead,
} from "../partBuilders";
import { createWingGeometry } from "../surfaces";
import { glazedHull } from "../cockpits";
import { aerial, machined } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildAH6LittleBird(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  const fusY = 1.08;

  // Iconic ovoid "Egg" fuselage transitioning into slender high tailboom
  airframe.add(
    glazedHull(
      [
        {
          z: -0.95,
          halfWidth: 0.22,
          topHeight: 0.34,
          bottomHeight: 0.22,
          yCenter: fusY + 0.12,
        },
        {
          z: -0.25,
          halfWidth: 0.62,
          topHeight: 0.66,
          bottomHeight: 0.52,
          yCenter: fusY,
        },
        {
          z: 0.55,
          halfWidth: 0.68,
          topHeight: 0.68,
          bottomHeight: 0.56,
          yCenter: fusY - 0.02,
        },
        {
          z: 1.25,
          halfWidth: 0.56,
          topHeight: 0.52,
          bottomHeight: 0.46,
          yCenter: fusY - 0.08,
        },
        {
          z: 1.65,
          halfWidth: 0.31,
          topHeight: 0.28,
          bottomHeight: 0.26,
          yCenter: fusY - 0.16,
        },
        {
          z: 1.81,
          halfWidth: 0.035,
          topHeight: 0.035,
          bottomHeight: 0.028,
          yCenter: fusY - 0.16,
        },
      ],
      mats.specOpsBlack,
      { rear: [0.78, -0.06], front: [1.785, 1.58], angle: 1.99, divisions: 4 },
    ),
  );
  addMark(airframe, "063", 0.26, 0.15, 0.655, 0.91, 0.24, Math.PI / 2, true);
  aerial(airframe, 0, 1.68, -0.18, 0.16);
  ([-0.22, 0.22] as const).forEach((px) => {
    const seat = buildEjectionSeat(0.68);
    seat.position.set(px, fusY - 0.22, 0.86);
    airframe.add(seat);
  });

  const hud = buildHudSight(0.75);
  hud.position.set(-0.22, fusY + 0.08, 1.32);
  sightGroup.add(hud);

  // Slender high-mounted tubular tailboom + T-tail stabilizer
  const tailBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.14, 2.58, 14),
    mats.specOpsBlack,
  );
  tailBoom.rotation.x = Math.PI / 2;
  tailBoom.position.set(0, fusY + 0.34, -2.05);
  airframe.add(tailBoom);

  const vFin = new THREE.Mesh(
    createWingGeometry({
      span: 0.96,
      rootChord: 0.46,
      tipChord: 0.26,
      sweepZ: -0.24,
      rootThickness: 0.055,
      tipThickness: 0.03,
      camber: 0,
      side: 1,
    }),
    mats.specOpsBlack,
  );
  vFin.rotation.z = Math.PI / 2;
  vFin.position.set(0, fusY + 0.2, -3.22);
  airframe.add(vFin);

  // Ventral tail skid fin
  const ventralFin = new THREE.Mesh(
    machined(0.035, 0.48, 0.32),
    mats.specOpsBlack,
  );
  ventralFin.position.set(0, fusY + 0.06, -3.18);
  ventralFin.rotation.x = -0.35;
  airframe.add(ventralFin);

  // T-tail top horizontal stabilizer with endplates
  const tStab = new THREE.Mesh(machined(1.12, 0.04, 0.28), mats.specOpsBlack);
  tStab.position.set(0, fusY + 1.14, -3.46);
  airframe.add(tStab);

  // SIGHT: Nose-chin AN/AAQ-22 Star SAFIRE FLIR Electro-Optical Ball
  const flirBall = buildOpticalSightTurret(0.16);
  flirBall.position.set(0, fusY - 0.52, 1.56);
  sightGroup.add(flirBall);

  // THRUSTERS: Rolls-Royce T63 / Allison 250 Angled Rear Turboshaft Exhaust + Clamshell Intakes
  const exhaustPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.18, 0.56, 16),
    mats.burntTitanium,
  );
  exhaustPipe.rotation.x = Math.PI / 2 - 0.32;
  exhaustPipe.position.set(0, fusY - 0.08, -1.04);
  thrustersGroup.add(exhaustPipe);

  const innerTurbineGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12),
    mats.afterburnerAmber,
  );
  innerTurbineGlow.rotation.x = Math.PI / 2 - 0.32;
  innerTurbineGlow.position.set(0, fusY - 0.14, -1.24);
  thrustersGroup.add(innerTurbineGlow);

  ([-0.24, 0.24] as const).forEach((ix) => {
    const scoop = new THREE.Mesh(machined(0.18, 0.14, 0.42), mats.gunmetal);
    scoop.position.set(ix, fusY + 0.58, -0.35);
    thrustersGroup.add(scoop);
  });

  // MECHANISMS: 5-Blade Articulated Main Rotor + 2/4-Blade Tail Rotor + Tubular Landing Skids
  const mainRotor = buildArticulatedRotorHead({
    bladeCount: 5,
    rotorRadius: 2.68,
    bladeChord: 0.18,
    mastHeight: 0.48,
  });
  mainRotor.group.position.set(0, fusY + 0.64, 0.32);
  mechanismsGroup.add(mainRotor.group);

  animatedParts.push({
    object: mainRotor.spinningHead,
    axis: "y",
    speed: 16,
    mode: "spin",
  });

  // 4-blade tail rotor on port side of tailboom
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.14, fusY + 0.34, -3.28);

  const trHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10),
    mats.chrome,
  );
  trHub.rotation.z = Math.PI / 2;
  tailRotor.add(trHub);

  for (let i = 0; i < 4; i++) {
    const holder = new THREE.Group();
    holder.rotation.x = (i / 4) * Math.PI * 2;
    const blade = new THREE.Mesh(machined(0.02, 0.52, 0.09), mats.titanium);
    blade.position.y = 0.28;
    holder.add(blade);
    tailRotor.add(holder);
  }
  mechanismsGroup.add(tailRotor);
  animatedParts.push({ object: tailRotor, axis: "x", speed: 26, mode: "spin" });

  // Tubular landing skids resting cleanly on y = 0 + cross-tubes
  ([-0.78, 0.78] as const).forEach((sx) => {
    const skidRunner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 2.45, 10),
      mats.titanium,
    );
    skidRunner.rotation.x = Math.PI / 2;
    skidRunner.position.set(sx, 0.036, 0.45);
    mechanismsGroup.add(skidRunner);

    // Upturned front skid toe
    const skidToe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.03, 0.34, 10),
      mats.titanium,
    );
    skidToe.position.set(sx, 0.11, 1.78);
    skidToe.rotation.x = -1.12;
    mechanismsGroup.add(skidToe);

    // Angled front & rear skid struts
    [-0.12, 1.05].forEach((sz) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8),
        mats.gunmetal,
      );
      leg.position.set(sx * 0.76, 0.34, sz);
      leg.rotation.z = sx > 0 ? 0.42 : -0.42;
      mechanismsGroup.add(leg);
    });
  });

  // Universal Weapons Plank across lower fuselage
  const weaponsPlank = new THREE.Mesh(
    machined(2.58, 0.07, 0.34),
    mats.gunmetal,
  );
  weaponsPlank.position.set(0, fusY - 0.46, 0.35);
  mechanismsGroup.add(weaponsPlank);

  // CANNON: Twin M134 7.62mm 6-Barrel Rotary Miniguns (inboard) + Twin 7-Tube Hydra Rocket Pods (outboard)
  ([-1, 1] as const).forEach((side) => {
    const m134 = buildRotaryCannon({
      barrelCount: 6,
      barrelLength: 0.76,
      barrelRadius: 0.014,
      clusterRadius: 0.044,
      receiverLength: 0.3,
      clampCount: 2,
    });
    m134.group.position.set(side * 0.84, fusY - 0.56, 0.45);
    cannonGroup.add(m134.group);
    animatedParts.push({
      object: m134.barrelCluster,
      axis: "z",
      speed: 22,
      mode: "spin",
    });

    const m260 = buildRocketPod(0.13, 0.88);
    m260.position.set(side * 1.22, fusY - 0.56, 0.36);
    cannonGroup.add(m260);
  });

  // MAGAZINE: Large Dual Rear-Cabin 6,000-Round Ammo Tank + Twin Flexible Belt Chutes Out Both Doors
  const centralTank = buildAmmoDrumMagazine({
    drumRadius: 0.24,
    drumLength: 0.82,
    axis: "x",
  });
  centralTank.position.set(0, fusY - 0.14, 0.08);
  magazineGroup.add(centralTank);

  ([-1, 1] as const).forEach((side) => {
    const chuteCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.38, fusY - 0.16, 0.08),
      new THREE.Vector3(side * 0.72, fusY - 0.26, 0.18),
      new THREE.Vector3(side * 0.84, fusY - 0.48, 0.32),
    ]);
    const chute = new THREE.Mesh(
      new THREE.TubeGeometry(chuteCurve, 14, 0.042, 8, false),
      mats.titanium,
    );
    magazineGroup.add(chute);

    // Visible brass rounds entering receiver
    for (let k = 1; k <= 4; k++) {
      const pt = chuteCurve.getPointAt(k / 5);
      const round = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.09, 6),
        mats.brass,
      );
      round.position.copy(pt);
      round.rotation.z = Math.PI / 2;
      magazineGroup.add(round);
    }
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
