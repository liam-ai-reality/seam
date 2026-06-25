// Eval-draft panel (#18) — the per-stage assist affordance mounted under Stage 5
// (Failure modes & eval). It drafts an offline case-set outline + ship threshold,
// and — only when the output is free-form — an LLM-judge rubric PAIRED WITH a
// plan to validate that judge against humans.
//
// PROPOSE, DON'T DECIDE: every value is a Sourced<string> DRAFT. The only writes
// this offers are accept-into-evalPlan.offline / .online, routed through
// acceptSourced -> the EXISTING shapeEvalPlan coercer + the app's `update`
// reducer. It never sets the grader (recommendGrader decides that), never touches
// the seam, never auto-applies anything. Dismiss is per-session.
//
// OFF BY DEFAULT + LAZY: StageEval reaches this only through a guarded dynamic
// import behind an AssistBoundary; assistAvailable() is false by default, so the
// trigger is disabled and no network call is made. v1 (the Stage-5 form below it)
// stays fully functional and offline-safe without it.

import { useState } from 'react'
import type { Scope } from '../../types'
import { acceptSourced, type ScopeReducer } from '../accept'
import {
  runEvalDraft,
  type EvalDraft,
  type EvalDraftContext,
} from '../tasks/evalDraft'
import { byoKeyTransport } from '../transports/byoKeyTransport'
import type { AssistTransport, Sourced } from '../types'
import { AssistPanel } from './AssistPanel'

export interface EvalDraftPanelProps {
  scope: Scope
  update: (fn: ScopeReducer) => void
  /** Injectable for tests; defaults to the gated BYO-key transport. */
  transport?: AssistTransport
}

/** Build the real transport from the gate config. Mirrors CriticPanel.defaultTransport. */
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

function contextFromScope(s: Scope): EvalDraftContext {
  const chosen = s.seamCandidates.find((c) => c.id === s.chosenSeamId)
  return {
    freeFormOutput: s.evalPlan.freeFormOutput,
    chosenSeamName: chosen?.name ?? '',
    worstOutput: s.evalPlan.worstOutput,
  }
}

/** Default export so StageEval can lazy-import `m.default`. */
export default function EvalDraftPanel({ scope, update, transport }: EvalDraftPanelProps) {
  return (
    <AssistPanel<EvalDraft>
      title="Draft the eval plan"
      blurb="Proposes an offline case-set outline + ship threshold, and — only for free-form output — an LLM-judge rubric paired with a plan to validate the judge against humans. Drafts only; accept routes through the normal editor."
      buttonLabel="Draft eval plan"
      loadingLabel="Drafting…"
      run={() => runEvalDraft(contextFromScope(scope), transport ?? defaultTransport())}
    >
      {(draft, redo) => <DraftReview draft={draft} update={update} redo={redo} />}
    </AssistPanel>
  )
}

function DraftReview({
  draft,
  update,
  redo,
}: {
  draft: EvalDraft
  update: (fn: ScopeReducer) => void
  redo: () => void
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const markAccepted = (id: string) => setAccepted((s) => new Set(s).add(id))

  // Accept a single Sourced<string> draft into one evalPlan free-text field via
  // the existing shaper + reducer. Nothing here writes a Scope directly.
  const accept = (
    id: string,
    key: 'offline' | 'online',
    sourced: Sourced<string>,
  ) => {
    update(acceptSourced({ field: 'evalPlanText', key }, sourced))
    markAccepted(id)
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Grader: <strong>{draft.grader}</strong>. Nothing below is applied until you accept it.
      </p>

      <DraftRow
        label="Offline case-set outline"
        sourced={draft.caseSetOutline}
        accepted={accepted.has('caseSet')}
        onAccept={() => accept('caseSet', 'offline', draft.caseSetOutline)}
      />
      <DraftRow
        label="Ship threshold"
        sourced={draft.shipThreshold}
        accepted={accepted.has('shipThreshold')}
        onAccept={() => accept('shipThreshold', 'offline', draft.shipThreshold)}
      />

      {draft.judge && (
        // The rubric and its validation plan are rendered AS A PAIR — you cannot
        // accept the rubric without seeing the plan that must validate the judge.
        <div className="card stack" style={{ gap: 'var(--space-2)' }}>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="tag assist">LLM judge</span>
            <span className="fine">judge model: {draft.judge.judgeModel} (≠ production)</span>
          </div>
          <p className="fine">
            Rubric and validation plan ship together: the judge is not trusted until it is
            validated against human-labelled cases at a target agreement rate.
          </p>
          <DraftRow
            label="Judge rubric"
            sourced={draft.judge.judgeRubric}
            accepted={accepted.has('rubric')}
            onAccept={() => accept('rubric', 'online', draft.judge!.judgeRubric)}
          />
          <DraftRow
            label="Judge validation plan (un-checked-off until run)"
            sourced={draft.judge.judgeValidationPlan}
            accepted={accepted.has('validationPlan')}
            onAccept={() => accept('validationPlan', 'online', draft.judge!.judgeValidationPlan)}
          />
        </div>
      )}

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
        <button
          type="button"
          className="btn ghost sm"
          onClick={onAccept}
          disabled={accepted || empty}
        >
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
