import { INTEGRATION_APPROACHES } from '../constants'
import { approachNotes, recommendApproach, reconcileIntegrations } from '../logic'
import type { Integration, IntegrationApproach } from '../types'
import type { StageProps } from './stage'
import { Field, StageHeader, TextArea, TextInput, YesNo } from './fields'

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
      <div className="space-y-5">
        <StageHeader n={4} title="Integration methodology" blurb="One decision per system from Stage 1." />
        <p className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-600">
          Add systems back in Stage 1 — they show up here for the integration call.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <StageHeader n={4} title="Integration methodology" blurb="Answer four questions per system; Seam recommends an approach and surfaces the notes to capture." />

      {rows.map((row) => {
        const rec = recommendApproach(row)
        return (
          <div key={row.systemId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-3 font-semibold text-slate-100">{row.systemName}</h3>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="API available?">
                <YesNo value={row.apiAvailable} onChange={(v) => patch(row, { apiAvailable: v })} />
              </Field>
              <Field label="Auth type">
                <TextInput value={row.authType} onChange={(v) => patch(row, { authType: v })} placeholder="OAuth / service account / SSO..." />
              </Field>
              <Field label="On-prem?">
                <YesNo value={row.onPrem} onChange={(v) => patch(row, { onPrem: v })} />
              </Field>
              <Field label="UI stable?">
                <YesNo value={row.uiStable} onChange={(v) => patch(row, { uiStable: v })} />
              </Field>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-slate-400">
                Approach
                {rec && <span className="text-amber-400">★ recommended: {INTEGRATION_APPROACHES[rec].label}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {APPROACH_KEYS.map((a) => {
                  const meta = INTEGRATION_APPROACHES[a]
                  const active = row.approach === a
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setApproach(row, a)}
                      className={`rounded-md border p-2 text-left transition ${active ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-700'}`}
                    >
                      <div className={`text-sm font-medium ${active ? 'text-cyan-300' : 'text-slate-200'}`}>{meta.label}</div>
                      <div className="text-xs text-slate-500">{meta.tagline}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-3">
              <Field label="Notes to capture">
                <TextArea value={row.notes} onChange={(v) => patch(row, { notes: v })} placeholder="Auth, idempotency, brittleness, data checks..." rows={2} />
              </Field>
            </div>
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
