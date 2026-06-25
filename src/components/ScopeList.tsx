import { useMemo, useRef, useState } from 'react'
import { computePriors, type CorpusPriors } from '../corpus'
import { GRADERS, INTEGRATION_APPROACHES } from '../constants'
import { isReady, stageStatuses } from '../logic'
import { parseImportedScope } from '../storage'
import type { GraderType, IntegrationApproach, Scope } from '../types'

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

  // Read-only cross-assessment priors, derived purely on-device. Gated behind a
  // minimum count inside CorpusPriorsPanel (renders null until hasEnough).
  const priors = useMemo(() => computePriors(scopes), [scopes])

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

      <CorpusPriorsPanel priors={priors} />
    </div>
  )
}

/**
 * Read-only 'Across N scopes' panel. Renders NOTHING until there are at least
 * MIN_CHOSEN_SEAMS chosen seams (priors.hasEnough), so a fresh install with no
 * priors behaves exactly like v1. Every figure is labelled with the N it was
 * drawn from. This panel NEVER writes to a Scope.
 */
function CorpusPriorsPanel({ priors }: { priors: CorpusPriors }) {
  if (!priors.hasEnough) return null

  const seam = priors.chosenSeamScore
  const stage = priors.stageCompletion
  const grader = priors.graderChoice
  const systems = Object.entries(priors.approachBySystem)
    .filter(([, t]) => t.n > 0)
    .sort((a, b) => b[1].n - a[1].n)

  return (
    <div className="panel" style={{ marginTop: 'var(--space-6)' }}>
      <div className="panel-head">
        <h2>Across {priors.scopeCount} scopes</h2>
        <span className="card-sub">Local priors — derived on-device, read-only.</span>
      </div>

      <div className="grid cols-2" style={{ gap: 'var(--space-3)' }}>
        <div className="card stack" style={{ gap: '0.35rem' }}>
          <div className="card-h">Chosen-seam score</div>
          <div className="kpi">{seam.median.toFixed(2)}</div>
          <div className="card-sub">
            median · mean {seam.mean.toFixed(2)} · range {seam.min.toFixed(2)}–{seam.max.toFixed(2)}{' '}
            <span className="tag neutral">n={seam.n}</span>
          </div>
        </div>

        <div className="card stack" style={{ gap: '0.35rem' }}>
          <div className="card-h">Stages complete</div>
          <div className="kpi">{stage.median} / 5</div>
          <div className="card-sub">
            median · mean {stage.mean.toFixed(1)} <span className="tag neutral">n={stage.n}</span>
          </div>
        </div>
      </div>

      <div className="card stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <div className="card-h">
          Grader choice <span className="tag neutral">n={grader.n}</span>
        </div>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.2rem' }}>
          {(Object.keys(GRADERS) as GraderType[])
            .filter((g) => grader.counts[g] > 0)
            .map((g) => (
              <li key={g} className="spread">
                <span className="muted">{GRADERS[g].label}</span>
                <span className="tag auto">{grader.counts[g]}</span>
              </li>
            ))}
        </ul>
      </div>

      {systems.length > 0 && (
        <div className="card stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          <div className="card-h">Integration approach by system</div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0.35rem' }}>
            {systems.map(([name, table]) => (
              <li key={name} className="spread" style={{ alignItems: 'flex-start' }}>
                <span className="muted" style={{ textTransform: 'capitalize' }}>
                  {name || '(unnamed)'} <span className="tag neutral">n={table.n}</span>
                </span>
                <span className="row" style={{ gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {(Object.keys(INTEGRATION_APPROACHES) as IntegrationApproach[])
                    .filter((a) => table.counts[a] > 0)
                    .map((a) => (
                      <span key={a} className="tag auto">
                        {INTEGRATION_APPROACHES[a].label} {table.counts[a]}
                      </span>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
