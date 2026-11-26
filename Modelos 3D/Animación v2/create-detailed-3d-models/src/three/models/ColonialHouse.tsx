import * as THREE from 'three'
import { useMemo } from 'react'
import { Bx, Cy, Geo, GeoBuilder, Sp, TEX, useDispose, type V3 } from '../helpers'

function buildTiles(roofW: number, slopeLen: number, slopeAng: number, wallTop: number, halfD: number, roofRise: number) {
  const main = new GeoBuilder()
  const tile = new THREE.CylinderGeometry(0.09, 0.09, slopeLen + 0.12, 8)
  tile.rotateX(Math.PI / 2)
  for (const sigma of [1, -1]) {
    const sub = new GeoBuilder()
    for (let x = -roofW / 2 + 0.12; x <= roofW / 2 - 0.1; x += 0.26) sub.add(tile, [x, 0.1, 0])
    const g = sub.build()
    main.add(g, [0, wallTop + roofRise / 2 + 0.02, (sigma * halfD) / 2], [sigma * slopeAng, 0, 0])
    g.dispose()
  }
  const ridge = new THREE.CylinderGeometry(0.12, 0.12, roofW + 0.05, 10)
  main.add(ridge, [0, wallTop + roofRise + 0.1, 0], [0, 0, Math.PI / 2])
  tile.dispose(); ridge.dispose()
  return main.build()
}

function buildGables(D: number, rise: number, W: number) {
  const s = new THREE.Shape()
  s.moveTo(-D / 2, 0); s.lineTo(D / 2, 0); s.lineTo(D / 2, 0.3); s.lineTo(0, rise - 0.05); s.lineTo(-D / 2, 0.3); s.closePath()
  const tri = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: false })
  const b = new GeoBuilder()
  b.add(tri, [W / 2 - 0.25, 0, 0], [0, Math.PI / 2, 0])
  b.add(tri, [-W / 2, 0, 0], [0, Math.PI / 2, 0])
  tri.dispose()
  return b.build()
}

function buildRailing(len: number) {
  const b = new GeoBuilder()
  const post = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8)
  const bal = new THREE.BoxGeometry(0.04, 0.78, 0.04)
  const n = Math.max(2, Math.round(len / 0.9))
  for (let i = 0; i <= n; i++) b.add(post, [-len / 2 + (i / n) * len, 0.5, 0])
  const nb = Math.max(2, Math.round(len / 0.17))
  for (let i = 0; i < nb; i++) b.add(bal, [-len / 2 + ((i + 0.5) / nb) * len, 0.5, 0])
  const rail = new THREE.BoxGeometry(len + 0.08, 0.08, 0.09)
  b.add(rail, [0, 1.0, 0]); b.add(rail, [0, 0.1, 0])
  post.dispose(); bal.dispose(); rail.dispose()
  return b.build()
}

function Door({ p, r, w = 1.1, h = 2.2, leaf = '#2f7a4f', frame = '#d7762c', name }: { p: V3; r?: V3; w?: number; h?: number; leaf?: string; frame?: string; name: string }) {
  const panel = new THREE.Color(leaf).multiplyScalar(0.75).getStyle()
  return (
    <group name={name} position={p} rotation={r}>
      <Bx a={[w, h, 0.12]} p={[0, h / 2, 0]} c={frame} />
      <Bx a={[w - 0.2, h - 0.12, 0.08]} p={[0, (h - 0.12) / 2, 0.03]} c={leaf} />
      {[[-1, 0.7], [1, 0.7], [-1, 0.3], [1, 0.3]].map(([sx, fy], i) => (
        <Bx key={i} a={[w * 0.3, h * 0.3, 0.03]} p={[sx * w * 0.2, h * fy, 0.08]} c={panel} />
      ))}
      <Sp a={[0.03, 8, 8]} p={[w * 0.3, h * 0.45, 0.09]} c="#d8b35a" m={{ metalness: 0.6, roughness: 0.3 }} />
      <Bx a={[w + 0.2, 0.14, 0.16]} p={[0, h + 0.05, 0]} c="#7a4a22" m={{ map: TEX.wood() }} />
    </group>
  )
}

function Window({ p, r, w = 1.2, h = 1.3, color = '#2b6cb0', shutters = true, name }: { p: V3; r?: V3; w?: number; h?: number; color?: string; shutters?: boolean; name: string }) {
  return (
    <group name={name} position={p} rotation={r}>
      <Bx a={[w, h, 0.12]} p={[0, h / 2, 0]} c={color} />
      <Bx a={[w - 0.16, h - 0.16, 0.06]} p={[0, h / 2, 0.02]} c="#1a2733" m={{ roughness: 0.2, metalness: 0.3 }} />
      {[1, 2, 3].map((k) => (
        <Bx key={k} a={[0.035, h - 0.16, 0.05]} p={[-w / 2 + 0.08 + (k * (w - 0.16)) / 4, h / 2, 0.07]} c="#5a3a1c" />
      ))}
      <Bx a={[w - 0.16, 0.035, 0.05]} p={[0, h / 2, 0.07]} c="#5a3a1c" />
      <Bx a={[w + 0.2, 0.08, 0.22]} p={[0, -0.02, 0.06]} c="#c8c0b0" />
      {shutters && <Bx a={[w * 0.42, h - 0.1, 0.05]} p={[-(w / 2 + w * 0.21 + 0.02), h / 2, 0.06]} c={color} />}
      {shutters && <Bx a={[w * 0.42, h - 0.1, 0.05]} p={[w / 2 + w * 0.21 + 0.02, h / 2, 0.06]} c={color} />}
    </group>
  )
}

export function ColonialHouse({ variant = 0 }: { variant?: number }) {
  const floors = variant === 1 ? 1 : 2
  const W = floors === 2 ? 6.4 : 5.4, D = 5.2, FH = 2.75, BASE = 0.8
  const wallTop = BASE + FH * floors
  const roofRise = 1.9, over = 0.55
  const halfD = D / 2 + over
  const slopeLen = Math.hypot(halfD, roofRise)
  const slopeAng = Math.atan2(roofRise, halfD)
  const roofW = W + 2 * over

  const tiles = useMemo(() => buildTiles(roofW, slopeLen, slopeAng, wallTop, halfD, roofRise), [roofW, slopeLen, slopeAng, wallTop, halfD, roofRise])
  const gables = useMemo(() => buildGables(D, roofRise, W), [D, roofRise, W])
  const railFront = useMemo(() => buildRailing(3.8), [])
  const railSide = useMemo(() => buildRailing(0.95), [])
  useDispose(tiles, gables, railFront, railSide)

  const stone = useMemo(() => TEX.stone([3, 0.6]), [])
  const stucco = useMemo(() => TEX.stucco([2, 2]), [])
  const wood = useMemo(() => TEX.wood([1, 1]), [])
  const floorY = BASE + FH
  const front = D / 2

  return (
    <group>
      <Bx name="zócalo de piedra" a={[W + 0.25, BASE, D + 0.25]} p={[0, BASE / 2, 0]} m={{ map: stone, roughness: 0.95 }} />
      <Bx name="muros" a={[W, FH * floors, D]} p={[0, BASE + (FH * floors) / 2, 0]} c="#f6f1e6" m={{ map: stucco, roughness: 0.92 }} />
      {floors === 2 && <Bx name="cornisa" a={[W + 0.12, 0.14, D + 0.12]} p={[0, floorY, 0]} c="#c8652f" />}
      <Geo name="hastiales" geometry={gables} p={[0, wallTop, 0]} c="#f6f1e6" m={{ map: stucco }} />
      <group name="techo">
        {[1, -1].map((sg) => (
          <Bx key={sg} a={[roofW, 0.12, slopeLen]} p={[0, wallTop + roofRise / 2 + 0.02, (sg * halfD) / 2]} r={[sg * slopeAng, 0, 0]} c="#8e4225" />
        ))}
        <Geo geometry={tiles} c="#c75a30" m={{ roughness: 0.85 }} />
        {[1, -1].map((sg) => (
          <Bx key={sg} a={[roofW, 0.12, 0.14]} p={[0, wallTop - 0.03, sg * (halfD - 0.07)]} c="#6b4120" m={{ map: wood }} />
        ))}
      </group>

      {/* Planta baja (frente) */}
      <Door name="puerta principal" p={[-W / 2 + 1.3, BASE, front]} />
      {floors === 2 ? (
        <>
          <Window name="ventana frontal" p={[W / 2 - 1.5, BASE + 0.7, front]} />
          <Door name="puerta lateral" p={[0.3, BASE, front]} w={1.0} h={2.1} leaf="#d7762c" frame="#2f7a4f" />
        </>
      ) : (
        <>
          <Window name="ventana izquierda" p={[0.2, BASE + 0.7, front]} w={1.1} h={1.2} color="#2f7a4f" />
          <Window name="ventana derecha" p={[W / 2 - 1.2, BASE + 0.7, front]} w={1.1} h={1.2} />
        </>
      )}
      <Bx name="escalón" a={[1.7, 0.18, 0.55]} p={[-W / 2 + 1.3, 0.09, front + 0.3]} c="#9c978b" m={{ map: TEX.stone([1.5, 0.5]) }} />

      {/* Ventanas laterales */}
      <Window name="ventana lateral este" p={[W / 2, BASE + 0.8, -0.6]} r={[0, Math.PI / 2, 0]} w={1.0} h={1.2} color="#2f7a4f" />
      <Window name="ventana lateral oeste" p={[-W / 2, BASE + 0.8, 0.6]} r={[0, -Math.PI / 2, 0]} w={1.0} h={1.2} />
      <Window name="ventana trasera" p={[0.8, BASE + 0.8, -front]} r={[0, Math.PI, 0]} w={1.0} h={1.2} color="#c8652f" />

      {/* Segundo piso + balcón */}
      {floors === 2 && (
        <>
          <group name="balcón" position={[0.4, floorY, front]}>
            <Bx a={[4.0, 0.14, 1.05]} p={[0, -0.07, 0.52]} c="#7a4a22" m={{ map: wood }} />
            <Geo geometry={railFront} p={[0, 0, 1.0]} c="#2f7a4f" />
            <Geo geometry={railSide} p={[-1.96, 0, 0.5]} r={[0, Math.PI / 2, 0]} c="#2f7a4f" />
            <Geo geometry={railSide} p={[1.96, 0, 0.5]} r={[0, Math.PI / 2, 0]} c="#2f7a4f" />
            {[-1.5, 0, 1.5].map((x) => (
              <Bx key={x} a={[0.12, 0.12, 1.1]} p={[x, -0.5, 0.42]} r={[-0.72, 0, 0]} c="#6b4120" m={{ map: wood }} />
            ))}
            {[-1.3, -0.2, 1.1].map((x, i) => (
              <group key={i} position={[x, 0.0, 0.85]}>
                <Cy a={[0.1, 0.075, 0.18, 10]} p={[0, 0.09, 0]} c="#b8552d" />
                <Sp a={[0.16, 10, 8]} p={[0, 0.26, 0]} c="#3f8a35" />
                {[0, 1, 2].map((k) => (
                  <Sp key={k} a={[0.035, 6, 6]} p={[Math.cos(k * 2.1) * 0.12, 0.3 + k * 0.03, Math.sin(k * 2.1) * 0.12]} c="#e03a3a" />
                ))}
              </group>
            ))}
          </group>
          <Door name="puerta balcón izquierda" p={[-0.9, floorY, front]} w={1.0} h={2.05} leaf="#2f7a4f" frame="#d7762c" />
          <Door name="puerta balcón derecha" p={[1.4, floorY, front]} w={1.0} h={2.05} leaf="#2b6cb0" frame="#d7762c" />
          <Window name="ventana alta" p={[-W / 2 + 1.0, floorY + 0.8, front]} w={0.9} h={1.1} color="#c8652f" shutters={false} />
          <Window name="ventana alta lateral" p={[W / 2, floorY + 0.8, 0.9]} r={[0, Math.PI / 2, 0]} w={1.0} h={1.2} />
          <Window name="ventana alta trasera" p={[-1.2, floorY + 0.8, -front]} r={[0, Math.PI, 0]} w={1.0} h={1.2} color="#2f7a4f" />
        </>
      )}

      {/* Farol */}
      <group name="farol" position={[-W / 2 + 2.3, BASE + 2.45, front + 0.1]}>
        <Bx a={[0.06, 0.06, 0.3]} p={[0, 0, 0.1]} c="#2a2a2a" />
        <Bx a={[0.16, 0.22, 0.16]} p={[0, -0.14, 0.28]} c="#2a2a2a" />
        <Bx a={[0.1, 0.14, 0.1]} p={[0, -0.14, 0.28]} c="#ffd27a" m={{ emissive: '#ffb347', emissiveIntensity: 0.8 }} />
      </group>
    </group>
  )
}
