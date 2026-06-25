import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coerceDraft,
  integrationSource,
  isSourced,
  runIntegrationNotes,
  NOTES_PAYLOAD_OMITS_APPROACH,
} from './integration'
import { mockTransport } from '../transports/mockTransport'
import { acceptSourced, INTEGRATION_ACCEPT_OMITS_APPROACH } from '../accept'
import { recommendApproach, approachWarnings } from '../../logic'
import type { Integration, Scope } from '../../types'
import { newScope } from '../../constants'
import type { AssistResponse, Sourced } from '../types'

afterEach(() => vi.unstubAllGlobals())

function enableAssist() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) =>
      k === 'seam.assist' ? JSON.stringify({ enabled: true, apiKey: 'sk-x' }) : null,
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

/** A screen-scrape integration (api=false) with an unstable UI — earns a warning. */
function screenRow(): Integration {
  return {
    id: 'int-1',
    systemId: 'sys-0',
    systemName: 'LegacyCRM',
    apiAvailable: false,
    authType: '',
    onPrem: false,
    uiStable: false,
    approach: null,
    notes: '',
  }
}

/** An api integration. */
function apiRow(): Integration {
  return { ...screenRow(), id: 'int-2', systemName: 'NetSuite', apiAvailable: true, uiStable: true }
}

function sourced<T>(source: string, value: T, quote: string | null): Sourced<T> {
  if (quote === null) return { value, confidence: 'low', sourceSpans: [], status: 'draft' }
  const charStart = source.indexOf(quote)
  return {
    value,
    confidence: 'high',
    sourceSpans: charStart < 0 ? [] : [{ quote, charStart, charEnd: charStart + quote.length }],
    status: 'draft',
  }
}

function respond(notes: unknown, authType: unknown): AssistResponse {
  return { toolInput: { notes, authType }, rawText: '', usage: { inputTokens: 1, outputTokens: 1 } }
}

// ============================================================================
// AC1/AC4 — gated; no network when assist off
// ============================================================================

describe('#19 AC1/AC4 — integration copilot is gated', () => {
  it('refuses (no network) when assist is off', async () => {
    disableAssist()
    const t = mockTransport(respond({ value: 'x' }, { value: null }))
    await expect(runIntegrationNotes(screenRow(), t)).rejects.toThrow(/assist disabled/)
    expect(t.calls).toHaveLength(0)
  })

  it('runs (one call, sonnet default) only when assist is on', async () => {
    enableAssist()
    const src = integrationSource(screenRow())
    const t = mockTransport(respond(sourced(src, 'Pin selectors; add change-detection.', 'UI stable: no'), sourced(src, null, null)))
    const { draft } = await runIntegrationNotes(screenRow(), t)
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]!.model).toBe('claude-sonnet-4-6')
    expect(draft.notes.value).toContain('change-detection')
  })
})

// ============================================================================
// AC3 — writes ONLY notes (optionally authType); NEVER approach; recommendation
//       shown FIRST and unchanged
// ============================================================================

describe('#19 AC3 — augments, never overrides the deterministic recommendation', () => {
  it('the draft type and accept target both omit approach (compile-time)', () => {
    expect(NOTES_PAYLOAD_OMITS_APPROACH).toBe(true)
    expect(INTEGRATION_ACCEPT_OMITS_APPROACH).toBe(true)
  })

  it('echoes the deterministic recommendApproach()/approachWarnings() unchanged', async () => {
    enableAssist()
    // approach chosen = 'screen' on an unstable UI: approachWarnings fires.
    const row: Integration = { ...screenRow(), approach: 'screen' }
    const src = integrationSource(row)
    const t = mockTransport(respond(sourced(src, 'notes', 'UI stable: no'), sourced(src, null, null)))
    const { recommendation } = await runIntegrationNotes(row, t)
    // Identical to calling the pure functions directly — the copilot computes,
    // never alters, the recommendation.
    expect(recommendation.approach).toBe(recommendApproach(row))
    expect(recommendation.approach).toBe('screen')
    expect(recommendation.warnings).toEqual(approachWarnings(row))
    expect(recommendation.warnings.length).toBeGreaterThan(0)
  })

  it('accepting notes writes ONLY notes — approach stays untouched', () => {
    const src = integrationSource(screenRow())
    const before: Scope = {
      ...newScope('Test'),
      integrations: [{ ...screenRow(), approach: 'screen', notes: '' }],
    }
    const notes: Sourced<string> = sourced(src, 'Add idempotency keys; rate-limit aware.', 'API available: no')
    const after = acceptSourced(
      { field: 'integrationText', integrationId: 'int-1', key: 'notes' },
      notes,
    )(before)

    const row = after.integrations.find((i) => i.id === 'int-1')!
    expect(row.notes).toBe('Add idempotency keys; rate-limit aware.')
    // approach is preserved exactly — the copilot path cannot move it.
    expect(row.approach).toBe('screen')
    // original not mutated
    expect(before.integrations[0]!.notes).toBe('')
  })

  it('accepting authType writes ONLY authType — notes + approach untouched', () => {
    const src = integrationSource(apiRow())
    const before: Scope = {
      ...newScope('Test'),
      integrations: [{ ...apiRow(), approach: 'api', notes: 'keep me', authType: '' }],
    }
    const authType: Sourced<string> = sourced(src, 'OAuth 2.0', 'API available: yes')
    const after = acceptSourced(
      { field: 'integrationText', integrationId: 'int-2', key: 'authType' },
      authType,
    )(before)

    const row = after.integrations.find((i) => i.id === 'int-2')!
    expect(row.authType).toBe('OAuth 2.0')
    expect(row.notes).toBe('keep me')
    expect(row.approach).toBe('api')
  })

  it('accept is a no-op when the integration id is absent', () => {
    const before: Scope = { ...newScope('Test'), integrations: [{ ...apiRow(), notes: 'x' }] }
    const after = acceptSourced(
      { field: 'integrationText', integrationId: 'does-not-exist', key: 'notes' },
      { value: 'ignored', confidence: 'high', sourceSpans: [], status: 'draft' },
    )(before)
    expect(after.integrations[0]!.notes).toBe('x')
  })
})

// ============================================================================
// grounding + coercion units
// ============================================================================

describe('#19 — grounding + coercion', () => {
  it('drops a non-matching span and demotes confidence', async () => {
    enableAssist()
    const t = mockTransport(
      respond({ value: 'Phantom', confidence: 'high', sourceSpans: [{ quote: 'NOPE', charStart: 0, charEnd: 4 }] }, { value: null }),
    )
    const { draft, source } = await runIntegrationNotes(apiRow(), t)
    expect(draft.notes.confidence).toBe('low')
    expect(draft.notes.sourceSpans).toHaveLength(0)
    expect(isSourced(source, draft.notes)).toBe(false)
  })

  it('coerceDraft tolerates missing fields', () => {
    const d = coerceDraft(null)
    expect(d.notes.value).toBeNull()
    expect(d.authType.value).toBeNull()
  })

  it('integrationSource fences the fixed recommendation for the model', () => {
    const src = integrationSource(screenRow())
    expect(src).toContain('Recommended approach (fixed): Screen-driven')
    expect(src).toContain('UI stable: no')
  })
})
