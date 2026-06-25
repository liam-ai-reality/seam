// CaptureCopilot (#15) — the single per-scope entry the app lazy-loads for the
// "Paste to pre-fill" flow. It owns the whole pipeline and guarantees ordering:
//
//   paste -> RedactionGate (PII gate, #14, ALWAYS) -> [assistAvailable()] ->
//   runCapture (extraction) -> CaptureReview (accept/edit) -> Scope edits.
//
// The model call (runCapture) is reached ONLY after a GatePass exists (so the
// PII gate ran) AND only when assistAvailable() is true. Offline, the gate still
// runs and the user is told extraction is unavailable; nothing is sent.
//
// The assist layer is OFF by default (assistAvailable() is false), so it makes
// zero network calls and does not change v1's behaviour. App reaches this only
// through a guarded dynamic import behind an AssistBoundary, which falls back to a
// null component if the chunk fails to load; v1 stays fully functional and
// offline-safe without it.

import { useState } from 'react'
import type { Scope } from '../../types'
import { assistAvailable } from '../gate'
import { CaptureEntry } from './CaptureEntry'
import { CaptureReview } from './CaptureReview'
import { runCapture, type CaptureResult } from '../tasks/capture'
import { byoKeyTransport } from '../transports/byoKeyTransport'
import type { ScopeReducer } from '../accept'
import type { AssistTransport } from '../types'

export interface CaptureCopilotProps {
  scope: Scope
  update: (fn: ScopeReducer) => void
  /** Injectable for tests; defaults to the gated BYO-key transport. */
  transport?: AssistTransport
}

type Phase =
  | { kind: 'entry' }
  | { kind: 'working' }
  | { kind: 'review'; result: CaptureResult }
  | { kind: 'error'; message: string }

/**
 * Build the real transport from the gate config (the BYO key the user opted in
 * with). Only ever invoked after assistAvailable() is true, so the key exists.
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

/** Default export so App can `const m = await import(...); m.default`. */
export default function CaptureCopilot({ scope, update, transport }: CaptureCopilotProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'entry' })

  if (phase.kind === 'review') {
    return (
      <CaptureReview
        result={phase.result}
        scope={scope}
        update={update}
        onDone={() => setPhase({ kind: 'entry' })}
      />
    )
  }

  if (phase.kind === 'working') {
    return (
      <div className="panel" aria-busy="true">
        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Reading your notes…</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <CaptureEntry
        onGated={async (pass) => {
          // The gate ran (we hold a GatePass). Only NOW, and only when assist is
          // enabled, do we send the gated text to the model.
          if (!assistAvailable()) {
            setPhase({
              kind: 'error',
              message: 'Extraction is offline. Enable assist (seam.assist) to pre-fill from notes.',
            })
            return
          }
          setPhase({ kind: 'working' })
          try {
            const result = await runCapture(pass, transport ?? defaultTransport())
            setPhase({ kind: 'review', result })
          } catch (e) {
            setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Extraction failed.' })
          }
        }}
      />
      {phase.kind === 'error' && (
        <div role="status" className="toast alert" style={{ position: 'static', maxWidth: 'none' }}>
          {phase.message}
        </div>
      )}
    </div>
  )
}
