import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useStore } from '../store'
import { OutlineMinCtx, ToonCtx, outlineUniforms } from '../three/toon'
import { FullScene } from '../three/models/FullScene'
import { Bear, type BearCtrl } from '../three/models/Bear'
import { Medkit } from '../three/models/Props'
import { Bx, Cy } from '../three/helpers'
import { Player } from './Player'
import { Particles, FX, sfx } from './fx'
import { DROP_ALTITUDE, RT, SPAWN, ZONE, attachInput, groundHeight, resolveCircle, useGame, zoneRadius } from './core'

/* ---------------- Osos de anteojos (IA) ---------------- */
function GameBear({ i }: { i: number }) {
  const ref = useRef<THREE.Group>(null)
  const ctrl = useRef<BearCtrl>({ state: 'walk', attackT: 0 })
  useFrame((_, delta) => {
    const b = RT.bears[i]
    const G = useGame.getState()
    if (!b || !ref.current) return
    const dt = G.phase === 'playing' ? Math.min(delta, 0.05) : 0
    const p = RT.pos
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z
    const d = Math.hypot(dx, dz)
    if (b.state !== 'dead' && dt > 0) {
      if (!b.provoked && d < 2.6 && RT.grounded) { b.provoked = true; sfx('bear') }
      if (b.provoked && d > 32) b.provoked = false
      b.cooldown -= dt
      let speed = 0
      if (b.state === 'attack') {
        b.attackT += dt / 0.9
        if (!b.hitDone && b.attackT > 0.55) {
          b.hitDone = true
          if (d < 2.5 && Math.abs(p.y - b.pos.y) < 1.6) { G.set({ hp: Math.max(0, G.hp - 40), hurt: 1, feed: [...G.feed.slice(-3), '¡Un oso te atacó! −40 HP'] }); sfx('hurt'); FX.burst('blood', p.x, p.y + 1.1, p.z, 8, 2.5, 0.5, 0.07) }
        }
        if (b.attackT >= 1) { b.state = 'run'; b.cooldown = 1.4 }
      } else if (b.provoked) {
        b.yaw = Math.atan2(dx, dz)
        if (d < 1.9 && b.cooldown <= 0) { b.state = 'attack'; b.attackT = 0; b.hitDone = false }
        else { b.state = d < 1.6 ? 'idle' : 'run'; speed = d < 1.6 ? 0 : 4.3 }
      } else {
        b.timer -= dt
        const tx = b.target.x - b.pos.x, tz = b.target.z - b.pos.z
        if (b.state === 'idle') { if (b.timer <= 0) { b.state = 'walk'; const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7; b.target.set(b.home.x + Math.cos(a) * r, 0, b.home.z + Math.sin(a) * r) } }
        else if (Math.hypot(tx, tz) < 0.6) { b.state = 'idle'; b.timer = 2 + Math.random() * 3 }
        else { b.state = 'walk'; speed = 1.1; b.yaw = Math.atan2(tx, tz) }
      }
      b.pos.x += Math.sin(b.yaw) * speed * dt
      b.pos.z += Math.cos(b.yaw) * speed * dt
      resolveCircle(b.pos, 0.6, b.pos.y)
      b.pos.y = groundHeight(b.pos.x, b.pos.z)
    }
    ctrl.current.state = b.state
    ctrl.current.attackT = b.attackT
    ref.current.position.copy(b.pos)
    const cur = ref.current.rotation.y
    let dd = b.yaw - cur
    while (dd > Math.PI) dd -= Math.PI * 2
    while (dd < -Math.PI) dd += Math.PI * 2
    ref.current.rotation.y = cur + dd * Math.min(1, dt * 8)
  })
  return <group ref={ref}><Bear ctrl={ctrl} /></group>
}

/* ---------------- Objetos recogibles ---------------- */
function Pickups() {
  const med = useRef<(THREE.Group | null)[]>([])
  const ammo = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    RT.medkits.forEach((m, i) => { const g = med.current[i]; if (g) g.visible = m.active })
    RT.ammoBoxes.forEach((a, i) => { const g = ammo.current[i]; if (g) { g.visible = a.active; g.rotation.y += 0.01 } })
  })
  return (
    <group name="objetos">
      {RT.medkits.map((m, i) => (
        <group key={`m${i}`} ref={(o) => { med.current[i] = o }} position={[m.x, m.y, m.z]}><Medkit variant={0} /></group>
      ))}
      {RT.ammoBoxes.map((a, i) => (
        <group key={`a${i}`} ref={(o) => { ammo.current[i] = o }} position={[a.x, a.y + 0.2, a.z]}>
          <Bx a={[0.5, 0.26, 0.3]} c="#4f5b2e" />
          <Bx a={[0.52, 0.05, 0.32]} p={[0, 0.1, 0]} c="#2d3320" ol={false} />
          <Cy a={[0.05, 0.05, 0.02, 10]} p={[0, 0.14, 0]} c="#d9b44a" ol={false} />
        </group>
      ))}
    </group>
  )
}

/* ---------------- Avión de salto ---------------- */
function DropPlane() {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = RT.t
    g.visible = t < 14 && useGame.getState().phase !== 'menu'
    g.position.set(SPAWN.x, DROP_ALTITUDE + 6, SPAWN.z + 8 - t * 48)
  })
  return (
    <group ref={ref} name="avión">
      <Cy a={[1.3, 1.1, 14, 14]} r={[Math.PI / 2, 0, 0]} c="#5d6a46" />
      <Bx a={[22, 0.35, 2.6]} p={[0, 0.6, 0.5]} c="#4f5b3a" />
      <Bx a={[0.3, 3, 2]} p={[0, 2, -6]} c="#4f5b3a" />
      <Bx a={[7, 0.25, 1.6]} p={[0, 1, -6.2]} c="#4f5b3a" />
      {[-5, -2.5, 2.5, 5].map((x) => <Cy key={x} a={[0.5, 0.5, 2, 10]} p={[x, 0.2, 1.2]} r={[Math.PI / 2, 0, 0]} c="#2f3328" />)}
    </group>
  )
}

/* ---------------- Tormenta, niebla, cielo, sol ---------------- */
const FOG_CLEAR = new THREE.Color('#c3c9d8'), FOG_STORM = new THREE.Color('#3b1f4f'), _fc = new THREE.Color()
function Atmosphere() {
  const scene = useThree((s) => s.scene)
  const wall = useRef<THREE.Mesh>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const tgt = useMemo(() => new THREE.Object3D(), [])
  const fog = useMemo(() => new THREE.FogExp2(FOG_CLEAR.getHex(), 0.012), [])
  const sky = useMemo(() => {
    const g = new THREE.SphereGeometry(380, 32, 16)
    const col = new Float32Array(g.attributes.position.count * 3)
    const top = new THREE.Color('#9d8fc4'), hor = new THREE.Color('#ddd6e6'), c = new THREE.Color()
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i) / 380
      c.copy(hor).lerp(top, Math.max(0, y) ** 0.6)
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const mountains = useMemo(() => Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + Math.sin(i * 7) * 0.2, r = 95 + (i % 3) * 25
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, h: 35 + ((i * 37) % 30), w: 30 + ((i * 13) % 20) }
  }), [])
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null } }, [scene, fog])
  useFrame(() => {
    const p = RT.pos
    const zr = zoneRadius(RT.t)
    const edge = Math.hypot(p.x - ZONE.cx, p.z - ZONE.cz) - zr
    const s = THREE.MathUtils.smoothstep(edge, -8, 3)
    const alt = Math.max(0, p.y - 10)
    fog.color.copy(_fc.copy(FOG_CLEAR).lerp(FOG_STORM, s * 0.85))
    fog.density = THREE.MathUtils.lerp(0.012, 0.045, s) / (1 + alt * 0.02)
    if (wall.current) { wall.current.scale.set(zr, 1, zr); wall.current.position.set(ZONE.cx, 0, ZONE.cz) }
    if (sun.current) {
      sun.current.position.set(p.x + 18, p.y + 30, p.z + 12)
      tgt.position.copy(p)
      tgt.updateMatrixWorld()
    }
  })
  return (
    <>
      <mesh geometry={sky} renderOrder={-1}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {mountains.map((m, i) => (
        <mesh key={i} position={[m.x, m.h / 2 - 6, m.z]}>
          <coneGeometry args={[m.w, m.h, 7]} />
          <meshLambertMaterial color="#62746a" flatShading />
        </mesh>
      ))}
      <mesh position={[0, -1.2, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[400, 48]} />
        <meshLambertMaterial color="#4f8a35" />
      </mesh>
      <mesh ref={wall} name="muro de tormenta">
        <cylinderGeometry args={[1, 1, 140, 72, 1, true]} />
        <meshBasicMaterial color="#8a3dc2" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <hemisphereLight args={['#e6e9ff', '#5d7a3f', 0.8]} />
      <ambientLight intensity={0.15} />
      <directionalLight ref={sun} castShadow intensity={2.5} color="#ffe9c9" target={tgt}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04} shadow-radius={3}
        shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={22} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={90} />
      <primitive object={tgt} />
    </>
  )
}

/* ---------------- Simulación de partida (VIVOS, victoria) ---------------- */
const NAMES = ['Arriero_07', 'LaMonaFeroz', 'Paisa_Sniper', 'CondorAndino', 'Sombrero88', 'Tolima_Kid', 'Arepa_Boom', 'Cafetero', 'Vallecaucano', 'Quindío_X', 'Filandia', 'Salento_Pro']
function MatchSim() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  useEffect(() => { outlineUniforms.uRes.value.set(size.width * dpr, size.height * dpr); outlineUniforms.uOutline.value = 1.5 * dpr }, [size, dpr])
  useFrame((_, delta) => {
    const G = useGame.getState()
    if (G.phase !== 'playing') return
    if (G.hurt > 0) G.set({ hurt: Math.max(0, G.hurt - delta * 1.8) })
    if (RT.t > RT.nextElim && G.alive > 1) {
      RT.nextElim = RT.t + 14 + Math.random() * 16
      const alive = G.alive - 1
      G.set({ alive, feed: [...G.feed.slice(-3), `${NAMES[alive % NAMES.length]} fue eliminado por la tormenta`] })
      if (alive <= 1) G.set({ phase: 'won' })
    }
  })
  return null
}

function World() {
  const style = useStore((s) => s.style)
  return (
    <>
      <Atmosphere />
      <ToonCtx.Provider value={style === 'toon'}>
        <OutlineMinCtx.Provider value={0.25}>
          <FullScene withPlayer={false} />
          <DropPlane />
        </OutlineMinCtx.Provider>
        <Player />
        {RT.bears.map((_, i) => <GameBear key={i} i={i} />)}
        <Pickups />
      </ToonCtx.Provider>
      <Particles />
      <MatchSim />
    </>
  )
}

export function GameView({ runId }: { runId: number }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    useStore.setState({ animate: true, animSpeed: 1 })
    const el = root.current?.querySelector('canvas')
    if (!el) return
    return attachInput(el)
  }, [runId])
  return (
    <div id="game-root" ref={root} className="absolute inset-0">
      <Canvas
        key={runId}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.5]}
        camera={{ fov: 62, near: 0.1, far: 900, position: [SPAWN.x, SPAWN.y + 2, SPAWN.z + 5] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.localClippingEnabled = false; gl.toneMappingExposure = 1.05 }}
        onPointerDown={() => { const el = root.current?.querySelector('canvas'); if (el && useGame.getState().phase === 'playing' && !document.pointerLockElement) { try { (el.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}) } catch { /* ignorado */ } } }}
      >
        <World />
      </Canvas>
    </div>
  )
}
