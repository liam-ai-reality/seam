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
    <div className="wrap">
      <div className="view-head">
        <span className="eyebrow">Assessment scoping</span>
        <h1>Seam</h1>
        <p>Scope a manual process into a deployable Assignment — five stages, four pillars, one brief.</p>
      </div>

      {/* create */}
      <div className="row" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: '12.5rem' }}>
          <input
            value={draft}
            placeholder="New scope name (customer / process)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
        </div>
        <button onClick={create} className="btn">+ New scope</button>
        <button onClick={() => fileRef.current?.click()} className="btn ghost">Import JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importFile(f)
            e.target.value = ''
          }}
        />
      </div>

      {/* list */}
      {scopes.length === 0 ? (
        <div className="empty">
          <div className="big">No scopes yet</div>
          <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>Start one above, or load the worked example.</p>
          <button onClick={onLoadSample} className="btn ghost">Load the sample scope</button>
        </div>
      ) : (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 'var(--space-2)' }}>
          {scopes.map((s) => (
            <ScopeRow key={s.id} scope={s} onOpen={onOpen} onRename={onRename} onDelete={onDelete} />
          ))}
        </ul>
      )}

      {scopes.length > 0 && (
        <button onClick={onLoadSample} className="cite" style={{ marginTop: 'var(--space-4)' }}>
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
    <li className="card hover spread" style={{ gap: 'var(--space-3)' }}>
      {editing ? (
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { onRename(scope.id, name.trim() || scope.name); setEditing(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { onRename(scope.id, name.trim() || scope.name); setEditing(false) } }}
          />
        </div>
      ) : (
        <button onClick={() => onOpen(scope.id)} className="row scope-open" style={{ flex: 1, border: 0, background: 'transparent', padding: 0, margin: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%' }}>
          <div className="card-h">{scope.name}</div>
          <div className="card-sub" style={{ marginTop: '0.15rem' }}>{done}/5 stages · updated {new Date(scope.updatedAt).toLocaleDateString()}</div>
        </button>
      )}
      {ready && (
        <span className="tag auto"><span className="light green" aria-hidden /> ready</span>
      )}
      <button onClick={() => setEditing(true)} className="btn ghost sm">rename</button>
      <button
        onClick={() => { if (confirm(`Delete "${scope.name}"?`)) onDelete(scope.id) }}
        className="btn danger sm"
      >
        delete
      </button>
    </li>
  )
}
