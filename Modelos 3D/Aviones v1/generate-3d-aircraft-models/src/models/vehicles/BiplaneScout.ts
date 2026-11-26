import * as THREE from "three";
import { cutOpening } from "../cockpits";
import { computeGeometryStats, getMaterials, tagPart } from "../materials";
import {
  buildAutocannon,
  buildEjectionSeat,
  buildRadialEngine,
} from "../partBuilders";
import {
  createLoftedFuselage,
  createWingGeometry,
  revolved,
} from "../surfaces";
import { machined } from "../details";
import { addMark } from "../finish";
import { AnimatedPart, BuiltModelResult } from "../types";

export function buildBiplaneScout(): BuiltModelResult {
  const mats = getMaterials();
  const root = new THREE.Group();
  const animatedParts: AnimatedPart[] = [];

  // Taildragger pitched assembly so both main wheels & tailwheel sit on y = 0
  const body = new THREE.Group();
  body.position.set(0, 0.95, 0);
  body.rotation.x = -0.09; // +Z nose pitched UP slightly

  const airframe = new THREE.Group();
  const cannonGroup = new THREE.Group();
  const magazineGroup = new THREE.Group();
  const thrustersGroup = new THREE.Group();
  const sightGroup = new THREE.Group();
  const mechanismsGroup = new THREE.Group();

  // Streamlined circular-to-knife-edge classic fuselage
  const fusGeom = createLoftedFuselage(
    [
      {
        z: -2.92,
        halfWidth: 0.04,
        topHeight: 0.22,
        bottomHeight: 0.16,
        yCenter: 0.18,
      },
      {
        z: -1.65,
        halfWidth: 0.28,
        topHeight: 0.34,
        bottomHeight: 0.28,
        yCenter: 0.18,
      },
      {
        z: -0.35,
        halfWidth: 0.44,
        topHeight: 0.48,
        bottomHeight: 0.42,
        yCenter: 0.2,
      },
      {
        z: 0.95,
        halfWidth: 0.48,
        topHeight: 0.52,
        bottomHeight: 0.46,
        yCenter: 0.22,
      },
      {
        z: 1.92,
        halfWidth: 0.47,
        topHeight: 0.48,
        bottomHeight: 0.46,
        yCenter: 0.22,
      },
    ],
    22,
  );
  airframe.add(
    new THREE.Mesh(
      cutOpening(fusGeom, (p) =>
        Math.max((p.x / 0.29) ** 2 + ((p.z + 0.08) / 0.4) ** 2 - 1, 0.39 - p.y),
      ),
      mats.classicNavy,
    ),
  );
  fusGeom.dispose();

  // Brushed aluminum forward engine cowling ring
  const cowlRing = new THREE.Mesh(
    revolved(
      [
        [0.465, -0.2],
        [0.493, -0.18],
        [0.514, -0.07],
        [0.512, 0.11],
        [0.5, 0.2],
        [0.468, 0.225],
        [0.45, 0.201],
        [0.45, 0.16],
      ],
      mats.classicSilver,
      32,
    ).geometry,
    mats.classicSilver,
  );
  cowlRing.rotation.x = Math.PI / 2;
  cowlRing.position.set(0, 0.22, 1.85);
  airframe.add(cowlRing);

  // Open cockpit cutout, leather coaming & pilot seat
  const cockpitRecess = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.28, 0.31, 16, 1, true),
    mats.cockpitInterior,
  );
  cockpitRecess.scale.set(1, 1, 1.35);
  cockpitRecess.position.set(0, 0.52, -0.08);
  airframe.add(cockpitRecess);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.285, 20),
    mats.cockpitInterior,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.scale.y = 1.35;
  floor.position.set(0, 0.37, -0.08);
  airframe.add(floor);

  const coaming = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.045, 8, 18),
    mats.mahoganyWood,
  );
  coaming.rotation.x = Math.PI / 2;
  coaming.scale.set(1, 1.35, 1);
  coaming.position.set(0, 0.68, -0.08);
  airframe.add(coaming);

  const seat = buildEjectionSeat(0.76);
  seat.position.set(0, 0.48, -0.14);
  airframe.add(seat);

  // Framed tri-pane glass windscreen
  const windscreen = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.27,
      0.31,
      0.24,
      6,
      1,
      true,
      -Math.PI * 0.4,
      Math.PI * 0.8,
    ),
    mats.canopySmoke,
  );
  windscreen.position.set(0, 0.78, 0.26);
  airframe.add(windscreen);
  for (const side of [-1, 1]) {
    const spar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.013, 0.245, 6),
      mats.classicSilver,
    );
    spar.position.set(side * 0.27, 0.78, 0.36);
    spar.rotation.z = side * 0.14;
    airframe.add(spar);
    addMark(
      airframe,
      "F3F - 04",
      0.75,
      0.18,
      side * 0.386,
      0.245,
      -0.71,
      (side * Math.PI) / 2,
      true,
    );
  }

  // THRUSTERS: Exposed 9-cylinder radial engine + 2-blade mahogany propeller
  const radial = buildRadialEngine(0.48, 1.12);
  radial.group.position.set(0, 0.22, 2.1);
  thrustersGroup.add(radial.group);
  animatedParts.push({
    object: radial.propRotor,
    axis: "z",
    speed: 20,
    mode: "spin",
  });

  // UPPER PARASOL WING (High-visibility Classic Yellow) & LOWER WING (Classic Navy)
  const upperCenter = new THREE.Mesh(
    createWingGeometry({
      span: 0.72,
      rootChord: 1.08,
      tipChord: 1.08,
      sweepZ: 0,
      rootThickness: 0.11,
      tipThickness: 0.11,
      camber: 0.035,
      side: 1,
    }),
    mats.classicYellow,
  );
  upperCenter.position.set(-0.36, 1.24, 0.56);
  airframe.add(upperCenter);

  ([1, -1] as const).forEach((side) => {
    const upperWing = new THREE.Mesh(
      createWingGeometry({
        span: 2.55,
        rootChord: 1.08,
        tipChord: 0.88,
        sweepZ: -0.08,
        dihedralY: 0.06,
        rootThickness: 0.11,
        tipThickness: 0.08,
        camber: 0.035,
        side,
      }),
      mats.classicYellow,
    );
    upperWing.position.set(side * 0.36, 1.24, 0.56);
    airframe.add(upperWing);

    const lowerWing = new THREE.Mesh(
      createWingGeometry({
        span: 2.35,
        rootChord: 0.98,
        tipChord: 0.78,
        sweepZ: -0.06,
        dihedralY: 0.12,
        rootThickness: 0.1,
        tipThickness: 0.075,
        camber: 0.03,
        side,
      }),
      mats.classicNavy,
    );
    lowerWing.position.set(side * 0.42, -0.08, 0.28);
    airframe.add(lowerWing);

    // Interplane N-struts & cabane struts (mechanisms)
    const strutGeom = new THREE.CylinderGeometry(0.024, 0.024, 1.32, 8);
    [-0.22, 0.24].forEach((sz) => {
      const outerStrut = new THREE.Mesh(strutGeom, mats.classicSilver);
      outerStrut.position.set(side * 2.05, 0.62, 0.42 + sz);
      outerStrut.rotation.x = 0.2;
      mechanismsGroup.add(outerStrut);
    });

    const diagStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.38, 8),
      mats.classicSilver,
    );
    diagStrut.position.set(side * 2.05, 0.62, 0.42);
    diagStrut.rotation.x = -0.35;
    mechanismsGroup.add(diagStrut);

    // Center cabane struts
    [-0.18, 0.22].forEach((cz) => {
      const cabane = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8),
        mats.classicSilver,
      );
      cabane.position.set(side * 0.32, 0.9, 0.52 + cz);
      cabane.rotation.z = side * 0.18;
      mechanismsGroup.add(cabane);
    });

    // Crossed stainless rigging wires
    const wire1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 1.98, 6),
      mats.chrome,
    );
    wire1.position.set(side * 1.24, 0.58, 0.44);
    wire1.rotation.z = side * 0.9;
    mechanismsGroup.add(wire1);

    const wire2 = wire1.clone();
    wire2.rotation.z = -side * 0.9;
    mechanismsGroup.add(wire2);

    // Classic horizontal tailplane
    const hTail = new THREE.Mesh(
      createWingGeometry({
        span: 1.08,
        rootChord: 0.72,
        tipChord: 0.42,
        sweepZ: -0.14,
        rootThickness: 0.06,
        tipThickness: 0.035,
        camber: 0,
        side,
      }),
      mats.classicYellow,
    );
    hTail.position.set(side * 0.06, 0.24, -2.55);
    airframe.add(hTail);
  });

  // Classic rounded vertical fin & rudder
  const vFin = new THREE.Mesh(
    createWingGeometry({
      span: 0.98,
      rootChord: 0.92,
      tipChord: 0.48,
      sweepZ: -0.2,
      rootThickness: 0.065,
      tipThickness: 0.035,
      camber: 0,
      side: 1,
    }),
    mats.classicYellow,
  );
  vFin.rotation.z = Math.PI / 2;
  vFin.position.set(0, 0.22, -2.58);
  airframe.add(vFin);

  // Red-white-blue rudder stripe accent
  const rudderStripe = new THREE.Mesh(
    machined(0.072, 0.76, 0.18),
    mats.warningRed,
  );
  rudderStripe.position.set(0, 0.68, -2.92);
  airframe.add(rudderStripe);

  // CANNON: Twin synchronized cowling machine guns firing forward above radial engine
  ([-0.21, 0.21] as const).forEach((gx) => {
    const mg = buildAutocannon({
      barrelLength: 0.86,
      caliberRadius: 0.022,
      breechLength: 0.34,
      hasCoolingJacket: true,
      hasMuzzleBrake: false,
    });
    mg.position.set(gx, 0.74, 0.88);
    cannonGroup.add(mg);

    // Flash cone on muzzle
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.09, 10),
      mats.brass,
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(gx, 0.74, 1.78);
    cannonGroup.add(cone);

    // MAGAZINE: Top-mounted circular pan drum magazine + brass cartridge chute
    const panDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.075, 16),
      mats.gunmetal,
    );
    panDrum.position.set(gx, 0.86, 0.76);
    magazineGroup.add(panDrum);

    const brassCenter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14),
      mats.brass,
    );
    brassCenter.position.set(gx, 0.86, 0.76);
    magazineGroup.add(brassCenter);
  });

  // SIGHT: Classic Aldis Brass/Blued Tubular Telescopic Gunsight + Ring-and-Bead Sight
  const scopeTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.58, 12),
    mats.brass,
  );
  scopeTube.rotation.x = Math.PI / 2;
  scopeTube.position.set(0, 0.83, 0.64);
  sightGroup.add(scopeTube);

  const scopeLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12),
    mats.opticEmerald,
  );
  scopeLens.rotation.x = Math.PI / 2;
  scopeLens.position.set(0, 0.83, 0.93);
  sightGroup.add(scopeLens);

  const ringSight = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.007, 8, 16),
    mats.chrome,
  );
  ringSight.position.set(0, 0.92, 1.15);
  sightGroup.add(ringSight);

  // MECHANISMS: Fixed V-strut main landing gear with spoked hubs & tailwheel
  ([-0.68, 0.68] as const).forEach((lx) => {
    const legFwd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.024, 0.86, 8),
      mats.classicSilver,
    );
    legFwd.position.set(lx * 0.75, -0.36, 0.95);
    legFwd.rotation.z = lx > 0 ? -0.34 : 0.34;
    legFwd.rotation.x = -0.22;
    mechanismsGroup.add(legFwd);

    const legAft = legFwd.clone();
    legAft.position.z = 0.56;
    legAft.rotation.x = 0.25;
    mechanismsGroup.add(legAft);

    const tire = new THREE.Mesh(
      revolved(
        [
          [0.125, -0.06],
          [0.195, -0.061],
          [0.237, -0.043],
          [0.25, -0.012],
          [0.25, 0.012],
          [0.237, 0.043],
          [0.195, 0.061],
          [0.125, 0.06],
          [0.125, -0.06],
        ],
        mats.rubber,
        24,
      ).geometry,
      mats.rubber,
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(lx, -0.78, 0.78);
    mechanismsGroup.add(tire);

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.13, 14),
      mats.classicYellow,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(lx, -0.78, 0.78);
    mechanismsGroup.add(hub);
  });

  // Spreader axle
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 1.36, 8),
    mats.titanium,
  );
  axle.rotation.z = Math.PI / 2;
  axle.position.set(0, -0.78, 0.78);
  mechanismsGroup.add(axle);

  // Tailwheel strut
  const tailStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.015, 0.34, 8),
    mats.chrome,
  );
  tailStrut.position.set(0, -0.06, -2.72);
  tailStrut.rotation.x = 0.42;
  mechanismsGroup.add(tailStrut);

  const tailWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12),
    mats.rubber,
  );
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.22, -2.8);
  mechanismsGroup.add(tailWheel);

  body.add(
    tagPart(airframe, "airframe"),
    tagPart(cannonGroup, "cannon"),
    tagPart(magazineGroup, "magazine"),
    tagPart(thrustersGroup, "thrusters"),
    tagPart(sightGroup, "sight"),
    tagPart(mechanismsGroup, "mechanisms"),
  );
  root.add(body);

  const stats = computeGeometryStats(root);
  return { group: root, animatedParts, ...stats };
}
