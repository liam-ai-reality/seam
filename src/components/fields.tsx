import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">{label}</span>
        {hint && <span className="text-xs text-slate-600">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/70 focus:ring-1 focus:ring-cyan-500/30'

export function TextInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      className={inputCls}
      value={props.value}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

export function TextArea(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      className={`${inputCls} resize-y leading-relaxed`}
      rows={props.rows ?? 3}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

/** 1–5 score selector. */
export function Pills({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 w-8 rounded-md border text-sm tabular-nums transition ${
            value === n
              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
              : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Tri-state yes / no toggle (null = unanswered). */
export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-1">
      {([['Yes', true], ['No', false]] as const).map(([label, v]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md border px-3 py-1 text-xs transition ${
            value === v
              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
              : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition ${
        disabled ? 'cursor-not-allowed border-slate-800 text-slate-600 opacity-50' : checked ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300' : 'border-slate-800 text-slate-500 hover:border-slate-700'
      }`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded-sm border ${checked ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-600'}`}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

export function StageHeader({ n, title, blurb }: { n: number; title: string; blurb: string }) {
  return (
    <div className="mb-5 border-b border-slate-800 pb-3">
      <div className="font-mono text-xs uppercase tracking-widest text-cyan-500/80">Stage {n}</div>
      <h2 className="mt-1 text-lg font-semibold text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{blurb}</p>
    </div>
  )
}
