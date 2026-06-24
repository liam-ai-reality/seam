import { describe, expect, it } from 'vitest'
import { newScope } from './constants'
import { sampleScope } from './sample'
import {
  isReady,
  rankSeams,
  recommendApproach,
  recommendGrader,
  seamScore,
  suggestedSeamId,
} from './logic'
import type { SeamCandidate, SeamWeights } from './types'

const equal: SeamWeights = { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }
const cand = (id: string, v: number): SeamCandidate => ({ id, name: id, volume: v, ruleBound: v, lowJudgement: v, lowBlastRadius: v })

describe('seam scoring', () => {
  it('normalises a uniform candidate back onto the 1-5 scale', () => {
    expect(seamScore(cand('a', 4), equal)).toBe(4)
  })

  it('ranks higher scores first and suggests the top', () => {
    const cands = [cand('low', 2), cand('high', 5), cand('mid', 3)]
    const ranked = rankSeams(cands, equal)
    expect(ranked.map((r) => r.candidate.id)).toEqual(['high', 'mid', 'low'])
    expect(ranked[0]!.rank).toBe(1)
    expect(suggestedSeamId(cands, equal)).toBe('high')
  })

  it('respects weights — zero-weighting an axis changes the winner', () => {
    const a: SeamCandidate = { id: 'a', name: 'a', volume: 5, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }
    const b: SeamCandidate = { id: 'b', name: 'b', volume: 1, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 5 }
    expect(suggestedSeamId([a, b], equal)).toBe('b')
    const volumeOnly: SeamWeights = { volume: 1, ruleBound: 0, lowJudgement: 0, lowBlastRadius: 0 }
    expect(suggestedSeamId([a, b], volumeOnly)).toBe('a')
  })

  it('handles zero total weight without dividing by zero', () => {
    expect(seamScore(cand('a', 5), { volume: 0, ruleBound: 0, lowJudgement: 0, lowBlastRadius: 0 })).toBe(0)
  })
})

describe('integration recommendation', () => {
  it('prefers API, then on-prem, then screen; null until decidable', () => {
    expect(recommendApproach({ apiAvailable: true, onPrem: true })).toBe('api')
    expect(recommendApproach({ apiAvailable: false, onPrem: true })).toBe('on-prem')
    expect(recommendApproach({ apiAvailable: false, onPrem: false })).toBe('screen')
    expect(recommendApproach({ apiAvailable: null, onPrem: null })).toBe(null)
  })
})

describe('grader recommendation', () => {
  it('defaults to programmatic, llm-judge only for free-form', () => {
    expect(recommendGrader(false)).toBe('programmatic')
    expect(recommendGrader(true)).toBe('llm-judge')
  })
})

describe('readiness gate', () => {
  it('a blank scope is not ready', () => {
    expect(isReady(newScope('blank'))).toBe(false)
  })
  it('the worked sample is ready to build', () => {
    expect(isReady(sampleScope())).toBe(true)
  })
})
