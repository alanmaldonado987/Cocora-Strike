import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import { Bx, Cn, Cp, Cy, Geo, GeoBuilder, Sp, TEX, rng, useAnim, useDispose, type MatProps, type V3 } from '../helpers'

const GLASS: MatProps = { color: '#8fd3ff', transparent: true, opacity: 0.5, roughness: 0.08, metalness: 0.1, depthWrite: false }
const DARKGLASS: MatProps = { color: '#10161c', roughness: 0.15, metalness: 0.35 }
const METAL: MatProps = { color: '#3a3f3a', metalness: 0.6, roughness: 0.45 }
const SMOKE_N = 10

function buildDebris() {
  const r = rng(77)
  const b = new GeoBuilder()
  const box = new THREE.BoxGeometry(1, 1, 1)
  for (let i = 0; i < 28; i++) {
    const a = r() * Math.PI * 2, d = 1.5 + r() * 4.5
    b.add(box, [Math.cos(a) * d, 0.08 + r() * 0.1, Math.sin(a) * d - 1], [r() * 0.5, r() * 6, r() * 0.5], [0.1 + r() * 0.4, 0.05 + r() * 0.2, 0.1 + r() * 0.5])
  }
  box.dispose()
  return b.build()
}

function TailAssembly({ len, broken, spin }: { len: number; broken?: boolean; spin?: boolean }) {
  const skin = TEX.heliSkin()
  const tailRef = useRef<THREE.Group>(null)
  useAnim((_, dt) => { if (tailRef.current && spin) tailRef.current.rotation.x += dt * 38 })
  return (
    <group>
      <Cy a={[0.24, broken ? 0.4 : 0.52, len, 16]} p={[0, 0, -len / 2]} r={[-Math.PI / 2, 0, 0]} m={{ map: skin, roughness: 0.7 }} />
      {broken ? (
        <>
          <Cy a={[0.41, 0.41, 0.12, 16]} p={[0, 0, -len + 0.04]} r={[Math.PI / 2, 0, 0]} c="#1b1c17" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Bx key={i} a={[0.12, 0.3, 0.25]} p={[Math.cos(i * 1.26) * 0.34, Math.sin(i * 1.26) * 0.34, -len - 0.05]} r={[0.3, 0, i * 1.26]} c="#2a2d26" />
          ))}
        </>
      ) : (
        <>
          <Bx a={[0.12, 1.5, 0.95]} p={[0, 0.75, -len + 0.25]} r={[-0.25, 0, 0]} m={{ map: skin, roughness: 0.7 }} />
          <Bx a={[2.2, 0.08, 0.55]} p={[0, 0.15, -len + 1.0]} m={{ map: skin }} />
          <Cy a={[0.05, 0.05, 0.9, 8]} p={[0, -0.35, -len + 0.35]} r={[0.6, 0, 0]} m={METAL} />
          <group ref={tailRef} position={[0.18, 1.0, -len + 0.1]}>
            <Cy a={[0.1, 0.1, 0.16, 12]} r={[0, 0, Math.PI / 2]} m={METAL} />
            <Bx a={[0.04, 1.75, 0.16]} p={[0.05, 0, 0]} c="#2c2f2c" />
            <Bx a={[0.04, 1.75, 0.16]} p={[0.05, 0, 0]} r={[Math.PI / 2, 0, 0]} c="#2c2f2c" />
          </group>
        </>
      )}
    </group>
  )
}

export function Helicopter({ variant = 0 }: { variant?: number }) {
  const crashed = variant === 0
  const skin = useMemo(() => TEX.heliSkin(), [])
  const debris = useMemo(() => buildDebris(), [])
  useDispose(debris)
  const rotor = useRef<THREE.Group>(null)
  const fire = useRef<(THREE.Mesh | null)[]>([])
  const smoke = useRef<(THREE.Mesh | null)[]>([])
  const lights = useRef<(THREE.PointLight | null)[]>([])

  useAnim((t, dt) => {
    if (rotor.current) rotor.current.rotation.y += dt * (crashed ? 0.9 : 26)
    fire.current.forEach((m, i) => {
      if (!m) return
      const f = 1 + Math.sin(t * 11 + i * 1.7) * 0.25 + Math.sin(t * 23 + i) * 0.12
      m.scale.set(1 + Math.sin(t * 7 + i) * 0.15, f, 1 + Math.cos(t * 9 + i) * 0.15)
      m.rotation.y = t * 2 + i
    })
    smoke.current.forEach((m, i) => {
      if (!m) return
      const cycle = 6
      const u = ((t * 0.5 + i * (cycle / SMOKE_N)) % cycle) / cycle
      m.position.set(Math.sin(u * 5 + i) * 0.5 * u + 0.6 * u, 0.3 + u * 7, Math.cos(u * 4 + i) * 0.5 * u + 0.9 * u)
      m.scale.setScalar(0.5 + u * 2.2)
      ;(m.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - u) * Math.min(1, u * 6)
    })
    lights.current.forEach((l, i) => { if (l) l.intensity = 22 + Math.sin(t * 17 + i * 2) * 9 + Math.sin(t * 31) * 4 })
  })

  const tilt: V3 = crashed ? [-0.05, 0, 0.17] : [0, 0, 0]
  const fuselageY = crashed ? -0.12 : 0
  const fireSpots: V3[] = crashed ? [[-0.5, 2.75, -1.2], [-1.35, 1.0, -0.2]] : []

  return (
    <group>
      <group name="fuselaje" position={[0, fuselageY, 0]} rotation={tilt} userData={{ explodeChildren: true }}>
        <RoundedBox name="cabina" args={[2.3, 1.85, 4.4]} radius={0.3} smoothness={4} position={[0, 1.42, 0.1]} castShadow receiveShadow>
          <meshStandardMaterial map={skin} roughness={0.72} />
        </RoundedBox>
        <Bx name="panza" a={[1.6, 0.4, 3.6]} p={[0, 0.55, 0.2]} c="#3b4531" />
        <Sp name="nariz" a={[1, 24, 16]} s={[1.05, 0.85, 1.1]} p={[0, 1.3, 2.3]} m={{ map: skin, roughness: 0.72 }} />
        <group name="parabrisas">
          <Bx a={[2.0, 1.0, 0.05]} p={[0, 2.0, 2.42]} r={[-0.55, 0, 0]} c="#222" />
          <Bx a={[1.86, 0.86, 0.06]} p={[0, 2.0, 2.45]} r={[-0.55, 0, 0]} m={GLASS} noCap cast={false} />
          {[-1, 1].map((sx) => (
            <Bx key={sx} a={[0.6, 0.5, 0.05]} p={[sx * 0.5, 1.15, 3.0]} r={[0.6, 0, 0]} m={GLASS} noCap cast={false} />
          ))}
          {[-1, 1].map((sx) => (
            <Bx key={sx} a={[0.06, 0.6, 0.9]} p={[sx * 1.16, 1.95, 1.3]} m={DARKGLASS} />
          ))}
        </group>
        <group name="puertas">
          <Bx a={[0.1, 1.3, 1.6]} p={[-1.14, 1.35, -0.3]} c="#1a1e18" />
          <Bx a={[0.06, 1.3, 1.5]} p={[-1.2, 1.35, -1.75]} m={{ map: skin }} />
          <Bx a={[0.05, 0.5, 0.8]} p={[-1.24, 1.65, -1.75]} m={DARKGLASS} />
          <Bx a={[0.06, 1.3, 1.55]} p={[1.18, 1.35, -0.3]} m={{ map: skin }} />
          <Bx a={[0.05, 0.5, 0.8]} p={[1.22, 1.65, -0.3]} m={DARKGLASS} />
          <Bx a={[0.3, 0.5, 0.6]} p={[-0.6, 1.1, -0.3]} c="#555b4a" />
        </group>
        <group name="motor">
          <Bx a={[1.1, 0.55, 2.0]} p={[0, 2.55, -1.1]} c="#3d4834" m={{ map: skin }} />
          <Cy a={[0.22, 0.22, 0.5, 12]} p={[0.4, 2.6, -2.2]} r={[Math.PI / 2, 0, 0]} c="#2a2a2a" m={{ metalness: 0.7, roughness: 0.5 }} />
          <Bx a={[0.7, 0.3, 0.6]} p={[0, 2.5, 0.2]} c="#2f3729" />
          <Cy a={[0.12, 0.14, 0.7, 12]} p={[0, 2.95, -0.2]} m={METAL} />
        </group>
        <group name="rotor principal" position={[0, 3.35, -0.2]}>
          <group ref={rotor}>
            <Bx a={[0.7, 0.3, 0.5]} c="#2f3230" m={{ metalness: 0.5, roughness: 0.5 }} />
            <Cy a={[0.04, 0.04, 2.4, 8]} p={[0, -0.2, 0]} r={[0, 0, Math.PI / 2]} m={METAL} />
            {[0, 1].map((k) => (
              <group key={k} rotation={[0, k * Math.PI, 0]}>
                <Bx a={[0.45, 0.06, 3.5]} p={[0, 0, 2.05]} c="#2c2f2c" />
                <group position={[0, 0, 3.8]} rotation={[crashed && k === 0 ? 0.4 : 0, 0, 0]}>
                  <Bx a={[0.45, 0.06, 3.4]} p={[0, 0, 1.7]} c="#2c2f2c" />
                  <Bx a={[0.46, 0.065, 0.4]} p={[0, 0, 3.2]} c="#e0b63b" />
                </group>
              </group>
            ))}
            {!crashed && <Cy a={[7.3, 7.3, 0.02, 48]} m={{ color: '#9aa', transparent: true, opacity: 0.12, depthWrite: false }} noCap cast={false} recv={false} />}
          </group>
        </group>
        <group name="patines">
          {[1, -1].map((sx) => (
            <group key={sx} position={crashed && sx === -1 ? [-0.1, -0.05, 0] : [0, 0, 0]} rotation={crashed && sx === -1 ? [0, 0, 0.25] : [0, 0, 0]}>
              <Cy a={[0.07, 0.07, 3.8, 10]} p={[sx * 1.0, 0.12, 0.2]} r={[Math.PI / 2, 0, 0]} m={METAL} />
              <Cy a={[0.07, 0.07, 0.6, 10]} p={[sx * 1.0, 0.3, 2.35]} r={[Math.PI / 2 + 0.9, 0, 0]} m={METAL} />
              {[1.2, -1.0].map((z) => (
                <Cp key={z} a={[0.05, 0.85, 4, 8]} p={[sx * 0.85, 0.52, z]} r={[0, 0, sx * 0.36]} m={METAL} />
              ))}
            </group>
          ))}
        </group>
        <group name="botalón de cola" position={[0, 1.65, -2.1]} rotation={[-0.06, 0, 0]}>
          <TailAssembly len={crashed ? 2.4 : 5.6} broken={crashed} spin={!crashed} />
        </group>
      </group>

      {crashed && (
        <group name="cola desprendida" position={[1.6, 0.42, -6.6]} rotation={[0.3, 0.55, 1.25]}>
          <TailAssembly len={3.2} />
        </group>
      )}

      {crashed && (
        <>
          <Cy name="suelo quemado" a={[3.9, 4.4, 0.04, 36]} p={[0, 0.02, -0.5]} c="#2b2622" m={{ roughness: 1 }} cast={false} />
          <Geo name="escombros" geometry={debris} c="#30342a" m={{ roughness: 0.9 }} />
          <group name="fuego">
            {fireSpots.map((spot, si) => {
              const count = si === 0 ? 8 : 5
              return (
                <group key={si} position={spot}>
                  {Array.from({ length: count }).map((_, i) => {
                    const a = (i / count) * Math.PI * 2
                    const rad = si === 0 ? 0.45 : 0.25
                    const inner = i % 2 === 0
                    const idx = si * 10 + i
                    return (
                      <mesh
                        key={i}
                        ref={(el) => { fire.current[idx] = el }}
                        position={[Math.cos(a) * rad, inner ? 0.7 : 0.5, Math.sin(a) * rad]}
                        rotation={[Math.sin(idx * 3.1) * 0.12, 0, Math.cos(idx * 2.3) * 0.12]}
                        userData={{ noCap: true }}
                        castShadow={false}
                      >
                        <coneGeometry args={[inner ? 0.28 : 0.42, inner ? 1.6 : 1.2, 8]} />
                        <meshBasicMaterial color={inner ? '#ffd23a' : '#ff6a1a'} transparent opacity={inner ? 0.95 : 0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
                      </mesh>
                    )
                  })}
                  <Cn a={[0.2, 0.9, 8]} p={[0, 0.9, 0]} c="#fff1b0" basic noCap cast={false} recv={false}
                    m={{ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }} />
                  <pointLight ref={(el) => { lights.current[si] = el }} color="#ff8a2a" intensity={20} distance={14} decay={2} position={[0, 0.8, 0]} />
                </group>
              )
            })}
          </group>
          <group name="humo" position={fireSpots[0]}>
            {Array.from({ length: SMOKE_N }).map((_, i) => (
              <mesh key={i} ref={(el) => { smoke.current[i] = el }} userData={{ noCap: true }} castShadow={false}>
                <sphereGeometry args={[0.6, 12, 10]} />
                <meshStandardMaterial color="#3c3c3c" transparent opacity={0.4} roughness={1} depthWrite={false} />
              </mesh>
            ))}
          </group>
        </>
      )}
    </group>
  )
}
