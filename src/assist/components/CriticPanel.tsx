// Scope Critic panel (#17) — the NON-BLOCKING 'Critic findings' surface shown
// BESIDE the readiness gate in StageReady. It runs the advisory critic over the
// generated brief + deterministic readinessGaps and lists severity-ranked,
// capped findings, each with jump-to-stage (via setStage). Dismissals are sticky
// for the SESSION.
//
// ADVISORY ONLY: this component cannot change the Scope or isReady(). It calls
// `update` NOWHERE — there is no accept path. The only action a finding offers is
// "jump to stage" (navigation) and "dismiss" (hide for the session). The
// deterministic readiness gate next to it stays the sole authority on readiness.
//
// OFF BY DEFAULT + LAZY: App reaches this only through a guarded dynamic import
// behind an AssistBoundary (see ReadyCritic.tsx → StageReady). assistAvailable()
// is false by default, so AssistPanel disables the trigger and no network call is
// made; v1 is fully functional and offline-safe without it.

import { useState } from 'react'
import type { StageKey } from '../../constants'
import { generateBrief } from '../../brief'
import { readinessGaps } from '../../logic'
import type { Scope } from '../../types'
import { runCritique, type CriticFinding, type CritiqueResult, type Severity } from '../tasks/critique'
import { byoKeyTransport } from '../transports/byoKeyTransport'
import type { AssistTransport } from '../types'
import { AssistPanel } from './AssistPanel'

export interface CriticPanelProps {
  scope: Scope
  /** Jump-to-stage from a finding. StageReadyProps already supplies this. */
  setStage: (k: StageKey) => void
  /** Injectable for tests; defaults to the gated BYO-key transport. */
  transport?: AssistTransport
}

const SEVERITY_TAG: Record<Severity, string> = {
  blocker: 'tag',
  major: 'tag',
  minor: 'tag neutral',
}
const SEVERITY_LIGHT: Record<Severity, string> = {
  blocker: 'light red',
  major: 'light amber',
  minor: 'light',
}

/**
 * Build the real transport from the gate config. Only ever invoked after
 * assistAvailable() is true (AssistPanel disables the trigger otherwise), so the
 * key exists. Mirrors CaptureCopilot.defaultTransport.
 */
function defaultTransport(): AssistTransport {
  let apiKey = ''
  try {
    const raw = localStorage.getItem('seam.assist')
    const cfg = raw ? (JSON.parse(raw) as { apiKey?: unknown }) : {}
    if (typeof cfg.apiKey === 'string') apiKey = cfg.apiKey
  } catch {
    /* malformed config — assistAvailable() would already be false */
  }
  return byoKeyTransport({ apiKey })
}

/** Default export so StageReady can lazy-import `m.default`. */
export default function CriticPanel({ scope, setStage, transport }: CriticPanelProps) {
  // Sticky-for-the-session dismissals: keyed by finding.key, held in component
  // state so they survive re-runs within the session but reset on reload.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  return (
    <AssistPanel<CritiqueResult>
      title="Critic findings"
      blurb="An adversarial second read of the whole scope. Advisory only — it never changes readiness or edits the scope."
      buttonLabel="Review the scope"
      loadingLabel="Reviewing…"
      run={() => runCritique(generateBrief(scope), readinessGaps(scope), transport ?? defaultTransport())}
    >
      {(result, redo) => {
        const visible = result.findings.filter((f) => !dismissed.has(f.key))
        const dismiss = (key: string) => setDismissed((prev) => new Set(prev).add(key))
        return (
          <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {result.overall && <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{result.overall}</p>}

            {visible.length === 0 ? (
              <div className="empty">
                <div className="big">No open findings</div>
                <p className="fine">Nothing the critic flags is still open. Readiness is unaffected either way.</p>
              </div>
            ) : (
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 'var(--space-2)' }}>
                {visible.map((f) => (
                  <FindingRow key={f.key} f={f} onJump={() => setStage(f.stageKey)} onDismiss={() => dismiss(f.key)} />
                ))}
              </ul>
            )}

            <div className="btn-row">
              <button type="button" className="btn ghost sm" onClick={redo}>Re-run</button>
            </div>
          </div>
        )
      }}
    </AssistPanel>
  )
}

function FindingRow({ f, onJump, onDismiss }: { f: CriticFinding; onJump: () => void; onDismiss: () => void }) {
  return (
    <li className="card stack" style={{ gap: 'var(--space-2)' }}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <span className={SEVERITY_TAG[f.severity]}>
            <span className={SEVERITY_LIGHT[f.severity]} aria-hidden /> {f.severity}
          </span>
          {f.confidence === 'high' && <span className="tag assist" title="Corroborated by a second model">confirmed</span>}
        </div>
        <button type="button" className="btn ghost sm" onClick={onDismiss} aria-label="Dismiss finding">Dismiss</button>
      </div>
      <div className="card-h">{f.claim}</div>
      {f.suggestedFix && <div className="card-sub">Fix: {f.suggestedFix}</div>}
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {f.fields.map((field) => (
          <span key={field} className="cite" aria-hidden>{field}</span>
        ))}
        <button type="button" className="btn ghost sm" onClick={onJump}>Jump to stage →</button>
      </div>
    </li>
  )
}
