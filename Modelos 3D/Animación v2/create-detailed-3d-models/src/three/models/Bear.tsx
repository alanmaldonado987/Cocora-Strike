import * as THREE from 'three'
import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../../store'
import { Cn, Cp, Cy, Sp, Tor } from '../helpers'
import { damp } from './character/rig'

export type BearState = 'idle' | 'walk' | 'run' | 'attack' | 'dead'
export interface BearCtrl { state: BearState; attackT: number }
export const BEAR_VARIANTS: BearState[] = ['walk', 'run', 'attack', 'idle']

const FUR = '#211915', FUR2 = '#2d221c', CREAM = '#e8d6a8', SNOUT = '#b99a6c'

export function Bear({ variant = 0, ctrl }: { variant?: number; ctrl?: React.RefObject<BearCtrl> }) {
  const legs = useRef<(THREE.Group | null)[]>([])
  const paws = useRef<(THREE.Group | null)[]>([])
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const st = useMemo(() => ({ t: 0, phase: 0, rear: 0, dead: 0 }), [])
  useFrame((_, delta) => {
    const S = useStore.getState()
    let dt = Math.min(delta, 0.05)
    if (!ctrl) { if (!S.animate) return; dt *= S.animSpeed }
    st.t += dt
    const state: BearState = ctrl?.current?.state ?? BEAR_VARIANTS[variant] ?? 'walk'
    const atk = ctrl?.current ? ctrl.current.attackT : (st.t % 1.6) / 1.6
    const speed = state === 'run' ? 2.4 : state === 'walk' ? 1.1 : 0
    st.phase += dt * speed * 4.2
    const rearT = state === 'attack' ? Math.sin(Math.PI * Math.min(1, atk * 1.25)) : 0
    st.rear = damp(st.rear, rearT, 10, dt)
    st.dead = damp(st.dead, state === 'dead' ? 1 : 0, 4, dt)
    const g = body.current
    if (g) {
      g.rotation.x = -st.rear * 0.95
      g.position.y = 0.0 + st.rear * 0.25 + (speed > 0 ? Math.abs(Math.sin(st.phase)) * 0.04 * speed : 0)
      g.rotation.z = st.dead * 1.45
      g.position.x = st.dead * 0.35
    }
    legs.current.forEach((l, i) => {
      if (!l) return
      const front = i < 2
      const ph = st.phase + (i === 0 || i === 3 ? 0 : Math.PI) + (state === 'run' && front ? 0.6 : 0)
      let a = speed > 0 ? Math.sin(ph) * (state === 'run' ? 0.7 : 0.42) : 0
      if (front && st.rear > 0.05) a = -st.rear * (i === 0 ? 1.6 + Math.sin(atk * 18) * 0.5 : 1.0)
      if (!front && st.rear > 0.05) a = st.rear * 0.9
      l.rotation.x = a * (1 - st.dead)
    })
    paws.current.forEach((p, i) => { if (p) p.rotation.x = speed > 0 ? Math.max(0, -Math.sin(st.phase + (i === 0 || i === 3 ? 0 : Math.PI))) * 0.6 : 0 })
    if (head.current) {
      head.current.rotation.x = state === 'idle' ? 0.35 + Math.sin(st.t * 1.1) * 0.12 : state === 'attack' ? -0.35 * st.rear : Math.sin(st.phase * 2) * 0.05
      head.current.rotation.y = state === 'idle' ? Math.sin(st.t * 0.6) * 0.3 : 0
    }
  })
  return (
    <group name="oso de anteojos">
      <group ref={body} name="cuerpo">
        <group position={[0, 0, -0.55]}>
          <Sp a={[0.5, 22, 16]} s={[1, 0.95, 1.25]} p={[0, 0.82, 0.55]} c={FUR} name="torso" />
          <Sp a={[0.45, 20, 14]} s={[1, 0.95, 1]} p={[0, 0.8, 0.1]} c={FUR2} name="grupa" />
          <Sp a={[0.42, 20, 14]} p={[0, 0.95, 0.95]} c={FUR} name="cruz" />
          <Sp a={[0.24, 16, 12]} s={[1.05, 1.25, 0.5]} p={[0, 0.82, 1.27]} c={CREAM} name="babero" ol={false} />
          <Sp a={[0.08, 10, 8]} p={[0, 0.78, -0.33]} c={FUR} />
          <group ref={head} position={[0, 1.05, 1.32]} name="cabeza">
            <Sp a={[0.27, 20, 16]} s={[1, 0.92, 1]} c={FUR} />
            <Cy a={[0.1, 0.14, 0.24, 14]} p={[0, -0.06, 0.26]} r={[Math.PI / 2, 0, 0]} c={SNOUT} />
            <Sp a={[0.075, 12, 10]} s={[1.2, 0.8, 0.8]} p={[0, -0.04, 0.39]} c="#141010" ol={false} />
            {[-1, 1].map((sx) => (
              <group key={sx}>
                <Tor a={[0.06, 0.022, 8, 18]} p={[sx * 0.1, 0.06, 0.2]} r={[0, sx * 0.45, 0]} c={CREAM} ol={false} />
                <Sp a={[0.03, 10, 8]} p={[sx * 0.1, 0.06, 0.225]} c="#0d0a08" ol={false} />
                <Sp a={[0.085, 12, 10]} s={[1, 1, 0.45]} p={[sx * 0.18, 0.2, -0.02]} c={FUR} />
                <Sp a={[0.045, 10, 8]} s={[1, 1, 0.4]} p={[sx * 0.18, 0.2, 0.01]} c={SNOUT} ol={false} />
              </group>
            ))}
            <Cn a={[0.12, 0.2, 12]} p={[0, -0.16, 0.2]} r={[Math.PI, 0, 0]} c={CREAM} ol={false} />
          </group>
          {([[0.27, 1.05], [-0.27, 1.05], [0.29, 0.12], [-0.29, 0.12]] as [number, number][]).map(([x, z], i) => (
            <group key={i} position={[x, 0.78, z]} name={`pata ${i + 1}`}>
              <group ref={(o) => { legs.current[i] = o }}>
                <Cp a={[0.13, 0.32, 6, 14]} p={[0, -0.27, 0]} c={i < 2 ? FUR : FUR2} />
                <group position={[0, -0.6, 0.03]}>
                  <group ref={(o) => { paws.current[i] = o }}>
                    <Sp a={[0.13, 14, 10]} s={[1, 0.62, 1.3]} p={[0, -0.04, 0.05]} c={FUR} />
                    {[-0.06, 0, 0.06].map((cx) => <Cn key={cx} a={[0.015, 0.06, 6]} p={[cx, -0.07, 0.21]} r={[Math.PI / 2, 0, 0]} c="#d9d2c4" ol={false} />)}
                  </group>
                </group>
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
