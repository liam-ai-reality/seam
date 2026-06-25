import type {
  GraderType,
  IntegrationApproach,
  Pillar,
  Scope,
  SeamWeights,
} from './types'

export const newId = (): string => crypto.randomUUID()

/**
 * Current Scope schema version. Stamped onto every Scope at creation and
 * defaulted by migrate() for older stored scopes that predate the field, so
 * future migrations can branch on it rather than coercing data away blind.
 */
export const SCHEMA_VERSION = 1

export const SEAM_AXES = [
  { key: 'volume', label: 'Volume', hint: 'How much of it there is' },
  { key: 'ruleBound', label: 'Rule-bound', hint: 'How well-defined the rules are' },
  { key: 'lowJudgement', label: 'Low judgement', hint: 'How little human judgement it needs' },
  { key: 'lowBlastRadius', label: 'Low blast-radius', hint: 'How contained the damage is when wrong' },
] as const

export const DEFAULT_WEIGHTS: SeamWeights = {
  volume: 1,
  ruleBound: 1,
  lowJudgement: 1,
  lowBlastRadius: 1,
}

/** The five spine stages, in order. Titles are fixed by the methodology. */
export const STAGES = [
  { key: 'process', label: 'Map the process', n: 1 },
  { key: 'seam', label: 'Find the seam', n: 2 },
  { key: 'sop', label: 'SOP & guardrails', n: 3 },
  { key: 'integration', label: 'Integration', n: 4 },
  { key: 'eval', label: 'Failure modes & eval', n: 5 },
  { key: 'ready', label: 'Reliability & brief', n: 6 },
] as const

export type StageKey = (typeof STAGES)[number]['key']

export const INTEGRATION_APPROACHES: Record<
  IntegrationApproach,
  { label: string; tagline: string; notes: string }
> = {
  api: {
    label: 'Use the API',
    tagline: 'API available',
    notes:
      'Use the API. Capture auth (OAuth / service account), idempotency, retries, and rate limits.',
  },
  screen: {
    label: 'Screen-driven',
    tagline: 'No API, web portal',
    notes:
      'Screen-driven. Brittle to layout change — require instrumentation, fail loud never silent, and plan credential rotation.',
  },
  'on-prem': {
    label: 'Run where it lives',
    tagline: 'On-prem desktop app',
    notes:
      'Run where it lives. Read-only first, earn write access. The constraint is usually trust / politics, not tech.',
  },
  files: {
    label: 'Normalise → validate → dedupe',
    tagline: 'Files / email / spreadsheets',
    notes:
      'Normalise → validate → dedupe at volume. Guard against silent data corruption with row-count / total checks.',
  },
}

export const GRADERS: Record<GraderType, { label: string; note: string }> = {
  programmatic: {
    label: 'Programmatic',
    note: 'Output is a number / category — just check it. Cheapest; default unless free-form.',
  },
  reference: {
    label: 'Reference',
    note: 'Compare to a known-good answer within a tolerance.',
  },
  'llm-judge': {
    label: 'LLM-as-judge',
    note: 'Rubric-scored by an LLM. Validate the judge against humans before trusting it.',
  },
  human: {
    label: 'Human',
    note: 'Gold standard, expensive — sample it.',
  },
}

/** Order = cheapest sufficient first. */
export const GRADER_LADDER: GraderType[] = ['programmatic', 'reference', 'llm-judge', 'human']

const PILLAR_DEFS: Omit<Pillar, 'handling' | 'done'>[] = [
  {
    key: 'guardrails',
    title: 'Guardrails',
    description: "Deterministic limits the agent can't reason past.",
  },
  {
    key: 'human-in-loop',
    title: 'Human-in-the-loop',
    description: 'Approval gates placed by risk & reversibility.',
  },
  {
    key: 'observability',
    title: 'Observability',
    description: 'Every Job leaves a replayable trace; alerts defined.',
  },
  {
    key: 'eval-before-scale',
    title: 'Eval before scale',
    description: 'Case set, grader, threshold; caught failures become new cases.',
  },
]

export const newPillars = (): Pillar[] =>
  PILLAR_DEFS.map((p) => ({ ...p, handling: '', done: false }))

export function newScope(name: string): Scope {
  const now = new Date().toISOString()
  return {
    id: newId(),
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: now,
    updatedAt: now,
    processMap: {
      who: '',
      systems: [],
      trigger: '',
      doneDefinition: '',
      frequency: '',
      costOfError: '',
    },
    seamCandidates: [],
    seamWeights: { ...DEFAULT_WEIGHTS },
    chosenSeamId: null,
    seamJustification: '',
    sop: { agentDecides: '', needsApproval: '', thresholds: '', stopConditions: '' },
    integrations: [],
    evalPlan: {
      worstOutput: '',
      detection: '',
      offline: '',
      online: '',
      costWeightedQuality: '',
      baseline: '',
      freeFormOutput: false,
      grader: 'programmatic',
    },
    pillars: newPillars(),
  }
}
