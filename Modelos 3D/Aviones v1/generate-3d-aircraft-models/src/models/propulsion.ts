import * as T from "three";
import { getMaterials } from "./materials";
import { createLoftedFuselage, ellipsoid, revolved } from "./surfaces";

let bladeFinish: T.MeshStandardMaterial | undefined;
export function sweptBlade(
  length: number,
  chord: number,
  rotor = false,
  wood = false,
) {
  const m = getMaterials();
  if (!bladeFinish)
    bladeFinish = new T.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.23,
      roughness: 0.42,
    });
  const pos: number[] = [],
    colors: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  const spans = [0, 0.12, 0.32, 0.58, 0.8, 0.91, 0.9105, 0.98, 1];
  for (let j = 0; j < spans.length; j++) {
    const t = spans[j],
      w =
        chord *
        (0.48 + 0.75 * Math.sin(Math.PI * (0.12 + t * 0.76))) *
        (t === 1 ? 0.73 : 1);
    const sweep = chord * (rotor ? 0.45 : 0.66) * t * t;
    const twist = (1 - t) * (rotor ? 0.1 : 0.47) + 0.1;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * i) / 4,
        x = (Math.cos(a) * w) / 2,
        h = Math.sin(a) * chord * 0.058;
      pos.push(
        x * Math.cos(twist) + sweep,
        t * length,
        h + x * Math.sin(twist),
      );
      const color =
        t > 0.91
          ? m.warningYellow.color
          : wood
            ? m.mahoganyWood.color
            : new T.Color(i === 0 ? "#686d6b" : "#252a2b");
      colors.push(color.r, color.g, color.b);
      uvs.push(i / 8, t);
      if (j < spans.length - 1) {
        const k = j * 8 + i,
          n = j * 8 + ((i + 1) % 8);
        indices.push(k, k + 8, n, n, k + 8, n + 8);
      }
    }
  }
  const last = (spans.length - 1) * 8;
  for (let i = 1; i < 7; i++) indices.push(last, last + i + 1, last + i);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new T.Mesh(geo, bladeFinish);
}

export function sculptedTurboprop(o: {
  nacelleRadius: number;
  nacelleLength: number;
  bladeCount: number;
  propRadius: number;
  bodyMaterial: T.Material;
}) {
  const m = getMaterials(),
    group = new T.Group(),
    propRotor = new T.Group();
  const r = o.nacelleRadius,
    l = o.nacelleLength;
  const shape = [
    [-0.87, 0.08],
    [-0.65, 0.55],
    [-0.42, 0.92],
    [0, 1.05],
    [0.36, 0.99],
    [0.49, 0.86],
    [0.54, 0.64],
  ];
  group.add(
    new T.Mesh(
      createLoftedFuselage(
        shape.map(([z, w]) => ({
          z: z * l,
          halfWidth: r * w,
          topHeight: r * w,
          bottomHeight: r * w * 1.12,
        })),
        28,
      ),
      o.bodyMaterial,
    ),
  );
  const intake = ellipsoid(r * 0.62, r * 0.34, r * 0.3, m.rubber);
  intake.position.set(0, -r * 0.56, l * 0.475);
  group.add(intake);
  const tail = revolved(
    [
      [r * 0.46, 0],
      [r * 0.47, 0.02],
      [r * 0.41, 0.22],
      [r * 0.34, 0.22],
      [r * 0.33, 0],
    ],
    m.burntTitanium,
    18,
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, -r * 0.41, -l * 0.52);
  group.add(tail);
  propRotor.position.z = l * 0.56;
  const spinner = revolved(
    [
      [0, -0.06],
      [r * 0.67, -0.06],
      [r * 0.66, 0.015],
      [r * 0.57, r * 0.39],
      [r * 0.37, r * 0.8],
      [r * 0.09, r * 1.06],
      [0, r * 1.1],
    ],
    m.gunmetal,
    28,
  );
  spinner.rotation.x = Math.PI / 2;
  propRotor.add(spinner);
  for (let i = 0; i < o.bladeCount; i++) {
    const holder = new T.Group();
    holder.rotation.z = ((i + 0.28) * Math.PI * 2) / o.bladeCount;
    const blade = sweptBlade(o.propRadius * 0.87, o.propRadius * 0.215);
    blade.position.y = o.propRadius * 0.13;
    holder.add(blade);
    propRotor.add(holder);
  }
  group.add(propRotor);
  return { group, propRotor };
}
