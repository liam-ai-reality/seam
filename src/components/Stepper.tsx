import { useEffect } from 'react'
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-6">
      {/* top bar */}
      <div className="no-print mb-4 flex items-center gap-3">
        <button onClick={onBack} className="rounded-md border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-slate-600">← Scopes</button>
        <h1 className="truncate text-base font-semibold text-slate-100">{scope.name}</h1>
        {ready && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">ready</span>}
      </div>

      {/* progress indicator */}
      <nav className="no-print mb-6 flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => {
          const active = s.key === stage
          const done = stageComplete(s.key)
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition ${
                active ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${done ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                {done ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          )
        })}
      </nav>

      {/* active stage */}
      <div className="flex-1">
        {stage === 'process' && <StageProcess scope={scope} update={update} />}
        {stage === 'seam' && <StageSeam scope={scope} update={update} />}
        {stage === 'sop' && <StageSop scope={scope} update={update} />}
        {stage === 'integration' && <StageIntegration scope={scope} update={update} />}
        {stage === 'eval' && <StageEval scope={scope} update={update} />}
        {stage === 'ready' && <StageReady scope={scope} update={update} setStage={setStage} />}
      </div>

      {/* prev / next */}
      <div className="no-print mt-8 flex items-center justify-between border-t border-slate-800 pt-4">
        <button onClick={() => go(-1)} disabled={idx === 0} className="rounded-md border border-slate-800 px-4 py-2 text-sm text-slate-300 disabled:opacity-30 enabled:hover:border-slate-600">
          ← Prev
        </button>
        <span className="font-mono text-xs text-slate-600">Alt + ← → to move · {idx + 1} / {STAGES.length}</span>
        <button onClick={() => go(1)} disabled={idx === STAGES.length - 1} className="rounded-md border border-slate-800 px-4 py-2 text-sm text-slate-300 disabled:opacity-30 enabled:hover:border-cyan-500/60">
          Next →
        </button>
      </div>
    </div>
  )
}
