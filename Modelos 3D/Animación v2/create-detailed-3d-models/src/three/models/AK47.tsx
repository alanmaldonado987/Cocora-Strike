import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { Bx, Cn, Cy, Geo, Sp, Tor, TEX, useAnim, useDispose, type MatProps } from '../helpers'

function magazineGeometry() {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0.07, 0)
  s.quadraticCurveTo(0.1, -0.09, 0.075, -0.19)
  s.lineTo(0.06, -0.215)
  s.quadraticCurveTo(0.03, -0.235, 0.0, -0.21)
  s.quadraticCurveTo(0.012, -0.12, -0.005, -0.04)
  s.lineTo(0, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 10 })
  g.translate(0, 0, -0.014)
  return g
}

const METAL: MatProps = { metalness: 0.7, roughness: 0.4 }
const DARK = '#2a2c30'

export function AK47({ variant = 0 }: { variant?: number }) {
  const wood = useMemo(() => TEX.wood([1, 1], '#8a5a2b', '#4a2a0e'), [])
  const mag = useMemo(() => magazineGeometry(), [])
  useDispose(mag)
  const root = useRef<THREE.Group>(null)
  const flash = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const firing = variant === 1

  useAnim((t) => {
    const g = root.current
    if (!g) return
    if (firing) {
      const phase = (t * 10) % 1
      const kick = Math.exp(-phase * 12)
      g.position.x = -kick * 0.03
      g.rotation.z = kick * 0.05
      if (flash.current) {
        flash.current.visible = phase < 0.2
        flash.current.scale.setScalar(0.6 + kick * 0.9)
        flash.current.rotation.x = t * 40
      }
      if (light.current) light.current.intensity = phase < 0.2 ? 8 : 0
    } else {
      g.position.x = 0
      g.rotation.z = 0
      if (flash.current) flash.current.visible = false
      if (light.current) light.current.intensity = 0
    }
  })

  const woodM: MatProps = { map: wood, roughness: 0.6 }
  return (
    <group ref={root} scale={0.88}>
      <group name="cajón de mecanismos">
        <Bx a={[0.3, 0.065, 0.034]} c={DARK} m={METAL} />
        <Bx a={[0.27, 0.022, 0.036]} p={[0.0, 0.043, 0]} c="#33363b" m={METAL} />
        <Bx a={[0.045, 0.03, 0.03]} p={[0.125, 0.06, 0]} c={DARK} m={METAL} />
        <Bx a={[0.06, 0.004, 0.014]} p={[0.095, 0.078, 0]} c={DARK} m={METAL} />
        <Bx a={[0.07, 0.006, 0.004]} p={[-0.02, 0.0, 0.019]} r={[0, 0, -0.25]} c="#44474d" m={METAL} />
        <Cy a={[0.008, 0.008, 0.03, 8]} p={[0.07, 0.012, 0.03]} r={[Math.PI / 2, 0, 0]} c="#44474d" m={METAL} />
        <Bx a={[0.075, 0.004, 0.02]} p={[-0.02, -0.066, 0]} c={DARK} m={METAL} />
        <Bx a={[0.004, 0.034, 0.02]} p={[0.016, -0.05, 0]} c={DARK} m={METAL} />
        <Bx a={[0.004, 0.034, 0.02]} p={[-0.056, -0.05, 0]} c={DARK} m={METAL} />
        <Bx a={[0.006, 0.03, 0.008]} p={[-0.012, -0.048, 0]} r={[0, 0, 0.3]} c="#555" m={METAL} />
        <Bx a={[0.02, 0.012, 0.012]} p={[0.08, -0.038, 0]} c={DARK} m={METAL} />
      </group>
      <group name="culata">
        <Bx a={[0.25, 0.055, 0.036]} p={[-0.27, -0.012, 0]} r={[0, 0, -0.12]} m={woodM} />
        <Bx a={[0.03, 0.125, 0.04]} p={[-0.395, -0.03, 0]} r={[0, 0, -0.12]} c="#1d1d1f" m={METAL} />
        <Tor a={[0.012, 0.003, 6, 12]} p={[-0.33, -0.045, 0]} r={[Math.PI / 2, 0, 0]} c="#555" m={METAL} />
      </group>
      <group name="empuñadura">
        <Bx a={[0.036, 0.1, 0.03]} p={[-0.075, -0.075, 0]} r={[0, 0, 0.35]} c="#5c3614" m={{ map: wood, roughness: 0.7 }} />
      </group>
      <Geo name="cargador" geometry={mag} p={[0.012, -0.033, 0]} c="#35383d" m={METAL} />
      <group name="guardamanos">
        <Bx a={[0.13, 0.04, 0.04]} p={[0.225, -0.004, 0]} m={woodM} />
        <Bx a={[0.12, 0.022, 0.032]} p={[0.225, 0.042, 0]} m={woodM} />
        <Bx a={[0.012, 0.07, 0.042]} p={[0.165, 0.01, 0]} c={DARK} m={METAL} />
      </group>
      <group name="cañón">
        <Cy a={[0.0095, 0.0095, 0.42, 12]} p={[0.36, 0.004, 0]} r={[0, 0, Math.PI / 2]} c={DARK} m={METAL} />
        <Cy a={[0.011, 0.011, 0.17, 10]} p={[0.32, 0.042, 0]} r={[0, 0, Math.PI / 2]} c="#3a3d42" m={METAL} />
        <Bx a={[0.035, 0.05, 0.03]} p={[0.405, 0.02, 0]} c={DARK} m={METAL} />
        <Bx a={[0.03, 0.055, 0.026]} p={[0.5, 0.025, 0]} c={DARK} m={METAL} />
        <Cy a={[0.0025, 0.0025, 0.028, 6]} p={[0.5, 0.065, 0]} c="#666" m={METAL} />
        <Bx a={[0.006, 0.03, 0.004]} p={[0.5, 0.07, 0.011]} c={DARK} m={METAL} />
        <Bx a={[0.006, 0.03, 0.004]} p={[0.5, 0.07, -0.011]} c={DARK} m={METAL} />
        <Cy a={[0.013, 0.013, 0.04, 12]} p={[0.585, 0.004, 0]} r={[0, 0, Math.PI / 2]} c="#1f2124" m={METAL} />
        <Bx a={[0.03, 0.03, 0.028]} p={[0.59, 0.006, 0]} r={[0, 0, 0.6]} c="#1f2124" m={METAL} />
        <Cy a={[0.003, 0.003, 0.3, 6]} p={[0.36, -0.016, 0]} r={[0, 0, Math.PI / 2]} c="#777" m={METAL} />
        <Tor a={[0.012, 0.003, 6, 12]} p={[0.41, -0.012, 0.0]} r={[0, 0, 0]} c="#555" m={METAL} />
      </group>
      <group name="fogonazo" ref={flash} position={[0.64, 0.004, 0]} visible={false}>
        <Cn a={[0.05, 0.16, 8]} r={[0, 0, -Math.PI / 2]} p={[0.06, 0, 0]} c="#ffb13b" basic noCap cast={false} recv={false}
          m={{ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }} />
        <Cn a={[0.09, 0.09, 6]} r={[0, 0, Math.PI / 2]} p={[-0.01, 0, 0]} c="#ffe08a" basic noCap cast={false} recv={false}
          m={{ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }} />
        <Sp a={[0.045, 8, 8]} c="#fff4c4" basic noCap cast={false} recv={false} m={{ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }} />
        <pointLight ref={light} color="#ffb347" intensity={0} distance={3} decay={2} />
      </group>
    </group>
  )
}
