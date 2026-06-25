import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  candidateKey,
  candidateValue,
  coerceCandidate,
  isSourced,
  processMapSource,
  rankWithProposed,
  runSeamSuggest,
  SEAM_PAYLOAD_OMITS_CHOSEN_SEAM,
  SEAM_PAYLOAD_OMITS_JUSTIFICATION,
  type SeamCandidateDraft,
} from './seam'
import { mockTransport } from '../transports/mockTransport'
import { acceptSourced } from '../accept'
import { rankSeams } from '../../logic'
import { newScope } from '../../constants'
import type { ProcessMap, Scope, SeamCandidate, SeamWeights } from '../../types'
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

const PM: ProcessMap = {
  who: 'The ops team',
  trigger: 'a supplier bill arrives',
  doneDefinition: 'the bill is matched to an order',
  frequency: 'eighty times a day',
  costOfError: 'we overpay a supplier',
  systems: [{ id: 'sys-0', name: 'NetSuite' }],
}

const WEIGHTS: SeamWeights = { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }

/** Build a Sourced<T> whose span has correct offsets into `source` (or unsourced). */
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

/** A model candidate payload entry from raw Sourced fields. */
function modelCandidate(
  source: string,
  name: string,
  scores: { volume: number; ruleBound: number; lowJudgement: number; lowBlastRadius: number },
  quotes: { name: string | null; v: string | null; r: string | null; j: string | null; b: string | null },
) {
  return {
    name: sourced(source, name, quotes.name),
    volume: sourced(source, scores.volume, quotes.v),
    ruleBound: sourced(source, scores.ruleBound, quotes.r),
    lowJudgement: sourced(source, scores.lowJudgement, quotes.j),
    lowBlastRadius: sourced(source, scores.lowBlastRadius, quotes.b),
  }
}

function respond(candidates: unknown[]): AssistResponse {
  return { toolInput: { candidates }, rawText: '', usage: { inputTokens: 1, outputTokens: 1 } }
}

// ============================================================================
// Offline-safe: no trigger / no network when assist is off
// ============================================================================

describe('#19 AC1/AC4 — seam copilot is gated', () => {
  it('runSeamSuggest refuses (no network) when assist is off', async () => {
    disableAssist()
    const t = mockTransport(respond([]))
    await expect(runSeamSuggest(PM, [], t)).rejects.toThrow(/assist disabled/)
    expect(t.calls).toHaveLength(0)
  })

  it('runs (one call, sonnet default) only when assist is on', async () => {
    enableAssist()
    const src = processMapSource(PM)
    const t = mockTransport(
      respond([
        modelCandidate(src, 'Match bills to orders', { volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 2 }, {
          name: 'matched to an order',
          v: 'eighty times a day',
          r: 'matched to an order',
          j: 'matched to an order',
          b: 'we overpay a supplier',
        }),
      ]),
    )
    const { payload } = await runSeamSuggest(PM, [], t)
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]!.model).toBe('claude-sonnet-4-6')
    expect(payload.candidates).toHaveLength(1)
  })
})

// ============================================================================
// AC2 — adds candidate drafts only; never chosenSeamId; scores ranked by rankSeams
// ============================================================================

describe('#19 AC2 — proposes candidates only; ranking stays deterministic', () => {
  it('the payload type cannot carry chosenSeamId / seamJustification', () => {
    expect(SEAM_PAYLOAD_OMITS_CHOSEN_SEAM).toBe(true)
    expect(SEAM_PAYLOAD_OMITS_JUSTIFICATION).toBe(true)
  })

  it('accepting a draft appends a candidate and never sets chosenSeamId', async () => {
    enableAssist()
    const src = processMapSource(PM)
    const t = mockTransport(
      respond([
        modelCandidate(src, 'Match bills to orders', { volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 2 }, {
          name: 'matched to an order',
          v: 'eighty times a day',
          r: 'matched to an order',
          j: 'matched to an order',
          b: 'we overpay a supplier',
        }),
      ]),
    )
    const { payload, source } = await runSeamSuggest(PM, [], t)
    const draft = payload.candidates[0]!

    const before: Scope = newScope('Test')
    expect(before.chosenSeamId).toBeNull()
    expect(before.seamCandidates).toHaveLength(0)

    const value = candidateValue(source, draft)
    const after = acceptSourced(
      { field: 'seamCandidate' },
      { value, confidence: 'high', sourceSpans: [], status: 'draft' },
    )(before)

    expect(after.seamCandidates).toHaveLength(1)
    expect(after.seamCandidates[0]!.name).toBe('Match bills to orders')
    // The decision field is UNTOUCHED — the copilot can never set it.
    expect(after.chosenSeamId).toBeNull()
    // original not mutated
    expect(before.seamCandidates).toHaveLength(0)
  })

  it('proposed scores feed the EXISTING rankSeams (model ordering discarded)', async () => {
    enableAssist()
    const src = processMapSource(PM)
    // Two drafts: A scores high on every axis, B low. rankSeams must put A first
    // REGARDLESS of the order the model emitted them in (B before A here).
    const t = mockTransport(
      respond([
        modelCandidate(src, 'Low value B', { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }, {
          name: 'we overpay a supplier',
          v: 'we overpay a supplier',
          r: 'we overpay a supplier',
          j: 'we overpay a supplier',
          b: 'we overpay a supplier',
        }),
        modelCandidate(src, 'High value A', { volume: 5, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 5 }, {
          name: 'eighty times a day',
          v: 'eighty times a day',
          r: 'eighty times a day',
          j: 'eighty times a day',
          b: 'eighty times a day',
        }),
      ]),
    )
    const { payload, source } = await runSeamSuggest(PM, [], t)
    const asValues: SeamCandidate[] = payload.candidates.map((c, i) => ({
      id: `c-${i}`,
      name: c.name.value ?? '',
      volume: (candidateValue(source, c).volume as number | undefined) ?? 3,
      ruleBound: (candidateValue(source, c).ruleBound as number | undefined) ?? 3,
      lowJudgement: (candidateValue(source, c).lowJudgement as number | undefined) ?? 3,
      lowBlastRadius: (candidateValue(source, c).lowBlastRadius as number | undefined) ?? 3,
    }))
    const ranked = rankSeams(asValues, WEIGHTS)
    expect(ranked[0]!.candidate.name).toBe('High value A')
    expect(ranked[0]!.rank).toBe(1)
  })

  it('rankWithProposed merges proposals with the board via rankSeams', () => {
    const board: SeamCandidate[] = [
      { id: 'b1', name: 'Existing', volume: 3, ruleBound: 3, lowJudgement: 3, lowBlastRadius: 3 },
    ]
    const proposed: SeamCandidate[] = [
      { id: 'p1', name: 'Strong', volume: 5, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 5 },
    ]
    const ranked = rankWithProposed(board, proposed, WEIGHTS)
    expect(ranked).toHaveLength(2)
    expect(ranked[0]!.candidate.id).toBe('p1')
  })

  it('drops drafts whose name duplicates an existing board candidate', async () => {
    enableAssist()
    const src = processMapSource(PM)
    const existing: SeamCandidate[] = [
      { id: 'b1', name: 'Match Bills To Orders', volume: 3, ruleBound: 3, lowJudgement: 3, lowBlastRadius: 3 },
    ]
    const t = mockTransport(
      respond([
        modelCandidate(src, 'match bills to orders', { volume: 5, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 5 }, {
          name: 'matched to an order',
          v: null,
          r: null,
          j: null,
          b: null,
        }),
        modelCandidate(src, 'A genuinely new seam', { volume: 4, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 4 }, {
          name: 'eighty times a day',
          v: null,
          r: null,
          j: null,
          b: null,
        }),
      ]),
    )
    const { payload } = await runSeamSuggest(PM, existing, t)
    expect(payload.candidates.map((c) => c.name.value)).toEqual(['A genuinely new seam'])
  })
})

// ============================================================================
// grounding + coercion units
// ============================================================================

describe('#19 — grounding + coercion', () => {
  it('drops spans that do not verbatim-match the source (confidence demoted)', async () => {
    enableAssist()
    const src = processMapSource(PM)
    const t = mockTransport(
      respond([
        {
          name: { value: 'Phantom seam', confidence: 'high', sourceSpans: [{ quote: 'NOT IN SOURCE', charStart: 0, charEnd: 13 }] },
          volume: sourced(src, 4, null),
          ruleBound: sourced(src, 4, null),
          lowJudgement: sourced(src, 4, null),
          lowBlastRadius: sourced(src, 4, null),
        },
      ]),
    )
    const { payload, source } = await runSeamSuggest(PM, [], t)
    const c = payload.candidates[0]!
    expect(c.name.confidence).toBe('low')
    expect(c.name.sourceSpans).toHaveLength(0)
    expect(isSourced(source, c.name)).toBe(false)
  })

  it('coerceCandidate drops a nameless candidate', () => {
    expect(coerceCandidate({ name: { value: null } })).toBeNull()
    expect(coerceCandidate({ name: { value: '  ' } })).toBeNull()
    const ok = coerceCandidate({ name: { value: 'Real', confidence: 'high', sourceSpans: [] } })
    expect(ok).not.toBeNull()
  })

  it('candidateKey normalises name', () => {
    expect(candidateKey('  Match  Bills ')).toBe('match bills')
    expect(candidateKey(null)).toBe('')
  })

  it('candidateValue leaves unsourced axes undefined (shaper defaults them)', () => {
    const src = processMapSource(PM)
    const draft: SeamCandidateDraft = {
      key: 'x',
      name: sourced(src, 'X', 'eighty times a day'),
      volume: sourced(src, 5, 'eighty times a day'),
      ruleBound: sourced(src, 5, null), // unsourced
      lowJudgement: sourced(src, 5, null),
      lowBlastRadius: sourced(src, 5, null),
    }
    const v = candidateValue(src, draft)
    expect(v.volume).toBe(5)
    expect(v.ruleBound).toBeUndefined()
  })
})
