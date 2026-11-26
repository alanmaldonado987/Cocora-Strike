import * as THREE from 'three'
import { useRef } from 'react'
import { Bx, Cn, Cp, Cy, Sp, useAnim } from '../helpers'

/* ------------------------------ Cóndor ------------------------------ */
function Wing({ side, refOuter, refInner, black = '#161616', white = '#e8e8e8' }: { side: 1 | -1; refOuter: React.RefObject<THREE.Group | null>; refInner: React.RefObject<THREE.Group | null>; black?: string; white?: string }) {
  return (
    <group ref={refInner}>
      <Bx a={[0.78, 0.035, 0.6]} p={[side * 0.39, 0, -0.08]} c={black} />
      <Bx a={[0.64, 0.014, 0.24]} p={[side * 0.36, 0.024, 0.06]} c={white} />
      <group ref={refOuter} position={[side * 0.78, 0, 0]}>
        <Bx a={[0.5, 0.03, 0.52]} p={[side * 0.25, 0, -0.1]} c={black} />
        <Bx a={[0.4, 0.012, 0.18]} p={[side * 0.22, 0.02, 0.06]} c={white} />
        {Array.from({ length: 7 }).map((_, i) => {
          const spread = (i - 3) * 0.16
          const len = 0.5 + (3 - Math.abs(i - 3)) * 0.06
          return (
            <group key={i} position={[side * 0.48, 0, -0.12 - i * 0.02]} rotation={[0, -side * spread, 0]}>
              <Bx a={[len, 0.012, 0.085]} p={[side * len * 0.5, 0, 0]} c={black} />
            </group>
          )
        })}
      </group>
    </group>
  )
}

export function Condor({ variant = 0, flying = true, statue = false }: { variant?: number; flying?: boolean; statue?: boolean }) {
  const lInner = useRef<THREE.Group>(null), lOuter = useRef<THREE.Group>(null)
  const rInner = useRef<THREE.Group>(null), rOuter = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const strong = variant === 1
  useAnim((t) => {
    if (statue) {
      if (lInner.current) lInner.current.rotation.z = 0.12
      if (rInner.current) rInner.current.rotation.z = -0.12
      if (lOuter.current) lOuter.current.rotation.z = 0.08
      if (rOuter.current) rOuter.current.rotation.z = -0.08
      return
    }
    const f = strong ? 3.2 : 1.6
    const amp = strong ? 0.6 : 0.22
    const base = strong ? 0.05 : 0.18
    const flap = Math.sin(t * f) * amp
    const lag = Math.sin(t * f - 0.7) * amp * 0.9
    if (lInner.current) lInner.current.rotation.z = base + flap
    if (rInner.current) rInner.current.rotation.z = -(base + flap)
    if (lOuter.current) lOuter.current.rotation.z = lag * 0.8
    if (rOuter.current) rOuter.current.rotation.z = -lag * 0.8
    if (body.current && flying) { body.current.position.y = Math.sin(t * f) * 0.05; body.current.rotation.x = Math.sin(t * 0.6) * 0.04 }
    if (tail.current) tail.current.rotation.x = Math.sin(t * 0.8) * 0.08
  })
  const black = statue ? '#e9e5da' : '#161616'
  const white = statue ? '#f7f4ec' : '#f2f2f2'
  const skin = statue ? '#ddd8cb' : '#c46a6a'
  return (
    <group position={[0, flying ? 2.6 : statue ? 0.32 : 0.4, 0]}>
      <group ref={body}>
        <group name="cuerpo">
          <Sp a={[0.3, 20, 16]} s={[1, 0.85, 1.9]} c={black} />
          <Sp a={[0.22, 16, 12]} s={[1.3, 0.75, 0.95]} p={[0, 0.1, 0.46]} c={white} />
          <Cy a={[0.06, 0.09, 0.22, 10]} p={[0, 0.16, 0.6]} r={[0.9, 0, 0]} c="#b86a6a" />
        </group>
        <group name="cabeza" position={[0, 0.2, 0.74]}>
          <Sp a={[0.1, 16, 12]} c={skin} />
          <Bx a={[0.03, 0.08, 0.14]} p={[0, 0.09, 0.0]} c="#8e3a3a" />
          <Cn a={[0.045, 0.17, 10]} p={[0, -0.01, 0.15]} r={[Math.PI / 2, 0, 0]} c="#e7dcc0" />
          <Cn a={[0.03, 0.07, 10]} p={[0, -0.02, 0.22]} r={[Math.PI / 2 + 0.3, 0, 0]} c="#2a2a2a" />
          {[-1, 1].map((sx) => <Sp key={sx} a={[0.018, 8, 8]} p={[sx * 0.065, 0.03, 0.07]} c="#3a1d12" />)}
        </group>
        <group name="ala izquierda" position={[-0.22, 0.08, 0.05]}>
          <Wing side={-1} refInner={lInner} refOuter={lOuter} black={black} white={white} />
        </group>
        <group name="ala derecha" position={[0.22, 0.08, 0.05]}>
          <Wing side={1} refInner={rInner} refOuter={rOuter} black={black} white={white} />
        </group>
        <group name="cola" position={[0, 0, -0.5]}>
          <group ref={tail}>
            {Array.from({ length: 7 }).map((_, i) => (
              <group key={i} rotation={[0, (i - 3) * 0.13, 0]}>
                <Bx a={[0.085, 0.012, 0.55]} p={[0, 0, -0.27]} c={black} />
              </group>
            ))}
          </group>
        </group>
        <group name="patas">
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.09, -0.18, -0.05]} rotation={[1.3, 0, 0]}>
              <Cy a={[0.025, 0.03, 0.2, 8]} c="#8a8a8a" />
              <Bx a={[0.07, 0.02, 0.1]} p={[0, -0.1, 0.03]} c="#7a7a7a" />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

/* ------------------------------ Danta ------------------------------ */
export function Tapir({ variant = 0 }: { variant?: number }) {
  const legs = useRef<(THREE.Group | null)[]>([])
  const head = useRef<THREE.Group>(null)
  const walking = variant === 0
  useAnim((t) => {
    legs.current.forEach((l, i) => {
      if (!l) return
      const phase = i === 0 || i === 3 ? 0 : Math.PI
      l.rotation.x = walking ? Math.sin(t * 3 + phase) * 0.38 : 0
    })
    if (head.current) {
      if (walking) head.current.rotation.x = Math.sin(t * 3) * 0.05
      else head.current.rotation.x = 0.55 + Math.sin(t * 1.2) * 0.08
    }
  })
  const fur = '#3a2a22'
  return (
    <group>
      <group name="cuerpo">
        <Cp a={[0.42, 0.75, 8, 18]} p={[0, 0.84, 0]} r={[Math.PI / 2, 0, 0]} c={fur} />
        <Sp a={[0.45, 18, 14]} p={[0, 0.84, -0.42]} s={[1, 0.98, 1]} c={fur} />
        <Sp a={[0.37, 18, 14]} p={[0, 0.96, 0.5]} c={fur} />
        <Cn a={[0.04, 0.14, 8]} p={[0, 0.82, -0.9]} r={[-2.5, 0, 0]} c={fur} />
      </group>
      <group name="cabeza" position={[0, 1.02, 0.78]}>
        <group ref={head}>
          <Sp a={[0.27, 18, 14]} s={[0.85, 0.9, 1.1]} c={fur} />
          <Cy a={[0.1, 0.15, 0.28, 12]} p={[0, -0.1, 0.3]} r={[Math.PI / 2 + 0.6, 0, 0]} c={fur} />
          <Sp a={[0.11, 12, 10]} p={[0, -0.2, 0.4]} c={fur} />
          <Cy a={[0.115, 0.115, 0.04, 12]} p={[0, -0.26, 0.37]} r={[0.5, 0, 0]} c="#efe9e2" />
          <Sp a={[0.09, 12, 10]} p={[0, -0.27, 0.3]} c="#4a3a30" />
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <Sp a={[0.075, 10, 8]} p={[sx * 0.17, 0.24, -0.08]} s={[0.85, 1.25, 0.32]} c="#efe9e2" />
              <Sp a={[0.065, 10, 8]} p={[sx * 0.17, 0.235, -0.065]} s={[0.8, 1.2, 0.3]} c={fur} />
              <Sp a={[0.03, 8, 8]} p={[sx * 0.18, 0.06, 0.16]} c="#120c08" />
              <Sp a={[0.01, 6, 6]} p={[sx * 0.19, 0.075, 0.185]} c="#ffffff" />
              <Sp a={[0.018, 6, 6]} p={[sx * 0.05, -0.19, 0.5]} c="#1a1210" />
            </group>
          ))}
        </group>
      </group>
      {([[0.2, 0.45], [-0.2, 0.45], [0.22, -0.45], [-0.22, -0.45]] as [number, number][]).map(([x, z], i) => (
        <group key={i} name={`pata ${i + 1}`} position={[x, 0.62, z]}>
          <group ref={(el) => { legs.current[i] = el }}>
            <Cy a={[0.1, 0.085, 0.55, 12]} p={[0, -0.27, 0]} c={fur} />
            <Cy a={[0.09, 0.1, 0.09, 12]} p={[0, -0.58, 0.02]} c="#2a2624" />
          </group>
        </group>
      ))}
    </group>
  )
}
