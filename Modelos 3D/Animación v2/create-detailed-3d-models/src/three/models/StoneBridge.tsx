import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { Bx, Geo, GeoBuilder, Sp, TEX, rng, rockGeometry, useAnim, useDispose } from '../helpers'

const R = 2.0, LEN = 9.0, WID = 3.2, DECK = 2.75

function archGeometry() {
  const b = new GeoBuilder()
  const block = new THREE.BoxGeometry(0.48, 0.36, WID + 0.14)
  const n = 19
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI
    const rr = R + 0.22
    const key = i === Math.floor(n / 2)
    b.add(block, [Math.cos(a) * rr, 0.8 + Math.sin(a) * rr, 0], [0, 0, a], key ? [1.25, 1.08, 1.02] : 1)
  }
  block.dispose()
  return b.build()
}

function bodyGeometry() {
  const s = new THREE.Shape()
  const ra = R + 0.4
  s.moveTo(-LEN / 2, 0); s.lineTo(-ra, 0); s.lineTo(-ra, 0.8)
  s.absarc(0, 0.8, ra, Math.PI, 0, true)
  s.lineTo(ra, 0); s.lineTo(LEN / 2, 0); s.lineTo(LEN / 2, DECK); s.lineTo(-LEN / 2, DECK); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: WID, bevelEnabled: false, curveSegments: 24 })
  g.translate(0, 0, -WID / 2)
  return g
}

function parapetStones() {
  const r = rng(41)
  const b = new GeoBuilder()
  const box = new THREE.BoxGeometry(1, 1, 1)
  for (const sz of [1, -1]) {
    for (let i = 0; i < 46; i++) {
      const x = -LEN / 2 - 0.1 + r() * (LEN + 0.2)
      const y = DECK + 0.3 + (r() - 0.5) * 0.4
      b.add(box, [x, y, sz * (WID / 2 + 0.15)], [0, 0, 0], [0.25 + r() * 0.3, 0.14 + r() * 0.12, 0.05 + r() * 0.04])
    }
    for (let i = 0; i < 40; i++) {
      const x = -LEN / 2 + r() * LEN
      const y = 0.9 + r() * (DECK - 1.0)
      if (Math.abs(x) < R + 0.6 && y < 2.4) continue
      b.add(box, [x, y, sz * (WID / 2 + 0.02)], [0, 0, 0], [0.3 + r() * 0.35, 0.15 + r() * 0.15, 0.05 + r() * 0.05])
    }
  }
  box.dispose()
  return b.build()
}

export function StoneBridge({ variant = 0 }: { variant?: number }) {
  const arch = useMemo(() => archGeometry(), [])
  const body = useMemo(() => bodyGeometry(), [])
  const stones = useMemo(() => parapetStones(), [])
  const rocks = useMemo(() => {
    const b = new GeoBuilder()
    const r = rng(12)
    for (let i = 0; i < 9; i++) {
      const g = rockGeometry(100 + i, 0.3 + r() * 0.35, 1, 0.7, false)
      b.add(g, [(r() - 0.5) * 3.4, -0.5, (r() - 0.5) * 12], [0, r() * 3, 0])
      g.dispose()
    }
    return b.build()
  }, [])
  useDispose(arch, body, stones, rocks)
  const stoneTex = useMemo(() => TEX.stone([0.6, 0.6]), [])
  const deckTex = useMemo(() => TEX.stone([4, 1.5]), [])
  const water = useMemo(() => TEX.water(), [])
  const waterRef = useRef<THREE.Mesh>(null)
  useAnim((_, dt) => {
    const m = waterRef.current?.material as THREE.MeshStandardMaterial | undefined
    if (m?.map) m.map.offset.y -= dt * 0.08
  })
  const withRiver = variant === 1
  return (
    <group>
      <Geo name="cuerpo del puente" geometry={body} m={{ map: stoneTex, roughness: 0.95 }} c="#a8a49a" />
      <Geo name="arco de dovelas" geometry={arch} c="#8e8b82" m={{ roughness: 0.95, flatShading: true }} />
      <Bx name="tablero" a={[LEN + 0.2, 0.22, WID + 0.1]} p={[0, DECK + 0.1, 0]} m={{ map: deckTex, roughness: 0.95 }} c="#9a968b" />
      <group name="pretiles">
        {[1, -1].map((sz) => (
          <group key={sz}>
            <Bx a={[LEN + 0.2, 0.55, 0.28]} p={[0, DECK + 0.48, sz * (WID / 2 - 0.05)]} m={{ map: stoneTex }} c="#a39f94" />
            <Bx a={[LEN + 0.3, 0.1, 0.36]} p={[0, DECK + 0.8, sz * (WID / 2 - 0.05)]} c="#8c887e" />
          </group>
        ))}
      </group>
      <Geo name="piedras de relieve" geometry={stones} c="#b2ada1" m={{ roughness: 1 }} />
      <group name="estribos">
        {[1, -1].map((sx) => (
          <Bx key={sx} a={[1.1, DECK, WID + 0.5]} p={[sx * (LEN / 2 - 0.1), DECK / 2, 0]} m={{ map: stoneTex }} c="#9d998e" />
        ))}
      </group>
      {withRiver && (
        <group name="río">
          <Bx a={[5.2, 0.4, 16]} p={[0, -0.7, 0]} c="#5b4a36" m={{ map: TEX.dirt() }} />
          {[1, -1].map((sx) => (
            <Bx key={sx} a={[4.5, 0.6, 16]} p={[sx * 4.8, -0.3, 0]} c="#6fa842" m={{ roughness: 1 }} />
          ))}
          <mesh ref={waterRef} position={[0, -0.38, 0]} userData={{ noCap: true }} receiveShadow>
            <boxGeometry args={[4.6, 0.1, 16]} />
            <meshStandardMaterial map={water} color="#5fb7ea" transparent opacity={0.85} roughness={0.15} metalness={0.1} />
          </mesh>
          <Geo geometry={rocks} m={{ vertexColors: true, flatShading: true, roughness: 0.95 }} />
          {[[-1.2, 2], [0.8, -3], [1.6, 5]].map(([x, z], i) => (
            <Sp key={i} a={[0.22, 8, 6]} p={[x, -0.35, z]} s={[1.6, 0.5, 1]} c="#ffffff" m={{ roughness: 1 }} noCap />
          ))}
        </group>
      )}
    </group>
  )
}
