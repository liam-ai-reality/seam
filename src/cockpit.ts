import { isReady, rankSeams, seamScore, stageStatuses } from './logic'
import type { GraderType, IntegrationApproach, Scope } from './types'

// ---------------------------------------------------------------------------
// ModuleSummary — the PII-free cockpit payload.
//
// This is the SAME unit computePriors() (src/corpus.ts) reduces over, and the
// shape a future backend will ingest. It is PII-FREE BY CONSTRUCTION: it carries
// ONLY scores, enums, readiness flags, and ROI-shaped numbers. It deliberately
// OMITS every free-text field a human typed — process narrative (who/trigger/
// doneDefinition/...), the SOP (agentDecides/needsApproval/...), the seam
// justification, integration notes, pillar handling, and even scope/system/
// candidate NAMES. Nothing reconstructible into a customer's private process
// crosses this boundary. deriveModuleSummary builds it field-by-field from
// enums and numbers, so the type can never silently grow a free-text leak.
// ---------------------------------------------------------------------------

/**
 * Schema version for the cockpit payload, independent of a Scope's own
 * schemaVersion. Bump when the ModuleSummary shape changes so an ingesting
 * backend can branch instead of guessing.
 */
export const MODULE_SUMMARY_VERSION = 1

/** One seam candidate reduced to its axis scores + derived weighted score. */
export interface SeamScoreSummary {
  /** Stable id (a uuid, not free text) so callers can correlate without names. */
  id: string
  volume: number
  ruleBound: number
  lowJudgement: number
  lowBlastRadius: number
  /** seamScore() under the scope's own weights — the ranking authority. */
  score: number
  /** 1-based rank under those weights (1 = top). */
  rank: number
  /** Whether this is the chosen seam. */
  chosen: boolean
}

/** One system's integration reduced to its decision enum (no notes / auth). */
export interface IntegrationSummary {
  /** Chosen approach enum, or null if undecided. */
  approach: IntegrationApproach | null
}

/** Stage completion as booleans only — never the text that satisfied them. */
export interface CompletionSummary {
  /** key -> complete; keys are the fixed stage keys, not user content. */
  stages: Record<string, boolean>
  stagesComplete: number
  stagesTotal: number
  pillarsComplete: number
  pillarsTotal: number
}

/** The cockpit payload: versioned, enums + numbers + readiness only. */
export interface ModuleSummary {
  summaryVersion: number
  /** The originating Scope's own schema version (provenance, not content). */
  scopeSchemaVersion: number
  /** Stable scope id — a uuid, carries no process information. */
  scopeId: string
  ready: boolean
  seams: SeamScoreSummary[]
  /** Chosen seam's weighted score, or null when nothing is chosen. */
  chosenSeamScore: number | null
  integrations: IntegrationSummary[]
  grader: GraderType
  /** Whether the eval output is free-form (drives the grader). */
  freeFormOutput: boolean
  completion: CompletionSummary
}

/**
 * Reduce a Scope to its PII-free ModuleSummary. Pure & deterministic. Reuses
 * the ranking authority (rankSeams/seamScore), the readiness gate (isReady),
 * and pillarsDone — it does NOT re-derive any of that logic. By construction it
 * only ever reads scores, enums, and booleans; it never copies a free-text field.
 */
export function deriveModuleSummary(scope: Scope): ModuleSummary {
  const ranked = rankSeams(scope.seamCandidates, scope.seamWeights)
  const seams: SeamScoreSummary[] = ranked.map((r) => ({
    id: r.candidate.id,
    volume: r.candidate.volume,
    ruleBound: r.candidate.ruleBound,
    lowJudgement: r.candidate.lowJudgement,
    lowBlastRadius: r.candidate.lowBlastRadius,
    score: r.score,
    rank: r.rank,
    chosen: r.candidate.id === scope.chosenSeamId,
  }))

  const chosen = scope.seamCandidates.find((c) => c.id === scope.chosenSeamId)
  const chosenSeamScore = chosen ? seamScore(chosen, scope.seamWeights) : null

  const statuses = stageStatuses(scope)
  const stages: Record<string, boolean> = {}
  for (const st of statuses) stages[st.key] = st.complete

  return {
    summaryVersion: MODULE_SUMMARY_VERSION,
    scopeSchemaVersion: scope.schemaVersion,
    scopeId: scope.id,
    ready: isReady(scope),
    seams,
    chosenSeamScore,
    integrations: scope.integrations.map((i) => ({ approach: i.approach })),
    grader: scope.evalPlan.grader,
    freeFormOutput: scope.evalPlan.freeFormOutput,
    completion: {
      stages,
      stagesComplete: statuses.filter((s) => s.complete).length,
      stagesTotal: statuses.length,
      pillarsComplete: scope.pillars.filter((p) => p.done && p.handling.trim().length > 0).length,
      pillarsTotal: scope.pillars.length,
    },
  }
}

/**
 * Serialize a ModuleSummary to a local file download — mirrors exportScope, no
 * network. Pure I/O at the edge; the payload it writes is already PII-free.
 */
export function exportModuleSummary(scope: Scope): void {
  const summary = deriveModuleSummary(scope)
  const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${cockpitSlug(scope.name)}.cockpit.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** The cockpit payload as a pretty-printed JSON string (for clipboard copy). */
export function moduleSummaryText(scope: Scope): string {
  return JSON.stringify(deriveModuleSummary(scope), null, 2)
}

const cockpitSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scope'
