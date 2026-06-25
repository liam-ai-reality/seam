import { Suspense, lazy } from 'react'
import { GRADER_LADDER, GRADERS } from '../constants'
import { recommendGrader } from '../logic'
import type { GraderType } from '../types'
import type { StageProps } from './stage'
import { AssistBoundary } from './AssistBoundary'
import { Field, StageHeader, TextArea, Toggle } from './fields'

// The eval drafter (#18) is an OPTIONAL assist surface, OFF by default
// (assistAvailable() is false) and code-split into its own lazy chunk. StageEval
// reaches it only through this guarded dynamic import behind an AssistBoundary,
// which falls back to a null component if the chunk fails to load. It only
// PROPOSES Sourced drafts (accepted through the normal editor); it never sets the
// grader or auto-applies anything, and makes zero network calls offline. v1's
// Stage-5 form below stays fully functional and offline-safe without it.
type EvalDraftPanelModule = typeof import('../assist/components/EvalDraftPanel')
const EvalDraftPanel = lazy<EvalDraftPanelModule['default']>(() =>
  import('../assist/components/EvalDraftPanel').catch(
    () => ({ default: () => null }) as unknown as EvalDraftPanelModule,
  ),
)

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
    <div className="stack" data-enter>
      <StageHeader n={5} title="Failure modes & eval" blurb="The worst wrong output, how you'd catch it, and the plan to prove the agent before — and after — you scale it." />

      <AssistBoundary>
        <Suspense fallback={null}>
          <EvalDraftPanel scope={scope} update={update} />
        </Suspense>
      </AssistBoundary>

      <div className="panel stack">
        <Field label="Worst wrong output">
          <TextArea value={ep.worstOutput} onChange={(v) => set({ worstOutput: v })} placeholder="The single most damaging thing a bad Job could produce" />
        </Field>
        <Field label="How a bad Job is detected">
          <TextArea value={ep.detection} onChange={(v) => set({ detection: v })} placeholder="The check that flags it before it does harm" />
        </Field>

        <div className="grid cols-2">
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
      </div>

      {/* Grader chooser */}
      <div className="panel">
        <div className="panel-head">
          <h2>Grader</h2>
          <Toggle checked={ep.freeFormOutput} onChange={setFreeForm} label="Output is free-form" />
        </div>
        <p className="fine" style={{ marginBottom: 'var(--space-4)' }}>Cheapest sufficient first.</p>
        <div className="grid cols-2">
          {GRADER_LADDER.map((g: GraderType) => {
            const active = ep.grader === g
            const isRec = g === rec
            return (
              <button
                key={g}
                type="button"
                onClick={() => set({ grader: g })}
                className="card clickable"
                style={{
                  textAlign: 'left',
                  ...(active ? { borderColor: 'var(--color-accent)', boxShadow: 'var(--focal), var(--edge-hi)' } : {}),
                }}
              >
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <span className="card-h">{GRADERS[g].label}</span>
                  {isRec && <span className="tag auto">recommended</span>}
                </div>
                <div className="card-sub" style={{ marginTop: '0.15rem' }}>{GRADERS[g].note}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
