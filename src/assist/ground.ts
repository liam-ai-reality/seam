// Verbatim grounding. PURE: no model calls. A span is only trustworthy if its
// quote is a literal substring of the source AT the offsets it claims.

import type { Sourced, SourceSpan } from './types'

/**
 * True iff `source` contains `span.quote` exactly at [charStart, charEnd).
 * Off-by-one offsets, a quote that isn't present, or a length mismatch all
 * return false. Pure substring + offset check — no fuzzy matching.
 */
export function verbatimCheck(source: string, span: SourceSpan): boolean {
  const { quote, charStart, charEnd } = span
  if (charStart < 0 || charEnd > source.length || charStart >= charEnd) return false
  if (charEnd - charStart !== quote.length) return false
  return source.slice(charStart, charEnd) === quote
}

/**
 * Demote a Sourced value the model can't back up. Spans that fail the verbatim
 * check are dropped; if ANY span was dropped the value is no longer fully
 * grounded, so confidence is forced down to 'low'. A value with no surviving
 * spans is unsourced — also 'low'.
 */
export function groundSourced<T>(source: string, sourced: Sourced<T>): Sourced<T> {
  const kept = sourced.sourceSpans.filter((span) => verbatimCheck(source, span))
  const droppedAny = kept.length !== sourced.sourceSpans.length
  const unsourced = kept.length === 0
  const confidence = droppedAny || unsourced ? 'low' : sourced.confidence
  return {
    ...sourced,
    sourceSpans: kept,
    confidence,
  }
}
