import { useStore } from '../store'
import { MODELS, CATEGORIES } from '../three/models'
import { cn } from '../utils/cn'

export function Sidebar({ onPick }: { onPick?: () => void }) {
  const modelId = useStore((s) => s.modelId)
  const setModel = useStore((s) => s.setModel)
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/95">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Biblioteca de modelos</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">{MODELS.length} elementos · todos descargables</div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-2">
            <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{cat}</div>
            {MODELS.filter((m) => m.category === cat).map((m) => {
              const active = m.id === modelId
              return (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id, m.defaultBg); onPick?.() }}
                  className={cn(
                    'group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    active ? 'bg-emerald-500/10' : 'hover:bg-zinc-900',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-lg',
                      active ? 'border-emerald-500/50 bg-emerald-500/15' : 'border-zinc-800 bg-zinc-900 group-hover:border-zinc-700',
                    )}
                  >
                    {m.icon}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm font-medium', active ? 'text-emerald-300' : 'text-zinc-200')}>{m.name}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{m.variants.length} variante{m.variants.length > 1 ? 's' : ''}</span>
                  </span>
                  {active && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
        Modelos generados proceduralmente en Three.js. Arrastra para orbitar, rueda para acercar, clic derecho para desplazar.
      </div>
    </aside>
  )
}
