import { afterEach, describe, expect, it, vi } from 'vitest'
import { assistAvailable } from './gate'
import { runAssist } from './client'
import { verbatimCheck, groundSourced } from './ground'
import { acceptSourced } from './accept'
import { mockTransport } from './transports/mockTransport'
import { newScope } from '../constants'
import type { Sourced } from './types'

// Node test env has no localStorage; install a controllable one per test.
afterEach(() => {
  vi.unstubAllGlobals()
})

function stubAssistFlag(raw: string | null) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === 'seam.assist' ? raw : null),
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  } as unknown as Storage)
}

const draft = <T>(over: Partial<Sourced<T>> = {}): Sourced<T> => ({
  value: null,
  confidence: 'high',
  sourceSpans: [],
  status: 'draft',
  ...over,
})

describe('gate — assistAvailable (#13)', () => {
  it('is false by default (no flag set)', () => {
    stubAssistFlag(null)
    expect(assistAvailable()).toBe(false)
  })

  it('is false when opted in but no key/transport configured', () => {
    stubAssistFlag(JSON.stringify({ enabled: true }))
    expect(assistAvailable()).toBe(false)
  })

  it('is false when a key exists but the user has not opted in', () => {
    stubAssistFlag(JSON.stringify({ apiKey: 'sk-x' }))
    expect(assistAvailable()).toBe(false)
  })

  it('is true only when opted in AND a key (or transport) is set', () => {
    stubAssistFlag(JSON.stringify({ enabled: true, apiKey: 'sk-x' }))
    expect(assistAvailable()).toBe(true)
  })

  it('is false for malformed config', () => {
    stubAssistFlag('not json')
    expect(assistAvailable()).toBe(false)
  })
})

describe('client — runAssist gating (#13)', () => {
  it('throws when assist is off and never calls the transport', async () => {
    stubAssistFlag(null)
    const t = mockTransport({ toolInput: { x: 1 }, rawText: '', usage: { inputTokens: 0, outputTokens: 0 } })
    await expect(
      runAssist({ messages: [{ role: 'user', content: 'hi' }], schema: {} }, t),
    ).rejects.toThrow(/assist disabled/)
    expect(t.calls).toHaveLength(0)
  })

  it('returns a Sourced<T> via mockTransport when assist is enabled', async () => {
    stubAssistFlag(JSON.stringify({ enabled: true, apiKey: 'sk-x' }))
    const sourced: Sourced<string> = {
      value: 'Ops analyst',
      confidence: 'medium',
      sourceSpans: [{ quote: 'Ops analyst', charStart: 0, charEnd: 11 }],
      status: 'draft',
    }
    const t = mockTransport({
      toolInput: { sourced },
      rawText: '',
      usage: { inputTokens: 10, outputTokens: 5 },
    })
    const res = await runAssist(
      { messages: [{ role: 'user', content: 'who does it' }], schema: { type: 'object' } },
      t,
    )
    expect(res.toolInput).not.toBeNull()
    const got = (res.toolInput as { sourced: Sourced<string> }).sourced
    expect(got.value).toBe('Ops analyst')
    expect(got.status).toBe('draft')
    // forced structured output: one tool, forced via tool_choice
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]?.tools).toHaveLength(1)
    expect(t.calls[0]?.tool_choice).toEqual({ type: 'tool', name: t.calls[0]?.tools[0]?.name })
    expect(t.calls[0]?.model).toBe('claude-sonnet-4-6')
  })

  it('honours the per-call model override to opus', async () => {
    stubAssistFlag(JSON.stringify({ enabled: true, apiKey: 'sk-x' }))
    const t = mockTransport({ toolInput: {}, rawText: '', usage: { inputTokens: 0, outputTokens: 0 } })
    await runAssist(
      { messages: [{ role: 'user', content: 'x' }], schema: {}, model: 'claude-opus-4-8' },
      t,
    )
    expect(t.calls[0]?.model).toBe('claude-opus-4-8')
  })
})

describe('ground — verbatimCheck (#13)', () => {
  const source = 'The analyst reconciles invoices each morning.'

  it('passes an exact match at the right offsets', () => {
    const start = source.indexOf('analyst')
    expect(verbatimCheck(source, { quote: 'analyst', charStart: start, charEnd: start + 7 })).toBe(true)
  })

  it('fails an off-by-one offset', () => {
    const start = source.indexOf('analyst')
    expect(verbatimCheck(source, { quote: 'analyst', charStart: start + 1, charEnd: start + 8 })).toBe(false)
  })

  it('fails a quote that is not present', () => {
    expect(verbatimCheck(source, { quote: 'robot', charStart: 4, charEnd: 9 })).toBe(false)
  })
})

describe('ground — groundSourced (#13)', () => {
  const source = 'Invoices are entered into NetSuite.'

  it('demotes a non-substring quote to low and drops the span', () => {
    const s = groundSourced(source, draft<string>({
      value: 'NetSuite',
      confidence: 'high',
      sourceSpans: [{ quote: 'SAP', charStart: 0, charEnd: 3 }],
    }))
    expect(s.confidence).toBe('low')
    expect(s.sourceSpans).toHaveLength(0)
  })

  it('keeps confidence when every span is verbatim', () => {
    const start = source.indexOf('NetSuite')
    const s = groundSourced(source, draft<string>({
      value: 'NetSuite',
      confidence: 'high',
      sourceSpans: [{ quote: 'NetSuite', charStart: start, charEnd: start + 8 }],
    }))
    expect(s.confidence).toBe('high')
    expect(s.sourceSpans).toHaveLength(1)
  })
})

describe('accept — acceptSourced routes through existing shapers (#13)', () => {
  it('clamps an out-of-range seam axis via the existing axis() coercer', () => {
    const scope = newScope('Test')
    scope.seamCandidates = [
      { id: 'c1', name: 'Reconcile', volume: 3, ruleBound: 3, lowJudgement: 3, lowBlastRadius: 3 },
    ]
    // Model proposes an out-of-range axis value; acceptSourced must NOT write a
    // parallel validator — it routes through axis(), which clamps to 1..5.
    const reducer = acceptSourced<number>(
      { field: 'seamCandidateAxis', candidateId: 'c1', axis: 'volume' },
      draft<number>({ value: 99 }),
    )
    const next = reducer(scope)
    expect(next.seamCandidates[0]?.volume).toBe(5)
  })

  it('appends a candidate through shapeCandidate (coerces a partial proposal)', () => {
    const scope = newScope('Test')
    const reducer = acceptSourced<unknown>(
      { field: 'seamCandidate' },
      draft<unknown>({ value: { name: 'Triage', volume: 0 } }),
    )
    const next = reducer(scope)
    expect(next.seamCandidates).toHaveLength(1)
    expect(next.seamCandidates[0]?.name).toBe('Triage')
    expect(next.seamCandidates[0]?.volume).toBe(1) // clamped from 0
    expect(next.seamCandidates[0]?.ruleBound).toBe(3) // default filled by shaper
  })

  it('is a no-op reducer when the accepted value is null', () => {
    const scope = newScope('Test')
    const reducer = acceptSourced<string>({ field: 'processMap' }, draft<string>({ value: null }))
    expect(reducer(scope)).toBe(scope)
  })
})
