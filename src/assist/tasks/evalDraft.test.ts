import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coerceJudge,
  defaultGrader,
  assertCrossModel,
  runEvalDraft,
  EVAL_DRAFT_PRODUCER_MODEL,
  PRODUCTION_MODEL,
  type EvalDraftContext,
} from './evalDraft'
import { acceptSourced } from '../accept'
import { recommendGrader } from '../../logic'
import { judgeValidationStatus, generateBrief } from '../../brief'
import { mockTransport } from '../transports/mockTransport'
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

function sourced(value: string | null): Sourced<string> {
  return { value, confidence: 'medium', sourceSpans: [], status: 'draft' }
}

function programmaticResponse(): AssistResponse {
  return {
    toolInput: {
      caseSetOutline: sourced('100 historically-labelled rows; pass = exact-match category.'),
      shipThreshold: sourced('Ship at >= 98% exact-match on the held-out set.'),
    },
    rawText: '',
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}

function judgeResponse(judgeModel = 'claude-sonnet-4-6', withPlan = true): AssistResponse {
  return {
    toolInput: {
      caseSetOutline: sourced('60 free-form summaries with reference answers.'),
      shipThreshold: sourced('Ship at >= 90% judge-pass on the held-out set.'),
      judge: {
        judgeModel,
        judgeRubric: sourced('Score 1-5 on faithfulness, completeness, and tone.'),
        judgeValidationPlan: withPlan
          ? sourced('Validate the judge against 50 human-labelled cases at >= 0.8 agreement; re-check monthly.')
          : sourced(null),
      },
    },
    rawText: '',
    usage: { inputTokens: 0, outputTokens: 0 },
  }
}

const baseCtx: EvalDraftContext = {
  freeFormOutput: false,
  chosenSeamName: 'Claim triage',
  worstOutput: 'A fraud-flagged claim auto-paid.',
}

describe('defaultGrader mirrors recommendGrader exactly', () => {
  it('programmatic when not free-form, llm-judge when free-form', () => {
    expect(defaultGrader(false)).toBe(recommendGrader(false))
    expect(defaultGrader(true)).toBe(recommendGrader(true))
    expect(defaultGrader(false)).toBe('programmatic')
    expect(defaultGrader(true)).toBe('llm-judge')
  })
})

describe('AC1 — not free-form: programmatic outline, NO judge rubric', () => {
  it('returns programmatic grader and no judge half, and never asks for a rubric', async () => {
    enableAssist()
    const t = mockTransport(programmaticResponse())
    const draft = await runEvalDraft({ ...baseCtx, freeFormOutput: false }, t)

    expect(draft.grader).toBe('programmatic')
    expect(draft.grader).toBe(recommendGrader(false)) // matches the product logic
    expect(draft.judge).toBeUndefined()
    expect(draft.caseSetOutline.value).toContain('100')

    // The schema sent must not even contain judge fields when not free-form.
    const schema = t.calls[0]!.tools[0]!.input_schema as { properties?: Record<string, unknown> }
    expect(schema.properties).toHaveProperty('caseSetOutline')
    expect(schema.properties).not.toHaveProperty('judge')
  })
})

describe('AC2 — both-or-neither: rubric requires validation plan (and vice-versa)', () => {
  it('drops the judge entirely when the validation plan is missing', () => {
    const half = {
      judgeModel: 'claude-sonnet-4-6',
      judgeRubric: sourced('a rubric'),
      judgeValidationPlan: sourced(null),
    }
    expect(coerceJudge(half, PRODUCTION_MODEL)).toBeNull()
  })

  it('drops the judge entirely when the rubric is missing', () => {
    const half = {
      judgeModel: 'claude-sonnet-4-6',
      judgeRubric: sourced(null),
      judgeValidationPlan: sourced('a validation plan'),
    }
    expect(coerceJudge(half, PRODUCTION_MODEL)).toBeNull()
  })

  it('keeps the judge only when BOTH are present', () => {
    const both = {
      judgeModel: 'claude-sonnet-4-6',
      judgeRubric: sourced('a rubric'),
      judgeValidationPlan: sourced('a validation plan'),
    }
    const judge = coerceJudge(both, PRODUCTION_MODEL)
    expect(judge).not.toBeNull()
    expect(judge!.judgeRubric.value).toBe('a rubric')
    expect(judge!.judgeValidationPlan.value).toBe('a validation plan')
  })

  it('free-form run with a half-pair yields NO judge half (both-or-neither end-to-end)', async () => {
    enableAssist()
    const t = mockTransport(judgeResponse('claude-sonnet-4-6', /* withPlan */ false))
    const draft = await runEvalDraft({ ...baseCtx, freeFormOutput: true }, t)
    expect(draft.grader).toBe('llm-judge')
    expect(draft.judge).toBeUndefined()
  })

  it('free-form run with both halves yields a complete judge pair', async () => {
    enableAssist()
    const t = mockTransport(judgeResponse('claude-sonnet-4-6', true))
    const draft = await runEvalDraft({ ...baseCtx, freeFormOutput: true }, t)
    expect(draft.judge).toBeDefined()
    expect(draft.judge!.judgeRubric.value).toContain('faithfulness')
    expect(draft.judge!.judgeValidationPlan.value).toContain('agreement')
  })
})

describe('cross-model — judge model must differ from production', () => {
  it('assertCrossModel throws when judge == production', () => {
    expect(() => assertCrossModel('claude-opus-4-8', 'claude-opus-4-8')).toThrow(/no model grades its own work/)
    expect(() => assertCrossModel('claude-opus-4-8', 'claude-sonnet-4-6')).not.toThrow()
  })

  it('coerceJudge rejects a rubric naming the production model', () => {
    const sameAsProduction = {
      judgeModel: PRODUCTION_MODEL,
      judgeRubric: sourced('a rubric'),
      judgeValidationPlan: sourced('a plan'),
    }
    expect(coerceJudge(sameAsProduction, PRODUCTION_MODEL)).toBeNull()
  })

  it('runEvalDraft drops a judge whose model equals the production model', async () => {
    enableAssist()
    const t = mockTransport(judgeResponse(PRODUCTION_MODEL, true))
    const draft = await runEvalDraft({ ...baseCtx, freeFormOutput: true }, t, { productionModel: PRODUCTION_MODEL })
    expect(draft.judge).toBeUndefined()
  })
})

describe('AC3 — drafted validation plan reads INCOMPLETE in the brief until validated', () => {
  it('an llm-judge with only a validation PLAN (no measured agreement) reads INCOMPLETE', () => {
    const s = newScope('Free-form summariser')
    s.evalPlan.freeFormOutput = true
    s.evalPlan.grader = 'llm-judge'
    s.evalPlan.online = 'Validate the judge against human-labelled cases; re-check on a cadence.'
    // No measured agreement number yet -> unvalidated.
    expect(judgeValidationStatus(s)).toBe('incomplete')
    const brief = generateBrief(s)
    expect(brief).toContain('Judge validation (INCOMPLETE)')
    expect(brief).toContain('⬜')
  })

  it('flips to VALIDATED only once a measured human-agreement rate is recorded', () => {
    const s = newScope('Free-form summariser')
    s.evalPlan.freeFormOutput = true
    s.evalPlan.grader = 'llm-judge'
    s.evalPlan.offline = 'Validated judge against 50 human-labelled cases at 0.86 agreement.'
    expect(judgeValidationStatus(s)).toBe('validated')
    expect(generateBrief(s)).toContain('Judge validation (VALIDATED)')
  })

  it('a programmatic grader is not subject to judge validation', () => {
    const s = newScope('Categoriser')
    expect(s.evalPlan.grader).toBe('programmatic')
    expect(judgeValidationStatus(s)).toBe('n/a')
    expect(generateBrief(s)).not.toContain('Judge validation')
  })
})

describe('AC4 — accept/edit only: drafts merge through the existing reducer, nothing auto-applies', () => {
  it('runEvalDraft never mutates a Scope; accept routes through shapeEvalPlan + update', async () => {
    enableAssist()
    const t = mockTransport(programmaticResponse())
    const s = newScope('Categoriser')
    const before = JSON.stringify(s)

    const draft = await runEvalDraft(baseCtx, t)
    // Drafting alone changed nothing in the scope.
    expect(JSON.stringify(s)).toBe(before)
    expect(s.evalPlan.offline).toBe('')

    // Accept the case-set outline into evalPlan.offline via the SAME reducer path.
    const reducer = acceptSourced({ field: 'evalPlanText', key: 'offline' }, draft.caseSetOutline)
    const next = reducer(s)
    expect(next.evalPlan.offline).toBe(draft.caseSetOutline.value)
    // Other eval fields are preserved by the shaper (single-field overwrite).
    expect(next.evalPlan.online).toBe(s.evalPlan.online)
    // The original is untouched (pure reducer).
    expect(s.evalPlan.offline).toBe('')
  })

  it('a null-valued draft is a no-op reducer (model declined)', () => {
    const s = newScope('Categoriser')
    const reducer = acceptSourced({ field: 'evalPlanText', key: 'offline' }, sourced(null))
    expect(reducer(s)).toBe(s)
  })
})

describe('AC5 — runs ONLY when assistAvailable() is true', () => {
  it('throws (no network) when assist is disabled', async () => {
    disableAssist()
    const t = mockTransport(programmaticResponse())
    await expect(runEvalDraft(baseCtx, t)).rejects.toThrow(/assist disabled/)
    // The transport was never called.
    expect(t.calls).toHaveLength(0)
  })

  it('uses the sonnet producer + opus production defaults', async () => {
    enableAssist()
    const t = mockTransport(programmaticResponse())
    const draft = await runEvalDraft(baseCtx, t)
    expect(draft.producerModel).toBe(EVAL_DRAFT_PRODUCER_MODEL)
    expect(EVAL_DRAFT_PRODUCER_MODEL).toBe('claude-sonnet-4-6')
    expect(PRODUCTION_MODEL).toBe('claude-opus-4-8')
    expect(t.calls[0]!.model).toBe('claude-sonnet-4-6')
  })
})
