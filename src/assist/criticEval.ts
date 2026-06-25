// #17 — the PURE, deterministic, offline scorer for the Scope Critic. It reports
// TWO SEPARATE metrics — never one blended number:
//
//   1. RECALL on a planted-flaw corpus: of the flaws we deliberately planted into
//      synthetic scopes, how many did the critic catch? (matched by stage +
//      cited field).
//   2. PRECISION against a KNOWN-CLEAN scope: the reference-good sample.ts scope
//      should draw (almost) no findings. Findings raised against it are FALSE
//      FLAGS. A critic that flags the reference-good scope FAILS its own eval —
//      this is the locked guard (AC3).
//
// PURE: no model calls, no DOM, no clock, no network. It scores CHECKED-IN critic
// outputs (the planted-flaw golden set + a fixture run against the clean scope)
// against the planted ground truth, so it runs under `npm test` / CI with zero
// live data. The cross-model CONFIRM/REFUTE pass (critique.ts) is the network-
// gated complement and never runs in CI.

import type { CriticFinding, Severity, StageKey } from './tasks/critique'

// ---------- the corpus shape (mirrored by tests/golden/critiques/*.json) ----------

/** One planted flaw: a real defect we injected, keyed by stage + an affected field. */
export interface PlantedFlaw {
  /** Stable id for the scorecard breakdown. */
  id: string
  /** Which stage the flaw lives in — the critic must attach a finding here. */
  stageKey: StageKey
  /**
   * The scope field path the flaw concerns (e.g. 'evalPlan.baseline'). A finding
   * counts as a catch only if it attaches to this stage AND cites this field
   * (prefix match — 'evalPlan.baseline' matches a finding citing 'evalPlan').
   */
  field: string
  /** Minimum severity we expect — the critic must rate it at least this bad. */
  minSeverity: Severity
  /** Human note on what was planted, for the report. */
  note: string
}

/**
 * One planted-flaw golden case: a synthetic brief with N planted flaws, plus the
 * CHECKED-IN critic findings produced for it. The findings are a fixture — this
 * is what makes the scorer offline (we score the fixture; we never call a model
 * in CI).
 */
export interface CritiqueGoldenCase {
  id: string
  /** A short label for the kind of scope, for the scorecard. */
  kind: 'planted'
  /** The flaws deliberately planted into this case's brief. */
  planted: PlantedFlaw[]
  /** The critic's actual findings for this case, checked in (no network in CI). */
  findings: CriticFinding[]
}

/**
 * The known-clean case: the reference-good scope (sample.ts) and the critic's
 * findings against it. The whole point is that `findings` should be (near) empty;
 * anything here is a false flag that fails precision.
 */
export interface CleanGoldenCase {
  id: string
  kind: 'clean'
  findings: CriticFinding[]
}

/** The versioned corpus file shape. */
export interface CritiqueCorpus {
  version: number
  planted: CritiqueGoldenCase[]
  clean: CleanGoldenCase
}

// ---------- matching ----------

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, major: 1, minor: 2 }

/** True iff `finding` is at least as severe as `min` (blocker ≥ major ≥ minor). */
function severityAtLeast(finding: Severity, min: Severity): boolean {
  return SEVERITY_RANK[finding] <= SEVERITY_RANK[min]
}

/**
 * Does a finding catch a planted flaw? Stage must match, the finding must cite a
 * field that matches the planted field (exact, or the planted field is a
 * dot-prefix-extension of a cited one — so citing 'evalPlan' catches a flaw on
 * 'evalPlan.baseline'), and severity must be >= the planted minimum.
 */
export function findingCatches(finding: CriticFinding, flaw: PlantedFlaw): boolean {
  if (finding.stageKey !== flaw.stageKey) return false
  if (!severityAtLeast(finding.severity, flaw.minSeverity)) return false
  return finding.fields.some((cited) => fieldMatches(cited, flaw.field))
}

/** Field match: exact, or one is a dot-path prefix of the other. Case-insensitive. */
export function fieldMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x === '' || y === '') return false
  return x === y || x.startsWith(`${y}.`) || y.startsWith(`${x}.`)
}

// ---------- recall (planted flaws caught) ----------

export interface RecallScore {
  /** caught / planted. 1 when nothing was planted. */
  recall: number
  caught: number
  planted: number
  /** The ids of planted flaws no finding caught — for the report. */
  missed: string[]
}

/**
 * Recall over one planted case: each planted flaw is caught if ANY finding
 * catches it. A finding may catch at most... well, we count flaws caught, not
 * findings used, so multiple findings on one flaw still count as one catch.
 */
export function scoreRecallCase(c: CritiqueGoldenCase): RecallScore {
  const missed: string[] = []
  let caught = 0
  for (const flaw of c.planted) {
    if (c.findings.some((f) => findingCatches(f, flaw))) caught += 1
    else missed.push(flaw.id)
  }
  const planted = c.planted.length
  return { recall: planted === 0 ? 1 : caught / planted, caught, planted, missed }
}

// ---------- precision (false flags on the clean scope) ----------

export interface PrecisionScore {
  /** 1 - (falseFlags / totalFindings). 1 when no findings were raised. */
  precision: number
  /** Findings raised against the known-clean scope — every one is a false flag. */
  falseFlags: number
  totalFindings: number
}

/**
 * Precision on the known-clean reference scope. EVERY finding raised against it
 * is a false flag (the scope is good by construction). Precision is
 * 1 - falseFlagRate; a perfectly-behaved critic raises nothing here.
 */
export function scoreCleanPrecision(c: CleanGoldenCase): PrecisionScore {
  const totalFindings = c.findings.length
  return {
    precision: totalFindings === 0 ? 1 : 0,
    falseFlags: totalFindings,
    totalFindings,
  }
}

// ---------- aggregate scorecard ----------

export interface CaseRecall {
  id: string
  recall: RecallScore
}

export interface CriticScorecard {
  perCase: CaseRecall[]
  /** Micro-averaged recall: total caught / total planted across all cases. */
  recall: RecallScore
  /** Precision against the reference-good clean scope. */
  precision: PrecisionScore
}

export function scoreCorpus(corpus: CritiqueCorpus): CriticScorecard {
  const perCase = corpus.planted.map((c) => ({ id: c.id, recall: scoreRecallCase(c) }))

  const caught = perCase.reduce((n, c) => n + c.recall.caught, 0)
  const planted = perCase.reduce((n, c) => n + c.recall.planted, 0)
  const missed = perCase.flatMap((c) => c.recall.missed)

  return {
    perCase,
    recall: { recall: planted === 0 ? 1 : caught / planted, caught, planted, missed },
    precision: scoreCleanPrecision(corpus.clean),
  }
}

// ---------- the declared SHIP THRESHOLD (the CI gate) ----------

/**
 * The explicit ship bar. Each metric is gated INDEPENDENTLY.
 *
 * - minRecall: the critic must catch most planted flaws to be worth surfacing.
 * - minCleanPrecision = 1: the locked guard. Precision is 1 only when the critic
 *   raises ZERO findings on the reference-good scope. Flagging the clean scope
 *   drops precision below 1 and FAILS the critic's own eval (AC3).
 */
export interface CriticShipThreshold {
  minRecall: number
  /** Must be 1: any false flag on the reference-good scope fails the eval. */
  minCleanPrecision: number
}

export const CRITIC_SHIP_THRESHOLD: CriticShipThreshold = {
  minRecall: 0.8,
  minCleanPrecision: 1,
}

export interface GateResult {
  pass: boolean
  failures: string[]
}

/** Evaluate a scorecard against the threshold. Pure; the runner turns it into an exit code. */
export function evaluateGate(
  card: CriticScorecard,
  t: CriticShipThreshold = CRITIC_SHIP_THRESHOLD,
): GateResult {
  const failures: string[] = []
  if (card.recall.recall < t.minRecall)
    failures.push(
      `Recall ${fmt(card.recall.recall)} < ${fmt(t.minRecall)} ` +
        `(${card.recall.caught}/${card.recall.planted} planted flaws caught; missed: ${card.recall.missed.join(', ') || 'none'})`,
    )
  if (card.precision.precision < t.minCleanPrecision)
    failures.push(
      `Clean-scope precision ${fmt(card.precision.precision)} < ${fmt(t.minCleanPrecision)} ` +
        `(${card.precision.falseFlags} false flag(s) raised against the reference-good scope) — FALSE-FLAG GUARD`,
    )
  return { pass: failures.length === 0, failures }
}

function fmt(n: number): string {
  return n.toFixed(3)
}
