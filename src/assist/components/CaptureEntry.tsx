// The capture paste path entry, guarded by the redaction gate (#14).
//
// Flow (the ONLY flow): paste → beginCapture (detect, runs offline) → the
// RedactionGate renders → confirmRedaction mints a GatePass → onGated. There is
// no UI affordance that reaches a send or a persist without the gate; the parent
// receives only a GatePass + a safe-to-persist draft.
//
// This component performs NO network itself. assistAvailable() only governs
// whether a downstream send is offered; the detector + gate run regardless, so
// the PII review surfaces even fully offline (AC5).

import { useState } from 'react'
import { assistAvailable } from '../gate'
import { beginCapture, type CaptureDraft, type GatePass } from '../capture'
import { buildProvenance, type PersistedDraft } from '../captureStore'
import { RedactionGate } from './RedactionGate'

type Phase =
  | { kind: 'paste' }
  | { kind: 'review'; draft: CaptureDraft }

export interface CaptureEntryProps {
  /**
   * Receives the gate-passing token AND the safe-to-persist draft (text already
   * redacted unless send-raw was the recorded choice). The parent sends &/or
   * persists; this component guarantees the gate ran first.
   */
  onGated: (pass: GatePass, persistable: PersistedDraft) => void
}

export function CaptureEntry({ onGated }: CaptureEntryProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'paste' })
  const [text, setText] = useState('')

  const review = () => {
    if (!text.trim()) return
    setPhase({ kind: 'review', draft: beginCapture(text) })
  }

  if (phase.kind === 'review') {
    return (
      <RedactionGate
        draft={phase.draft}
        onCancel={() => setPhase({ kind: 'paste' })}
        onConfirm={(pass) => {
          const at = pass.sendRawRecord?.at ?? new Date().toISOString()
          const persistable: PersistedDraft = {
            v: 1,
            text: pass.outgoing,
            provenance: buildProvenance(
              pass.raw ? 'raw' : 'redacted',
              pass.redactions,
              pass.sendRawRecord,
              at,
            ),
          }
          onGated(pass, persistable)
          setPhase({ kind: 'paste' })
          setText('')
        }}
      />
    )
  }

  return (
    <div className="panel stack" aria-label="Capture from pasted text">
      <div className="panel-head">
        <h2>Capture from pasted notes</h2>
        <span className="tag assist">
          <span className="light cyan" aria-hidden /> AI capture
        </span>
      </div>
      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
        Paste raw notes, an email, or a transcript. Nothing is sent until you review and clear
        detected PII on the next screen.
        {!assistAvailable() && ' Extraction is offline right now — PII review still runs.'}
      </p>
      <div className="field" style={{ margin: 0 }}>
        <textarea
          rows={6}
          value={text}
          placeholder="Paste the process notes here…"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn sm" onClick={review} disabled={!text.trim()}>
          Review for PII →
        </button>
      </div>
    </div>
  )
}
