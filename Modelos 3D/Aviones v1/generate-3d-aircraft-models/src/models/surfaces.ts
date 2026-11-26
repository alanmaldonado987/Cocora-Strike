import * as T from "three";

export interface LoftStation {
  z: number;
  halfWidth: number;
  topHeight: number;
  bottomHeight: number;
  yCenter?: number;
  squareness?: number;
  chinePinch?: number;
}

const tau = Math.PI * 2;
const signedPow = (v: number, p: number) =>
  Math.sign(v) * Math.pow(Math.abs(v), p);

// Monotone Hermite interpolation keeps the skin inside the authored section envelope.
export function hullSampler(input: LoftStation[]) {
  const s = [...input].sort((a, b) => a.z - b.z);
  const keys = [
    "halfWidth",
    "topHeight",
    "bottomHeight",
    "yCenter",
    "squareness",
    "chinePinch",
  ] as const;
  const slopes = s.map((_, i) =>
    keys.map((k) => {
      const a = Math.max(0, i - 1),
        b = Math.min(s.length - 1, i + 1);
      const left = ((s[i][k] ?? 0) - (s[a][k] ?? 0)) / (s[i].z - s[a].z || 1);
      const right = ((s[b][k] ?? 0) - (s[i][k] ?? 0)) / (s[b].z - s[i].z || 1);
      if (a === i) return right;
      if (b === i) return left;
      return left * right <= 0 ? 0 : (2 * left * right) / (left + right);
    }),
  );
  return (z: number, angle: number) => {
    let i = 0;
    while (i < s.length - 2 && z > s[i + 1].z) i++;
    const a = s[i],
      b = s[i + 1],
      dz = b.z - a.z;
    const t = T.MathUtils.clamp((z - a.z) / dz, 0, 1),
      t2 = t * t,
      t3 = t2 * t;
    const [w, h, l, center, square, chine] = keys.map(
      (k, j) =>
        (2 * t3 - 3 * t2 + 1) * (a[k] ?? 0) +
        (t3 - 2 * t2 + t) * dz * slopes[i][j] +
        (-2 * t3 + 3 * t2) * (b[k] ?? 0) +
        (t3 - t2) * dz * slopes[i + 1][j],
    );
    const sn = Math.sin(angle),
      cs = Math.cos(angle),
      p = 1 - 0.55 * square;
    return new T.Vector3(
      signedPow(sn, p) * w,
      center +
        signedPow(cs, p) *
          (cs >= 0 ? h : l) *
          (1 - chine * Math.pow(Math.abs(sn), 2.2)),
      z,
    );
  };
}

export function parametricPatch(
  sample: (u: number, v: number) => T.Vector3,
  nu: number,
  nv: number,
  texcoord?: (u: number, v: number) => [number, number],
) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu,
        v = j / nv;
      positions.push(...sample(u, v).toArray());
      uv.push(...(texcoord ? texcoord(u, v) : [u, v]));
      if (i < nu && j < nv) {
        const a = j * (nu + 1) + i,
          b = a + nu + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function createLoftedFuselage(
  stations: LoftStation[],
  segments = 24,
  _faceted = false,
) {
  const s = [...stations].sort((a, b) => a.z - b.z),
    at = hullSampler(s);
  const z0 = s[0].z,
    z1 = s.at(-1)!.z;
  const rows = (s.length - 1) * 3;
  const g = parametricPatch(
    (u, v) => {
      const t = u * (s.length - 1),
        i = Math.min(s.length - 2, Math.floor(t));
      return at(T.MathUtils.lerp(s[i].z, s[i + 1].z, t - i), (v - 0.5) * tau);
    },
    rows,
    segments,
    (u, v) => {
      const t = u * (s.length - 1),
        i = Math.min(s.length - 2, Math.floor(t));
      return [
        (T.MathUtils.lerp(s[i].z, s[i + 1].z, t - i) - z0) / (z1 - z0),
        v,
      ];
    },
  );
  // Reconcile duplicated UV-seam normals without welding the texture coordinates.
  const normal = g.getAttribute("normal"),
    n = new T.Vector3();
  for (let i = 0; i <= rows; i++) {
    const k = segments * (rows + 1) + i;
    n.set(
      normal.getX(i) + normal.getX(k),
      normal.getY(i) + normal.getY(k),
      normal.getZ(i) + normal.getZ(k),
    ).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
    normal.setXYZ(k, n.x, n.y, n.z);
  }
  const positions = Array.from(g.getAttribute("position").array),
    uvs = Array.from(g.getAttribute("uv").array);
  const normals = Array.from(normal.array),
    ix = Array.from(g.index!.array);
  for (const end of [0, 1]) {
    const z = end ? z1 : z0,
      center = positions.length / 3;
    positions.push(0, s[end ? s.length - 1 : 0].yCenter ?? 0, z);
    uvs.push(0.5, 0.5);
    normals.push(0, 0, end ? 1 : -1);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * tau,
        p = at(z, a);
      positions.push(...p.toArray());
      uvs.push(0.5 + 0.5 * Math.sin(a), 0.5 + 0.5 * Math.cos(a));
      normals.push(0, 0, end ? 1 : -1);
      const b = center + 1 + j,
        c = center + 1 + ((j + 1) % segments);
      ix.push(center, end ? c : b, end ? b : c);
    }
  }
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(ix);
  g.userData.sections = s;
  return g;
}

export interface WingOptions {
  span: number;
  rootChord: number;
  tipChord: number;
  sweepZ: number;
  dihedralY?: number;
  rootThickness?: number;
  tipThickness?: number;
  camber?: number;
  side: 1 | -1;
}

export function createWingGeometry(o: WingOptions) {
  const { span, side, rootChord, tipChord, sweepZ } = o;
  const stations = [0, 0.055, 0.18, 0.48, 0.72, 0.93, 0.978, 1];
  const points: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  const detail = 24;
  for (const t of stations) {
    const round = t <= 0.93 ? 1 : 1 - 0.19 * ((t - 0.93) / 0.07) ** 2;
    const c = T.MathUtils.lerp(rootChord, tipChord, t) * round;
    const thickness =
      T.MathUtils.lerp(
        o.rootThickness ?? rootChord * 0.12,
        o.tipThickness ?? tipChord * 0.1,
        t,
      ) * (t === 1 ? 0.45 : 1);
    for (let i = 0; i <= detail; i++) {
      const a = (tau * i) / detail,
        d = (1 - Math.cos(a)) / 2;
      const y =
        5 *
        thickness *
        (0.2969 * Math.sqrt(d) -
          0.126 * d -
          0.3516 * d * d +
          0.2843 * d ** 3 -
          0.1015 * d ** 4);
      points.push(
        side * span * t,
        (o.dihedralY ?? 0) * t +
          (i <= detail / 2 ? y : -y) +
          (o.camber ?? 0.012) * c * 4 * d * (1 - d),
        sweepZ * t + (0.5 - d) * c,
      );
      uv.push(t, d * 0.8 + 0.1);
    }
  }
  for (let j = 0; j < stations.length - 1; j++)
    for (let i = 0; i < detail; i++) {
      const a = j * (detail + 1) + i,
        b = a + detail + 1;
      if (side > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
      else index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  for (const j of [0, stations.length - 1]) {
    const s = j * (detail + 1);
    for (let i = 1; i < detail - 1; i++) {
      if ((j === 0) === side > 0) index.push(s, s + i, s + i + 1);
      else index.push(s, s + i + 1, s + i);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(points, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const normals = g.getAttribute("normal"),
    normal = new T.Vector3();
  for (let j = 0; j < stations.length; j++) {
    const a = j * (detail + 1),
      b = a + detail;
    normal
      .set(
        normals.getX(a) + normals.getX(b),
        normals.getY(a) + normals.getY(b),
        normals.getZ(a) + normals.getZ(b),
      )
      .normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z);
    normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
  return g;
}

export function fairing(
  width: number,
  height: number,
  length: number,
  mat: T.Material,
  square = 0.12,
) {
  const s = [
    [-0.5, 0.025],
    [-0.39, 0.68],
    [-0.16, 0.98],
    [0.21, 1],
    [0.4, 0.68],
    [0.5, 0.025],
  ];
  return new T.Mesh(
    createLoftedFuselage(
      s.map(([z, k]) => ({
        z: z * length,
        halfWidth: (width * k) / 2,
        topHeight: (height * k) / 2,
        bottomHeight: (height * k) / 2,
        squareness: square,
      })),
      20,
    ),
    mat,
  );
}

export function revolved(profile: number[][], mat: T.Material, seg = 24) {
  return new T.Mesh(
    new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      seg,
    ),
    mat,
  );
}

export function ellipsoid(x: number, y: number, z: number, mat: T.Material) {
  const m = new T.Mesh(new T.SphereGeometry(1, 16, 10), mat);
  m.scale.set(x, y, z);
  return m;
}

export function tube(
  points: T.Vector3[],
  radius: number,
  material: T.Material,
  segments = 24,
) {
  return new T.Mesh(
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points),
      segments,
      radius,
      6,
      false,
    ),
    material,
  );
}
