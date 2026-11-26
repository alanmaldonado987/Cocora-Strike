import * as THREE from 'three'

export type CharState = 'idle' | 'aim' | 'walk' | 'sprint' | 'jump' | 'fall' | 'parachute' | 'vault' | 'slide' | 'heal'

/** Controlador compartido entre el visor y el modo juego. */
export interface CharCtrl {
  state: CharState
  speed: number // m/s (frecuencia del ciclo de pasos)
  aimPitch: number // rad, + = mirar arriba
  fireCount: number // al incrementarse => retroceso + fogonazo
  progress: number // 0..1 (vault / slide / heal / jump)
  vy: number // velocidad vertical (salto/caída)
}
export const newCtrl = (state: CharState = 'idle'): CharCtrl => ({ state, speed: 0, aimPitch: 0, fireCount: 0, progress: 0, vy: 0 })

type V3 = [number, number, number]
export interface Pose {
  hipsDY: number; hipsDZ: number
  hips: V3; spine: V3; chest: V3; neck: V3; head: V3
  hipL: V3; hipR: V3; kneeL: number; kneeR: number; ankleL: number; ankleR: number
  ruanaF: number; ruanaB: number; pack: number
}
export function makePose(): Pose {
  return { hipsDY: 0, hipsDZ: 0, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], hipL: [0, 0, 0], hipR: [0, 0, 0], kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0, ruanaF: 0, ruanaB: 0, pack: 0 }
}
const set3 = (o: V3, x: number, y: number, z: number) => { o[0] = x; o[1] = y; o[2] = z }
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

function base(o: Pose) {
  o.hipsDY = 0; o.hipsDZ = 0
  set3(o.hips, 0, 0, 0); set3(o.spine, 0.03, 0, 0); set3(o.chest, 0, 0, 0); set3(o.neck, 0, 0, 0); set3(o.head, 0, 0, 0)
  set3(o.hipL, 0, 0, 0.045); set3(o.hipR, 0, 0, -0.045)
  o.kneeL = o.kneeR = 0.06; o.ankleL = o.ankleR = -0.06
  o.ruanaF = 0.04; o.ruanaB = -0.03; o.pack = 0
}

/** Ciclo de locomoción (caminar / correr). */
function locomotion(o: Pose, phi: number, t: number, run: number) {
  const A = 0.42 + 0.36 * run, K = 0.85 + 0.7 * run, B = 0.035 + 0.03 * run
  const s = Math.sin(phi), c = Math.cos(phi)
  const thL = -A * s, thR = A * s
  set3(o.hipL, thL, 0, 0.04); set3(o.hipR, thR, 0, -0.04)
  o.kneeL = 0.1 + K * Math.pow(Math.max(0, c), 1.5) + 0.12 * Math.max(0, s) * run
  o.kneeR = 0.1 + K * Math.pow(Math.max(0, -c), 1.5) + 0.12 * Math.max(0, -s) * run
  o.ankleL = -(thL + o.kneeL) * 0.85 + 0.35 * Math.max(0, thL / A) * (0.6 + run)
  o.ankleR = -(thR + o.kneeR) * 0.85 + 0.35 * Math.max(0, thR / A) * (0.6 + run)
  o.hipsDY = -0.02 - 0.04 * run - B * s * s
  set3(o.hips, 0.04 + 0.08 * run, 0.07 * s, 0.025 * c)
  set3(o.spine, 0.07 + 0.22 * run, -0.05 * s, 0)
  set3(o.chest, 0, -0.45 + 0.25 * run, 0)
  set3(o.neck, -0.12 * run, 0.28 - 0.16 * run, 0)
  set3(o.head, -0.08 * run, 0.1, 0)
  o.ruanaF = 0.05 + Math.max(0, Math.max(-thL, -thR) - 0.15) * 0.6
  o.ruanaB = -0.05 - 0.3 * run + 0.05 * Math.sin(t * 9) * run
  o.pack = 0.05 * Math.sin(phi * 2) * (0.5 + run)
}

const tmpPose = makePose()
function lerpPose(o: Pose, a: Pose, b: Pose, w: number) {
  const L = (x: number, y: number) => x + (y - x) * w
  o.hipsDY = L(a.hipsDY, b.hipsDY); o.hipsDZ = L(a.hipsDZ, b.hipsDZ)
  for (const k of ['hips', 'spine', 'chest', 'neck', 'head', 'hipL', 'hipR'] as const) for (let i = 0; i < 3; i++) o[k][i] = L(a[k][i], b[k][i])
  for (const k of ['kneeL', 'kneeR', 'ankleL', 'ankleR', 'ruanaF', 'ruanaB', 'pack'] as const) o[k] = L(a[k], b[k])
}

/** Calcula la pose objetivo del estado actual. */
export function computePose(o: Pose, c: CharCtrl, phi: number, t: number, recoil: number) {
  base(o)
  const breathe = Math.sin(t * 1.7)
  switch (c.state) {
    case 'idle': {
      set3(o.spine, 0.06, 0.05, 0); set3(o.chest, 0.015 * breathe, -0.45, 0); set3(o.neck, 0, 0.28, 0); set3(o.head, 0.06, 0.12, 0)
      const sw = Math.sin(t * 0.8)
      o.kneeL = 0.09 + 0.035 * sw; o.kneeR = 0.09 - 0.035 * sw
      o.ankleL = -o.kneeL; o.ankleR = -o.kneeR
      set3(o.hipL, 0, 0, 0.07); set3(o.hipR, 0, 0, -0.07)
      o.hipsDY = -0.012 - 0.008 * (1 + sw); o.hips[2] = 0.015 * sw
      o.pack = 0.012 * breathe
      break
    }
    case 'aim': {
      set3(o.spine, 0.06, 0, 0); set3(o.chest, 0.01 * breathe, -0.45, 0); set3(o.neck, 0, 0.26, 0.04); set3(o.head, 0.08, 0.12, 0.13)
      set3(o.hipL, -0.28, 0, 0.07); o.kneeL = 0.3; o.ankleL = -0.02
      set3(o.hipR, 0.22, 0, -0.09); o.kneeR = 0.2; o.ankleR = -0.42
      o.hipsDY = -0.05
      break
    }
    case 'walk': locomotion(o, phi, t, 0); break
    case 'sprint': locomotion(o, phi, t, 1); break
    case 'jump': {
      const rising = c.vy > 0.5 ? 1 : c.vy < -2 ? 0 : 0.5
      set3(o.spine, 0.15, 0, 0); set3(o.chest, 0, -0.25, 0); set3(o.neck, -0.1, 0.15, 0)
      set3(o.hipL, -0.6 - 0.4 * rising, 0, 0.06); o.kneeL = 0.8 + 0.6 * rising; o.ankleL = 0.35
      set3(o.hipR, -0.25 - 0.35 * rising, 0, -0.06); o.kneeR = 0.6 + 0.45 * rising; o.ankleR = 0.3
      o.ruanaF = 0.35; o.ruanaB = -0.25
      break
    }
    case 'fall': {
      set3(o.hips, 1.1, 0, 0); set3(o.spine, -0.25, 0, 0); set3(o.chest, -0.1, -0.2, 0); set3(o.neck, -0.55, 0, 0); set3(o.head, -0.3, 0, 0)
      set3(o.hipL, 0.25, 0, 0.2); o.kneeL = 0.9 + 0.1 * Math.sin(t * 7); o.ankleL = 0.4
      set3(o.hipR, 0.25, 0, -0.2); o.kneeR = 0.9 + 0.1 * Math.sin(t * 7 + 2); o.ankleR = 0.4
      o.ruanaF = -0.5 + 0.1 * Math.sin(t * 13); o.ruanaB = -0.8 + 0.1 * Math.sin(t * 11)
      break
    }
    case 'parachute': {
      const sw = Math.sin(t * 1.3)
      set3(o.hips, 0.05 + 0.05 * sw, 0, 0.03 * sw); set3(o.spine, -0.05, 0, 0); set3(o.neck, -0.15, 0, 0); set3(o.head, -0.15, 0.05 * sw, 0)
      set3(o.hipL, -0.3, 0, 0.08); o.kneeL = 0.4; o.ankleL = 0.35
      set3(o.hipR, -0.12, 0, -0.08); o.kneeR = 0.25; o.ankleR = 0.3
      o.ruanaF = -0.06 + 0.04 * sw; o.ruanaB = 0.04
      break
    }
    case 'vault': {
      locomotion(tmpPose, phi, t, 1)
      base(o)
      set3(o.hips, 0.15, 0, -0.15); set3(o.spine, 0.22, 0.12, -0.2); set3(o.chest, 0, -0.42, 0); set3(o.neck, 0, 0.25, 0.05); set3(o.head, 0, 0.1, 0.15)
      set3(o.hipR, -1.45, 0, -0.42); o.kneeR = 1.85; o.ankleR = 0.2
      set3(o.hipL, 0.5, 0, 0.12); o.kneeL = 0.45; o.ankleL = 0.55
      o.ruanaF = 0.5; o.ruanaB = -0.3; o.hipsDY = 0.02
      const w = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, c.progress))), 0.7)
      lerpPose(o, tmpPose, o, w)
      break
    }
    case 'slide': {
      const w = smooth(0, 0.18, c.progress) * (1 - smooth(0.82, 1, c.progress))
      locomotion(tmpPose, phi, t, 1)
      base(o)
      o.hipsDY = -0.5; o.hipsDZ = 0.05
      set3(o.hips, -0.55, 0, 0); set3(o.spine, 0.42, 0, 0); set3(o.chest, 0, -0.45, 0); set3(o.neck, 0, 0.25, 0.03); set3(o.head, 0.1, 0.1, 0.12)
      set3(o.hipL, -1.0, 0, 0.08); o.kneeL = 0.12; o.ankleL = -0.15
      set3(o.hipR, -0.15, 0, -0.42); o.kneeR = 2.1; o.ankleR = 0.35
      o.ruanaF = 0.6; o.ruanaB = -0.15
      lerpPose(o, tmpPose, o, w)
      break
    }
    case 'heal': {
      o.hipsDY = -0.04
      set3(o.spine, 0.12, 0, 0); set3(o.chest, 0.05 + 0.01 * breathe, 0, 0); set3(o.neck, 0.25, 0, 0); set3(o.head, 0.25, 0, 0)
      set3(o.hipL, -0.12, 0, 0.07); o.kneeL = 0.18; o.ankleL = -0.06
      set3(o.hipR, 0.1, 0, -0.07); o.kneeR = 0.15; o.ankleR = -0.25
      break
    }
  }
  const aimable = c.state === 'aim' || c.state === 'idle' || c.state === 'walk' || c.state === 'slide' || c.state === 'vault'
  if (aimable) { o.spine[0] -= c.aimPitch * 0.55; o.head[0] -= c.aimPitch * 0.35 }
  o.spine[0] -= recoil * 0.05
  o.head[0] -= recoil * 0.03
}

/* ============================ Arma y objetivos de manos ============================ */
export type RifleMode = 'aim' | 'low' | 'ready' | 'port' | 'sling'
export const RIFLE: Record<RifleMode, { butt: V3; dir: V3; up: V3 }> = {
  aim: { butt: [-0.14, 0.4, 0.0], dir: [0, 0, 1], up: [0, 1, 0] },
  low: { butt: [-0.11, 0.32, 0.1], dir: [0.35, -0.4, 0.85], up: [0, 1, 0] },
  ready: { butt: [-0.13, 0.36, 0.05], dir: [0.15, -0.22, 0.96], up: [0, 1, 0] },
  port: { butt: [-0.17, 0.18, 0.15], dir: [0.78, 0.55, 0.3], up: [0, 0, 1] },
  sling: { butt: [-0.2, 0.42, 0.13], dir: [0.15, -0.95, 0.15], up: [0, 0, 1] },
}
export function rifleModeFor(s: CharState): RifleMode {
  switch (s) {
    case 'idle': return 'low'
    case 'walk': return 'ready'
    case 'sprint': case 'jump': case 'fall': return 'port'
    case 'parachute': case 'heal': return 'sling'
    default: return 'aim'
  }
}
export type HandMode = 'rifle' | 'chute' | 'heal'
export const handModeFor = (s: CharState): HandMode => (s === 'parachute' ? 'chute' : s === 'heal' ? 'heal' : 'rifle')
/** Puntos de agarre en el espacio local del fusil (incluye escala 0.88 del modelo). */
export const GRIP_R = new THREE.Vector3(-0.07, -0.08, 0)
export const GRIP_L = new THREE.Vector3(0.17, -0.045, 0)
export const BUTT_X = -0.36
export const HAND_TARGETS: Record<Exclude<HandMode, 'rifle'>, { L: V3; R: V3 }> = {
  chute: { L: [0.3, 0.98, 0.05], R: [-0.3, 0.98, 0.05] },
  heal: { L: [0.1, 0.3, 0.34], R: [-0.1, 0.3, 0.34] },
}
export const POLES: Record<HandMode, { L: V3; R: V3 }> = {
  rifle: { L: [0.55, -1, 0.1], R: [-0.9, -1, -0.35] },
  chute: { L: [1, -0.3, 0], R: [-1, -0.3, 0] },
  heal: { L: [0.8, -1, -0.2], R: [-0.8, -1, -0.2] },
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4()
/** Matriz de montaje del fusil (espacio de la columna) a partir de culata/dirección/arriba. */
export function rifleBasis(butt: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
  _x.copy(dir).normalize()
  _y.copy(up).addScaledVector(_x, -up.dot(_x)).normalize()
  _z.crossVectors(_x, _y)
  _m.makeBasis(_x, _y, _z)
  outQuat.setFromRotationMatrix(_m)
  outPos.copy(butt).addScaledVector(_x, -BUTT_X)
}

/* ============================ IK analítico de 2 huesos ============================ */
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3()
/**
 * shoulder: pivote (hijo del pecho). target/pole: en espacio del pecho.
 * Hueso en reposo apunta a -Y; el codo flexiona sobre X local.
 */
export function solveArm(shoulder: THREE.Object3D, elbow: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, L1: number, L2: number) {
  _t.copy(target).sub(shoulder.position)
  const d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, _t.length()))
  _d.copy(_t).normalize()
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))))
  _n.copy(pole).addScaledVector(_d, -pole.dot(_d))
  if (_n.lengthSq() < 1e-8) _n.set(0, -1, 0)
  _n.normalize()
  _u.copy(_d).multiplyScalar(Math.cos(a)).addScaledVector(_n, Math.sin(a))
  _f.copy(_d).multiplyScalar(d).addScaledVector(_u, -L1).normalize()
  _y.copy(_u).negate()
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u))
  if (_z.lengthSq() < 1e-8) _z.copy(_n).negate()
  _z.normalize()
  _x.crossVectors(_y, _z)
  _m.makeBasis(_x, _y, _z)
  shoulder.quaternion.setFromRotationMatrix(_m)
  elbow.rotation.set(-bend, 0, 0)
}

/** Amortiguación exponencial independiente del framerate. */
export const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt))
export function dampPose(cur: Pose, target: Pose, k: number, dt: number) {
  cur.hipsDY = damp(cur.hipsDY, target.hipsDY, k, dt)
  cur.hipsDZ = damp(cur.hipsDZ, target.hipsDZ, k, dt)
  for (const key of ['hips', 'spine', 'chest', 'neck', 'head', 'hipL', 'hipR'] as const) for (let i = 0; i < 3; i++) cur[key][i] = damp(cur[key][i], target[key][i], k, dt)
  for (const key of ['kneeL', 'kneeR', 'ankleL', 'ankleR', 'ruanaF', 'ruanaB', 'pack'] as const) cur[key] = damp(cur[key], target[key], k, dt)
}
