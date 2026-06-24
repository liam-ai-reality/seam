// Migration-safe persistence for capture, in its own 'draft' namespace (#14 /
// Phase 1). Two rules enforced here:
//
//  1. No un-redacted pasted text reaches localStorage unless 'send raw' was the
//     recorded choice. A persisted draft only ever holds a GatePass's `outgoing`
//     text (already redacted) plus its provenance — never CaptureDraft.source.
//  2. The 'send raw' provenance record is a timestamped entry in the scope's
//     provenance trail.
//
// Pure-ish: only touches localStorage, never the network, never throws into the
// caller (mirrors storage.ts SaveResult discipline).

import type { RedactionEntry, PiiKind } from './pii'
import type { SendRawRecord } from './capture'

const DRAFT_KEY = 'seam.draft.v1'

/** A capture provenance entry — appended to a scope's trail when sent. */
export interface CaptureProvenance {
  /** Whether the persisted text was redacted or sent raw. */
  mode: 'redacted' | 'raw'
  /** ISO timestamp of the send decision. */
  at: string
  /** The recorded send-raw choice, present only when mode === 'raw'. */
  sendRaw: SendRawRecord | null
  /** Per-class counts of what was redacted (empty when raw). */
  redactedCounts: Partial<Record<PiiKind, number>>
}

/**
 * An in-flight capture draft, safe to persist. `text` is the GatePass.outgoing —
 * redacted unless the recorded provenance says mode === 'raw'.
 */
export interface PersistedDraft {
  /** Schema version for migration safety. */
  v: 1
  /** The gated text. NEVER the raw paste unless provenance.mode === 'raw'. */
  text: string
  provenance: CaptureProvenance
}

/** Build a provenance entry from a confirmed send. Pure. */
export function buildProvenance(
  mode: 'redacted' | 'raw',
  redactions: RedactionEntry[],
  sendRaw: SendRawRecord | null,
  at: string,
): CaptureProvenance {
  const redactedCounts: Partial<Record<PiiKind, number>> = {}
  for (const e of redactions) {
    redactedCounts[e.kind] = (redactedCounts[e.kind] ?? 0) + 1
  }
  return { mode, at, sendRaw, redactedCounts }
}

export type DraftSaveResult = { ok: true } | { ok: false; message: string }

/** Persist an in-flight draft. Never throws; returns a result. */
export function saveDraft(draft: PersistedDraft): DraftSaveResult {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return { ok: true }
  } catch {
    return { ok: false, message: 'Draft could not be saved (storage unavailable).' }
  }
}

/** Load an in-flight draft, migration-safe. Returns null if absent/corrupt. */
export function loadDraft(): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return migrateDraft(parsed)
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

function migrateDraft(v: unknown): PersistedDraft | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.text !== 'string') return null
  const prov = o.provenance
  if (!prov || typeof prov !== 'object' || Array.isArray(prov)) return null
  const p = prov as Record<string, unknown>
  const mode = p.mode === 'raw' ? 'raw' : 'redacted'
  return {
    v: 1,
    text: o.text,
    provenance: {
      mode,
      at: typeof p.at === 'string' ? p.at : '',
      sendRaw:
        mode === 'raw' && p.sendRaw && typeof p.sendRaw === 'object'
          ? (p.sendRaw as SendRawRecord)
          : null,
      redactedCounts:
        p.redactedCounts && typeof p.redactedCounts === 'object' && !Array.isArray(p.redactedCounts)
          ? (p.redactedCounts as Partial<Record<PiiKind, number>>)
          : {},
    },
  }
}
