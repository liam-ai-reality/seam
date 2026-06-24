import { useEffect, useState } from 'react'
import { newScope, type StageKey } from './constants'
import { loadScopes, saveScopes, type SaveResult } from './storage'
import { sampleScope } from './sample'
import type { Scope } from './types'
import { ScopeList } from './components/ScopeList'
import { Stepper } from './components/Stepper'

type View = { kind: 'list' } | { kind: 'scope'; id: string; stage: StageKey }
type SaveError = Extract<SaveResult, { ok: false }>

export function App() {
  const [scopes, setScopes] = useState<Scope[]>(loadScopes)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [saveError, setSaveError] = useState<SaveError | null>(null)

  useEffect(() => {
    const result = saveScopes(scopes)
    setSaveError(result.ok ? null : result)
  }, [scopes])

  const addScope = (s: Scope) => {
    setScopes((prev) => [s, ...prev])
    setView({ kind: 'scope', id: s.id, stage: 'process' })
  }

  const updateCurrent = (id: string) => (fn: (s: Scope) => Scope) =>
    setScopes((prev) => prev.map((s) => (s.id === id ? { ...fn(s), updatedAt: new Date().toISOString() } : s)))

  return (
    <>
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      {body()}
    </>
  )

  function body() {
    if (view.kind === 'scope') {
      const scope = scopes.find((s) => s.id === view.id)
      if (!scope) return <ScopeListView />
      return (
        <Stepper
          scope={scope}
          update={updateCurrent(scope.id)}
          stage={view.stage}
          setStage={(stage) => setView({ kind: 'scope', id: scope.id, stage })}
          onBack={() => setView({ kind: 'list' })}
        />
      )
    }
    return <ScopeListView />
  }

  function ScopeListView() {
    return (
      <ScopeList
        scopes={scopes}
        onOpen={(id) => setView({ kind: 'scope', id, stage: 'process' })}
        onCreate={(name) => addScope(newScope(name))}
        onRename={(id, name) => setScopes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))}
        onDelete={(id) => setScopes((prev) => prev.filter((s) => s.id !== id))}
        onLoadSample={() => addScope(sampleScope())}
        onImport={addScope}
      />
    )
  }
}

function SaveErrorBanner({ error, onDismiss }: { error: SaveError; onDismiss: () => void }) {
  const heading = error.kind === 'quota' ? 'Storage full' : 'Storage unavailable'
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-start gap-3 border-b border-rose-500/40 bg-rose-950/90 px-4 py-3 font-mono text-xs text-rose-200 backdrop-blur"
    >
      <span className="select-none text-rose-400">⚠</span>
      <div className="flex-1">
        <span className="font-semibold uppercase tracking-wider text-rose-300">{heading}</span>
        <span className="ml-2 text-rose-200/90">{error.message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded border border-rose-500/40 px-2 py-0.5 text-rose-300 hover:bg-rose-500/20"
      >
        ✕
      </button>
    </div>
  )
}
