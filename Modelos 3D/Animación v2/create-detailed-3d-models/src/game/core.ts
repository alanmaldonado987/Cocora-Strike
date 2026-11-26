import * as THREE from 'three'
import { create } from 'zustand'
import { CRATER, LAYOUT, PALMS, SIZE, houseBase, riverX, terrainHeight } from '../three/models/FullScene'

/* ============================ Estado del HUD (zustand) ============================ */
export type Phase = 'menu' | 'playing' | 'paused' | 'dead' | 'won'
export interface GameState {
  phase: Phase
  hp: number; ammo: number; reserve: number; alive: number; kills: number; medkits: number
  prompt: string | null; heal: number; reload: number; audio: boolean
  altitude: number; chute: 'none' | 'free' | 'open'
  zoneR: number; inStorm: boolean; hurt: number; feed: string[]
  px: number; pz: number; yaw: number; bears: { x: number; z: number; alive: boolean }[]
  set: (p: Partial<GameState>) => void
  reset: () => void
}
const INITIAL = {
  phase: 'menu' as Phase, hp: 85, ammo: 25, reserve: 75, alive: 14, kills: 3, medkits: 0,
  prompt: null, heal: -1, reload: -1, altitude: 0, chute: 'none' as const, zoneR: 34, inStorm: false, hurt: 0, feed: [] as string[],
  px: 0, pz: 0, yaw: 0, bears: [],
}
export const useGame = create<GameState>((set) => ({
  ...INITIAL,
  audio: true,
  set: (p) => set(p),
  reset: () => set({ ...INITIAL, feed: [], bears: [] }),
}))

/* ============================ Datos del mapa ============================ */
export const GRAVITY = 15.5
export const TERMINAL_FALL = -22
export const CHUTE_FALL = -4.2
export const DROP_ALTITUDE = 195
export const WATER_Y = -1.0
export const MAP_HALF = SIZE / 2 - 1.5
export const BRIDGE = { x: riverX(LAYOUT.bridge.z), z: LAYOUT.bridge.z, hw: 4.6, hd: 1.42, top: -1.9 + 2.75 + 0.21 }
export const ZONE = { cx: -1, cz: -3, r0: 34, r1: 9, delay: 25, duration: 200 }
export const SPAWN = new THREE.Vector3(2, DROP_ALTITUDE, 16)

export interface Box { x: number; z: number; hw: number; hd: number; cos: number; sin: number; top: number; vault: boolean; name: string }
function box(name: string, x: number, z: number, hw: number, hd: number, rot: number, height: number, vault: boolean, baseY?: number): Box {
  const y0 = baseY ?? terrainHeight(x, z)
  return { name, x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot), top: y0 + height, vault }
}
/** Rota un desplazamiento local (lx,lz) según rotY de three.js. */
function rotY(lx: number, lz: number, rot: number): [number, number] { return [lx * Math.cos(rot) + lz * Math.sin(rot), -lx * Math.sin(rot) + lz * Math.cos(rot)] }

export const OBSTACLES: Box[] = (() => {
  const L = LAYOUT
  const out: Box[] = []
  L.houses.forEach((h, i) => out.push(box(`casa ${i + 1}`, h.x, h.z, ((h.floors === 2 ? 6.4 : 5.4) + 0.3) / 2, (5.2 + 0.3) / 2, h.rot, 12, false, houseBase(h.x, h.z))))
  out.push(box('helicóptero', L.heli.x, L.heli.z, 1.35, 3.0, L.heli.rot, 3.2, false))
  const [tx, tz] = rotY(1.6, -6.6, L.heli.rot)
  out.push(box('cola del helicóptero', L.heli.x + tx, L.heli.z + tz, 0.55, 1.5, L.heli.rot + 0.55, 1.1, true))
  out.push(box('monumento', L.sign.x, L.sign.z, 5.6, 0.35, L.sign.rot, 3.8, false))
  out.push(box('cerca', L.fence.x, L.fence.z, 4.9, 0.17, L.fence.rot, 1.15, true))
  L.rocks.forEach(([x, z, s], i) => out.push(box(`roca ${i + 1}`, x, z, s * 0.85, s * 0.85, 0, s * 0.75, s <= 1.0)))
  PALMS.forEach((p, i) => out.push(box(`palma ${i + 1}`, p.x, p.z, 0.3, 0.3, 0, 22, false)))
  for (const sz of [1, -1]) out.push(box('pretil', BRIDGE.x, BRIDGE.z + sz * 1.56, 4.6, 0.16, 0, BRIDGE.top + 0.85, false, 0))
  return out
})()

export const MEDKITS: [number, number][] = [[0.4, 8.5], [-8, 1.5], [10.5, -8], [-13.5, 6.5], [4, -12], [18, 8]]
export const AMMO: [number, number][] = [[-2, 6], [12, 3.5], [-9, -6], [6.5, -2.5], [-5, -12]]
export const BEAR_SPAWNS: [number, number][] = [[9.5, -5.5], [-20, -15], [20, 12]]

/** Altura del suelo caminable (terreno + tablero del puente). */
export function groundHeight(x: number, z: number) {
  let h = terrainHeight(x, z)
  if (Math.abs(x - BRIDGE.x) < BRIDGE.hw && Math.abs(z - BRIDGE.z) < BRIDGE.hd) h = Math.max(h, BRIDGE.top)
  return h
}
export const inWater = (x: number, z: number) => terrainHeight(x, z) < WATER_Y - 0.05 && !(Math.abs(x - BRIDGE.x) < BRIDGE.hw && Math.abs(z - BRIDGE.z) < BRIDGE.hd)

export function zoneRadius(t: number) {
  const u = Math.min(1, Math.max(0, (t - ZONE.delay) / ZONE.duration))
  return ZONE.r0 + (ZONE.r1 - ZONE.r0) * u
}

/* ============================ Física 2D ============================ */
/** Empuja un círculo (x,z) fuera de los obstáculos. Muta `p`. */
export function resolveCircle(p: { x: number; z: number }, r: number, feetY: number, ignore: Box | null = null) {
  for (const b of OBSTACLES) {
    if (b === ignore || feetY > b.top - 0.3) continue
    const dx = p.x - b.x, dz = p.z - b.z
    let lx = dx * b.cos - dz * b.sin, lz = dx * b.sin + dz * b.cos
    if (Math.abs(lx) > b.hw + r || Math.abs(lz) > b.hd + r) continue
    const cx = Math.max(-b.hw, Math.min(b.hw, lx)), cz = Math.max(-b.hd, Math.min(b.hd, lz))
    const ex = lx - cx, ez = lz - cz
    const d2 = ex * ex + ez * ez
    if (d2 > r * r) continue
    if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; lx += ex * k; lz += ez * k }
    else if (b.hw - Math.abs(lx) < b.hd - Math.abs(lz)) lx = Math.sign(lx || 1) * (b.hw + r)
    else lz = Math.sign(lz || 1) * (b.hd + r)
    p.x = b.x + lx * b.cos + lz * b.sin
    p.z = b.z - lx * b.sin + lz * b.cos
  }
  p.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x))
  p.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z))
}

export function pointInBox(b: Box, x: number, z: number, pad = 0) {
  const dx = x - b.x, dz = z - b.z
  return Math.abs(dx * b.cos - dz * b.sin) <= b.hw + pad && Math.abs(dx * b.sin + dz * b.cos) <= b.hd + pad
}

/** Busca un obstáculo saltable delante (parkour). Devuelve obstáculo + distancia de salida. */
export function findVault(x: number, z: number, dx: number, dz: number, feetY: number): { box: Box; exit: number } | null {
  for (const b of OBSTACLES) {
    if (!b.vault || b.top - feetY > 1.5 || b.top < feetY + 0.2) continue
    for (let s = 0.25; s <= 1.5; s += 0.25) {
      if (!pointInBox(b, x + dx * s, z + dz * s, 0.05)) continue
      let e = s
      while (e < s + 4 && pointInBox(b, x + dx * e, z + dz * e, 0.05)) e += 0.1
      return { box: b, exit: e + 0.55 }
    }
  }
  return null
}

/* ============================ Runtime mutable (sin re-render) ============================ */
export interface BearRT { pos: THREE.Vector3; yaw: number; hp: number; state: 'idle' | 'walk' | 'run' | 'attack' | 'dead'; provoked: boolean; target: THREE.Vector3; timer: number; attackT: number; hitDone: boolean; cooldown: number; home: THREE.Vector3 }
export const RT = {
  t: 0,
  pos: SPAWN.clone(),
  vel: new THREE.Vector3(),
  bodyYaw: Math.PI,
  camYaw: Math.PI,
  camPitch: -0.25,
  grounded: false,
  chute: 'free' as 'none' | 'free' | 'open',
  vaultT: -1, vaultFrom: new THREE.Vector3(), vaultTo: new THREE.Vector3(), vaultH: 1, vaultBox: null as Box | null, vaultSpeed: 6,
  slideT: -1, slideDir: new THREE.Vector3(),
  healT: -1, reloadT: -1, nextShot: 0, lastShot: -10, fireHeld: false, aimHeld: false,
  medkits: MEDKITS.map(([x, z]) => ({ x, z, y: terrainHeight(x, z), active: true })),
  ammoBoxes: AMMO.map(([x, z]) => ({ x, z, y: terrainHeight(x, z), active: true })),
  bears: [] as BearRT[],
  nextElim: 18,
  muzzle: new THREE.Vector3(),
}
export function resetRuntime() {
  RT.t = 0
  RT.pos.copy(SPAWN); RT.vel.set(0, 0, 0)
  RT.bodyYaw = Math.PI; RT.camYaw = Math.PI; RT.camPitch = -0.35
  RT.grounded = false; RT.chute = 'free'
  RT.vaultT = -1; RT.slideT = -1; RT.healT = -1; RT.reloadT = -1; RT.nextShot = 0; RT.lastShot = -10
  RT.medkits.forEach((m) => (m.active = true)); RT.ammoBoxes.forEach((a) => (a.active = true))
  RT.bears = BEAR_SPAWNS.map(([x, z]) => {
    const p = new THREE.Vector3(x, groundHeight(x, z), z)
    return { pos: p, yaw: Math.random() * 6, hp: 150, state: 'walk', provoked: false, target: p.clone(), timer: 0, attackT: 0, hitDone: false, cooldown: 0, home: p.clone() }
  })
  RT.nextElim = 18
}
resetRuntime()

/* ============================ Entrada ============================ */
export const INPUT = { keys: new Set<string>(), pressed: new Set<string>(), dx: 0, dy: 0, locked: false }
export function attachInput(el: HTMLElement) {
  const kd = (e: KeyboardEvent) => {
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'ControlLeft', 'KeyH', 'KeyE', 'KeyR'].includes(e.code)) e.preventDefault()
    if (!INPUT.keys.has(e.code)) INPUT.pressed.add(e.code)
    INPUT.keys.add(e.code)
  }
  const ku = (e: KeyboardEvent) => INPUT.keys.delete(e.code)
  const md = (e: MouseEvent) => { if (e.button === 0) RT.fireHeld = true; if (e.button === 2) RT.aimHeld = true }
  const mu = (e: MouseEvent) => { if (e.button === 0) RT.fireHeld = false; if (e.button === 2) RT.aimHeld = false }
  const mm = (e: MouseEvent) => { if (INPUT.locked || RT.aimHeld) { INPUT.dx += e.movementX; INPUT.dy += e.movementY } }
  const plc = () => {
    const was = INPUT.locked
    INPUT.locked = document.pointerLockElement === el
    if (was && !INPUT.locked && useGame.getState().phase === 'playing') useGame.getState().set({ phase: 'paused' })
  }
  const ctx = (e: Event) => e.preventDefault()
  const blur = () => { INPUT.keys.clear(); RT.fireHeld = false; RT.aimHeld = false }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
  el.addEventListener('mousedown', md); window.addEventListener('mouseup', mu); window.addEventListener('mousemove', mm)
  document.addEventListener('pointerlockchange', plc); el.addEventListener('contextmenu', ctx); window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
    el.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu); window.removeEventListener('mousemove', mm)
    document.removeEventListener('pointerlockchange', plc); el.removeEventListener('contextmenu', ctx); window.removeEventListener('blur', blur)
  }
}

export const CRATER_POS = CRATER
