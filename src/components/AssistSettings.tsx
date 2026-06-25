// The opt-in surface for the optional AI assist layer. This is CORE (always
// present, even with assist off) so the user can turn it ON; it makes NO network
// call itself and does not import src/assist/ — it only writes the config that
// src/assist/gate.ts (assistAvailable) reads. Actual model calls stay gated there.
//
// The key is a SECRET: stored only in this browser's localStorage, sent only to
// Anthropic directly by the BYO-key transport, never logged or committed. Browser
// storage carries some XSS risk — this is the dev/internal path; a hosted proxy is
// the production path.

import { useState } from 'react'

const KEY = 'seam.assist'

export interface AssistSettings {
  enabled: boolean
  apiKey: string
}

export function readAssistSettings(): AssistSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { enabled: false, apiKey: '' }
    const o = JSON.parse(raw) as { enabled?: unknown; apiKey?: unknown }
    return {
      enabled: o.enabled === true,
      apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
    }
  } catch {
    return { enabled: false, apiKey: '' }
  }
}

export function writeAssistSettings(s: AssistSettings): void {
  try {
    // Write exactly the shape assistAvailable() expects: { enabled, apiKey }.
    localStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, apiKey: s.apiKey }))
  } catch {
    /* storage unavailable — settings are in-memory only this session */
  }
}

export function clearAssistSettings(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function AssistSettings({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const initial = readAssistSettings()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const live = enabled && apiKey.trim().length > 0

  const save = () => {
    writeAssistSettings({ enabled, apiKey: apiKey.trim() })
    onChange()
    setOpen(false)
  }
  const disable = () => {
    clearAssistSettings()
    setEnabled(false)
    setApiKey('')
    onChange()
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="AI assist settings"
        title={live ? 'AI assist: on' : 'AI assist: off'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ position: 'relative' }}>
          ⚙
          <span className={`light ${live ? 'green' : ''}`} style={{ position: 'absolute', top: -2, right: -5, width: 6, height: 6, background: live ? 'var(--color-accent-3)' : 'var(--color-line)' }} aria-hidden />
        </span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 70 }} aria-hidden />
          <div className="panel" role="dialog" aria-label="AI assist settings" style={{ position: 'fixed', top: 'calc(var(--topbar-h) + 8px)', right: 'var(--space-4)', zIndex: 71, width: 'min(94vw, 30rem)' }}>
            <div className="panel-head">
              <h2>AI assist</h2>
              <span className={`tag ${live ? 'auto' : 'neutral'}`}>{live ? 'on' : 'off'}</span>
            </div>
            <p className="fine" style={{ marginBottom: 'var(--space-3)' }}>
              Optional, off by default. Your Anthropic API key is stored <b>only in this browser</b> and sent
              only to Anthropic directly (browser → api.anthropic.com) — never logged, committed, or sent
              elsewhere. Browser-stored keys carry some XSS risk: this is the dev/internal path; a hosted proxy
              is the production path.
            </p>

            <label className="field" style={{ margin: 0 }}>
              <div className="label-row"><span>Anthropic API key</span><span className="fine">sk-ant-…</span></div>
              <input
                type="password"
                value={apiKey}
                placeholder="sk-ant-..."
                autoComplete="off"
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>

            <label className="row" style={{ marginTop: 'var(--space-3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>Enable AI assist for this browser</span>
            </label>

            <div className="btn-row" style={{ marginTop: 'var(--space-4)' }}>
              <button type="button" className="btn sm" onClick={save} disabled={enabled && apiKey.trim().length === 0}>Save</button>
              <button type="button" className="btn ghost sm" onClick={disable}>Disable & clear key</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
