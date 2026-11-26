import { useState } from 'react'
import { Gamepad2, Box } from 'lucide-react'
import { GameView } from './game/GameView'
import { HUD } from './game/HUD'
import { resetRuntime, useGame } from './game/core'
import { resetFx } from './game/fx'
import { PanelLeft, SlidersHorizontal, Triangle, Boxes, Layers3, Mountain, X } from 'lucide-react'
import { Viewer } from './three/Viewer'
import { Sidebar } from './components/Sidebar'
import { ControlPanel } from './components/ControlPanel'
import { useStore } from './store'
import { MODELS } from './three/models'
import { cn } from './utils/cn'

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`
}

function ModeSwitch() {
  const mode = useStore((s) => s.mode)
  const set = (m: 'visor' | 'juego') => {
    if (m === 'juego') { resetRuntime(); resetFx(); useGame.getState().reset() }
    if (m === 'visor' && document.pointerLockElement) document.exitPointerLock()
    useStore.setState({ mode: m })
  }
  return (
    <div className="flex rounded-lg bg-zinc-900 p-0.5 text-xs font-semibold">
      <button onClick={() => set('visor')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5', mode === 'visor' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100')}><Box className="h-3.5 w-3.5" />Visor 3D</button>
      <button onClick={() => set('juego')} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5', mode === 'juego' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100')}><Gamepad2 className="h-3.5 w-3.5" />Modo juego</button>
    </div>
  )
}

function TopBar({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
  const stats = useStore((s) => s.stats)
  const mode = useStore((s) => s.mode)
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 sm:px-4">
      <button onClick={onLeft} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 lg:hidden" aria-label="Modelos">
        <PanelLeft className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-green-700 shadow-lg shadow-emerald-900/40">
          <Mountain className="h-4.5 w-4.5 text-zinc-950" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-wide text-zinc-100">COCORA <span className="font-light text-emerald-400">3D</span></div>
          <div className="hidden text-[11px] text-zinc-500 sm:block">Taller de modelos del Valle de Cocora · visor, cortes y descarga</div>
        </div>
      </div>
      <div className="ml-auto sm:ml-6"><ModeSwitch /></div>
      <div className={cn('ml-auto hidden items-center gap-4 text-[11px] text-zinc-400', mode === 'visor' && 'md:flex')}>
        <span className="flex items-center gap-1.5"><Triangle className="h-3.5 w-3.5 text-emerald-400" />{fmt(stats.tris)} triángulos</span>
        <span className="flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5 text-emerald-400" />{stats.meshes} mallas</span>
        <span className="flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5 text-emerald-400" />{stats.parts} piezas</span>
      </div>
      <button onClick={onRight} className={cn('rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 lg:hidden', mode === 'juego' && 'invisible')} aria-label="Controles">
        <SlidersHorizontal className="h-5 w-5" />
      </button>
    </header>
  )
}

function InfoOverlay() {
  const modelId = useStore((s) => s.modelId)
  const variant = useStore((s) => s.variant)
  const setVariant = useStore((s) => s.setVariant)
  const moveMode = useStore((s) => s.moveMode)
  const def = MODELS.find((m) => m.id === modelId) ?? MODELS[0]
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 sm:left-4 sm:top-4">
        <span className="rounded-md bg-zinc-950/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300 backdrop-blur">{def.category}</span>
        <span className="rounded-md bg-zinc-950/70 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400 backdrop-blur">
          {moveMode === 'libre' ? 'Órbita libre' : moveMode === 'giratorio' ? 'Tornamesa' : 'Cámara cinematográfica'}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md">
        <div className="pointer-events-auto rounded-xl border border-zinc-800/80 bg-zinc-950/75 p-3.5 shadow-xl backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-xl">{def.icon}</span>
            <div className="min-w-0">
              <div className="text-base font-semibold text-zinc-100">{def.name}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{def.desc}</p>
            </div>
          </div>
          {def.variants.length > 1 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {def.variants.map((v, i) => (
                <button
                  key={v}
                  onClick={() => setVariant(i)}
                  className={cn('rounded-full border px-2.5 py-0.5 text-[11px] transition-colors', i === variant ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200')}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function GameMode() {
  const [runId, setRunId] = useState(1)
  const restart = () => { resetRuntime(); resetFx(); useGame.getState().reset(); setRunId((r) => r + 1) }
  return (
    <main className="relative min-w-0 flex-1 bg-zinc-900">
      <GameView runId={runId} />
      <HUD onRestart={restart} />
    </main>
  )
}

export default function App() {
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const mode = useStore((s) => s.mode)
  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <TopBar onLeft={() => setLeft(true)} onRight={() => setRight(true)} />
      {mode === 'juego' ? (
        <div className="flex min-h-0 flex-1"><GameMode /></div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="hidden lg:flex"><Sidebar /></div>
          <main className="relative min-w-0 flex-1 bg-zinc-900">
            <Viewer />
            <InfoOverlay />
          </main>
          <div className="hidden lg:flex"><ControlPanel /></div>
        </div>
      )}

      {/* Cajones móviles */}
      {left && mode === 'visor' && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="relative h-full"><Sidebar onPick={() => setLeft(false)} /></div>
          <button className="flex-1 bg-black/60" onClick={() => setLeft(false)} aria-label="Cerrar" />
          <button onClick={() => setLeft(false)} className="absolute right-3 top-3 rounded-full bg-zinc-900 p-2 text-zinc-300"><X className="h-4 w-4" /></button>
        </div>
      )}
      {right && mode === 'visor' && (
        <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
          <button className="flex-1 bg-black/60" onClick={() => setRight(false)} aria-label="Cerrar" />
          <div className="relative h-full"><ControlPanel /></div>
          <button onClick={() => setRight(false)} className="absolute left-3 top-3 rounded-full bg-zinc-900 p-2 text-zinc-300"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  )
}
