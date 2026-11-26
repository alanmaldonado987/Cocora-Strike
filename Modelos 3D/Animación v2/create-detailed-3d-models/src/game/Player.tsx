import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Character } from '../three/models/Character'
import { newCtrl, type CharCtrl } from '../three/models/character/rig'
import { CHUTE_FALL, GRAVITY, INPUT, OBSTACLES, RT, TERMINAL_FALL, ZONE, findVault, groundHeight, inWater, pointInBox, resolveCircle, useGame, zoneRadius } from './core'
import { FX, sfx } from './fx'

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _move = new THREE.Vector3(), _cam = new THREE.Vector3(), _look = new THREE.Vector3(), _hit = new THREE.Vector3(), _ray = new THREE.Vector3()
const angDamp = (a: number, b: number, k: number, dt: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * (1 - Math.exp(-k * dt)) }

/** Disparo hitscan por marcha de rayo: osos, obstáculos, suelo. */
function castShot(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3): { kind: 'bear' | 'obstacle' | 'ground' | 'none'; bear: number } {
  for (let s = 0.5; s < 140; s += 0.25) {
    const x = origin.x + dir.x * s, y = origin.y + dir.y * s, z = origin.z + dir.z * s
    for (let i = 0; i < RT.bears.length; i++) {
      const b = RT.bears[i]
      if (b.state === 'dead') continue
      const dx = x - b.pos.x, dy = y - (b.pos.y + 0.8), dz = z - b.pos.z
      if (dx * dx + dy * dy * 1.6 + dz * dz < 0.62) { out.set(x, y, z); return { kind: 'bear', bear: i } }
    }
    if (y < groundHeight(x, z)) { out.set(x, groundHeight(x, z), z); return { kind: 'ground', bear: -1 } }
    for (const b of OBSTACLES) if (y < b.top && pointInBox(b, x, z)) { out.set(x, y, z); return { kind: 'obstacle', bear: -1 } }
  }
  out.copy(origin).addScaledVector(dir, 140)
  return { kind: 'none', bear: -1 }
}

export function Player() {
  const ctrl = useRef<CharCtrl>(newCtrl('fall'))
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const hudT = useRef(0)
  const local = useMemo(() => ({ lastPrompt: '' as string | null }), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const G = useGame.getState()
    const c = ctrl.current
    const playing = G.phase === 'playing'
    // ---------------- cámara (yaw/pitch) ----------------
    if (playing) {
      RT.camYaw -= INPUT.dx * 0.0023
      RT.camPitch = Math.max(-1.15, Math.min(0.85, RT.camPitch - INPUT.dy * 0.0021))
    }
    INPUT.dx = INPUT.dy = 0
    const pr = INPUT.pressed
    if (playing) {
      RT.t += dt
      const t = RT.t
      const keys = INPUT.keys
      _fwd.set(Math.sin(RT.camYaw), 0, Math.cos(RT.camYaw))
      _right.set(-Math.cos(RT.camYaw), 0, Math.sin(RT.camYaw))
      const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)
      const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      _move.copy(_fwd).multiplyScalar(f).addScaledVector(_right, r)
      const moving = _move.lengthSq() > 0.01
      if (moving) _move.normalize()
      const healing = RT.healT >= 0
      const sprint = keys.has('ShiftLeft') && f > 0 && !healing && RT.grounded
      const p = RT.pos
      const ground = groundHeight(p.x, p.z)
      let hp = G.hp
      // ---------------- estados de movimiento ----------------
      if (RT.vaultT >= 0) {
        RT.vaultT += dt
        const u = Math.min(1, RT.vaultT / 0.45)
        p.lerpVectors(RT.vaultFrom, RT.vaultTo, u)
        p.y = Math.max(groundHeight(p.x, p.z), RT.vaultFrom.y + Math.sin(Math.PI * u) * RT.vaultH)
        c.state = 'vault'; c.progress = u; c.speed = RT.vaultSpeed
        if (u >= 1) { RT.vaultT = -1; RT.vel.copy(_fwd.set(Math.sin(RT.bodyYaw), 0, Math.cos(RT.bodyYaw))).multiplyScalar(RT.vaultSpeed); p.y = groundHeight(p.x, p.z) }
      } else if (!RT.grounded) {
        // aire: salto, caída libre o paracaídas
        if (RT.chute === 'free' && pr.has('Space') && p.y - ground > 6) { RT.chute = 'open'; sfx('chute') }
        const vyCap = RT.chute === 'open' ? CHUTE_FALL : TERMINAL_FALL
        RT.vel.y -= GRAVITY * dt
        if (RT.chute === 'open') RT.vel.y += (CHUTE_FALL - RT.vel.y) * (1 - Math.exp(-3 * dt))
        RT.vel.y = Math.max(vyCap, RT.vel.y)
        const air = RT.chute === 'open' ? 6.5 : RT.chute === 'free' ? 9 : 4
        RT.vel.x += (_move.x * air - RT.vel.x) * (1 - Math.exp(-2.5 * dt))
        RT.vel.z += (_move.z * air - RT.vel.z) * (1 - Math.exp(-2.5 * dt))
        p.addScaledVector(RT.vel, dt)
        const g2 = groundHeight(p.x, p.z)
        c.state = RT.chute === 'open' ? 'parachute' : RT.chute === 'free' && p.y - g2 > 4 ? 'fall' : 'jump'
        c.vy = RT.vel.y
        if (p.y <= g2) {
          const impact = -RT.vel.y
          p.y = g2; RT.grounded = true
          if (RT.chute !== 'open' && impact > 13) { const dmg = Math.round((impact - 13) * 4.2); hp -= dmg; useGame.getState().set({ hurt: 1 }); sfx('hurt') }
          sfx('land')
          FX.burst('dust', p.x, p.y + 0.05, p.z, impact > 8 ? 14 : 5, 2.2, 0.8, 0.16)
          RT.chute = 'none'; RT.vel.y = 0
        }
      } else {
        // suelo
        if (RT.slideT >= 0) {
          RT.slideT += dt
          const u = RT.slideT / 0.85
          const sp = 8.6 * Math.pow(Math.max(0, 1 - u), 0.6) + 1.5
          RT.vel.copy(RT.slideDir).multiplyScalar(sp)
          c.state = 'slide'; c.progress = Math.min(1, u); c.speed = sp
          if (Math.random() < 0.7) FX.emit('dust', p.x + (Math.random() - 0.5) * 0.4, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.4, -RT.slideDir.x * 1.5 + (Math.random() - 0.5), 0.8 + Math.random(), -RT.slideDir.z * 1.5 + (Math.random() - 0.5), 0.7, 0.14)
          if (u >= 1) RT.slideT = -1
        } else {
          const water = inWater(p.x, p.z)
          const target = (healing ? 1.6 : sprint ? 6.4 : 3.2) * (water ? 0.55 : 1)
          RT.vel.x += ((moving ? _move.x * target : 0) - RT.vel.x) * (1 - Math.exp(-10 * dt))
          RT.vel.z += ((moving ? _move.z * target : 0) - RT.vel.z) * (1 - Math.exp(-10 * dt))
          const spd = Math.hypot(RT.vel.x, RT.vel.z)
          const aiming = RT.aimHeld || t - RT.lastShot < 0.7
          c.speed = spd
          c.state = healing ? 'heal' : spd > 0.4 ? (sprint ? 'sprint' : 'walk') : aiming ? 'aim' : 'idle'
          if (water && spd > 1 && Math.random() < 0.3) FX.emit('glass', p.x, p.y + 0.1, p.z, (Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2, 0.5, 0.06)
          // salto / vaulting
          if (pr.has('Space') && !healing) {
            const fx = Math.sin(RT.bodyYaw), fz = Math.cos(RT.bodyYaw)
            const v = sprint ? findVault(p.x, p.z, fx, fz, p.y) : null
            if (v) {
              RT.vaultT = 0; RT.vaultBox = v.box; RT.vaultFrom.copy(p)
              RT.vaultTo.set(p.x + fx * v.exit, 0, p.z + fz * v.exit); RT.vaultTo.y = groundHeight(RT.vaultTo.x, RT.vaultTo.z)
              RT.vaultH = Math.max(0.5, v.box.top - p.y + 0.15); RT.vaultSpeed = Math.max(6.4, v.exit / 0.45)
            } else { RT.vel.y = 5.4; RT.grounded = false; RT.chute = 'none' }
          }
          // derrape táctico
          if ((pr.has('KeyC') || pr.has('ControlLeft')) && sprint && RT.slideT < 0) { RT.slideT = 0; RT.slideDir.set(Math.sin(RT.bodyYaw), 0, Math.cos(RT.bodyYaw)) }
        }
        p.x += RT.vel.x * dt; p.z += RT.vel.z * dt
        resolveCircle(p, 0.36, p.y, null)
        const gh = groundHeight(p.x, p.z)
        if (gh < p.y - 0.6) { RT.grounded = false; RT.chute = 'none'; RT.vel.y = 0 } else p.y = gh
      }
      // ---------------- curación (2 s) ----------------
      if (pr.has('KeyH') && RT.healT < 0 && G.medkits > 0 && hp < 100 && RT.grounded && RT.vaultT < 0 && RT.slideT < 0) { RT.healT = 0; sfx('heal') }
      if (RT.healT >= 0) {
        RT.healT += dt
        c.progress = RT.healT / 2
        if (sprint || RT.fireHeld || !RT.grounded) RT.healT = -1
        else if (RT.healT >= 2) { RT.healT = -1; hp = Math.min(100, hp + 40); useGame.getState().set({ medkits: G.medkits - 1 }) }
        if (Math.random() < 0.5) FX.emit('heal', p.x + (Math.random() - 0.5) * 0.7, p.y + 0.6 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.7, 0, 0.6, 0, 1.0, 0.05)
      }
      // ---------------- arma ----------------
      let ammo = G.ammo, reserve = G.reserve
      if (pr.has('KeyR') && RT.reloadT < 0 && ammo < 30 && reserve > 0) RT.reloadT = 0
      if (RT.reloadT >= 0) {
        RT.reloadT += dt
        if (RT.reloadT >= 1.6) { const n = Math.min(30 - ammo, reserve); ammo += n; reserve -= n; RT.reloadT = -1 }
      }
      const canFire = RT.healT < 0 && RT.reloadT < 0 && c.state !== 'sprint' && c.state !== 'parachute' && c.state !== 'fall'
      if (RT.fireHeld && canFire && t >= RT.nextShot) {
        RT.nextShot = t + 0.1
        if (ammo > 0) {
          ammo--; RT.lastShot = t; c.fireCount++
          sfx('shot')
          _ray.set(Math.sin(RT.camYaw) * Math.cos(RT.camPitch), Math.sin(RT.camPitch), Math.cos(RT.camYaw) * Math.cos(RT.camPitch))
          _ray.x += (Math.random() - 0.5) * 0.012; _ray.y += (Math.random() - 0.5) * 0.012; _ray.normalize()
          const res = castShot(camera.position, _ray, _hit)
          RT.muzzle.set(p.x + Math.sin(RT.bodyYaw) * 0.72 - Math.cos(RT.bodyYaw) * 0.16, p.y + 1.43, p.z + Math.cos(RT.bodyYaw) * 0.72 + Math.sin(RT.bodyYaw) * 0.16)
          FX.tracer(RT.muzzle.x, RT.muzzle.y, RT.muzzle.z, _hit.x, _hit.y, _hit.z)
          FX.burst('spark', RT.muzzle.x, RT.muzzle.y, RT.muzzle.z, 2, 2, 0.12, 0.04)
          if (res.kind === 'bear') {
            const b = RT.bears[res.bear]
            b.hp -= 25; b.provoked = true
            FX.burst('blood', _hit.x, _hit.y, _hit.z, 6, 2.5, 0.5, 0.06)
            if (b.hp <= 0) { b.state = 'dead'; useGame.getState().set({ kills: G.kills + 1, feed: [...G.feed.slice(-3), 'Eliminaste a un oso de anteojos'] }) } else sfx('bear')
          } else if (res.kind !== 'none') {
            FX.burst(res.kind === 'ground' ? 'dust' : 'debris', _hit.x, _hit.y + 0.02, _hit.z, 5, 1.8, 0.5, 0.07)
          }
        } else { sfx('empty'); if (reserve > 0 && RT.reloadT < 0) RT.reloadT = 0 }
      }
      // ---------------- orientación del cuerpo ----------------
      const faceCam = RT.aimHeld || t - RT.lastShot < 0.7 || c.state === 'aim'
      if (RT.vaultT < 0 && RT.slideT < 0) {
        if (faceCam) RT.bodyYaw = angDamp(RT.bodyYaw, RT.camYaw, 14, dt)
        else if (moving) RT.bodyYaw = angDamp(RT.bodyYaw, Math.atan2(_move.x, _move.z), 10, dt)
      }
      c.aimPitch = RT.camPitch
      // ---------------- recogida ----------------
      let prompt: string | null = null
      for (const a of RT.ammoBoxes) if (a.active && Math.hypot(a.x - p.x, a.z - p.z) < 1.4 && Math.abs(a.y - p.y) < 1.5) { a.active = false; reserve = Math.min(210, reserve + 30); sfx('pickup') }
      for (const m of RT.medkits) {
        if (!m.active || Math.hypot(m.x - p.x, m.z - p.z) > 2.2 || Math.abs(m.y - p.y) > 1.5) continue
        prompt = G.medkits >= 3 ? 'BOTIQUINES LLENOS (3/3)' : 'RECOGER BOTIQUÍN'
        if (pr.has('KeyE') && G.medkits < 3) { m.active = false; useGame.getState().set({ medkits: G.medkits + 1 }); sfx('pickup'); prompt = null }
        break
      }
      if (!prompt && RT.chute === 'free' && p.y - ground > 6) prompt = 'ABRIR PARACAÍDAS|ESPACIO'
      if (!prompt && ammo === 0 && reserve > 0 && RT.reloadT < 0) prompt = 'RECARGAR|R'
      // ---------------- tormenta ----------------
      const zr = zoneRadius(t)
      const inStorm = Math.hypot(p.x - ZONE.cx, p.z - ZONE.cz) > zr
      if (inStorm) hp -= dt * 3
      // ---------------- sincronizar HUD ----------------
      hudT.current += dt
      const patch: Partial<ReturnType<typeof useGame.getState>> = {}
      if (Math.ceil(hp) !== Math.ceil(G.hp)) patch.hp = Math.max(0, hp)
      else if (hp !== G.hp) patch.hp = hp
      if (ammo !== G.ammo) patch.ammo = ammo
      if (reserve !== G.reserve) patch.reserve = reserve
      if (prompt !== local.lastPrompt) { patch.prompt = prompt; local.lastPrompt = prompt }
      if (hudT.current > 0.1) {
        hudT.current = 0
        Object.assign(patch, {
          px: p.x, pz: p.z, yaw: RT.camYaw, altitude: Math.max(0, p.y - groundHeight(p.x, p.z)), chute: RT.chute, zoneR: zr, inStorm,
          heal: RT.healT >= 0 ? RT.healT / 2 : -1, reload: RT.reloadT >= 0 ? RT.reloadT / 1.6 : -1,
          bears: RT.bears.map((b) => ({ x: b.pos.x, z: b.pos.z, alive: b.state !== 'dead' })),
        })
      }
      if (hp <= 0) { patch.hp = 0; patch.phase = 'dead' }
      if (Object.keys(patch).length) useGame.getState().set(patch)
    }
    pr.clear()
    // ---------------- aplicar transformaciones ----------------
    const g = group.current
    if (g) { g.position.copy(RT.pos); g.rotation.y = RT.bodyYaw }
    // ---------------- cámara en tercera persona (hombro) ----------------
    const p = RT.pos
    const air = !RT.grounded && RT.chute !== 'none'
    const dist = air ? 5.5 : RT.aimHeld ? 2.3 : 3.3
    const cp = Math.cos(RT.camPitch), sp = Math.sin(RT.camPitch)
    _look.set(Math.sin(RT.camYaw) * cp, sp, Math.cos(RT.camYaw) * cp)
    _right.set(-Math.cos(RT.camYaw), 0, Math.sin(RT.camYaw))
    _cam.set(p.x, p.y + (air ? 2.2 : 1.62), p.z).addScaledVector(_look, -dist).addScaledVector(_right, -0.62)
    _cam.y = Math.max(_cam.y, groundHeight(_cam.x, _cam.z) + 0.35)
    camera.position.lerp(_cam, 1 - Math.exp(-20 * dt))
    camera.rotation.set(RT.camPitch, RT.camYaw + Math.PI, 0, 'YXZ')
  })

  return (
    <group ref={group} name="jugador">
      <Character ctrl={ctrl} />
    </group>
  )
}
