import { describe, expect, it } from 'vitest'
import { detectPii, applyRedaction, placeholderFor } from './pii'
import type { PiiKind } from './pii'

function kinds(source: string): PiiKind[] {
  return detectPii(source).map((s) => s.kind)
}

describe('pii — detectPii detects the listed classes (#14)', () => {
  it('detects emails', () => {
    const spans = detectPii('reach me at jane.doe@acme.co please')
    const email = spans.find((s) => s.kind === 'email')
    expect(email?.text).toBe('jane.doe@acme.co')
  })

  it('detects phone numbers', () => {
    expect(kinds('call +1 (415) 555-0132 today')).toContain('phone')
    expect(kinds('ring 020 7946 0958')).toContain('phone')
  })

  it('detects card-like numbers (Luhn-valid) and rejects random digit runs', () => {
    // 4242 4242 4242 4242 is a Luhn-valid test card.
    expect(kinds('card 4242 4242 4242 4242 on file')).toContain('card')
    // A random 16-digit run that fails Luhn is NOT a card.
    expect(kinds('order 1234 5678 9012 3456 shipped')).not.toContain('card')
  })

  it('detects SSN-like patterns', () => {
    expect(kinds('ssn 123-45-6789 on the form')).toContain('ssn')
    expect(kinds('123 45 6789')).toContain('ssn')
  })

  it('detects account / policy numbers', () => {
    expect(kinds('policy number AB-99812 expired')).toContain('account')
    expect(kinds('account #4480012')).toContain('account')
    // bare alphanumeric id with a digit
    expect(kinds('the reference X8842JQ was logged')).toContain('account')
  })

  it('detects obvious person names (heuristic)', () => {
    expect(kinds('spoke with Maria Gonzalez yesterday')).toContain('name')
  })

  it('returns spans whose text is a verbatim slice at the reported offsets', () => {
    const source = 'email jane.doe@acme.co now'
    for (const span of detectPii(source)) {
      expect(source.slice(span.start, span.end)).toBe(span.text)
    }
  })

  it('does not double-claim overlapping matches (email never also a name)', () => {
    const spans = detectPii('Contact Jane Doe at jane.doe@acme.co')
    // The email substring must be claimed exactly once, as an email.
    const emailSpans = spans.filter((s) => s.text.includes('@'))
    expect(emailSpans).toHaveLength(1)
    expect(emailSpans[0]?.kind).toBe('email')
  })

  it('is pure — repeated calls give identical results (no lastIndex leak)', () => {
    const source = 'a@b.co and c@d.io'
    expect(detectPii(source)).toEqual(detectPii(source))
  })

  it('finds nothing in clean text', () => {
    expect(detectPii('the nightly batch reconciles ledgers')).toHaveLength(0)
  })
})

describe('pii — applyRedaction (#14)', () => {
  const source = 'mail jane.doe@acme.co or call 415-555-0132'

  it('replaces redacted spans with placeholders and keeps kept spans verbatim', () => {
    const spans = detectPii(source)
    const result = applyRedaction(source, spans, (s) => s.kind === 'email')
    expect(result.text).toContain(placeholderFor('email'))
    expect(result.text).not.toContain('jane.doe@acme.co')
    // the phone was KEPT
    expect(result.text).toContain('415-555-0132')
  })

  it('records entries pointing at original offsets and the verbatim removed text', () => {
    const spans = detectPii(source)
    const result = applyRedaction(source, spans, () => true)
    for (const e of result.entries) {
      expect(source.slice(e.originalStart, e.originalEnd)).toBe(e.original)
    }
  })

  it('redact-all produces text with no original PII substrings', () => {
    const spans = detectPii(source)
    const result = applyRedaction(source, spans, () => true)
    expect(result.text).not.toContain('jane.doe@acme.co')
    expect(result.text).not.toContain('415-555-0132')
  })

  it('applies multiple redactions without corrupting offsets', () => {
    const s = 'a@b.co x@y.io z@w.net'
    const spans = detectPii(s)
    const result = applyRedaction(s, spans, () => true)
    expect(result.entries).toHaveLength(3)
    expect(result.text).not.toMatch(/@/)
  })
})
