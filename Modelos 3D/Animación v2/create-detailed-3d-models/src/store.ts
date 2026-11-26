import { create } from 'zustand'
import type * as THREE from 'three'

export type Axis = 'x' | 'y' | 'z'
export interface Cut {
  enabled: boolean
  pos: number // -1 .. 1 (normalizado al tamaño del modelo)
  flip: boolean
}
export type MoveMode = 'libre' | 'giratorio' | 'cine'
export type Bg = 'estudio' | 'cielo' | 'oscuro' | 'blanco'
export type RenderStyle = 'toon' | 'pbr'
export type AppMode = 'visor' | 'juego'
export type ViewName = 'iso' | 'frente' | 'atras' | 'izquierda' | 'derecha' | 'arriba'
export type V3 = [number, number, number]

export interface Stats {
  tris: number
  verts: number
  parts: number
  meshes: number
}

export interface AppState {
  modelId: string
  variant: number
  style: RenderStyle
  mode: AppMode
  moveMode: MoveMode
  rotateSpeed: number
  animate: boolean
  animSpeed: number
  explode: number
  cuts: Record<Axis, Cut>
  caps: boolean
  capColor: string
  sweep: boolean
  wireframe: boolean
  grid: boolean
  shadows: boolean
  bg: Bg
  fitRequest: { view: ViewName; n: number }
  sceneRadius: number
  sceneCenter: V3
  stats: Stats
  gl: THREE.WebGLRenderer | null
  modelRoot: THREE.Group | null
  capsLimited: boolean
  setModel: (id: string, defaultBg?: Bg) => void
  setVariant: (v: number) => void
  set: (p: Partial<AppState>) => void
  setCut: (axis: Axis, patch: Partial<Cut>) => void
  requestView: (view: ViewName) => void
  resetCuts: () => void
}

const defaultCuts = (): Record<Axis, Cut> => ({
  x: { enabled: false, pos: 0, flip: false },
  y: { enabled: false, pos: 0, flip: false },
  z: { enabled: false, pos: 0, flip: false },
})

export const useStore = create<AppState>((setState) => ({
  modelId: 'personaje',
  variant: 0,
  style: 'toon',
  mode: 'visor',
  moveMode: 'libre',
  rotateSpeed: 0.6,
  animate: true,
  animSpeed: 1,
  explode: 0,
  cuts: defaultCuts(),
  caps: true,
  capColor: '#e0484f',
  sweep: false,
  wireframe: false,
  grid: true,
  shadows: true,
  bg: 'estudio',
  fitRequest: { view: 'iso', n: 0 },
  sceneRadius: 2,
  sceneCenter: [0, 1, 0],
  stats: { tris: 0, verts: 0, parts: 0, meshes: 0 },
  gl: null,
  modelRoot: null,
  capsLimited: false,
  setModel: (id, defaultBg) =>
    setState((s) => ({
      modelId: id,
      variant: 0,
      explode: 0,
      cuts: defaultCuts(),
      bg: defaultBg ?? (s.bg === 'cielo' ? 'estudio' : s.bg),
    })),
  setVariant: (v) => setState({ variant: v }),
  set: (p) => setState(p),
  setCut: (axis, patch) =>
    setState((s) => ({ cuts: { ...s.cuts, [axis]: { ...s.cuts[axis], ...patch } } })),
  requestView: (view) => setState((s) => ({ fitRequest: { view, n: s.fitRequest.n + 1 } })),
  resetCuts: () => setState({ cuts: defaultCuts() }),
}))
