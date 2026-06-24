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
    <div className="space-y-5">
      <StageHeader n={1} title="Map the real process" blurb="What actually happens today — before you change any of it." />

      <Field label="Who does it">
        <TextInput value={pm.who} onChange={(v) => setPM({ who: v })} placeholder="Roles / team doing this manually today" autoFocus />
      </Field>

      <Field label="Trigger" hint="what kicks it off">
        <TextInput value={pm.trigger} onChange={(v) => setPM({ trigger: v })} placeholder="An email arrives / a ticket is filed / a nightly batch..." />
      </Field>

      <Field label="Definition of done">
        <TextArea value={pm.doneDefinition} onChange={(v) => setPM({ doneDefinition: v })} placeholder="What 'done' looks like for one run" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Frequency / volume">
          <TextInput value={pm.frequency} onChange={(v) => setPM({ frequency: v })} placeholder="~400/week, spikes Mondays" />
        </Field>
        <Field label="Cost when it goes wrong">
          <TextInput value={pm.costOfError} onChange={(v) => setPM({ costOfError: v })} placeholder="SLA breach, fine, lost customer..." />
        </Field>
      </div>

      <Field label="Systems / screens involved">
        <div className="space-y-2">
          {pm.systems.map((sys) => (
            <div key={sys.id} className="flex items-center gap-2">
              <TextInput value={sys.name} onChange={(v) => renameSystem(sys.id, v)} />
              <button
                type="button"
                onClick={() => removeSystem(sys.id)}
                className="rounded-md border border-slate-800 px-2 py-2 text-xs text-slate-500 hover:border-rose-500/50 hover:text-rose-400"
              >
                Remove
              </button>
            </div>
          ))}
          <AddSystem onAdd={addSystem} />
        </div>
      </Field>
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
    <div className="flex items-center gap-2">
      <input
        className="w-full rounded-md border border-dashed border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/70"
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
      <button type="button" onClick={commit} className="rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500/60">
        Add
      </button>
    </div>
  )
}
