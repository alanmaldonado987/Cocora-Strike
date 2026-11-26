import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useStore, type Axis } from '../store'

const AXES: Axis[] = ['x', 'y', 'z']
const NORMALS: Record<Axis, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }
const NEG: Record<Axis, THREE.Vector3> = { x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0), z: new THREE.Vector3(0, 0, -1) }
const MAX_CAP_MESHES = 420

interface Pair { src: THREE.Object3D; dst: THREE.Object3D; hide: boolean }
interface CapsState { sig: string; group: THREE.Group | null; caps: THREE.Mesh[]; pairs: Pair[]; mats: THREE.Material[] }

const _bb = new THREE.Box3()
/** Caja envolvente solo de mallas visibles (ignora paracaídas ocultos, contornos y efectos). */
export function visibleBox(root: THREE.Object3D, out: THREE.Box3) {
  out.makeEmpty()
  root.updateWorldMatrix(true, true)
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || o.userData?.outline || o.userData?.noExport || !m.geometry) return
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
    _bb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld)
    out.union(_bb)
  })
  return out
}

/** Localiza el grupo cuyos hijos son las "piezas" del modelo. */
export function findPartsRoot(root: THREE.Object3D) {
  let node: THREE.Object3D = root
  for (let i = 0; i < 6; i++) {
    if (node.children.length === 1 && !(node.children[0] as THREE.Mesh).isMesh && node.children[0].children.length > 0) node = node.children[0]
    else break
  }
  return node
}

function explodeNode(node: THREE.Object3D, value: number, depth: number) {
  if (!node.userData.explodeDirs) {
    node.updateWorldMatrix(true, true)
    const nb = new THREE.Box3().setFromObject(node)
    if (nb.isEmpty()) return
    const cL = node.worldToLocal(nb.getCenter(new THREE.Vector3()))
    const dirs: Record<number, number[]> = {}, origs: Record<number, number[]> = {}
    node.children.forEach((ch, idx) => {
      const cb = new THREE.Box3().setFromObject(ch)
      if (cb.isEmpty()) return
      const d = node.worldToLocal(cb.getCenter(new THREE.Vector3())).sub(cL)
      if (d.lengthSq() < 1e-6) d.set(0, 1, 0)
      d.normalize()
      dirs[idx] = d.toArray(); origs[idx] = ch.position.toArray()
    })
    node.userData.explodeDirs = dirs
    node.userData.explodeOrigs = origs
    node.userData.explodeSize = nb.getSize(new THREE.Vector3()).length()
  }
  const dirs = node.userData.explodeDirs as Record<number, number[]>
  const origs = node.userData.explodeOrigs as Record<number, number[]>
  const size = node.userData.explodeSize as number
  node.children.forEach((ch, idx) => {
    const d = dirs[idx], o = origs[idx]
    if (!d || !o) return
    const k = value * size * 0.32
    ch.position.set(o[0] + d[0] * k, o[1] + d[1] * k, o[2] + d[2] * k)
    if (ch.userData.explodeChildren && depth < 1) explodeNode(ch, value * 0.6, depth + 1)
  })
}

export function ClippingManager({ target }: { target: React.RefObject<THREE.Group | null> }) {
  const scene = useThree((s) => s.scene)
  const planes = useRef<Record<Axis, THREE.Plane>>({ x: new THREE.Plane(), y: new THREE.Plane(), z: new THREE.Plane() })
  const box = useRef(new THREE.Box3())
  const boxSig = useRef('')
  const capsState = useRef<CapsState>({ sig: '', group: null, caps: [], pairs: [], mats: [] })
  const explodeApplied = useRef({ sig: '', value: -1 })
  const frame = useRef(0)
  const limitedRef = useRef(false)

  const clearCaps = () => {
    const cs = capsState.current
    if (cs.group) { cs.group.parent?.remove(cs.group); cs.group = null }
    cs.caps.forEach((c) => { c.parent?.remove(c); c.geometry.dispose() })
    cs.caps = []
    cs.mats.forEach((m) => m.dispose())
    cs.mats = []
    cs.pairs = []
    cs.sig = ''
  }
  useEffect(() => () => clearCaps(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const buildCaps = (root: THREE.Group, list: THREE.Plane[], color: string, b: THREE.Box3) => {
    const cs = capsState.current
    const parent = root.parent
    if (!parent) return
    const group = new THREE.Group()
    group.name = 'stencil-helpers'
    const size = b.getSize(new THREE.Vector3()).length() * 2.5
    const srcList: THREE.Object3D[] = []
    root.traverse((o) => srcList.push(o))
    list.forEach((plane, i) => {
      for (const side of [THREE.BackSide, THREE.FrontSide]) {
        const op = side === THREE.BackSide ? THREE.IncrementWrapStencilOp : THREE.DecrementWrapStencilOp
        const mat = new THREE.MeshBasicMaterial({ depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, side, clippingPlanes: [plane] })
        mat.stencilFail = op; mat.stencilZFail = op; mat.stencilZPass = op
        cs.mats.push(mat)
        const clone = root.clone(true)
        const dstList: THREE.Object3D[] = []
        clone.traverse((o) => dstList.push(o))
        if (dstList.length !== srcList.length) { clone.clear(); continue }
        dstList.forEach((d, k) => {
          const s = srcList[k]
          let hide = false
          const dm = d as THREE.Mesh
          if (dm.isMesh) {
            const sm = (s as THREE.Mesh).material
            const excluded = !!s.userData?.noCap || Array.isArray(sm) || !sm || sm.transparent
            if (excluded) hide = true
            else { dm.material = mat; dm.castShadow = false; dm.receiveShadow = false; dm.renderOrder = i + 1 }
          } else if ((d as THREE.Light).isLight || (d as THREE.Points).isPoints || (d as THREE.Line).isLine || (d as THREE.Sprite).isSprite) {
            hide = true
          }
          if (hide) d.visible = false
          cs.pairs.push({ src: s, dst: d, hide })
        })
        group.add(clone)
      }
      const capMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.05, roughness: 0.7, side: THREE.DoubleSide,
        clippingPlanes: list.filter((p) => p !== plane),
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      })
      cs.mats.push(capMat)
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(size, size), capMat)
      cap.renderOrder = i + 1.1
      cap.onAfterRender = (renderer) => renderer.clearStencil()
      cap.userData.plane = plane
      cap.castShadow = false
      cap.receiveShadow = true
      scene.add(cap)
      cs.caps.push(cap)
    })
    parent.add(group)
    cs.group = group
  }

  useFrame(({ clock }) => {
    const root = target.current
    if (!root) return
    const s = useStore.getState()
    frame.current++

    // Explosionado
    const structSig = `${s.modelId}|${s.variant}`
    const ex = explodeApplied.current
    if (ex.sig !== structSig || ex.value !== s.explode) {
      ex.sig = structSig; ex.value = s.explode
      const partsRoot = findPartsRoot(root)
      if (partsRoot.children.length > 0) explodeNode(partsRoot, s.explode, 0)
    }

    // Caja envolvente
    const bsig = `${structSig}|${s.explode.toFixed(2)}`
    if (boxSig.current !== bsig || frame.current % 90 === 0) {
      visibleBox(root, box.current)
      boxSig.current = bsig
    }
    const b = box.current
    if (b.isEmpty()) return

    // Planos de corte
    const list: THREE.Plane[] = []
    const t = clock.getElapsedTime()
    AXES.forEach((axis, i) => {
      const cut = s.cuts[axis]
      if (!cut.enabled) return
      const min = b.min[axis], max = b.max[axis]
      const u = s.sweep ? Math.sin(t * 0.7 + i * 2.1) * 0.9 : cut.pos
      const c = min + (max - min) * (u * 0.5 + 0.5)
      const p = planes.current[axis]
      if (cut.flip) p.set(NORMALS[axis], -c)
      else p.set(NEG[axis], c)
      list.push(p)
    })

    // Aplicar a materiales
    let meshCount = 0
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      meshCount++
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m) continue
        m.clippingPlanes = list.length ? list : null
        m.clipShadows = true
        const std = m as THREE.MeshStandardMaterial
        if ('wireframe' in std && !m.transparent && !m.userData?.isOutline && std.wireframe !== s.wireframe) std.wireframe = s.wireframe
      }
      mesh.renderOrder = 10
    })

    // Tapas (stencil)
    const tooBig = meshCount > MAX_CAP_MESHES
    const wantCaps = s.caps && list.length > 0 && !tooBig
    const limited = s.caps && list.length > 0 && tooBig
    if (limited !== limitedRef.current) { limitedRef.current = limited; useStore.setState({ capsLimited: limited }) }
    const axesKey = AXES.filter((a) => s.cuts[a].enabled).join('')
    const capSig = wantCaps ? `${structSig}|${axesKey}|${s.capColor}|${meshCount}` : ''
    const cs = capsState.current
    if (capSig !== cs.sig) {
      clearCaps()
      cs.sig = capSig
      if (wantCaps) buildCaps(root, list, s.capColor, b)
    }
    for (const pr of cs.pairs) {
      pr.dst.position.copy(pr.src.position)
      pr.dst.quaternion.copy(pr.src.quaternion)
      pr.dst.scale.copy(pr.src.scale)
      pr.dst.visible = pr.hide ? false : pr.src.visible
    }
    for (const cap of cs.caps) {
      const p = cap.userData.plane as THREE.Plane
      p.coplanarPoint(cap.position)
      cap.lookAt(cap.position.x - p.normal.x, cap.position.y - p.normal.y, cap.position.z - p.normal.z)
    }
  })

  return null
}
