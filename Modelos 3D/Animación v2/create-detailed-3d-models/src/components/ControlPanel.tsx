import { useState } from 'react'
import { Move3D, Scissors, Eye, Download, RotateCcw, Camera, Film, Hand, Orbit, Layers, Grid3X3, SunMedium, Box, FileBox, FileCode2, Shapes, Image, Loader2 } from 'lucide-react'
import { useStore, type Axis, type ViewName, type Bg, type MoveMode } from '../store'
import { MODELS } from '../three/models'
import { exportModel, type ExportFormat } from '../three/exporters'
import { Section, Toggle, Slider, Segmented, Btn } from './ui'
import { cn } from '../utils/cn'

const AXIS_META: Record<Axis, { label: string; color: string; ring: string }> = {
  x: { label: 'Corte X (lateral)', color: 'bg-red-500', ring: 'text-red-400' },
  y: { label: 'Corte Y (horizontal)', color: 'bg-green-500', ring: 'text-green-400' },
  z: { label: 'Corte Z (frontal)', color: 'bg-blue-500', ring: 'text-blue-400' },
}
const VIEWS: { v: ViewName; l: string }[] = [
  { v: 'iso', l: 'Isométrica' }, { v: 'frente', l: 'Frente' }, { v: 'atras', l: 'Atrás' },
  { v: 'izquierda', l: 'Izquierda' }, { v: 'derecha', l: 'Derecha' }, { v: 'arriba', l: 'Planta' },
]

export function ControlPanel() {
  const s = useStore()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const def = MODELS.find((m) => m.id === s.modelId) ?? MODELS[0]
  const anyCut = s.cuts.x.enabled || s.cuts.y.enabled || s.cuts.z.enabled

  const doExport = async (format: ExportFormat) => {
    const root = useStore.getState().modelRoot
    if (!root) return
    setBusy(format); setMsg(null)
    try {
      await exportModel(root, format, `cocora-${def.id}-${def.variants[s.variant]?.toLowerCase().replace(/\s+/g, '-') ?? ''}`, useStore.getState().gl)
      setMsg(`Descarga lista: ${format.toUpperCase()}`)
    } catch (e) {
      setMsg(`Error al exportar: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950/95">
      <div className="flex-1 overflow-y-auto">
        {/* Variantes */}
        <Section title="Variante del modelo" icon={<Layers className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap gap-1.5">
            {def.variants.map((v, i) => (
              <Btn key={v} active={s.variant === i} onClick={() => s.setVariant(i)}>{v}</Btn>
            ))}
          </div>
        </Section>

        {/* Movimiento */}
        <Section title="Movimiento" icon={<Move3D className="h-3.5 w-3.5" />}>
          <Segmented<MoveMode>
            value={s.moveMode}
            onChange={(v) => s.set({ moveMode: v })}
            options={[
              { value: 'libre', label: <span className="flex items-center justify-center gap-1"><Hand className="h-3 w-3" />Libre</span>, title: 'Órbita con el ratón' },
              { value: 'giratorio', label: <span className="flex items-center justify-center gap-1"><Orbit className="h-3 w-3" />Giratorio</span>, title: 'El modelo gira sobre sí mismo' },
              { value: 'cine', label: <span className="flex items-center justify-center gap-1"><Film className="h-3 w-3" />Cine</span>, title: 'La cámara recorre el modelo' },
            ]}
          />
          <Slider label="Velocidad de giro" value={s.rotateSpeed} min={0.1} max={3} step={0.05} onChange={(v) => s.set({ rotateSpeed: v })} format={(v) => `${v.toFixed(2)}×`} disabled={s.moveMode === 'libre'} />
          <Toggle label="Animación del modelo" hint="Caminar, aletear, rotor, fuego, flotación…" value={s.animate} onChange={(v) => s.set({ animate: v })} />
          <Slider label="Velocidad de animación" value={s.animSpeed} min={0.1} max={3} step={0.05} onChange={(v) => s.set({ animSpeed: v })} format={(v) => `${v.toFixed(2)}×`} disabled={!s.animate} />
          <Slider label="Vista explosionada (despiece)" value={s.explode} min={0} max={1} step={0.01} onChange={(v) => s.set({ explode: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-300"><Camera className="h-3.5 w-3.5 text-zinc-500" />Vistas de cámara</div>
            <div className="grid grid-cols-3 gap-1.5">
              {VIEWS.map((v) => (
                <Btn key={v.v} active={s.fitRequest.view === v.v} onClick={() => s.requestView(v.v)}>{v.l}</Btn>
              ))}
            </div>
          </div>
        </Section>

        {/* Cortes */}
        <Section title="Cortes / Secciones" icon={<Scissors className="h-3.5 w-3.5" />} badge={anyCut ? 'activo' : undefined}>
          {(['x', 'y', 'z'] as Axis[]).map((axis) => {
            const cut = s.cuts[axis]
            const meta = AXIS_META[axis]
            return (
              <div key={axis} className={cn('rounded-lg border p-2.5 transition-colors', cut.enabled ? 'border-zinc-700 bg-zinc-900/70' : 'border-zinc-800/80')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-zinc-200">
                    <span className={cn('h-2.5 w-2.5 rounded-sm', meta.color)} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      title="Invertir lado del corte"
                      onClick={() => s.setCut(axis, { flip: !cut.flip })}
                      className={cn('rounded border px-1.5 py-0.5 text-[10px] font-mono', cut.flip ? 'border-emerald-500/50 text-emerald-300' : 'border-zinc-700 text-zinc-400 hover:text-zinc-200')}
                    >
                      ⇄
                    </button>
                    <Toggle label="" value={cut.enabled} onChange={(v) => s.setCut(axis, { enabled: v })} />
                  </div>
                </div>
                <div className="mt-2">
                  <Slider value={cut.pos} min={-1} max={1} step={0.005} onChange={(v) => s.setCut(axis, { pos: v, enabled: true })} disabled={s.sweep && cut.enabled} />
                </div>
              </div>
            )
          })}
          <Toggle label="Tapa sólida en el corte" hint="Rellena la sección con color (stencil)" value={s.caps} onChange={(v) => s.set({ caps: v })} />
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-200">Color de la sección</span>
            <input type="color" value={s.capColor} onChange={(e) => s.set({ capColor: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent" />
          </div>
          <Toggle label="Barrido animado" hint="Los cortes activos se mueven solos" value={s.sweep} onChange={(v) => s.set({ sweep: v })} />
          {s.capsLimited && <div className="rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">Modelo muy grande: tapas desactivadas para mantener la fluidez.</div>}
          <div className="grid grid-cols-2 gap-1.5">
            <Btn onClick={() => s.set({ cuts: { x: { enabled: true, pos: 0, flip: false }, y: { enabled: false, pos: 0, flip: false }, z: { enabled: true, pos: 0, flip: false } } })}>Cuarto (X+Z)</Btn>
            <Btn onClick={() => s.set({ cuts: { x: { enabled: false, pos: 0, flip: false }, y: { enabled: true, pos: 0.1, flip: false }, z: { enabled: false, pos: 0, flip: false } } })}>Media altura</Btn>
            <Btn onClick={() => s.set({ cuts: { x: { enabled: false, pos: 0, flip: false }, y: { enabled: false, pos: 0, flip: false }, z: { enabled: true, pos: 0, flip: false } } })}>Perfil central</Btn>
            <Btn onClick={() => s.resetCuts()}><RotateCcw className="h-3 w-3" />Quitar cortes</Btn>
          </div>
        </Section>

        {/* Visual */}
        <Section title="Visualización" icon={<Eye className="h-3.5 w-3.5" />}>
          <div>
            <div className="mb-1.5 text-xs text-zinc-300">Estilo de render</div>
            <Segmented<'toon' | 'pbr'>
              size="sm"
              value={s.style}
              onChange={(v) => s.set({ style: v })}
              options={[{ value: 'toon', label: 'Cel-shading + contorno' }, { value: 'pbr', label: 'PBR realista' }]}
            />
          </div>
          <Toggle label="Malla (wireframe)" value={s.wireframe} onChange={(v) => s.set({ wireframe: v })} />
          <Toggle label="Rejilla de suelo" value={s.grid} onChange={(v) => s.set({ grid: v })} />
          <Toggle label="Sombras" value={s.shadows} onChange={(v) => s.set({ shadows: v })} />
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-300"><SunMedium className="h-3.5 w-3.5 text-zinc-500" />Fondo</div>
            <Segmented<Bg>
              size="sm"
              value={s.bg}
              onChange={(v) => s.set({ bg: v })}
              options={[{ value: 'estudio', label: 'Estudio' }, { value: 'cielo', label: 'Cielo' }, { value: 'oscuro', label: 'Oscuro' }, { value: 'blanco', label: 'Blanco' }]}
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Grid3X3 className="h-3 w-3" />Ejes: gizmo en la esquina inferior derecha del visor.</div>
        </Section>

        {/* Descargar */}
        <Section title="Descargar modelo 3D" icon={<Download className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { f: 'glb' as const, l: 'GLB (binario)', i: <Box className="h-3.5 w-3.5" />, hint: 'Recomendado · texturas incluidas' },
              { f: 'gltf' as const, l: 'GLTF (JSON)', i: <FileCode2 className="h-3.5 w-3.5" />, hint: 'Texto legible · texturas incrustadas' },
              { f: 'obj' as const, l: 'OBJ', i: <FileBox className="h-3.5 w-3.5" />, hint: 'Compatible universal · geometría' },
              { f: 'stl' as const, l: 'STL', i: <Shapes className="h-3.5 w-3.5" />, hint: 'Impresión 3D · geometría' },
            ]).map((o) => (
              <button
                key={o.f}
                disabled={busy !== null}
                onClick={() => doExport(o.f)}
                className="group flex flex-col items-start rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                  {busy === o.f ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> : <span className="text-emerald-400">{o.i}</span>}
                  {o.l}
                </span>
                <span className="mt-0.5 text-[10px] text-zinc-500">{o.hint}</span>
              </button>
            ))}
          </div>
          <Btn onClick={() => doExport('png')} disabled={busy !== null} className="w-full py-2">
            {busy === 'png' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Image className="h-3.5 w-3.5" />}
            Captura PNG de la vista actual
          </Btn>
          {msg && <div className="rounded bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-300">{msg}</div>}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Se exporta el modelo completo con la pose actual y el despiece aplicado. GLB/GLTF conservan colores, texturas y jerarquía de piezas (Blender, Unity, Unreal, Sketchfab, visores web). Los cortes son visuales en el visor.
          </p>
        </Section>
      </div>
    </aside>
  )
}
