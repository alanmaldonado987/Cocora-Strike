import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../utils/cn'

export function Section({ title, icon, children, defaultOpen = true, badge }: { title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-800/80">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/60">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
          {icon && <span className="text-emerald-400">{icon}</span>}
          {title}
          {badge && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-emerald-300">{badge}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  )
}

export function Toggle({ label, value, onChange, hint, accent }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; accent?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm text-zinc-200">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', value ? (accent ?? 'bg-emerald-500') : 'bg-zinc-700')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', value ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format, disabled }: { label?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean }) {
  return (
    <div className={cn('space-y-1', disabled && 'opacity-40')}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-300">{label}</span>
          <span className="font-mono text-zinc-500">{format ? format(value) : value.toFixed(2)}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-emerald-500"
      />
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: React.ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="grid gap-1 rounded-lg bg-zinc-900 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2 font-medium transition-colors',
            size === 'sm' ? 'py-1 text-[11px]' : 'py-1.5 text-xs',
            value === o.value ? 'bg-emerald-500 text-zinc-950 shadow' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Btn({ children, onClick, active, className, title, disabled }: { children: React.ReactNode; onClick?: () => void; active?: boolean; className?: string; title?: string; disabled?: boolean }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800',
        className,
      )}
    >
      {children}
    </button>
  )
}
