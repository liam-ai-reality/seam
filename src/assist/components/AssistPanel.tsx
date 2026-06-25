// Shared assist affordance (#17, reusable infra). A single button + panel that
// drives the universal assist lifecycle — idle → loading → error → result — for
// ANY assist task, gated on assistAvailable(). It owns NONE of a task's domain
// logic: the caller supplies a `run` thunk and renders the result via children.
// This is the shared piece the task copilots reuse instead of each re-inventing
// loading/error/gate handling. Carries the cyan .tag.assist badge so AI surfaces
// are visually distinct.
//
// It NEVER writes anything itself: "accept"/"dismiss" of a Sourced<T> draft is
// the caller's concern (via accept.ts → existing shapers). This component only
// manages async state + the gate, and renders the cyan AI affordance.

import { useState, type ReactNode } from 'react'
import { assistAvailable } from '../gate'

export type AssistPhase<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: T }

export interface AssistButtonProps {
  /** Button label when idle. */
  label: string
  /** Label while running. Defaults to 'Working…'. */
  loadingLabel?: string
  /** Click handler; the panel manages disabled/aria-busy around it. */
  onClick: () => void
  /** True while the async work is in flight. */
  busy: boolean
  /** Extra disable condition (e.g. nothing to run on yet). */
  disabled?: boolean
}

/**
 * The cyan assist trigger. Disabled (with an explanatory note) when assist is
 * off, so the gate is visible in the UI, not just enforced in code.
 */
export function AssistButton({ label, loadingLabel = 'Working…', onClick, busy, disabled }: AssistButtonProps) {
  const available = assistAvailable()
  return (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      <button
        type="button"
        className="btn ghost sm"
        onClick={onClick}
        disabled={busy || disabled || !available}
        aria-busy={busy}
      >
        <span className="tag assist" aria-hidden style={{ pointerEvents: 'none' }}>AI</span>
        {busy ? loadingLabel : label}
      </button>
      {!available && <span className="fine">Enable assist (seam.assist) to use this</span>}
    </div>
  )
}

export interface AssistPanelProps<T> {
  /** Panel heading. */
  title: string
  /** Sub-line under the heading. */
  blurb?: string
  /** The async task to run when the button is clicked. Resolves the result. */
  run: () => Promise<T>
  /** Idle button label. */
  buttonLabel: string
  loadingLabel?: string
  /** Disable the trigger (beyond the gate / busy state). */
  disabled?: boolean
  /** Render the result. Receives a `dismiss` to clear back to idle. */
  children: (result: T, dismiss: () => void) => ReactNode
}

/**
 * A self-contained assist panel: a cyan trigger that runs `run`, manages the
 * loading/error/result phases, and hands the result to `children` to render.
 * Errors (including the gate's "assist disabled" throw) surface as a dismissible
 * toast. Reusable across tasks (critic, future copilots).
 */
export function AssistPanel<T>({
  title,
  blurb,
  run,
  buttonLabel,
  loadingLabel,
  disabled,
  children,
}: AssistPanelProps<T>) {
  const [phase, setPhase] = useState<AssistPhase<T>>({ kind: 'idle' })

  const start = async () => {
    setPhase({ kind: 'loading' })
    try {
      const result = await run()
      setPhase({ kind: 'result', result })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Assist failed.' })
    }
  }
  const dismiss = () => setPhase({ kind: 'idle' })

  return (
    <div className="panel no-print">
      <div className="panel-head">
        <h2 className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="tag assist">AI</span>
          {title}
        </h2>
        <AssistButton
          label={buttonLabel}
          loadingLabel={loadingLabel}
          onClick={start}
          busy={phase.kind === 'loading'}
          disabled={disabled}
        />
      </div>
      {blurb && <p className="card-sub" style={{ marginTop: 0 }}>{blurb}</p>}

      {phase.kind === 'error' && (
        <div role="status" className="toast alert" style={{ position: 'static', maxWidth: 'none' }}>
          <span style={{ flex: 1 }}>{phase.message}</span>
          <button type="button" onClick={dismiss} className="btn ghost sm" aria-label="Dismiss">✕</button>
        </div>
      )}

      {phase.kind === 'result' && children(phase.result, dismiss)}
    </div>
  )
}
