// Seam Copilot panel (#19) — the per-stage assist affordance mounted under Stage
// 2 (Find the seam). It proposes ADDITIONAL scored candidate drafts from the
// captured process map and lets the FDE accept each one into the board.
//
// PROPOSE, DON'T DECIDE: every candidate is a draft of cited axis scores. The
// only write this offers is "Add to board", routed through acceptSourced({field:
// 'seamCandidate'}) -> the EXISTING shapeCandidate coercer + the app's `update`
// reducer. It NEVER sets chosenSeamId, and it NEVER ranks: once added, the
// candidate is scored + ordered by the deterministic rankSeams in StageSeam,
// exactly like a hand-entered one. The "would rank" hint shown here is computed
// by that same rankSeams, not by the model.
//
// OFF BY DEFAULT + LAZY: StageSeam reaches this only through a guarded dynamic
// import behind an AssistBoundary; assistAvailable() is false by default, so the
// trigger is disabled and no network call is made. v1 (the Stage-2 form below it)
// stays fully functional and offline-safe without it.

import { useState } from 'react'
import type { Scope } from '../../types'
import { rankWithProposed, candidateValue, type SeamCandidateDraft, type SeamSuggestResult, runSeamSuggest } from '../tasks/seam'
import { shapeCandidate } from '../../storage'
import { acceptSourced, type ScopeReducer } from '../accept'
import { byoKeyTransport } from '../transports/byoKeyTransport'
import type { AssistTransport, Sourced } from '../types'
import { AssistPanel } from './AssistPanel'

export interface SeamCopilotProps {
  scope: Scope
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

/** Default export so StageSeam can lazy-import `m.default`. */
export default function SeamCopilot({ scope, update, transport }: SeamCopilotProps) {
  return (
    <AssistPanel<SeamSuggestResult>
      title="Suggest more candidates"
      blurb="Proposes additional scored sub-tasks from your process map. Drafts only — accepting adds a candidate to the board, where the deterministic ranking scores it. It never picks your first Assignment."
      buttonLabel="Suggest candidates"
      loadingLabel="Thinking…"
      run={() => runSeamSuggest(scope.processMap, scope.seamCandidates, transport ?? defaultTransport())}
    >
      {(result, redo) => <Suggestions result={result} scope={scope} update={update} redo={redo} />}
    </AssistPanel>
  )
}

function Suggestions({
  result,
  scope,
  update,
  redo,
}: {
  result: SeamSuggestResult
  scope: Scope
  update: (fn: ScopeReducer) => void
  redo: () => void
}) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  // Accept ONE draft candidate onto the board via the existing shapeCandidate
  // coercer + reducer. The Sourced wrapper carries the shaped candidate VALUE;
  // accept.ts appends it via shapeCandidate. Nothing here writes a Scope directly,
  // and nothing sets chosenSeamId.
  const accept = (c: SeamCandidateDraft) => {
    const sourced: Sourced<Record<string, unknown>> = {
      value: candidateValue(result.source, c),
      confidence: c.name.confidence,
      sourceSpans: [],
      status: 'draft',
    }
    update(acceptSourced({ field: 'seamCandidate' }, sourced))
    setAccepted((s) => new Set(s).add(c.key))
  }

  if (result.payload.candidates.length === 0) {
    return (
      <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        <div className="empty">
          <div className="big">No new candidates</div>
          <p className="fine">Nothing to add beyond what is already on the board.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn ghost sm" onClick={redo}>Re-run</button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Drafts. Nothing is added until you accept it; scores are ranked by Seam, not the model.
      </p>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 'var(--space-2)' }}>
        {result.payload.candidates.map((c) => (
          <CandidateRow
            key={c.key}
            c={c}
            scope={scope}
            source={result.source}
            accepted={accepted.has(c.key)}
            onAccept={() => accept(c)}
          />
        ))}
      </ul>
      <div className="btn-row">
        <button type="button" className="btn ghost sm" onClick={redo}>Re-run</button>
      </div>
    </div>
  )
}

const AXES: { key: 'volume' | 'ruleBound' | 'lowJudgement' | 'lowBlastRadius'; label: string }[] = [
  { key: 'volume', label: 'volume' },
  { key: 'ruleBound', label: 'rule-bound' },
  { key: 'lowJudgement', label: 'low judgement' },
  { key: 'lowBlastRadius', label: 'low blast radius' },
]

function CandidateRow({
  c,
  scope,
  source,
  accepted,
  onAccept,
}: {
  c: SeamCandidateDraft
  scope: Scope
  source: string
  accepted: boolean
  onAccept: () => void
}) {
  const name = c.name.value?.trim() ?? ''
  const empty = name === ''

  // The "would rank #N" hint is computed by the DETERMINISTIC rankSeams over the
  // current board PLUS this one draft shaped to a real candidate — never the
  // model's ordering. Mirror accept's path exactly via shapeCandidate.
  const shaped = {
    ...shapeCandidate(candidateValue(source, c), scope.seamCandidates.length),
    id: `__draft__${c.key}`, // sentinel id: cannot collide with a board candidate
  }
  const ranked = rankWithProposed(scope.seamCandidates, [shaped], scope.seamWeights)
  const mine = ranked.find((r) => r.candidate.id === shaped.id)

  return (
    <li className="card stack" style={{ gap: 'var(--space-2)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className="tag assist">AI</span>
          <span className="card-h">{empty ? '— (no name)' : name}</span>
        </div>
        <button type="button" className="btn ghost sm" onClick={onAccept} disabled={accepted || empty}>
          {accepted ? 'Added ✓' : 'Add to board'}
        </button>
      </div>

      <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {AXES.map((a) => (
          <span key={a.key} className="tag neutral" title={a.label}>
            {a.label}: {shaped[a.key]}
          </span>
        ))}
        {mine && (
          <span className="tag auto" title="Where this would land per Seam's deterministic ranking">
            would rank #{mine.rank} · {mine.score.toFixed(2)}
          </span>
        )}
      </div>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {c.name.sourceSpans.map((sp, i) => (
          <span key={i} className="cite" aria-hidden>{sp.quote}</span>
        ))}
      </div>
    </li>
  )
}
