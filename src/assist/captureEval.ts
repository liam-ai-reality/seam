// #16 — the PURE, deterministic, offline field-level scorer for the Capture
// Copilot extraction. It reports a HANDFUL OF SEPARATE metrics — never one
// blended number — so a regression in one axis can't be hidden by a win in
// another:
//
//   1. ProcessMap precision / recall   (per-field exactness)
//   2. seam-candidate SET overlap      (did we propose the right sub-tasks?)
//   3. seam-RANKING agreement          (via the SAME rankSeams the product uses)
//   4. fabricated-span rate            (how often verbatimCheck would fire) —
//                                       a HARD SAFETY metric, not a quality one.
//
// PURE: no model calls, no DOM, no clock, no network. It scores a checked-in
// model-output fixture against a checked-in expected answer, so it runs under
// `npm test` / CI with zero live data. The cross-model JUDGE (captureJudge.ts)
// is the network-gated, out-of-band complement for the fuzzy free-text fields a
// programmatic scorer cannot fairly grade.

import { verbatimCheck } from './ground.ts'
import { rankSeams } from '../logic.ts'
import type { Sourced } from './types'
// Type-only: never resolved at runtime (so the node runner needn't traverse the
// heavy tasks/capture graph — client/transports/network code).
import type { CapturePayload } from './tasks/capture'
import type { SeamCandidate, SeamWeights } from '../types'

/**
 * Stable content key for a candidate — identical to the one tasks/capture uses
 * for dedup. Re-implemented here (one trivial pure line) ONLY so this pure
 * scorer needn't import the runtime tasks/capture module (which would drag the
 * client + transports into the offline runner). A test pins the two in sync.
 */
export function candidateKey(name: string | null): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------- the corpus shape (mirrored by tests/golden/*.json) ----------

/** The known-correct, hand-labelled answer for one source. */
export interface GoldenExpected {
  processMap: {
    who: string
    systems: string[]
    trigger: string
    doneDefinition: string
    frequency: string
    costOfError: string
  }
  /** The candidates that SHOULD be proposed, with their correct 1-5 axes. */
  candidates: {
    name: string
    volume: number
    ruleBound: number
    lowJudgement: number
    lowBlastRadius: number
  }[]
  /** Starter failure modes that should be surfaced (free-text — judged fuzzily). */
  failureModes: { field: 'worstOutput' | 'detection'; value: string }[]
}

/**
 * One golden case. `modelOutput` is a CHECKED-IN fixture of what a model
 * produced for `source` — this is what makes the scorer offline: we score the
 * fixture, we never call the model in CI.
 */
export interface GoldenCase {
  id: string
  /** What kind of input this is, for the scorecard breakdown. */
  kind: 'transcript' | 'sop' | 'email'
  /** SYNTHETIC or fully-redacted only — asserted PII-free by a test. */
  source: string
  expected: GoldenExpected
  /** The model's actual extraction for `source`, checked in (no network in CI). */
  modelOutput: CapturePayload
}

/** The versioned corpus file shape. */
export interface GoldenCorpus {
  version: number
  cases: GoldenCase[]
}

// ---------- per-field metric primitives ----------

/** A precision/recall/F1 triple. Counts kept so cases can be aggregated. */
export interface PrecisionRecall {
  /** Correct predictions / total predictions made. 1 when nothing predicted. */
  precision: number
  /** Correct predictions / total expected. 1 when nothing expected. */
  recall: number
  /** Harmonic mean; 0 when either side is 0 and the other is positive. */
  f1: number
  truePositives: number
  predicted: number
  expected: number
}

function prf(truePositives: number, predicted: number, expected: number): PrecisionRecall {
  const precision = predicted === 0 ? 1 : truePositives / predicted
  const recall = expected === 0 ? 1 : truePositives / expected
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1, truePositives, predicted, expected }
}

/** Normalise a free-ish string for exact field comparison: trim + collapse ws + casefold. */
export function normField(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------- ProcessMap precision / recall ----------

/** The single-valued ProcessMap fields scored for exactness. */
const PM_SCALAR_FIELDS = ['who', 'trigger', 'doneDefinition', 'frequency', 'costOfError'] as const

/**
 * ProcessMap precision/recall over the scalar fields PLUS the multi-valued
 * `systems` set. A predicted field counts as a true positive only when it has a
 * non-empty value AND matches the expected value (normalised). Empty-vs-empty is
 * not counted on either side (nothing predicted, nothing expected).
 */
export function scoreProcessMap(expected: GoldenExpected, output: CapturePayload): PrecisionRecall {
  let tp = 0
  let predicted = 0
  let expCount = 0

  for (const f of PM_SCALAR_FIELDS) {
    const exp = normField(expected.processMap[f])
    const got = normField(output.processMap[f]?.value)
    if (exp !== '') expCount += 1
    if (got !== '') predicted += 1
    if (got !== '' && got === exp) tp += 1
  }

  // systems is a set: TP = intersection size, predicted = #emitted, expected = #expected.
  const expSystems = new Set(expected.processMap.systems.map(normField).filter((s) => s !== ''))
  const gotSystems = new Set(
    output.processMap.systems.map((s) => normField(s.value)).filter((s) => s !== ''),
  )
  expCount += expSystems.size
  predicted += gotSystems.size
  for (const s of gotSystems) if (expSystems.has(s)) tp += 1

  return prf(tp, predicted, expCount)
}

// ---------- seam-candidate SET overlap ----------

/** Jaccard overlap of candidate sets keyed by the SAME candidateKey used in dedup. */
export interface SetOverlap {
  /** |intersection| / |union|. 1 when both empty. */
  jaccard: number
  intersection: number
  union: number
  /** Precision/recall framing of the same sets, for the scorecard. */
  prf: PrecisionRecall
}

export function scoreCandidateOverlap(
  expected: GoldenExpected,
  output: CapturePayload,
): SetOverlap {
  const exp = new Set(expected.candidates.map((c) => candidateKey(c.name)).filter((k) => k !== ''))
  const got = new Set(output.candidates.map((c) => candidateKey(c.name.value)).filter((k) => k !== ''))
  let inter = 0
  for (const k of got) if (exp.has(k)) inter += 1
  const union = new Set([...exp, ...got]).size
  const jaccard = union === 0 ? 1 : inter / union
  return { jaccard, intersection: inter, union, prf: prf(inter, got.size, exp.size) }
}

// ---------- seam-RANKING agreement (via the product's rankSeams) ----------

/**
 * Ranking agreement: build SeamCandidate values for the candidates the model and
 * the golden answer AGREE exist (by key), then rank BOTH with the SAME
 * rankSeams/seamScore the product uses, and measure how much the two orderings
 * agree (Kendall-tau-style concordant-pair fraction). We only rank the shared
 * set so this measures ranking, not recall (overlap already covers recall).
 *
 * Returns 1 when there are <2 shared candidates (nothing to disagree about).
 */
export interface RankingAgreement {
  /** Fraction of candidate pairs ordered the same way by both rankings (0..1). */
  agreement: number
  /** How many candidates were shared and therefore rankable. */
  shared: number
  concordant: number
  pairs: number
}

export function scoreRankingAgreement(
  expected: GoldenExpected,
  output: CapturePayload,
  weights: SeamWeights,
): RankingAgreement {
  const expByKey = new Map(expected.candidates.map((c) => [candidateKey(c.name), c]))
  const gotByKey = new Map(
    output.candidates.map((c) => [candidateKey(c.name.value), c] as const),
  )
  const sharedKeys = [...gotByKey.keys()].filter((k) => k !== '' && expByKey.has(k))

  if (sharedKeys.length < 2) {
    return { agreement: 1, shared: sharedKeys.length, concordant: 0, pairs: 0 }
  }

  const expCands: SeamCandidate[] = sharedKeys.map((k) => {
    const c = expByKey.get(k)!
    return { id: k, name: c.name, volume: c.volume, ruleBound: c.ruleBound, lowJudgement: c.lowJudgement, lowBlastRadius: c.lowBlastRadius }
  })
  const gotCands: SeamCandidate[] = sharedKeys.map((k) => {
    const c = gotByKey.get(k)!
    return {
      id: k,
      name: c.name.value ?? k,
      volume: numOr(c.volume, 3),
      ruleBound: numOr(c.ruleBound, 3),
      lowJudgement: numOr(c.lowJudgement, 3),
      lowBlastRadius: numOr(c.lowBlastRadius, 3),
    }
  })

  const expRank = rankPositions(rankSeams(expCands, weights))
  const gotRank = rankPositions(rankSeams(gotCands, weights))

  let concordant = 0
  let pairs = 0
  for (let i = 0; i < sharedKeys.length; i++) {
    for (let j = i + 1; j < sharedKeys.length; j++) {
      const a = sharedKeys[i]!
      const b = sharedKeys[j]!
      pairs += 1
      const expOrder = Math.sign(expRank.get(a)! - expRank.get(b)!)
      const gotOrder = Math.sign(gotRank.get(a)! - gotRank.get(b)!)
      // Ties on either side count as agreement (no inversion).
      if (expOrder === gotOrder || expOrder === 0 || gotOrder === 0) concordant += 1
    }
  }
  return { agreement: pairs === 0 ? 1 : concordant / pairs, shared: sharedKeys.length, concordant, pairs }
}

function rankPositions(ranked: { candidate: SeamCandidate; rank: number }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of ranked) m.set(r.candidate.id, r.rank)
  return m
}

function numOr(s: Sourced<number>, fallback: number): number {
  return typeof s.value === 'number' ? s.value : fallback
}

// ---------- fabricated-span rate (HARD SAFETY metric) ----------

/**
 * The fraction of cited spans across the whole payload that FAIL verbatimCheck
 * against the source — i.e. spans the model fabricated. This is the one metric
 * with a hard ceiling: a real fabricated span means the model invented a
 * citation, which is a safety failure regardless of how "good" the value reads.
 * 0 spans → rate 0 (nothing to fabricate).
 */
export interface FabricationRate {
  /** fabricated / total spans (0..1). Lower is better; 0 is the only safe target. */
  rate: number
  fabricated: number
  totalSpans: number
}

export function scoreFabricatedSpans(source: string, output: CapturePayload): FabricationRate {
  let total = 0
  let bad = 0
  const visit = (s: Sourced<unknown>) => {
    for (const span of s.sourceSpans) {
      total += 1
      if (!verbatimCheck(source, span)) bad += 1
    }
  }
  const pm = output.processMap
  visit(pm.who)
  pm.systems.forEach(visit)
  visit(pm.trigger)
  visit(pm.doneDefinition)
  visit(pm.frequency)
  visit(pm.costOfError)
  for (const c of output.candidates) {
    visit(c.name)
    visit(c.volume)
    visit(c.ruleBound)
    visit(c.lowJudgement)
    visit(c.lowBlastRadius)
  }
  for (const f of output.failureModes) visit(f.value)
  return { rate: total === 0 ? 0 : bad / total, fabricated: bad, totalSpans: total }
}

// ---------- per-case + aggregate scorecard ----------

export interface CaseScore {
  id: string
  kind: GoldenCase['kind']
  processMap: PrecisionRecall
  candidateOverlap: SetOverlap
  ranking: RankingAgreement
  fabrication: FabricationRate
}

export function scoreCase(c: GoldenCase, weights: SeamWeights): CaseScore {
  return {
    id: c.id,
    kind: c.kind,
    processMap: scoreProcessMap(c.expected, c.modelOutput),
    candidateOverlap: scoreCandidateOverlap(c.expected, c.modelOutput),
    ranking: scoreRankingAgreement(c.expected, c.modelOutput, weights),
    fabrication: scoreFabricatedSpans(c.source, c.modelOutput),
  }
}

/** The aggregate report — each metric kept SEPARATE (never blended). */
export interface Scorecard {
  cases: CaseScore[]
  /** Micro-averaged (pooled counts) ProcessMap precision/recall/f1. */
  processMap: PrecisionRecall
  /** Micro-averaged candidate-set precision/recall + mean Jaccard. */
  candidate: { prf: PrecisionRecall; meanJaccard: number }
  /** Mean ranking agreement over cases with a rankable shared set. */
  rankingAgreement: number
  /** Pooled fabricated-span rate across the whole corpus (the safety gate). */
  fabricationRate: FabricationRate
}

export function scoreCorpus(corpus: GoldenCorpus, weights: SeamWeights): Scorecard {
  const cases = corpus.cases.map((c) => scoreCase(c, weights))

  const pm = poolPrf(cases.map((c) => c.processMap))
  const cand = poolPrf(cases.map((c) => c.candidateOverlap.prf))
  const meanJaccard = mean(cases.map((c) => c.candidateOverlap.jaccard))

  const rankable = cases.filter((c) => c.ranking.pairs > 0)
  const rankingAgreement = rankable.length === 0 ? 1 : mean(rankable.map((c) => c.ranking.agreement))

  const fabricated = cases.reduce((n, c) => n + c.fabrication.fabricated, 0)
  const totalSpans = cases.reduce((n, c) => n + c.fabrication.totalSpans, 0)

  return {
    cases,
    processMap: pm,
    candidate: { prf: cand, meanJaccard },
    rankingAgreement,
    fabricationRate: { rate: totalSpans === 0 ? 0 : fabricated / totalSpans, fabricated, totalSpans },
  }
}

function poolPrf(items: PrecisionRecall[]): PrecisionRecall {
  const tp = items.reduce((n, i) => n + i.truePositives, 0)
  const predicted = items.reduce((n, i) => n + i.predicted, 0)
  const expected = items.reduce((n, i) => n + i.expected, 0)
  return prf(tp, predicted, expected)
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 1 : xs.reduce((a, b) => a + b, 0) / xs.length
}

// ---------- the declared SHIP THRESHOLD (the CI gate) ----------

/**
 * The explicit ship bar. Each metric is gated INDEPENDENTLY — a blended pass is
 * not possible. The fabricated-span rate is a HARD ceiling (any fabrication is a
 * safety failure), so its bar is 0.
 */
export interface ShipThreshold {
  processMapF1: number
  candidateF1: number
  rankingAgreement: number
  /** Hard ceiling on fabricated spans. 0 = none tolerated. */
  maxFabricationRate: number
}

export const SHIP_THRESHOLD: ShipThreshold = {
  processMapF1: 0.8,
  candidateF1: 0.7,
  rankingAgreement: 0.8,
  maxFabricationRate: 0,
}

export interface GateResult {
  pass: boolean
  failures: string[]
}

/** Evaluate a scorecard against a threshold. Pure; the runner turns this into an exit code. */
export function evaluateGate(card: Scorecard, t: ShipThreshold = SHIP_THRESHOLD): GateResult {
  const failures: string[] = []
  if (card.processMap.f1 < t.processMapF1)
    failures.push(`ProcessMap F1 ${fmt(card.processMap.f1)} < ${fmt(t.processMapF1)}`)
  if (card.candidate.prf.f1 < t.candidateF1)
    failures.push(`Candidate F1 ${fmt(card.candidate.prf.f1)} < ${fmt(t.candidateF1)}`)
  if (card.rankingAgreement < t.rankingAgreement)
    failures.push(`Ranking agreement ${fmt(card.rankingAgreement)} < ${fmt(t.rankingAgreement)}`)
  if (card.fabricationRate.rate > t.maxFabricationRate)
    failures.push(
      `Fabricated-span rate ${fmt(card.fabricationRate.rate)} > ${fmt(t.maxFabricationRate)} ` +
        `(${card.fabricationRate.fabricated}/${card.fabricationRate.totalSpans} spans) — SAFETY`,
    )
  return { pass: failures.length === 0, failures }
}

function fmt(n: number): string {
  return n.toFixed(3)
}
