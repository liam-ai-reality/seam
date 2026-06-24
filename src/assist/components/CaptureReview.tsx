// CaptureReview (#15) — the accept/edit layer for a capture extraction.
//
// It diffs the model's PROPOSED partial Scope against the CURRENT Scope and lets
// a human accept each field / candidate individually. Acceptance always routes
// through accept.ts -> the existing storage shapers via the app's `update`
// reducer; this component NEVER writes a Scope directly and never invents a
// ranking (rank is shown via the existing rankSeams once a candidate is accepted
// into the Scope by the host).
//
// Confidence -> action (locked 3-bucket rule) drives the UI:
//   high    -> 'prefill'        : pre-filled, editable, one-click accept.
//   medium  -> 'prefill-review' : pre-filled but flagged "review" before accept.
//   low     -> 'suggest'        : NOT pre-filled — a dismissible suggestion chip.
//
// An axis score whose citation fails the verbatim check is "unsourced" and is
// rendered as 'unsourced — confirm' instead of being pre-filled (AC3).

import { useState } from 'react'
import type { Scope } from '../../types'
import type { Confidence, Sourced } from '../types'
import { acceptSourced, type ScopeReducer } from '../accept'
import {
  candidateValue,
  confidenceAction,
  isSourced,
  type CaptureAction,
  type CaptureResult,
  type FailureModeDraft,
  type ProcessMapDraft,
  type SeamCandidateDraft,
} from '../tasks/capture'

const PROCESS_FIELDS: { key: keyof ProcessMapDraft & string; label: keyof Scope['processMap'] & string; title: string }[] = [
  { key: 'who', label: 'who', title: 'Who does it today' },
  { key: 'trigger', label: 'trigger', title: 'What triggers it' },
  { key: 'doneDefinition', label: 'doneDefinition', title: 'Definition of done' },
  { key: 'frequency', label: 'frequency', title: 'Frequency / volume' },
  { key: 'costOfError', label: 'costOfError', title: 'Cost of error' },
]

export interface CaptureReviewProps {
  result: CaptureResult
  scope: Scope
  /** The app's reducer applier — same path every other edit uses. */
  update: (fn: ScopeReducer) => void
  /** Close the review. */
  onDone: () => void
}

export function CaptureReview({ result, scope, update, onDone }: CaptureReviewProps) {
  const { payload, source } = result
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const dismiss = (id: string) => setDismissed((s) => new Set(s).add(id))

  return (
    <div className="panel stack" aria-label="Review proposed map">
      <div className="panel-head">
        <h2>Review the drafted map</h2>
        <span className="tag assist">
          <span className="light cyan" aria-hidden /> AI-proposed · draft
        </span>
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Nothing below is in your scope yet. Accept each field or candidate to apply it through the
        normal editor; low-confidence items are suggestions only.
      </p>

      <section className="stack" aria-label="Process map">
        <h3 className="lbl">Process map</h3>
        {PROCESS_FIELDS.map((f) => (
          <FieldRow
            key={f.key}
            title={f.title}
            sourced={payload.processMap[f.key] as Sourced<string>}
            source={source}
            current={scope.processMap[f.label] as string}
            dismissed={dismissed.has(`pm:${f.key}`)}
            onDismiss={() => dismiss(`pm:${f.key}`)}
            onAccept={(value) =>
              // Route the partial ProcessMap through the existing shaper via
              // acceptSourced -> shapeProcessMap (no parallel write path).
              update(
                acceptSourced(
                  { field: 'processMap' },
                  { value: { [f.label]: value }, confidence: 'high', sourceSpans: [], status: 'draft' },
                ),
              )
            }
          />
        ))}
      </section>

      <section className="stack" aria-label="Seam candidates">
        <h3 className="lbl">Seam candidates</h3>
        {payload.candidates.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>No candidates proposed.</p>
        ) : (
          payload.candidates.map((c) =>
            dismissed.has(`cand:${c.key}`) ? null : (
              <CandidateCard
                key={c.key}
                candidate={c}
                source={source}
                onDismiss={() => dismiss(`cand:${c.key}`)}
                onAccept={() =>
                  update(
                    acceptSourced(
                      { field: 'seamCandidate' },
                      {
                        value: candidateValue(source, c),
                        confidence: c.name.confidence,
                        sourceSpans: c.name.sourceSpans,
                        status: 'draft',
                      },
                    ),
                  )
                }
              />
            ),
          )
        )}
      </section>

      <section className="stack" aria-label="Failure modes">
        <h3 className="lbl">Starter failure modes</h3>
        {payload.failureModes.length === 0 ? (
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>None proposed.</p>
        ) : (
          payload.failureModes.map((f, i) =>
            dismissed.has(`fm:${i}`) ? null : (
              <FailureModeRow
                key={`fm-${i}`}
                fm={f}
                source={source}
                onDismiss={() => dismiss(`fm:${i}`)}
              />
            ),
          )
        )}
      </section>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

// ---------- field row ----------

function FieldRow({
  title,
  sourced,
  source,
  current,
  dismissed,
  onDismiss,
  onAccept,
}: {
  title: string
  sourced: Sourced<string>
  source: string
  current: string
  dismissed: boolean
  onDismiss: () => void
  onAccept: (value: string) => void
}) {
  const action = confidenceAction(sourced.confidence)
  const sourced_ok = isSourced(source, sourced)
  // 'suggest' (low) is NOT pre-filled; high/medium are.
  const initial = action === 'suggest' ? '' : sourced.value ?? ''
  const [draft, setDraft] = useState(initial)

  if (dismissed) return null
  if (sourced.value === null || sourced.value.trim() === '') return null

  // The Accept button is disabled while `draft` is empty in the suggest case,
  // so `draft` is always the value to apply in both branches.
  const accept = () => onAccept(draft)

  return (
    <div className="card stack" data-action={action}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-h">{title}</span>
        <ConfidenceTag action={action} sourced_ok={sourced_ok} />
      </div>
      {current.trim() !== '' && (
        <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          Current: <span style={{ color: 'var(--color-ink-soft)' }}>{current}</span>
        </p>
      )}
      {action === 'suggest' ? (
        <SuggestionChip text={sourced.value} onUse={() => setDraft(sourced.value ?? '')} onDismiss={onDismiss} />
      ) : (
        <div className="field" style={{ margin: 0 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
      )}
      <Citations sourced={sourced} source={source} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {action !== 'suggest' && (
          <button type="button" className="btn ghost sm" onClick={onDismiss}>
            Dismiss
          </button>
        )}
        <button type="button" className="btn sm" onClick={accept} disabled={action === 'suggest' && draft.trim() === ''}>
          Accept
        </button>
      </div>
    </div>
  )
}

// ---------- candidate card ----------

const AXES: { key: 'volume' | 'ruleBound' | 'lowJudgement' | 'lowBlastRadius'; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'ruleBound', label: 'Rule-bound' },
  { key: 'lowJudgement', label: 'Low judgement' },
  { key: 'lowBlastRadius', label: 'Low blast radius' },
]

function CandidateCard({
  candidate,
  source,
  onDismiss,
  onAccept,
}: {
  candidate: SeamCandidateDraft
  source: string
  onDismiss: () => void
  onAccept: () => void
}) {
  const nameAction = confidenceAction(candidate.name.confidence)
  return (
    <div className="card stack" data-action={nameAction}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-h">{candidate.name.value ?? 'Unnamed candidate'}</span>
        <ConfidenceTag action={nameAction} sourced_ok={isSourced(source, candidate.name)} />
      </div>
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: '4px' }}>
        {AXES.map((a) => (
          <AxisRow key={a.key} label={a.label} sourced={candidate[a.key]} source={source} />
        ))}
      </ul>
      <Citations sourced={candidate.name} source={source} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        <button type="button" className="btn ghost sm" onClick={onDismiss}>
          Dismiss
        </button>
        <button type="button" className="btn sm" onClick={onAccept}>
          Accept candidate
        </button>
      </div>
    </div>
  )
}

function AxisRow({ label, sourced, source }: { label: string; sourced: Sourced<number>; source: string }) {
  const ok = isSourced(source, sourced)
  return (
    <li className="row" style={{ justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
      <span className="muted">{label}</span>
      {ok && typeof sourced.value === 'number' ? (
        <span>
          <b style={{ color: 'var(--color-accent)' }}>{sourced.value}</b>
          <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>/5</span>{' '}
          <span className={`tag ${tagForConfidence(sourced.confidence)}`}>{sourced.confidence}</span>
        </span>
      ) : (
        <span className="tag human" title="The cited quote could not be verified in the source.">
          unsourced — confirm
        </span>
      )}
    </li>
  )
}

// ---------- failure mode ----------

function FailureModeRow({ fm, source, onDismiss }: { fm: FailureModeDraft; source: string; onDismiss: () => void }) {
  const action = confidenceAction(fm.value.confidence)
  if (fm.value.value === null || fm.value.value.trim() === '') return null
  const label = fm.field === 'worstOutput' ? 'Worst output' : 'Detection'
  return (
    <div className="card stack" data-action={action}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="card-h">{label}</span>
        <ConfidenceTag action={action} sourced_ok={isSourced(source, fm.value)} />
      </div>
      <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>{fm.value.value}</p>
      <Citations sourced={fm.value} source={source} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ---------- shared bits ----------

function ConfidenceTag({ action, sourced_ok }: { action: CaptureAction; sourced_ok: boolean }) {
  if (!sourced_ok) return <span className="tag human">unsourced — confirm</span>
  const text = action === 'prefill' ? 'high' : action === 'prefill-review' ? 'medium · review' : 'suggestion'
  const cls = action === 'prefill' ? 'auto' : action === 'prefill-review' ? 'assist' : 'neutral'
  return <span className={`tag ${cls}`}>{text}</span>
}

function tagForConfidence(c: Confidence): string {
  return c === 'high' ? 'auto' : c === 'medium' ? 'assist' : 'neutral'
}

function SuggestionChip({ text, onUse, onDismiss }: { text: string | null; onUse: () => void; onDismiss: () => void }) {
  return (
    <div className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
      <span className="tag neutral" style={{ flex: 1 }}>
        Suggestion: {text ?? ''}
      </span>
      <button type="button" className="btn ghost sm" onClick={onUse}>
        Use
      </button>
      <button type="button" className="btn ghost sm" aria-label="Dismiss suggestion" onClick={onDismiss}>
        ✕
      </button>
    </div>
  )
}

function Citations({ sourced, source }: { sourced: Sourced<unknown>; source: string }) {
  if (sourced.sourceSpans.length === 0) return null
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: '6px' }}>
      {sourced.sourceSpans.map((sp, i) => (
        <span
          key={`${sp.charStart}-${sp.charEnd}-${i}`}
          className="cite"
          title={`chars ${sp.charStart}–${sp.charEnd}${source.slice(sp.charStart, sp.charEnd) === sp.quote ? '' : ' (unverified)'}`}
        >
          “{sp.quote.length > 48 ? `${sp.quote.slice(0, 48)}…` : sp.quote}”
        </span>
      ))}
    </div>
  )
}
