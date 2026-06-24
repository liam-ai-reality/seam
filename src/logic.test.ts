import { describe, expect, it } from 'vitest'
import { newScope } from './constants'
import { sampleScope } from './sample'
import {
  approachWarnings,
  isReady,
  rankSeams,
  readinessGaps,
  recommendApproach,
  recommendGrader,
  seamScore,
  stageStatuses,
  suggestedSeamId,
} from './logic'
import type { Integration, SeamCandidate, SeamWeights } from './types'

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

describe('approach warnings — uiStable is load-bearing', () => {
  const screenInt = (uiStable: boolean | null): Integration => ({
    id: 'i1',
    systemId: 's1',
    systemName: 'Legacy portal',
    apiAvailable: false,
    authType: '',
    onPrem: false,
    uiStable,
    approach: 'screen',
    notes: '',
  })

  it('a stable-UI screen approach gets a baseline brittleness caveat', () => {
    const warnings = approachWarnings(screenInt(true))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.toLowerCase()).toContain('brittle')
  })

  it('an unstable UI earns a STRONGER warning than a stable/unknown one', () => {
    const unstable = approachWarnings(screenInt(false))
    const stable = approachWarnings(screenInt(true))
    const unknown = approachWarnings(screenInt(null))
    // The unstable case says something the stable/unknown case does not.
    expect(unstable[0]).not.toBe(stable[0])
    expect(unstable[0]).not.toBe(unknown[0])
    expect(unstable[0]!.toLowerCase()).toContain('unstable')
    expect(stable[0]).toBe(unknown[0])
  })

  it('non-screen approaches emit no brittleness warning', () => {
    expect(approachWarnings({ ...screenInt(false), approach: 'api' })).toEqual([])
  })
})

describe('stage statuses carry hints', () => {
  it('every stage status has a non-empty hint', () => {
    for (const st of stageStatuses(sampleScope())) {
      expect(st.hint.trim().length).toBeGreaterThan(0)
    }
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

  it('a pillar toggled done with empty handling does not count', () => {
    const s = sampleScope()
    // Hollow out one pillar: still "done", but no handling text.
    s.pillars = s.pillars.map((p, i) => (i === 0 ? { ...p, handling: '   ' } : p))
    expect(isReady(s)).toBe(false)
    expect(readinessGaps(s)).toContain(`Pillars: ${s.pillars[0]!.title} (no handling)`)
  })

  it('Stage 5 needs the online plan, cost-weighted quality, and a baseline', () => {
    const s = sampleScope()
    s.evalPlan = { ...s.evalPlan, online: '', costWeightedQuality: '', baseline: '' }
    expect(isReady(s)).toBe(false)
    expect(readinessGaps(s)).toContain('Failure modes & eval')
  })

  it('readinessGaps on a blank scope names every open stage and the pillars', () => {
    const gaps = readinessGaps(newScope('blank'))
    expect(gaps).toContain('Map the process')
    expect(gaps).toContain('Failure modes & eval')
    expect(gaps.some((g) => g.startsWith('Pillars:'))).toBe(true)
  })
})
