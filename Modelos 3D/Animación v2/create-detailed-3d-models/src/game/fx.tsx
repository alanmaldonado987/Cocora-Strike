import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGame } from './core'

/* ============================ Pool de partículas ============================ */
export type FxKind = 'dust' | 'smoke' | 'spark' | 'heal' | 'blood' | 'debris' | 'glass'
const N = 420
const KIND: Record<FxKind, { color: string; grav: number; drag: number; grow: number }> = {
  dust: { color: '#b39a74', grav: -0.6, drag: 2.2, grow: 2.2 },
  smoke: { color: '#4a4744', grav: -1.2, drag: 1.2, grow: 2.6 },
  spark: { color: '#ffcc55', grav: 9, drag: 0.6, grow: -0.8 },
  heal: { color: '#5dff7a', grav: -1.4, drag: 0.8, grow: -0.2 },
  blood: { color: '#7a1414', grav: 8, drag: 1.0, grow: -0.4 },
  debris: { color: '#6b5a44', grav: 10, drag: 0.4, grow: -0.3 },
  glass: { color: '#cdeefa', grav: 11, drag: 0.3, grow: -0.4 },
}
const P = {
  pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), size: new Float32Array(N),
  kind: new Uint8Array(N), head: 0, dirty: true,
}
const KINDS = Object.keys(KIND) as FxKind[]
const TN = 40
const T = { a: new Float32Array(TN * 3), b: new Float32Array(TN * 3), life: new Float32Array(TN), head: 0 }

/** API global: sin asignaciones. */
export const FX = {
  emit(kind: FxKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life = 0.8, size = 0.12) {
    const i = P.head; P.head = (P.head + 1) % N
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz
    P.life[i] = life; P.max[i] = life; P.size[i] = size; P.kind[i] = KINDS.indexOf(kind)
    P.dirty = true
  },
  burst(kind: FxKind, x: number, y: number, z: number, n: number, speed: number, life = 0.7, size = 0.1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1
      FX.emit(kind, x, y, z, Math.cos(a) * speed * (1 - e * 0.5), speed * e, Math.sin(a) * speed * (1 - e * 0.5), life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8))
    }
  },
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const i = T.head; T.head = (T.head + 1) % TN
    T.a.set([ax, ay, az], i * 3); T.b.set([bx, by, bz], i * 3); T.life[i] = 0.07
  },
}
export function resetFx() { P.life.fill(0); T.life.fill(0); P.dirty = true }

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

export function Particles() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const tr = useRef<THREE.InstancedMesh>(null)
  const colors = useMemo(() => KINDS.map((k) => new THREE.Color(KIND[k].color)), [])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const m = mesh.current
    if (m) {
      let live = 0
      for (let i = 0; i < N; i++) {
        if (P.life[i] <= 0) { if (P.dirty) { _m.makeScale(0, 0, 0); m.setMatrixAt(i, _m) } continue }
        live++
        const k = KIND[KINDS[P.kind[i]]]
        P.life[i] -= dt
        const f = Math.exp(-k.drag * dt)
        P.vel[i * 3] *= f; P.vel[i * 3 + 2] *= f
        P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * f - k.grav * dt
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt
        const u = 1 - Math.max(0, P.life[i]) / P.max[i]
        const sc = Math.max(0, P.size[i] * (1 + k.grow * u) * Math.min(1, (1 - u) * 4))
        _p.set(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2])
        _q.set(0, 0, 0, 1)
        _m.compose(_p, _q, _s.set(sc, sc, sc))
        m.setMatrixAt(i, _m)
        m.setColorAt(i, _c.copy(colors[P.kind[i]]))
      }
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      P.dirty = live > 0
    }
    const t = tr.current
    if (t) {
      for (let i = 0; i < TN; i++) {
        if (T.life[i] <= 0) { _m.makeScale(0, 0, 0); t.setMatrixAt(i, _m); continue }
        T.life[i] -= dt
        _p.set(T.a[i * 3], T.a[i * 3 + 1], T.a[i * 3 + 2])
        _d.set(T.b[i * 3], T.b[i * 3 + 1], T.b[i * 3 + 2]).sub(_p)
        const len = _d.length()
        _q.setFromUnitVectors(UP, _d.multiplyScalar(1 / Math.max(len, 1e-4)))
        _p.addScaledVector(_d, len * 0.5)
        _m.compose(_p, _q, _s.set(1, len, 1))
        t.setMatrixAt(i, _m)
      }
      t.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group name="fx">
      <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial transparent opacity={0.75} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={tr} args={[undefined, undefined, TN]} frustumCulled={false}>
        <boxGeometry args={[0.018, 1, 0.018]} />
        <meshBasicMaterial color="#ffe28a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

/* ============================ Audio procedural ============================ */
let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  const c = ac(); if (!c) return
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur)
  g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02)
}
export function sfx(kind: 'shot' | 'empty' | 'pickup' | 'hurt' | 'heal' | 'bear' | 'land' | 'chute') {
  if (!useGame.getState().audio) return
  const c = ac(); if (!c || !noise) return
  if (kind === 'shot') {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = 2200
    g.gain.setValueAtTime(0.35, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16)
    s.connect(f).connect(g).connect(c.destination); s.start(); s.stop(c.currentTime + 0.18)
    tone('triangle', 140, 45, 0.12, 0.35)
  } else if (kind === 'empty') tone('square', 900, 700, 0.04, 0.05)
  else if (kind === 'pickup') tone('sine', 660, 1100, 0.14, 0.15)
  else if (kind === 'heal') tone('sine', 440, 880, 0.35, 0.12)
  else if (kind === 'hurt') tone('square', 200, 80, 0.22, 0.12)
  else if (kind === 'bear') tone('sawtooth', 120, 60, 0.6, 0.16)
  else if (kind === 'land') tone('triangle', 90, 40, 0.15, 0.25)
  else if (kind === 'chute') tone('sawtooth', 300, 120, 0.3, 0.06)
}
