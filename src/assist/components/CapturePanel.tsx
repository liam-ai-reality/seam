// The lazy-loaded capture surface App mounts behind a dynamic import (#14). It
// is the single export the app reaches into src/assist/ for capture; everything
// else (detector, gate, store) is reached through it. The assist layer is OFF by
// default (assistAvailable() is false), so it makes zero network calls and does
// not change v1's behaviour. App reaches it ONLY via a guarded `import('...')`
// that falls back to a null component if the chunk fails to load, so v1 stays
// fully functional and offline-safe without it.
//
// On a gated confirmation it persists the safe (redacted) draft to the 'draft'
// namespace and surfaces the provenance so the host can record it. The actual
// model send is left to a later phase; the gate + persistence contract is what
// #14 delivers.

import { useState } from 'react'
import { CaptureEntry } from './CaptureEntry'
import { saveDraft, type CaptureProvenance, type PersistedDraft } from '../captureStore'

export interface CapturePanelProps {
  /** Notified with the safe-to-persist draft + provenance after the gate. */
  onCaptured?: (persistable: PersistedDraft) => void
}

/** Default export so App can `const m = await import(...); m.default`. */
export default function CapturePanel({ onCaptured }: CapturePanelProps) {
  const [last, setLast] = useState<CaptureProvenance | null>(null)

  return (
    <div className="stack">
      <CaptureEntry
        onGated={(_pass, persistable) => {
          // Persist ONLY the gated (redacted, unless send-raw) text.
          saveDraft(persistable)
          setLast(persistable.provenance)
          onCaptured?.(persistable)
        }}
      />
      {last && <CapturedReceipt provenance={last} />}
    </div>
  )
}

function CapturedReceipt({ provenance }: { provenance: CaptureProvenance }) {
  const total = Object.values(provenance.redactedCounts).reduce((a, b) => a + (b ?? 0), 0)
  return (
    <div role="status" className="toast" style={{ position: 'static', maxWidth: 'none' }}>
      {provenance.mode === 'raw' ? (
        <>
          <b>Sent raw</b> at {new Date(provenance.at).toLocaleTimeString()} — recorded in
          provenance.
        </>
      ) : (
        <>
          <b>Redacted &amp; captured</b> — {total} detected PII item(s) redacted before storage.
        </>
      )}
    </div>
  )
}
