import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { Geo, GeoBuilder, TEX, rng, rockGeometry, useAnim, useDispose } from '../helpers'
import { PalmField, type PalmSpec } from './WaxPalm'
import { ColonialHouse } from './ColonialHouse'
import { Helicopter } from './Helicopter'
import { Character } from './Character'
import { StoneBridge } from './StoneBridge'
import { Condor, Tapir } from './Fauna'
import { Bear } from './Bear'
import { CoffeeBush, Fence, Medkit, CocoraSign } from './Props'

export const SIZE = 72
const SEG = 110

export function riverX(z: number) { return 13 + 3 * Math.sin(z * 0.11) + 1.2 * Math.sin(z * 0.31) }
export function pathX(z: number) { return -2 + 2.5 * Math.sin(z * 0.09 + 1) }
function baseHills(x: number, z: number) {
  let h = 0.6 + 1.2 * Math.sin(x * 0.11 + 0.5) * Math.cos(z * 0.09) + 0.6 * Math.sin(x * 0.27 + 2) * Math.sin(z * 0.23 + 1)
  h += 5.5 * Math.exp(-((x + 10) ** 2 + (z + 26) ** 2) / 260)
  h += 6.5 * Math.exp(-((x - 20) ** 2 + (z + 28) ** 2) / 300)
  h += 3.5 * Math.exp(-((x + 30) ** 2 + (z - 2) ** 2) / 200)
  h += 2.5 * Math.exp(-((x - 30) ** 2 + (z - 10) ** 2) / 160)
  h += Math.max(0, -z - 10) * 0.12
  return h
}
export const CRATER = { x: -6, z: 4 }
export function terrainHeight(x: number, z: number) {
  const dx = x - riverX(z)
  const riverMask = Math.exp(-(dx * dx) / 36)
  let h = baseHills(x, z) * (1 - riverMask * 0.9)
  h -= 2.4 * Math.exp(-(dx * dx) / 7)
  const cd2 = (x - CRATER.x) ** 2 + (z - CRATER.z) ** 2
  h -= 1.1 * Math.exp(-cd2 / 5) - 0.25 * Math.exp(-cd2 / 14)
  // aplanado del pueblo: zócalos sin huecos
  const vill = Math.exp(-((x + 14) ** 2 + (z + 2) ** 2) / 90)
  h = h * (1 - vill * 0.75) + vill * 0.75 * 0.6
  return h
}

/* ---------------- Disposición compartida (visor + colisiones del juego) ---------------- */
const at = (x: number, z: number, dy = 0): [number, number, number] => [x, terrainHeight(x, z) + dy, z]
export const LAYOUT = {
  houses: [
    { x: -16, z: -4, rot: 0.35, floors: 2 },
    { x: -11.5, z: -11, rot: -0.25, floors: 2 },
    { x: -19, z: 4.5, rot: 1.0, floors: 1 },
  ],
  sign: { x: -4, z: -17, rot: 0.15 },
  heli: { x: -3, z: -2, rot: 0.7 },
  fence: { x: 1, z: 10.5, rot: 0.05, segs: 4 },
  bridge: { z: 2 },
  rocks: [[6, 6, 0.9], [-4.5, 7.5, 0.7], [15.5, 12, 1.2], [17, -5, 1.0], [9.5, 10.5, 0.6], [-9, -7, 1.1], [24, 4, 1.4], [-20, 12, 1.0]] as [number, number, number][],
  coffee: [[-8, 8, 1], [-10, 11, 2], [6.5, 10, 0]] as [number, number, number][],
}
/** Altura del zócalo de una casa: el punto más alto de su huella (cero huecos). */
export function houseBase(x: number, z: number) {
  let h = -Infinity
  for (const dx of [-3.4, 0, 3.4]) for (const dz of [-2.8, 0, 2.8]) h = Math.max(h, terrainHeight(x + dx, z + dz))
  return h - 0.05
}

export const PALMS: PalmSpec[] = (() => {
  const r = rng(5)
  const out: PalmSpec[] = []
  let tries = 0
  while (out.length < 28 && tries < 600) {
    tries++
    const x = (r() - 0.5) * 60, z = -32 + r() * 42
    if (Math.abs(x - riverX(z)) < 4.5) continue
    if (Math.hypot(x + 14, z + 2) < 10) continue
    if (Math.hypot(x + 3, z + 2) < 7) continue
    if (Math.hypot(x - 3, z - 8) < 6) continue
    if (Math.hypot(x + 4, z + 17) < 6.5) continue
    if (z > 8 && Math.abs(x) < 10) continue
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue
    out.push({ x, y: terrainHeight(x, z) - 0.2, z, h: 11 + r() * 7, seed: Math.floor(r() * 4), rot: r() * Math.PI * 2 })
  }
  return out
})()

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const grassD = new THREE.Color('#4f9a33'), grassL = new THREE.Color('#8ed05a'), sand = new THREE.Color('#c9b78a')
  const bed = new THREE.Color('#6d6a5a'), dirt = new THREE.Color('#9a7a52'), scorch = new THREE.Color('#2f2a26'), rockC = new THREE.Color('#7f8a6a')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)
    const n = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2) * Math.cos(z * 0.8 + Math.sin(x * 0.5))
    c.copy(grassD).lerp(grassL, THREE.MathUtils.clamp(n * 0.7 + h * 0.05, 0, 1))
    if (h > 4.5) c.lerp(rockC, THREE.MathUtils.clamp((h - 4.5) / 3, 0, 0.6))
    const dx = Math.abs(x - riverX(z))
    if (dx < 4) c.lerp(sand, THREE.MathUtils.smoothstep(4 - dx, 0, 1.3))
    if (dx < 2.4) c.lerp(bed, THREE.MathUtils.smoothstep(2.4 - dx, 0, 1))
    const dp = Math.abs(x - pathX(z))
    if (dp < 1.6 && z > -16) c.lerp(dirt, THREE.MathUtils.smoothstep(1.6 - dp, 0, 0.9))
    const cd = Math.hypot(x - CRATER.x, z - CRATER.z)
    if (cd < 3.6) c.lerp(scorch, THREE.MathUtils.smoothstep(3.6 - cd, 0, 1.6))
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

function buildTrees() {
  const r = rng(99)
  const trunks = new GeoBuilder(), canopies = new GeoBuilder()
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 7); trunk.translate(0, 1.1, 0)
  const ball = new THREE.IcosahedronGeometry(1, 1)
  let placed = 0, tries = 0
  while (placed < 42 && tries < 400) {
    tries++
    const x = (r() - 0.5) * SIZE * 0.95, z = -SIZE / 2 + r() * SIZE * 0.95
    if (!(z < -14 || Math.abs(x) > 23)) continue
    if (Math.abs(x - riverX(z)) < 5) continue
    const h = terrainHeight(x, z)
    const s = 0.8 + r() * 0.8
    trunks.add(trunk, [x, h - 0.2, z], [0, 0, 0], s)
    for (let k = 0; k < 3; k++) canopies.add(ball, [x + (r() - 0.5) * 1.6 * s, h + 2.4 * s + (r() - 0.3) * 1.2 * s, z + (r() - 0.5) * 1.6 * s], [0, r() * 3, 0], (1.1 + r() * 0.8) * s)
    placed++
  }
  trunk.dispose(); ball.dispose()
  return { trunks: trunks.build(), canopies: canopies.build() }
}

function buildRocks() {
  const r = rng(7)
  const b = new GeoBuilder()
  LAYOUT.rocks.forEach(([x, z, s], i) => {
    const g = rockGeometry(200 + i, s, 2, 0.7)
    b.add(g, [x, terrainHeight(x, z) + s * 0.2, z], [0, r() * 3, 0])
    g.dispose()
  })
  // anillo de rocas expulsadas alrededor del cráter
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.3, d = 3.3 + r() * 1.4
    const x = CRATER.x + Math.cos(a) * d, z = CRATER.z + Math.sin(a) * d
    const s = 0.18 + r() * 0.3
    const g = rockGeometry(300 + i, s, 1, 0.65)
    b.add(g, [x, terrainHeight(x, z) + s * 0.15, z], [0, r() * 3, 0])
    g.dispose()
  }
  return b.build()
}

function FlyingCondor({ radius, height, speed, phase, cx, cz }: { radius: number; height: number; speed: number; phase: number; cx: number; cz: number }) {
  const ref = useRef<THREE.Group>(null)
  useAnim((t) => {
    const g = ref.current
    if (!g) return
    const a = t * speed + phase
    g.position.set(cx + Math.cos(a) * radius, height + Math.sin(t * 0.5 + phase) * 1.5, cz + Math.sin(a) * radius)
    g.rotation.set(0, -a, 0.3)
  })
  return <group ref={ref}><Condor variant={0} flying={false} /></group>
}

export function FullScene({ withPlayer = true }: { variant?: number; withPlayer?: boolean }) {
  const terrain = useMemo(() => buildTerrain(), [])
  const trees = useMemo(() => buildTrees(), [])
  const rocks = useMemo(() => buildRocks(), [])
  useDispose(terrain, trees.trunks, trees.canopies, rocks)
  const water = useMemo(() => TEX.water(), [])
  const waterRef = useRef<THREE.Mesh>(null)
  useAnim((_, dt) => {
    const m = waterRef.current?.material as THREE.MeshStandardMaterial | undefined
    if (m?.map) m.map.offset.y -= dt * 0.05
  })
  const L = LAYOUT
  return (
    <group>
      <mesh name="terreno" geometry={terrain} receiveShadow castShadow userData={{ noCap: true }}>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh ref={waterRef} name="río" position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ noCap: true }} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial map={water} color="#4cc3d9" transparent opacity={0.86} roughness={0.12} metalness={0.1} />
      </mesh>
      <Geo name="troncos" geometry={trees.trunks} c="#5a4028" m={{ roughness: 0.95 }} ol={false} />
      <Geo name="copas" geometry={trees.canopies} c="#2f7a2e" m={{ roughness: 0.9, flatShading: true }} />
      <Geo name="rocas" geometry={rocks} m={{ vertexColors: true, flatShading: true, roughness: 0.95 }} />

      <group name="pueblo">
        {L.houses.map((h, i) => (
          <group key={i} position={[h.x, houseBase(h.x, h.z), h.z]} rotation={[0, h.rot, 0]}>
            <ColonialHouse variant={h.floors === 2 ? 0 : 1} />
          </group>
        ))}
      </group>
      <group name="monumento COCORA" position={at(L.sign.x, L.sign.z, 0.6)} rotation={[0, L.sign.rot, 0]} scale={1.15}>
        <CocoraSign variant={0} />
      </group>
      <group name="helicóptero" position={at(L.heli.x, L.heli.z, 0)} rotation={[0, L.heli.rot, 0]}>
        <Helicopter variant={0} />
      </group>
      {withPlayer && (
        <>
          <group name="personaje" position={at(3, 7, 0)} rotation={[0, -0.6, 0]}><Character variant={0} /></group>
          <group name="botiquín" position={at(0.4, 8.5, 0)}><Medkit variant={0} /></group>
          <group name="oso de anteojos" position={at(9.5, -5.5, 0)} rotation={[0, 2.2, 0]}><Bear variant={0} /></group>
        </>
      )}
      <group name="cerca" position={at(L.fence.x, L.fence.z, 0)} rotation={[0, L.fence.rot, 0]}><Fence variant={1} /></group>
      <group name="cafetales">
        {L.coffee.map(([x, z, seed], i) => (
          <group key={i} position={at(x, z, 0)} rotation={[0, i * 1.2, 0]}><CoffeeBush variant={i < 2 ? 1 : 0} seed={seed} /></group>
        ))}
      </group>
      <group name="puente" position={[riverX(L.bridge.z), -1.9, L.bridge.z]}><StoneBridge variant={0} /></group>
      <group name="danta" position={at(8.5, -12, 0)} rotation={[0, 2.4, 0]}><Tapir variant={1} /></group>
      <group name="cóndores">
        <FlyingCondor radius={13} height={14} speed={0.22} phase={0} cx={2} cz={-8} />
        <FlyingCondor radius={9} height={19} speed={0.17} phase={2} cx={-8} cz={-14} />
        <FlyingCondor radius={16} height={23} speed={0.12} phase={4} cx={8} cz={-4} />
      </group>
      <PalmField palms={PALMS} />
    </group>
  )
}
