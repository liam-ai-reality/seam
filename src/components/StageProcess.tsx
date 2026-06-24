import { useState } from 'react'
import { newId } from '../constants'
import type { StageProps } from './stage'
import { Field, StageHeader, TextArea, TextInput } from './fields'

export function StageProcess({ scope, update }: StageProps) {
  const pm = scope.processMap
  const setPM = (patch: Partial<typeof pm>) =>
    update((s) => ({ ...s, processMap: { ...s.processMap, ...patch } }))

  const addSystem = (name: string) => {
    const n = name.trim()
    if (!n) return
    setPM({ systems: [...pm.systems, { id: newId(), name: n }] })
  }
  const removeSystem = (id: string) =>
    setPM({ systems: pm.systems.filter((x) => x.id !== id) })
  const renameSystem = (id: string, name: string) =>
    setPM({ systems: pm.systems.map((x) => (x.id === id ? { ...x, name } : x)) })

  return (
    <div className="stack" data-enter>
      <StageHeader n={1} title="Map the real process" blurb="What actually happens today — before you change any of it." />

      <div className="panel stack">
        <Field label="Who does it">
          <TextInput value={pm.who} onChange={(v) => setPM({ who: v })} placeholder="Roles / team doing this manually today" autoFocus />
        </Field>

        <Field label="Trigger" hint="what kicks it off">
          <TextInput value={pm.trigger} onChange={(v) => setPM({ trigger: v })} placeholder="An email arrives / a ticket is filed / a nightly batch..." />
        </Field>

        <Field label="Definition of done">
          <TextArea value={pm.doneDefinition} onChange={(v) => setPM({ doneDefinition: v })} placeholder="What 'done' looks like for one run" />
        </Field>

        <div className="grid cols-2">
          <Field label="Frequency / volume">
            <TextInput value={pm.frequency} onChange={(v) => setPM({ frequency: v })} placeholder="~400/week, spikes Mondays" />
          </Field>
          <Field label="Cost when it goes wrong">
            <TextInput value={pm.costOfError} onChange={(v) => setPM({ costOfError: v })} placeholder="SLA breach, fine, lost customer..." />
          </Field>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Systems &amp; screens</h2>
          <span className="meta">{pm.systems.length} mapped</span>
        </div>
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {pm.systems.map((sys) => (
            <div key={sys.id} className="row" style={{ flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}>
                <TextInput value={sys.name} onChange={(v) => renameSystem(sys.id, v)} />
              </div>
              <button type="button" onClick={() => removeSystem(sys.id)} className="btn danger sm">
                Remove
              </button>
            </div>
          ))}
          <AddSystem onAdd={addSystem} />
        </div>
      </div>
    </div>
  )
}

function AddSystem({ onAdd }: { onAdd: (name: string) => void }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    onAdd(draft)
    setDraft('')
  }
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <div className="field" style={{ margin: 0, flex: 1 }}>
        <input
          style={{ borderStyle: 'dashed' }}
          value={draft}
          placeholder="Add a system and press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
        />
      </div>
      <button type="button" onClick={commit} className="btn ghost sm">
        Add
      </button>
    </div>
  )
}
