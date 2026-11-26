import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAutocannon,
  buildEjectionSeat,
  buildGuidedMissile,
  buildHudSight,
  buildOpticalSightTurret,
  buildRocketPod,
  buildWheeledLandingGear,
  buildArticulatedRotorHead,
} from "../partBuilders";
import { createLoftedFuselage, createWingGeometry, fairing } from "../surfaces";
import { framedCanopy } from "../cockpits";
import { aerial, machined, attachment } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildKa52Alligator(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  const fusY = 1.06;

  // Wide shark-nose ("Alligator") fuselage + side-by-side cockpit + tapered tailboom
  const hullGeom = createLoftedFuselage(
    [
      {
        z: -3.45,
        halfWidth: 0.14,
        topHeight: 0.16,
        bottomHeight: 0.14,
        yCenter: fusY + 0.08,
      },
      {
        z: -1.9,
        halfWidth: 0.26,
        topHeight: 0.26,
        bottomHeight: 0.22,
        yCenter: fusY + 0.06,
      },
      {
        z: -0.75,
        halfWidth: 0.56,
        topHeight: 0.48,
        bottomHeight: 0.36,
        yCenter: fusY,
        squareness: 0.35,
      },
      {
        z: 0.85,
        halfWidth: 0.68,
        topHeight: 0.48,
        bottomHeight: 0.38,
        yCenter: fusY - 0.02,
        squareness: 0.32,
      },
      {
        z: 1.95,
        halfWidth: 0.62,
        topHeight: 0.32,
        bottomHeight: 0.28,
        yCenter: fusY - 0.08,
        chinePinch: 0.65,
      },
      {
        z: 2.85,
        halfWidth: 0.42,
        topHeight: 0.16,
        bottomHeight: 0.14,
        yCenter: fusY - 0.16,
        chinePinch: 0.8,
      },
      {
        z: 3.22,
        halfWidth: 0.12,
        topHeight: 0.06,
        bottomHeight: 0.05,
        yCenter: fusY - 0.18,
        chinePinch: 0.85,
      },
    ],
    22,
  );
  airframe.add(new THREE.Mesh(hullGeom, mats.kaSlate));

  // Side-by-side K-37 rocket-ejection seats + dual HUD sights + wide canopy
  ([-0.24, 0.24] as const).forEach((sx) => {
    const seat = buildEjectionSeat(0.78);
    seat.position.set(sx, fusY + 0.12, 1.25);
    airframe.add(seat);

    const hud = buildHudSight(0.76);
    hud.position.set(sx, fusY + 0.34, 1.78);
    sightGroup.add(hud);
  });

  airframe.add(
    framedCanopy(
      [
        {
          z: 0.45,
          halfWidth: 0.48,
          topHeight: 0.34,
          bottomHeight: 0.02,
          yCenter: fusY + 0.36,
          squareness: 0.3,
        },
        {
          z: 1.28,
          halfWidth: 0.56,
          topHeight: 0.42,
          bottomHeight: 0.02,
          yCenter: fusY + 0.34,
          squareness: 0.25,
        },
        {
          z: 2.08,
          halfWidth: 0.44,
          topHeight: 0.22,
          bottomHeight: 0.02,
          yCenter: fusY + 0.22,
          squareness: 0.2,
        },
      ],
      mats.kaSlate,
      [0.67],
      true,
      airframe.children[0] as THREE.Mesh,
    ),
  );

  const hull = airframe.children[0] as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  const finish = mats.kaSlate.clone();
  finish.vertexColors = true;
  finish.color.set(0xffffff);
  const paint: number[] = [],
    tint = new THREE.Color(),
    normals = hull.geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) {
    tint.lerpColors(
      mats.kaSlate.color,
      mats.kaBelly.color,
      THREE.MathUtils.smoothstep(-normals.getY(i), 0.37, 0.82),
    );
    paint.push(tint.r, tint.g, tint.b);
  }
  hull.geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(paint, 3),
  );
  hull.material = finish;
  addMark(airframe, "52", 0.36, 0.24, 0.671, 1.06, 0.66, Math.PI / 2, true);
  aerial(airframe, 0, 1.4, -1.55, 0.16);
  // SIGHT: Twin GOES-451 Spherical Electro-Optical / Laser Sights (Nose chin + Belly)
  const noseOptic = buildOpticalSightTurret(0.17);
  noseOptic.position.set(0.18, fusY - 0.34, 2.55);
  sightGroup.add(noseOptic);

  const bellyOptic = buildOpticalSightTurret(0.15);
  bellyOptic.position.set(0, fusY - 0.5, 1.48);
  sightGroup.add(bellyOptic);

  // THRUSTERS: Twin Klimov VK-2500 Turboshafts with dust-protection domes & angled exhausts
  ([-0.68, 0.68] as const).forEach((ex) => {
    const eng = new THREE.Group();
    eng.position.set(ex, fusY + 0.34, -0.22);

    const cowling = new THREE.Mesh(
      fairing(0.48, 0.48, 1.67, mats.kaSlate).geometry,
      mats.kaSlate,
    );
    cowling.rotation.x = 0;
    eng.add(cowling);

    const fmsDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10),
      mats.titanium,
    );
    fmsDome.position.z = 0.72;
    eng.add(fmsDome);

    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.2, 0.38, 14),
      mats.burntTitanium,
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.rotation.y = ex > 0 ? 0.35 : -0.35;
    exhaust.position.set(ex > 0 ? 0.08 : -0.08, 0.02, -0.82);
    eng.add(exhaust);

    thrustersGroup.add(eng);
  });

  // Stub wings with 6 weapon stations + wingtip President-S defense pods
  ([1, -1] as const).forEach((side) => {
    const wing = new THREE.Mesh(
      createWingGeometry({
        span: 1.62,
        rootChord: 0.76,
        tipChord: 0.44,
        sweepZ: -0.1,
        dihedralY: -0.08,
        rootThickness: 0.11,
        tipThickness: 0.065,
        camber: 0.015,
        side,
      }),
      mats.kaSlate,
    );
    wing.position.set(side * 0.56, fusY - 0.02, 0.08);
    airframe.add(wing);

    const tipPod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.72, 12),
      mats.kaBelly,
    );
    tipPod.rotation.x = Math.PI / 2;
    tipPod.position.set(side * 2.18, fusY - 0.1, 0);
    airframe.add(tipPod);

    // Rocket pod (inboard) + 6-tube 9K121 Vikhr ATGM cluster (outboard)
    const b8v20 = buildRocketPod(0.17, 1.06);
    b8v20.position.set(side * 1.18, fusY - 0.26, 0.08);
    cannonGroup.add(b8v20);

    for (let v = 0; v < 3; v++) {
      const vikhr = buildGuidedMissile({
        length: 1.08,
        radius: 0.044,
        darkBody: true,
      });
      vikhr.position.set(side * 1.72 + (v - 1) * 0.1, fusY - 0.28, 0.08);
      cannonGroup.add(vikhr);
    }
  });

  // Tail unit: Central vertical fin + horizontal tailplane with twin endplate fins (no tail rotor!)
  const centerFin = new THREE.Mesh(
    createWingGeometry({
      span: 1.15,
      rootChord: 0.98,
      tipChord: 0.52,
      sweepZ: -0.38,
      rootThickness: 0.09,
      tipThickness: 0.05,
      camber: 0,
      side: 1,
    }),
    mats.kaSlate,
  );
  centerFin.rotation.z = Math.PI / 2;
  centerFin.position.set(0, fusY + 0.12, -3.12);
  airframe.add(centerFin);

  const hPlane = new THREE.Mesh(machined(1.75, 0.05, 0.44), mats.kaSlate);
  hPlane.position.set(0, fusY + 0.16, -3.18);
  airframe.add(hPlane);

  ([-0.88, 0.88] as const).forEach((fx) => {
    const endFin = new THREE.Mesh(machined(0.045, 0.62, 0.46), mats.kaSlate);
    endFin.position.set(fx, fusY + 0.22, -3.22);
    airframe.add(endFin);
  });

  // CANNON: Starboard-side (-X) Shipunov 2A42 30mm Heavy Autocannon
  const shipunov = buildAutocannon({
    barrelLength: 1.48,
    caliberRadius: 0.032,
    breechLength: 0.52,
    hasCoolingJacket: true,
    hasMuzzleBrake: true,
  });
  shipunov.position.set(-0.74, fusY - 0.12, 0.52);
  cannonGroup.add(shipunov);

  // Hydraulic elevation sector arm (mechanisms)
  const sectorMount = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14),
    mats.titanium,
  );
  sectorMount.rotation.z = Math.PI / 2;
  sectorMount.position.set(-0.66, fusY - 0.12, 0.35);
  mechanismsGroup.add(sectorMount);

  // MAGAZINE: Dual Selective-Feed AP & HE-Frag 30mm Ammunition Boxes + Twin Belt Chutes
  ([-0.15, 0.32] as const).forEach((bz) => {
    const ammoBox = new THREE.Mesh(machined(0.24, 0.32, 0.36), mats.gunmetal);
    ammoBox.position.set(-0.64, fusY + 0.14, bz);
    magazineGroup.add(ammoBox);

    const brassBelt = new THREE.Mesh(machined(0.08, 0.22, 0.14), mats.brass);
    brassBelt.position.set(-0.72, fusY + 0.01, bz + 0.08);
    brassBelt.rotation.z = 0.28;
    magazineGroup.add(brassBelt);
  });

  // MECHANISMS: Coaxial Counter-Rotating Twin 3-Blade Main Rotors!
  const mastFairing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.34, 0.42, 16),
    mats.kaSlate,
  );
  mastFairing.position.set(0, fusY + 0.62, 0.05);
  airframe.add(mastFairing);

  const lowerRotor = buildArticulatedRotorHead({
    bladeCount: 3,
    rotorRadius: 3.22,
    bladeChord: 0.25,
    mastHeight: 0.48,
  });
  lowerRotor.group.position.set(0, fusY + 0.78, 0.05);
  mechanismsGroup.add(lowerRotor.group);

  const upperRotor = buildArticulatedRotorHead({
    bladeCount: 3,
    rotorRadius: 3.22,
    bladeChord: 0.25,
    mastHeight: 0.68,
  });
  upperRotor.group.position.set(0, fusY + 1.28, 0.05);
  mechanismsGroup.add(upperRotor.group);

  animatedParts.push(
    { object: lowerRotor.spinningHead, axis: "y", speed: 13.5, mode: "spin" },
    { object: upperRotor.spinningHead, axis: "y", speed: -13.5, mode: "spin" },
  );

  // Retractable tricycle landing gear resting on y = 0
  const noseGear = buildWheeledLandingGear({
    strutHeight: fusY - 0.34 - 0.13,
    wheelRadius: 0.13,
    dualWheel: true,
  });
  noseGear.position.set(0, fusY - 0.34, 2.18);
  mechanismsGroup.add(noseGear);

  ([-0.86, 0.86] as const).forEach((gx) => {
    const mainGear = buildWheeledLandingGear({
      strutHeight: fusY - 0.28 - 0.2,
      wheelRadius: 0.2,
    });
    mainGear.position.set(gx, fusY - 0.28, -0.35);
    attachment(
      mechanismsGroup,
      [gx * 0.59, fusY - 0.08, -0.27],
      [gx, fusY - 0.37, -0.35],
      0.069,
      mats.kaSlate,
    );
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
