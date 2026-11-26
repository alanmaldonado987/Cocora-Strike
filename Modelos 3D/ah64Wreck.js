// Modelos 3D/ah64Wreck.js
// Módulo 3: Helicóptero de Ataque AH-64D Apache Longbow Siniestrado (adaptado de "Modelos 3D/Aviones v1/src/models/vehicles/AH64Apache.ts")
// Escala métrica real (AH64_SCALE = 2.15):
// - Fuselaje blindado principal inclinado y semi-enterrado en un cráter ennegrecido con brasas incandescentes,
//   carenados laterales EFAB, cabina tándem con vidrio semitransparente (opacity: 0.35, roughness: 0.1, depthWrite: false)
//   y compuerta lateral abierta dejando ver asientos blindados, HUD y pantallas MFD averiadas.
// - Rotor principal articulado de 4 palas + domo radar Longbow con 2 aspas dobladas por calor/impacto y 2 aspas partidas.
// - Tren delantero colapsado, torreta electroóptica TADS/PNVS y cañón de cadena M230 de 30mm bajo el morro con cinta expuesta.
// - Sección de cola partida en (-1.4, -29.2) con mamparo desgarrado y rotor de cola en X (60°/120°) separado sobre el borde.
// - Fragmentos metálicos legibles dispersos alrededor del cráter + método `update(delta, timeSec)` sin allocs.

import * as THREE from 'three';
import {
  TAU,
  lerp,
  getAircraftMaterials,
  createTacticalStencilMaterial,
  hullSampler,
  parametricPatch,
  orientOutward,
  weldSeamNormals,
  clipGeometry,
  createLoftedFuselage,
  createSmoothFairingGeo,
  createWingGeometry,
  createAirfoilBladeGeometry,
  roundedBox,
  makeMesh,
  zCylinder,
  tubeMesh,
  buildArmoredCockpitSeat,
  buildOleoWheelAssembly,
  registerSharedAircraftGeo,
  registerSharedAircraftMat
} from './avionesShared.js';

export const AH64_SCALE = 2.15;
const FUS_Y = 1.08;

const MAIN_SECTIONS = [
  { z: -1.18, halfWidth: 0.38, topHeight: 0.40, bottomHeight: 0.32, yCenter: FUS_Y + 0.04, squareness: 0.52 },
  { z: -0.65, halfWidth: 0.45, topHeight: 0.48, bottomHeight: 0.36, yCenter: FUS_Y + 0.02, squareness: 0.56 },
  { z: 0.45, halfWidth: 0.48, topHeight: 0.52, bottomHeight: 0.38, yCenter: FUS_Y, squareness: 0.60 },
  { z: 1.75, halfWidth: 0.44, topHeight: 0.38, bottomHeight: 0.34, yCenter: FUS_Y - 0.04, squareness: 0.58 },
  { z: 2.58, halfWidth: 0.26, topHeight: 0.19, bottomHeight: 0.21, yCenter: FUS_Y - 0.12, squareness: 0.44 }
];

const TAIL_SECTIONS = [
  { z: -3.65, halfWidth: 0.12, topHeight: 0.14, bottomHeight: 0.12, yCenter: FUS_Y + 0.08, squareness: 0.40 },
  { z: -2.45, halfWidth: 0.22, topHeight: 0.24, bottomHeight: 0.20, yCenter: FUS_Y + 0.06, squareness: 0.45 },
  { z: -1.20, halfWidth: 0.38, topHeight: 0.40, bottomHeight: 0.32, yCenter: FUS_Y + 0.04, squareness: 0.52 }
];

const CANOPY_SECTIONS = [
  { z: 0.28, halfWidth: 0.26, topHeight: 0.32, bottomHeight: 0.02, yCenter: FUS_Y + 0.42, squareness: 0.75 },
  { z: 1.05, halfWidth: 0.32, topHeight: 0.44, bottomHeight: 0.02, yCenter: FUS_Y + 0.42, squareness: 0.80 },
  { z: 1.48, halfWidth: 0.30, topHeight: 0.30, bottomHeight: 0.02, yCenter: FUS_Y + 0.34, squareness: 0.80 },
  { z: 2.18, halfWidth: 0.26, topHeight: 0.26, bottomHeight: 0.02, yCenter: FUS_Y + 0.28, squareness: 0.80 },
  { z: 2.48, halfWidth: 0.16, topHeight: 0.06, bottomHeight: 0.01, yCenter: FUS_Y + 0.14, squareness: 0.80 }
];

const mainHullAt = hullSampler(MAIN_SECTIONS);
const canopyAt = hullSampler(CANOPY_SECTIONS);
const sampleLine = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));

function buildClippedApacheMainHull() {
  const nu = 44;
  const nv = 32;
  const z0 = MAIN_SECTIONS[0].z;
  const z1 = MAIN_SECTIONS[MAIN_SECTIONS.length - 1].z;
  const g = orientOutward(
    parametricPatch((u, v) => mainHullAt(lerp(z0, z1, u), (v - 0.5) * TAU), nu, nv),
    () => FUS_Y
  );
  weldSeamNormals(g, nu, nv);

  // Recortar abertura superior real de la cabina tándem para evitar cualquier polígono opaco detrás del cristal
  const c0 = CANOPY_SECTIONS[0].z;
  const c1 = CANOPY_SECTIONS[CANOPY_SECTIONS.length - 1].z;
  const clipped = clipGeometry(g, (p) => {
    const rail = canopyAt(p.z, Math.PI / 2);
    return Math.max(Math.abs(p.x) - rail.x * 0.98, c0 - p.z, p.z - c1, rail.y - 0.30 - p.y);
  });
  g.dispose();
  return clipped;
}

function buildHydra70Pod(M, radius = 0.16, length = 1.02) {
  const g = new THREE.Group();
  const body = makeMesh(new THREE.CylinderGeometry(radius, radius * 0.92, length, 12), M.ordnanceOlive);
  body.rotation.x = Math.PI / 2;
  const cap = makeMesh(new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.04, 12), M.titanium, 0, 0, length * 0.5);
  cap.rotation.x = Math.PI / 2;
  g.add(body, cap);

  const boreGeo = new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, 0.05, 6);
  boreGeo.rotateX(Math.PI / 2);
  g.add(makeMesh(boreGeo, M.cockpitSeatBlack, 0, 0, length * 0.505));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    g.add(
      makeMesh(
        boreGeo,
        M.cockpitSeatBlack,
        Math.cos(a) * radius * 0.54,
        Math.sin(a) * radius * 0.54,
        length * 0.505
      )
    );
  }
  return g;
}

function buildHellfireMissile(M) {
  const g = new THREE.Group();
  const body = makeMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.80, 10), M.apacheWreckDark);
  body.rotation.x = Math.PI / 2;
  const seeker = makeMesh(new THREE.SphereGeometry(0.045, 10, 8), M.opticAmber, 0, 0, 0.40);
  seeker.scale.set(1, 1, 1.7);
  const band = makeMesh(new THREE.CylinderGeometry(0.047, 0.047, 0.045, 10), M.warningYellow, 0, 0, 0.20);
  band.rotation.x = Math.PI / 2;
  g.add(body, seeker, band);
  for (const rot of [0, Math.PI / 2]) {
    const fin = makeMesh(new THREE.BoxGeometry(0.17, 0.012, 0.14), M.titanium, 0, 0, -0.30);
    fin.rotation.z = rot;
    g.add(fin);
  }
  return g;
}

function buildM230ChainGun(M) {
  const gunMount = new THREE.Group();
  gunMount.add(makeMesh(roundedBox(0.26, 0.20, 0.34), M.weaponSteel));

  const gun = new THREE.Group();
  gun.position.set(0, -0.10, 0.08);
  gun.add(makeMesh(roundedBox(0.15, 0.16, 0.36), M.weaponSteel, 0, 0, -0.18));
  const recoilCyl = zCylinder(0.032, 0.032, 0.36, M.chrome, 8);
  recoilCyl.position.set(0, 0.06, 0.02);
  const jacket = zCylinder(0.052, 0.056, 0.46, M.weaponSteel, 10);
  const barrel = zCylinder(0.026, 0.032, 1.06, M.weaponSteel, 10);
  const brake = makeMesh(roundedBox(0.09, 0.07, 0.12), M.burntTitanium, 0, 0, 1.10);
  gun.add(recoilCyl, jacket, barrel, brake);

  gunMount.add(gun);
  return gunMount;
}

function buildDamagedApacheRotorHead(M) {
  const mastHeight = 0.52;
  const group = new THREE.Group();
  group.add(makeMesh(new THREE.CylinderGeometry(0.16, 0.22, mastHeight * 0.46, 12), M.weaponSteel, 0, mastHeight * 0.23, 0));
  group.add(makeMesh(new THREE.CylinderGeometry(0.28, 0.30, 0.044, 14), M.titanium, 0, mastHeight * 0.48, 0));

  const spinningHead = new THREE.Group();
  spinningHead.userData.keepSeparate = true;
  spinningHead.add(makeMesh(new THREE.CylinderGeometry(0.095, 0.095, mastHeight, 10), M.chrome, 0, mastHeight * 0.5, 0));
  spinningHead.add(makeMesh(new THREE.CylinderGeometry(0.32, 0.28, 0.11, 12), M.weaponSteel, 0, mastHeight, 0));

  // 4 brazos: 2 con palas largas dobladas/combadas por el impacto y calor, y 2 con muñones partidos
  const bentBladeA = createAirfoilBladeGeometry(2.75, 0.24, true, -0.28);
  const bentBladeB = createAirfoilBladeGeometry(2.55, 0.24, true, -0.38);
  const brokenStump = createAirfoilBladeGeometry(0.78, 0.24, true, -0.10);

  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * TAU + (i === 1 ? 0.12 : 0);
    arm.add(makeMesh(roundedBox(0.16, 0.09, 0.32), M.titanium, 0, mastHeight, 0.36));

    const pitchLink = makeMesh(new THREE.CylinderGeometry(0.014, 0.014, mastHeight * 0.46, 6), M.chrome, 0.09, mastHeight * 0.77, 0.24);
    pitchLink.rotation.z = -0.12;
    arm.add(pitchLink);

    const geo = i === 0 ? bentBladeA : i === 2 ? bentBladeB : brokenStump;
    const blade = makeMesh(geo, M.bladeVertexMat, 0, mastHeight, 0.42);
    blade.rotation.x = Math.PI / 2 + (i === 2 ? 0.10 : 0);
    blade.rotation.z = i === 0 ? 0.14 : i === 2 ? -0.18 : 0.25;
    arm.add(blade);

    if (i === 1 || i === 3) {
      // Astillas metálicas en la fractura de las aspas partidas
      const jagged = makeMesh(new THREE.ConeGeometry(0.08, 0.24, 5), M.titanium, 0.02, mastHeight - 0.04, 1.24);
      jagged.rotation.x = Math.PI / 2;
      arm.add(jagged);
    }

    spinningHead.add(arm);
  }
  spinningHead.traverse((o) => {
    o.userData.keepSeparate = true;
  });
  group.add(spinningHead);

  // Domo radar milimétrico AN/APG-78 Longbow inclinado en la cúspide del mástil
  const radarDome = new THREE.Group();
  radarDome.position.set(0, mastHeight + 0.22, 0);
  radarDome.rotation.z = 0.16;
  radarDome.add(makeMesh(new THREE.CylinderGeometry(0.12, 0.15, 0.18, 12), M.weaponSteel));
  const dome = makeMesh(new THREE.SphereGeometry(0.46, 18, 12), M.apacheWreckDark, 0, 0.14, 0);
  dome.scale.set(1, 0.46, 1);
  const band = makeMesh(new THREE.TorusGeometry(0.45, 0.022, 8, 20), M.titanium, 0, 0.14, 0);
  band.rotation.x = Math.PI / 2;
  radarDome.add(dome, band);
  group.add(radarDome);

  return { group, spinningHead };
}

function buildXScissorsTailRotor(M) {
  const tailRotor = new THREE.Group();
  const trHub = makeMesh(new THREE.CylinderGeometry(0.085, 0.085, 0.18, 12), M.weaponSteel);
  trHub.rotation.z = Math.PI / 2;
  tailRotor.add(trHub);

  // Ángulos característicos 60°/120° en tijera X del AH-64D
  [0, 1.05, Math.PI, Math.PI + 1.05].forEach((ang, idx) => {
    const bGroup = new THREE.Group();
    bGroup.rotation.x = ang;
    const len = idx === 2 ? 0.42 : 0.74; // una pala fracturada por el impacto
    bGroup.add(makeMesh(roundedBox(0.024, len, 0.12), M.cockpitSeatBlack, 0, len * 0.5 + 0.03, 0));
    if (idx !== 2) {
      bGroup.add(makeMesh(roundedBox(0.026, 0.10, 0.122), M.warningYellow, 0, 0.72, 0));
    }
    tailRotor.add(bGroup);
  });
  return tailRotor;
}

function buildCraterRimAndEmbers(M) {
  const craterGroup = new THREE.Group();

  // Disco central carbonizado ligeramente elevado (0.03m) sin Z-fighting
  const charDiscGeo = new THREE.RingGeometry(0.35, 6.4, 28, 2);
  charDiscGeo.rotateX(-Math.PI / 2);
  const pos = charDiscGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const rimWave = r > 3.8 ? Math.sin(r * 1.1 + Math.atan2(z, x) * 5) * 0.12 + 0.24 : 0.03;
    pos.setY(i, rimWave);
  }
  charDiscGeo.computeVertexNormals();
  registerSharedAircraftGeo(charDiscGeo);
  craterGroup.add(makeMesh(charDiscGeo, M.scorchedChar, 0, 0, 0, false));

  // Grietas de brasas incandescentes bajo el fuselaje incendiado
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + 0.3;
    const dist = 1.4 + (i % 3) * 1.1;
    const emberSlab = makeMesh(
      roundedBox(0.85, 0.08, 0.34, 0.03),
      M.emberGlow,
      Math.cos(ang) * dist,
      0.04,
      Math.sin(ang) * dist,
      false
    );
    emberSlab.rotation.y = ang + 0.6;
    craterGroup.add(emberSlab);
  }

  // Bermas de tierra quemada alrededor del borde del impacto
  const bermGeo = new THREE.DodecahedronGeometry(0.65, 1);
  bermGeo.scale(1.5, 0.55, 1.1);
  bermGeo.computeVertexNormals();
  registerSharedAircraftGeo(bermGeo);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * TAU;
    const rad = 5.4 + (i % 2) * 0.65;
    const mound = makeMesh(bermGeo, M.scorchedChar, Math.cos(ang) * rad, 0.12, Math.sin(ang) * rad, true);
    mound.rotation.y = ang + Math.PI / 2;
    craterGroup.add(mound);
  }

  return craterGroup;
}

function createFirePlumeCluster(M, scale = 1.0) {
  const fireGroup = new THREE.Group();
  fireGroup.userData.keepSeparate = true;

  const outerCone = makeMesh(new THREE.ConeGeometry(0.42 * scale, 1.45 * scale, 7), M.fireOuterMat, 0, 0.62 * scale, 0, false);
  const innerCone = makeMesh(new THREE.ConeGeometry(0.24 * scale, 0.95 * scale, 6), M.fireCoreMat, 0, 0.44 * scale, 0, false);
  outerCone.userData.keepSeparate = true;
  innerCone.userData.keepSeparate = true;
  outerCone.renderOrder = 5;
  innerCone.renderOrder = 6;
  fireGroup.add(outerCone, innerCone);
  return fireGroup;
}

/**
 * Construye el escenario completo de impacto del AH-64D Apache en `structuresGroup`
 * y devuelve el controlador con `update(delta, timeSec)` y puntos emisores de humo/chispas.
 */
export function buildAH64ApacheWreckSite(wreck, structuresGroup, addLightAnchorFn = null) {
  if (!wreck) return null;
  const M = getAircraftMaterials();

  const siteRoot = new THREE.Group();
  siteRoot.name = 'AH64D_WreckSite';

  // 1. Cráter ennegrecido bien definido centrado bajo el fuselaje principal
  const crater = buildCraterRimAndEmbers(M);
  crater.position.set(wreck.x, wreck.y, wreck.z);
  siteRoot.add(crater);

  // 2. Sección Principal del AH-64D (semi-enterrada, inclinada de morro y escorada)
  const mainRoot = new THREE.Group();
  mainRoot.position.set(wreck.x, wreck.y - 0.48, wreck.z);
  mainRoot.rotation.order = 'YXZ';
  mainRoot.rotation.set(0.13, wreck.yaw, -0.30);

  const mainScaled = new THREE.Group();
  mainScaled.scale.setScalar(AH64_SCALE);
  mainRoot.add(mainScaled);

  const hullGeo = buildClippedApacheMainHull();
  mainScaled.add(makeMesh(hullGeo, M.apacheWreckOlive), new THREE.Mesh(hullGeo, M.liningBack));

  // Mamparo trasero desgarrado donde se partió el botalón de cola (z = -1.18)
  mainScaled.add(makeMesh(new THREE.CylinderGeometry(0.36, 0.38, 0.08, 12), M.interiorDouble, 0, FUS_Y + 0.04, -1.16));
  for (let k = 0; k < 5; k++) {
    const tornSpar = zCylinder(0.016, 0.012, 0.42, k % 2 === 0 ? M.titanium : M.burntTitanium, 6);
    const a = (k / 5) * TAU;
    tornSpar.position.set(Math.cos(a) * 0.28, FUS_Y + Math.sin(a) * 0.26, -1.52);
    tornSpar.rotation.set((k - 2) * 0.08, 0.12, 0);
    mainScaled.add(tornSpar);
  }

  // Carenados laterales de aviónica EFAB + marcas tácticas quemadas
  for (const cx of [-0.54, 0.54]) {
    mainScaled.add(makeMesh(createSmoothFairingGeo(0.39, 0.36, 2.34, 0.58, 16), M.apacheWreckDark, cx, FUS_Y - 0.14, 0.95));
  }
  const apacheStencil = makeMesh(
    new THREE.PlaneGeometry(0.95, 0.16),
    createTacticalStencilMaterial('EJÉRCITO · AH-64D', true),
    -0.52,
    FUS_Y + 0.16,
    0.55,
    false
  );
  apacheStencil.rotation.y = -Math.PI / 2;
  mainScaled.add(apacheStencil);

  // Cabina en tándem conectada (artillero delantero + piloto trasero elevado, pantallas MFD, HUD y cristal opacity 0.35)
  const cockpitBed = makeMesh(new THREE.BoxGeometry(0.56, 0.03, 2.08), M.nonSlipDeck, 0, FUS_Y + 0.04, 1.36, false);
  const gunnerSeat = buildArmoredCockpitSeat(M, 0.88);
  gunnerSeat.position.set(0, FUS_Y + 0.12, 1.72);
  const pilotSeat = buildArmoredCockpitSeat(M, 0.92);
  pilotSeat.position.set(0, FUS_Y + 0.28, 0.86);
  mainScaled.add(cockpitBed, gunnerSeat, pilotSeat);

  for (const [cz, cy] of [
    [2.05, FUS_Y + 0.24],
    [1.22, FUS_Y + 0.40]
  ]) {
    const dash = makeMesh(roundedBox(0.42, 0.13, 0.06, 0.014), M.cockpitSeatBlack, 0, cy, cz);
    dash.rotation.x = -0.22;
    dash.add(makeMesh(new THREE.PlaneGeometry(0.36, 0.095), M.mfdDamaged, 0, 0, -0.032, false));
    mainScaled.add(dash);
  }
  const hud = makeMesh(new THREE.PlaneGeometry(0.13, 0.10), M.hudGlass, 0, FUS_Y + 0.38, 2.08, false);
  hud.rotation.x = -0.35;
  mainScaled.add(hud);

  // Cúpula blindada facetada con vidrio semitransparente (opacity 0.35, roughness 0.1, depthWrite false)
  const c0 = CANOPY_SECTIONS[0].z;
  const c1 = CANOPY_SECTIONS[CANOPY_SECTIONS.length - 1].z;
  const cSample = (u, v) => canopyAt(lerp(c0, c1, u), lerp(-Math.PI / 2, Math.PI / 2, v));
  const canopyGlass = makeMesh(parametricPatch(cSample, 12, 10), M.cockpitGlass, 0, 0, 0, false);
  canopyGlass.renderOrder = 3;
  mainScaled.add(canopyGlass);

  for (const sideV of [0, 0.5, 1]) {
    mainScaled.add(tubeMesh(sampleLine(12, (t) => cSample(t, sideV)), 0.016, M.apacheWreckDark));
  }
  for (const hoopU of [0.01, 0.39, 0.66, 0.99]) {
    mainScaled.add(tubeMesh(sampleLine(10, (t) => cSample(hoopU, t)), 0.015, M.apacheWreckDark));
  }

  // Torreta electroóptica de morro TADS / PNVS + Cañón de cadena M230 de 30mm torcido bajo el morro
  const tadsGroup = new THREE.Group();
  tadsGroup.position.set(0, FUS_Y - 0.14, 2.72);
  tadsGroup.rotation.set(0.18, -0.26, 0.12);
  const tadsDrum = makeMesh(new THREE.CylinderGeometry(0.23, 0.23, 0.46, 14), M.apacheWreckDark);
  tadsDrum.rotation.z = Math.PI / 2;
  const tadsBall = makeMesh(new THREE.SphereGeometry(0.18, 14, 10), M.weaponSteel, 0, 0, 0.12);
  const flirLens = zCylinder(0.075, 0.075, 0.03, M.opticEmerald, 12);
  flirLens.position.set(-0.04, 0.01, 0.16);
  tadsBall.add(flirLens);
  const pnvsTurret = makeMesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12), M.weaponSteel, 0, 0.24, 0.02);
  tadsGroup.add(tadsDrum, tadsBall, pnvsTurret);
  mainScaled.add(tadsGroup);

  const chinGun = buildM230ChainGun(M);
  chinGun.position.set(0, FUS_Y - 0.42, 1.68);
  chinGun.rotation.set(0.24, 0.34, -0.14);
  chinGun.userData.keepSeparate = true;
  mainScaled.add(chinGun);

  // Tambor central de 30mm y conducto de munición abierto bajo la panza
  const ammoDrum = makeMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.56, 14), M.weaponSteel, 0, FUS_Y - 0.10, 0.66);
  ammoDrum.rotation.z = Math.PI / 2;
  mainScaled.add(
    ammoDrum,
    tubeMesh(
      [
        new THREE.Vector3(0, FUS_Y - 0.22, 0.84),
        new THREE.Vector3(0.06, FUS_Y - 0.42, 1.24),
        new THREE.Vector3(0.02, FUS_Y - 0.48, 1.62)
      ],
      0.048,
      M.brass
    )
  );

  // Tren delantero colapsado: pata izquierda doblada hacia adentro y pata derecha fracturada
  const collapsedGearL = buildOleoWheelAssembly(M, new THREE.Vector3(0, 0.52, 0), 0.18, false);
  collapsedGearL.position.set(0.68, FUS_Y - 0.22, 1.15);
  collapsedGearL.rotation.set(0.45, 0.18, 0.92);
  const brokenStrutR = zCylinder(0.042, 0.032, 0.46, M.titanium, 8);
  brokenStrutR.position.set(-0.66, FUS_Y - 0.30, 1.15);
  brokenStrutR.rotation.set(0.85, -0.35, -0.65);
  mainScaled.add(collapsedGearL, brokenStrutR);

  // Barquillas biturbina GE T700 (turbina izquierda reventada ardiendo) + Alas embrionarias (stub wings)
  for (const ex of [-0.58, 0.58]) {
    const eng = new THREE.Group();
    eng.position.set(ex, FUS_Y + 0.36, -0.18);
    eng.add(
      makeMesh(
        createLoftedFuselage(
          [
            { z: -0.78, halfWidth: 0.20, topHeight: 0.18, bottomHeight: 0.18, squareness: 0.50 },
            { z: 0.00, halfWidth: 0.24, topHeight: 0.24, bottomHeight: 0.24, squareness: 0.40 },
            { z: 0.68, halfWidth: 0.21, topHeight: 0.21, bottomHeight: 0.21, squareness: 0.30 }
          ],
          14
        ),
        ex > 0 ? M.scorchedChar : M.apacheWreckOlive
      )
    );
    eng.add(makeMesh(new THREE.TorusGeometry(0.17, 0.032, 8, 16), M.titanium, 0, 0, 0.68));
    const irExhaust = makeMesh(roundedBox(0.32, 0.24, 0.44), M.burntTitanium, ex > 0 ? 0.05 : -0.05, 0.08, -0.86);
    irExhaust.rotation.x = 0.28;
    eng.add(irExhaust);
    mainScaled.add(eng);
  }

  // Ala izquierda (babor, +X) completa con lanzacohetes Hydra-70 y misiles Hellfire; ala derecha (-X) arrancada a mitad
  mainScaled.add(
    makeMesh(
      createWingGeometry({
        span: 1.32,
        rootChord: 0.72,
        tipChord: 0.46,
        sweepZ: -0.08,
        dihedralY: -0.06,
        rootThickness: 0.11,
        tipThickness: 0.07,
        camber: 0.015,
        side: 1
      }),
      M.apacheWreckOlive,
      0.46,
      FUS_Y + 0.02,
      0.15
    )
  );
  const portHydra = buildHydra70Pod(M);
  portHydra.position.set(1.42, FUS_Y - 0.24, 0.14);
  mainScaled.add(portHydra);
  for (const ox of [-0.10, 0.10]) {
    const hf = buildHellfireMissile(M);
    hf.position.set(0.92 + ox, FUS_Y - 0.24, 0.18);
    mainScaled.add(hf);
  }

  // Muñón desgarrado del ala derecha (-X)
  mainScaled.add(
    makeMesh(
      createWingGeometry({
        span: 0.52,
        rootChord: 0.72,
        tipChord: 0.58,
        sweepZ: -0.04,
        dihedralY: -0.10,
        rootThickness: 0.11,
        tipThickness: 0.09,
        camber: 0.01,
        side: -1
      }),
      M.scorchedChar,
      -0.46,
      FUS_Y + 0.02,
      0.15
    )
  );

  // Mástil y rotor principal dañado con domo Longbow
  mainScaled.add(makeMesh(new THREE.CylinderGeometry(0.26, 0.34, 0.42, 12), M.apacheWreckOlive, 0, FUS_Y + 0.62, 0.04));
  const damagedRotor = buildDamagedApacheRotorHead(M);
  damagedRotor.group.position.set(0, FUS_Y + 0.80, 0.04);
  mainScaled.add(damagedRotor.group);

  siteRoot.add(mainRoot);

  // 3. Sección Trasera Partida (Botalón de Cola + Deriva + Rotor de Cola en X separado)
  const tailRoot = new THREE.Group();
  tailRoot.position.set(wreck.tailX, wreck.tailY - 0.26, wreck.tailZ);
  tailRoot.rotation.order = 'YXZ';
  tailRoot.rotation.set(-0.10, wreck.tailYaw, 0.26);

  const tailScaled = new THREE.Group();
  tailScaled.scale.setScalar(AH64_SCALE);
  // Centrar la sección de cola alrededor de z = -2.4 para coincidir exactamente con wreck.tailX/tailZ
  tailScaled.position.set(0, -0.78 * AH64_SCALE, 2.40 * AH64_SCALE);
  tailRoot.add(tailScaled);

  tailScaled.add(makeMesh(createLoftedFuselage(TAIL_SECTIONS, 16, [true, true]), M.apacheWreckOlive));
  const tailFin = makeMesh(
    createWingGeometry({
      span: 1.28,
      rootChord: 0.78,
      tipChord: 0.42,
      sweepZ: -0.35,
      rootThickness: 0.09,
      tipThickness: 0.05,
      camber: 0,
      side: 1
    }),
    M.apacheWreckOlive,
    0,
    FUS_Y + 0.10,
    -3.38
  );
  tailFin.rotation.z = Math.PI / 2;
  const lowStab = makeMesh(roundedBox(1.48, 0.05, 0.38), M.apacheWreckOlive, 0, FUS_Y - 0.04, -3.65);
  const tailWheel = buildOleoWheelAssembly(M, new THREE.Vector3(0, FUS_Y - 0.04, -3.45), 0.11, false);
  tailScaled.add(tailFin, lowStab, tailWheel);

  siteRoot.add(tailRoot);

  // 4. Fragmentos metálicos legibles dispersos alrededor del cráter (rotor de cola separado, ala derecha + Hydra,
  // pala partida clavada, capó de turbina remachado y rueda delantera desprendida)
  const separatedTailRotor = buildXScissorsTailRotor(M);
  separatedTailRotor.scale.setScalar(AH64_SCALE);
  separatedTailRotor.position.set(wreck.tailX - 2.1, wreck.tailY + 0.24, wreck.tailZ + 1.85);
  separatedTailRotor.rotation.set(1.22, 0.65, 0.38);
  siteRoot.add(separatedTailRotor);

  const shearedWingFrag = new THREE.Group();
  shearedWingFrag.scale.setScalar(AH64_SCALE);
  shearedWingFrag.position.set(wreck.x + 4.35, wreck.y + 0.16, wreck.z + 1.95);
  shearedWingFrag.rotation.set(0.18, wreck.yaw - 0.85, -0.22);
  shearedWingFrag.add(
    makeMesh(
      createWingGeometry({
        span: 0.92,
        rootChord: 0.58,
        tipChord: 0.44,
        sweepZ: -0.06,
        dihedralY: 0,
        rootThickness: 0.09,
        tipThickness: 0.06,
        camber: 0.01,
        side: -1
      }),
      M.apacheWreckOlive
    )
  );
  const fragHydra = buildHydra70Pod(M);
  fragHydra.position.set(-0.62, -0.14, 0.02);
  shearedWingFrag.add(fragHydra);
  siteRoot.add(shearedWingFrag);

  const embeddedBladeFrag = makeMesh(
    createAirfoilBladeGeometry(1.95 * AH64_SCALE, 0.24 * AH64_SCALE, true, -0.14),
    M.bladeVertexMat,
    wreck.x + 2.65,
    wreck.y - 0.10,
    wreck.z - 3.85
  );
  embeddedBladeFrag.rotation.set(0.95, 0.42, -0.58);
  siteRoot.add(embeddedBladeFrag);

  const cowlingFrag = makeMesh(
    createSmoothFairingGeo(0.95, 0.38, 1.85, 0.35, 14),
    M.apacheWreckDark,
    wreck.x - 3.55,
    wreck.y + 0.14,
    wreck.z - 2.65
  );
  cowlingFrag.rotation.set(0.22, 1.15, 0.48);
  siteRoot.add(cowlingFrag);

  const detachedWheel = buildOleoWheelAssembly(M, new THREE.Vector3(0, 0.42, 0), 0.19 * AH64_SCALE, false);
  detachedWheel.position.set(wreck.x + 1.45, wreck.y + 0.22, wreck.z + 3.75);
  detachedWheel.rotation.set(1.42, 0.35, 0.78);
  siteRoot.add(detachedWheel);

  // 5. Focos de incendio activos (penachos volumétricos animados + anclajes de luz cálida en el pool)
  const fireSpots = [
    { x: wreck.x + 0.85, y: wreck.y + 1.55, z: wreck.z - 0.55, scale: 1.35, phase: 0.0 },
    { x: wreck.x - 0.95, y: wreck.y + 0.95, z: wreck.z - 1.95, scale: 1.05, phase: 1.9 },
    { x: wreck.x + 4.15, y: wreck.y + 0.28, z: wreck.z + 1.85, scale: 0.78, phase: 3.7 },
    { x: wreck.tailX + 0.45, y: wreck.tailY + 0.55, z: wreck.tailZ - 0.35, scale: 0.88, phase: 5.1 }
  ];

  const fireMeshes = [];
  for (const fs of fireSpots) {
    const plume = createFirePlumeCluster(M, fs.scale);
    plume.position.set(fs.x, fs.y, fs.z);
    siteRoot.add(plume);
    fireMeshes.push({ mesh: plume, phase: fs.phase, baseY: fs.y });
  }

  if (addLightAnchorFn) {
    addLightAnchorFn(siteRoot, '#ff7b29', 2.4, 24, 1.6, wreck.x + 0.4, wreck.y + 2.2, wreck.z - 0.6);
    addLightAnchorFn(siteRoot, '#fb923c', 1.5, 16, 1.8, wreck.tailX, wreck.tailY + 1.5, wreck.tailZ);
  }

  siteRoot.traverse((obj) => {
    if (obj.isMesh) {
      registerSharedAircraftGeo(obj.geometry);
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => registerSharedAircraftMat(m));
      } else {
        registerSharedAircraftMat(obj.material);
      }
    }
  });

  structuresGroup.add(siteRoot);

  return {
    siteRoot,
    rotorHead: damagedRotor.spinningHead,
    chinGun,
    fireMeshes,
    emitterPoints: fireSpots,
    centerX: (wreck.x + wreck.tailX) * 0.5,
    centerY: wreck.y,
    centerZ: (wreck.z + wreck.tailZ) * 0.5,

    update(delta, timeSec = 0) {
      const dt = Math.min(0.1, Math.max(0, delta));
      // Giro lento e irregular por convección térmica en el rotor principal siniestrado
      const gust = 0.55 + 0.28 * Math.sin(timeSec * 0.7);
      damagedRotor.spinningHead.rotation.y += dt * gust;

      // Oscilación sutil de las llamas activas en los 4 focos de incendio
      for (let i = 0; i < fireMeshes.length; i++) {
        const f = fireMeshes[i];
        const ph = f.phase;
        const sy = 1.0 + Math.sin(timeSec * 12.0 + ph * 1.7) * 0.26 + Math.sin(timeSec * 23.0 + ph) * 0.12;
        f.mesh.scale.set(
          1.0 + Math.sin(timeSec * 7.5 + ph) * 0.15,
          sy,
          1.0 + Math.cos(timeSec * 9.2 + ph) * 0.15
        );
        f.mesh.rotation.y = timeSec * 2.1 + ph;
      }
    }
  };
}
