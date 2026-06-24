import type { ReactNode } from 'react'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <div className="label-row">
        <span>{label}</span>
        {hint && <span className="fine">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function TextInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <input
        value={props.value}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
}

export function TextArea(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <textarea
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
}

/** 1–5 score selector. */
export function Pills({ value, onChange, ariaLabel }: { value: number; onChange: (v: number) => void; ariaLabel?: string }) {
  return (
    <div className="pill-row" role="group" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`pill${value === n ? ' on' : ''}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Tri-state yes / no toggle (null = unanswered). */
export function YesNo({ value, onChange, ariaLabel }: { value: boolean | null; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <div className="pill-row" role="group" aria-label={ariaLabel}>
      {([['Yes', true], ['No', false]] as const).map(([label, v]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`pill${value === v ? ' on' : ''}`}
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
      aria-pressed={checked}
      className={`pill box${checked ? ' on mint' : ''}`}
    >
      <span className="tick">{checked ? '✓' : ''}</span>
      {label}
    </button>
  )
}

export function StageHeader({ n, title, blurb }: { n: number; title: string; blurb: string }) {
  return (
    <div className="view-head">
      <span className="eyebrow">Stage {n}</span>
      <h1>{title}</h1>
      <p>{blurb}</p>
    </div>
  )
}
