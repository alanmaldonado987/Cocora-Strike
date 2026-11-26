import * as THREE from "three";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAmmoDrumMagazine,
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
import { aerial, machined, vent, attachment } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildAH64Apache(): BuiltModelResult {
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

  // Faceted armored fuselage + tapered tailboom
  const bodyGeom = createLoftedFuselage(
    [
      {
        z: -3.65,
        halfWidth: 0.12,
        topHeight: 0.14,
        bottomHeight: 0.12,
        yCenter: fusY + 0.08,
        squareness: 0.4,
      },
      {
        z: -2.1,
        halfWidth: 0.22,
        topHeight: 0.24,
        bottomHeight: 0.2,
        yCenter: fusY + 0.06,
        squareness: 0.45,
      },
      {
        z: -0.95,
        halfWidth: 0.42,
        topHeight: 0.44,
        bottomHeight: 0.34,
        yCenter: fusY + 0.04,
        squareness: 0.55,
      },
      {
        z: 0.45,
        halfWidth: 0.48,
        topHeight: 0.52,
        bottomHeight: 0.38,
        yCenter: fusY,
        squareness: 0.6,
      },
      {
        z: 1.75,
        halfWidth: 0.44,
        topHeight: 0.38,
        bottomHeight: 0.34,
        yCenter: fusY - 0.04,
        squareness: 0.58,
      },
      {
        z: 2.58,
        halfWidth: 0.28,
        topHeight: 0.2,
        bottomHeight: 0.22,
        yCenter: fusY - 0.12,
        squareness: 0.45,
      },
    ],
    18,
    true,
  );
  airframe.add(new THREE.Mesh(bodyGeom, mats.apacheOlive));

  // Extended Forward Avionics Bays (EFABS cheek fairings)
  ([-0.54, 0.54] as const).forEach((cx) => {
    const cheek = new THREE.Mesh(
      fairing(0.39, 0.36, 2.34, mats.apacheDark, 0.61).geometry,
      mats.apacheDark,
    );
    cheek.position.set(cx, fusY - 0.14, 0.95);
    airframe.add(cheek);
  });

  // Stepped tandem flat-plate armored canopy (front gunner + raised rear pilot)
  const gunnerSeat = buildEjectionSeat(0.78);
  gunnerSeat.position.set(0, fusY + 0.08, 1.72);
  airframe.add(gunnerSeat);

  const pilotSeat = buildEjectionSeat(0.8);
  pilotSeat.position.set(0, fusY + 0.26, 0.85);
  airframe.add(pilotSeat);

  const hud = buildHudSight(0.82);
  hud.position.set(0, fusY + 0.36, 2.08);
  sightGroup.add(hud);

  airframe.add(
    framedCanopy(
      [
        {
          z: 0.28,
          halfWidth: 0.26,
          topHeight: 0.32,
          bottomHeight: 0.02,
          yCenter: fusY + 0.42,
          squareness: 0.75,
        },
        {
          z: 1.05,
          halfWidth: 0.32,
          topHeight: 0.44,
          bottomHeight: 0.02,
          yCenter: fusY + 0.42,
          squareness: 0.8,
        },
        {
          z: 1.48,
          halfWidth: 0.3,
          topHeight: 0.3,
          bottomHeight: 0.02,
          yCenter: fusY + 0.34,
          squareness: 0.8,
        },
        {
          z: 2.18,
          halfWidth: 0.26,
          topHeight: 0.26,
          bottomHeight: 0.02,
          yCenter: fusY + 0.28,
          squareness: 0.8,
        },
        {
          z: 2.48,
          halfWidth: 0.16,
          topHeight: 0.06,
          bottomHeight: 0.01,
          yCenter: fusY + 0.14,
          squareness: 0.8,
        },
      ],
      mats.apacheDark,
      [0.39, 0.66],
      true,
      airframe.children[0] as THREE.Mesh,
    ),
  );

  // Canopy anti-wire strike cutter & armored frame bars
  const wireCutter = new THREE.Mesh(machined(0.025, 0.28, 0.06), mats.gunmetal);
  wireCutter.position.set(0, fusY + 0.78, 1.15);
  wireCutter.rotation.x = 0.4;
  mechanismsGroup.add(wireCutter);

  aerial(airframe, 0, 1.41, -1.48, 0.18);
  addMark(
    airframe,
    "UNITED STATES ARMY",
    0.85,
    0.13,
    0.2,
    1.2,
    -2.14,
    Math.PI / 2,
    true,
  );
  vent(airframe, 0.63, 1.12, 0.95, 0.35, 0.095);
  // SIGHT: Nose-mounted AN/ASQ-170 TADS / PNVS Dual Electro-Optical Turret
  const tadsContainer = new THREE.Group();
  tadsContainer.position.set(0, fusY - 0.14, 2.75);

  const tadsDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.48, 16),
    mats.apacheDark,
  );
  tadsDrum.rotation.z = Math.PI / 2;
  tadsContainer.add(tadsDrum);

  const tadsSensor = buildOpticalSightTurret(0.18);
  tadsSensor.position.set(0, 0, 0.12);
  tadsContainer.add(tadsSensor);

  // Upper PNVS night-vision turret
  const pnvs = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.16, 14),
    mats.gunmetal,
  );
  pnvs.position.set(0, 0.24, 0.02);
  tadsContainer.add(pnvs);

  const pnvsWindow = new THREE.Mesh(
    machined(0.14, 0.09, 0.06),
    mats.opticAmber,
  );
  pnvsWindow.position.set(0, 0.24, 0.14);
  tadsContainer.add(pnvsWindow);

  sightGroup.add(tadsContainer);

  // THRUSTERS: Twin GE T700 Turboshaft Engine Nacelles + Black-Hole IR Suppressor Exhausts
  ([-0.58, 0.58] as const).forEach((ex) => {
    const engGroup = new THREE.Group();
    engGroup.position.set(ex, fusY + 0.36, -0.18);

    const pod = new THREE.Mesh(
      createLoftedFuselage(
        [
          {
            z: -0.78,
            halfWidth: 0.2,
            topHeight: 0.18,
            bottomHeight: 0.18,
            squareness: 0.5,
          },
          {
            z: 0,
            halfWidth: 0.24,
            topHeight: 0.24,
            bottomHeight: 0.24,
            squareness: 0.4,
          },
          {
            z: 0.68,
            halfWidth: 0.21,
            topHeight: 0.21,
            bottomHeight: 0.21,
            squareness: 0.3,
          },
        ],
        16,
      ),
      mats.apacheOlive,
    );
    engGroup.add(pod);

    const intakeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.032, 8, 18),
      mats.titanium,
    );
    intakeRing.position.z = 0.68;
    engGroup.add(intakeRing);

    const intakeBullet = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 12),
      mats.chrome,
    );
    intakeBullet.rotation.x = Math.PI / 2;
    intakeBullet.position.z = 0.72;
    engGroup.add(intakeBullet);

    // Upturned IR-suppressed "Black Hole" exhaust duct
    const irExhaust = new THREE.Mesh(
      machined(0.32, 0.24, 0.44),
      mats.burntTitanium,
    );
    irExhaust.position.set(ex > 0 ? 0.05 : -0.05, 0.08, -0.86);
    irExhaust.rotation.x = 0.28;
    engGroup.add(irExhaust);

    thrustersGroup.add(engGroup);
  });

  // Stub wings + Hydra-70 rocket pods + Quad AGM-114 Hellfire racks
  ([1, -1] as const).forEach((side) => {
    const stubWing = new THREE.Mesh(
      createWingGeometry({
        span: 1.32,
        rootChord: 0.72,
        tipChord: 0.46,
        sweepZ: -0.08,
        dihedralY: -0.06,
        rootThickness: 0.11,
        tipThickness: 0.07,
        camber: 0.015,
        side,
      }),
      mats.apacheOlive,
    );
    stubWing.position.set(side * 0.46, fusY + 0.02, 0.15);
    airframe.add(stubWing);

    // Wingtip chaff/sensor pod
    const tipPod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.56, 10),
      mats.apacheDark,
    );
    tipPod.rotation.x = Math.PI / 2;
    tipPod.position.set(side * 1.78, fusY - 0.04, 0.08);
    airframe.add(tipPod);

    // Outboard Hydra-70 19-tube rocket pod
    const hydra = buildRocketPod(0.16, 1.02);
    hydra.position.set(side * 1.42, fusY - 0.24, 0.14);
    cannonGroup.add(hydra);

    // Inboard Quad Hellfire rack (2x2 missiles)
    const rack = new THREE.Mesh(machined(0.28, 0.18, 0.55), mats.gunmetal);
    rack.position.set(side * 0.92, fusY - 0.18, 0.15);
    mechanismsGroup.add(rack);

    [-0.12, 0.12].forEach((ox) => {
      [-0.08, 0.08].forEach((oy) => {
        const hellfire = buildGuidedMissile({
          length: 0.96,
          radius: 0.045,
          darkBody: true,
        });
        hellfire.position.set(side * 0.92 + ox, fusY - 0.26 + oy, 0.18);
        cannonGroup.add(hellfire);
      });
    });
  });

  // CANNON: Chin-mounted articulated 30mm M230 Chain Gun
  const gunMount = new THREE.Group();
  gunMount.position.set(0, fusY - 0.42, 1.68);

  const gunCradle = new THREE.Mesh(machined(0.26, 0.22, 0.34), mats.gunmetal);
  gunMount.add(gunCradle);

  const m230 = buildAutocannon({
    barrelLength: 1.08,
    caliberRadius: 0.028,
    breechLength: 0.36,
    hasCoolingJacket: true,
    hasMuzzleBrake: true,
  });
  m230.position.set(0, -0.1, 0.08);
  gunMount.add(m230);
  cannonGroup.add(gunMount);

  animatedParts.push({
    object: gunMount,
    axis: "y",
    speed: 1.4,
    mode: "oscillate",
    baseValue: 0,
    amplitude: 0.24,
  });

  // MAGAZINE: Central 1,200-round 30mm ammunition magazine + flexible link chute to M230
  const m230Mag = buildAmmoDrumMagazine({
    drumRadius: 0.24,
    drumLength: 0.62,
    axis: "x",
    chuteCurvePoints: [
      new THREE.Vector3(0, -0.14, 0.18),
      new THREE.Vector3(0, -0.34, 0.56),
      new THREE.Vector3(0, -0.44, 0.96),
    ],
  });
  m230Mag.position.set(0, fusY - 0.08, 0.66);
  magazineGroup.add(m230Mag);

  // MECHANISMS: 4-Blade Articulated Main Rotor + Longbow Mast Radar + X-Scissors Tail Rotor
  const rotorPylon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.34, 0.42, 14),
    mats.apacheOlive,
  );
  rotorPylon.position.set(0, fusY + 0.62, 0.04);
  airframe.add(rotorPylon);

  const mainRotor = buildArticulatedRotorHead({
    bladeCount: 4,
    rotorRadius: 3.28,
    bladeChord: 0.24,
    mastHeight: 0.52,
    hasRadarDome: true,
  });
  mainRotor.group.position.set(0, fusY + 0.8, 0.04);

  // Tag the Longbow millimeter-wave radar dome as 'sight' while rotor mechanics stay 'mechanisms'
  if (mainRotor.radarDome) {
    mainRotor.group.remove(mainRotor.radarDome);
    mainRotor.radarDome.position.set(0, fusY + 0.8 + 0.52 + 0.22, 0.04);
    sightGroup.add(mainRotor.radarDome);
  }
  mechanismsGroup.add(mainRotor.group);

  animatedParts.push({
    object: mainRotor.spinningHead,
    axis: "y",
    speed: 14,
    mode: "spin",
  });

  // Vertical tail fin + Low stabilator + 4-blade X-pattern tail rotor
  const tailFin = new THREE.Mesh(
    createWingGeometry({
      span: 1.28,
      rootChord: 0.78,
      tipChord: 0.42,
      sweepZ: -0.35,
      rootThickness: 0.09,
      tipThickness: 0.05,
      camber: 0,
      side: 1,
    }),
    mats.apacheOlive,
  );
  tailFin.rotation.z = Math.PI / 2;
  tailFin.position.set(0, fusY + 0.1, -3.38);
  airframe.add(tailFin);

  const lowStab = new THREE.Mesh(machined(1.48, 0.05, 0.38), mats.apacheOlive);
  lowStab.position.set(0, fusY - 0.04, -3.65);
  mechanismsGroup.add(lowStab);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.18, fusY + 1.02, -3.62);

  const trHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12),
    mats.gunmetal,
  );
  trHub.rotation.z = Math.PI / 2;
  tailRotor.add(trHub);

  // Characteristic Apache 60/120 deg X-scissors blade angles
  [0, 1.05, Math.PI, Math.PI + 1.05].forEach((ang) => {
    const bGroup = new THREE.Group();
    bGroup.rotation.x = ang;
    const b = new THREE.Mesh(machined(0.024, 0.74, 0.12), mats.specOpsBlack);
    b.position.y = 0.4;
    bGroup.add(b);

    const tip = new THREE.Mesh(machined(0.026, 0.1, 0.122), mats.warningYellow);
    tip.position.y = 0.72;
    bGroup.add(tip);
    tailRotor.add(bGroup);
  });
  mechanismsGroup.add(tailRotor);
  animatedParts.push({ object: tailRotor, axis: "x", speed: 24, mode: "spin" });

  // Trailing-arm main landing gear & tailwheel resting on y = 0
  ([-0.72, 0.72] as const).forEach((gx) => {
    const strut = buildWheeledLandingGear({
      strutHeight: fusY - 0.28 - 0.18,
      wheelRadius: 0.18,
    });
    strut.position.set(gx, fusY - 0.28, 1.15);
    attachment(
      mechanismsGroup,
      [gx * 0.56, fusY - 0.1, 1.31],
      [gx, fusY - 0.39, 1.15],
      0.067,
      mats.apacheDark,
    );
    attachment(
      mechanismsGroup,
      [gx * 0.51, fusY - 0.13, 0.79],
      [gx, fusY - 0.66, 1.15],
      0.04,
      mats.titanium,
    );
    mechanismsGroup.add(strut);
  });

  const tailGear = buildWheeledLandingGear({
    strutHeight: fusY - 0.04 - 0.11,
    wheelRadius: 0.11,
  });
  tailGear.position.set(0, fusY - 0.04, -3.45);
  mechanismsGroup.add(tailGear);

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
