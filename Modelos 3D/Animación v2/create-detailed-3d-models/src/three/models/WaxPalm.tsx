import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { Cy, Geo, GeoBuilder, TEX, rng, useAnim } from '../helpers'
import { getMat, getOutlineMaterial, outlineGeometry, useToon } from '../toon'

interface Crown { leaves: THREE.BufferGeometry; dead: THREE.BufferGeometry; fruits: THREE.BufferGeometry }
const crownCache = new Map<number, Crown>()

/** Una fronda a lo largo de +X con caída parabólica y foliolos a ambos lados. */
function frond(len: number, droop: number, rnd: () => number, leafletMax = 0.75) {
  const b = new GeoBuilder()
  const n = 14
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    pts.push(new THREE.Vector3(t * len, -droop * t * t * len, 0))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  b.add(new THREE.TubeGeometry(curve, 10, 0.032, 5, false))
  const leaf = new THREE.BoxGeometry(1, 0.012, 0.09)
  leaf.translate(0.5, 0, 0)
  const tmp = new THREE.Matrix4(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4(), rz2 = new THREE.Matrix4(), sc = new THREE.Matrix4()
  for (let i = 2; i <= n; i++) {
    const t = i / n
    const p = curve.getPoint(t)
    const tan = curve.getTangent(t)
    const pitch = Math.atan2(tan.y, tan.x)
    const L = leafletMax * (1.05 - 0.6 * t)
    for (const side of [-1, 1]) {
      const yaw = side * (1.05 - 0.3 * t + (rnd() - 0.5) * 0.25)
      const dip = 0.45 + rnd() * 0.35
      tmp.makeTranslation(p.x, p.y, p.z)
      rz.makeRotationZ(pitch); ry.makeRotationY(yaw); rz2.makeRotationZ(-dip); sc.makeScale(L, 1, 1)
      tmp.multiply(rz).multiply(ry).multiply(rz2).multiply(sc)
      b.addM(leaf, tmp)
    }
  }
  leaf.dispose()
  return b.build()
}

function buildCrown(seed: number): Crown {
  const cached = crownCache.get(seed)
  if (cached) return cached
  const rnd = rng(seed * 17 + 3)
  const leaves = new GeoBuilder(), dead = new GeoBuilder(), fruits = new GeoBuilder()
  const layers = [
    { n: 5, len: 2.6, tilt: [0.95, 0.75], droop: 0.25 },
    { n: 7, len: 3.4, tilt: [0.45, 0.2], droop: 0.32 },
    { n: 7, len: 3.5, tilt: [-0.05, -0.35], droop: 0.3 },
  ]
  layers.forEach((L, k) => {
    const f = frond(L.len, L.droop, rnd)
    for (let i = 0; i < L.n; i++) {
      const theta = (i / L.n) * Math.PI * 2 + k * 0.7 + (rnd() - 0.5) * 0.3
      const tilt = L.tilt[0] + (L.tilt[1] - L.tilt[0]) * rnd()
      leaves.add(f, [0, 0, 0], [0, theta, tilt], 1, 'YZX')
    }
    f.dispose()
  })
  const df = frond(2.6, 0.12, rnd, 0.55)
  for (let i = 0; i < 5; i++) dead.add(df, [0, -0.25, 0], [0, (i / 5) * Math.PI * 2 + 0.4, -1.25 - rnd() * 0.2], 1, 'YZX')
  df.dispose()
  const berry = new THREE.SphereGeometry(0.045, 6, 5)
  const stalk = new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6)
  for (let c = 0; c < 2; c++) {
    const ang = c * 2.4 + 0.5
    const cx = Math.cos(ang) * 0.35, cz = Math.sin(ang) * 0.35
    fruits.add(stalk, [cx, -0.55, cz], [0.2 * Math.sin(ang), 0, -0.2 * Math.cos(ang)])
    for (let i = 0; i < 48; i++) {
      const y = -0.5 - rnd() * 0.75
      const rr = 0.06 + (1 - Math.abs(y + 0.9) / 0.45) * 0.16 * rnd()
      const a = rnd() * Math.PI * 2
      fruits.add(berry, [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr])
    }
  }
  berry.dispose(); stalk.dispose()
  const out = { leaves: leaves.build(), dead: dead.build(), fruits: fruits.build() }
  crownCache.set(seed, out)
  return out
}

export function WaxPalm({ variant = 0, seed = 1, height }: { variant?: number; seed?: number; height?: number }) {
  const H = height ?? (variant === 1 ? 7 : 15)
  const crown = useMemo(() => buildCrown(seed % 4), [seed])
  const ref = useRef<THREE.Group>(null)
  const trunkTex = useMemo(() => TEX.palmTrunk([3, Math.max(4, Math.round(H / 0.45))]), [H])
  useAnim((t) => {
    const g = ref.current
    if (!g) return
    g.rotation.z = Math.sin(t * 0.8 + seed) * 0.035
    g.rotation.x = Math.cos(t * 0.6 + seed * 1.3) * 0.03
  })
  return (
    <group>
      <Cy name="tronco" a={[0.16, 0.3, H, 14]} p={[0, H / 2, 0]} m={{ map: trunkTex, roughness: 0.9 }} />
      <Cy name="raíz" a={[0.33, 0.45, 0.35, 14]} p={[0, 0.17, 0]} c="#8a8a78" />
      <Cy name="cogollo" a={[0.11, 0.18, 1.0, 12]} p={[0, H + 0.45, 0]} c="#7a9a45" />
      <group name="copa" ref={ref} position={[0, H + 0.9, 0]}>
        <Geo geometry={crown.leaves} c="#3f8f2f" m={{ roughness: 0.85 }} />
        <Geo geometry={crown.dead} c="#b08e45" m={{ roughness: 0.95 }} />
        <Geo geometry={crown.fruits} c="#c9452a" m={{ roughness: 0.55 }} />
      </group>
    </group>
  )
}

/* ===================== Campo de palmas instanciado ===================== */
export interface PalmSpec { x: number; y: number; z: number; h: number; seed: number; rot: number }
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3()

function makeInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, outline: boolean, shared?: THREE.InstancedBufferAttribute) {
  const m = new THREE.InstancedMesh(geo, mat, count)
  if (shared) m.instanceMatrix = shared
  m.castShadow = true
  m.receiveShadow = true
  m.frustumCulled = false
  if (outline) {
    const o = new THREE.InstancedMesh(outlineGeometry(geo), getOutlineMaterial(), count)
    o.instanceMatrix = m.instanceMatrix
    o.userData = { noCap: true, noExport: true, outline: true }
    o.frustumCulled = false
    o.raycast = () => {}
    m.add(o)
  }
  return m
}

export function PalmField({ palms }: { palms: PalmSpec[] }) {
  const toon = useToon()
  const built = useMemo(() => {
    const group = new THREE.Group()
    group.name = 'palmas de cera (instanciadas)'
    const n = palms.length
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 12).translate(0, 0.5, 0)
    const rootGeo = new THREE.CylinderGeometry(0.33, 0.45, 0.35, 12).translate(0, 0.17, 0)
    const budGeo = new THREE.CylinderGeometry(0.11, 0.18, 1.0, 10)
    const trunks = makeInstanced(trunkGeo, getMat(toon, '#ffffff', { map: TEX.palmTrunk([3, 34]) }), n, toon)
    const roots = makeInstanced(rootGeo, getMat(toon, '#8a8a78'), n, toon)
    const buds = makeInstanced(budGeo, getMat(toon, '#7a9a45'), n, false)
    palms.forEach((pl, i) => {
      _q.setFromEuler(_e.set(0, pl.rot, 0))
      trunks.setMatrixAt(i, _m4.compose(_p.set(pl.x, pl.y, pl.z), _q, _s.set(1, pl.h, 1)))
      roots.setMatrixAt(i, _m4.compose(_p.set(pl.x, pl.y, pl.z), _q, _s.set(1, 1, 1)))
      buds.setMatrixAt(i, _m4.compose(_p.set(pl.x, pl.y + pl.h + 0.45, pl.z), _q, _s.set(1, 1, 1)))
    })
    group.add(trunks, roots, buds)
    const crowns: { mesh: THREE.InstancedMesh; idx: number[] }[] = []
    for (let seed = 0; seed < 4; seed++) {
      const idx = palms.map((p, i) => (p.seed % 4 === seed ? i : -1)).filter((i) => i >= 0)
      if (!idx.length) continue
      const c = buildCrown(seed)
      const leaves = makeInstanced(c.leaves, getMat(toon, '#3f8f2f'), idx.length, toon)
      const dead = makeInstanced(c.dead, getMat(toon, '#b08e45'), idx.length, false, leaves.instanceMatrix)
      const fruits = makeInstanced(c.fruits, getMat(toon, '#c9452a'), idx.length, false, leaves.instanceMatrix)
      group.add(leaves, dead, fruits)
      crowns.push({ mesh: leaves, idx })
    }
    return { group, crowns, geos: [trunkGeo, rootGeo, budGeo] }
  }, [palms, toon])
  useEffect(() => () => built.geos.forEach((g) => g.dispose()), [built])
  useAnim((t) => {
    for (const { mesh, idx } of built.crowns) {
      for (let k = 0; k < idx.length; k++) {
        const pl = palms[idx[k]]
        _q.setFromEuler(_e.set(Math.cos(t * 0.6 + pl.seed * 1.3 + k) * 0.03, pl.rot, Math.sin(t * 0.8 + pl.seed + k * 0.7) * 0.035, 'YXZ'))
        mesh.setMatrixAt(k, _m4.compose(_p.set(pl.x, pl.y + pl.h + 0.9, pl.z), _q, _s.set(1, 1, 1)))
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  })
  return <primitive object={built.group} />
}
