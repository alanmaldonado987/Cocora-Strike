// Modelos 3D/ac130Transport.js
// Módulo 1: Transporte de Desembarco AC-130J Ghostrider (adaptado de "Modelos 3D/Aviones v1/src/models/vehicles/AC130Gunship.ts")
// Escala métrica real para personajes de 1.80m (SCALE = 2.55 -> 19.9m eslora, 22.6m envergadura, piso de bodega en localY = -1.14m):
// - Casco aerodinámico lofted con aberturas reales recortadas (clipGeometry) sin Z-fighting (márgenes >= 0.025m).
// - Cabina con cristal semitransparente (opacity: 0.35, roughness: 0.1, depthWrite: false), pilotos, yokes y pantallas MFD emisivas.
// - Bodega conectada con piso antideslizante, costillas estructurales, mamparo delantero con puerta, bancos laterales de tropa
//   y espacio local `cabinBayGroup` para el desembarco animado (sit -> stand -> walk_cabin -> ramp_jump).
// - 4 Turbopropulsores Rolls-Royce AE 2100D3 con inercia de RPM, alabeo sutil y disco motion-blur a altas revoluciones.
// - Rampa trasera y puerta lateral de paracaidistas con bisagras en el borde real y pistones hidráulicos telescópicos.
// - Cañón rotativo GAU-12 25mm y obús M102 105mm en afustes articulados (pan/tilt) con retroceso y giro de cañones.

import * as THREE from 'three';
import {
  TAU,
  lerp,
  clamp,
  easeInOutCubic,
  dampValue,
  approachValue,
  getAircraftMaterials,
  createTacticalStencilMaterial,
  hullSampler,
  parametricPatch,
  orientOutward,
  weldSeamNormals,
  clipGeometry,
  createLoftedFuselage,
  createWingGeometry,
  createAirfoilBladeGeometry,
  roundedBox,
  makeMesh,
  zCylinder,
  latheMesh,
  tubeMesh,
  buildFlightCrewFigure,
  buildArmoredCockpitSeat,
  buildOleoWheelAssembly,
  TelescopicPiston,
  bakeRigidAircraftBatches,
  registerSharedAircraftMat
} from './avionesShared.js';

export const AC130_SCALE = 2.55;
const RAW_FLOOR_Y = 0.62;
export const AC130_CABIN_FLOOR_LOCAL_Y = -1.14;
const MODEL_OFFSET_Y = AC130_CABIN_FLOOR_LOCAL_Y - RAW_FLOOR_Y * AC130_SCALE; // -2.721m

const FUS_Y = 1.18;
const Z0 = -3.94;
const Z1 = 3.86;

const SECTIONS = [
  [-3.94, 0.04, 0.09, 0.07, 1.64],
  [-3.55, 0.31, 0.27, 0.19, 1.59],
  [-2.85, 0.52, 0.45, 0.32, 1.48],
  [-2.20, 0.70, 0.62, 0.47, 1.34],
  [-1.42, 0.795, 0.75, 0.685, 1.19],
  [-0.65, 0.81, 0.77, 0.69, 1.18],
  [1.25, 0.81, 0.77, 0.69, 1.18],
  [1.81, 0.794, 0.75, 0.686, 1.18],
  [2.22, 0.758, 0.665, 0.64, 1.15],
  [2.67, 0.67, 0.505, 0.564, 1.085],
  [3.05, 0.56, 0.361, 0.44, 1.02],
  [3.42, 0.414, 0.275, 0.318, 0.97],
  [3.71, 0.225, 0.17, 0.191, 0.96],
  [3.86, 0.022, 0.018, 0.022, 0.97]
].map(([z, halfWidth, topHeight, bottomHeight, yCenter]) => ({
  z,
  halfWidth,
  topHeight,
  bottomHeight,
  yCenter,
  squareness: 0.22
}));

const hullAt = hullSampler(SECTIONS);
const centerY = (z) => (hullAt(z, 0).y + hullAt(z, Math.PI).y) * 0.5;

function angleWhere(z, from, to, fn) {
  let a = from;
  let b = to;
  for (let i = 0; i < 24; i++) {
    const mid = (a + b) * 0.5;
    if (fn(hullAt(z, mid)) < 0) a = mid;
    else b = mid;
  }
  return (a + b) * 0.5;
}

const sidePoint = (z, y, s) => hullAt(z, angleWhere(z, 0, s * Math.PI, (p) => y - p.y));
const sampleLine = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));

const WIND = { z0: 2.30, z1: 2.96 };
const windLow = (z) => 1.31 - (0.17 * (z - WIND.z0)) / (WIND.z1 - WIND.z0);
const SIDE_WINDOW = { z0: 2.02, z1: 2.22, y0: 1.02, y1: 1.22 };
const PORTS = {
  rotary: { z0: 1.06, z1: 1.46, y0: 0.82, y1: 1.34, z: 1.26 },
  howitzer: { z0: -1.04, z1: -0.50, y0: 0.82, y1: 1.34, z: -0.77 }
};
const DOOR = { z0: -1.45, z1: -0.95, y0: 0.68, y1: 1.50 };
const RAMP = { z0: -1.55, z1: -3.02, halfWidth: 0.60 };
const rampTop = (z) => lerp(0.86, 1.42, (RAMP.z0 - z) / (RAMP.z0 - RAMP.z1));

const rectOpening = (s, z0, z1, y0, y1) => (p) =>
  Math.max(z0 - p.z, p.z - z1, y0 - p.y, p.y - y1, -s * p.x);

const OPENINGS = [
  (p) => Math.max(WIND.z0 - p.z, p.z - WIND.z1, windLow(p.z) - p.y),
  rectOpening(1, SIDE_WINDOW.z0, SIDE_WINDOW.z1, SIDE_WINDOW.y0, SIDE_WINDOW.y1),
  rectOpening(-1, SIDE_WINDOW.z0, SIDE_WINDOW.z1, SIDE_WINDOW.y0, SIDE_WINDOW.y1),
  rectOpening(1, PORTS.rotary.z0, PORTS.rotary.z1, PORTS.rotary.y0, PORTS.rotary.y1),
  rectOpening(1, PORTS.howitzer.z0, PORTS.howitzer.z1, PORTS.howitzer.y0, PORTS.howitzer.y1),
  rectOpening(-1, DOOR.z0, DOOR.z1, DOOR.y0, DOOR.y1),
  (p) => Math.max(RAMP.z1 - p.z, p.z - RAMP.z0, Math.abs(p.x) - RAMP.halfWidth, p.y - rampTop(p.z))
];

const outsideOpenings = (p) => Math.min(...OPENINGS.map((o) => o(p)));

function buildClippedHullGeometry() {
  const nu = 84;
  const nv = 44;
  const g = orientOutward(
    parametricPatch((u, v) => hullAt(lerp(Z0, Z1, u), (v - 0.5) * TAU), nu, nv),
    centerY
  );
  weldSeamNormals(g, nu, nv);
  const clipped = clipGeometry(g, outsideOpenings);
  g.dispose();
  return clipped;
}

function sideLoop(s, o, n = 5) {
  const pts = [];
  const edge = (za, ya, zb, yb) => {
    for (let i = 0; i < n; i++) {
      pts.push(sidePoint(lerp(za, zb, i / n), lerp(ya, yb, i / n), s));
    }
  };
  edge(o.z0, o.y0, o.z1, o.y0);
  edge(o.z1, o.y0, o.z1, o.y1);
  edge(o.z1, o.y1, o.z0, o.y1);
  edge(o.z0, o.y1, o.z0, o.y0);
  return pts;
}

function buildOpeningTrim(loop, M, depth = 0.065, radius = 0.017) {
  const g = new THREE.Group();
  g.add(tubeMesh(loop, radius, M.ac130Trim, true));
  const P = [];
  const U = [];
  const I = [];
  loop.forEach((p, i) => {
    const n = new THREE.Vector3(p.x, (p.y - centerY(p.z)) * 0.4, 0).normalize();
    const inner = p.clone().addScaledVector(n, -depth);
    P.push(p.x, p.y, p.z, inner.x, inner.y, inner.z);
    U.push(i / loop.length, 0, i / loop.length, 1);
    const a = i * 2;
    const b = ((i + 1) % loop.length) * 2;
    I.push(a, b, a + 1, b, b + 1, a + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setIndex(I);
  geo.computeVertexNormals();
  g.add(makeMesh(geo, M.interiorDouble));
  return g;
}

const NACELLE = { L: 1.38, R: 0.25, prop: 0.64, blades: 6 };

function buildAE2100Turboprop(M, blurMat) {
  const { L, R } = NACELLE;
  const group = new THREE.Group();
  const shape = [
    [-0.87, 0.10],
    [-0.65, 0.55],
    [-0.42, 0.92],
    [0.00, 1.05],
    [0.36, 0.99],
    [0.49, 0.86],
    [0.54, 0.64]
  ];
  group.add(
    makeMesh(
      createLoftedFuselage(
        shape.map(([z, w]) => ({
          z: z * L,
          halfWidth: R * w,
          topHeight: R * w,
          bottomHeight: R * w * 1.14
        })),
        24
      ),
      M.ac130Paint
    )
  );

  // Toma inferior aerodinámica de radiador de aceite
  const scoop = makeMesh(
    createLoftedFuselage(
      [
        { z: -0.20, halfWidth: 0.02, topHeight: 0.02, bottomHeight: 0.02 },
        { z: 0.05, halfWidth: R * 0.50, topHeight: R * 0.30, bottomHeight: R * 0.30 },
        { z: 0.30, halfWidth: R * 0.56, topHeight: R * 0.34, bottomHeight: R * 0.34 }
      ],
      14
    ),
    M.ac130Paint,
    0,
    -R * 0.86,
    L * 0.22
  );
  group.add(scoop);
  group.add(makeMesh(new THREE.CircleGeometry(R * 0.38, 14), M.cockpitSeatBlack, 0, -R * 0.86, L * 0.22 + 0.304));

  // Tobera de escape de titanio quemado
  const exhaust = latheMesh(
    [
      [R * 0.42, 0],
      [R * 0.44, 0.03],
      [R * 0.40, 0.22],
      [R * 0.33, 0.22],
      [R * 0.33, 0]
    ],
    M.burntTitanium,
    16
  );
  exhaust.rotation.x = -Math.PI / 2;
  exhaust.position.set(0, -R * 0.35, -L * 0.53);
  group.add(exhaust);

  // Grupo jerárquico independiente de hélice de 6 palas Dowty R391 con puntas amarillas
  const propRotor = new THREE.Group();
  propRotor.position.z = L * 0.56;
  const spinner = latheMesh(
    [
      [0, -0.06],
      [R * 0.66, -0.06],
      [R * 0.66, 0.02],
      [R * 0.57, R * 0.40],
      [R * 0.36, R * 0.80],
      [R * 0.09, R * 1.06],
      [0, R * 1.10]
    ],
    M.cockpitSeatBlack,
    22
  );
  spinner.rotation.x = Math.PI / 2;
  propRotor.add(spinner);

  const bladeGeo = createAirfoilBladeGeometry(NACELLE.prop * 0.86, NACELLE.prop * 0.20, false);
  for (let i = 0; i < NACELLE.blades; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = ((i + 0.25) * TAU) / NACELLE.blades;
    holder.add(makeMesh(new THREE.CylinderGeometry(0.028, 0.032, 0.08, 8), M.weaponSteel, 0, R * 0.62, 0));
    holder.add(makeMesh(bladeGeo, M.bladeVertexMat, 0, NACELLE.prop * 0.14, 0));
    propRotor.add(holder);
  }
  group.add(propRotor);

  // Disco semitransparente de motion-blur a altas revoluciones (depthWrite: false)
  const blurDisc = makeMesh(
    new THREE.CircleGeometry(NACELLE.prop * 1.02, 32),
    blurMat,
    0,
    0,
    propRotor.position.z + 0.025,
    false
  );
  blurDisc.renderOrder = 4;
  group.add(blurDisc);

  return { group, propRotor, blurDisc };
}

function buildArticulatedSideWeapon(kind, zPos, M) {
  const mountX = 0.52; // Anclado junto a la ventana de babor dejando libre el pasillo central (x = 0)
  const mountY = 1.08;

  const base = new THREE.Group();
  base.add(makeMesh(roundedBox(0.24, 0.028, 0.24), M.weaponSteel, mountX - 0.02, RAW_FLOOR_Y + 0.028, zPos));
  base.add(
    makeMesh(
      new THREE.CylinderGeometry(0.03, 0.045, mountY - RAW_FLOOR_Y - 0.06, 10),
      M.weaponSteel,
      mountX,
      (mountY + RAW_FLOOR_Y) * 0.5,
      zPos
    )
  );
  const sillAnchor = sidePoint(zPos, 0.80, 1).add(new THREE.Vector3(-0.03, 0, 0));
  base.add(
    tubeMesh(
      [
        new THREE.Vector3(mountX, RAW_FLOOR_Y + 0.18, zPos),
        new THREE.Vector3(0.64, 0.74, zPos),
        sillAnchor
      ],
      0.013,
      M.weaponSteel
    )
  );

  const pan = new THREE.Group();
  pan.position.set(mountX, mountY, zPos);
  pan.rotation.y = Math.PI / 2;
  pan.add(makeMesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 14), M.weaponSteel, 0, -0.042, 0));
  for (const s of [-1, 1]) {
    pan.add(makeMesh(roundedBox(0.02, 0.088, 0.078), M.weaponSteel, s * 0.072, -0.01, 0));
  }

  const tilt = new THREE.Group();
  tilt.rotation.x = 0.16;
  pan.add(tilt);
  const trunnion = makeMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), M.chrome);
  trunnion.rotation.z = Math.PI / 2;
  tilt.add(trunnion);

  const recoil = new THREE.Group();
  tilt.add(recoil);
  const feed = new THREE.Group();
  tilt.add(feed);

  const flashMat = registerSharedAircraftMat(M.muzzleFlashTemplate.clone());
  const flashGeo = new THREE.ConeGeometry(kind === 'rotary' ? 0.05 : 0.08, kind === 'rotary' ? 0.18 : 0.28, 10, 1, true);
  flashGeo.rotateX(Math.PI / 2);
  const flash = makeMesh(flashGeo, flashMat, 0, 0, 0, false);
  flash.renderOrder = 5;

  let spinCluster = null;
  if (kind === 'rotary') {
    recoil.add(makeMesh(roundedBox(0.11, 0.11, 0.25), M.weaponSteel, 0, 0, -0.08));
    const driveMotor = zCylinder(0.026, 0.026, 0.15, M.cockpitSeatBlack, 10);
    driveMotor.position.set(0.068, 0.03, -0.18);
    recoil.add(driveMotor);

    spinCluster = new THREE.Group();
    spinCluster.position.z = 0.04;
    recoil.add(spinCluster);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const b = zCylinder(0.0105, 0.009, 0.54, M.weaponSteel, 8);
      b.position.set(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0);
      spinCluster.add(b);
    }
    for (const cz of [0.18, 0.38, 0.51]) {
      const clampRing = zCylinder(0.045, 0.045, 0.016, M.titanium, 12);
      clampRing.position.z = cz;
      spinCluster.add(clampRing);
    }
    flash.position.z = 0.68;
    recoil.add(flash);

    // Tambor interno de munición y conducto flexible con vainas de latón visibles dentro de la bodega
    const drum = makeMesh(new THREE.CylinderGeometry(0.078, 0.078, 0.16, 14), M.ordnanceOlive, -0.13, -0.04, -0.12);
    drum.rotation.z = Math.PI / 2;
    feed.add(drum);
    feed.add(
      tubeMesh(
        [
          new THREE.Vector3(-0.11, 0.035, -0.10),
          new THREE.Vector3(-0.085, 0.075, -0.06),
          new THREE.Vector3(-0.05, 0.045, -0.035)
        ],
        0.016,
        M.titanium
      )
    );
    for (let i = 0; i < 4; i++) {
      feed.add(
        makeMesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.038, 6),
          M.brass,
          -0.098 + i * 0.012,
          0.072 - i * 0.007,
          -0.08 + i * 0.012
        )
      );
    }
  } else {
    // Obús lateral M102 de 105 mm con cuna hidroneumática y freno de boca
    recoil.add(makeMesh(roundedBox(0.13, 0.13, 0.20), M.weaponSteel, 0, 0, -0.12));
    recoil.add(zCylinder(0.032, 0.026, 0.78, M.weaponSteel, 14));
    recoil.add(makeMesh(roundedBox(0.076, 0.052, 0.09, 0.012), M.burntTitanium, 0, 0, 0.81));
    flash.position.z = 0.96;
    recoil.add(flash);

    const cradle = zCylinder(0.046, 0.046, 0.28, M.titanium, 12);
    cradle.position.z = -0.03;
    tilt.add(cradle);
    for (const cy of [-0.056, 0.056]) {
      const hyd = zCylinder(0.015, 0.015, 0.28, M.chrome, 8);
      hyd.position.set(0, cy, -0.06);
      tilt.add(hyd);
    }
    feed.add(makeMesh(roundedBox(0.055, 0.065, 0.12), M.ordnanceOlive, -0.10, -0.04, -0.12));
  }

  return {
    base,
    state: {
      kind,
      pan,
      tilt,
      recoil,
      spinCluster,
      feed,
      flash,
      flashMat,
      recoilOffset: 0,
      flashLevel: 0,
      burstClock: kind === 'howitzer' ? 1.4 : 0.2,
      spinRate: kind === 'rotary' ? 24 : 0
    }
  };
}

// 10 asientos tácticos de tropa (estribor continuo + tramos despejados de babor) sin interferir con afustes
const AC130_TROOP_SEATS_RAW = [
  { x: -0.56, z: 1.46, side: -1 },
  { x: 0.56, z: 0.66, side: 1 },
  { x: -0.56, z: 0.96, side: -1 },
  { x: 0.56, z: 0.18, side: 1 },
  { x: -0.56, z: 0.46, side: -1 },
  { x: 0.56, z: -0.24, side: 1 },
  { x: -0.56, z: -0.04, side: -1 },
  { x: 0.56, z: -1.34, side: 1 },
  { x: -0.56, z: -0.54, side: -1 },
  { x: -0.56, z: -1.28, side: -1 }
];

function buildParatroopBenchSegment(M, xSide, zStart, zEnd) {
  const g = new THREE.Group();
  const len = Math.abs(zEnd - zStart);
  const zMid = (zStart + zEnd) * 0.5;
  const seatX = xSide * 0.58;
  const backX = xSide * 0.70;

  // Asiento de lona roja antidesgarro + bastidor tubular de aluminio (separado >= 0.03m del casco)
  g.add(makeMesh(roundedBox(0.20, 0.024, len, 0.008), M.troopWebbingRed, seatX, RAW_FLOOR_Y + 0.175, zMid));
  g.add(makeMesh(roundedBox(0.022, 0.24, len * 0.96, 0.006), M.troopWebbingRed, backX, RAW_FLOOR_Y + 0.36, zMid));

  const legCount = Math.max(2, Math.round(len / 0.55) + 1);
  for (let i = 0; i < legCount; i++) {
    const lz = lerp(zStart + 0.06, zEnd - 0.06, i / Math.max(1, legCount - 1));
    g.add(makeMesh(new THREE.CylinderGeometry(0.010, 0.010, 0.17, 6), M.titanium, seatX - xSide * 0.07, RAW_FLOOR_Y + 0.088, lz));
    g.add(makeMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), M.titanium, backX, RAW_FLOOR_Y + 0.32, lz));
  }
  return g;
}

/**
 * Construye el transporte AC-130J Ghostrider completo con su jerarquía articulada,
 * espacio local de bodega (`cabinBayGroup`) y método `update(delta, flightContext)`.
 */
export function buildAC130Transport(addLightAnchorFn = null) {
  const M = getAircraftMaterials();
  const root = new THREE.Group();
  root.name = 'AC130J_Transport';

  const scaledAirframe = new THREE.Group();
  scaledAirframe.scale.setScalar(AC130_SCALE);
  scaledAirframe.position.y = MODEL_OFFSET_Y;
  root.add(scaledAirframe);

  // Grupo hijo en escala 1:1 métrica del mundo para alojar los avatares de jugadores y bots dentro de la bodega
  const cabinBayGroup = new THREE.Group();
  cabinBayGroup.name = 'AC130J_CabinBay';
  root.add(cabinBayGroup);

  const blurMat = registerSharedAircraftMat(M.rotorBlurTemplate.clone());

  // 1. Casco aerodinámico con aberturas reales + revestimiento interior BackSide (Cero Z-Fighting)
  const hullGeo = buildClippedHullGeometry();
  const outerHull = makeMesh(hullGeo, M.ac130Paint);
  const innerLining = new THREE.Mesh(hullGeo, M.liningBack);
  innerLining.receiveShadow = true;
  scaledAirframe.add(outerHull, innerLining);

  // Marcas tácticas en los flancos y cola (separación +0.025 unidades -> > 0.06m reales)
  const usafMarkL = makeMesh(new THREE.PlaneGeometry(0.95, 0.18), createTacticalStencilMaterial('FUERZA AÉREA · AC-130J', true), 0.835, 1.32, 0.18, false);
  usafMarkL.rotation.y = Math.PI / 2;
  const usafMarkR = makeMesh(new THREE.PlaneGeometry(0.95, 0.18), createTacticalStencilMaterial('FUERZA AÉREA · AC-130J', true), -0.835, 1.32, 0.18, false);
  usafMarkR.rotation.y = -Math.PI / 2;
  scaledAirframe.add(usafMarkL, usafMarkR);

  // 2. Parabrisas de cabina de mando con cristal semitransparente (opacity 0.35, roughness 0.1, depthWrite false)
  const windAngle = (z) => angleWhere(z, 0, Math.PI, (p) => windLow(z) - p.y);
  const windAt = (u, f) => {
    const z = lerp(WIND.z0, WIND.z1, u);
    return hullAt(z, f * windAngle(z));
  };
  const windscreen = makeMesh(parametricPatch((u, v) => windAt(u, v * 2 - 1), 10, 16), M.cockpitGlass, 0, 0, 0, false);
  windscreen.renderOrder = 3;
  scaledAirframe.add(windscreen);

  for (const f of [-1, -0.66, -0.33, 0, 0.33, 0.66, 1]) {
    scaledAirframe.add(tubeMesh(sampleLine(9, (t) => windAt(t, f)), Math.abs(f) === 1 ? 0.021 : 0.014, M.ac130Trim));
  }
  for (const u of [0, 0.5, 1]) {
    scaledAirframe.add(tubeMesh(sampleLine(18, (t) => windAt(u, t * 2 - 1)), u === 0.5 ? 0.014 : 0.021, M.ac130Trim));
  }

  for (const s of [-1, 1]) {
    const sideGlass = makeMesh(
      parametricPatch(
        (u, v) => sidePoint(lerp(SIDE_WINDOW.z0, SIDE_WINDOW.z1, u), lerp(SIDE_WINDOW.y0, SIDE_WINDOW.y1, v), s),
        4,
        4
      ),
      M.cockpitGlass,
      0,
      0,
      0,
      false
    );
    sideGlass.renderOrder = 3;
    scaledAirframe.add(sideGlass, buildOpeningTrim(sideLoop(s, SIDE_WINDOW), M, 0.05, 0.015));
  }
  scaledAirframe.add(
    buildOpeningTrim(sideLoop(1, PORTS.rotary), M),
    buildOpeningTrim(sideLoop(1, PORTS.howitzer), M),
    buildOpeningTrim(sideLoop(-1, DOOR), M, 0.06, 0.02)
  );

  // 3. Interior conectado: piso antideslizante (margen >= 0.025m sobre el fondo del casco), franja amarilla de salto,
  // mamparo delantero con puerta abierta, costillas estructurales, luces y cabina de mando completa.
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.16, 0.028, 3.42), M.nonSlipDeck, 0, RAW_FLOOR_Y - 0.014, 0.10, false));
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.12, 0.008, 0.12), M.warningYellow, 0, RAW_FLOOR_Y + 0.005, RAMP.z0 + 0.08, false));

  // Bancos laterales de tropa en estribor y babor (despejados de los afustes de babor)
  scaledAirframe.add(
    buildParatroopBenchSegment(M, -1, -0.88, 1.68),
    buildParatroopBenchSegment(M, 1, -0.40, 0.84),
    buildParatroopBenchSegment(M, 1, -1.50, -1.12)
  );

  // Piso elevado de cabina de mando + mamparo con vano real de paso
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.04, 0.036, 0.96), M.nonSlipDeck, 0, 0.98, 2.30, false));
  const bulkheadShape = new THREE.Shape();
  for (let i = 0; i <= 36; i++) {
    const p = hullAt(1.82, (i / 36) * TAU);
    const y = Math.max(RAW_FLOOR_Y + 0.01, centerY(1.82) + (p.y - centerY(1.82)) * 0.96);
    if (i === 0) bulkheadShape.moveTo(p.x * 0.96, y);
    else bulkheadShape.lineTo(p.x * 0.96, y);
  }
  const doorway = new THREE.Path();
  doorway.moveTo(-0.22, RAW_FLOOR_Y + 0.02);
  doorway.lineTo(0.22, RAW_FLOOR_Y + 0.02);
  doorway.lineTo(0.22, 1.48);
  doorway.lineTo(-0.22, 1.48);
  doorway.closePath();
  bulkheadShape.holes.push(doorway);
  scaledAirframe.add(makeMesh(new THREE.ShapeGeometry(bulkheadShape, 6), M.interiorDouble, 0, 0, 1.82, false));

  // Costillas estructurales internas y plafones luminosos de bodega
  for (const rz of [-1.48, -0.36, 0.30, 0.92, 1.58]) {
    const aMax = angleWhere(rz, 0, Math.PI, (p) => RAW_FLOOR_Y + 0.04 - p.y);
    const cy = centerY(rz);
    scaledAirframe.add(
      tubeMesh(
        sampleLine(16, (t) => {
          const p = hullAt(rz, lerp(-aMax, aMax, t));
          return p.add(new THREE.Vector3(-p.x, cy - p.y, 0).normalize().multiplyScalar(0.032));
        }),
        0.015,
        M.interior
      )
    );
  }
  for (const lz of [-1.05, 0.35]) {
    scaledAirframe.add(makeMesh(roundedBox(0.18, 0.024, 0.08, 0.006), M.cabinLamp, 0, 1.88, lz, false));
  }

  // Pilotos, asientos blindados, cuernos de mando, cuadrante de gases, HUDs y pantallas MFD emisivas
  for (const px of [-0.27, 0.27]) {
    const cSeat = buildArmoredCockpitSeat(M, 1.0);
    cSeat.position.set(px, 1.14, 2.42);
    const pilot = buildFlightCrewFigure(M, true, 1.0);
    pilot.position.set(px, 1.14, 2.42);
    scaledAirframe.add(cSeat, pilot);

    scaledAirframe.add(
      tubeMesh(
        [new THREE.Vector3(px, 1.0, 2.60), new THREE.Vector3(px, 1.18, 2.58), new THREE.Vector3(px, 1.27, 2.55)],
        0.012,
        M.cockpitSeatBlack
      )
    );
    scaledAirframe.add(makeMesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI), M.cockpitSeatBlack, px, 1.28, 2.55));
    const hudGlass = makeMesh(new THREE.PlaneGeometry(0.11, 0.08), M.hudGlass, px, 1.34, 2.64, false);
    hudGlass.rotation.x = -0.30;
    scaledAirframe.add(hudGlass, makeMesh(roundedBox(0.10, 0.028, 0.06), M.cockpitSeatBlack, px, 1.29, 2.66));
  }

  scaledAirframe.add(makeMesh(roundedBox(0.18, 0.16, 0.42), M.cockpitSeatBlack, 0, 1.08, 2.42));
  for (let i = 0; i < 4; i++) {
    const throttleLever = makeMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), M.chrome, -0.045 + i * 0.03, 1.19, 2.47);
    throttleLever.rotation.x = 0.42;
    scaledAirframe.add(throttleLever);
  }
  const instPanel = makeMesh(roundedBox(0.90, 0.16, 0.06, 0.018), M.cockpitSeatBlack, 0, 1.20, 2.68);
  instPanel.rotation.x = -0.25;
  instPanel.add(makeMesh(new THREE.PlaneGeometry(0.84, 0.12), M.mfdScreen, 0, 0, 0.032, false));
  scaledAirframe.add(instPanel);

  // 4. Armamento lateral articulado (GAU-12 25mm + Obús M102 105mm) y artilleros
  const rotaryMount = buildArticulatedSideWeapon('rotary', PORTS.rotary.z, M);
  const howitzerMount = buildArticulatedSideWeapon('howitzer', PORTS.howitzer.z, M);
  scaledAirframe.add(rotaryMount.base, rotaryMount.state.pan, howitzerMount.base, howitzerMount.state.pan);

  const gunner = buildFlightCrewFigure(M, false, 0.95);
  gunner.position.set(0.24, RAW_FLOOR_Y, PORTS.rotary.z - 0.14);
  gunner.rotation.y = Math.PI / 2;
  scaledAirframe.add(gunner);

  for (let i = 0; i < 4; i++) {
    const shell = new THREE.Group();
    shell.add(makeMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.22, 8), M.brass, 0, 0.11, 0));
    shell.add(makeMesh(new THREE.ConeGeometry(0.024, 0.075, 8), M.ordnanceOlive, 0, 0.255, 0));
    shell.position.set(0.38 + (i % 2) * 0.065, RAW_FLOOR_Y + 0.01, -0.44 + Math.floor(i / 2) * 0.075);
    scaledAirframe.add(shell);
  }

  // 5. Alas integradas con carenados suaves de raíz, tanques externos, 4 turbopropulsores y cola
  const wingY = FUS_Y + 0.78;
  const propUnits = [];
  for (const side of [1, -1]) {
    scaledAirframe.add(
      makeMesh(
        createWingGeometry({
          span: 0.72,
          rootChord: 2.48,
          tipChord: 1.45,
          side,
          rootThickness: 0.48,
          tipThickness: 0.20,
          dihedralY: 0.07,
          sweepZ: 0,
          camber: 0.025
        }),
        M.ac130Paint,
        0,
        FUS_Y + 0.71,
        0.32
      ),
      makeMesh(
        createWingGeometry({
          span: 3.72,
          rootChord: 1.45,
          tipChord: 0.74,
          sweepZ: -0.24,
          dihedralY: -0.10,
          rootThickness: 0.20,
          tipThickness: 0.08,
          camber: 0.025,
          side
        }),
        M.ac130Paint,
        side * 0.72,
        wingY,
        0.32
      )
    );

    const extTank = makeMesh(
      createLoftedFuselage(
        [-0.5, -0.3, 0.2, 0.5].map((z, i) => ({
          z: z * 1.52,
          halfWidth: [0.03, 0.15, 0.155, 0.03][i],
          topHeight: [0.03, 0.16, 0.165, 0.03][i],
          bottomHeight: [0.03, 0.16, 0.165, 0.03][i]
        })),
        16
      ),
      M.ac130Paint,
      side * 2.32,
      FUS_Y + 0.45,
      0.35
    );
    const tankPylon = makeMesh(roundedBox(0.06, 0.36, 0.50, 0.024), M.ac130Paint, side * 2.32, FUS_Y + 0.62, 0.32);
    scaledAirframe.add(extTank, tankPylon);
    scaledAirframe.add(
      makeMesh(
        new THREE.SphereGeometry(0.038, 8, 6),
        side > 0 ? M.navRed : M.navGreen,
        side * 4.42,
        wingY - 0.37,
        0.13,
        false
      )
    );

    [1.62, 3.02].forEach((ex, idx) => {
      const tp = buildAE2100Turboprop(M, blurMat);
      tp.group.position.set(side * ex, FUS_Y + 0.66 - idx * 0.04, 0.86 - idx * 0.08);
      scaledAirframe.add(tp.group);
      propUnits.push(tp);
    });

    scaledAirframe.add(
      makeMesh(
        createWingGeometry({
          span: 1.65,
          rootChord: 1.02,
          tipChord: 0.55,
          sweepZ: -0.22,
          rootThickness: 0.10,
          tipThickness: 0.05,
          camber: 0,
          side
        }),
        M.ac130Paint,
        side * 0.28,
        FUS_Y + 0.46,
        -3.28
      )
    );
  }

  // Estabilizador vertical + carenado dorsal suave (dorsal fillet)
  const vFin = makeMesh(
    createWingGeometry({
      span: 1.98,
      rootChord: 1.68,
      tipChord: 0.72,
      sweepZ: -0.68,
      rootThickness: 0.14,
      tipThickness: 0.06,
      camber: 0,
      side: 1
    }),
    M.ac130Paint,
    0,
    FUS_Y + 0.48,
    -3.02
  );
  vFin.rotation.z = Math.PI / 2;
  scaledAirframe.add(
    vFin,
    makeMesh(
      createLoftedFuselage(
        [
          { z: -3.65, halfWidth: 0.055, topHeight: 0.71, bottomHeight: 0.13, yCenter: 1.75 },
          { z: -2.92, halfWidth: 0.14, topHeight: 0.76, bottomHeight: 0.21, yCenter: 1.76 },
          { z: -2.46, halfWidth: 0.167, topHeight: 0.50, bottomHeight: 0.19, yCenter: 1.78 },
          { z: -1.86, halfWidth: 0.15, topHeight: 0.20, bottomHeight: 0.18, yCenter: 1.84 },
          { z: -1.28, halfWidth: 0.06, topHeight: 0.04, bottomHeight: 0.12, yCenter: 1.91 }
        ],
        20
      ),
      M.ac130Paint
    )
  );

  // Carenados inferiores de tren principal + torreta electroóptica FLIR
  for (const s of [-1, 1]) {
    const sponson = makeMesh(
      createLoftedFuselage(
        [
          { z: -1.15, halfWidth: 0.06, topHeight: 0.07, bottomHeight: 0.07 },
          { z: -0.60, halfWidth: 0.22, topHeight: 0.17, bottomHeight: 0.19, squareness: 0.4 },
          { z: 0.65, halfWidth: 0.22, topHeight: 0.17, bottomHeight: 0.19, squareness: 0.4 },
          { z: 1.30, halfWidth: 0.05, topHeight: 0.06, bottomHeight: 0.06 }
        ],
        16
      ),
      M.ac130Paint,
      s * 0.74,
      0.50,
      0.05
    );
    scaledAirframe.add(sponson);
    for (const gz of [-0.25, 0.28]) {
      scaledAirframe.add(buildOleoWheelAssembly(M, new THREE.Vector3(s * 0.90, 0.48, gz), 0.18, true));
    }
  }
  scaledAirframe.add(buildOleoWheelAssembly(M, new THREE.Vector3(0, 0.56, 2.45), 0.14, true));

  const sensorYaw = new THREE.Group();
  sensorYaw.position.set(0.40, 0.43, 1.95);
  const sensorPitch = new THREE.Group();
  sensorYaw.add(makeMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 10), M.weaponSteel, 0, 0.04, 0), sensorPitch);
  sensorPitch.add(makeMesh(new THREE.SphereGeometry(0.075, 14, 10), M.ac130Trim));
  const flirLens = zCylinder(0.032, 0.032, 0.022, M.opticEmerald, 12);
  flirLens.position.z = 0.064;
  sensorPitch.add(flirLens);
  scaledAirframe.add(sensorYaw);

  // 6. Rampa trasera hidráulica y puerta lateral de paracaidistas con bisagra en el borde y pistones telescópicos
  const rampEdgeAngle = (z) =>
    angleWhere(z, Math.PI, Math.PI / 2, (p) => Math.max(Math.abs(p.x) - RAMP.halfWidth, p.y - rampTop(z)));
  const rampAt = (u, v) => {
    const z = lerp(RAMP.z0, RAMP.z1, u);
    const a = rampEdgeAngle(z);
    return hullAt(z, lerp(a, TAU - a, v));
  };
  const rampHinge = hullAt(RAMP.z0, Math.PI);
  const rampPivot = new THREE.Group();
  rampPivot.position.copy(rampHinge);
  const rampGeo = orientOutward(parametricPatch(rampAt, 14, 10), centerY).translate(
    -rampHinge.x,
    -rampHinge.y,
    -rampHinge.z
  );
  rampPivot.add(makeMesh(rampGeo, M.ac130Paint), new THREE.Mesh(rampGeo, M.liningBack));
  // Plancha antideslizante interior sobre la rampa para el paso limpio de los jugadores
  const rampWalkDeck = makeMesh(roundedBox(1.06, 0.022, 1.42, 0.006), M.nonSlipDeck, 0, 0.12, -0.72, false);
  rampWalkDeck.rotation.x = -0.16;
  rampPivot.add(rampWalkDeck);

  const rampPerimeter = [
    ...sampleLine(8, (t) => rampAt(t, 0)),
    ...sampleLine(8, (t) => rampAt(1, t)),
    ...sampleLine(8, (t) => rampAt(1 - t, 1)),
    ...sampleLine(8, (t) => rampAt(0, 1 - t))
  ];
  rampPivot.add(tubeMesh(rampPerimeter.map((p) => p.clone().sub(rampHinge)), 0.012, M.ac130Trim, true));
  scaledAirframe.add(tubeMesh(rampPerimeter, 0.019, M.ac130Trim, true), rampPivot);

  for (let i = 0; i < 6; i++) {
    const knuckle = makeMesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8),
      M.weaponSteel,
      -0.45 + i * 0.18,
      rampHinge.y + 0.01,
      RAMP.z0
    );
    knuckle.rotation.z = Math.PI / 2;
    scaledAirframe.add(knuckle);
  }

  const doorHinge = sidePoint(DOOR.z1, (DOOR.y0 + DOOR.y1) * 0.5, -1);
  const sideDoorPivot = new THREE.Group();
  sideDoorPivot.position.copy(doorHinge);
  const doorAt = (u, v) => sidePoint(lerp(DOOR.z1, DOOR.z0, u), lerp(DOOR.y0, DOOR.y1, v), -1);
  const doorGeo = orientOutward(parametricPatch(doorAt, 6, 8), centerY).translate(
    -doorHinge.x,
    -doorHinge.y,
    -doorHinge.z
  );
  sideDoorPivot.add(makeMesh(doorGeo, M.ac130Paint), new THREE.Mesh(doorGeo, M.liningBack));
  sideDoorPivot.add(tubeMesh(sideLoop(-1, DOOR).map((p) => p.clone().sub(doorHinge)), 0.012, M.ac130Trim, true));
  scaledAirframe.add(sideDoorPivot);

  const pistons = [];
  const rampSurfacePt = (z, x) => hullAt(z, angleWhere(z, Math.PI, Math.PI / 2, (p) => p.x - x));
  for (const px of [-0.48, 0.48]) {
    const bLocal = rampSurfacePt(-2.35, Math.abs(px)).setX(px).add(new THREE.Vector3(0, 0.05, 0)).sub(rampHinge);
    const aLocal = new THREE.Vector3(px, 1.18, -1.72);
    const closedLen = aLocal.distanceTo(bLocal.clone().add(rampHinge));
    const piston = new TelescopicPiston(scaledAirframe, aLocal, rampPivot, bLocal, closedLen, 0.022, M);
    scaledAirframe.add(piston.group);
    pistons.push(piston);
  }
  {
    const bDoor = sidePoint(-1.15, 1.35, -1).add(new THREE.Vector3(0.05, 0, 0)).sub(doorHinge);
    const aDoor = new THREE.Vector3(-0.62, 1.42, -0.80);
    const closedLen = aDoor.distanceTo(bDoor.clone().add(doorHinge));
    const doorPiston = new TelescopicPiston(scaledAirframe, aDoor, sideDoorPivot, bDoor, closedLen, 0.014, M);
    scaledAirframe.add(doorPiston.group);
    pistons.push(doorPiston);
  }

  // Luz ambiental tenue de bodega registrada en el pool de luces del mundo (persistente)
  if (addLightAnchorFn) {
    addLightAnchorFn(root, '#ffd699', 1.35, 15, 2, 0, 1.65, -0.5, true);
  }

  const gunMounts = [rotaryMount.state, howitzerMount.state];
  const dynamicList = [
    cabinBayGroup,
    rampPivot,
    sideDoorPivot,
    sensorYaw,
    sensorPitch,
    ...propUnits.flatMap((u) => [u.propRotor, u.blurDisc]),
    ...pistons.flatMap((p) => [p.group, p.rod, p.eye]),
    ...gunMounts.flatMap((g) => [g.pan, g.tilt, g.recoil, g.feed, g.flash, ...(g.spinCluster ? [g.spinCluster] : [])])
  ];

  bakeRigidAircraftBatches(scaledAirframe, dynamicList);

  const state = {
    throttle: 0.92,
    rpm: 0.68,
    rampTarget: 1.0,
    rampOpen: 0.15,
    scanClock: 0
  };

  // Posición inicial abierta de pistones
  rampPivot.rotation.x = -0.34 * easeInOutCubic(state.rampOpen);
  root.updateMatrixWorld(true);
  for (const p of pistons) p.update();

  return {
    id: 'ac130',
    label: 'AC-130J Ghostrider',
    group: root,
    cabinBayGroup,
    rampExitBackDist: 7.75,
    rampExitDropY: -1.48,
    cameraInteriorAnchor: new THREE.Vector3(0, 0.52, 2.2),
    cameraExteriorDistance: 25.0,

    resetFlight() {
      state.rpm = 0.62;
      state.throttle = 0.96;
      state.rampOpen = 0.08;
      state.rampTarget = 1.0;
      state.scanClock = 0;
    },

    getSeatLocalPose(seatIndex = 0) {
      const slot = AC130_TROOP_SEATS_RAW[seatIndex % AC130_TROOP_SEATS_RAW.length];
      return {
        x: slot.x * AC130_SCALE,
        y: AC130_CABIN_FLOOR_LOCAL_Y,
        z: slot.z * AC130_SCALE,
        yaw: slot.side < 0 ? Math.PI / 2 : -Math.PI / 2,
        side: slot.side
      };
    },

    /**
     * Devuelve la pose local (dentro de `cabinBayGroup`) para toda la secuencia de desembarco:
     * phase: 'sit' -> 'stand' (0..0.24) -> 'walk_cabin' (0.24..0.82) -> 'ramp_jump' (0.82..1.0)
     */
    sampleDisembarkLocalPose(seatIndex = 0, normProgress = 0) {
      const seat = this.getSeatLocalPose(seatIndex);
      const p = clamp(normProgress, 0, 1);
      const rampThresholdZ = RAMP.z0 * AC130_SCALE; // -3.95m (inicio de rampa)
      const rampLipZ = -7.55;                       // borde exterior de la rampa abierta
      const rampLipY = AC130_CABIN_FLOOR_LOCAL_Y - 0.56 * easeInOutCubic(state.rampOpen);

      if (p <= 0.001) {
        return {
          x: seat.x,
          y: seat.y,
          z: seat.z,
          yaw: seat.yaw,
          phase: 'sit',
          standBlend: 0,
          walkCycle: 0
        };
      }

      if (p < 0.24) {
        // 1. Incorporarse suavemente desde el asiento hacia el pasillo central (~0.35s)
        const u = easeInOutCubic(p / 0.24);
        const targetYaw = Math.PI; // mirando hacia la rampa trasera (-Z)
        return {
          x: lerp(seat.x, seat.side * 0.16, u),
          y: seat.y,
          z: seat.z,
          yaw: lerpAngleShort(seat.yaw, targetYaw, u),
          phase: 'stand',
          standBlend: u,
          walkCycle: u * 1.6
        };
      }

      if (p < 0.82) {
        // 2. Caminar por el pasillo central despejado hasta el umbral de la rampa trasera
        const u = (p - 0.24) / 0.58;
        const aisleX = lerp(seat.side * 0.16, (seatIndex % 2 === 0 ? -0.14 : 0.14), Math.min(1, u * 2.5));
        const curZ = lerp(seat.z, rampThresholdZ - 0.85, u);
        const onRampFrac = clamp((rampThresholdZ - curZ) / Math.max(0.1, rampThresholdZ - rampLipZ), 0, 1);
        return {
          x: aisleX,
          y: lerp(seat.y, rampLipY, onRampFrac),
          z: curZ,
          yaw: Math.PI,
          phase: 'walk_cabin',
          standBlend: 1,
          walkCycle: 1.6 + u * 14.5
        };
      }

      // 3. Impulso y salto hacia el vacío en el labio de la rampa abierta (ramp_jump)
      const u = easeInOutCubic((p - 0.82) / 0.18);
      const startZ = rampThresholdZ - 0.85;
      const zNow = lerp(startZ, rampLipZ - 0.45, u);
      const arcLift = Math.sin(u * Math.PI) * 0.34;
      return {
        x: seatIndex % 2 === 0 ? -0.16 : 0.16,
        y: lerp(seat.y - 0.12, rampLipY - 0.18, u) + arcLift,
        z: zNow,
        yaw: Math.PI,
        phase: 'ramp_jump',
        standBlend: 1,
        walkCycle: 16.1 + u * 3.0
      };
    },

    update(delta, flightContext = null) {
      const dt = Math.min(0.1, Math.max(0, delta));
      state.scanClock += dt;

      // Aceleración e inercia de RPM en las 4 hélices + ligera inclinación según empuje/maniobra + disco blur
      const bankRoll = flightContext?.roll || 0;
      state.throttle = 0.94 + Math.sin(state.scanClock * 0.9) * 0.05;
      const lag = state.throttle - state.rpm;
      state.rpm = dampValue(state.rpm, state.throttle, lag > 0 ? 1.3 : 0.7, dt);

      const omega = state.rpm * 36.0;
      for (let i = 0; i < propUnits.length; i++) {
        const u = propUnits[i];
        u.propRotor.rotation.z += omega * dt * (i % 2 === 0 ? 1 : 1.02);
        u.propRotor.rotation.x = dampValue(u.propRotor.rotation.x, lag * 0.14 + bankRoll * 0.18, 4.0, dt);
      }
      blurMat.opacity = THREE.MathUtils.smoothstep(state.rpm, 0.42, 0.95) * 0.34;

      // Rampa trasera y puerta lateral hidráulica con easing suave y pistones telescópicos sincronizados
      state.rampOpen = approachValue(state.rampOpen, state.rampTarget, dt * 0.48);
      const easedRamp = easeInOutCubic(state.rampOpen);
      rampPivot.rotation.x = -0.36 * easedRamp; // inclinación de salto limpia sin cruzar el fuselaje
      sideDoorPivot.rotation.y = 1.38 * easeInOutCubic(clamp(state.rampOpen * 1.25, 0, 1));

      // Barrido suave de sensores FLIR y afustes laterales articulados (pan/tilt + rotación de cañones + retroceso)
      const sweepPan = Math.PI / 2 + Math.sin(state.scanClock * 0.55) * 0.22;
      const sweepTilt = 0.22 + Math.cos(state.scanClock * 0.42) * 0.08;
      sensorYaw.rotation.y = dampValue(sensorYaw.rotation.y, sweepPan - 0.25, 4.0, dt);
      sensorPitch.rotation.x = dampValue(sensorPitch.rotation.x, sweepTilt + 0.18, 4.0, dt);

      for (const gm of gunMounts) {
        gm.pan.rotation.y = dampValue(gm.pan.rotation.y, sweepPan, 3.5, dt);
        gm.tilt.rotation.x = dampValue(gm.tilt.rotation.x, sweepTilt, 3.5, dt);

        if (gm.kind === 'rotary' && gm.spinCluster) {
          gm.spinRate = dampValue(gm.spinRate, 26.0, 2.5, dt);
          gm.spinCluster.rotation.z += gm.spinRate * dt;
          gm.burstClock -= dt;
          if (gm.burstClock <= 0) {
            gm.burstClock = 2.6 + (state.scanClock % 0.7);
            gm.recoilOffset = 0.024;
            gm.flashLevel = 0.85;
          }
          gm.recoilOffset = dampValue(gm.recoilOffset, 0, 16.0, dt);
        } else {
          gm.burstClock -= dt;
          if (gm.burstClock <= 0) {
            gm.burstClock = 4.4;
            gm.recoilOffset = 0.12;
            gm.flashLevel = 0.95;
          }
          gm.recoilOffset = dampValue(gm.recoilOffset, 0, 3.4, dt);
        }

        gm.recoil.position.z = -gm.recoilOffset;
        gm.flashLevel = Math.max(0, gm.flashLevel - dt * (gm.kind === 'rotary' ? 14 : 7));
        gm.flashMat.opacity = gm.flashLevel * 0.82;
        gm.flash.visible = gm.flashLevel > 0.02;
        if (gm.flash.visible) {
          gm.flash.scale.setScalar(0.55 + gm.flashLevel * 0.65);
        }
      }

      scaledAirframe.updateMatrixWorld(true);
      for (let i = 0; i < pistons.length; i++) {
        pistons[i].update();
      }
    }
  };
}

function lerpAngleShort(a, b, t) {
  let diff = ((b - a + Math.PI) % TAU) - Math.PI;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}
