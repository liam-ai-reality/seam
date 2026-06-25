import { Suspense, lazy, useMemo, useState } from 'react'
import { generateBrief } from '../brief'
import type { StageKey } from '../constants'
import { isReady, pillarsDone, stageStatuses } from '../logic'
import { exportScope } from '../storage'
import type { StageReadyProps } from './stage'
import { AssistBoundary } from './AssistBoundary'
import { StageHeader, TextArea, Toggle } from './fields'

// The Scope Critic is an OPTIONAL assist surface, OFF by default
// (assistAvailable() is false) and code-split into its own lazy chunk. StageReady
// reaches it only through this guarded dynamic import behind an AssistBoundary,
// which falls back to a null component if the chunk fails to load. The critic is
// ADVISORY only — it never changes isReady() or edits the Scope — and it makes
// zero network calls offline. v1's readiness gate + brief below stay fully
// functional and offline-safe without it.
type CriticPanelModule = typeof import('../assist/components/CriticPanel')
const CriticPanel = lazy<CriticPanelModule['default']>(() =>
  import('../assist/components/CriticPanel').catch(
    () => ({ default: () => null }) as unknown as CriticPanelModule,
  ),
)

export function StageReady({ scope, update, setStage }: StageReadyProps) {
  const statuses = stageStatuses(scope)
  const ready = isReady(scope)
  const brief = useMemo(() => generateBrief(scope), [scope])
  const [copied, setCopied] = useState(false)

  const setPillar = (key: string, patch: { handling?: string; done?: boolean }) =>
    update((s) => ({ ...s, pillars: s.pillars.map((p) => (p.key === key ? { ...p, ...patch } : p)) }))

  const copy = async () => {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const download = () => {
    const blob = new Blob([brief], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scoping-brief.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack" data-enter>
      <StageHeader n={6} title="Reliability pillars & brief" blurb="Complete the four pillars to unlock 'ready to build', then generate the brief." />

      {/* Pillars */}
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {scope.pillars.map((p) => {
          const hasHandling = p.handling.trim().length > 0
          return (
            <div key={p.key} className="card stack" style={{ gap: 'var(--space-3)' }}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <span className="card-h">{p.title}</span>
                    {p.done && <span className="tag auto"><span className="light green" aria-hidden /> done</span>}
                  </div>
                  <div className="card-sub" style={{ marginTop: '0.15rem' }}>{p.description}</div>
                </div>
                <div className="stack" style={{ gap: '0.35rem', alignItems: 'flex-end' }}>
                  <Toggle checked={p.done} onChange={(v) => setPillar(p.key, { done: v })} label="done" disabled={!hasHandling} />
                  {!hasHandling && <span className="fine">Say how it's handled to mark done</span>}
                </div>
              </div>
              <TextArea value={p.handling} onChange={(v) => setPillar(p.key, { handling: v })} placeholder="How this deployment handles it" rows={2} />
            </div>
          )
        })}
      </div>

      {/* Readiness gate */}
      <div className="panel" style={ready ? { borderColor: 'color-mix(in oklch, var(--color-accent-3) 50%, var(--line))' } : undefined}>
        <div className="panel-head">
          <h2 className="row" style={{ gap: 'var(--space-2)' }}>
            <span className={`light ${ready ? 'green' : 'red'}`} aria-hidden />
            {ready ? 'Ready to build' : 'Not ready'}
          </h2>
        </div>
        <ul className="grid cols-2" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 'var(--space-2)' }}>
          {statuses.map((st) =>
            st.complete ? (
              <li key={st.key} className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="tag auto">✓</span>
                <span className="muted">{st.label}</span>
              </li>
            ) : (
              <li key={st.key}>
                <button
                  type="button"
                  onClick={() => setStage(st.key as StageKey)}
                  title={st.hint}
                  className="card clickable"
                  style={{ width: '100%', textAlign: 'left', padding: 'var(--space-3)' }}
                >
                  <div className="row" style={{ gap: 'var(--space-2)' }}>
                    <span className="tag neutral">○</span>
                    <span className="card-h" style={{ color: 'var(--color-accent)' }}>{st.label}</span>
                  </div>
                  <div className="card-sub" style={{ marginTop: '0.15rem' }}>{st.hint}</div>
                </button>
              </li>
            ),
          )}
          <li className="row" style={{ gap: 'var(--space-2)' }}>
            <span className={`tag ${pillarsDone(scope) ? 'auto' : 'neutral'}`}>{pillarsDone(scope) ? '✓' : '○'}</span>
            <span className="muted">All four pillars done</span>
          </li>
        </ul>
      </div>

      {/* Critic findings — NON-BLOCKING, advisory, beside the readiness gate.
          Never changes readiness; only navigates (setStage) and dismisses. */}
      <AssistBoundary>
        <Suspense fallback={null}>
          <CriticPanel scope={scope} setStage={setStage} />
        </Suspense>
      </AssistBoundary>

      {/* Brief output */}
      <div className="panel">
        <div className="panel-head no-print">
          <h2>Scoping brief</h2>
          <div className="btn-row">
            <button onClick={copy} className="btn ghost sm">{copied ? 'Copied ✓' : 'Copy'}</button>
            <button onClick={download} className="btn ghost sm">Download .md</button>
            <button onClick={() => window.print()} className="btn ghost sm">Print</button>
            <button onClick={() => exportScope(scope)} className="btn ghost sm">Export JSON</button>
          </div>
        </div>
        <pre
          className="print-brief code"
          style={{
            maxHeight: '28rem',
            overflow: 'auto',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--line)',
            background: 'var(--surface-0)',
            padding: 'var(--space-4)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {brief}
        </pre>
      </div>
    </div>
  )
}
