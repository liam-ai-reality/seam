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
    <div className="space-y-5">
      <StageHeader n={2} title="Find the seam" blurb="Scope a slice, not the whole process. Score each candidate sub-task 1–5; the top score is the suggested first Assignment." />

      {/* Weights */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">Axis weights</span>
          <button type="button" onClick={() => update((s) => ({ ...s, seamWeights: { ...DEFAULT_WEIGHTS } }))} className="text-xs text-slate-500 hover:text-cyan-400">
            reset to equal
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SEAM_AXES.map((a) => (
            <div key={a.key}>
              <div className="mb-1 text-xs text-slate-400">{a.label}</div>
              <Pills value={scope.seamWeights[a.key]} onChange={(v) => setWeight(a.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Candidates */}
      <div className="space-y-3">
        {scope.seamCandidates.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-600">
            No candidates yet. Add the sub-tasks you could carve out of the process.
          </p>
        )}
        {scope.seamCandidates.map((c) => {
          const r = ranked.find((x) => x.candidate.id === c.id)!
          const isSuggested = c.id === suggestedId
          const isChosen = c.id === scope.chosenSeamId
          return (
            <div key={c.id} className={`rounded-lg border p-3 ${isChosen ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
              <div className="mb-3 flex items-center gap-2">
                <input
                  className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/70"
                  value={c.name}
                  placeholder="Candidate sub-task"
                  onChange={(e) => patchCandidate(c.id, { name: e.target.value })}
                />
                <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300" title="weighted automate-first score">
                  {r.score.toFixed(2)}
                </span>
                <span className="font-mono text-xs text-slate-500">#{r.rank}</span>
                <button type="button" onClick={() => removeCandidate(c.id)} className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-rose-500/50 hover:text-rose-400">
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {SEAM_AXES.map((a) => (
                  <div key={a.key}>
                    <div className="mb-1 text-xs text-slate-500" title={a.hint}>{a.label}</div>
                    <Pills value={c[a.key]} onChange={(v) => patchCandidate(c.id, { [a.key]: v } as Partial<SeamCandidate>)} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => choose(c.id)}
                  className={`rounded-md border px-3 py-1 text-xs transition ${isChosen ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-cyan-500/60'}`}
                >
                  {isChosen ? '✓ First Assignment' : 'Choose as first'}
                </button>
                {isSuggested && !isChosen && <span className="text-xs text-amber-400">★ suggested (top score)</span>}
              </div>
            </div>
          )
        })}
        <button type="button" onClick={addCandidate} className="w-full rounded-lg border border-dashed border-slate-700 py-2 text-sm text-slate-400 hover:border-cyan-500/60 hover:text-cyan-400">
          + Add candidate
        </button>
      </div>

      <Field label="Justification" hint="one sentence: why this slice first">
        <TextArea value={scope.seamJustification} onChange={(v) => update((s) => ({ ...s, seamJustification: v }))} placeholder="Why this is the right first Assignment" />
      </Field>
    </div>
  )
}
