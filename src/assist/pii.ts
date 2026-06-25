// PURE, offline PII detector. No model call, no network, no DOM. Runs the same
// whether or not assistAvailable() is true — it is the gate the capture paste
// path is forced through BEFORE anything is sent or persisted (#14).
//
// Conservative-by-design: it would rather over-flag (a name-like token) than let
// an email or card number through. The human reviews every hit in the redaction
// panel; redact-all is the default. This module only FINDS spans and APPLIES a
// redaction map; the decision to keep/redact/send-raw lives in capture.ts.

/** The classes of personal data we surface. 'name' is a heuristic guess. */
export type PiiKind =
  | 'email'
  | 'phone'
  | 'card'
  | 'ssn'
  | 'account' // account / policy / member numbers
  | 'name'

/** A detected span of `source`, half-open [start, end), with its class. */
export interface PiiSpan {
  kind: PiiKind
  /** The exact matched substring (verbatim slice of the source). */
  text: string
  start: number
  end: number
}

/**
 * Human-readable label for the placeholder a redacted span becomes. Kept short
 * and stable so redacted text stays readable and dedup keys are stable.
 */
const LABELS: Record<PiiKind, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  card: 'CARD',
  ssn: 'SSN',
  account: 'ACCOUNT',
  name: 'NAME',
}

export function placeholderFor(kind: PiiKind): string {
  return `[${LABELS[kind]}_REDACTED]`
}

// ---------- detectors ----------
//
// Order matters: the most specific / highest-risk classes run first so that an
// overlapping low-confidence 'name' match never wins over an email or a card.

interface Matcher {
  kind: PiiKind
  re: RegExp
  /** Optional extra gate (e.g. Luhn for cards) run on the raw match text. */
  accept?: (raw: string) => boolean
}

// Emails — standard local@domain.tld.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// Phone numbers — international and NANP-ish. Requires enough digits to avoid
// catching plain quantities; allows +, spaces, dots, dashes, parens. Two shapes:
//   - prefixed: a +CC and/or (area) prefix, then 1+ grouped runs (e.g.
//     "+1 (415) 555-0132");
//   - bare: no prefix, so demand 2+ separators (e.g. "020 7946 0958") to avoid
//     swallowing plain "1234 5678"-style quantities with too few groups.
const PHONE =
  /(?:(?:\+\d{1,3}[\s.-]?)?\(\d{1,4}\)[\s.-]?\d{2,4}(?:[\s.-]\d{2,4})+|\+\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]\d{2,4})+|\d{2,4}(?:[\s.-]\d{2,4}){2,4})/g

// Card-like: 13–19 digits, optionally grouped in 4s by space/dash. Luhn-gated.
const CARD = /\b(?:\d[ -]?){13,19}\b/g

// US SSN: 3-2-4 with separators (we don't match 9 bare digits to avoid clashing
// with cards/accounts; the separated form is the recognisable PII shape).
const SSN = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g

// Account / policy / member numbers: an explicit label followed by an id, OR a
// bare alphanumeric id of 6+ chars containing at least one digit (claim refs,
// policy nos). The labelled form is matched generously; the bare form is gated
// to avoid eating ordinary words.
const ACCOUNT_LABELLED =
  /\b(?:account|acct|policy|member|claim|customer|reference|ref|invoice|iban)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*[A-Za-z0-9][A-Za-z0-9-]{3,}/gi
const ACCOUNT_BARE = /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]{6,}\b/g

// Obvious person names: two (or three) Capitalised words in a row. Heuristic —
// it will flag "Acme Corporation"; that is acceptable (human can keep it).
const NAME = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g

/** Luhn check for card-like numbers — rejects random digit runs. */
function luhnValid(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48 // '0'
    if (d < 0 || d > 9) return false
    if (alt) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

const MATCHERS: Matcher[] = [
  { kind: 'email', re: EMAIL },
  { kind: 'ssn', re: SSN },
  { kind: 'card', re: CARD, accept: luhnValid },
  { kind: 'account', re: ACCOUNT_LABELLED },
  { kind: 'phone', re: PHONE },
  { kind: 'account', re: ACCOUNT_BARE },
  { kind: 'name', re: NAME },
]

/**
 * Detect PII spans in `source`. Pure: same input → same output, no globals.
 * Overlapping matches are resolved in MATCHERS order (earlier = higher
 * priority), so an email is never also reported as a name/account. Returns
 * spans sorted by start offset.
 */
export function detectPii(source: string): PiiSpan[] {
  const claimed: PiiSpan[] = []

  for (const m of MATCHERS) {
    // Fresh regex per pass so lastIndex state never leaks between calls.
    const re = new RegExp(m.re.source, m.re.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      const raw = match[0]
      if (raw.length === 0) {
        re.lastIndex++ // guard against zero-width loops
        continue
      }
      const start = match.index
      const end = start + raw.length
      if (m.accept && !m.accept(raw)) continue
      if (overlaps(claimed, start, end)) continue
      claimed.push({ kind: m.kind, text: raw, start, end })
    }
  }

  return claimed.sort((a, b) => a.start - b.start)
}

function overlaps(spans: PiiSpan[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start)
}

// ---------- redaction ----------

/** A record of one span being redacted: where it was and what replaced it. */
export interface RedactionEntry {
  kind: PiiKind
  /** Offsets into the ORIGINAL source. */
  originalStart: number
  originalEnd: number
  /** The verbatim text that was removed. */
  original: string
  /** The placeholder it became. */
  placeholder: string
}

export interface RedactionResult {
  /** The redacted text — this is what gets sent and persisted. */
  text: string
  /** What was replaced, in original-offset order. */
  entries: RedactionEntry[]
}

/**
 * Apply a redaction to `source`, replacing each chosen span with its
 * placeholder. `redact(span)` decides per-span whether to redact (true) or keep
 * (false). Spans are applied right-to-left so earlier offsets stay valid. Pure.
 *
 * The returned `text` is the canonical artefact: the only string that should be
 * sent to a transport or written to localStorage (unless 'send raw' is chosen
 * upstream — see capture.ts). cited sourceSpans must index into THIS text.
 */
export function applyRedaction(
  source: string,
  spans: PiiSpan[],
  redact: (span: PiiSpan) => boolean,
): RedactionResult {
  const chosen = spans.filter(redact).sort((a, b) => a.start - b.start)
  const entries: RedactionEntry[] = []
  let text = source
  // Apply in reverse so splice offsets remain valid for earlier spans.
  for (let i = chosen.length - 1; i >= 0; i--) {
    const span = chosen[i]
    if (!span) continue
    const placeholder = placeholderFor(span.kind)
    text = text.slice(0, span.start) + placeholder + text.slice(span.end)
  }
  // Build entries in forward order for a readable provenance trail.
  for (const span of chosen) {
    entries.push({
      kind: span.kind,
      originalStart: span.start,
      originalEnd: span.end,
      original: span.text,
      placeholder: placeholderFor(span.kind),
    })
  }
  return { text, entries }
}
