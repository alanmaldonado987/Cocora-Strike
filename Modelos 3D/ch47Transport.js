// Modelos 3D/ch47Transport.js
// Módulo 2: Transporte Pesado en Tándem CH-47F Chinook (adaptado de "Modelos 3D/Aviones v1/src/models/vehicles/CH47Chinook.ts")
// Escala métrica real para personajes de 1.80m (CH47_SCALE = 2.55 -> ~15.3m fuselaje, piso de bodega en localY = -1.14m):
// - Casco coronado aerodinámico con carenados laterales de combustible (sponsons), pilones delantero/trasero y túnel dorsal.
// - Aberturas reales recortadas (clipGeometry) sin Z-fighting para parabrisas, claraboyas, estaciones de tiro M134,
//   puerta lateral de tropa y portal trasero de rampa de asalto.
// - Cabina conectada con vidrio semitransparente (opacity: 0.35, roughness: 0.1, depthWrite: false), pilotos, controles y MFDs.
// - Rotores gemelos contrarrotativos sincronizados de 3 palas con plato cíclico, links de paso, inercia de RPM y disco motion-blur.
// - Rampa trasera hidráulica y puerta lateral con bisagras en el borde de giro y pistones hidráulicos telescópicos reales.
// - Dos ametralladoras rotativas M134 Minigun de 6 cañones en afustes articulados (pan/tilt) con tambores y cintas internas.

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
  createSmoothFairingGeo,
  createAirfoilBladeGeometry,
  roundedBox,
  makeMesh,
  zCylinder,
  tubeMesh,
  buildFlightCrewFigure,
  buildArmoredCockpitSeat,
  buildOleoWheelAssembly,
  TelescopicPiston,
  bakeRigidAircraftBatches,
  registerSharedAircraftMat,
  createAircraftControls,
  attachAircraftControlApi,
  solveMountAim
} from './avionesShared.js';

export const CH47_SCALE = 2.55;
const FUS_Y = 1.14;
const RAW_FLOOR_Y = 0.64; // fusY - 0.50
export const CH47_CABIN_FLOOR_LOCAL_Y = -1.14;
const MODEL_OFFSET_Y = CH47_CABIN_FLOOR_LOCAL_Y - RAW_FLOOR_Y * CH47_SCALE; // -2.772m

const Z0 = -2.86;
const Z1 = 3.12;

const SECTIONS = [
  { z: -2.86, halfWidth: 0.64, topHeight: 0.62, bottomHeight: 0.44, yCenter: FUS_Y + 0.10, squareness: 0.72 },
  { z: -2.10, halfWidth: 0.74, topHeight: 0.68, bottomHeight: 0.58, yCenter: FUS_Y, squareness: 0.76 },
  { z: 1.85, halfWidth: 0.74, topHeight: 0.68, bottomHeight: 0.58, yCenter: FUS_Y, squareness: 0.76 },
  { z: 2.58, halfWidth: 0.65, topHeight: 0.55, bottomHeight: 0.52, yCenter: FUS_Y - 0.04, squareness: 0.54 },
  { z: 3.12, halfWidth: 0.24, topHeight: 0.20, bottomHeight: 0.24, yCenter: FUS_Y - 0.18, squareness: 0.25 }
];

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

const WIND = { z0: 1.98, z1: 2.94 };
const windLow = (z) => lerp(1.16, 0.94, (z - WIND.z0) / (WIND.z1 - WIND.z0));
const GUN_WIN = { z0: 1.06, z1: 1.54, y0: 0.98, y1: 1.42, z: 1.30 };
const TROOP_DOOR = { z0: 0.34, z1: 0.84, y0: 0.68, y1: 1.50 };
const PORTHOLES_Z = [-1.32, -0.52];
const RAMP = { z0: -2.04, z1: -2.86, halfWidth: 0.56 };

const rectSideOpen = (s, z0, z1, y0, y1) => (p) =>
  Math.max(z0 - p.z, p.z - z1, y0 - p.y, p.y - y1, -s * p.x);

const OPENINGS = [
  // Parabrisas frontal envolvente
  (p) => Math.max(WIND.z0 - p.z, p.z - WIND.z1, windLow(p.z) - p.y),
  // Ventanas abiertas delanteras de artilleros M134 (babor y estribor)
  rectSideOpen(1, GUN_WIN.z0, GUN_WIN.z1, GUN_WIN.y0, GUN_WIN.y1),
  rectSideOpen(-1, GUN_WIN.z0, GUN_WIN.z1, GUN_WIN.y0, GUN_WIN.y1),
  // Puerta lateral derecha de tropa
  rectSideOpen(-1, TROOP_DOOR.z0, TROOP_DOOR.z1, TROOP_DOOR.y0, TROOP_DOOR.y1),
  // Ojos de buey circulares de bodega
  ...PORTHOLES_Z.flatMap((pz) => [
    (p) => Math.max(Math.hypot(p.z - pz, p.y - 1.20) - 0.14, -p.x),
    (p) => Math.max(Math.hypot(p.z - pz, p.y - 1.20) - 0.14, p.x)
  ]),
  // Portal trasero abierto de rampa hidráulica de asalto
  (p) => Math.max(RAMP.z1 - 0.05 - p.z, p.z - RAMP.z0, Math.abs(p.x) - RAMP.halfWidth, p.y - 1.56)
];

const outsideOpenings = (p) => Math.min(...OPENINGS.map((o) => o(p)));

function buildChinookHullGeometry() {
  const nu = 76;
  const nv = 42;
  const g = orientOutward(
    parametricPatch((u, v) => hullAt(lerp(Z0, Z1, u), (v - 0.5) * TAU), nu, nv),
    centerY
  );
  weldSeamNormals(g, nu, nv);

  // Tapar únicamente la punta frontal del morro (z = Z1); la popa (z = Z0) tiene el portal abierto de la rampa
  const clipped = clipGeometry(g, outsideOpenings);
  g.dispose();
  return clipped;
}

function sideLoop(s, o, n = 4) {
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

function buildChinookOpeningTrim(loop, M, depth = 0.06, radius = 0.017) {
  const g = new THREE.Group();
  g.add(tubeMesh(loop, radius, M.ch47Trim, true));
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

/**
 * Cabeza de rotor articulada de 3 palas para el sistema en tándem del CH-47F:
 * plato cíclico fijo + 3 servos cromados + eje giratorio + links de paso + amortiguadores de latón
 * + palas torsionadas con puntas amarillas + disco semitransparente de motion-blur.
 */
function buildTandemRotorAssembly(M, blurMat, rotorRadius = 2.85, mastHeight = 0.44) {
  const group = new THREE.Group();

  // Base estacionaria y actuadores hidráulicos del plato oscilante
  group.add(makeMesh(new THREE.CylinderGeometry(0.16, 0.22, mastHeight * 0.46, 12), M.weaponSteel, 0, mastHeight * 0.23, 0));
  group.add(makeMesh(new THREE.CylinderGeometry(0.28, 0.30, 0.044, 16), M.titanium, 0, mastHeight * 0.48, 0));
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * TAU;
    group.add(
      makeMesh(
        new THREE.CylinderGeometry(0.024, 0.028, mastHeight * 0.46, 8),
        M.chrome,
        Math.cos(a) * 0.23,
        mastHeight * 0.24,
        Math.sin(a) * 0.23
      )
    );
  }

  // Cabeza giratoria jerárquica independiente
  const spinningHead = new THREE.Group();
  spinningHead.add(makeMesh(new THREE.CylinderGeometry(0.095, 0.095, mastHeight, 12), M.chrome, 0, mastHeight * 0.5, 0));
  spinningHead.add(makeMesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 16), M.burntTitanium, 0, mastHeight * 0.55, 0));
  spinningHead.add(makeMesh(new THREE.CylinderGeometry(0.32, 0.28, 0.11, 12), M.weaponSteel, 0, mastHeight, 0));

  const bladeLen = rotorRadius - 0.42;
  const bladeGeo = createAirfoilBladeGeometry(bladeLen, 0.26, true, 0);

  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 3) * TAU;

    arm.add(makeMesh(roundedBox(0.16, 0.09, 0.32), M.titanium, 0, mastHeight, 0.36));
    const pitchLink = makeMesh(new THREE.CylinderGeometry(0.014, 0.014, mastHeight * 0.46, 6), M.chrome, 0.09, mastHeight * 0.77, 0.24);
    pitchLink.rotation.z = -0.12;
    arm.add(pitchLink);

    const damper = makeMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 8), M.brass, -0.14, mastHeight, 0.33);
    damper.rotation.z = Math.PI / 2;
    damper.rotation.y = 0.52;
    arm.add(damper);

    const blade = makeMesh(bladeGeo, M.bladeVertexMat, 0, mastHeight, 0.42);
    blade.rotation.x = Math.PI / 2;
    arm.add(blade);

    spinningHead.add(arm);
  }
  group.add(spinningHead);

  // Disco horizontal de motion-blur a altas RPM
  const blurDisc = makeMesh(new THREE.CircleGeometry(rotorRadius * 0.98, 36), blurMat, 0, mastHeight + 0.02, 0, false);
  blurDisc.rotation.x = -Math.PI / 2;
  blurDisc.renderOrder = 4;
  group.add(blurDisc);

  return { group, spinningHead, blurDisc };
}

/**
 * Afuste articulado M134 Minigun de 6 cañones para las ventanas delanteras del CH-47F:
 * pedestal anclado al piso/marco interior, tambor de 4.000 cartuchos y cinta flexible dentro de cabina,
 * y racimo giratorio de 6 cañones sobresaliendo al exterior.
 */
function buildWindowM134Station(side, zPos, M) {
  const mountX = side * 0.64;
  const mountY = 1.12;

  const base = new THREE.Group();
  base.add(makeMesh(roundedBox(0.18, 0.026, 0.20), M.weaponSteel, side * 0.58, RAW_FLOOR_Y + 0.026, zPos));
  base.add(
    tubeMesh(
      [
        new THREE.Vector3(side * 0.58, RAW_FLOOR_Y + 0.03, zPos),
        new THREE.Vector3(side * 0.62, 0.90, zPos),
        new THREE.Vector3(mountX, mountY - 0.04, zPos)
      ],
      0.018,
      M.weaponSteel
    )
  );

  // Tambor interno de munición + cinta flexible de eslabones de latón visible dentro de la cabina
  const drumGroup = new THREE.Group();
  drumGroup.position.set(side * 0.50, RAW_FLOOR_Y + 0.22, zPos - 0.08);
  drumGroup.add(makeMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 14), M.ordnanceOlive));
  drumGroup.add(makeMesh(new THREE.CylinderGeometry(0.134, 0.134, 0.08, 14), M.brass, 0, 0.06, 0));
  drumGroup.add(makeMesh(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 14), M.warningYellow, 0, -0.09, 0));
  base.add(drumGroup);

  base.add(
    tubeMesh(
      [
        new THREE.Vector3(side * 0.50, RAW_FLOOR_Y + 0.38, zPos - 0.08),
        new THREE.Vector3(side * 0.58, 0.98, zPos - 0.03),
        new THREE.Vector3(mountX, mountY - 0.02, zPos)
      ],
      0.026,
      M.titanium
    )
  );
  for (let s = 0; s < 4; s++) {
    base.add(
      makeMesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6),
        M.brass,
        lerp(side * 0.52, mountX, (s + 1) / 5),
        lerp(RAW_FLOOR_Y + 0.44, mountY - 0.03, (s + 1) / 5),
        zPos - 0.04 + s * 0.01
      )
    );
  }

  const pan = new THREE.Group();
  pan.position.set(mountX, mountY, zPos);
  pan.rotation.y = side * 1.18;

  const tilt = new THREE.Group();
  tilt.rotation.x = 0.18;
  pan.add(tilt);

  const recoil = new THREE.Group();
  tilt.add(recoil);

  // Cajón del motor eléctrico M134 y empuñaduras tipo pala dentro de la ventana
  const receiver = makeMesh(new THREE.CylinderGeometry(0.062, 0.065, 0.26, 12), M.weaponSteel, 0, 0, -0.11);
  receiver.rotation.x = Math.PI / 2;
  recoil.add(receiver);
  const feederMotor = makeMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.20, 8), M.titanium, side * 0.055, 0.03, -0.10);
  feederMotor.rotation.x = Math.PI / 2;
  recoil.add(feederMotor);

  const spinCluster = new THREE.Group();
  spinCluster.position.z = 0.02;
  recoil.add(spinCluster);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const b = zCylinder(0.011, 0.010, 0.62, M.weaponSteel, 8);
    b.position.set(Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0);
    spinCluster.add(b);
  }
  for (const cz of [0.20, 0.44, 0.58]) {
    const clampDisc = zCylinder(0.054, 0.054, 0.022, M.titanium, 12);
    clampDisc.position.z = cz;
    spinCluster.add(clampDisc);
  }

  const flashMat = registerSharedAircraftMat(M.muzzleFlashTemplate.clone());
  const flashGeo = new THREE.ConeGeometry(0.048, 0.18, 8, 1, true);
  flashGeo.rotateX(Math.PI / 2);
  const flash = makeMesh(flashGeo, flashMat, 0, 0, 0.72, false);
  flash.renderOrder = 5;
  recoil.add(flash);

  return {
    base,
    state: {
      side,
      pan,
      tilt,
      recoil,
      spinCluster,
      flash,
      flashMat,
      recoilOffset: 0,
      flashLevel: 0,
      burstClock: side > 0 ? 0.6 : 1.9,
      spinRate: 28
    }
  };
}

// 10 asientos laterales en los bancos de lona roja de la bodega del CH-47F
const CH47_TROOP_SEATS_RAW = [
  { x: -0.50, z: 0.10, side: -1 },
  { x: 0.50, z: 0.62, side: 1 },
  { x: -0.50, z: -0.36, side: -1 },
  { x: 0.50, z: 0.14, side: 1 },
  { x: -0.50, z: -0.82, side: -1 },
  { x: 0.50, z: -0.34, side: 1 },
  { x: -0.50, z: -1.28, side: -1 },
  { x: 0.50, z: -0.82, side: 1 },
  { x: -0.50, z: -1.72, side: -1 },
  { x: 0.50, z: -1.32, side: 1 }
];

function buildChinookTroopBench(M, xSide, zStart, zEnd) {
  const g = new THREE.Group();
  const len = Math.abs(zEnd - zStart);
  const zMid = (zStart + zEnd) * 0.5;
  const seatX = xSide * 0.52;
  const backX = xSide * 0.64;

  g.add(makeMesh(roundedBox(0.19, 0.024, len, 0.008), M.troopWebbingRed, seatX, RAW_FLOOR_Y + 0.175, zMid));
  g.add(makeMesh(roundedBox(0.022, 0.24, len * 0.96, 0.006), M.troopWebbingRed, backX, RAW_FLOOR_Y + 0.36, zMid));

  const posts = Math.max(2, Math.round(len / 0.52) + 1);
  for (let i = 0; i < posts; i++) {
    const lz = lerp(zStart + 0.05, zEnd - 0.05, i / Math.max(1, posts - 1));
    g.add(makeMesh(new THREE.CylinderGeometry(0.010, 0.010, 0.17, 6), M.titanium, seatX - xSide * 0.06, RAW_FLOOR_Y + 0.088, lz));
    g.add(makeMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), M.titanium, backX, RAW_FLOOR_Y + 0.32, lz));
  }
  return g;
}

/**
 * Construye el helicóptero de transporte pesado CH-47F Chinook con rotores sincronizados,
 * cabina/bodega conectadas (`cabinBayGroup`) y método `update(delta, flightContext)`.
 */
export function buildCH47Transport(addLightAnchorFn = null) {
  const M = getAircraftMaterials();
  const root = new THREE.Group();
  root.name = 'CH47F_Transport';

  const scaledAirframe = new THREE.Group();
  scaledAirframe.scale.setScalar(CH47_SCALE);
  scaledAirframe.position.y = MODEL_OFFSET_Y;
  root.add(scaledAirframe);

  const cabinBayGroup = new THREE.Group();
  cabinBayGroup.name = 'CH47F_CabinBay';
  root.add(cabinBayGroup);

  const blurMat = registerSharedAircraftMat(M.rotorBlurTemplate.clone());

  // 1. Casco coronado con aberturas reales recortadas + forro interior BackSide (Cero Z-Fighting)
  const hullGeo = buildChinookHullGeometry();
  const outerHull = makeMesh(hullGeo, M.ch47Paint);
  const innerLining = new THREE.Mesh(hullGeo, M.liningBack);
  innerLining.receiveShadow = true;
  scaledAirframe.add(outerHull, innerLining);

  // Cúpula frontal de radar meteorológico cerrando limpiamente el morro (z = 3.12)
  const noseRadome = makeMesh(new THREE.SphereGeometry(0.24, 14, 12), M.apacheWreckDark, 0, FUS_Y - 0.18, 3.13);
  scaledAirframe.add(noseRadome);

  // Túnel dorsal carenado del eje de sincronización + pilones aerodinámicos delantero y trasero
  scaledAirframe.add(makeMesh(createSmoothFairingGeo(0.42, 0.28, 4.70, 0.42, 18), M.ch47Paint, 0, FUS_Y + 0.74, -0.15));

  const fwdPylon = makeMesh(
    createLoftedFuselage(
      [
        { z: 0.90, halfWidth: 0.06, topHeight: 0.04, bottomHeight: 0.06, yCenter: FUS_Y + 0.66 },
        { z: 1.62, halfWidth: 0.34, topHeight: 0.52, bottomHeight: 0.05, yCenter: FUS_Y + 0.66, squareness: 0.40 },
        { z: 2.15, halfWidth: 0.36, topHeight: 0.62, bottomHeight: 0.05, yCenter: FUS_Y + 0.66, squareness: 0.35 },
        { z: 2.48, halfWidth: 0.24, topHeight: 0.28, bottomHeight: 0.05, yCenter: FUS_Y + 0.64, squareness: 0.30 },
        { z: 2.60, halfWidth: 0.06, topHeight: 0.04, bottomHeight: 0.08, yCenter: FUS_Y + 0.50 }
      ],
      16
    ),
    M.ch47Paint
  );
  const aftPylon = makeMesh(
    createLoftedFuselage(
      [
        { z: -3.02, halfWidth: 0.10, topHeight: 0.78, bottomHeight: 0.12, yCenter: FUS_Y + 0.68 },
        { z: -2.86, halfWidth: 0.26, topHeight: 1.06, bottomHeight: 0.06, yCenter: FUS_Y + 0.66, squareness: 0.35 },
        { z: -2.35, halfWidth: 0.42, topHeight: 1.12, bottomHeight: 0.05, yCenter: FUS_Y + 0.62, squareness: 0.40 },
        { z: -1.45, halfWidth: 0.36, topHeight: 0.25, bottomHeight: 0.05, yCenter: FUS_Y + 0.62, squareness: 0.40 },
        { z: -1.02, halfWidth: 0.08, topHeight: 0.05, bottomHeight: 0.08, yCenter: FUS_Y + 0.66 }
      ],
      16
    ),
    M.ch47Paint
  );
  scaledAirframe.add(fwdPylon, aftPylon);

  // Sponsons inferiores de combustible integrados + marcas tácticas
  for (const sx of [-0.82, 0.82]) {
    const sponson = makeMesh(
      createLoftedFuselage(
        [
          { z: -2.02, halfWidth: 0.12, topHeight: 0.14, bottomHeight: 0.14 },
          { z: -1.20, halfWidth: 0.26, topHeight: 0.26, bottomHeight: 0.26, squareness: 0.44 },
          { z: 1.35, halfWidth: 0.26, topHeight: 0.26, bottomHeight: 0.26, squareness: 0.44 },
          { z: 2.02, halfWidth: 0.11, topHeight: 0.13, bottomHeight: 0.13 }
        ],
        14
      ),
      M.ch47Paint,
      sx,
      FUS_Y - 0.42,
      -0.22
    );
    scaledAirframe.add(sponson);
  }

  const armyMarkL = makeMesh(new THREE.PlaneGeometry(0.88, 0.17), createTacticalStencilMaterial('AVIACIÓN · CH-47F', true), 0.768, 1.48, -0.35, false);
  armyMarkL.rotation.y = Math.PI / 2;
  const armyMarkR = makeMesh(new THREE.PlaneGeometry(0.88, 0.17), createTacticalStencilMaterial('AVIACIÓN · CH-47F', true), -0.768, 1.48, -0.35, false);
  armyMarkR.rotation.y = -Math.PI / 2;
  scaledAirframe.add(armyMarkL, armyMarkR);

  // 2. Parabrisas transparente con marcos estructurales limpios (opacity 0.35, roughness 0.1, depthWrite false)
  const windAngle = (z) => angleWhere(z, 0, Math.PI, (p) => windLow(z) - p.y);
  const windAt = (u, f) => {
    const z = lerp(WIND.z0, WIND.z1, u);
    return hullAt(z, f * windAngle(z));
  };
  const canopyGlass = makeMesh(parametricPatch((u, v) => windAt(u, v * 2 - 1), 10, 16), M.cockpitGlass, 0, 0, 0, false);
  canopyGlass.renderOrder = 3;
  scaledAirframe.add(canopyGlass);

  for (const f of [-1, -0.62, -0.25, 0.25, 0.62, 1]) {
    scaledAirframe.add(tubeMesh(sampleLine(8, (t) => windAt(t, f)), Math.abs(f) === 1 ? 0.020 : 0.014, M.ch47Trim));
  }
  for (const u of [0, 0.48, 1]) {
    scaledAirframe.add(tubeMesh(sampleLine(16, (t) => windAt(u, t * 2 - 1)), u === 0.48 ? 0.013 : 0.019, M.ch47Trim));
  }

  // Marcos de estaciones abiertas M134, puerta lateral y ojos de buey con cristal
  scaledAirframe.add(
    buildChinookOpeningTrim(sideLoop(1, GUN_WIN), M),
    buildChinookOpeningTrim(sideLoop(-1, GUN_WIN), M),
    buildChinookOpeningTrim(sideLoop(-1, TROOP_DOOR), M, 0.055, 0.018)
  );
  for (const pz of PORTHOLES_Z) {
    for (const s of [-1, 1]) {
      const sp = sidePoint(pz, 1.20, s);
      const ring = makeMesh(new THREE.TorusGeometry(0.14, 0.016, 8, 18), M.ch47Trim, sp.x, sp.y, sp.z);
      ring.rotation.y = Math.PI / 2;
      const pane = makeMesh(new THREE.CircleGeometry(0.135, 16), M.cockpitGlass, sp.x - s * 0.006, sp.y, sp.z, false);
      pane.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      pane.renderOrder = 3;
      scaledAirframe.add(ring, pane);
    }
  }

  // 3. Cabina de mando e interior de bodega conectados (márgenes >= 0.025m para cero Z-fighting)
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.16, 0.028, 3.88), M.nonSlipDeck, 0, RAW_FLOOR_Y - 0.014, -0.10, false));
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.08, 0.008, 0.12), M.warningYellow, 0, RAW_FLOOR_Y + 0.005, RAMP.z0 + 0.08, false));

  // Bancos laterales de tropa (dejando despejada la puerta lateral derecha y las dos estaciones M134)
  scaledAirframe.add(
    buildChinookTroopBench(M, -1, -1.94, 0.24),
    buildChinookTroopBench(M, 1, -1.94, 0.86)
  );

  // Mamparo delantero de cabina con vano central abierto hacia los pilotos
  scaledAirframe.add(makeMesh(new THREE.BoxGeometry(1.12, 0.035, 0.92), M.nonSlipDeck, 0, 0.88, 2.30, false));
  const bulkhead = new THREE.Shape();
  for (let i = 0; i <= 32; i++) {
    const p = hullAt(1.84, (i / 32) * TAU);
    const y = Math.max(RAW_FLOOR_Y + 0.01, centerY(1.84) + (p.y - centerY(1.84)) * 0.96);
    if (i === 0) bulkhead.moveTo(p.x * 0.96, y);
    else bulkhead.lineTo(p.x * 0.96, y);
  }
  const passDoor = new THREE.Path();
  passDoor.moveTo(-0.22, RAW_FLOOR_Y + 0.02);
  passDoor.lineTo(0.22, RAW_FLOOR_Y + 0.02);
  passDoor.lineTo(0.22, 1.48);
  passDoor.lineTo(-0.22, 1.48);
  passDoor.closePath();
  bulkhead.holes.push(passDoor);
  scaledAirframe.add(makeMesh(new THREE.ShapeGeometry(bulkhead, 6), M.interiorDouble, 0, 0, 1.84, false));

  // Costillas estructurales internas de la bodega + luces cenitales
  for (const rz of [-1.85, -1.05, -0.25, 0.55, 1.58]) {
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
  for (const lz of [-1.35, -0.15, 0.95]) {
    scaledAirframe.add(makeMesh(roundedBox(0.16, 0.024, 0.08, 0.006), M.cabinLamp, 0, 1.74, lz, false));
  }

  // Pilotos, asientos blindados, palancas cíclicas/colectivas, HUDs y consola MFD emisiva
  for (const px of [-0.28, 0.28]) {
    const pSeat = buildArmoredCockpitSeat(M, 0.96);
    pSeat.position.set(px, 1.04, 2.26);
    const pilot = buildFlightCrewFigure(M, true, 0.96);
    pilot.position.set(px, 1.04, 2.26);
    scaledAirframe.add(pSeat, pilot);

    scaledAirframe.add(
      tubeMesh(
        [new THREE.Vector3(px, 0.92, 2.45), new THREE.Vector3(px, 1.08, 2.43), new THREE.Vector3(px, 1.18, 2.40)],
        0.012,
        M.cockpitSeatBlack
      )
    );
    const hud = makeMesh(new THREE.PlaneGeometry(0.11, 0.08), M.hudGlass, px, 1.28, 2.60, false);
    hud.rotation.x = -0.32;
    scaledAirframe.add(hud, makeMesh(roundedBox(0.10, 0.026, 0.06), M.cockpitSeatBlack, px, 1.23, 2.62));
  }
  const centerConsole = makeMesh(roundedBox(0.84, 0.15, 0.06, 0.016), M.cockpitSeatBlack, 0, 1.10, 2.62);
  centerConsole.rotation.x = -0.26;
  centerConsole.add(makeMesh(new THREE.PlaneGeometry(0.78, 0.11), M.mfdScreen, 0, 0, 0.032, false));
  scaledAirframe.add(centerConsole);

  // 4. Barquillas biturbina Honeywell T55-GA-714A + Rotores en tándem contrarrotativos sincronizados
  for (const ex of [-0.68, 0.68]) {
    const t55 = new THREE.Group();
    t55.position.set(ex, FUS_Y + 0.92, -2.18);
    t55.add(makeMesh(createSmoothFairingGeo(0.50, 0.46, 1.52, 0.24, 18), M.ch47Paint));
    t55.add(makeMesh(new THREE.SphereGeometry(0.22, 12, 10), M.titanium, 0, 0, 0.68));
    const exhaust = makeMesh(new THREE.CylinderGeometry(0.18, 0.20, 0.42, 14), M.burntTitanium, 0, 0, -0.80);
    exhaust.rotation.x = Math.PI / 2;
    t55.add(exhaust);
    scaledAirframe.add(t55);
  }
  scaledAirframe.add(
    makeMesh(new THREE.SphereGeometry(0.036, 8, 6), M.navRed, 0.98, FUS_Y - 0.34, 0.20, false),
    makeMesh(new THREE.SphereGeometry(0.036, 8, 6), M.navGreen, -0.98, FUS_Y - 0.34, 0.20, false)
  );

  const fwdRotor = buildTandemRotorAssembly(M, blurMat, 2.92, 0.44);
  fwdRotor.group.position.set(0, FUS_Y + 1.24, 2.08);
  fwdRotor.group.rotation.x = 0.07;
  scaledAirframe.add(fwdRotor.group);

  const aftRotor = buildTandemRotorAssembly(M, blurMat, 2.92, 0.44);
  aftRotor.group.position.set(0, FUS_Y + 1.72, -2.38);
  aftRotor.group.rotation.x = 0.04;
  aftRotor.spinningHead.rotation.y = Math.PI / 3; // desfase de sincronización intermeshing
  scaledAirframe.add(aftRotor.group);

  // 5. Dos estaciones laterales M134 Minigun articuladas + artilleros visibles desde el exterior e interior
  const portMinigun = buildWindowM134Station(1, GUN_WIN.z, M);
  const starboardMinigun = buildWindowM134Station(-1, GUN_WIN.z, M);
  scaledAirframe.add(portMinigun.base, portMinigun.state.pan, starboardMinigun.base, starboardMinigun.state.pan);

  for (const s of [-1, 1]) {
    const crewGunner = buildFlightCrewFigure(M, false, 0.94);
    crewGunner.position.set(s * 0.36, RAW_FLOOR_Y, GUN_WIN.z - 0.06);
    crewGunner.rotation.y = s * (Math.PI / 2);
    scaledAirframe.add(crewGunner);
  }

  // Tren cuádruple de aterrizaje con amortiguadores oleoneumáticos y torreta FLIR ventral
  for (const gx of [-0.92, 0.92]) {
    scaledAirframe.add(
      buildOleoWheelAssembly(M, new THREE.Vector3(gx, FUS_Y - 0.50, 1.18), 0.17, true),
      buildOleoWheelAssembly(M, new THREE.Vector3(gx, FUS_Y - 0.50, -1.76), 0.17, false)
    );
  }
  const chinFlirYaw = new THREE.Group();
  chinFlirYaw.position.set(0.30, FUS_Y - 0.54, 2.66);
  const chinFlirBall = makeMesh(new THREE.SphereGeometry(0.11, 12, 10), M.weaponSteel);
  const chinFlirLens = zCylinder(0.045, 0.045, 0.025, M.opticEmerald, 12);
  chinFlirLens.position.z = 0.095;
  chinFlirBall.add(chinFlirLens);
  chinFlirYaw.add(chinFlirBall);
  scaledAirframe.add(chinFlirYaw);

  // 6. Rampa trasera hidráulica de asalto + puerta lateral derecha con bisagras en el borde y pistones telescópicos
  const rampHinge = new THREE.Vector3(0, RAW_FLOOR_Y, RAMP.z0);
  const rampPivot = new THREE.Group();
  rampPivot.position.copy(rampHinge);
  const rampLen = 1.08;
  rampPivot.add(makeMesh(roundedBox(1.10, 0.055, rampLen, 0.012), M.ch47Paint, 0, -0.02, -rampLen * 0.5));
  rampPivot.add(makeMesh(roundedBox(1.02, 0.016, rampLen * 0.94, 0.004), M.nonSlipDeck, 0, 0.018, -rampLen * 0.5, false));
  for (const sx of [-0.48, 0.48]) {
    rampPivot.add(makeMesh(roundedBox(0.04, 0.07, rampLen, 0.008), M.ch47Trim, sx, 0.01, -rampLen * 0.5));
  }
  scaledAirframe.add(rampPivot);

  for (let i = 0; i < 5; i++) {
    const knuckle = makeMesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.09, 8),
      M.weaponSteel,
      -0.44 + i * 0.22,
      RAW_FLOOR_Y - 0.01,
      RAMP.z0
    );
    knuckle.rotation.z = Math.PI / 2;
    scaledAirframe.add(knuckle);
  }

  // Puerta lateral derecha articulada en su borde delantero
  const troopDoorHinge = sidePoint(TROOP_DOOR.z1, (TROOP_DOOR.y0 + TROOP_DOOR.y1) * 0.5, -1);
  const troopDoorPivot = new THREE.Group();
  troopDoorPivot.position.copy(troopDoorHinge);
  const tdAt = (u, v) =>
    sidePoint(lerp(TROOP_DOOR.z1, TROOP_DOOR.z0, u), lerp(TROOP_DOOR.y0, TROOP_DOOR.y1, v), -1);
  const tdGeo = orientOutward(parametricPatch(tdAt, 5, 7), centerY).translate(
    -troopDoorHinge.x,
    -troopDoorHinge.y,
    -troopDoorHinge.z
  );
  troopDoorPivot.add(makeMesh(tdGeo, M.ch47Paint), new THREE.Mesh(tdGeo, M.liningBack));
  troopDoorPivot.add(tubeMesh(sideLoop(-1, TROOP_DOOR).map((p) => p.clone().sub(troopDoorHinge)), 0.012, M.ch47Trim, true));
  scaledAirframe.add(troopDoorPivot);

  // Bisagras visibles (nudillos verticales) sobre el borde de giro de la puerta de tropa
  for (const v of [0.14, 0.5, 0.86]) {
    const hp = sidePoint(TROOP_DOOR.z1, lerp(TROOP_DOOR.y0, TROOP_DOOR.y1, v), -1);
    scaledAirframe.add(makeMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.075, 8), M.weaponSteel, hp.x, hp.y, hp.z));
  }

  const pistons = [];
  for (const px of [-0.50, 0.50]) {
    const aLocal = new THREE.Vector3(px, 1.44, -2.02);
    const bLocal = new THREE.Vector3(px * 0.96, 0.03, -0.78);
    const closedLen = aLocal.distanceTo(bLocal.clone().add(rampHinge));
    const p = new TelescopicPiston(scaledAirframe, aLocal, rampPivot, bLocal, closedLen, 0.022, M);
    scaledAirframe.add(p.group);
    pistons.push(p);
  }
  {
    const aDoor = new THREE.Vector3(-0.62, 1.44, TROOP_DOOR.z1 + 0.08);
    const bDoor = sidePoint(TROOP_DOOR.z0 + 0.16, 1.36, -1).add(new THREE.Vector3(0.05, 0, 0)).sub(troopDoorHinge);
    const closedLen = aDoor.distanceTo(bDoor.clone().add(troopDoorHinge));
    const dp = new TelescopicPiston(scaledAirframe, aDoor, troopDoorPivot, bDoor, closedLen, 0.014, M);
    scaledAirframe.add(dp.group);
    pistons.push(dp);
  }

  const INTERIOR_LIGHT_INTENSITY = 1.35;
  const interiorLight = addLightAnchorFn
    ? addLightAnchorFn(root, '#ffd699', INTERIOR_LIGHT_INTENSITY, 14, 2, 0, 1.45, -0.6, true)
    : null;

  const minigunMounts = [portMinigun.state, starboardMinigun.state];
  const dynamicList = [
    cabinBayGroup,
    fwdRotor.group,
    fwdRotor.spinningHead,
    fwdRotor.blurDisc,
    aftRotor.group,
    aftRotor.spinningHead,
    aftRotor.blurDisc,
    rampPivot,
    troopDoorPivot,
    chinFlirYaw,
    ...pistons.flatMap((p) => [p.group, p.rod, p.eye]),
    ...minigunMounts.flatMap((m) => [m.pan, m.tilt, m.recoil, m.spinCluster, m.flash])
  ];

  bakeRigidAircraftBatches(scaledAirframe, dynamicList);

  const state = {
    throttle: 0.95,
    rpm: 0.66,
    rampTarget: 1.0,
    rampOpen: 0.15,
    clock: 0
  };

  rampPivot.rotation.x = 0.24 * easeInOutCubic(state.rampOpen);
  root.updateMatrixWorld(true);
  for (const p of pistons) p.update();

  const controls = createAircraftControls();
  const aimOut = { pan: 0, tilt: 0 };

  const rig = {
    id: 'ch47',
    label: 'CH-47F Chinook',
    group: root,
    cabinBayGroup,
    rampExitBackDist: 7.95,
    rampExitDropY: -1.48,
    cameraInteriorAnchor: new THREE.Vector3(0, 0.46, 1.8),
    cameraExteriorDistance: 23.5,

    resetFlight() {
      state.rpm = 0.64;
      state.throttle = 0.96;
      state.rampOpen = 0.08;
      state.rampTarget = 1.0;
      state.clock = 0;
    },

    getSeatLocalPose(seatIndex = 0) {
      const slot = CH47_TROOP_SEATS_RAW[seatIndex % CH47_TROOP_SEATS_RAW.length];
      return {
        x: slot.x * CH47_SCALE,
        y: CH47_CABIN_FLOOR_LOCAL_Y,
        z: slot.z * CH47_SCALE,
        yaw: slot.side < 0 ? Math.PI / 2 : -Math.PI / 2,
        side: slot.side
      };
    },

    sampleDisembarkLocalPose(seatIndex = 0, normProgress = 0) {
      const seat = this.getSeatLocalPose(seatIndex);
      const p = clamp(normProgress, 0, 1);
      const rampThresholdZ = RAMP.z0 * CH47_SCALE; // -5.20m
      const rampLipZ = -7.85;
      const rampLipY = CH47_CABIN_FLOOR_LOCAL_Y - 0.52 * easeInOutCubic(state.rampOpen);

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
        const u = easeInOutCubic(p / 0.24);
        return {
          x: lerp(seat.x, seat.side * 0.14, u),
          y: seat.y,
          z: seat.z,
          yaw: lerpAngleShort(seat.yaw, Math.PI, u),
          phase: 'stand',
          standBlend: u,
          walkCycle: u * 1.6
        };
      }

      if (p < 0.82) {
        const u = (p - 0.24) / 0.58;
        const aisleX = lerp(seat.side * 0.14, seatIndex % 2 === 0 ? -0.14 : 0.14, Math.min(1, u * 2.5));
        const curZ = lerp(seat.z, rampThresholdZ - 0.65, u);
        const onRampFrac = clamp((rampThresholdZ - curZ) / Math.max(0.1, rampThresholdZ - rampLipZ), 0, 1);
        return {
          x: aisleX,
          y: lerp(seat.y, rampLipY, onRampFrac),
          z: curZ,
          yaw: Math.PI,
          phase: 'walk_cabin',
          standBlend: 1,
          walkCycle: 1.6 + u * 13.8
        };
      }

      const u = easeInOutCubic((p - 0.82) / 0.18);
      const startZ = rampThresholdZ - 0.65;
      const zNow = lerp(startZ, rampLipZ - 0.35, u);
      const arcLift = Math.sin(u * Math.PI) * 0.32;
      return {
        x: seatIndex % 2 === 0 ? -0.15 : 0.15,
        y: lerp(seat.y - 0.10, rampLipY - 0.16, u) + arcLift,
        z: zNow,
        yaw: Math.PI,
        phase: 'ramp_jump',
        standBlend: 1,
        walkCycle: 15.4 + u * 3.0
      };
    },

    update(delta, flightContext = null) {
      const dt = Math.min(0.1, Math.max(0, delta));
      state.clock += dt;

      // Rotores contrarrotativos sincronizados con inercia de RPM, inclinación cíclica y disco motion-blur
      const bankRoll = flightContext?.roll || 0;
      const pitchTilt = flightContext?.pitch || 0;
      state.throttle = controls.throttle !== null ? controls.throttle : 0.95 + Math.sin(state.clock * 1.1) * 0.04;
      const lag = state.throttle - state.rpm;
      state.rpm = dampValue(state.rpm, state.throttle, lag > 0 ? 1.2 : 0.65, dt);

      const rotorOmega = state.rpm * 21.0;
      fwdRotor.spinningHead.rotation.y += rotorOmega * dt;
      aftRotor.spinningHead.rotation.y -= rotorOmega * dt;

      fwdRotor.group.rotation.x = dampValue(fwdRotor.group.rotation.x, 0.075 + lag * 0.08 + pitchTilt * 0.3, 4.0, dt);
      fwdRotor.group.rotation.z = dampValue(fwdRotor.group.rotation.z, bankRoll * 0.24, 4.0, dt);
      aftRotor.group.rotation.x = dampValue(aftRotor.group.rotation.x, 0.045 + lag * 0.06 + pitchTilt * 0.25, 4.0, dt);
      aftRotor.group.rotation.z = dampValue(aftRotor.group.rotation.z, bankRoll * 0.22, 4.0, dt);

      blurMat.opacity = THREE.MathUtils.smoothstep(state.rpm, 0.40, 0.95) * 0.32;

      // Rampa trasera de asalto (gira hacia abajo: +X en local porque se extiende hacia -Z) + puerta lateral
      if (controls.doorsOpen !== null) state.rampTarget = controls.doorsOpen ? 1.0 : 0.0;
      state.rampOpen = approachValue(state.rampOpen, state.rampTarget, dt * 0.46);
      const easedRamp = easeInOutCubic(state.rampOpen);
      rampPivot.rotation.x = 0.22 * easedRamp;
      troopDoorPivot.rotation.y = 1.32 * easeInOutCubic(clamp(state.rampOpen * 1.2, 0, 1));

      // Torreta FLIR ventral y ametralladoras laterales M134 articuladas (pan/tilt + rotación + retroceso)
      chinFlirYaw.rotation.y = Math.sin(state.clock * 0.7) * 0.42;

      // Modo manual (setFiring true/false) o demostración (null) con ráfagas procedurales espaciadas
      const manualFire = controls.firing !== null;
      const wantFire = manualFire ? controls.firing : true;

      for (const mg of minigunMounts) {
        // Cada M134 apunta solo dentro del arco de su propia ventana (babor/estribor)
        let targetPan = mg.side * (1.22 + Math.sin(state.clock * 0.65 + mg.side) * 0.22);
        let targetTilt = 0.20 + Math.cos(state.clock * 0.52 + mg.side) * 0.08;
        if (controls.hasAim && solveMountAim(mg.pan, controls.aimTarget, mg.side * 1.22, 0.85, -0.3, 0.85, aimOut)) {
          targetPan = aimOut.pan;
          targetTilt = aimOut.tilt;
        }
        mg.pan.rotation.y = dampValue(mg.pan.rotation.y, targetPan, 4.0, dt);
        mg.tilt.rotation.x = dampValue(mg.tilt.rotation.x, targetTilt, 4.0, dt);

        // Los 6 cañones aceleran antes de disparar y frenan con inercia al soltar el gatillo
        const spinTarget = manualFire ? (wantFire ? 34.0 : 0.0) : 32.0;
        mg.spinRate = dampValue(mg.spinRate, spinTarget, wantFire ? 3.0 : 1.1, dt);
        mg.spinCluster.rotation.z += mg.spinRate * dt;

        mg.burstClock -= dt;
        const canShoot = wantFire && (!manualFire || mg.spinRate > 20.0);
        if (canShoot && mg.burstClock <= 0) {
          mg.burstClock = manualFire ? 0.05 : 2.9 + (mg.side > 0 ? 0.4 : 0.9);
          mg.recoilOffset = 0.022;
          mg.flashLevel = 0.85;
        } else if (!canShoot && mg.burstClock < 0) {
          mg.burstClock = 0;
        }
        mg.recoilOffset = dampValue(mg.recoilOffset, 0, 16.0, dt);
        mg.recoil.position.z = -mg.recoilOffset;

        mg.flashLevel = Math.max(0, mg.flashLevel - dt * 15.0);
        mg.flashMat.opacity = mg.flashLevel * 0.80;
        mg.flash.visible = mg.flashLevel > 0.02;
        if (mg.flash.visible) {
          mg.flash.scale.setScalar(0.5 + mg.flashLevel * 0.6);
        }
      }

      scaledAirframe.updateMatrixWorld(true);
      for (let i = 0; i < pistons.length; i++) {
        pistons[i].update();
      }
    },

    /** Enciende/apaga la luz tenue de bodega (p. ej. apagarla en calidad baja); usa el pool global de luces. */
    setInteriorLight(on) {
      if (interiorLight) interiorLight.userData.light.intensity = on ? INTERIOR_LIGHT_INTENSITY : 0;
    },

    /** Afustes articulados expuestos (pan/tilt/recoil/spinCluster) para depuración y pruebas. */
    turrets: minigunMounts,

    getState() {
      return { throttle: state.throttle, rpm: state.rpm, rampOpen: state.rampOpen, rampTarget: state.rampTarget };
    }
  };

  return attachAircraftControlApi(rig, controls);
}

function lerpAngleShort(a, b, t) {
  let diff = ((b - a + Math.PI) % TAU) - Math.PI;
  if (diff < -Math.PI) diff += TAU;
  return a + diff * t;
}
