import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getMaterials } from "./materials";
import {
  ellipsoid,
  hullSampler,
  parametricPatch,
  tube,
  type LoftStation,
} from "./surfaces";

const v3 = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
let instruments: T.MeshStandardMaterial | undefined;

function instrumentMaterial() {
  if (instruments) return instruments;
  let map: T.CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#1b2226";
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 3; i++) {
      const x = 9 + i * 84;
      ctx.fillStyle = "#080f10";
      ctx.fillRect(x, 14, 62, 71);
      ctx.fillStyle = "#6e9b8c";
      ctx.fillRect(x + 5, 20, 52, 2);
      ctx.strokeStyle = "#7abcab";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = 0; j < 20; j++)
        ctx.lineTo(x + 5 + j * 2.7, 49 + Math.sin(j * 0.5 + i) * 12);
      ctx.stroke();
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = j === 0 ? "#c6a569" : "#8b9796";
        ctx.fillRect(x + 3 + j * 16, 96, 7, 9);
      }
    }
    map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
  }
  instruments = new T.MeshStandardMaterial({
    map,
    emissiveMap: map,
    emissive: 0x93b7a3,
    emissiveIntensity: 0.26,
    roughness: 0.65,
  });
  return instruments;
}

export function crewStation(scale = 1) {
  const m = getMaterials(),
    g = new T.Group();
  g.name = "Crew station";
  g.scale.setScalar(scale);
  const cushion = new T.Mesh(
    new RoundedBoxGeometry(0.32, 0.09, 0.34, 1, 0.035),
    m.cockpitInterior,
  );
  g.add(cushion);
  const back = new T.Mesh(
    new RoundedBoxGeometry(0.29, 0.38, 0.085, 1, 0.035),
    m.cockpitInterior,
  );
  back.position.set(0, 0.19, -0.145);
  back.rotation.x = -0.1;
  g.add(back);
  const torso = ellipsoid(0.121, 0.17, 0.077, m.apacheOlive);
  torso.position.set(0, 0.193, -0.025);
  g.add(torso);
  const head = ellipsoid(0.082, 0.095, 0.084, m.tacticalGrey);
  head.position.set(0, 0.405, -0.03);
  g.add(head);
  const visor = ellipsoid(0.079, 0.042, 0.042, m.gunmetal);
  visor.position.set(0, 0.413, 0.018);
  g.add(visor);
  for (const side of [-1, 1]) {
    const harness = tube(
      [
        v3(side * 0.082, 0.31, -0.03),
        v3(side * 0.07, 0.28, 0.034),
        v3(side * 0.05, 0.12, 0.048),
      ],
      0.012,
      m.chinookSage,
      6,
    );
    g.add(harness);
    const arm = tube(
      [
        v3(side * 0.104, 0.265, 0.005),
        v3(side * 0.134, 0.15, 0.035),
        v3(side * 0.102, 0.17, 0.12),
      ],
      0.033,
      m.apacheOlive,
      8,
    );
    g.add(arm);
  }
  const panel = new T.Mesh(
    new RoundedBoxGeometry(0.37, 0.142, 0.085, 1, 0.018),
    m.cockpitInterior,
  );
  panel.position.set(0, 0.214, 0.316);
  panel.rotation.x = -0.18;
  g.add(panel);
  const display = new T.Mesh(
    new T.PlaneGeometry(0.325, 0.11),
    instrumentMaterial(),
  );
  display.rotation.y = Math.PI;
  display.position.z = -0.044;
  panel.add(display);
  const stick = tube(
    [v3(0.04, 0.055, 0.12), v3(0.04, 0.14, 0.11), v3(0.04, 0.175, 0.097)],
    0.012,
    m.gunmetal,
    6,
  );
  g.add(stick);
  return g;
}

function trace(
  at: (t: number) => T.Vector3,
  rad: number,
  mat: T.Material,
  n = 18,
) {
  return tube(
    Array.from({ length: n + 1 }, (_, i) => at(i / n)),
    rad,
    mat,
    n,
  );
}

export function cutOpening(
  geometry: T.BufferGeometry,
  distance: (p: T.Vector3) => number,
) {
  const idx = geometry.index,
    p = geometry.getAttribute("position"),
    n = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
    const tri = [0, 1, 2].map((j) => {
      const k = idx ? idx.getX(i + j) : i + j,
        point = new T.Vector3().fromBufferAttribute(p, k);
      return {
        p: point,
        n: new T.Vector3().fromBufferAttribute(n, k),
        uv: new T.Vector2(uv.getX(k), uv.getY(k)),
        d: distance(point),
      };
    });
    const poly = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j],
        b = tri[(j + 1) % 3];
      if (a.d >= 0) poly.push(a);
      if (a.d >= 0 !== b.d >= 0) {
        const t = a.d / (a.d - b.d);
        poly.push({
          p: a.p.clone().lerp(b.p, t),
          n: a.n.clone().lerp(b.n, t).normalize(),
          uv: a.uv.clone().lerp(b.uv, t),
        });
      }
    }
    for (let j = 1; j < poly.length - 1; j++)
      for (const v of [poly[0], poly[j], poly[j + 1]]) {
        positions.push(...v.p.toArray());
        normals.push(...v.n.toArray());
        uvs.push(v.uv.x, v.uv.y);
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  return g;
}

export function framedCanopy(
  sections: LoftStation[],
  frame: T.Material,
  hoops: number[],
  angular = false,
  host?: T.Mesh,
) {
  const g = new T.Group(),
    m = getMaterials(),
    sample = hullSampler(sections);
  g.name = "Glazed canopy";
  const a = sections[0].z,
    b = sections[sections.length - 1].z;
  const at = (u: number, v: number) =>
    sample(
      T.MathUtils.lerp(a, b, u),
      T.MathUtils.lerp(-Math.PI / 2, Math.PI / 2, v),
    );
  if (host) {
    const original = host.geometry;
    host.geometry = cutOpening(original, (p) => {
      const rail = sample(p.z, Math.PI / 2);
      return Math.max(
        Math.abs(p.x) - rail.x * 0.98,
        a - p.z,
        p.z - b,
        rail.y - 0.31 - p.y,
      );
    });
    original.dispose();
    for (const side of [0, 1]) {
      const sill = new T.Mesh(
        parametricPatch(
          (u, v) => {
            const p = at(u, side);
            p.x *= 1 + v * 0.075;
            p.y -= v * 0.21;
            return p;
          },
          18,
          2,
        ),
        frame,
      );
      g.add(sill);
    }
    const bed = new T.Mesh(
      parametricPatch(
        (u, v) => {
          const p = at(u, 1);
          p.x *= 2 * v - 1;
          p.y -= 0.25;
          return p;
        },
        18,
        2,
      ),
      m.cockpitInterior,
    );
    bed.name = "Recessed cockpit floor";
    g.add(bed);
  }
  const glass = new T.Mesh(
    parametricPatch(at, angular ? 12 : 24, angular ? 8 : 28),
    m.canopySmoke,
  );
  glass.name = "Canopy glass";
  glass.renderOrder = 3;
  g.add(glass);
  for (const side of [0, 1]) g.add(trace((t) => at(t, side), 0.018, frame));
  for (const u of [0.003, ...hoops, 0.997])
    g.add(trace((t) => at(u, t), 0.014, frame));
  if (angular) g.add(trace((t) => at(t, 0.5), 0.014, frame));
  for (const end of [0, 1]) {
    const cap = new T.Mesh(
      parametricPatch(
        (u, v) => {
          const p = at(end, u);
          p.y = T.MathUtils.lerp(at(end, 1).y, p.y, v);
          return p;
        },
        16,
        2,
      ),
      end ? m.canopySmoke : frame,
    );
    g.add(cap);
  }
  return g;
}

interface Glazing {
  rear: [number, number];
  front: [number, number];
  angle: number;
  divisions: number;
  portholes?: number[];
  brow?: boolean;
}

// The glazing replaces hull faces. Skin and glazing share their boundary sampler,
// so neither an opaque backing polygon nor coplanar glass is left in the cabin.
export function glazedHull(
  sections: LoftStation[],
  paint: T.Material,
  cfg: Glazing,
) {
  const g = new T.Group(),
    m = getMaterials(),
    at = hullSampler(sections);
  g.name = "Continuous glazed hull";
  const min = sections[0].z,
    max = sections[sections.length - 1].z;
  const skins: T.BufferGeometry[] = [],
    panes: T.BufferGeometry[] = [];
  const bounds = (a: number, ends: [number, number]) =>
    T.MathUtils.lerp(
      ends[0],
      ends[1],
      Math.min(1, Math.abs(a) / cfg.angle) ** 1.6,
    );
  const patch = (
    a0: number,
    a1: number,
    lo: (a: number) => number,
    hi: (a: number) => number,
    dest: T.BufferGeometry[],
    detail: number,
  ) => {
    const ang = (v: number) => T.MathUtils.lerp(a0, a1, v);
    const pos = (u: number, v: number) =>
      at(T.MathUtils.lerp(lo(ang(v)), hi(ang(v)), u), ang(v));
    const nv = Math.max(3, Math.ceil((a1 - a0) * 10));
    const geom = parametricPatch(pos, detail, nv, (u, v) => [
      (pos(u, v).z - min) / (max - min),
      0.5 + ang(v) / (Math.PI * 2),
    ]);
    const normals = geom.getAttribute("normal");
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= detail; i++) {
        const a = ang(j / nv),
          z = pos(i / detail, j / nv).z;
        const tangent = at(z + 0.001, a).sub(at(z - 0.001, a));
        const n = tangent
          .cross(at(z, a + 0.001).sub(at(z, a - 0.001)))
          .normalize();
        normals.setXYZ(j * (detail + 1) + i, n.x, n.y, n.z);
      }
    dest.push(geom);
  };
  const intervals = [
    -Math.PI,
    -cfg.angle,
    ...Array.from(
      { length: cfg.divisions - 1 },
      (_, i) => -cfg.angle + ((i + 1) * cfg.angle * 2) / cfg.divisions,
    ),
    cfg.angle,
    Math.PI,
  ];
  if (cfg.portholes) intervals.push(-1.58, -1.17, 1.17, 1.58);
  intervals.sort((a, b) => a - b);
  for (let i = 0; i < intervals.length - 1; i++) {
    const a = intervals[i],
      b = intervals[i + 1],
      mid = Math.abs((a + b) / 2);
    const rear = (t: number) => bounds(t, cfg.rear),
      front = (t: number) => bounds(t, cfg.front);
    let last = min;
    if (cfg.portholes && mid > 1.17 && mid < 1.58) {
      for (const z of cfg.portholes) {
        patch(
          a,
          b,
          () => last,
          () => z - 0.125,
          skins,
          10,
        );
        patch(
          a,
          b,
          () => z - 0.125,
          () => z + 0.125,
          panes,
          3,
        );
        last = z + 0.125;
      }
    }
    patch(a, b, () => last, rear, skins, 36);
    patch(a, b, rear, front, mid <= cfg.angle ? panes : skins, 10);
    patch(a, b, front, () => max, skins, 14);
  }
  for (const [geo, mat] of [
    [skins, paint],
    [panes, m.canopySmoke],
  ] as const) {
    const merged = mergeGeometries(geo)!;
    const mesh = new T.Mesh(merged, mat);
    mesh.name = geo === skins ? "Hull skin" : "Flight deck glass";
    if (geo === panes) mesh.renderOrder = 3;
    g.add(mesh);
    geo.forEach((s) => s.dispose());
  }
  for (const ends of [cfg.rear, cfg.front])
    g.add(
      trace(
        (t) => {
          const a = (t * 2 - 1) * cfg.angle;
          return at(bounds(a, ends), a);
        },
        0.018,
        paint,
        44,
      ),
    );
  for (let i = 0; i <= cfg.divisions; i++) {
    const a = -cfg.angle + (cfg.angle * 2 * i) / cfg.divisions;
    g.add(
      trace(
        (t) =>
          at(T.MathUtils.lerp(bounds(a, cfg.rear), bounds(a, cfg.front), t), a),
        0.017,
        paint,
        10,
      ),
    );
  }
  if (cfg.brow)
    g.add(
      trace(
        (t) => {
          const a = (t * 2 - 1) * cfg.angle;
          return at(
            T.MathUtils.lerp(bounds(a, cfg.rear), bounds(a, cfg.front), 0.24),
            a,
          );
        },
        0.016,
        paint,
        40,
      ),
    );
  for (const z of [min, max]) {
    const cap = new T.Shape();
    for (let i = 0; i <= 32; i++) {
      const p = at(z, (i / 32) * Math.PI * 2);
      if (i === 0) cap.moveTo(p.x, p.y);
      else cap.lineTo(p.x, p.y);
    }
    const mesh = new T.Mesh(new T.ShapeGeometry(cap), paint);
    mesh.position.z = z;
    if (z === min) mesh.geometry.rotateY(Math.PI);
    g.add(mesh);
  }
  return g;
}
