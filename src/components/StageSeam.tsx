import { DEFAULT_WEIGHTS, newId, SEAM_AXES } from '../constants'
import { rankSeams, suggestedSeamId } from '../logic'
import type { SeamCandidate } from '../types'
import type { StageProps } from './stage'
import { Field, Pills, StageHeader, TextArea } from './fields'

export function StageSeam({ scope, update }: StageProps) {
  const ranked = rankSeams(scope.seamCandidates, scope.seamWeights)
  const suggestedId = suggestedSeamId(scope.seamCandidates, scope.seamWeights)

  const addCandidate = () =>
    update((s) => ({
      ...s,
      seamCandidates: [
        ...s.seamCandidates,
        { id: newId(), name: '', volume: 3, ruleBound: 3, lowJudgement: 3, lowBlastRadius: 3 },
      ],
    }))

  const patchCandidate = (id: string, patch: Partial<SeamCandidate>) =>
    update((s) => ({
      ...s,
      seamCandidates: s.seamCandidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))

  const removeCandidate = (id: string) =>
    update((s) => ({
      ...s,
      seamCandidates: s.seamCandidates.filter((c) => c.id !== id),
      chosenSeamId: s.chosenSeamId === id ? null : s.chosenSeamId,
    }))

  const choose = (id: string) => update((s) => ({ ...s, chosenSeamId: id }))

  const setWeight = (key: keyof typeof scope.seamWeights, v: number) =>
    update((s) => ({ ...s, seamWeights: { ...s.seamWeights, [key]: v } }))

  return (
    <div className="stack" data-enter>
      <StageHeader n={2} title="Find the seam" blurb="Scope a slice, not the whole process. Score each candidate sub-task 1–5; the top score is the suggested first Assignment." />

      {/* Weights */}
      <div className="panel">
        <div className="panel-head">
          <h2>Axis weights</h2>
          <button type="button" onClick={() => update((s) => ({ ...s, seamWeights: { ...DEFAULT_WEIGHTS } }))} className="btn ghost sm">
            reset to equal
          </button>
        </div>
        <div className="grid cols-4">
          {SEAM_AXES.map((a) => (
            <div key={a.key} className="stack" style={{ gap: 'var(--space-2)' }}>
              <span className="lbl">{a.label}</span>
              <Pills value={scope.seamWeights[a.key]} onChange={(v) => setWeight(a.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Candidates */}
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {scope.seamCandidates.length === 0 && (
          <div className="empty">
            <div className="big">No candidates yet</div>
            <p className="muted">Add the sub-tasks you could carve out of the process.</p>
          </div>
        )}
        {scope.seamCandidates.map((c) => {
          const r = ranked.find((x) => x.candidate.id === c.id)!
          const isSuggested = c.id === suggestedId
          const isChosen = c.id === scope.chosenSeamId
          return (
            <div
              key={c.id}
              className="card"
              style={isChosen ? { borderColor: 'var(--color-accent)', boxShadow: 'var(--focal), var(--edge-hi)' } : undefined}
            >
              <div className="spread" style={{ marginBottom: 'var(--space-3)', flexWrap: 'nowrap' }}>
                <div className="field" style={{ margin: 0, flex: 1 }}>
                  <input
                    value={c.name}
                    placeholder="Candidate sub-task"
                    onChange={(e) => patchCandidate(c.id, { name: e.target.value })}
                  />
                </div>
                <div className="kpi" style={{ textAlign: 'right' }} title="weighted automate-first score">
                  <div className="n tnum" style={{ fontSize: '1.5rem' }}>{r.score.toFixed(2)}</div>
                  <div className="l">rank #{r.rank}</div>
                </div>
                <button type="button" onClick={() => removeCandidate(c.id)} className="btn danger sm" aria-label="Remove candidate">
                  ✕
                </button>
              </div>

              <div className="meter thin" style={{ marginBottom: 'var(--space-3)' }} aria-hidden>
                <span style={{ width: `${(r.score / 5) * 100}%` }} />
              </div>

              <div className="grid cols-4">
                {SEAM_AXES.map((a) => (
                  <div key={a.key} className="stack" style={{ gap: 'var(--space-2)' }}>
                    <span className="lbl" title={a.hint}>{a.label}</span>
                    <Pills value={c[a.key]} onChange={(v) => patchCandidate(c.id, { [a.key]: v } as Partial<SeamCandidate>)} />
                  </div>
                ))}
              </div>

              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => choose(c.id)}
                  className={isChosen ? 'btn sm' : 'btn ghost sm'}
                >
                  {isChosen ? '✓ First Assignment' : 'Choose as first'}
                </button>
                {isSuggested && !isChosen && (
                  <span className="tag auto"><span className="light green" /> suggested · top score</span>
                )}
              </div>
            </div>
          )
        })}
        <button type="button" onClick={addCandidate} className="btn ghost" style={{ width: '100%', borderStyle: 'dashed' }}>
          + Add candidate
        </button>
      </div>

      <div className="panel">
        <Field label="Justification" hint="one sentence: why this slice first">
          <TextArea value={scope.seamJustification} onChange={(v) => update((s) => ({ ...s, seamJustification: v }))} placeholder="Why this is the right first Assignment" />
        </Field>
      </div>
    </div>
  )
}
