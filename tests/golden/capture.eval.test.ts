// #16 CI GATE — runs under `npm test`, fully offline, deterministic. It scores
// the checked-in model-output fixture against the checked-in expected answers and
// asserts the declared ship threshold holds (so a regression fails the build).
// It makes NO network calls and uses NO live data.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  candidateKey,
  evaluateGate,
  scoreCorpus,
  scoreFabricatedSpans,
  SHIP_THRESHOLD,
  type GoldenCorpus,
} from '../../src/assist/captureEval'
import { candidateKey as taskCandidateKey } from '../../src/assist/tasks/capture'
import {
  assertCrossModel,
  EXTRACTOR_MODEL,
  JUDGE_DEFAULT_MODEL,
  judgeItem,
  type JudgeItem,
} from '../../src/assist/captureJudge'
import { mockTransport } from '../../src/assist/transports/mockTransport'
import type { SeamWeights } from '../../src/types'
import type { CapturePayload } from '../../src/assist/tasks/capture'

const WEIGHTS: SeamWeights = { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }

function loadCorpus(): GoldenCorpus {
  const here = dirname(fileURLToPath(import.meta.url))
  return JSON.parse(readFileSync(join(here, 'capture.golden.json'), 'utf8')) as GoldenCorpus
}

const CORPUS = loadCorpus()

afterEach(() => vi.unstubAllGlobals())

// ---------- AC1: corpus is synthetic / redacted — no real PII ----------

describe('#16 AC1 — golden corpus contains only synthetic/redacted text (no real PII)', () => {
  // Conservative real-PII signatures. Placeholder tokens like [EMAIL]/[PERSON]
  // are allowed; concrete PII is not.
  const PII_PATTERNS: { name: string; re: RegExp }[] = [
    { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: 'phone number', re: /(?:\+?\d[\s-]?){7,}\d/ },
    { name: 'US SSN', re: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: 'credit-card-like', re: /\b(?:\d[ -]?){13,16}\b/ },
    { name: 'street address', re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive)\b/ },
  ]

  it('every case source is PII-free', () => {
    expect(CORPUS.cases.length).toBeGreaterThanOrEqual(15)
    for (const c of CORPUS.cases) {
      for (const p of PII_PATTERNS) {
        expect(c.source, `${c.id} contains a ${p.name}`).not.toMatch(p.re)
      }
    }
  })

  it('serialised model outputs and expected answers are PII-free too', () => {
    for (const c of CORPUS.cases) {
      const blob = JSON.stringify(c.expected) + JSON.stringify(c.modelOutput)
      for (const p of PII_PATTERNS) {
        expect(blob, `${c.id} payload contains a ${p.name}`).not.toMatch(p.re)
      }
    }
  })

  it('the corpus is versioned', () => {
    expect(CORPUS.version).toBe(1)
  })
})

// ---------- AC2: per-field metrics reported SEPARATELY (never blended) ----------

describe('#16 AC2 — captureEval reports each metric separately', () => {
  const card = scoreCorpus(CORPUS, WEIGHTS)

  it('reports ProcessMap precision/recall', () => {
    expect(card.processMap).toHaveProperty('precision')
    expect(card.processMap).toHaveProperty('recall')
    expect(card.processMap.f1).toBeGreaterThan(0)
  })

  it('reports candidate-set overlap (precision/recall + Jaccard)', () => {
    expect(card.candidate.prf).toHaveProperty('precision')
    expect(card.candidate.prf).toHaveProperty('recall')
    expect(card.candidate.meanJaccard).toBeGreaterThan(0)
    expect(card.candidate.meanJaccard).toBeLessThanOrEqual(1)
  })

  it('reports ranking agreement computed via the product rankSeams', () => {
    expect(card.rankingAgreement).toBeGreaterThanOrEqual(0)
    expect(card.rankingAgreement).toBeLessThanOrEqual(1)
  })

  it('reports the fabricated-span rate as its own hard safety metric', () => {
    expect(card.fabricationRate).toHaveProperty('rate')
    expect(card.fabricationRate.totalSpans).toBeGreaterThan(0)
  })

  it('there is NO single blended score on the scorecard', () => {
    // No `overall`/`score`/`blended` field exists — metrics stay separate.
    expect(card).not.toHaveProperty('overall')
    expect(card).not.toHaveProperty('score')
    expect(card).not.toHaveProperty('blended')
  })

  it('recall is a real signal: at least one case misses an expected candidate', () => {
    // The support-triage case omits one candidate, so pooled recall < 1.
    expect(card.candidate.prf.recall).toBeLessThan(1)
  })
})

// ---------- AC3: ship threshold declared; gate fails below it ----------

describe('#16 AC3 — explicit ship threshold; runner exits non-zero below it', () => {
  it('declares an explicit, per-metric ship threshold (fabrication hard-zero)', () => {
    expect(SHIP_THRESHOLD.processMapF1).toBeGreaterThan(0)
    expect(SHIP_THRESHOLD.candidateF1).toBeGreaterThan(0)
    expect(SHIP_THRESHOLD.rankingAgreement).toBeGreaterThan(0)
    expect(SHIP_THRESHOLD.maxFabricationRate).toBe(0)
  })

  it('the shipped corpus PASSES the gate', () => {
    const gate = evaluateGate(scoreCorpus(CORPUS, WEIGHTS), SHIP_THRESHOLD)
    expect(gate.pass).toBe(true)
    expect(gate.failures).toEqual([])
  })

  it('the gate FAILS when metrics drop below threshold (so the runner exits non-zero)', () => {
    // Wreck the whole corpus: no candidates emitted (recall→0) and ProcessMap
    // scalar fields blanked, so the pooled metrics fall under threshold.
    const blank = { value: null, confidence: 'low', sourceSpans: [], status: 'draft' } as const
    const wrecked: GoldenCorpus = {
      version: CORPUS.version,
      cases: CORPUS.cases.map((c) => ({
        ...c,
        modelOutput: {
          ...c.modelOutput,
          candidates: [],
          processMap: {
            ...c.modelOutput.processMap,
            who: { ...blank },
            trigger: { ...blank },
            doneDefinition: { ...blank },
            frequency: { ...blank },
            costOfError: { ...blank },
          },
        },
      })),
    }
    const gate = evaluateGate(scoreCorpus(wrecked, WEIGHTS), SHIP_THRESHOLD)
    expect(gate.pass).toBe(false)
    expect(gate.failures.length).toBeGreaterThan(0)
    // names the specific metric(s) that fell short
    expect(gate.failures.some((f) => /Candidate F1/.test(f))).toBe(true)
  })

  it('a single fabricated span trips the HARD safety gate', () => {
    const source = CORPUS.cases[0]!.source
    const payload: CapturePayload = {
      ...CORPUS.cases[0]!.modelOutput,
      processMap: {
        ...CORPUS.cases[0]!.modelOutput.processMap,
        // a quote that is NOT a substring of the source
        who: { value: 'x', confidence: 'high', sourceSpans: [{ quote: 'NOT IN SOURCE AT ALL', charStart: 0, charEnd: 20 }], status: 'draft' },
      },
    }
    const fab = scoreFabricatedSpans(source, payload)
    expect(fab.fabricated).toBeGreaterThan(0)
    expect(fab.rate).toBeGreaterThan(0)
    // and that pushes the gate over its hard-zero ceiling
    const single: GoldenCorpus = { version: 1, cases: [{ ...CORPUS.cases[0]!, modelOutput: payload }] }
    expect(evaluateGate(scoreCorpus(single, WEIGHTS)).pass).toBe(false)
  })
})

// ---------- AC4: scorer is pure / deterministic / offline ----------

describe('#16 AC4 — scorer is pure, deterministic, offline', () => {
  it('scoring the same corpus twice yields identical results', () => {
    const a = scoreCorpus(CORPUS, WEIGHTS)
    const b = scoreCorpus(CORPUS, WEIGHTS)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('makes no network call (fetch is never touched while scoring)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    scoreCorpus(CORPUS, WEIGHTS)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('captureEval.candidateKey stays in sync with tasks/capture.candidateKey', () => {
    for (const sample of ['  Reconcile   Invoices ', 'Tag the Ticket', '', '   ']) {
      expect(candidateKey(sample)).toBe(taskCandidateKey(sample))
    }
  })
})

// ---------- AC5: cross-model judge uses a different model & is network-gated ----------

describe('#16 AC5 — cross-model judge: different model, network-gated, never offline', () => {
  function disableAssist() {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage)
  }
  function enableAssist() {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) =>
        k === 'seam.assist' ? JSON.stringify({ enabled: true, apiKey: 'sk-x' }) : null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    } as unknown as Storage)
  }

  const ITEM: JudgeItem = {
    id: 'case:failureMode[0]',
    source: 'A wrong match means we overpay a supplier.',
    field: 'failureMode',
    produced: 'Overpay a supplier on a wrong match',
  }

  it('the default judge model differs from the extractor model', () => {
    expect(JUDGE_DEFAULT_MODEL).not.toBe(EXTRACTOR_MODEL)
  })

  it('assertCrossModel throws if a model would grade its own work', () => {
    expect(() => assertCrossModel(EXTRACTOR_MODEL, EXTRACTOR_MODEL)).toThrow(/no model grades its own work/i)
    expect(() => assertCrossModel(EXTRACTOR_MODEL, JUDGE_DEFAULT_MODEL)).not.toThrow()
  })

  it('refuses to judge offline (assist disabled) — never runs in the offline test', async () => {
    disableAssist()
    const t = mockTransport({ toolInput: { grounded: true, useful: true, rationale: 'ok' }, rawText: '', usage: { inputTokens: 1, outputTokens: 1 } })
    await expect(judgeItem(ITEM, t)).rejects.toThrow(/assist disabled/i)
    expect(t.calls).toHaveLength(0) // never reached the transport
  })

  it('when enabled, judges with the cross-model judge (sonnet), not the producer', async () => {
    enableAssist()
    const t = mockTransport({ toolInput: { grounded: true, useful: true, rationale: 'faithful' }, rawText: '', usage: { inputTokens: 1, outputTokens: 1 } })
    const verdict = await judgeItem(ITEM, t, { producerModel: EXTRACTOR_MODEL, judgeModel: JUDGE_DEFAULT_MODEL })
    expect(verdict.grounded).toBe(true)
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]!.model).toBe(JUDGE_DEFAULT_MODEL)
    expect(t.calls[0]!.model).not.toBe(EXTRACTOR_MODEL)
  })

  it('rejects a same-model judge even when enabled (locked rule enforced at send)', async () => {
    enableAssist()
    const t = mockTransport({ toolInput: { grounded: true, useful: true, rationale: '' }, rawText: '', usage: { inputTokens: 1, outputTokens: 1 } })
    await expect(judgeItem(ITEM, t, { producerModel: EXTRACTOR_MODEL, judgeModel: EXTRACTOR_MODEL })).rejects.toThrow(/no model grades its own work/i)
    expect(t.calls).toHaveLength(0)
  })
})
