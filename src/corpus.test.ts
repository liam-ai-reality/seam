import { describe, expect, it, vi } from 'vitest'
import { newScope } from './constants'
import { sampleScope } from './sample'
import { seamScore } from './logic'
import {
  MIN_CHOSEN_SEAMS,
  computePriors,
  normaliseSystemName,
} from './corpus'
import type { Scope } from './types'

/** A scope with one chosen seam and a couple of decided integrations. */
function scopeWith(opts: {
  chosenAxis: number
  approaches: Array<{ system: string; approach: Scope['integrations'][number]['approach'] }>
  grader: Scope['evalPlan']['grader']
}): Scope {
  const s = newScope('s')
  s.seamCandidates = [
    { id: 'c1', name: 'c1', volume: opts.chosenAxis, ruleBound: opts.chosenAxis, lowJudgement: opts.chosenAxis, lowBlastRadius: opts.chosenAxis },
  ]
  s.chosenSeamId = 'c1'
  s.evalPlan = { ...s.evalPlan, grader: opts.grader }
  s.integrations = opts.approaches.map((a, i) => ({
    id: `i${i}`,
    systemId: `sys${i}`,
    systemName: a.system,
    apiAvailable: null,
    authType: '',
    onPrem: null,
    uiStable: null,
    approach: a.approach,
    notes: '',
  }))
  return s
}

describe('normaliseSystemName', () => {
  it('trims, lower-cases, and collapses whitespace', () => {
    expect(normaliseSystemName('  Salesforce  ')).toBe('salesforce')
    expect(normaliseSystemName('Carrier   Web\tPortal')).toBe('carrier web portal')
    expect(normaliseSystemName('SALESFORCE')).toBe('salesforce')
  })
})

describe('computePriors — purity + zero network', () => {
  it('never touches the network', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    computePriors([sampleScope(), sampleScope()])
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not mutate the input scopes', () => {
    const a = sampleScope()
    const before = JSON.stringify(a)
    computePriors([a])
    expect(JSON.stringify(a)).toBe(before)
  })

  it('is deterministic for the same input', () => {
    const scopes = [sampleScope(), newScope('blank')]
    expect(computePriors(scopes)).toEqual(computePriors(scopes))
  })
})

describe('computePriors — seam-axis priors via the ranking authority', () => {
  it('chosen-seam score distribution reuses seamScore()', () => {
    const s4 = scopeWith({ chosenAxis: 4, approaches: [], grader: 'programmatic' })
    const s2 = scopeWith({ chosenAxis: 2, approaches: [], grader: 'programmatic' })
    const priors = computePriors([s4, s2])
    const expected4 = seamScore(s4.seamCandidates[0]!, s4.seamWeights)
    const expected2 = seamScore(s2.seamCandidates[0]!, s2.seamWeights)
    expect(priors.chosenSeamScore.n).toBe(2)
    expect(priors.chosenSeamScore.min).toBe(expected2)
    expect(priors.chosenSeamScore.max).toBe(expected4)
    expect(priors.chosenSeamScore.median).toBe((expected2 + expected4) / 2)
  })

  it('a scope with no chosen seam contributes no score point', () => {
    const blank = newScope('blank') // no chosenSeamId
    const priors = computePriors([blank])
    expect(priors.chosenSeamScore.n).toBe(0)
  })
})

describe('computePriors — integration-approach frequency keyed by normalised name', () => {
  it('buckets approaches by normalised system name', () => {
    const a = scopeWith({ chosenAxis: 3, approaches: [{ system: 'Salesforce', approach: 'api' }], grader: 'programmatic' })
    const b = scopeWith({ chosenAxis: 3, approaches: [{ system: ' salesforce ', approach: 'screen' }], grader: 'programmatic' })
    const priors = computePriors([a, b])
    const sf = priors.approachBySystem['salesforce']!
    expect(sf.n).toBe(2)
    expect(sf.counts.api).toBe(1)
    expect(sf.counts.screen).toBe(1)
  })

  it('undecided (null approach) integrations are not counted', () => {
    const s = scopeWith({ chosenAxis: 3, approaches: [{ system: 'Portal', approach: null }], grader: 'programmatic' })
    const priors = computePriors([s])
    expect(priors.approachBySystem['portal']).toBeUndefined()
  })
})

describe('computePriors — grader + completion priors', () => {
  it('counts grader choices across scopes', () => {
    const a = scopeWith({ chosenAxis: 3, approaches: [], grader: 'programmatic' })
    const b = scopeWith({ chosenAxis: 3, approaches: [], grader: 'llm-judge' })
    const priors = computePriors([a, b])
    expect(priors.graderChoice.n).toBe(2)
    expect(priors.graderChoice.counts.programmatic).toBe(1)
    expect(priors.graderChoice.counts['llm-judge']).toBe(1)
  })

  it('median stage completion: the worked sample is 5/5, a blank is 0/5', () => {
    const priors = computePriors([sampleScope(), newScope('blank')])
    expect(priors.stageCompletion.n).toBe(2)
    expect(priors.stageCompletion.max).toBe(5)
    expect(priors.stageCompletion.min).toBe(0)
    expect(priors.stageCompletion.median).toBe(2.5)
  })
})

describe('computePriors — minimum-count gate', () => {
  it('hasEnough is false below the minimum chosen-seam count', () => {
    const few = Array.from({ length: MIN_CHOSEN_SEAMS - 1 }, () =>
      scopeWith({ chosenAxis: 4, approaches: [], grader: 'programmatic' }),
    )
    expect(computePriors(few).hasEnough).toBe(false)
  })

  it('hasEnough flips true at exactly the minimum', () => {
    const enough = Array.from({ length: MIN_CHOSEN_SEAMS }, () =>
      scopeWith({ chosenAxis: 4, approaches: [], grader: 'programmatic' }),
    )
    expect(computePriors(enough).hasEnough).toBe(true)
  })

  it('an empty corpus is below the gate', () => {
    const priors = computePriors([])
    expect(priors.scopeCount).toBe(0)
    expect(priors.hasEnough).toBe(false)
  })
})
