import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'png'

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

/** Clona el modelo y lo deja limpio para exportar (sin luces, helpers ni recortes). */
function prepare(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const clone = root.clone(true)
  const toRemove: THREE.Object3D[] = []
  clone.traverse((o) => {
    if ((o as THREE.Light).isLight || o.userData?.noExport) toRemove.push(o)
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mesh.material = mats.map((m) => {
        if ((m as THREE.MeshToonMaterial).isMeshToonMaterial) {
          const t = m as THREE.MeshToonMaterial
          return new THREE.MeshStandardMaterial({ name: t.name, color: t.color, map: t.map, emissive: t.emissive, emissiveIntensity: t.emissiveIntensity, side: t.side, vertexColors: t.vertexColors, transparent: t.transparent, opacity: t.opacity, roughness: 0.8, metalness: 0 })
        }
        const c = m.clone()
        c.clippingPlanes = null
        if ('wireframe' in c) (c as THREE.MeshStandardMaterial).wireframe = false
        return c
      })
      if (!Array.isArray(mesh.material) || mesh.material.length === 1) mesh.material = (mesh.material as THREE.Material[])[0]
    }
  })
  toRemove.forEach((o) => o.parent?.remove(o))
  clone.position.set(0, 0, 0)
  clone.rotation.set(0, 0, 0)
  clone.scale.set(1, 1, 1)
  return clone
}

function disposeClone(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => m.dispose())
    }
  })
}

export async function exportModel(root: THREE.Object3D, format: ExportFormat, name: string, gl?: THREE.WebGLRenderer | null) {
  if (format === 'png') {
    if (!gl) throw new Error('Renderer no disponible')
    await new Promise<void>((resolve, reject) => {
      gl.domElement.toBlob((blob) => {
        if (!blob) return reject(new Error('No se pudo capturar'))
        download(blob, `${name}.png`)
        resolve()
      }, 'image/png')
    })
    return
  }
  const obj = prepare(root)
  try {
    if (format === 'glb' || format === 'gltf') {
      const exporter = new GLTFExporter()
      const result = await exporter.parseAsync(obj, { binary: format === 'glb', onlyVisible: true, embedImages: true, trs: true })
      if (result instanceof ArrayBuffer) download(new Blob([result], { type: 'model/gltf-binary' }), `${name}.glb`)
      else download(new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' }), `${name}.gltf`)
    } else if (format === 'obj') {
      const text = new OBJExporter().parse(obj)
      download(new Blob([text], { type: 'text/plain' }), `${name}.obj`)
    } else if (format === 'stl') {
      const data = new STLExporter().parse(obj, { binary: true }) as unknown as DataView
      const bytes = new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
      download(new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' }), `${name}.stl`)
    }
  } finally {
    disposeClone(obj)
  }
}
