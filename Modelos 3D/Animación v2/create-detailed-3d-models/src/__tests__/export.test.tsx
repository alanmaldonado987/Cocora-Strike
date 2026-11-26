// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import * as THREE from 'three'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createRef } from 'react'
import { MODELS } from '../three/models'
import { exportModel } from '../three/exporters'

const downloads: { name: string; size: number }[] = []

beforeAll(() => {
  const noop = () => undefined
  const ctxProxy = new Proxy({}, { get: (_, key) => (key === 'canvas' ? {} : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true })
  ;(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctxProxy
  ;(HTMLCanvasElement.prototype as unknown as { toBlob: (cb: (b: Blob | null) => void) => void }).toBlob = (cb) => cb(new Blob([new Uint8Array(8)], { type: 'image/png' }))
  URL.createObjectURL = vi.fn(() => 'blob:test') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag)
    if (tag === 'a') {
      ;(el as HTMLAnchorElement).click = () => { downloads.push({ name: (el as HTMLAnchorElement).download, size: 1 }) }
    }
    return el
  })
})

describe('exportación', () => {
  it('exporta OBJ, STL y GLB del fusil', async () => {
    const def = MODELS.find((m) => m.id === 'ak47')!
    const Comp = def.Component
    const ref = createRef<THREE.Group>()
    const renderer = await ReactThreeTestRenderer.create(
      <group ref={ref}>
        <Comp variant={0} />
      </group>,
    )
    const root = ref.current!
    await exportModel(root, 'obj', 'test')
    await exportModel(root, 'stl', 'test')
    await exportModel(root, 'glb', 'test')
    expect(downloads.map((d) => d.name)).toEqual(['test.obj', 'test.stl', 'test.glb'])
    // el modelo original sigue intacto (sin planos de recorte ni materiales mutados)
    let meshes = 0
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++ })
    expect(meshes).toBeGreaterThan(10)
    await renderer.unmount()
  })
})
