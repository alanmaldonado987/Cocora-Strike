import * as THREE from 'three'
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** true = cel-shading (MeshToonMaterial + contorno), false = PBR estándar */
export const ToonCtx = createContext(true)
export const useToon = () => useContext(ToonCtx)
/** Tamaño mínimo (radio, m) para dibujar contorno en primitivas: sube en el juego para ahorrar draw calls. */
export const OutlineMinCtx = createContext(0.03)

/* ---------------- Rampa de gradiente (4 tonos, bordes nítidos) ---------------- */
let gradient: THREE.DataTexture | null = null
export function toonGradient() {
  if (gradient) return gradient
  const steps = [78, 140, 205, 255]
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4))
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  gradient = t
  return t
}

/* ---------------- Contorno: casco invertido desplazado en espacio de pantalla ---------------- */
export const outlineUniforms = {
  uOutline: { value: 1.6 }, // grosor en píxeles
  uRes: { value: new THREE.Vector2(1280, 720) },
}
let outlineMat: THREE.MeshBasicMaterial | null = null
export function getOutlineMaterial() {
  if (outlineMat) return outlineMat
  const m = new THREE.MeshBasicMaterial({ color: '#1a120c', side: THREE.BackSide })
  m.userData.isOutline = true
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = outlineUniforms.uOutline
    shader.uniforms.uRes = outlineUniforms.uRes
    shader.vertexShader =
      'uniform float uOutline;\nuniform vec2 uRes;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 oN = normal;
        #ifdef USE_INSTANCING
          oN = mat3( instanceMatrix ) * oN;
        #endif
        vec4 oClip = projectionMatrix * vec4( normalize( normalMatrix * oN ), 0.0 );
        float oLen = length( oClip.xy );
        if ( oLen > 1e-5 ) gl_Position.xy += ( oClip.xy / oLen ) * uOutline * 2.0 / uRes * gl_Position.w;`,
      )
  }
  m.customProgramCacheKey = () => 'cocora-outline-v2'
  outlineMat = m
  return m
}

/** Geometría para el contorno: vértices soldados + normales suaves (sin grietas en aristas duras). */
const outlineGeoCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
export function outlineGeometry(g: THREE.BufferGeometry) {
  const hit = outlineGeoCache.get(g)
  if (hit) return hit
  const tmp = new THREE.BufferGeometry()
  tmp.setAttribute('position', g.attributes.position)
  if (g.index) tmp.setIndex(g.index)
  const o = mergeVertices(tmp, 1e-3)
  o.computeVertexNormals()
  outlineGeoCache.set(g, o)
  return o
}

export function makeOutlineMesh(source: THREE.Mesh) {
  const o = new THREE.Mesh(outlineGeometry(source.geometry), getOutlineMaterial())
  o.userData = { noCap: true, noExport: true, outline: true }
  o.castShadow = false
  o.receiveShadow = false
  o.raycast = () => {}
  return o
}

/** Añade/quita el contorno como hijo de la malla (omitido en piezas diminutas para ahorrar draw calls). */
export function useOutline(ref: React.RefObject<THREE.Mesh | null>, enabled: boolean, minSize = 0.03) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!enabled || !mesh || !mesh.geometry?.attributes?.position) return
    const g = mesh.geometry
    if (!g.boundingSphere) g.computeBoundingSphere()
    const sc = Math.max(Math.abs(mesh.scale.x), Math.abs(mesh.scale.y), Math.abs(mesh.scale.z))
    if ((g.boundingSphere?.radius ?? 1) * sc < minSize) return
    const o = makeOutlineMesh(mesh)
    mesh.add(o)
    return () => { mesh.remove(o) }
  }, [ref, enabled])
}

/* ---------------- Materiales cacheados ---------------- */
const matCache = new Map<string, THREE.Material>()
export interface MatOpts { map?: THREE.Texture; emissive?: string; emissiveIntensity?: number; side?: THREE.Side; vertexColors?: boolean; roughness?: number; metalness?: number }
export function getMat(toon: boolean, color: string, o: MatOpts = {}) {
  const key = `${toon ? 't' : 's'}|${color}|${o.map?.uuid ?? ''}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.side ?? 0}|${o.vertexColors ? 1 : 0}|${o.roughness ?? ''}|${o.metalness ?? ''}`
  let m = matCache.get(key)
  if (!m) {
    const common = { color, map: o.map ?? null, side: o.side ?? THREE.FrontSide, vertexColors: !!o.vertexColors, emissive: o.emissive ?? '#000000', emissiveIntensity: o.emissiveIntensity ?? 1 }
    m = toon
      ? new THREE.MeshToonMaterial({ ...common, gradientMap: toonGradient() })
      : new THREE.MeshStandardMaterial({ ...common, roughness: o.roughness ?? 0.75, metalness: o.metalness ?? 0 })
    matCache.set(key, m)
  }
  return m
}

/* ---------------- Pieza toon con contorno ---------------- */
export interface TPProps extends MatOpts {
  g: THREE.BufferGeometry
  c: string
  p?: [number, number, number]
  r?: [number, number, number]
  s?: [number, number, number] | number
  name?: string
  ol?: boolean
  cast?: boolean
  visible?: boolean
  children?: React.ReactNode
}
export function TP({ g, c, p, r, s, name, ol = true, cast = true, visible, children, ...o }: TPProps) {
  const toon = useToon()
  const ref = useRef<THREE.Mesh>(null)
  const mat = useMemo(() => getMat(toon, c, o), [toon, c, o.map, o.emissive, o.emissiveIntensity, o.side, o.vertexColors, o.roughness, o.metalness]) // eslint-disable-line react-hooks/exhaustive-deps
  useOutline(ref, toon && ol)
  const extra: Record<string, unknown> = {}
  if (p) extra.position = p
  if (r) extra.rotation = r
  if (s !== undefined) extra.scale = s
  if (name) extra.name = name
  if (visible !== undefined) extra.visible = visible
  return (
    <mesh ref={ref} geometry={g} material={mat} castShadow={cast} receiveShadow {...extra}>
      {children}
    </mesh>
  )
}
