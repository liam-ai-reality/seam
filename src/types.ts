// Domain model for Seam. The methodology is encoded here — keep it faithful.

export type ID = string

/** A system / screen / surface involved in the customer's process. */
export interface SystemRef {
  id: ID
  name: string
}

/** Stage 1 — Map the real process. */
export interface ProcessMap {
  who: string            // who does it today
  systems: SystemRef[]   // systems / screens touched
  trigger: string        // what kicks it off
  doneDefinition: string // what "done" looks like
  frequency: string      // frequency / volume
  costOfError: string    // cost when it goes wrong
}

/** Stage 2 — a candidate sub-task scored on the four "automate-first" axes (1–5). */
export interface SeamCandidate {
  id: ID
  name: string
  volume: number         // how much of it there is
  ruleBound: number      // how rule-bound it is
  lowJudgement: number   // how little human judgement it needs
  lowBlastRadius: number // how contained the damage is if it's wrong
}

/** Positive weights for the four axes. Defaults are equal. */
export interface SeamWeights {
  volume: number
  ruleBound: number
  lowJudgement: number
  lowBlastRadius: number
}

/** Stage 3 — SOP & guardrails. */
export interface Sop {
  agentDecides: string  // what the agent may decide alone
  needsApproval: string // what needs a human gate
  thresholds: string    // thresholds / tolerances / allow-lists
  stopConditions: string// when to down tools and escalate
}

export type IntegrationApproach = 'api' | 'screen' | 'on-prem' | 'files'

/** Stage 4 — one decision-aid result per system. */
export interface Integration {
  id: ID
  systemId: ID
  systemName: string                  // denormalised: stable in the brief
  apiAvailable: boolean | null
  authType: string
  onPrem: boolean | null
  uiStable: boolean | null
  approach: IntegrationApproach | null // chosen (defaults to the recommendation)
  notes: string
}

export type GraderType = 'programmatic' | 'reference' | 'llm-judge' | 'human'

/** Stage 5 — failure modes & eval plan. */
export interface EvalPlan {
  worstOutput: string          // the worst wrong output
  detection: string            // how a bad Job would be detected
  offline: string              // case set / shadow-run / ship threshold
  online: string               // proxies + sampling after deploy
  costWeightedQuality: string  // expensive errors must be rare
  baseline: string             // beats-the-human baseline
  freeFormOutput: boolean      // drives the grader recommendation
  grader: GraderType
}

export type PillarKey = 'guardrails' | 'human-in-loop' | 'observability' | 'eval-before-scale'

/** Cross-cutting Agent-Reliability pillar. */
export interface Pillar {
  key: PillarKey
  title: string
  description: string // canonical, fixed
  handling: string    // how THIS deployment handles it
  done: boolean
}

/** A Scope = one customer process being scoped into an Assignment. */
export interface Scope {
  id: ID
  name: string
  createdAt: string
  updatedAt: string
  processMap: ProcessMap
  seamCandidates: SeamCandidate[]
  seamWeights: SeamWeights
  chosenSeamId: ID | null
  seamJustification: string
  sop: Sop
  integrations: Integration[]
  evalPlan: EvalPlan
  pillars: Pillar[]
}
