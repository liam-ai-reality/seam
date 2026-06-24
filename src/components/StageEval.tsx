import { GRADER_LADDER, GRADERS } from '../constants'
import { recommendGrader } from '../logic'
import type { GraderType } from '../types'
import type { StageProps } from './stage'
import { Field, StageHeader, TextArea, Toggle } from './fields'

export function StageEval({ scope, update }: StageProps) {
  const ep = scope.evalPlan
  const set = (patch: Partial<typeof ep>) => update((s) => ({ ...s, evalPlan: { ...s.evalPlan, ...patch } }))

  const rec = recommendGrader(ep.freeFormOutput)

  const setFreeForm = (v: boolean) =>
    // Flipping free-form re-points the recommendation; follow it unless the
    // user has already moved off the previous recommendation deliberately.
    update((s) => {
      const wasRec = s.evalPlan.grader === recommendGrader(s.evalPlan.freeFormOutput)
      const next = { ...s.evalPlan, freeFormOutput: v }
      if (wasRec) next.grader = recommendGrader(v)
      return { ...s, evalPlan: next }
    })

  return (
    <div className="space-y-5">
      <StageHeader n={5} title="Failure modes & eval" blurb="The worst wrong output, how you'd catch it, and the plan to prove the agent before — and after — you scale it." />

      <Field label="Worst wrong output">
        <TextArea value={ep.worstOutput} onChange={(v) => set({ worstOutput: v })} placeholder="The single most damaging thing a bad Job could produce" />
      </Field>
      <Field label="How a bad Job is detected">
        <TextArea value={ep.detection} onChange={(v) => set({ detection: v })} placeholder="The check that flags it before it does harm" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Offline — before scale" hint="case set · shadow-run · ship threshold">
          <TextArea value={ep.offline} onChange={(v) => set({ offline: v })} placeholder="Known-good case set, shadow-run, threshold to ship" />
        </Field>
        <Field label="Online — after deploy" hint="proxies + sampling">
          <TextArea value={ep.online} onChange={(v) => set({ online: v })} placeholder="Confidence, escalation rate, anomalies + human-review sampling" />
        </Field>
        <Field label="Cost-weighted quality">
          <TextArea value={ep.costWeightedQuality} onChange={(v) => set({ costWeightedQuality: v })} placeholder="Expensive errors must be rare — bias the threshold toward escalation" />
        </Field>
        <Field label="Beats-the-human baseline">
          <TextArea value={ep.baseline} onChange={(v) => set({ baseline: v })} placeholder="Define the human baseline before building; measure after" />
        </Field>
      </div>

      {/* Grader chooser */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">Grader — cheapest sufficient first</span>
          <Toggle checked={ep.freeFormOutput} onChange={setFreeForm} label="Output is free-form" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GRADER_LADDER.map((g: GraderType) => {
            const active = ep.grader === g
            const isRec = g === rec
            return (
              <button
                key={g}
                type="button"
                onClick={() => set({ grader: g })}
                className={`rounded-md border p-2 text-left transition ${active ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 hover:border-slate-700'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${active ? 'text-cyan-300' : 'text-slate-200'}`}>{GRADERS[g].label}</span>
                  {isRec && <span className="text-xs text-amber-400">★ recommended</span>}
                </div>
                <div className="text-xs text-slate-500">{GRADERS[g].note}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
