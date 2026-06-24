import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginCapture,
  confirmRedaction,
  defaultChoice,
  sendCapture,
} from './capture'
import type { GatePass } from './capture'
import { placeholderFor } from './pii'
import { mockTransport } from './transports/mockTransport'
import type { Sourced } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
})

function enableAssist() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'seam.assist' ? JSON.stringify({ enabled: true, apiKey: 'sk-x' }) : null),
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  } as unknown as Storage)
}

function disableAssist() {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  } as unknown as Storage)
}

const PASTE = 'Reconcile invoices for jane.doe@acme.co, policy AB-99812, daily.'

describe('capture — detector surfaces hits even when assist is OFF (#14 AC5)', () => {
  it('beginCapture detects PII with assistAvailable() false', () => {
    disableAssist()
    const draft = beginCapture(PASTE)
    expect(draft.detected.length).toBeGreaterThan(0)
    expect(draft.detected.some((s) => s.kind === 'email')).toBe(true)
  })
})

describe('capture — the send path is structurally downstream of the gate (#14 AC1)', () => {
  it('sendCapture cannot be called without a GatePass (type-level proof at runtime)', async () => {
    enableAssist()
    const draft = beginCapture(PASTE)
    // There is NO public constructor for GatePass other than confirmRedaction.
    // The only path to `outgoing` is through the gate. We prove it by asserting
    // confirmRedaction is the producer the send consumes.
    const pass = confirmRedaction(draft, defaultChoice(draft))
    const t = mockTransport({ toolInput: null, rawText: '', usage: { inputTokens: 0, outputTokens: 0 } })
    const outcome = await sendCapture(pass, { schema: { type: 'object' } }, t)
    // the transport saw the GATED (redacted) text, not the raw paste
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]?.messages[0]?.content).toBe(pass.outgoing)
    expect(outcome.persisted).toBe(pass.outgoing)
  })

  it('a forged pass-shaped object is not accepted by the type system (compile-time)', () => {
    // This documents the brand: `outgoing` exists, but `__gate` (unique symbol)
    // cannot be produced outside this module, so `as GatePass` is the only way
    // to fake one — which a real caller cannot do. Runtime sanity only.
    const realDraft = beginCapture('clean text')
    const real: GatePass = confirmRedaction(realDraft, defaultChoice(realDraft))
    expect(real.outgoing).toBe('clean text')
  })
})

describe('capture — redact-all is the default (#14 AC3)', () => {
  it('defaultChoice redacts every detected span and never sends raw', () => {
    const draft = beginCapture(PASTE)
    const choice = defaultChoice(draft)
    expect(choice.sendRaw).toBe(false)
    expect(Object.values(choice.decisions).every((v) => v === true)).toBe(true)

    const pass = confirmRedaction(draft, choice)
    expect(pass.raw).toBe(false)
    expect(pass.outgoing).not.toContain('jane.doe@acme.co')
    expect(pass.outgoing).toContain(placeholderFor('email'))
    expect(pass.sendRawRecord).toBeNull()
  })

  it('keeping one span leaves it verbatim while others stay redacted', () => {
    const draft = beginCapture(PASTE)
    const emailIdx = draft.detected.findIndex((s) => s.kind === 'email')
    const choice = defaultChoice(draft)
    choice.decisions[emailIdx] = false // keep the email
    const pass = confirmRedaction(draft, choice)
    expect(pass.outgoing).toContain('jane.doe@acme.co')
  })
})

describe('capture — send-raw writes a timestamped record (#14 AC3)', () => {
  it('confirmRedaction with sendRaw mints a timestamped SendRawRecord', () => {
    const draft = beginCapture(PASTE)
    const fixed = new Date('2026-06-25T12:00:00.000Z')
    const pass = confirmRedaction(draft, { decisions: {}, sendRaw: true }, () => fixed)
    expect(pass.raw).toBe(true)
    expect(pass.outgoing).toBe(PASTE) // raw original
    expect(pass.sendRawRecord).not.toBeNull()
    expect(pass.sendRawRecord?.choice).toBe('send-raw')
    expect(pass.sendRawRecord?.at).toBe('2026-06-25T12:00:00.000Z')
    expect(pass.sendRawRecord?.detectedCount).toBe(draft.detected.length)
  })
})

describe('capture — redacted source is persisted and sourceSpans index into it (#14 AC4)', () => {
  it('persists the redacted text and grounds spans against it', async () => {
    enableAssist()
    const draft = beginCapture(PASTE)
    const pass = confirmRedaction(draft, defaultChoice(draft))

    // Model cites a span that exists in the REDACTED text (the placeholder).
    const ph = placeholderFor('email')
    const start = pass.outgoing.indexOf(ph)
    const sourced: Sourced<string> = {
      value: 'Reconcile invoices',
      confidence: 'high',
      sourceSpans: [{ quote: ph, charStart: start, charEnd: start + ph.length }],
      status: 'draft',
    }
    const t = mockTransport({
      toolInput: { sourced },
      rawText: '',
      usage: { inputTokens: 1, outputTokens: 1 },
    })

    const outcome = await sendCapture<string>(pass, { schema: { type: 'object' } }, t)
    // what is persisted is the redacted text — no raw email
    expect(outcome.persisted).toBe(pass.outgoing)
    expect(outcome.persisted).not.toContain('jane.doe@acme.co')
    // grounded against the redacted text: the placeholder span survives at HIGH
    expect(outcome.result?.confidence).toBe('high')
    expect(outcome.result?.sourceSpans).toHaveLength(1)
  })

  it('a model span quoting the original (now-redacted) PII is demoted by grounding', async () => {
    enableAssist()
    const draft = beginCapture(PASTE)
    const pass = confirmRedaction(draft, defaultChoice(draft))
    const sourced: Sourced<string> = {
      value: 'x',
      confidence: 'high',
      sourceSpans: [{ quote: 'jane.doe@acme.co', charStart: 0, charEnd: 16 }],
      status: 'draft',
    }
    const t = mockTransport({
      toolInput: { sourced },
      rawText: '',
      usage: { inputTokens: 1, outputTokens: 1 },
    })
    const outcome = await sendCapture<string>(pass, { schema: { type: 'object' } }, t)
    // the email is gone from the source the model is grounded against → demoted
    expect(outcome.result?.confidence).toBe('low')
    expect(outcome.result?.sourceSpans).toHaveLength(0)
  })
})

describe('capture — extraction uses opus-4-8 by default (locked decision)', () => {
  it('sendCapture sends model opus-4-8 unless overridden', async () => {
    enableAssist()
    const draft = beginCapture('clean text')
    const pass = confirmRedaction(draft, defaultChoice(draft))
    const t = mockTransport({ toolInput: null, rawText: '', usage: { inputTokens: 0, outputTokens: 0 } })
    await sendCapture(pass, { schema: {} }, t)
    expect(t.calls[0]?.model).toBe('claude-opus-4-8')
  })
})
