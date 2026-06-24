// The capture paste path (#14).
//
// CONTRACT: the network call is structurally DOWNSTREAM of the redaction-confirm
// step. You cannot reach `sendCapture` without first producing a `GatePass`, and
// the ONLY way to mint a `GatePass` is `confirmRedaction(...)`. There is no other
// constructor and no public field that fakes one — `GatePass` carries a private
// brand. So a test (and the type system) can prove the send path is unreachable
// without passing the gate.
//
// PURE except for the injected transport and clock. No DOM. Runs the detector
// regardless of assistAvailable(); only the actual send is gated (in client.ts).

import { runAssist } from './client'
import { groundSourced } from './ground'
import { detectPii, applyRedaction } from './pii'
import type { PiiSpan, RedactionEntry } from './pii'
import type { AssistModel, AssistTransport, Sourced } from './types'

// ---------- detection step (always runs, even offline) ----------

export interface CaptureDraft {
  /** The raw pasted text. Never leaves this object until the gate is passed. */
  readonly source: string
  /** Detected PII spans, in offset order. Surfaced even when assist is off. */
  readonly detected: PiiSpan[]
}

/**
 * Step 1 — accept pasted text and detect PII. This is the entry point the UI
 * calls on paste. It performs NO network and NO persistence; it just runs the
 * pure detector so the redaction panel can render hits. Works offline.
 */
export function beginCapture(source: string): CaptureDraft {
  return { source, detected: detectPii(source) }
}

// ---------- the gate ----------

/** A per-span keep/redact choice, plus the global send-raw escape hatch. */
export interface RedactionChoice {
  /** Map from span index (into draft.detected) → true=redact, false=keep. */
  decisions: Record<number, boolean>
  /**
   * Explicit, deliberate opt-out: send the ORIGINAL un-redacted text. Defaults
   * to false everywhere. When true a timestamped provenance record is minted.
   */
  sendRaw: boolean
}

/** A timestamped record that 'send raw' was deliberately chosen. */
export interface SendRawRecord {
  choice: 'send-raw'
  at: string // ISO timestamp
  /** How many PII spans the user knowingly sent un-redacted. */
  detectedCount: number
}

/**
 * The proof-of-gate token. Branded so it cannot be constructed anywhere except
 * confirmRedaction — this is what makes the send path unreachable without the
 * gate. Holds the text that will actually be sent/persisted (already redacted,
 * unless send-raw was chosen) and the provenance trail.
 */
export interface GatePass {
  /** Private brand — no external code can synthesize this. */
  readonly __gate: unique symbol
  /** The canonical text: sent to the transport AND persisted. */
  readonly outgoing: string
  /** Whether outgoing is the raw original (true) or redacted (false). */
  readonly raw: boolean
  /** Redaction entries (empty when send-raw). sourceSpans index into outgoing. */
  readonly redactions: RedactionEntry[]
  /** Present iff send-raw was chosen — a timestamped, recordable decision. */
  readonly sendRawRecord: SendRawRecord | null
}

/**
 * Step 2 — THE GATE. Turn a draft + the human's choices into a GatePass. This is
 * the only producer of a GatePass; sendCapture demands one. By default (an empty
 * choice) every detected span is redacted — redact-all is the default.
 *
 * - Redacted path: outgoing = source with chosen spans replaced; sourceSpans
 *   downstream index into THIS redacted text; no un-redacted text escapes.
 * - Send-raw path: requires sendRaw===true; mints a timestamped SendRawRecord;
 *   outgoing = the original text (the only way raw text proceeds).
 *
 * `now` is injected for deterministic tests.
 */
export function confirmRedaction(
  draft: CaptureDraft,
  choice: RedactionChoice,
  now: () => Date = () => new Date(),
): GatePass {
  if (choice.sendRaw) {
    const record: SendRawRecord = {
      choice: 'send-raw',
      at: now().toISOString(),
      detectedCount: draft.detected.length,
    }
    return makePass({
      outgoing: draft.source,
      raw: true,
      redactions: [],
      sendRawRecord: record,
    })
  }

  // Redact-all is the DEFAULT: a span is kept only if explicitly set to false.
  const result = applyRedaction(draft.source, draft.detected, (span) => {
    const idx = draft.detected.indexOf(span)
    return choice.decisions[idx] !== false
  })

  return makePass({
    outgoing: result.text,
    raw: false,
    redactions: result.entries,
    sendRawRecord: null,
  })
}

/**
 * The default choice the UI starts from: redact every detected span, never send
 * raw. The panel mutates a copy of this; the banner reflects it.
 */
export function defaultChoice(draft: CaptureDraft): RedactionChoice {
  const decisions: Record<number, boolean> = {}
  draft.detected.forEach((_, i) => {
    decisions[i] = true
  })
  return { decisions, sendRaw: false }
}

function makePass(p: Omit<GatePass, '__gate'>): GatePass {
  // The brand is never read; it only exists to make the type unforgeable.
  return p as GatePass
}

// ---------- send (structurally downstream of the gate) ----------

export interface CaptureSchema {
  /** JSON Schema for the structured extraction result the caller wants. */
  schema: Record<string, unknown>
  /** System prompt for the extraction. */
  system?: string
  /** opus-4-8 for extraction by locked decision; overridable. */
  model?: AssistModel
}

export interface CaptureOutcome<T = unknown> {
  /** The grounded structured result (sourceSpans index into `persisted`). */
  result: Sourced<T> | null
  /** The exact text that was sent AND must be persisted — never the raw paste
   *  unless send-raw was chosen on the GatePass. */
  persisted: string
  /** Carried through so the caller can write provenance. */
  sendRawRecord: SendRawRecord | null
  redactions: RedactionEntry[]
}

/**
 * Step 3 — SEND. Requires a GatePass: there is no way to call this without first
 * passing confirmRedaction. It sends `pass.outgoing` (never the raw paste unless
 * send-raw was chosen), runs the model (opus-4-8 default for extraction), then
 * grounds the result against the SAME outgoing text so cited sourceSpans index
 * into the redacted/persisted string.
 *
 * runAssist itself refuses when assistAvailable() is false, so this remains
 * offline-safe; the detector + gate above run regardless.
 */
export async function sendCapture<T = unknown>(
  pass: GatePass,
  cfg: CaptureSchema,
  transport: AssistTransport,
): Promise<CaptureOutcome<T>> {
  const res = await runAssist(
    {
      system: cfg.system,
      messages: [{ role: 'user', content: pass.outgoing }],
      schema: cfg.schema,
      model: cfg.model ?? 'claude-opus-4-8',
    },
    transport,
  )

  const raw = (res.toolInput?.sourced ?? null) as Sourced<T> | null
  const result = raw ? groundSourced(pass.outgoing, raw) : null

  return {
    result,
    persisted: pass.outgoing,
    sendRawRecord: pass.sendRawRecord,
    redactions: pass.redactions,
  }
}
