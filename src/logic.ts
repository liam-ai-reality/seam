import { GRADER_LADDER, INTEGRATION_APPROACHES, newId } from './constants'
import type {
  GraderType,
  Integration,
  IntegrationApproach,
  Scope,
  SeamCandidate,
  SeamWeights,
  SystemRef,
} from './types'

// ---------- Stage 2: seam ranking ----------

/** Weighted "automate-first" score, normalised back onto the 1–5 scale. */
export function seamScore(c: SeamCandidate, w: SeamWeights): number {
  const totalW = w.volume + w.ruleBound + w.lowJudgement + w.lowBlastRadius
  if (totalW <= 0) return 0
  const raw =
    c.volume * w.volume +
    c.ruleBound * w.ruleBound +
    c.lowJudgement * w.lowJudgement +
    c.lowBlastRadius * w.lowBlastRadius
  return raw / totalW
}

export interface RankedSeam {
  candidate: SeamCandidate
  score: number
  rank: number
}

/** Highest score first. Stable for ties (preserves input order). */
export function rankSeams(cands: SeamCandidate[], w: SeamWeights): RankedSeam[] {
  return cands
    .map((candidate) => ({ candidate, score: seamScore(candidate, w) }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/** The suggested first Assignment = top-ranked candidate. */
export function suggestedSeamId(cands: SeamCandidate[], w: SeamWeights): string | null {
  const ranked = rankSeams(cands, w)
  return ranked[0]?.candidate.id ?? null
}

// ---------- Stage 4: integration decision aid ----------

/**
 * Recommend an approach from the yes/no answers. API beats on-prem beats
 * screen. `files` is a human call (no signal in the questions) — selectable
 * but never auto-recommended. Returns null until there's enough to decide.
 */
export function recommendApproach(
  i: Pick<Integration, 'apiAvailable' | 'onPrem'>,
): IntegrationApproach | null {
  if (i.apiAvailable === true) return 'api'
  if (i.onPrem === true) return 'on-prem'
  if (i.apiAvailable === false) return 'screen'
  return null
}

const blankIntegration = (sys: SystemRef): Integration => ({
  id: newId(),
  systemId: sys.id,
  systemName: sys.name,
  apiAvailable: null,
  authType: '',
  onPrem: null,
  uiStable: null,
  approach: null,
  notes: '',
})

/**
 * Keep one integration per current system: preserve edited ones, add blanks
 * for new systems, drop orphans, and refresh denormalised names. Pure —
 * returns a new array.
 */
export function reconcileIntegrations(scope: Scope): Integration[] {
  return scope.processMap.systems.map((sys) => {
    const existing = scope.integrations.find((i) => i.systemId === sys.id)
    return existing ? { ...existing, systemName: sys.name } : blankIntegration(sys)
  })
}

/** Canonical notes for an approach. */
export const approachNotes = (a: IntegrationApproach): string => INTEGRATION_APPROACHES[a].notes

/**
 * Brittleness/auth warnings for a chosen integration. Pure. A screen-scraping
 * approach is inherently fragile; an explicitly *unstable* UI makes it worse,
 * so it earns a stronger warning than the baseline screen caveat.
 */
export function approachWarnings(i: Integration): string[] {
  const warnings: string[] = []
  if (i.approach === 'screen') {
    warnings.push(
      i.uiStable === false
        ? 'Screen-scraping an unstable UI: expect frequent breakage — pin selectors, add change-detection, and budget for ongoing maintenance.'
        : 'Screen-scraping is brittle: confirm the UI is stable and add change-detection.',
    )
  }
  return warnings
}

// ---------- Stage 5: grader chooser ----------

/** Cheapest sufficient grader: programmatic unless the output is free-form. */
export function recommendGrader(freeFormOutput: boolean): GraderType {
  return freeFormOutput ? 'llm-judge' : (GRADER_LADDER[0] ?? 'programmatic')
}

// ---------- Readiness gate ----------

export interface StageStatus {
  key: string
  label: string
  complete: boolean
  hint: string
}

export function stageStatuses(s: Scope): StageStatus[] {
  const pm = s.processMap
  const t = (v: string) => v.trim().length > 0

  const process = t(pm.who) && t(pm.trigger) && t(pm.doneDefinition)
  const seam =
    s.seamCandidates.length > 0 && s.chosenSeamId !== null && t(s.seamJustification)
  const sop = t(s.sop.agentDecides) && t(s.sop.stopConditions)
  const integration =
    pm.systems.length > 0 &&
    pm.systems.every((sys) => {
      const i = s.integrations.find((x) => x.systemId === sys.id)
      return i != null && i.approach !== null
    })
  const evalReady =
    t(s.evalPlan.worstOutput) &&
    t(s.evalPlan.detection) &&
    t(s.evalPlan.offline) &&
    t(s.evalPlan.online) &&
    t(s.evalPlan.costWeightedQuality) &&
    t(s.evalPlan.baseline)

  return [
    { key: 'process', label: 'Map the process', complete: process, hint: 'Who, trigger, and definition of done' },
    { key: 'seam', label: 'Find the seam', complete: seam, hint: 'A scored candidate chosen, with a justification' },
    { key: 'sop', label: 'SOP & guardrails', complete: sop, hint: 'What the agent decides + stop conditions' },
    { key: 'integration', label: 'Integration', complete: integration, hint: 'An approach chosen for every system' },
    { key: 'eval', label: 'Failure modes & eval', complete: evalReady, hint: 'Worst output, detection, offline + online plan, cost-weighted quality, and a baseline' },
  ]
}

/** A pillar truly counts only when it's toggled done AND says how it's handled. */
export function pillarComplete(p: Scope['pillars'][number]): boolean {
  return p.done && p.handling.trim().length > 0
}

export function pillarsDone(s: Scope): boolean {
  return s.pillars.length === 4 && s.pillars.every(pillarComplete)
}

/** Ready to build = all five stages have content AND all four pillars done. */
export function isReady(s: Scope): boolean {
  return stageStatuses(s).every((st) => st.complete) && pillarsDone(s)
}

export function readinessGaps(s: Scope): string[] {
  const gaps = stageStatuses(s)
    .filter((st) => !st.complete)
    .map((st) => st.label)
  if (!pillarsDone(s)) {
    const open = s.pillars
      .filter((p) => !pillarComplete(p))
      .map((p) => (p.done ? `${p.title} (no handling)` : p.title))
    gaps.push(`Pillars: ${open.join(', ')}`)
  }
  return gaps
}
