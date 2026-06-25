import { Suspense, lazy } from 'react'
import { INTEGRATION_APPROACHES } from '../constants'
import { approachNotes, approachWarnings, recommendApproach, reconcileIntegrations } from '../logic'
import type { Integration, IntegrationApproach } from '../types'
import type { StageProps } from './stage'
import { AssistBoundary } from './AssistBoundary'
import { Field, StageHeader, TextArea, TextInput, YesNo } from './fields'

// The Integration Copilot is an OPTIONAL assist surface, OFF by default
// (assistAvailable() is false) and code-split into its own lazy chunk.
// StageIntegration reaches it only through this guarded dynamic import behind an
// AssistBoundary, which falls back to a null component if the chunk fails to load.
// It only ever drafts NOTES (and optionally authType); it never writes
// Integration.approach, and the deterministic recommendApproach()/approachWarnings()
// output above stays the authority. v1's Stage-4 form is fully functional and
// offline-safe without it.
type IntegrationCopilotModule = typeof import('../assist/components/IntegrationCopilot')
const IntegrationCopilot = lazy<IntegrationCopilotModule['default']>(() =>
  import('../assist/components/IntegrationCopilot').catch(
    () => ({ default: () => null }) as unknown as IntegrationCopilotModule,
  ),
)

const APPROACH_KEYS = Object.keys(INTEGRATION_APPROACHES) as IntegrationApproach[]

export function StageIntegration({ scope, update }: StageProps) {
  // Display = one row per current system, reconciled on the fly (no effects).
  const rows = reconcileIntegrations(scope)

  const patch = (row: Integration, p: Partial<Integration>) => {
    const next: Integration = { ...row, ...p }
    // Auto-recommend an approach once the answers allow it, and prefill its
    // canonical notes — without clobbering anything the user typed.
    const rec = recommendApproach(next)
    if (next.approach === null && rec !== null) {
      next.approach = rec
      if (!next.notes.trim()) next.notes = approachNotes(rec)
    }
    update((s) => {
      const others = reconcileIntegrations(s).filter((i) => i.systemId !== row.systemId)
      return { ...s, integrations: [...others, next].sort(bySystemOrder(s)) }
    })
  }

  const setApproach = (row: Integration, a: IntegrationApproach) =>
    patch(row, { approach: a, notes: row.notes.trim() ? row.notes : approachNotes(a) })

  if (scope.processMap.systems.length === 0) {
    return (
      <div className="stack" data-enter>
        <StageHeader n={4} title="Integration methodology" blurb="One decision per system from Stage 1." />
        <div className="empty">
          <div className="big">No systems to integrate</div>
          <p className="muted">Add systems back in Stage 1 — they show up here for the integration call.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stack" data-enter>
      <StageHeader n={4} title="Integration methodology" blurb="Answer four questions per system; Seam recommends an approach and surfaces the notes to capture." />

      {rows.map((row) => {
        const rec = recommendApproach(row)
        const warnings = approachWarnings(row)
        return (
          <div key={row.systemId} className="panel stack">
            <div className="panel-head">
              <h2>{row.systemName}</h2>
              {rec && <span className="tag auto"><span className="light green" aria-hidden /> recommended · {INTEGRATION_APPROACHES[rec].label}</span>}
            </div>

            <div className="grid cols-2">
              <Field label="API available?">
                <YesNo value={row.apiAvailable} onChange={(v) => patch(row, { apiAvailable: v })} ariaLabel="API available?" />
              </Field>
              <Field label="Auth type">
                <TextInput value={row.authType} onChange={(v) => patch(row, { authType: v })} placeholder="OAuth / service account / SSO..." />
              </Field>
              <Field label="On-prem?">
                <YesNo value={row.onPrem} onChange={(v) => patch(row, { onPrem: v })} ariaLabel="On-prem?" />
              </Field>
              <Field label="UI stable?">
                <YesNo value={row.uiStable} onChange={(v) => patch(row, { uiStable: v })} ariaLabel="UI stable?" />
              </Field>
            </div>

            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <span className="lbl">Approach</span>
              <div className="grid cols-2">
                {APPROACH_KEYS.map((a) => {
                  const meta = INTEGRATION_APPROACHES[a]
                  const active = row.approach === a
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setApproach(row, a)}
                      className="card clickable"
                      style={{
                        textAlign: 'left',
                        ...(active ? { borderColor: 'var(--color-accent)', boxShadow: 'var(--focal), var(--edge-hi)' } : {}),
                      }}
                    >
                      <div className="row" style={{ gap: 'var(--space-2)' }}>
                        <span className="card-h">{meta.label}</span>
                        {a === rec && <span className="tag auto">recommended</span>}
                      </div>
                      <div className="card-sub" style={{ marginTop: '0.15rem' }}>{meta.tagline}</div>
                    </button>
                  )
                })}
              </div>
              {warnings.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  {warnings.map((w) => (
                    <li key={w} className="caveat row" style={{ gap: '0.4rem', alignItems: 'flex-start' }}>
                      <span aria-hidden>⚠</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Field label="Notes to capture">
              <TextArea value={row.notes} onChange={(v) => patch(row, { notes: v })} placeholder="Auth, idempotency, brittleness, data checks..." rows={2} />
            </Field>

            {/* The copilot accepts notes/authType into the PERSISTED integration by
                id, so it only mounts once this row has been saved (the user has
                answered at least one question). Pass the persisted row so the id
                matches scope.integrations. */}
            {(() => {
              const persisted = scope.integrations.find((i) => i.systemId === row.systemId)
              if (!persisted) return null
              return (
                <AssistBoundary>
                  <Suspense fallback={null}>
                    <IntegrationCopilot integration={persisted} update={update} />
                  </Suspense>
                </AssistBoundary>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}

const bySystemOrder = (s: { processMap: { systems: { id: string }[] } }) => {
  const order = new Map(s.processMap.systems.map((sys, i) => [sys.id, i]))
  return (a: Integration, b: Integration) => (order.get(a.systemId) ?? 0) - (order.get(b.systemId) ?? 0)
}
