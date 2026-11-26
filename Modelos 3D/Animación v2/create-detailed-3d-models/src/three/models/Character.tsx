import * as THREE from 'three'
import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../../store'
import { TP } from '../toon'
import { AK47 } from './AK47'
import { COL, CTEX, DIM, charGeo } from './character/parts'
import {
  BUTT_X, GRIP_L, GRIP_R, HAND_TARGETS, POLES, RIFLE, computePose, damp, dampPose, handModeFor, makePose, newCtrl, rifleBasis, rifleModeFor, solveArm,
  type CharCtrl, type CharState, type HandMode,
} from './character/rig'

export const CHAR_VARIANTS: { label: string; state: CharState; fire?: boolean }[] = [
  { label: 'Apuntando', state: 'aim' },
  { label: 'Disparando', state: 'aim', fire: true },
  { label: 'Reposo táctico', state: 'idle' },
  { label: 'Caminar', state: 'walk' },
  { label: 'Correr (sprint)', state: 'sprint' },
  { label: 'Salto', state: 'jump' },
  { label: 'Caída libre', state: 'fall' },
  { label: 'Paracaídas', state: 'parachute' },
  { label: 'Vaulting (cerca)', state: 'vault' },
  { label: 'Derrape táctico', state: 'slide' },
  { label: 'Curación', state: 'heal' },
]

const SHIN = 0.4
const Z_AXIS = new THREE.Vector3(0, 0, 1)
// temporales (cero asignaciones por frame)
const _butt = new THREE.Vector3(), _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _tp = new THREE.Vector3(), _w = new THREE.Vector3(), _pole = new THREE.Vector3(), _des = new THREE.Vector3()
const _tq = new THREE.Quaternion(), _qr = new THREE.Quaternion()

type J = Record<string, THREE.Object3D>

function Hand({ side, reg }: { side: 1 | -1; reg: (k: string) => (o: THREE.Object3D | null) => void }) {
  const g = charGeo()
  const k = side === 1 ? 'L' : 'R'
  return (
    <group ref={reg('hand' + k)} position={[0, -DIM.foreArm, 0]} name={side === 1 ? 'mano izquierda' : 'mano derecha'}>
      <TP g={g.palm} c={COL.skin} />
      {[-0.027, -0.009, 0.009, 0.027].map((x, i) => (
        <group key={i} position={[x, -0.078, 0.004]} rotation={[-1.3 - i * 0.05, 0, 0]}>
          <TP g={g.phal1} c={COL.skin} ol={false} />
          <group position={[0, -0.036, 0]} rotation={[-1.45, 0, 0]}>
            <TP g={g.phal2} c={COL.skin} ol={false} />
          </group>
        </group>
      ))}
      <group position={[side * -0.04, -0.03, 0.014]} rotation={[-0.9, 0, side * -0.7]}>
        <TP g={g.thumb} c={COL.skin} ol={false} />
      </group>
    </group>
  )
}

function Arm({ side, reg }: { side: 1 | -1; reg: (k: string) => (o: THREE.Object3D | null) => void }) {
  const g = charGeo()
  const k = side === 1 ? 'L' : 'R'
  return (
    <group ref={reg('sh' + k)} position={[side * DIM.shoulderX, DIM.shoulderY, 0]} name={side === 1 ? 'hombro izquierdo' : 'hombro derecho'}>
      <TP g={g.shoulderBall} c={COL.shirt} />
      <TP g={g.upperArm} c={COL.shirt} />
      <group ref={reg('el' + k)} position={[0, -DIM.upperArm, 0]} name={side === 1 ? 'codo izquierdo' : 'codo derecho'}>
        <TP g={g.elbowBall} c={COL.shirt} ol={false} />
        <TP g={g.foreArm} c={COL.shirt} />
        <TP g={g.cuff} c="#e2dccb" ol={false} />
        <Hand side={side} reg={reg} />
      </group>
    </group>
  )
}

function Leg({ side, reg }: { side: 1 | -1; reg: (k: string) => (o: THREE.Object3D | null) => void }) {
  const g = charGeo()
  const k = side === 1 ? 'L' : 'R'
  return (
    <group ref={reg('hip' + k)} position={[side * DIM.hipX, -0.03, 0]} name={side === 1 ? 'cadera izquierda' : 'cadera derecha'}>
      <TP g={g.thigh} c={COL.pants} />
      <group ref={reg('knee' + k)} position={[0, -DIM.thigh, 0]} name={side === 1 ? 'rodilla izquierda' : 'rodilla derecha'}>
        <TP g={g.knee} c={COL.pants} ol={false} />
        <TP g={g.shin} c={COL.pants} />
        <group ref={reg('ankle' + k)} position={[0, -SHIN, 0]} name={side === 1 ? 'bota izquierda' : 'bota derecha'}>
          <TP g={g.bootShaft} c={COL.boot} />
          <TP g={g.bootCuff} c="#2a1e16" ol={false} />
          <TP g={g.foot} c={COL.boot} />
          <TP g={g.laces} c="#1b1410" ol={false} />
          <TP g={g.sole} c={COL.sole} />
          <TP g={g.lugs} c={COL.sole} ol={false} />
        </group>
      </group>
    </group>
  )
}

function Head() {
  const g = charGeo()
  const brim = CTEX.hatBrim(), crown = CTEX.hatCrown()
  return (
    <>
      <TP g={g.skull} c={COL.skin} name="cráneo" />
      <TP g={g.jaw} c={COL.skin} ol={false} />
      <TP g={g.hair} c={COL.beard} ol={false} />
      <TP g={g.beard} c={COL.beard} ol={false} name="barba" />
      <TP g={g.mustache} c={COL.beard} ol={false} />
      <TP g={g.nose} c={COL.skinDark} ol={false} />
      {([1, -1] as const).map((sx) => (
        <group key={sx}>
          <TP g={g.ear} c={COL.skin} p={[sx * 0.089, 0.098, -0.005]} />
          <TP g={g.eye} c="#f6f2ea" p={[sx * 0.036, 0.113, 0.084]} ol={false} />
          <TP g={g.iris} c="#24160e" p={[sx * 0.036, 0.113, 0.096]} ol={false} />
          <TP g={g.brow} c={COL.beard} p={[sx * 0.037, 0.136, 0.092]} r={[0.1, 0, sx * -0.14]} ol={false} />
          <TP g={g.sideburn} c={COL.beard} p={[sx * 0.084, 0.085, 0.018]} ol={false} />
        </group>
      ))}
      <group name="sombrero vueltiao" position={[0, 0.17, -0.004]} rotation={[-0.07, 0, 0.035]}>
        <TP g={g.hatBrim} c="#ffffff" map={brim} side={THREE.DoubleSide} />
        <TP g={g.hatCrown} c="#ffffff" map={crown} side={THREE.DoubleSide} />
        <TP g={g.hatBand} c="#141210" ol={false} />
      </group>
    </>
  )
}

function Backpack({ reg }: { reg: (k: string) => (o: THREE.Object3D | null) => void }) {
  const g = charGeo()
  return (
    <group ref={reg('pack')} position={[0, 0.24, -0.2]} name="mochila táctica">
      <group position={[0, -0.24, 0.2]}>
        <TP g={g.packBody} c={COL.olive} p={[0, 0.02, -0.3]} />
        <TP g={g.packFlapTop} c={COL.oliveDark} p={[0, 0.25, -0.3]} />
        <TP g={g.packFlapFront} c={COL.oliveDark} p={[0, 0.17, -0.405]} />
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <TP g={g.packStrap} c={COL.strap} p={[sx * 0.085, 0.16, -0.424]} ol={false} />
            <TP g={g.packBuckle} c={COL.buckle} p={[sx * 0.085, 0.085, -0.428]} ol={false} />
            <TP g={g.pocket} c={COL.olive} p={[sx * 0.085, -0.11, -0.41]} />
            <TP g={g.pocketFlap} c={COL.oliveDark} p={[sx * 0.085, -0.035, -0.412]} />
            <TP g={g.packBuckle} c={COL.buckle} p={[sx * 0.085, -0.065, -0.447]} ol={false} />
            <TP g={g.sidePocket} c={COL.oliveDark} p={[sx * 0.198, -0.06, -0.3]} />
          </group>
        ))}
        <TP g={g.bedroll} c="#a8996b" p={[0, 0.305, -0.285]} />
        {[-0.12, 0.12].map((x) => <TP key={x} g={g.bedrollTie} c={COL.strap} p={[x, 0.305, -0.285]} ol={false} />)}
      </group>
    </group>
  )
}

export function Character({ variant = 0, ctrl }: { variant?: number; ctrl?: React.RefObject<CharCtrl> }) {
  const g = charGeo()
  const ruanaTex = CTEX.ruana()
  const j = useRef<J>({}).current
  const reg = (k: string) => (o: THREE.Object3D | null) => { if (o) j[k] = o }
  const demo = useMemo(() => newCtrl(), [])
  const vdef = CHAR_VARIANTS[variant] ?? CHAR_VARIANTS[0]
  const st = useMemo(() => ({
    cur: makePose(), target: makePose(), t: 0, phi: 0, lastFire: 0, recoil: 0, flashT: 0, nextShot: 0, burst: 0,
    rp: new THREE.Vector3(), rq: new THREE.Quaternion(), hl: new THREE.Vector3(0.2, 0.2, 0.2), hr: new THREE.Vector3(-0.2, 0.2, 0.2),
    handMode: 'rifle' as HandMode, handT: 1, init: false,
  }), [])
  const flash = useRef<THREE.Group>(null)
  const flashLight = useRef<THREE.PointLight>(null)
  const heal = useRef<(THREE.Object3D | null)[]>([])
  const dust = useRef<(THREE.Object3D | null)[]>([])

  useFrame((_, delta) => {
    const S = useStore.getState()
    let dt = Math.min(delta, 0.05)
    if (!ctrl) { if (!S.animate) return; dt *= S.animSpeed }
    st.t += dt
    const t = st.t
    const c = ctrl?.current ?? demo
    let rootArc = 0
    // ---------- conductor de demostración (visor) ----------
    if (!ctrl) {
      c.state = vdef.state; c.speed = 0; c.vy = 0; c.aimPitch = 0
      switch (vdef.state) {
        case 'walk': c.speed = 1.5; break
        case 'sprint': c.speed = 6; break
        case 'jump': {
          const p = (t % 1.4) / 1.4
          const air = Math.min(1, Math.max(0, (p - 0.12) / 0.74))
          if (air > 0 && air < 1) { rootArc = 0.6 * Math.sin(Math.PI * air); c.vy = Math.cos(Math.PI * air) * 4 } else { c.state = 'idle'; rootArc = -0.1 * Math.sin(Math.PI * (p < 0.5 ? p / 0.12 : (p - 0.86) / 0.14)) }
          break
        }
        case 'vault': c.speed = 6; c.progress = (t % 1.0) / 1.0; rootArc = 0.4 * Math.sin(Math.PI * c.progress); break
        case 'slide': c.speed = 6; c.progress = (t % 1.7) / 1.7; break
        case 'heal': c.progress = Math.min(1, (t % 2.6) / 2); break
      }
      if (vdef.fire && t > st.nextShot) {
        c.fireCount++; st.burst++
        st.nextShot = t + (st.burst % 6 === 0 ? 0.75 : 0.1)
      }
    }
    // ---------- fase del ciclo y disparo ----------
    const stride = c.state === 'walk' ? 1.35 : 2.3
    st.phi += dt * ((Math.PI * 2 * Math.max(0, c.speed)) / stride)
    if (c.fireCount !== st.lastFire) {
      st.lastFire = c.fireCount; st.recoil = 1; st.flashT = 0.055
      if (flash.current) flash.current.rotation.x = Math.random() * Math.PI
    }
    st.recoil *= Math.exp(-16 * dt)
    st.flashT -= dt
    // ---------- pose del cuerpo ----------
    computePose(st.target, c, st.phi, t, st.recoil)
    const loco = c.state === 'walk' || c.state === 'sprint'
    if (!st.init) { dampPose(st.cur, st.target, 1e6, 1); st.init = true }
    dampPose(st.cur, st.target, loco ? 16 : 9, dt)
    const P = st.cur
    if (j.root) j.root.position.y = damp(j.root.position.y, rootArc, 18, dt)
    j.hips.position.set(0, DIM.hipY + P.hipsDY, P.hipsDZ)
    j.hips.rotation.set(P.hips[0], P.hips[1], P.hips[2])
    j.spine.rotation.set(P.spine[0], P.spine[1], P.spine[2])
    j.chest.rotation.set(P.chest[0], P.chest[1], P.chest[2])
    j.neck.rotation.set(P.neck[0], P.neck[1], P.neck[2])
    j.head.rotation.set(P.head[0], P.head[1], P.head[2])
    j.hipL.rotation.set(P.hipL[0], P.hipL[1], P.hipL[2]); j.hipR.rotation.set(P.hipR[0], P.hipR[1], P.hipR[2])
    j.kneeL.rotation.x = P.kneeL; j.kneeR.rotation.x = P.kneeR
    j.ankleL.rotation.x = P.ankleL; j.ankleR.rotation.x = P.ankleR
    j.ruanaF.rotation.x = P.ruanaF; j.ruanaB.rotation.x = P.ruanaB
    j.pack.rotation.x = P.pack
    // ---------- montaje del fusil ----------
    const rd = RIFLE[rifleModeFor(c.state)]
    _butt.set(rd.butt[0], rd.butt[1], rd.butt[2]); _dir.set(rd.dir[0], rd.dir[1], rd.dir[2]); _up.set(rd.up[0], rd.up[1], rd.up[2])
    rifleBasis(_butt, _dir, _up, _tp, _tq)
    const kr = 1 - Math.exp(-10 * dt)
    st.rp.lerp(_tp, kr); st.rq.slerp(_tq, kr)
    const wm = j.weapon
    wm.quaternion.copy(st.rq)
    if (st.recoil > 0.002) wm.quaternion.multiply(_qr.setFromAxisAngle(Z_AXIS, 0.13 * st.recoil))
    _dir.set(1, 0, 0).applyQuaternion(st.rq)
    wm.position.copy(st.rp).addScaledVector(_dir, -0.055 * st.recoil)
    // ---------- objetivos de las manos + IK ----------
    const hm = handModeFor(c.state)
    if (hm !== st.handMode) { st.handMode = hm; st.handT = 0 }
    st.handT += dt
    const exact = hm === 'rifle' && st.handT > 0.35
    const kh = exact ? 1 : 1 - Math.exp(-12 * dt)
    for (const side of ['L', 'R'] as const) {
      if (hm === 'rifle') _des.copy(side === 'L' ? GRIP_L : GRIP_R).applyQuaternion(wm.quaternion).add(wm.position)
      else { const h = HAND_TARGETS[hm][side]; _des.set(h[0], h[1], h[2]) }
      const cur = side === 'L' ? st.hl : st.hr
      cur.lerp(_des, kh)
    }
    j.hips.updateMatrixWorld(true)
    for (const side of ['L', 'R'] as const) {
      _w.copy(side === 'L' ? st.hl : st.hr)
      j.spine.localToWorld(_w)
      j.chest.worldToLocal(_w)
      const pl = POLES[hm][side]
      _pole.set(pl[0], pl[1], pl[2])
      solveArm(j['sh' + side], j['el' + side], _w, _pole, DIM.upperArm, DIM.foreArm + 0.045)
    }
    // ---------- efectos ----------
    const fl = st.flashT > 0
    if (flash.current) { flash.current.visible = fl; flash.current.scale.setScalar(0.8 + Math.random() * 0.5) }
    if (flashLight.current) flashLight.current.intensity = fl ? 6 : 0
    j.chute.visible = c.state === 'parachute'
    j.medkit.visible = c.state === 'heal'
    heal.current.forEach((m, i) => {
      if (!m) return
      m.visible = c.state === 'heal'
      if (!m.visible) return
      const u = (t * 0.6 + i / heal.current.length) % 1
      const a = i * 2.39
      m.position.set(Math.cos(a) * (0.25 + 0.1 * u), 0.1 + u * 1.1, Math.sin(a) * (0.25 + 0.1 * u) + 0.15)
      m.scale.setScalar(Math.sin(Math.PI * u) * 1.2)
    })
    dust.current.forEach((m, i) => {
      if (!m) return
      m.visible = !ctrl && c.state === 'slide' && c.progress > 0.08 && c.progress < 0.9
      if (!m.visible) return
      const u = (t * 2.2 + i / dust.current.length) % 1
      m.position.set(Math.sin(i * 7.1) * 0.3 * u, 0.05 + u * 0.35, 0.5 - u * 1.1)
      m.scale.setScalar(0.5 + u * 1.6)
    })
  })

  return (
    <group name="personaje">
      <group ref={reg('root')}>
        <group ref={reg('hips')} position={[0, DIM.hipY, 0]} name="caderas">
          <TP g={g.pelvis} c={COL.pants} />
          <TP g={g.belt} c={COL.leather} ol={false} />
          <TP g={g.buckle} c={COL.buckle} p={[0, 0.075, 0.122]} ol={false} />
          <Leg side={1} reg={reg} />
          <Leg side={-1} reg={reg} />
          <group ref={reg('spine')} position={[0, DIM.spineY, 0]} name="columna">
            <TP g={g.waist} c={COL.shirt} />
            <group ref={reg('weapon')} name="fusil (weaponMount)">
              <AK47 variant={0} />
              <group ref={flash} position={[0.57, 0.004, 0]} visible={false}>
                <mesh geometry={g.flashCone} userData={{ noCap: true, noExport: true }}>
                  <meshBasicMaterial color="#ffc04a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <mesh geometry={g.flashStar} userData={{ noCap: true, noExport: true }}>
                  <meshBasicMaterial color="#fff1b8" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
                <pointLight ref={flashLight} color="#ffb347" intensity={0} distance={4} decay={2} />
              </group>
            </group>
            <group ref={reg('medkit')} position={[0, 0.3, 0.36]} visible={false} name="botiquín (curación)">
              <TP g={g.medkit} c="#ffffff" map={CTEX.medkit()} />
            </group>
            <group ref={reg('chute')} visible={false} name="paracaídas">
              <TP g={g.canopy} c="#ffffff" map={CTEX.canopy()} p={[0, 2.75, 0]} side={THREE.DoubleSide} ol={false} cast />
              <TP g={g.chuteLines} c="#2a2a2a" ol={false} cast={false} />
            </group>
            <group ref={reg('chest')} position={[0, DIM.chestY, 0]} name="pecho">
              <TP g={g.torso} c={COL.shirt} />
              <TP g={g.collar} c={COL.cream} ol={false} />
              <group ref={reg('ruanaF')} position={[0, 0.31, 0]} name="ruana (delantera)">
                <TP g={g.ruanaFront} c="#ffffff" map={ruanaTex} p={[0, -0.31, 0]} />
                <TP g={g.fringeFront} c="#e4dcc6" p={[0, -0.31, 0]} ol={false} />
              </group>
              <group ref={reg('ruanaB')} position={[0, 0.31, 0]} name="ruana (trasera)">
                <TP g={g.ruanaBack} c="#ffffff" map={ruanaTex} p={[0, -0.31, 0]} />
                <TP g={g.fringeBack} c="#e4dcc6" p={[0, -0.31, 0]} ol={false} />
              </group>
              <Backpack reg={reg} />
              <TP g={g.strapL} c={COL.strap} ol={false} name="tirante izquierdo" />
              <TP g={g.strapR} c={COL.strap} ol={false} name="tirante derecho" />
              <TP g={g.sternum} c={COL.strap} ol={false} />
              <group ref={reg('neck')} position={[0, DIM.neckY, 0]} name="cuello">
                <TP g={g.neck} c={COL.skin} />
                <group ref={reg('head')} position={[0, DIM.headY, 0]} name="cabeza">
                  <Head />
                </group>
              </group>
              <Arm side={1} reg={reg} />
              <Arm side={-1} reg={reg} />
            </group>
          </group>
        </group>
      </group>
      <group name="partículas de curación">
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={i} ref={(o) => { heal.current[i] = o }} geometry={g.healCross} visible={false} userData={{ noCap: true, noExport: true }}>
            <meshBasicMaterial color="#5dff7a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <group name="polvo de derrape">
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={i} ref={(o) => { dust.current[i] = o }} geometry={g.dust} visible={false} userData={{ noCap: true, noExport: true }}>
            <meshBasicMaterial color="#b49a74" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Exportado para la prueba de agarre (distancia mano-empuñadura). */
export const RIG_DEBUG = { BUTT_X }
