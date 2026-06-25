import { Suspense, lazy, useEffect, useReducer, useState } from 'react'
import { newScope, type StageKey } from './constants'
import { loadScopes, saveScopes, type SaveResult } from './storage'
import { sampleScope } from './sample'
import type { Scope } from './types'
import { AssistBoundary } from './components/AssistBoundary'
import { AssistSettings } from './components/AssistSettings'
import { ScopeList } from './components/ScopeList'
import { Stepper } from './components/Stepper'

type View = { kind: 'list' } | { kind: 'scope'; id: string; stage: StageKey }
type SaveError = Extract<SaveResult, { ok: false }>
type Theme = 'dark' | 'light'

const THEME_KEY = 'seam.theme'

// The assist surface is OPTIONAL and OFF by default — assistAvailable() returns
// false, so it makes zero network calls and never changes v1's behaviour (#14).
// It is code-split into its own lazy chunk; v1 reaches it only through the guarded
// dynamic import below, which falls back to a null component if the chunk fails to
// load. v1 is fully functional and offline-safe without it.
type CapturePanelModule = typeof import('./assist/components/CapturePanel')
const CapturePanel = lazy<CapturePanelModule['default']>(() =>
  import('./assist/components/CapturePanel').catch(
    () => ({ default: () => null }) as unknown as CapturePanelModule,
  ),
)

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function App() {
  const [scopes, setScopes] = useState<Scope[]>(loadScopes)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [saveError, setSaveError] = useState<SaveError | null>(null)
  const [theme, setTheme] = useState<Theme>(readTheme)
  // Re-render the tree after assist settings change so assistAvailable() is re-read.
  const [, recheckAssist] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const result = saveScopes(scopes)
    setSaveError(result.ok ? null : result)
  }, [scopes])

  // Theme: default dark/Midnight = no attribute; light/Daybreak = data-theme="light".
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* storage unavailable — theme is in-memory only */
    }
  }, [theme])

  const addScope = (s: Scope) => {
    setScopes((prev) => [s, ...prev])
    setView({ kind: 'scope', id: s.id, stage: 'process' })
  }

  const updateCurrent = (id: string) => (fn: (s: Scope) => Scope) =>
    setScopes((prev) => prev.map((s) => (s.id === id ? { ...fn(s), updatedAt: new Date().toISOString() } : s)))

  const activeScope = view.kind === 'scope' ? scopes.find((s) => s.id === view.id) : undefined

  return (
    <>
      <header className="topbar no-print">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); setView({ kind: 'list' }) }}>
          Reality<b>OS</b>
        </a>
        <span className="crumb">/ assessments · scoping</span>
        {activeScope && <span className="scope-chip">{activeScope.name}</span>}
        <span className="spacer" />
        <AssistSettings onChange={recheckAssist} />
        <button
          type="button"
          className="icon-btn"
          aria-label="Switch theme"
          title="Toggle light / dark"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </header>
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <main className="surface">{body()}</main>
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
      <>
        <ScopeList
          scopes={scopes}
          onOpen={(id) => setView({ kind: 'scope', id, stage: 'process' })}
          onCreate={(name) => addScope(newScope(name))}
          onRename={(id, name) => setScopes((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))}
          onDelete={(id) => setScopes((prev) => prev.filter((s) => s.id !== id))}
          onLoadSample={() => addScope(sampleScope())}
          onImport={addScope}
        />
        <div className="wrap" style={{ marginTop: 'var(--space-6)' }}>
          <AssistBoundary>
            <Suspense fallback={null}>
              <CapturePanel />
            </Suspense>
          </AssistBoundary>
        </div>
      </>
    )
  }
}

function SaveErrorBanner({ error, onDismiss }: { error: SaveError; onDismiss: () => void }) {
  const heading = error.kind === 'quota' ? 'Storage full' : 'Storage unavailable'
  return (
    <div role="alert" className="alert-bar no-print">
      <span className="mark" aria-hidden>⚠</span>
      <div style={{ flex: 1 }}>
        <span className="alert-h">{heading}</span>
        <span className="alert-msg" style={{ marginLeft: '0.5rem' }}>{error.message}</span>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="btn ghost sm">
        ✕
      </button>
    </div>
  )
}
