import { deriveModuleSummary } from './cockpit'
import type { GraderType, IntegrationApproach, Scope } from './types'

// ---------------------------------------------------------------------------
// Local cross-assessment priors.
//
// computePriors() is a PURE, on-device map/reduce over the scopes already in
// localStorage. ZERO network. It reduces over the SAME unit the cockpit export
// emits — deriveModuleSummary() — so a figure shown here and a figure shipped to
// a future backend come from one code path. The deterministic pure functions
// (rankSeams/seamScore via deriveModuleSummary) stay authoritative; this module
// only counts and aggregates their output. It NEVER writes to a Scope.
// ---------------------------------------------------------------------------

/** Below this many chosen seams the priors are too thin to surface. */
export const MIN_CHOSEN_SEAMS = 5

/** Mean + median + sample size for a numeric distribution. */
export interface Distribution {
  /** How many data points fed this figure — always shown alongside it. */
  n: number
  mean: number
  median: number
  min: number
  max: number
}

/** A frequency table: enum value -> count, plus the total it was drawn from. */
export interface FrequencyTable<K extends string> {
  n: number
  counts: Record<K, number>
}

export interface CorpusPriors {
  /** Total scopes reduced over (all of them, regardless of chosen seam). */
  scopeCount: number
  /** Whether enough chosen seams exist to trust the priors (>= MIN_CHOSEN_SEAMS). */
  hasEnough: boolean
  /** Distribution of the CHOSEN seam's weighted axis score across scopes. */
  chosenSeamScore: Distribution
  /** Integration-approach frequency, keyed by normalised system name. */
  approachBySystem: Record<string, FrequencyTable<IntegrationApproach>>
  /** Grader-choice frequency across all scopes. */
  graderChoice: FrequencyTable<GraderType>
  /** Stage-completion distribution (stages complete, 0..total, across scopes). */
  stageCompletion: Distribution
}

/**
 * Normalise a system name into a stable bucket key: trim, lower-case, collapse
 * internal whitespace. Pure. Empty/blank names bucket together under '' so they
 * never masquerade as a distinct system.
 */
export function normaliseSystemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

const APPROACHES: IntegrationApproach[] = ['api', 'screen', 'on-prem', 'files']

const emptyApproachCounts = (): Record<IntegrationApproach, number> => ({
  api: 0,
  screen: 0,
  'on-prem': 0,
  files: 0,
})

const emptyGraderCounts = (): Record<GraderType, number> => ({
  programmatic: 0,
  reference: 0,
  'llm-judge': 0,
  human: 0,
})

function distribution(values: number[]): Distribution {
  const n = values.length
  if (n === 0) return { n: 0, mean: 0, median: 0, min: 0, max: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  const mid = Math.floor(n / 2)
  const median = n % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
  return { n, mean: sum / n, median, min: sorted[0]!, max: sorted[n - 1]! }
}

/**
 * Reduce a corpus of Scopes to read-only priors. Pure & deterministic, zero
 * network. Reduces over deriveModuleSummary() so the priors and the cockpit
 * export agree by construction.
 */
export function computePriors(scopes: Scope[]): CorpusPriors {
  const chosenScores: number[] = []
  const stageCompletions: number[] = []
  const approachBySystem: Record<string, Record<IntegrationApproach, number>> = {}
  const graderCounts = emptyGraderCounts()
  let graderN = 0

  for (const scope of scopes) {
    const summary = deriveModuleSummary(scope)

    if (summary.chosenSeamScore !== null) chosenScores.push(summary.chosenSeamScore)
    stageCompletions.push(summary.completion.stagesComplete)

    graderCounts[summary.grader]++
    graderN++

    // Approach frequency is keyed by normalised system name; pair each
    // integration's decided approach with its system. systemName is a
    // denormalised label, never the customer's process text.
    scope.integrations.forEach((integration) => {
      if (integration.approach === null) return
      const key = normaliseSystemName(integration.systemName)
      const bucket = (approachBySystem[key] ??= emptyApproachCounts())
      bucket[integration.approach]++
    })
  }

  const approachTables: Record<string, FrequencyTable<IntegrationApproach>> = {}
  for (const [key, counts] of Object.entries(approachBySystem)) {
    const total = APPROACHES.reduce((acc, a) => acc + counts[a], 0)
    approachTables[key] = { n: total, counts }
  }

  return {
    scopeCount: scopes.length,
    hasEnough: chosenScores.length >= MIN_CHOSEN_SEAMS,
    chosenSeamScore: distribution(chosenScores),
    approachBySystem: approachTables,
    graderChoice: { n: graderN, counts: graderCounts },
    stageCompletion: distribution(stageCompletions),
  }
}
