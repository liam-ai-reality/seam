import { useEffect, useState } from 'react'
import { newScope, type StageKey } from './constants'
import { loadScopes, saveScopes } from './storage'
import { sampleScope } from './sample'
import type { Scope } from './types'
import { ScopeList } from './components/ScopeList'
import { Stepper } from './components/Stepper'

type View = { kind: 'list' } | { kind: 'scope'; id: string; stage: StageKey }

export function App() {
  const [scopes, setScopes] = useState<Scope[]>(loadScopes)
  const [view, setView] = useState<View>({ kind: 'list' })

  useEffect(() => {
    saveScopes(scopes)
  }, [scopes])

  const addScope = (s: Scope) => {
    setScopes((prev) => [s, ...prev])
    setView({ kind: 'scope', id: s.id, stage: 'process' })
  }

  const updateCurrent = (id: string) => (fn: (s: Scope) => Scope) =>
    setScopes((prev) => prev.map((s) => (s.id === id ? { ...fn(s), updatedAt: new Date().toISOString() } : s)))

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
