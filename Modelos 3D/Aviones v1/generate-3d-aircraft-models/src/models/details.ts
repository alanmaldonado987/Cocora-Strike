import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getMaterials } from "./materials";
import {
  fairing,
  createWingGeometry,
  hullSampler,
  tube,
  type LoftStation,
} from "./surfaces";

export function machined(w: number, h: number, d: number) {
  const radius = Math.min(w, h, d) * 0.19;
  return Math.max(w, h, d) > 0.3 && radius > 0.008
    ? new RoundedBoxGeometry(w, h, d, 1, radius)
    : new T.BoxGeometry(w, h, d);
}

export function aerial(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  height = 0.15,
) {
  const m = getMaterials(),
    base = fairing(0.06, 0.04, height * 1.4, m.tacticalGrey);
  base.position.set(x, y, z);
  parent.add(base);
  const fin = new T.Mesh(
    createWingGeometry({
      span: height,
      side: 1,
      rootChord: height * 0.8,
      tipChord: height * 0.26,
      sweepZ: -height * 0.28,
      rootThickness: 0.02,
      tipThickness: 0.009,
    }),
    m.tacticalGrey,
  );
  fin.rotation.z = Math.PI / 2;
  fin.position.copy(base.position);
  parent.add(fin);
}

export function flushHatch(
  sections: LoftStation[],
  center: number,
  width: number,
) {
  const at = hullSampler(sections),
    points: T.Vector3[] = [];
  const path = new T.Shape();
  path.moveTo(-0.43, 0);
  path.lineTo(0.43, 0);
  path.quadraticCurveTo(0.5, 0, 0.5, 0.06);
  path.lineTo(0.5, 0.94);
  path.quadraticCurveTo(0.5, 1, 0.43, 1);
  path.lineTo(-0.43, 1);
  path.quadraticCurveTo(-0.5, 1, -0.5, 0.94);
  path.lineTo(-0.5, 0.06);
  path.quadraticCurveTo(-0.5, 0, -0.43, 0);
  for (const p of path.getSpacedPoints(64))
    points.push(
      at(center + p.x * width, 1.11 + p.y * 1.03).add(
        new T.Vector3(0.002, 0, 0),
      ),
    );
  return tube(points, 0.0045, getMaterials().gunmetal, 80);
}

export function attachment(
  parent: T.Object3D,
  from: number[],
  to: number[],
  radius: number,
  mat: T.Material,
) {
  const a = new T.Vector3(...from),
    b = new T.Vector3(...to),
    delta = b.clone().sub(a);
  const strut = new T.Mesh(
    new T.CylinderGeometry(radius * 0.72, radius, delta.length(), 10),
    mat,
  );
  strut.position.copy(a).lerp(b, 0.5);
  strut.quaternion.setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    delta.normalize(),
  );
  parent.add(strut);
}

export function vent(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  length: number,
  height: number,
  side = 1,
) {
  const m = getMaterials();
  const frame = new T.Mesh(
    new RoundedBoxGeometry(0.027, height, length, 1, 0.01),
    m.gunmetal,
  );
  frame.position.set(x, y, z);
  parent.add(frame);
  const strips = new T.InstancedMesh(
    new T.BoxGeometry(0.016, height * 0.77, 0.014),
    m.titanium,
    11,
  );
  const dummy = new T.Object3D();
  for (let i = 0; i < 11; i++) {
    dummy.position.set(
      x + side * 0.015,
      y,
      z - length * 0.42 + length * 0.084 * i,
    );
    dummy.rotation.x = 0.13;
    dummy.updateMatrix();
    strips.setMatrixAt(i, dummy.matrix);
  }
  parent.add(strips);
}
