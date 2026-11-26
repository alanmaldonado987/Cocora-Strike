// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import * as THREE from 'three'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createRef } from 'react'
import { Character, CHAR_VARIANTS } from '../three/models/Character'
import { GRIP_L, GRIP_R } from '../three/models/character/rig'
import { ToonCtx } from '../three/toon'
import { visibleBox } from '../three/ClippingManager'
import { useStore } from '../store'
import { OBSTACLES, BRIDGE, RT, INPUT, findVault, groundHeight, resolveCircle, zoneRadius, useGame, resetRuntime, DROP_ALTITUDE } from '../game/core'
import { Player } from '../game/Player'

beforeAll(() => {
  const noop = () => undefined
  const ctxProxy = new Proxy({}, { get: (_, key) => (key === 'canvas' ? {} : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : key === 'getImageData' || key === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true })
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctxProxy
})
beforeEach(() => useStore.setState({ animate: true, animSpeed: 1 }))

function find(root: THREE.Object3D, name: string) {
  let out: THREE.Object3D | undefined
  root.traverse((o) => { if (o.name === name) out = o })
  if (!out) throw new Error('no encontrado: ' + name)
  return out
}
const palm = (hand: THREE.Object3D) => hand.localToWorld(new THREE.Vector3(0, -0.045, 0))

describe('personaje: rig e IK', () => {
  for (const [i, v] of CHAR_VARIANTS.entries()) {
    it(`${v.label}: manos correctamente colocadas`, async () => {
      const ref = createRef<THREE.Group>()
      const r = await ReactThreeTestRenderer.create(<group ref={ref}><Character variant={i} /></group>)
      await r.advanceFrames(90, 1 / 30)
      const root = ref.current!
      root.updateMatrixWorld(true)
      const hl = palm(find(root, 'mano izquierda')), hr = palm(find(root, 'mano derecha'))
      const box = visibleBox(find(root, 'caderas'), new THREE.Box3())
      expect(Number.isFinite(hl.x + hr.x)).toBe(true)
      if (v.state !== 'heal' && v.state !== 'parachute') {
        const w = find(root, 'fusil (weaponMount)')
        const gl = w.localToWorld(GRIP_L.clone()), gr = w.localToWorld(GRIP_R.clone())
        expect(hr.distanceTo(gr)).toBeLessThan(0.03)
        expect(hl.distanceTo(gl)).toBeLessThan(0.03)
      } else {
        expect(hl.distanceTo(hr)).toBeGreaterThan(0.12)
      }
      if (v.state === 'aim' || v.state === 'idle') {
        expect(box.max.y).toBeGreaterThan(1.75)
        expect(box.max.y).toBeLessThan(2.0)
        expect(box.min.y).toBeLessThan(0.02)
      }
      await r.unmount()
    })
  }

  it('cel-shading añade contornos; PBR los quita', async () => {
    const count = async (toon: boolean) => {
      const ref = createRef<THREE.Group>()
      const r = await ReactThreeTestRenderer.create(<ToonCtx.Provider value={toon}><group ref={ref}><Character variant={0} /></group></ToonCtx.Provider>)
      let outlines = 0, toonMats = 0
      ref.current!.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        if (o.userData.outline) outlines++
        if ((m.material as THREE.MeshToonMaterial).isMeshToonMaterial) toonMats++
      })
      await r.unmount()
      return { outlines, toonMats }
    }
    const t = await count(true), p = await count(false)
    expect(t.outlines).toBeGreaterThan(20)
    expect(t.toonMats).toBeGreaterThan(40)
    expect(p.outlines).toBe(0)
    expect(p.toonMats).toBe(0)
  })
})

describe('juego: mapa y física', () => {
  it('la cerca bloquea y es saltable (vaulting)', () => {
    const fence = OBSTACLES.find((b) => b.name === 'cerca')!
    const p = { x: fence.x, z: fence.z + 0.05 }
    resolveCircle(p, 0.36, groundHeight(p.x, p.z))
    expect(Math.abs(p.z - fence.z)).toBeGreaterThan(0.4)
    const v = findVault(fence.x, fence.z + 1.0, 0, -1, groundHeight(fence.x, fence.z + 1))
    expect(v?.box.name).toBe('cerca')
    expect(v!.exit).toBeGreaterThan(1.2)
  })
  it('el puente queda nivelado sobre el agua', () => {
    expect(groundHeight(BRIDGE.x, BRIDGE.z)).toBeGreaterThan(0.9)
    expect(groundHeight(BRIDGE.x, BRIDGE.z + 4)).toBeLessThan(-1)
  })
  it('la zona segura se encoge', () => {
    expect(zoneRadius(0)).toBeGreaterThan(zoneRadius(120))
    expect(zoneRadius(1000)).toBeCloseTo(9)
  })
})

describe('juego: simulación del jugador', () => {
  const run = async (openChute: boolean) => {
    resetRuntime()
    useGame.getState().reset()
    useGame.getState().set({ phase: 'playing' })
    const r = await ReactThreeTestRenderer.create(<Player />)
    let t = 0, landed = -1
    for (let f = 0; f < 340; f++) {
      if (openChute && f === 60) INPUT.pressed.add('Space')
      await r.advanceFrames(1, 0.05)
      t += 0.05
      if (landed < 0 && RT.grounded) landed = t
    }
    const hp = useGame.getState().hp
    await r.unmount()
    return { landed, hp }
  }
  it('caída libre ~10 s sin paracaídas => daño por caída', async () => {
    const res = await run(false)
    expect(RT.pos.y).toBeLessThan(DROP_ALTITUDE)
    expect(res.landed).toBeGreaterThan(8)
    expect(res.landed).toBeLessThan(11.5)
    expect(res.hp).toBeLessThan(85)
  })
  it('con paracaídas aterriza sin daño', async () => {
    const res = await run(true)
    expect(res.hp).toBe(85)
    expect(useGame.getState().phase).toBe('playing')
  }, 60000)
})
