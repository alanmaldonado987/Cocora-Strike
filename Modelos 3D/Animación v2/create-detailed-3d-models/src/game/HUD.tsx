import { useEffect, useMemo, useRef } from 'react'
import { Volume2, VolumeX, Cross, Wind, Skull, Trophy } from 'lucide-react'
import { ZONE, useGame } from './core'
import { LAYOUT, SIZE, riverX, pathX, terrainHeight, CRATER } from '../three/models/FullScene'
import { cn } from '../utils/cn'

const FONT = { fontFamily: '"Oswald","Bebas Neue","Roboto Condensed","Arial Narrow",Impact,sans-serif', fontStretch: 'condensed' as const }
const MAP_PX = 150

/* Silueta del AK-47 (SVG) */
function AkSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 70" className={className} fill="currentColor">
      <path d="M4 22 L58 18 L64 14 L150 14 L152 10 L160 10 L160 14 L196 14 L196 12 L214 12 L214 18 L196 18 L196 21 L150 22 L146 30 L118 30 L120 34 L112 66 L96 66 L100 36 L92 30 L84 30 L78 48 L66 48 L70 30 L60 30 L10 44 L4 40 Z" />
    </svg>
  )
}

function useBaseMap() {
  return useMemo(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = MAP_PX
    const c = cv.getContext('2d')
    if (!c) return cv
    const img = c.createImageData(MAP_PX, MAP_PX)
    for (let j = 0; j < MAP_PX; j++) for (let i = 0; i < MAP_PX; i++) {
      const x = (i / MAP_PX - 0.5) * SIZE, z = (j / MAP_PX - 0.5) * SIZE
      const h = terrainHeight(x, z)
      let r = 70 + h * 6, g = 140 + h * 7, b = 50
      const n = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 10
      r += n; g += n
      if (Math.abs(x - pathX(z)) < 1.2 && z > -16) { r = 190; g = 160; b = 110 }
      if (Math.abs(x - riverX(z)) < 2.2) { r = 80; g = 170; b = 225 }
      if (Math.hypot(x - CRATER.x, z - CRATER.z) < 3) { r = 60; g = 52; b = 45 }
      const k = (j * MAP_PX + i) * 4
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255
    }
    c.putImageData(img, 0, 0)
    const toPx = (v: number) => (v / SIZE + 0.5) * MAP_PX
    c.fillStyle = '#c0663a'
    for (const h of LAYOUT.houses) { c.save(); c.translate(toPx(h.x), toPx(h.z)); c.rotate(-h.rot); c.fillRect(-9, -7, 18, 14); c.restore() }
    c.fillStyle = '#f4f1e8'; c.save(); c.translate(toPx(LAYOUT.sign.x), toPx(LAYOUT.sign.z)); c.fillRect(-14, -2, 28, 4); c.restore()
    return cv
  }, [])
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const base = useBaseMap()
  useEffect(() => {
    let raf = 0, last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 100) return
      last = now
      const c = ref.current?.getContext('2d')
      if (!c) return
      const G = useGame.getState()
      const toPx = (v: number) => (v / SIZE + 0.5) * MAP_PX
      c.clearRect(0, 0, MAP_PX, MAP_PX)
      c.fillStyle = '#7a3aa6'; c.fillRect(0, 0, MAP_PX, MAP_PX)
      c.save(); c.beginPath(); c.arc(MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.45, 0, Math.PI * 2); c.clip()
      c.drawImage(base, 0, 0)
      // tormenta: púrpura fuera de la zona segura
      c.fillStyle = 'rgba(138,61,194,0.55)'
      c.beginPath(); c.rect(0, 0, MAP_PX, MAP_PX); c.arc(toPx(ZONE.cx), toPx(ZONE.cz), (G.zoneR / SIZE) * MAP_PX, 0, Math.PI * 2, true); c.fill('evenodd')
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.5
      c.beginPath(); c.arc(toPx(ZONE.cx), toPx(ZONE.cz), (G.zoneR / SIZE) * MAP_PX, 0, Math.PI * 2); c.stroke()
      c.fillStyle = '#ff4d4d'
      for (const b of G.bears) if (b.alive && Math.hypot(b.x - G.px, b.z - G.pz) < 22) { c.beginPath(); c.arc(toPx(b.x), toPx(b.z), 2.5, 0, Math.PI * 2); c.fill() }
      c.restore()
      // flecha del jugador
      c.save(); c.translate(toPx(G.px), toPx(G.pz)); c.rotate(-G.yaw + Math.PI)
      c.fillStyle = '#ffffff'; c.strokeStyle = '#111'; c.lineWidth = 1.2
      c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke()
      c.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [base])
  return <canvas ref={ref} width={MAP_PX} height={MAP_PX} className="block h-[150px] w-[150px] rounded-sm border-2 border-zinc-900/70 shadow-lg" />
}

function Counters({ small }: { small?: boolean }) {
  const alive = useGame((s) => s.alive), kills = useGame((s) => s.kills)
  const cls = cn('rounded-md bg-zinc-900/75 px-3 text-zinc-100 shadow', small ? 'py-1 text-lg' : 'py-1.5 text-2xl')
  return (
    <div className="flex gap-1.5" style={FONT}>
      <span className={cls}>VIVOS: {alive}</span>
      <span className={cls}>BAJAS: {kills}</span>
    </div>
  )
}

export function HUD({ onRestart }: { onRestart: () => void }) {
  const G = useGame()
  const prompt = G.prompt ? G.prompt.split('|') : null
  const lock = () => {
    const el = document.querySelector('#game-root canvas') as HTMLCanvasElement | null
    try { (el?.requestPointerLock?.() as unknown as Promise<void> | undefined)?.catch?.(() => {}) } catch { /* sin pointer lock: mirar con clic derecho */ }
    G.set({ phase: 'playing' })
  }
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white" style={FONT}>
      {/* Superior izquierda */}
      <div className="absolute left-3 top-3 space-y-2">
        <Minimap />
        <Counters small />
      </div>
      {/* Superior derecha */}
      <div className="absolute right-3 top-3 flex items-start gap-2">
        <Counters />
        <button className="pointer-events-auto rounded-md bg-zinc-900/75 p-2 text-zinc-100 hover:bg-zinc-800" onClick={() => G.set({ audio: !G.audio })} aria-label="Audio">
          {G.audio ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
      </div>
      {/* Feed */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 space-y-1 text-center text-sm">
        {G.feed.slice(-3).map((f, i) => <div key={i} className="rounded bg-zinc-900/60 px-2 py-0.5 tracking-wide">{f}</div>)}
      </div>
      {/* Mira */}
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute left-1/2 top-0 h-3 w-[2px] -translate-x-1/2 bg-white shadow" />
        <span className="absolute bottom-0 left-1/2 h-3 w-[2px] -translate-x-1/2 bg-white shadow" />
        <span className="absolute left-0 top-1/2 h-[2px] w-3 -translate-y-1/2 bg-white shadow" />
        <span className="absolute right-0 top-1/2 h-[2px] w-3 -translate-y-1/2 bg-white shadow" />
        <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
      {/* Paracaídas / altitud */}
      {G.chute !== 'none' && G.phase === 'playing' && (
        <div className="absolute left-1/2 top-[18%] -translate-x-1/2 rounded-md bg-zinc-900/70 px-4 py-1.5 text-center text-xl tracking-wide">
          <Wind className="mr-2 inline h-5 w-5 text-sky-300" />{G.chute === 'open' ? 'PARACAÍDAS ABIERTO' : 'CAÍDA LIBRE'} · {Math.round(G.altitude)} m
        </div>
      )}
      {G.inStorm && G.phase === 'playing' && <div className="absolute left-1/2 top-[26%] -translate-x-1/2 animate-pulse rounded bg-purple-900/80 px-4 py-1 text-lg">¡ESTÁS EN LA TORMENTA! VUELVE A LA ZONA</div>}
      {/* Centro inferior: aviso + salud */}
      <div className="absolute bottom-4 left-1/2 flex w-[min(640px,60vw)] -translate-x-1/2 flex-col items-center gap-3">
        {(G.heal >= 0 || G.reload >= 0) && (
          <div className="w-56 rounded bg-zinc-900/75 px-3 py-1 text-center text-base">
            {G.heal >= 0 ? 'CURÁNDOSE…' : 'RECARGANDO…'}
            <div className="mt-1 h-1.5 rounded bg-zinc-700"><div className={cn('h-full rounded', G.heal >= 0 ? 'bg-green-400' : 'bg-amber-300')} style={{ width: `${Math.min(1, Math.max(G.heal, G.reload)) * 100}%` }} /></div>
          </div>
        )}
        {prompt && (
          <div className="rounded-md bg-zinc-900/80 px-4 py-1.5 text-2xl tracking-wide shadow-lg">
            <span className="text-yellow-300">[{prompt[1] ?? 'E'}]</span> {prompt[0]}
          </div>
        )}
        <div className="flex w-full items-center gap-2 rounded-md bg-zinc-900/80 p-1.5 shadow-lg">
          <span className="px-2 text-2xl">SALUD</span>
          <div className="relative h-8 flex-1 overflow-hidden rounded-sm bg-zinc-800">
            <div className="h-full bg-gradient-to-b from-green-400 to-green-600 transition-[width] duration-200" style={{ width: `${G.hp}%` }} />
            <span className="absolute inset-0 flex items-center justify-center text-2xl drop-shadow">{Math.ceil(G.hp)}/100</span>
          </div>
          <span className="flex items-center gap-1 px-2 text-xl text-green-300" title="Botiquines (H para curar)"><Cross className="h-5 w-5" />{G.medkits}</span>
        </div>
      </div>
      {/* Inferior derecha: arma */}
      <div className="absolute bottom-4 right-4 text-right">
        <div className="mb-1 text-2xl tracking-wide drop-shadow">FUSIL ANDINO AK-47</div>
        <div className="flex items-center gap-4 rounded-lg border border-white/25 bg-zinc-900/70 px-4 py-2 shadow-lg">
          <div className="w-40">
            <AkSilhouette className="h-12 w-40 text-white" />
            <div className="mt-1 h-1.5 rounded bg-zinc-700"><div className="h-full rounded bg-white" style={{ width: `${(G.ammo / 30) * 100}%` }} /></div>
          </div>
          <div className="h-14 w-px bg-white/30" />
          <div className="leading-none"><span className="text-6xl">{G.ammo}</span><span className="text-3xl text-zinc-300">/{G.reserve}</span></div>
        </div>
      </div>
      {/* Daño */}
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${120 * G.hurt}px ${40 * G.hurt}px rgba(200,20,20,${0.6 * G.hurt})` }} />
      {/* Menús */}
      {(G.phase === 'menu' || G.phase === 'paused') && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm">
          <div className="w-[min(560px,92vw)] rounded-2xl border border-white/15 bg-zinc-900/90 p-6 text-center shadow-2xl">
            <div className="text-5xl tracking-wider">COCORA <span className="text-emerald-400">ROYALE</span></div>
            <p className="mt-1 font-sans text-sm text-zinc-400">Salto desde el avión a {195} m · Valle del Cocora</p>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-left font-sans text-sm text-zinc-300">
              {[['Ratón', 'Mirar / disparar (clic)'], ['Clic derecho', 'Apuntar'], ['W A S D', 'Moverse'], ['Shift + W', 'Correr'], ['Espacio', 'Saltar · paracaídas · vaulting al correr'], ['C / Ctrl', 'Derrape al correr'], ['H', 'Curarse (2 s)'], ['E', 'Recoger'], ['R', 'Recargar'], ['Esc', 'Pausa']].map(([k, v]) => (
                <div key={k} className="flex gap-2"><span className="w-24 shrink-0 rounded bg-zinc-800 px-1.5 text-center font-mono text-xs leading-5 text-yellow-300">{k}</span><span>{v}</span></div>
              ))}
            </div>
            <p className="mt-4 font-sans text-xs text-zinc-500">Si el navegador bloquea el puntero, mantén pulsado el clic derecho para mirar.</p>
            <button onClick={lock} className="mt-3 rounded-lg bg-emerald-500 px-8 py-2.5 text-2xl tracking-wide text-zinc-950 hover:bg-emerald-400">
              {G.phase === 'menu' ? 'SALTAR DEL AVIÓN' : 'CONTINUAR'}
            </button>
          </div>
        </div>
      )}
      {(G.phase === 'dead' || G.phase === 'won') && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-zinc-950/70">
          <div className="rounded-2xl border border-white/15 bg-zinc-900/90 px-10 py-6 text-center shadow-2xl">
            {G.phase === 'dead' ? <Skull className="mx-auto h-12 w-12 text-red-400" /> : <Trophy className="mx-auto h-12 w-12 text-yellow-300" />}
            <div className="mt-2 text-5xl tracking-wider">{G.phase === 'dead' ? 'ELIMINADO' : '¡ÚLTIMO EN PIE!'}</div>
            <div className="mt-1 text-xl text-zinc-300">BAJAS: {G.kills} · VIVOS: {G.alive}</div>
            <button onClick={onRestart} className="mt-5 rounded-lg bg-emerald-500 px-8 py-2 text-2xl text-zinc-950 hover:bg-emerald-400">JUGAR DE NUEVO</button>
          </div>
        </div>
      )}
    </div>
  )
}
