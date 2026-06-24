import type { StageProps } from './stage'
import { Field, StageHeader, TextArea } from './fields'

export function StageSop({ scope, update }: StageProps) {
  const sop = scope.sop
  const set = (patch: Partial<typeof sop>) => update((s) => ({ ...s, sop: { ...s.sop, ...patch } }))

  return (
    <div className="space-y-5">
      <StageHeader n={3} title="SOP & guardrails" blurb="What the agent may decide alone, what needs a human, and when it should stop." />

      <Field label="Agent may decide alone">
        <TextArea value={sop.agentDecides} onChange={(v) => set({ agentDecides: v })} placeholder="Decisions the agent owns end-to-end" />
      </Field>

      <Field label="Needs human approval">
        <TextArea value={sop.needsApproval} onChange={(v) => set({ needsApproval: v })} placeholder="Where a human gate sits, and for what" />
      </Field>

      <Field label="Thresholds / tolerances / allow-lists">
        <TextArea value={sop.thresholds} onChange={(v) => set({ thresholds: v })} placeholder="Confidence cut-offs, value ceilings, allowed categories..." />
      </Field>

      <Field label="Stop conditions" hint="down tools and escalate">
        <TextArea value={sop.stopConditions} onChange={(v) => set({ stopConditions: v })} placeholder="The exact conditions under which the agent escalates instead of acting" />
      </Field>
    </div>
  )
}
