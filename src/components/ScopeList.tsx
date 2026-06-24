import { useRef, useState } from 'react'
import { isReady, stageStatuses } from '../logic'
import { parseImportedScope } from '../storage'
import type { Scope } from '../types'

interface Props {
  scopes: Scope[]
  onOpen: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onLoadSample: () => void
  onImport: (scope: Scope) => void
}

export function ScopeList({ scopes, onOpen, onCreate, onRename, onDelete, onLoadSample, onImport }: Props) {
  const [draft, setDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const create = () => {
    const name = draft.trim() || 'Untitled scope'
    onCreate(name)
    setDraft('')
  }

  const importFile = async (file: File) => {
    try {
      onImport(parseImportedScope(await file.text()))
    } catch {
      alert('That file is not a valid Seam scope.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-mono text-2xl font-bold tracking-tight text-slate-100">
          seam<span className="text-cyan-400">.</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Scope a manual process into a deployable Assignment — five stages, four pillars, one brief.</p>
      </header>

      {/* create */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          className="min-w-50 flex-1 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/70"
          value={draft}
          placeholder="New scope name (customer / process)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button onClick={create} className="rounded-md border border-cyan-500/60 bg-cyan-500/15 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/25">
          + New scope
        </button>
        <button onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300 hover:border-slate-600">
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* list */}
      {scopes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 p-10 text-center">
          <p className="text-sm text-slate-500">No scopes yet.</p>
          <button onClick={onLoadSample} className="mt-3 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-cyan-500/60">
            Load the sample scope
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {scopes.map((s) => (
            <ScopeRow key={s.id} scope={s} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {scopes.length > 0 && (
        <button onClick={onLoadSample} className="mt-4 text-xs text-slate-600 hover:text-cyan-400">
          + load the sample scope
        </button>
      )}
    </div>
  )
}

function ScopeRow({ scope, onOpen, onRename, onDelete }: { scope: Scope; onOpen: (id: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scope.name)
  const done = stageStatuses(scope).filter((s) => s.complete).length
  const ready = isReady(scope)

  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 hover:border-slate-700">
      {editing ? (
        <input
          autoFocus
          className="flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500/70"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { onRename(scope.id, name.trim() || scope.name); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onRename(scope.id, name.trim() || scope.name); setEditing(false) } }}
        />
      ) : (
        <button onClick={() => onOpen(scope.id)} className="flex-1 text-left">
          <div className="text-sm font-medium text-slate-100">{scope.name}</div>
          <div className="mt-0.5 text-xs text-slate-500">{done}/5 stages · updated {new Date(scope.updatedAt).toLocaleDateString()}</div>
        </button>
      )}
      {ready && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">ready</span>}
      <button onClick={() => setEditing(true)} className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-slate-600 hover:text-slate-300">rename</button>
      <button
        onClick={() => { if (confirm(`Delete "${scope.name}"?`)) onDelete(scope.id) }}
        className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500 hover:border-rose-500/50 hover:text-rose-400"
      >
        delete
      </button>
    </li>
  )
}
