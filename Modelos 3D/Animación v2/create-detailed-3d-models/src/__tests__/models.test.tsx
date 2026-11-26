// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { MODELS } from '../three/models'
import { useStore } from '../store'
import { ClippingManager, findPartsRoot } from '../three/ClippingManager'
import { createRef } from 'react'

beforeAll(() => {
  // Canvas 2D stub (jsdom no implementa getContext)
  const noop = () => undefined
  const ctxProxy = new Proxy({}, { get: (_, key) => (key === 'canvas' ? {} : key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true })
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctxProxy
  ;(HTMLCanvasElement.prototype as unknown as { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(new Blob())
})

describe('modelos 3D', () => {
  for (const def of MODELS) {
    for (let v = 0; v < def.variants.length; v++) {
      it(`${def.name} · ${def.variants[v]} se renderiza y anima`, async () => {
        const Comp = def.Component
        const ref = createRef<THREE.Group>()
        const renderer = await ReactThreeTestRenderer.create(
          <group ref={ref}>
            <group name="modelo">
              <Comp variant={v} />
            </group>
          </group>,
        )
        const root = ref.current!
        let meshes = 0
        root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++ })
        expect(meshes).toBeGreaterThan(0)
        root.updateWorldMatrix(true, true)
        const box = new THREE.Box3().setFromObject(root)
        expect(box.isEmpty()).toBe(false)
        expect(Number.isFinite(box.min.x) && Number.isFinite(box.max.y)).toBe(true)
        // ninguna geometría con NaN
        root.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.isMesh) {
            const pos = m.geometry.attributes.position as THREE.BufferAttribute
            expect(pos.count).toBeGreaterThan(0)
            for (let i = 0; i < Math.min(pos.count, 50); i++) expect(Number.isNaN(pos.getX(i))).toBe(false)
            if ((m.material as THREE.MeshStandardMaterial).vertexColors) expect(m.geometry.attributes.color).toBeTruthy()
          }
        })
        const parts = findPartsRoot(root.children[0]).children.length
        expect(parts).toBeGreaterThan(0)
        await renderer.advanceFrames(5, 0.05)
        await renderer.unmount()
      })
    }
  }

  it('ClippingManager aplica cortes, tapas y explosionado', async () => {
    const def = MODELS.find((m) => m.id === 'casa')!
    const Comp = def.Component
    const ref = createRef<THREE.Group>()
    useStore.setState({ modelId: 'casa', variant: 0, explode: 0.5, caps: true, cuts: { x: { enabled: true, pos: 0.2, flip: false }, y: { enabled: true, pos: 0, flip: true }, z: { enabled: false, pos: 0, flip: false } } })
    const renderer = await ReactThreeTestRenderer.create(
      <group>
        <group ref={ref}>
          <Comp variant={0} />
        </group>
        <ClippingManager target={ref} />
      </group>,
    )
    await renderer.advanceFrames(3, 0.05)
    const root = ref.current!
    let clipped = 0
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).clippingPlanes?.length === 2) clipped++ })
    expect(clipped).toBeGreaterThan(5)
    const helpers = root.parent!.children.find((c) => c.name === 'stencil-helpers')
    expect(helpers).toBeTruthy()
    expect(helpers!.children.length).toBe(4)
    const partsRoot = findPartsRoot(root)
    expect(partsRoot.userData.explodeDirs).toBeTruthy()
    useStore.setState({ explode: 0, cuts: { x: { enabled: false, pos: 0, flip: false }, y: { enabled: false, pos: 0, flip: false }, z: { enabled: false, pos: 0, flip: false } } })
    await renderer.advanceFrames(2, 0.05)
    expect(root.parent!.children.find((c) => c.name === 'stencil-helpers')).toBeFalsy()
    await renderer.unmount()
  })
})
