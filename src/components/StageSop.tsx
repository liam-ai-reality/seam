import type { ReactNode } from 'react'
import type { StageProps } from './stage'
import { StageHeader, TextArea } from './fields'

/** A field whose label carries a cockpit tag (auto / human) to signal autonomy. */
function TaggedField({ label, tag, children }: { label: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <label className="field" style={{ margin: 0 }}>
      <div className="label-row">
        <span>{label}</span>
        {tag}
      </div>
      {children}
    </label>
  )
}

export function StageSop({ scope, update }: StageProps) {
  const sop = scope.sop
  const set = (patch: Partial<typeof sop>) => update((s) => ({ ...s, sop: { ...s.sop, ...patch } }))

  return (
    <div className="stack" data-enter>
      <StageHeader n={3} title="SOP & guardrails" blurb="What the agent may decide alone, what needs a human, and when it should stop." />

      <div className="panel stack">
        <TaggedField label="Agent may decide alone" tag={<span className="tag auto">agent</span>}>
          <TextArea value={sop.agentDecides} onChange={(v) => set({ agentDecides: v })} placeholder="Decisions the agent owns end-to-end" />
        </TaggedField>

        <TaggedField label="Needs human approval" tag={<span className="tag human">human gate</span>}>
          <TextArea value={sop.needsApproval} onChange={(v) => set({ needsApproval: v })} placeholder="Where a human gate sits, and for what" />
        </TaggedField>

        <TaggedField label="Thresholds / tolerances / allow-lists" tag={<span className="tag assist">limits</span>}>
          <TextArea value={sop.thresholds} onChange={(v) => set({ thresholds: v })} placeholder="Confidence cut-offs, value ceilings, allowed categories..." />
        </TaggedField>

        <TaggedField label="Stop conditions" tag={<span className="fine">down tools and escalate</span>}>
          <TextArea value={sop.stopConditions} onChange={(v) => set({ stopConditions: v })} placeholder="The exact conditions under which the agent escalates instead of acting" />
        </TaggedField>
      </div>
    </div>
  )
}
