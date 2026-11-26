import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Sky, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useStore, type Bg, type ViewName } from '../store'
import { MODELS, type ModelDef } from './models'
import { ClippingManager, findPartsRoot, visibleBox } from './ClippingManager'
import { ToonCtx, outlineUniforms } from './toon'

const DIRS: Record<ViewName, THREE.Vector3> = {
  iso: new THREE.Vector3(1, 0.7, 1),
  frente: new THREE.Vector3(0, 0.18, 1),
  atras: new THREE.Vector3(0, 0.18, -1),
  izquierda: new THREE.Vector3(-1, 0.18, 0),
  derecha: new THREE.Vector3(1, 0.18, 0),
  arriba: new THREE.Vector3(0.001, 1, 0.001),
}

function CameraRig({ target, fitScale, limitPolar }: { target: React.RefObject<THREE.Group | null>; fitScale: number; limitPolar: boolean }) {
  const camera = useThree((s) => s.camera)
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null)
  const focus = useRef({ center: new THREE.Vector3(0, 1, 0), dist: 6 })
  const cine = useRef(0)
  const fitRequest = useStore((s) => s.fitRequest)
  const moveMode = useStore((s) => s.moveMode)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const root = target.current
      if (!root) return
      const box = visibleBox(root, new THREE.Box3())
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const radius = Math.max(size.x, size.y, size.z) * 0.5
      const persp = camera as THREE.PerspectiveCamera
      const dist = (radius * fitScale) / Math.sin(THREE.MathUtils.degToRad(persp.fov) / 2) * 1.12
      const dir = DIRS[fitRequest.view].clone().normalize()
      camera.position.copy(center).addScaledVector(dir, dist)
      persp.near = Math.max(0.01, dist / 300)
      persp.far = Math.max(500, dist * 60)
      persp.updateProjectionMatrix()
      if (controls.current) { controls.current.target.copy(center); controls.current.update() }
      focus.current = { center, dist }
      useStore.setState({ sceneRadius: radius, sceneCenter: [center.x, center.y, center.z] })
    })
    return () => cancelAnimationFrame(id)
  }, [fitRequest, target, camera, fitScale])

  useFrame((_, delta) => {
    const s = useStore.getState()
    if (s.moveMode !== 'cine') return
    cine.current += delta * 0.35 * s.rotateSpeed
    const { center, dist } = focus.current
    const a = cine.current
    const r = dist * 0.85
    camera.position.set(center.x + Math.cos(a) * r, center.y + dist * 0.32 + Math.sin(a * 0.6) * dist * 0.14, center.z + Math.sin(a) * r)
    camera.lookAt(center)
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={moveMode !== 'cine'}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={limitPolar ? Math.PI / 2 - 0.03 : Math.PI}
      minDistance={0.2}
    />
  )
}

function Lights() {
  const radius = useStore((s) => s.sceneRadius)
  const center = useStore((s) => s.sceneCenter)
  const shadows = useStore((s) => s.shadows)
  const ref = useRef<THREE.DirectionalLight>(null)
  const tgt = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    const l = ref.current
    if (!l) return
    const r = Math.max(1, radius) * 1.7
    const cam = l.shadow.camera
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r
    cam.near = 0.1; cam.far = r * 8
    cam.updateProjectionMatrix()
    l.position.set(center[0] + r * 1.1, center[1] + r * 2.0, center[2] + r * 0.9)
    l.shadow.needsUpdate = true
  }, [radius, center])
  return (
    <>
      <hemisphereLight args={['#e9f1ff', '#6e7d4c', 0.75]} />
      <directionalLight ref={ref} castShadow={shadows} intensity={2.6} color="#fff3dc" shadow-mapSize={[2048, 2048]} shadow-bias={-0.00025} shadow-normalBias={0.035} shadow-radius={3} target={tgt} />
      <primitive object={tgt} position={center} />
      <directionalLight position={[-6, 4, -8]} intensity={0.7} color="#b8cdfa" />
      <ambientLight intensity={0.18} />
    </>
  )
}

function Background({ bg, scene }: { bg: Bg; scene: boolean }) {
  const colors: Record<Exclude<Bg, 'cielo'>, string> = { estudio: '#dde2ea', oscuro: '#111418', blanco: '#ffffff' }
  if (bg === 'cielo') {
    return (
      <>
        <Sky distance={450000} sunPosition={[60, 30, -80]} turbidity={8} rayleigh={1.6} mieCoefficient={0.005} mieDirectionalG={0.8} />
        {scene && <fog attach="fog" args={['#cbbcd9', 50, 170]} />}
      </>
    )
  }
  return (
    <>
      <color attach="background" args={[colors[bg]]} />
      {scene && <fog attach="fog" args={[colors[bg], 60, 200]} />}
    </>
  )
}

function GroundHelpers({ grid }: { grid: boolean }) {
  const radius = useStore((s) => s.sceneRadius)
  const small = radius < 1.5
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.003} receiveShadow>
        <planeGeometry args={[Math.max(60, radius * 40), Math.max(60, radius * 40)]} />
        <shadowMaterial transparent opacity={0.32} />
      </mesh>
      {grid && (
        <Grid
          position={[0, 0.001, 0]}
          infiniteGrid
          cellSize={small ? 0.1 : 1}
          sectionSize={small ? 0.5 : 5}
          cellThickness={0.6}
          sectionThickness={1.1}
          cellColor="#9aa3b2"
          sectionColor="#6b7686"
          fadeDistance={Math.max(25, radius * 14)}
          fadeStrength={1.4}
        />
      )}
    </>
  )
}

function Turntable({ target }: { target: React.RefObject<THREE.Group | null> }) {
  useFrame((_, dt) => {
    const s = useStore.getState()
    const g = target.current
    if (!g) return
    if (s.moveMode === 'giratorio') g.rotation.y += Math.min(dt, 0.05) * s.rotateSpeed * 1.2
  })
  return null
}

function StatsProbe({ target }: { target: React.RefObject<THREE.Group | null> }) {
  const f = useRef(0)
  useFrame(() => {
    if (++f.current % 40 !== 0) return
    const root = target.current
    if (!root) return
    let tris = 0, verts = 0, meshes = 0
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry && !m.userData?.outline) {
        meshes++
        const g = m.geometry
        const pc = g.attributes.position?.count ?? 0
        tris += Math.floor((g.index ? g.index.count : pc) / 3)
        verts += pc
      }
    })
    const parts = findPartsRoot(root).children.length
    const prev = useStore.getState().stats
    if (prev.tris !== tris || prev.meshes !== meshes || prev.parts !== parts) useStore.setState({ stats: { tris, verts, parts, meshes } })
  })
  return null
}

function OutlineSizer() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  useEffect(() => { outlineUniforms.uRes.value.set(size.width * dpr, size.height * dpr); outlineUniforms.uOutline.value = 1.5 * dpr }, [size, dpr])
  return null
}

function ModelMount({ def, variant, modelRef }: { def: ModelDef; variant: number; modelRef: React.RefObject<THREE.Group | null> }) {
  const Comp = def.Component
  useEffect(() => {
    useStore.setState({ modelRoot: modelRef.current })
    const view = useStore.getState().fitRequest.view
    useStore.getState().requestView(view)
  }, [def.id, variant, modelRef])
  return <Comp key={`${def.id}-${variant}`} variant={variant} />
}

export function Viewer() {
  const modelId = useStore((s) => s.modelId)
  const variant = useStore((s) => s.variant)
  const bg = useStore((s) => s.bg)
  const grid = useStore((s) => s.grid)
  const style = useStore((s) => s.style)
  const def = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  const modelRef = useRef<THREE.Group>(null)
  const turntable = useRef<THREE.Group>(null)
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.75]}
      camera={{ fov: 45, position: [6, 4, 8], near: 0.05, far: 600 }}
      gl={{ antialias: true, stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.toneMappingExposure = 1.05
        useStore.setState({ gl })
      }}
    >
      <Background bg={bg} scene={!!def.ownGround} />
      <Lights />
      <OutlineSizer />
      <ToonCtx.Provider value={style === 'toon'}>
        <group ref={turntable}>
          <group ref={modelRef} name="modelo">
            <ModelMount def={def} variant={variant} modelRef={modelRef} />
          </group>
        </group>
      </ToonCtx.Provider>
      {!def.ownGround && <GroundHelpers grid={grid} />}
      <Turntable target={turntable} />
      <ClippingManager target={modelRef} />
      <CameraRig target={modelRef} fitScale={def.fitScale ?? 1} limitPolar={!!def.ownGround} />
      <StatsProbe target={modelRef} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labels={['X', 'Y', 'Z']} axisColors={['#e5484d', '#46a758', '#3e63dd']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  )
}
