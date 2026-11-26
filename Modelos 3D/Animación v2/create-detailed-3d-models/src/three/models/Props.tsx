import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import fontJson from '../../assets/helvetiker_bold.typeface.json'
import { Bx, Cn, Cy, Geo, GeoBuilder, Sp, TEX, Tor, rng, rockGeometry, useAnim, useDispose } from '../helpers'
import { Condor } from './Fauna'

/** Sendero empedrado: adoquines irregulares fusionados en una sola malla. */
function buildCobbles(len: number, width: number) {
  const r = rng(77)
  const b = new GeoBuilder()
  const stone = new THREE.BoxGeometry(1, 1, 1)
  for (let z = 0; z < len; z += 0.34) {
    const bend = Math.sin(z * 0.35) * 0.8
    for (let x = -width / 2; x < width / 2; x += 0.36) {
      b.add(stone, [x + bend + (r() - 0.5) * 0.06, 0.03, z + (r() - 0.5) * 0.06], [(r() - 0.5) * 0.06, r() * 0.5, (r() - 0.5) * 0.06], [0.3 + r() * 0.05, 0.08, 0.28 + r() * 0.05])
    }
  }
  stone.dispose()
  return b.build()
}

/* ------------------------------ Cafeto ------------------------------ */
interface Bush { wood: THREE.BufferGeometry; leaves: THREE.BufferGeometry; red: THREE.BufferGeometry; green: THREE.BufferGeometry }
const bushCache = new Map<number, Bush>()
function buildBush(seed: number): Bush {
  const c = bushCache.get(seed)
  if (c) return c
  const r = rng(seed * 31 + 7)
  const wood = new GeoBuilder(), leaves = new GeoBuilder(), red = new GeoBuilder(), green = new GeoBuilder()
  wood.add(new THREE.CylinderGeometry(0.03, 0.055, 1.4, 8), [0, 0.7, 0])
  const leaf = new THREE.SphereGeometry(0.085, 8, 6); leaf.scale(1.5, 0.22, 0.85)
  const berry = new THREE.SphereGeometry(0.026, 7, 6)
  const nb = 11
  for (let i = 0; i < nb; i++) {
    const y = 0.3 + (i / nb) * 1.0
    const L = 0.8 - (i / nb) * 0.45
    const yaw = i * 2.4 + r() * 0.6
    const pitch = 0.35 + r() * 0.25
    const branch = new THREE.CylinderGeometry(0.01, 0.02, L, 6); branch.translate(0, L / 2, 0)
    wood.add(branch, [0, y, 0], [0, yaw, -(Math.PI / 2 - pitch)], 1, 'YZX')
    branch.dispose()
    const dir = new THREE.Vector3(Math.cos(pitch), Math.sin(pitch), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    for (let k = 1; k <= 6; k++) {
      const t = (k / 6) * L
      const p = new THREE.Vector3(0, y, 0).addScaledVector(dir, t)
      for (const s of [-1, 1]) {
        leaves.add(leaf, [p.x + (r() - 0.5) * 0.05, p.y - 0.03, p.z + (r() - 0.5) * 0.05], [r() * 0.5 - 0.6, yaw + s * 0.9 + (r() - 0.5) * 0.5, s * 0.3], 1, 'YXZ')
      }
      if (k < 6) {
        const nber = 3 + Math.floor(r() * 4)
        for (let q = 0; q < nber; q++) {
          const a = r() * Math.PI * 2
          const target = r() > 0.72 ? green : red
          target.add(berry, [p.x + Math.cos(a) * 0.035, p.y - 0.02 + (r() - 0.5) * 0.04, p.z + Math.sin(a) * 0.035])
        }
      }
    }
  }
  for (let k = 0; k < 6; k++) leaves.add(leaf, [0, 1.42, 0], [-0.5, k * 1.05, 0], 1, 'YXZ')
  leaf.dispose(); berry.dispose()
  const out = { wood: wood.build(), leaves: leaves.build(), red: red.build(), green: green.build() }
  bushCache.set(seed, out)
  return out
}

export function CoffeeBush({ variant = 0, seed = 1 }: { variant?: number; seed?: number }) {
  const n = variant === 1 ? 3 : 1
  const ref = useRef<THREE.Group>(null)
  useAnim((t) => { if (ref.current) ref.current.rotation.z = Math.sin(t * 1.3 + seed) * 0.01 })
  return (
    <group ref={ref}>
      {Array.from({ length: n }).map((_, i) => {
        const b = buildBush((seed + i) % 3)
        const pos: [number, number, number] = n === 1 ? [0, 0, 0] : [(i - 1) * 1.5, 0, (i % 2) * 0.6 - 0.3]
        return (
          <group key={i} name={`cafeto ${i + 1}`} position={pos} rotation={[0, i * 1.9, 0]}>
            <Geo geometry={b.wood} c="#5b3a1e" m={{ roughness: 0.95 }} />
            <Geo geometry={b.leaves} c="#2f6f2c" m={{ roughness: 0.5 }} />
            <Geo geometry={b.red} c="#d1261f" m={{ roughness: 0.35 }} />
            <Geo geometry={b.green} c="#86b63a" m={{ roughness: 0.45 }} />
          </group>
        )
      })}
    </group>
  )
}

/* ------------------------------ Rocas ------------------------------ */
export function Rock({ variant = 0 }: { variant?: number }) {
  const geos = useMemo(() => {
    if (variant === 0) return [{ g: rockGeometry(1, 1.4, 3, 0.72), p: [0, 0.55, 0] as const, r: 0.3, s: 1 }]
    const r = rng(9)
    return Array.from({ length: 6 }).map((_, i) => ({
      g: rockGeometry(20 + i, 0.5 + r() * 0.7, 2, 0.6 + r() * 0.3),
      p: [Math.cos(i * 1.1) * (1.2 + r()), 0.2 + r() * 0.2, Math.sin(i * 1.1) * (1.0 + r())] as const,
      r: r() * Math.PI,
      s: 1,
    }))
  }, [variant])
  useDispose(...geos.map((x) => x.g))
  return (
    <group>
      {geos.map((x, i) => (
        <Geo key={i} name={`roca ${i + 1}`} geometry={x.g} p={[x.p[0], x.p[1], x.p[2]]} r={[0, x.r, 0]} m={{ vertexColors: true, flatShading: true, roughness: 0.95 }} />
      ))}
    </group>
  )
}

/* ------------------------------ Cerca ------------------------------ */
export function Fence({ variant = 0 }: { variant?: number }) {
  const segs = variant === 1 ? 4 : 2
  const wood = useMemo(() => TEX.wood([1, 2], '#7a4c22', '#3f250d'), [])
  const { pillars, grass } = useMemo(() => {
    const r = rng(3)
    const pb = new GeoBuilder()
    for (const x of [-0.55, segs * 2 + 0.55]) {
      let y = 0
      for (let i = 0; i < 5; i++) {
        const rad = 0.36 - i * 0.045
        const g = rockGeometry(50 + i, rad, 1, 0.6, false)
        y += rad * 0.55
        pb.add(g, [x + (r() - 0.5) * 0.08, y, (r() - 0.5) * 0.08], [0, r() * 3, 0])
        y += rad * 0.5
        g.dispose()
      }
    }
    const gb = new GeoBuilder()
    const blade = new THREE.ConeGeometry(0.03, 0.3, 4); blade.translate(0, 0.15, 0)
    for (let i = 0; i < 70; i++) {
      const x = -0.8 + r() * (segs * 2 + 1.6), z = (r() - 0.5) * 0.7
      for (let k = 0; k < 3; k++) gb.add(blade, [x + (r() - 0.5) * 0.1, 0, z + (r() - 0.5) * 0.1], [(r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5], [1, 0.6 + r() * 0.8, 1])
    }
    blade.dispose()
    return { pillars: pb.build(), grass: gb.build() }
  }, [segs])
  useDispose(pillars, grass)
  const r = rng(segs)
  return (
    <group position={[-segs, 0, 0]}>
      <group name="postes">
        {Array.from({ length: segs + 1 }).map((_, i) => (
          <group key={i} position={[i * 2, 0, 0]} rotation={[0, 0, (r() - 0.5) * 0.06]}>
            <Bx a={[0.14, 1.15, 0.14]} p={[0, 0.575, 0]} m={{ map: wood, roughness: 0.9 }} />
            <Bx a={[0.16, 0.06, 0.16]} p={[0, 1.15, 0]} r={[0.2, 0, 0]} c="#4a2d12" />
          </group>
        ))}
      </group>
      <group name="travesaños">
        {Array.from({ length: segs }).map((_, i) => (
          <group key={i} position={[i * 2 + 1, 0, 0]}>
            <Bx a={[2.1, 0.11, 0.07]} p={[0, 0.5, 0.1]} r={[0, 0, (r() - 0.5) * 0.04]} m={{ map: wood }} />
            <Bx a={[2.1, 0.11, 0.07]} p={[0, 0.88, 0.1]} r={[0, 0, (r() - 0.5) * 0.04]} m={{ map: wood }} />
            {[-0.95, 0.95].map((x) => [0.5, 0.88].map((y) => (
              <Cy key={`${x}${y}`} a={[0.012, 0.012, 0.02, 6]} p={[x, y, 0.145]} r={[Math.PI / 2, 0, 0]} c="#222" m={{ metalness: 0.7, roughness: 0.4 }} />
            )))}
          </group>
        ))}
      </group>
      <Geo name="pilares de piedra" geometry={pillars} m={{ vertexColors: true, flatShading: true, roughness: 0.95 }} />
      <Geo name="pasto" geometry={grass} c="#5c9a37" m={{ roughness: 0.9 }} cast={false} />
    </group>
  )
}

/* ------------------------------ Botiquín ------------------------------ */
export function Medkit({ variant = 0 }: { variant?: number }) {
  const root = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const bubbles = useRef<(THREE.Mesh | null)[]>([])
  const label = useMemo(() => TEX.medLabel(), [])
  useAnim((t) => {
    if (root.current) { root.current.position.y = 0.08 + Math.sin(t * 2) * 0.05; root.current.rotation.y = t * 1.1 }
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(t * 3) * 0.12)
    bubbles.current.forEach((b, i) => { if (b) { const u = (t * 0.4 + i * 0.23) % 1; b.position.y = 0.18 + u * 0.2; b.position.x = Math.sin(t + i) * 0.05 } })
  })
  if (variant === 1) {
    return (
      <group ref={root}>
        <group name="caja">
          <RoundedBox args={[0.5, 0.3, 0.36]} radius={0.04} smoothness={4} position={[0, 0.15, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#f4f4f2" roughness={0.5} />
          </RoundedBox>
          <Bx a={[0.5, 0.02, 0.37]} p={[0, 0.2, 0]} c="#d8d8d4" />
        </group>
        <group name="cruz">
          <Bx a={[0.06, 0.012, 0.2]} p={[0, 0.305, 0]} c="#e02b2b" />
          <Bx a={[0.2, 0.012, 0.06]} p={[0, 0.305, 0]} c="#e02b2b" />
          <Bx a={[0.04, 0.14, 0.012]} p={[0, 0.15, 0.186]} c="#e02b2b" />
          <Bx a={[0.14, 0.04, 0.012]} p={[0, 0.15, 0.186]} c="#e02b2b" />
        </group>
        <group name="asa y cierres">
          <Tor a={[0.07, 0.012, 8, 16, Math.PI]} p={[0, 0.3, 0]} r={[0, 0, 0]} c="#2a2a2a" />
          {[-0.15, 0.15].map((x) => <Bx key={x} a={[0.05, 0.05, 0.02]} p={[x, 0.22, 0.185]} c="#9aa0a6" m={{ metalness: 0.7, roughness: 0.3 }} />)}
        </group>
      </group>
    )
  }
  return (
    <group ref={root}>
      <group name="cápsula de vidrio">
        <Cy a={[0.14, 0.14, 0.36, 28]} p={[0, 0.28, 0]} noCap cast={false}
          m={{ color: '#bff7ff', transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.05, emissive: '#2fd0f0', emissiveIntensity: 0.15, depthWrite: false }} />
        <Cy a={[0.142, 0.142, 0.1, 28]} p={[0, 0.28, 0]} m={{ map: label, roughness: 0.5 }} />
      </group>
      <group name="líquido luminoso">
        <Cy a={[0.11, 0.11, 0.27, 24]} p={[0, 0.265, 0]} c="#7ff0ff" m={{ emissive: '#3fe0ff', emissiveIntensity: 1.8, roughness: 0.3 }} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} ref={(el) => { bubbles.current[i] = el }} position={[Math.sin(i * 2) * 0.05, 0.2, Math.cos(i * 2) * 0.05]}>
            <sphereGeometry args={[0.012 + i * 0.004, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#dffbff" emissiveIntensity={2} />
          </mesh>
        ))}
      </group>
      <group name="tapas metálicas">
        <Cy a={[0.165, 0.15, 0.06, 28]} p={[0, 0.49, 0]} c="#9aa3ad" m={{ metalness: 0.75, roughness: 0.3 }} />
        <Cy a={[0.06, 0.06, 0.03, 16]} p={[0, 0.535, 0]} c="#e24444" m={{ metalness: 0.5, roughness: 0.3 }} />
        <Cy a={[0.15, 0.165, 0.06, 28]} p={[0, 0.07, 0]} c="#9aa3ad" m={{ metalness: 0.75, roughness: 0.3 }} />
        <Cy a={[0.175, 0.175, 0.04, 28]} p={[0, 0.02, 0]} c="#6f7780" m={{ metalness: 0.75, roughness: 0.35 }} />
      </group>
      <group name="resplandor">
        <mesh ref={halo} position={[0, 0.3, 0]} userData={{ noCap: true }}>
          <sphereGeometry args={[0.36, 20, 16]} />
          <meshBasicMaterial color="#5fe9ff" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <Cn a={[0.28, 2.4, 20, 1, true]} p={[0, 1.6, 0]} r={[Math.PI, 0, 0]} basic noCap cast={false} recv={false}
          c="#9ff5ff" m={{ transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }} />
        <pointLight color="#3fd9ff" intensity={5} distance={5} decay={2} position={[0, 0.35, 0]} />
      </group>
    </group>
  )
}

/* ------------------------------ Letrero COCORA ------------------------------ */
let fontCache: Font | null = null
function getFont() {
  if (!fontCache) fontCache = new FontLoader().parse(fontJson as unknown as Parameters<FontLoader['parse']>[0])
  return fontCache
}

export function CocoraSign({ variant = 0 }: { variant?: number }) {
  const onHill = variant === 1
  const letters = useMemo(() => {
    const font = getFont()
    const out: { g: THREE.BufferGeometry; x: number; w: number }[] = []
    let cursor = 0
    for (const ch of 'COCORA') {
      const g = new TextGeometry(ch, { font, size: 1.7, depth: 0.32, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2 })
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const w = bb.max.x - bb.min.x
      g.translate(-bb.min.x - w / 2, -bb.min.y, -0.16)
      out.push({ g, x: cursor + w / 2, w })
      cursor += w + 0.22
    }
    const total = cursor - 0.22
    out.forEach((l) => (l.x -= total / 2))
    return out
  }, [])
  const supports = useMemo(() => {
    const b = new GeoBuilder()
    const post = new THREE.CylinderGeometry(0.05, 0.06, 1, 8); post.translate(0, 0.5, 0)
    const bar = new THREE.BoxGeometry(1, 0.08, 0.08)
    letters.forEach((l, i) => {
      const base = onHill ? -i * 0.35 : 0
      for (const dx of [-l.w * 0.3, l.w * 0.3]) {
        b.add(post, [l.x + dx, base - 0.4, -0.3], [0, 0, 0], [1, 3.0, 1])
      }
      const bw = l.w * 0.6
      b.add(bar, [l.x, base + 1.3 + 1.1, -0.3], [0, 0, 0], [bw, 1, 1])
      b.add(bar, [l.x, base + 1.3 + 0.1, -0.3], [0, 0, 0], [bw, 1, 1])
      const diagLen = Math.hypot(1.0, bw)
      b.add(bar, [l.x, base + 1.3 + 0.6, -0.3], [0, 0, Math.atan2(1.0, bw)], [diagLen, 0.8, 0.8])
    })
    post.dispose(); bar.dispose()
    return b.build()
  }, [letters, onHill])
  useDispose(supports, ...letters.map((l) => l.g))
  const hill = useMemo(() => (onHill ? rockGeometry(3, 9, 3, 0.3, true) : null), [onHill])
  const cobbles = useMemo(() => buildCobbles(7, 1.8), [])
  useDispose(cobbles)
  const rIdx = 4
  const rTop = 1.3 + 1.72 + (onHill ? -rIdx * 0.35 : 0)
  return (
    <group>
      <group name="cóndor escultura" position={[letters[rIdx].x + 0.05, rTop - 0.02, 0]} rotation={[0, -0.35, 0]} scale={1.35}>
        <Condor statue flying={false} />
      </group>
      <group name="sendero empedrado" position={[0, onHill ? -1.55 : -0.05, 0.9]}>
        <Geo geometry={cobbles} c="#a29d90" m={{ roughness: 0.95 }} ol={false} />
        <Bx a={[2.3, 0.04, 7.2]} p={[0, 0.0, 3.5]} c="#7b6a52" m={{ roughness: 1 }} cast={false} ol={false} />
      </group>
      {letters.map((l, i) => (
        <Geo key={i} name={`letra ${'COCORA'[i]}`} geometry={l.g} p={[l.x, 1.3 + (onHill ? -i * 0.35 : 0), 0]} c="#f4f1e8" m={{ roughness: 0.55 }} />
      ))}
      <Geo name="estructura" geometry={supports} c="#4b4f52" m={{ metalness: 0.5, roughness: 0.5 }} />
      {hill && <Geo name="colina" geometry={hill} p={[0, -2.6, -1]} m={{ color: '#5fa63a', roughness: 1, flatShading: true }} cast={false} />}
      {!onHill && (
        <group name="base">
          {letters.map((l, i) => (
            <Sp key={i} a={[0.55, 10, 8]} p={[l.x, -0.15, -0.3]} s={[1.4, 0.35, 1]} c="#5fa63a" m={{ roughness: 1 }} cast={false} />
          ))}
        </group>
      )}
    </group>
  )
}
