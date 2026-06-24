import { useEffect, useRef } from 'react'
import { STAGES, type StageKey } from '../constants'
import { isReady, stageStatuses } from '../logic'
import type { Scope } from '../types'
import { StageProcess } from './StageProcess'
import { StageSeam } from './StageSeam'
import { StageSop } from './StageSop'
import { StageIntegration } from './StageIntegration'
import { StageEval } from './StageEval'
import { StageReady } from './StageReady'

interface Props {
  scope: Scope
  update: (fn: (s: Scope) => Scope) => void
  stage: StageKey
  setStage: (k: StageKey) => void
  onBack: () => void
}

export function Stepper({ scope, update, stage, setStage, onBack }: Props) {
  const idx = STAGES.findIndex((s) => s.key === stage)
  const statuses = stageStatuses(scope)
  const ready = isReady(scope)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Reveal the current stage's [data-enter] content. Done synchronously after
  // paint (not via rAF, which hidden tabs throttle) so the static .in end-state
  // applies even when the tab is backgrounded — content can never stay invisible.
  useEffect(() => {
    bodyRef.current?.querySelectorAll('[data-enter]').forEach((el) => el.classList.add('in'))
  }, [stage])

  const go = (delta: number) => {
    const next = STAGES[idx + delta]
    if (next) setStage(next.key)
  }

  // Keyboard: Alt+← / Alt+→ to move between stages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stageComplete = (key: string) =>
    key === 'ready' ? ready : (statuses.find((s) => s.key === key)?.complete ?? false)

  return (
    <div className="wrap stack" style={{ minHeight: 'calc(100dvh - var(--topbar-h))' }}>
      {/* top bar */}
      <div className="no-print row" style={{ marginBottom: 0 }}>
        <button onClick={onBack} className="btn ghost sm">← Scopes</button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--color-ink)', fontSize: '1.15rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {scope.name}
        </h1>
        {ready && <span className="tag auto"><span className="light green" aria-hidden /> ready</span>}
      </div>

      {/* progress indicator */}
      <nav className="no-print steps" aria-label="Scoping stages" style={{ marginBottom: 0 }}>
        {STAGES.map((s, i) => {
          const active = s.key === stage
          const done = stageComplete(s.key)
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              aria-current={active ? 'step' : undefined}
              className={`s${active ? ' active' : ''}${done && !active ? ' done' : ''}`}
            >
              <span className="ix">{done ? '✓' : i + 1}</span>
              {s.label}
            </button>
          )
        })}
      </nav>

      {/* active stage */}
      <div ref={bodyRef} style={{ flex: 1 }}>
        {stage === 'process' && <StageProcess scope={scope} update={update} />}
        {stage === 'seam' && <StageSeam scope={scope} update={update} />}
        {stage === 'sop' && <StageSop scope={scope} update={update} />}
        {stage === 'integration' && <StageIntegration scope={scope} update={update} />}
        {stage === 'eval' && <StageEval scope={scope} update={update} />}
        {stage === 'ready' && <StageReady scope={scope} update={update} setStage={setStage} />}
      </div>

      {/* prev / next */}
      <div className="no-print spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        <button onClick={() => go(-1)} disabled={idx === 0} className="btn ghost">← Prev</button>
        <span className="fine">Alt + ← → to move · {idx + 1} / {STAGES.length}</span>
        <button onClick={() => go(1)} disabled={idx === STAGES.length - 1} className="btn ghost">Next →</button>
      </div>
    </div>
  )
}
