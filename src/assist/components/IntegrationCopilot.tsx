// Integration Copilot panel (#19) — the per-stage assist affordance mounted under
// each system row in Stage 4 (Integration). It drafts gotcha NOTES (and, at most,
// an authType suggestion) that AUGMENT the deterministic recommendation.
//
// PROPOSE, DON'T DECIDE: the deterministic recommendApproach()/approachWarnings()
// output is shown FIRST and unchanged (it is recommendApproach's call, echoed
// straight from the task). The only writes this offers are accept-into
// Integration.notes / .authType, routed through acceptSourced({field:
// 'integrationText'}) -> the EXISTING shapeIntegration coercer + the app's
// `update` reducer. It NEVER writes Integration.approach.
//
// OFF BY DEFAULT + LAZY: StageIntegration reaches this only through a guarded
// dynamic import behind an AssistBoundary; assistAvailable() is false by default,
// so the trigger is disabled and no network call is made. v1 (the Stage-4 form it
// sits in) stays fully functional and offline-safe without it.

import { useState } from 'react'
import { INTEGRATION_APPROACHES } from '../../constants'
import type { Integration } from '../../types'
import { runIntegrationNotes, type IntegrationNotesResult } from '../tasks/integration'
import { acceptSourced, type ScopeReducer } from '../accept'
import { byoKeyTransport } from '../transports/byoKeyTransport'
import type { AssistTransport, Sourced } from '../types'
import { AssistPanel } from './AssistPanel'

export interface IntegrationCopilotProps {
  integration: Integration
  update: (fn: ScopeReducer) => void
  /** Injectable for tests; defaults to the gated BYO-key transport. */
  transport?: AssistTransport
}

/** Build the real transport from the gate config. Mirrors EvalDraftPanel.defaultTransport. */
function defaultTransport(): AssistTransport {
  let apiKey = ''
  try {
    const raw = localStorage.getItem('seam.assist')
    const cfg = raw ? (JSON.parse(raw) as { apiKey?: unknown }) : {}
    if (typeof cfg.apiKey === 'string') apiKey = cfg.apiKey
  } catch {
    /* malformed config — assistAvailable() would already be false */
  }
  return byoKeyTransport({ apiKey })
}

/** Default export so StageIntegration can lazy-import `m.default`. */
export default function IntegrationCopilot({ integration, update, transport }: IntegrationCopilotProps) {
  return (
    <AssistPanel<IntegrationNotesResult>
      title="Draft integration notes"
      blurb="Flags gotchas to capture for the recommended approach. Drafts only — accepting writes the notes (and optionally auth type). It never changes the recommended approach."
      buttonLabel="Draft notes"
      loadingLabel="Drafting…"
      run={() => runIntegrationNotes(integration, transport ?? defaultTransport())}
    >
      {(result, redo) => <NotesReview result={result} integrationId={integration.id} update={update} redo={redo} />}
    </AssistPanel>
  )
}

function NotesReview({
  result,
  integrationId,
  update,
  redo,
}: {
  result: IntegrationNotesResult
  integrationId: string
  update: (fn: ScopeReducer) => void
  redo: () => void
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  // Accept a single Sourced<string> draft into one integration free-text field
  // via the existing shapeIntegration coercer + reducer. Never touches approach.
  const accept = (id: string, key: 'notes' | 'authType', sourced: Sourced<string>) => {
    update(acceptSourced({ field: 'integrationText', integrationId, key }, sourced))
    setAccepted((s) => new Set(s).add(id))
  }

  const rec = result.recommendation.approach

  return (
    <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
      {/* The DETERMINISTIC recommendation, shown FIRST and unchanged. */}
      <div className="card stack" style={{ gap: 'var(--space-2)' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="tag auto">
            <span className="light green" aria-hidden /> recommended ·{' '}
            {rec ? INTEGRATION_APPROACHES[rec].label : 'not yet determined'}
          </span>
          <span className="fine">decided by Seam — the copilot can't change it</span>
        </div>
        {result.recommendation.warnings.map((w) => (
          <div key={w} className="caveat row" style={{ gap: '0.4rem', alignItems: 'flex-start' }}>
            <span aria-hidden>⚠</span>
            <span>{w}</span>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Drafts to augment the above. Nothing is applied until you accept it.
      </p>

      <DraftRow
        label="Notes to capture"
        sourced={result.draft.notes}
        accepted={accepted.has('notes')}
        onAccept={() => accept('notes', 'notes', result.draft.notes)}
      />
      <DraftRow
        label="Auth type (suggested)"
        sourced={result.draft.authType}
        accepted={accepted.has('authType')}
        onAccept={() => accept('authType', 'authType', result.draft.authType)}
      />

      <div className="btn-row">
        <button type="button" className="btn ghost sm" onClick={redo}>Re-draft</button>
      </div>
    </div>
  )
}

function DraftRow({
  label,
  sourced,
  accepted,
  onAccept,
}: {
  label: string
  sourced: Sourced<string>
  accepted: boolean
  onAccept: () => void
}) {
  const value = sourced.value?.trim() ?? ''
  const empty = value === ''
  return (
    <div className="stack" style={{ gap: 'var(--space-1)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <span className="lbl">{label}</span>
        <button type="button" className="btn ghost sm" onClick={onAccept} disabled={accepted || empty}>
          {accepted ? 'Accepted ✓' : 'Accept'}
        </button>
      </div>
      <p className="card-sub" style={{ marginTop: 0 }}>{empty ? '— (no draft)' : value}</p>
      {!empty && (
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {sourced.sourceSpans.map((sp, i) => (
            <span key={i} className="cite" aria-hidden>{sp.quote}</span>
          ))}
        </div>
      )}
    </div>
  )
}
