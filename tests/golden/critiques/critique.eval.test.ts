// #17 CI GATE — runs under `npm test`, fully offline, deterministic. It scores
// the checked-in planted-flaw corpus + the known-clean case and asserts the
// declared ship threshold holds. It makes NO network calls and uses NO live data.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CRITIC_SHIP_THRESHOLD,
  evaluateGate,
  findingCatches,
  fieldMatches,
  scoreCleanPrecision,
  scoreCorpus,
  scoreRecallCase,
  type CleanGoldenCase,
  type CritiqueCorpus,
} from '../../../src/assist/criticEval'
import { findingKey, type CriticFinding } from '../../../src/assist/tasks/critique'

function loadCorpus(): CritiqueCorpus {
  const here = dirname(fileURLToPath(import.meta.url))
  return JSON.parse(readFileSync(join(here, 'critique.golden.json'), 'utf8')) as CritiqueCorpus
}

const CORPUS = loadCorpus()

// ---------- AC3: recall on planted flaws, precision on the clean scope ----------

describe('#17 AC3 — eval reports recall on planted flaws and precision on the clean scope', () => {
  it('has a non-trivial planted-flaw corpus and a clean case', () => {
    expect(CORPUS.planted.length).toBeGreaterThanOrEqual(4)
    const totalPlanted = CORPUS.planted.reduce((n, c) => n + c.planted.length, 0)
    expect(totalPlanted).toBeGreaterThanOrEqual(10)
    expect(CORPUS.clean).toBeDefined()
  })

  it('reports recall (planted flaws caught) at or above threshold', () => {
    const card = scoreCorpus(CORPUS)
    expect(card.recall.planted).toBeGreaterThan(0)
    expect(card.recall.recall).toBeGreaterThanOrEqual(CRITIC_SHIP_THRESHOLD.minRecall)
  })

  it('reports precision against the reference-good scope = 1 (zero false flags)', () => {
    const card = scoreCorpus(CORPUS)
    expect(card.precision.falseFlags).toBe(0)
    expect(card.precision.precision).toBe(1)
  })

  it('the whole scorecard passes the declared gate', () => {
    const gate = evaluateGate(scoreCorpus(CORPUS))
    expect(gate.failures).toEqual([])
    expect(gate.pass).toBe(true)
  })

  // The locked guard: flagging the reference-good scope FAILS the critic's own
  // eval. We simulate a critic that wrongly raises a finding on the clean scope
  // and assert the gate fails on precision.
  it('FLAGGING THE REFERENCE-GOOD SCOPE FAILS THE EVAL', () => {
    const falseFlag: CriticFinding = {
      key: findingKey('eval', 'invented problem'),
      stageKey: 'eval',
      severity: 'major',
      claim: 'invented problem',
      suggestedFix: 'n/a',
      fields: ['evalPlan.baseline'],
      confirmed: true,
      confidence: 'high',
    }
    const dirtyClean: CleanGoldenCase = { ...CORPUS.clean, findings: [falseFlag] }
    const dirty: CritiqueCorpus = { ...CORPUS, clean: dirtyClean }

    const prec = scoreCleanPrecision(dirtyClean)
    expect(prec.falseFlags).toBe(1)
    expect(prec.precision).toBeLessThan(1)

    const gate = evaluateGate(scoreCorpus(dirty))
    expect(gate.pass).toBe(false)
    expect(gate.failures.join(' ')).toMatch(/FALSE-FLAG GUARD/)
  })
})

// ---------- matching primitives ----------

describe('#17 — recall matching is by stage + cited field + severity', () => {
  it('a finding catches a flaw only when stage, field, and min-severity all match', () => {
    const flaw = { id: 'f', stageKey: 'eval' as const, field: 'evalPlan.baseline', minSeverity: 'major' as const, note: '' }
    const base = { key: 'k', claim: 'c', suggestedFix: '', confirmed: true, confidence: 'high' as const }
    expect(findingCatches({ ...base, stageKey: 'eval', severity: 'major', fields: ['evalPlan.baseline'] }, flaw)).toBe(true)
    // wrong stage
    expect(findingCatches({ ...base, stageKey: 'sop', severity: 'major', fields: ['evalPlan.baseline'] }, flaw)).toBe(false)
    // too lenient severity (minor < major)
    expect(findingCatches({ ...base, stageKey: 'eval', severity: 'minor', fields: ['evalPlan.baseline'] }, flaw)).toBe(false)
    // wrong field
    expect(findingCatches({ ...base, stageKey: 'eval', severity: 'major', fields: ['evalPlan.detection'] }, flaw)).toBe(false)
    // prefix match: citing 'evalPlan' catches a flaw on 'evalPlan.baseline'
    expect(findingCatches({ ...base, stageKey: 'eval', severity: 'blocker', fields: ['evalPlan'] }, flaw)).toBe(true)
  })

  it('fieldMatches handles exact and dot-prefix matches', () => {
    expect(fieldMatches('evalPlan.baseline', 'evalPlan.baseline')).toBe(true)
    expect(fieldMatches('evalPlan', 'evalPlan.baseline')).toBe(true)
    expect(fieldMatches('evalPlan.baseline', 'evalPlan')).toBe(true)
    expect(fieldMatches('sop', 'evalPlan')).toBe(false)
    expect(fieldMatches('', 'evalPlan')).toBe(false)
  })

  it('per-case recall counts flaws caught, not findings used', () => {
    const c = CORPUS.planted[0]!
    const r = scoreRecallCase(c)
    expect(r.caught).toBeLessThanOrEqual(r.planted)
    expect(r.recall).toBe(r.caught / r.planted)
  })
})

// ---------- corpus hygiene: PII-free + key sync ----------

describe('#17 — corpus is synthetic (no real PII) and keys stay in sync', () => {
  const PII_PATTERNS: { name: string; re: RegExp }[] = [
    { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
    { name: 'phone number', re: /(?:\+?\d[\s-]?){7,}\d/ },
    { name: 'US SSN', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  ]

  it('no checked-in finding text contains real PII', () => {
    const blobs: string[] = []
    for (const c of CORPUS.planted) for (const f of c.findings) blobs.push(f.claim, f.suggestedFix)
    for (const f of CORPUS.clean.findings) blobs.push(f.claim, f.suggestedFix)
    for (const text of blobs) {
      for (const p of PII_PATTERNS) {
        expect(text, `finding text contains a ${p.name}`).not.toMatch(p.re)
      }
    }
  })

  it('every checked-in finding key matches findingKey(stage, claim)', () => {
    const all = [...CORPUS.planted.flatMap((c) => c.findings), ...CORPUS.clean.findings]
    for (const f of all) {
      expect(f.key).toBe(findingKey(f.stageKey, f.claim))
    }
  })
})
