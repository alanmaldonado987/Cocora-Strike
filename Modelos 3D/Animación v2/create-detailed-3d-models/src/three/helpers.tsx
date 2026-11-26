import * as THREE from 'three'
import React, { useContext, useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
type MeshProps = ThreeElements['mesh']
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useStore } from '../store'
import { OutlineMinCtx, toonGradient, useOutline, useToon } from './toon'

export type V3 = [number, number, number]

/* ------------------------------------------------------------------ */
/*  Random determinista                                                */
/* ------------------------------------------------------------------ */
export function rng(seed: number) {
  let a = (seed * 9301 + 49297) >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ */
/*  Materiales / primitivas                                            */
/* ------------------------------------------------------------------ */
export interface MatProps {
  color?: string
  roughness?: number
  metalness?: number
  emissive?: string
  emissiveIntensity?: number
  map?: THREE.Texture
  flatShading?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  vertexColors?: boolean
  depthWrite?: boolean
  blending?: THREE.Blending
  envMapIntensity?: number
}

export interface PrimProps {
  p?: V3
  r?: V3
  s?: V3 | number
  c?: string
  m?: MatProps
  name?: string
  noCap?: boolean
  basic?: boolean
  cast?: boolean
  recv?: boolean
  children?: React.ReactNode
  geometry?: THREE.BufferGeometry
  geo?: React.ReactNode
  visible?: boolean
  /** contorno cel-shading (por defecto sí) */
  ol?: boolean
}

export function Prim({
  p, r, s, c = '#ffffff', m, name, noCap, basic, cast = true, recv = true, children, geometry, geo, visible, ol = true,
}: PrimProps) {
  const ud = useMemo(() => (noCap ? { noCap: true } : {}), [noCap])
  const toonOn = useToon()
  const meshRef = useRef<THREE.Mesh>(null)
  const toon = toonOn && !basic && !m?.transparent
  const minOl = useContext(OutlineMinCtx)
  useOutline(meshRef, toon && ol && cast, minOl)
  const extra: Record<string, unknown> = {}
  if (p) extra.position = p
  if (r) extra.rotation = r
  if (s !== undefined) extra.scale = s
  if (geometry) extra.geometry = geometry
  if (name) extra.name = name
  if (visible !== undefined) extra.visible = visible
  const meshExtra = extra as Partial<MeshProps>
  return (
    <mesh ref={meshRef} {...meshExtra} castShadow={cast} receiveShadow={recv} userData={ud}>
      {geo}
      {basic ? (
        <meshBasicMaterial color={c} {...(m as object)} />
      ) : toon ? (
        <meshToonMaterial
          color={c}
          gradientMap={toonGradient()}
          map={m?.map ?? null}
          emissive={m?.emissive ?? '#000000'}
          emissiveIntensity={m?.emissiveIntensity ?? 1}
          vertexColors={!!m?.vertexColors}
          side={m?.side ?? THREE.FrontSide}
        />
      ) : (
        <meshStandardMaterial color={c} roughness={0.78} metalness={0} {...m} />
      )}
      {children}
    </mesh>
  )
}

export const Geo = Prim
export const Bx = (props: PrimProps & { a: V3 }) => <Prim {...props} geo={<boxGeometry args={props.a} />} />
export const Cy = (props: PrimProps & { a: [number, number, number, number?, number?, boolean?, number?, number?] }) => (
  <Prim {...props} geo={<cylinderGeometry args={props.a} />} />
)
export const Sp = (props: PrimProps & { a: [number, number?, number?, number?, number?, number?, number?] }) => (
  <Prim {...props} geo={<sphereGeometry args={props.a} />} />
)
export const Cn = (props: PrimProps & { a: [number, number, number?, number?, boolean?] }) => (
  <Prim {...props} geo={<coneGeometry args={props.a} />} />
)
export const Tor = (props: PrimProps & { a: [number, number, number?, number?, number?] }) => (
  <Prim {...props} geo={<torusGeometry args={props.a} />} />
)
export const Cp = (props: PrimProps & { a: [number, number, number?, number?] }) => (
  <Prim {...props} geo={<capsuleGeometry args={props.a} />} />
)

/* ------------------------------------------------------------------ */
/*  Fusión de geometrías                                               */
/* ------------------------------------------------------------------ */
export class GeoBuilder {
  private list: THREE.BufferGeometry[] = []

  add(geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1, order: THREE.EulerOrder = 'XYZ') {
    const m = new THREE.Matrix4()
    const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2])
    m.compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)), sc)
    return this.addM(geo, m)
  }

  addM(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    g.applyMatrix4(m)
    this.list.push(g)
    return this
  }

  build(): THREE.BufferGeometry {
    if (!this.list.length) return new THREE.BufferGeometry()
    const anyColor = this.list.some((g) => !!g.attributes.color)
    for (const g of this.list) {
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name)
      }
      if (!g.attributes.normal) g.computeVertexNormals()
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      }
      if (anyColor && !g.attributes.color) {
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3))
      }
    }
    const merged = mergeGeometries(this.list, false)
    this.list.forEach((g) => g.dispose())
    this.list = []
    return merged ?? new THREE.BufferGeometry()
  }
}

/** Roca facetada con desplazamiento y colores por vértice (musgo arriba). */
export function rockGeometry(seed: number, radius = 1, detail = 2, flatten = 0.7, moss = true) {
  const r = rng(seed)
  const o1 = r() * 10, o2 = r() * 10, o3 = r() * 10
  const base = new THREE.IcosahedronGeometry(radius, detail)
  const g = base.index ? base.toNonIndexed() : base
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    const d =
      0.18 * Math.sin(n.x * 3.1 + o1) * Math.cos(n.z * 2.7 + o2) +
      0.12 * Math.sin(n.y * 4.3 + o3) * Math.sin(n.x * 2.2 + o2) +
      0.06 * Math.cos(n.z * 6.1 + o1)
    v.multiplyScalar(1 + d)
    v.y *= flatten
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  const colors = new Float32Array(pos.count * 3)
  const grey = new THREE.Color('#8f928c'), dark = new THREE.Color('#5d615c'), green = new THREE.Color('#5f8f3a')
  const nrm = g.attributes.normal
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const ny = nrm.getY(i)
    const h = pos.getY(i) / (radius * flatten)
    c.copy(dark).lerp(grey, THREE.MathUtils.clamp(0.5 + h * 0.6, 0, 1))
    if (moss) c.lerp(green, THREE.MathUtils.smoothstep(ny, 0.55, 0.95) * 0.85)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/* ------------------------------------------------------------------ */
/*  Texturas procedurales (canvas)                                     */
/* ------------------------------------------------------------------ */
const texCache = new Map<string, THREE.Texture>()
function getTex(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key)
  if (!t) { t = make(); texCache.set(key, t) }
  return t
}
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
function makeTex(w: number, h: number, draw: Draw, repeat: [number, number] = [1, 1]) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  return t
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, colors: string[], r: () => number, maxR = 2, alpha = 0.25) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length]
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6)
    ctx.beginPath(); ctx.arc(r() * w, r() * h, 0.5 + r() * maxR, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

export const TEX = {
  wood(rep: [number, number] = [1, 1], base = '#8a5a2b', dark = '#4f2f12') {
    return getTex(`wood|${rep}|${base}|${dark}`, () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = base; ctx.fillRect(0, 0, w, h)
        const r = rng(11)
        for (let i = 0; i < 90; i++) {
          ctx.strokeStyle = r() > 0.45 ? dark : '#ffffff'
          ctx.globalAlpha = 0.08 + r() * 0.3
          ctx.lineWidth = 0.8 + r() * 3
          const x = r() * w
          ctx.beginPath(); ctx.moveTo(x, 0)
          ctx.bezierCurveTo(x + (r() - 0.5) * 26, h * 0.33, x + (r() - 0.5) * 26, h * 0.66, x + (r() - 0.5) * 12, h)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }, rep))
  },
  stone(rep: [number, number] = [1, 1], seed = 3) {
    return getTex(`stone|${rep}|${seed}`, () =>
      makeTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#625f57'; ctx.fillRect(0, 0, w, h)
        const r = rng(seed)
        const cols = 5, rows = 5, cw = w / cols, ch = h / rows
        const palette = ['#9d9a90', '#8d8a81', '#a8a59b', '#817e76', '#948f84', '#b0aba0', '#8a8f86']
        for (let j = 0; j < rows; j++) {
          for (let i = -1; i < cols; i++) {
            const off = (j % 2) * cw * 0.5
            const x = i * cw + off + 5 + (r() - 0.5) * 6, y = j * ch + 5 + (r() - 0.5) * 6
            const sw = cw - 11 - r() * 10, sh = ch - 11 - r() * 8
            const col = palette[Math.floor(r() * palette.length)]
            for (const dx of [0, w]) {
              ctx.fillStyle = col
              roundRect(ctx, x + dx, y, sw, sh, 10 + r() * 12); ctx.fill()
              ctx.fillStyle = 'rgba(255,255,255,0.13)'
              roundRect(ctx, x + dx + 4, y + 4, sw - 8, sh * 0.35, 8); ctx.fill()
              ctx.fillStyle = 'rgba(0,0,0,0.18)'
              roundRect(ctx, x + dx + 4, y + sh * 0.7, sw - 8, sh * 0.26, 8); ctx.fill()
            }
          }
        }
        speckle(ctx, w, h, 900, ['#000000', '#ffffff', '#6f8a4a'], r, 2.2, 0.2)
      }, rep))
  },
  stucco(rep: [number, number] = [1, 1]) {
    return getTex(`stucco|${rep}`, () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f3eee2'; ctx.fillRect(0, 0, w, h)
        const r = rng(5)
        speckle(ctx, w, h, 1500, ['#d9d1bd', '#ffffff', '#c9bfa8'], r, 1.6, 0.35)
        ctx.strokeStyle = 'rgba(90,80,60,0.18)'; ctx.lineWidth = 1
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); const x = r() * w, y = r() * h; ctx.moveTo(x, y)
          ctx.lineTo(x + (r() - 0.5) * 60, y + r() * 50); ctx.lineTo(x + (r() - 0.5) * 80, y + r() * 90); ctx.stroke()
        }
      }, rep))
  },
  palmTrunk(rep: [number, number] = [3, 20]) {
    return getTex(`palm|${rep}`, () =>
      makeTex(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#cfccba'; ctx.fillRect(0, 0, w, h)
        const r = rng(9)
        ctx.strokeStyle = '#b9b7a4'; ctx.lineWidth = 1
        for (let i = 0; i < 30; i++) {
          ctx.globalAlpha = 0.25 + r() * 0.3
          const x = r() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (r() - 0.5) * 6, h); ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = '#8c8f7d'; ctx.fillRect(0, h - 18, w, 11)
        ctx.fillStyle = '#e4e2d2'; ctx.fillRect(0, h - 22, w, 4)
        ctx.fillStyle = '#6f7363'; ctx.fillRect(0, h - 10, w, 3)
        speckle(ctx, w, h, 160, ['#8e9a74', '#ffffff'], r, 1.5, 0.3)
      }, rep))
  },
  ruana() {
    return getTex('ruana', () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#1c1c1c'
        const stripes: [number, number][] = [[0.07, 2], [0.1, 5], [0.14, 2], [0.46, 3], [0.5, 7], [0.55, 3], [0.84, 2], [0.88, 5], [0.92, 2]]
        for (const [u, t] of stripes) ctx.fillRect(u * w, 0, t, h)
        ctx.fillRect(0, h - 16, w, 10)
        ctx.fillStyle = '#8a8378'
        for (let x = 0; x < w; x += 6) ctx.fillRect(x, h - 6, 3, 6)
        const r = rng(2)
        speckle(ctx, w, h, 500, ['#d8d2c4'], r, 1.2, 0.5)
      }, [2, 1]))
  },
  sombreroBrim() {
    return getTex('sombreroBrim', () =>
      makeTex(512, 512, (ctx, w, h) => {
        const cx = w / 2, cy = h / 2, R = w / 2
        ctx.fillStyle = '#e9dfc2'; ctx.fillRect(0, 0, w, h)
        const ring = (r0: number, r1: number, color: string) => {
          ctx.fillStyle = color; ctx.beginPath()
          ctx.arc(cx, cy, r1 * R, 0, Math.PI * 2); ctx.arc(cx, cy, r0 * R, 0, Math.PI * 2, true); ctx.fill()
        }
        ring(0.955, 1.0, '#1a1a1a'); ring(0.9, 0.925, '#1a1a1a')
        ctx.fillStyle = '#1a1a1a'
        const N = 40
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2, a1 = ((i + 0.5) / N) * Math.PI * 2, a2 = ((i + 1) / N) * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a0) * 0.86 * R, cy + Math.sin(a0) * 0.86 * R)
          ctx.lineTo(cx + Math.cos(a1) * 0.7 * R, cy + Math.sin(a1) * 0.7 * R)
          ctx.lineTo(cx + Math.cos(a2) * 0.86 * R, cy + Math.sin(a2) * 0.86 * R)
          ctx.closePath(); ctx.fill()
        }
        ring(0.66, 0.685, '#1a1a1a'); ring(0.56, 0.6, '#1a1a1a'); ring(0, 0.47, '#1a1a1a')
        const r = rng(4)
        speckle(ctx, w, h, 600, ['#b9ad8a'], r, 1.5, 0.35)
      }))
  },
  sombreroBand() {
    return getTex('sombreroBand', () =>
      makeTex(256, 64, (ctx, w, h) => {
        ctx.fillStyle = '#e9dfc2'; ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6)
        const n = 10
        for (let i = 0; i < n; i++) {
          ctx.beginPath(); ctx.moveTo((i / n) * w, 10); ctx.lineTo(((i + 0.5) / n) * w, h - 10); ctx.lineTo(((i + 1) / n) * w, 10); ctx.closePath(); ctx.fill()
        }
        ctx.fillStyle = '#e9dfc2'
        for (let i = 0; i < n; i++) {
          ctx.beginPath(); ctx.moveTo((i / n) * w + 6, 14); ctx.lineTo(((i + 0.5) / n) * w, h - 22); ctx.lineTo(((i + 1) / n) * w - 6, 14); ctx.closePath(); ctx.fill()
        }
      }, [3, 1]))
  },
  heliSkin() {
    return getTex('heli', () =>
      makeTex(512, 512, (ctx, w, h) => {
        ctx.fillStyle = '#56653f'; ctx.fillRect(0, 0, w, h)
        const r = rng(21)
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = r() > 0.5 ? '#48573a' : '#62714a'; ctx.globalAlpha = 0.35
          ctx.beginPath(); ctx.ellipse(r() * w, r() * h, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(30,38,24,0.5)'; ctx.lineWidth = 2
        for (let y = 60; y < h; y += 110) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
        for (let x = 90; x < w; x += 140) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
        ctx.fillStyle = 'rgba(25,30,20,0.6)'
        for (let y = 52; y < h; y += 110) for (let x = 6; x < w; x += 14) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill() }
        const grd = ctx.createRadialGradient(w * 0.12, h * 0.55, 10, w * 0.12, h * 0.55, w * 0.42)
        grd.addColorStop(0, 'rgba(10,10,10,0.95)'); grd.addColorStop(0.5, 'rgba(20,18,14,0.6)'); grd.addColorStop(1, 'rgba(20,18,14,0)')
        ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h)
        speckle(ctx, w, h, 400, ['#000000', '#ffffff'], r, 1.5, 0.2)
      }))
  },
  metal() {
    return getTex('metal', () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#2b2d31'; ctx.fillRect(0, 0, w, h)
        const r = rng(13)
        ctx.strokeStyle = '#ffffff'
        for (let i = 0; i < 120; i++) {
          ctx.globalAlpha = 0.03 + r() * 0.08; ctx.lineWidth = 0.5 + r()
          const x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6); ctx.stroke()
        }
        ctx.globalAlpha = 1
      }))
  },
  medLabel() {
    return getTex('medLabel', () =>
      makeTex(256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f8fbff'; ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = '#19c7e6'; ctx.fillRect(0, 0, w, 10); ctx.fillRect(0, h - 10, w, 10)
        ctx.fillStyle = '#e8313b'
        for (const x of [64, 192]) { ctx.fillRect(x - 10, 28, 20, 72); ctx.fillRect(x - 36, 54, 72, 20) }
        ctx.fillStyle = '#1b2a38'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('SALUD', 128, 64)
      }, [2, 1]))
  },
  water() {
    return getTex('water', () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#4aa6dc'; ctx.fillRect(0, 0, w, h)
        const r = rng(31)
        for (let i = 0; i < 60; i++) {
          ctx.strokeStyle = r() > 0.4 ? '#ffffff' : '#2f86bf'; ctx.globalAlpha = 0.1 + r() * 0.3; ctx.lineWidth = 1 + r() * 4
          const x = r() * w, y = r() * h
          ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 20, y + (r() - 0.5) * 30, x + 50, y + (r() - 0.5) * 30, x + 70 + r() * 40, y + (r() - 0.5) * 10); ctx.stroke()
        }
        ctx.globalAlpha = 1
      }, [10, 10]))
  },
  dirt() {
    return getTex('dirt', () =>
      makeTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#6d4e32'; ctx.fillRect(0, 0, w, h)
        speckle(ctx, w, h, 1800, ['#3e2a18', '#8c6a46', '#a28460'], rng(8), 3, 0.5)
      }, [2, 2]))
  },
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */
/** Ejecuta cb con un tiempo acumulado que respeta "animate" y "animSpeed". */
export function useAnim(cb: (t: number, dt: number) => void) {
  const acc = useRef(Math.random() * 10)
  useFrame((_, delta) => {
    const { animate, animSpeed } = useStore.getState()
    if (!animate) return
    const dt = Math.min(delta, 0.05) * animSpeed
    acc.current += dt
    cb(acc.current, dt)
  })
}

export function useDispose(...geos: THREE.BufferGeometry[]) {
  useEffect(() => () => geos.forEach((g) => g.dispose()), geos) // eslint-disable-line react-hooks/exhaustive-deps
}
