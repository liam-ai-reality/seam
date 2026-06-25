import { newPillars, newScope } from './constants'
import type {
  EvalPlan,
  GraderType,
  Integration,
  IntegrationApproach,
  Pillar,
  PillarKey,
  ProcessMap,
  Scope,
  SeamCandidate,
  SeamWeights,
  Sop,
  SystemRef,
} from './types'

const KEY = 'seam.scopes.v1'

/** Outcome of a persistence attempt — never throws, so the UI can react. */
export type SaveResult =
  | { ok: true }
  | { ok: false; kind: 'quota' | 'blocked'; message: string }

export function loadScopes(): Scope[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(migrate) : []
  } catch {
    return []
  }
}

/**
 * Persist scopes without ever throwing into the caller (a React effect). A
 * QuotaExceededError surfaces as 'quota'; anything else (blocked / disabled
 * storage in private mode, SecurityError) surfaces as 'blocked'.
 */
export function saveScopes(scopes: Scope[]): SaveResult {
  try {
    localStorage.setItem(KEY, JSON.stringify(scopes))
    return { ok: true }
  } catch (err) {
    if (isQuotaError(err)) {
      return {
        ok: false,
        kind: 'quota',
        message: 'Storage is full — your latest changes could not be saved. Export this scope to keep it safe.',
      }
    }
    return {
      ok: false,
      kind: 'blocked',
      message: 'Storage is unavailable (private mode or disabled) — changes will not persist across reloads. Export this scope to keep it safe.',
    }
  }
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'QuotaExceededError' || err.code === 22
  }
  return err instanceof Error && err.name === 'QuotaExceededError'
}

// ---------- shaping ----------
//
// These coercers are the single parse layer for untrusted Scope data — both
// localStorage migration and imported files run through them. The optional
// assist surface (src/assist/accept.ts) reuses them as its parse layer too, so
// a model-proposed value lands in a Scope by exactly the same path as a loaded
// or imported one. They are exported for that reuse; nothing else outside this
// module should need them.

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const boolOrNull = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** Coerce to an integer clamped into [1, 5]; non-numbers fall back to 3. */
export const axis = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 3
  return Math.min(5, Math.max(1, n))
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const GRADER_TYPES: GraderType[] = ['programmatic', 'reference', 'llm-judge', 'human']
const APPROACHES: IntegrationApproach[] = ['api', 'screen', 'on-prem', 'files']

function shapeSystem(v: unknown, defaults: SystemRef): SystemRef {
  const o = obj(v)
  return {
    id: str(o.id, defaults.id),
    name: str(o.name, defaults.name),
  }
}

export function shapeProcessMap(v: unknown, base: ProcessMap): ProcessMap {
  const o = obj(v)
  return {
    who: str(o.who, base.who),
    systems: arr(o.systems).map((s, i) =>
      shapeSystem(s, { id: `sys-${i}`, name: '' }),
    ),
    trigger: str(o.trigger, base.trigger),
    doneDefinition: str(o.doneDefinition, base.doneDefinition),
    frequency: str(o.frequency, base.frequency),
    costOfError: str(o.costOfError, base.costOfError),
  }
}

export function shapeCandidate(v: unknown, i: number): SeamCandidate {
  const o = obj(v)
  return {
    id: str(o.id, `cand-${i}`),
    name: str(o.name),
    volume: axis(o.volume),
    ruleBound: axis(o.ruleBound),
    lowJudgement: axis(o.lowJudgement),
    lowBlastRadius: axis(o.lowBlastRadius),
  }
}

function shapeWeights(v: unknown, base: SeamWeights): SeamWeights {
  const o = obj(v)
  const w = (k: keyof SeamWeights): number =>
    typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : base[k]
  return {
    volume: w('volume'),
    ruleBound: w('ruleBound'),
    lowJudgement: w('lowJudgement'),
    lowBlastRadius: w('lowBlastRadius'),
  }
}

function shapeSop(v: unknown, base: Sop): Sop {
  const o = obj(v)
  return {
    agentDecides: str(o.agentDecides, base.agentDecides),
    needsApproval: str(o.needsApproval, base.needsApproval),
    thresholds: str(o.thresholds, base.thresholds),
    stopConditions: str(o.stopConditions, base.stopConditions),
  }
}

export function shapeEvalPlan(v: unknown, base: EvalPlan): EvalPlan {
  const o = obj(v)
  const grader = GRADER_TYPES.includes(o.grader as GraderType)
    ? (o.grader as GraderType)
    : 'programmatic'
  return {
    worstOutput: str(o.worstOutput, base.worstOutput),
    detection: str(o.detection, base.detection),
    offline: str(o.offline, base.offline),
    online: str(o.online, base.online),
    costWeightedQuality: str(o.costWeightedQuality, base.costWeightedQuality),
    baseline: str(o.baseline, base.baseline),
    freeFormOutput: typeof o.freeFormOutput === 'boolean' ? o.freeFormOutput : base.freeFormOutput,
    grader,
  }
}

export function shapeIntegration(v: unknown, i: number): Integration {
  const o = obj(v)
  const approach = APPROACHES.includes(o.approach as IntegrationApproach)
    ? (o.approach as IntegrationApproach)
    : null
  return {
    id: str(o.id, `int-${i}`),
    systemId: str(o.systemId),
    systemName: str(o.systemName),
    apiAvailable: boolOrNull(o.apiAvailable),
    authType: str(o.authType),
    onPrem: boolOrNull(o.onPrem),
    uiStable: boolOrNull(o.uiStable),
    approach,
    notes: str(o.notes),
  }
}

/** Rebuild the four canonical pillars, overlaying handling/done matched by key. */
function shapePillars(v: unknown): Pillar[] {
  const incoming = new Map<PillarKey, Record<string, unknown>>()
  for (const raw of arr(v)) {
    const o = obj(raw)
    if (typeof o.key === 'string') incoming.set(o.key as PillarKey, o)
  }
  return newPillars().map((p) => {
    const o = incoming.get(p.key)
    if (!o) return p
    return {
      ...p,
      handling: str(o.handling, p.handling),
      done: typeof o.done === 'boolean' ? o.done : p.done,
    }
  })
}

/** Shape an arbitrary (possibly partial / corrupt) object into a full Scope. */
function migrate(s: unknown): Scope {
  const o = obj(s)
  const base = newScope(str(o.name, 'Untitled'))
  return {
    id: str(o.id, base.id),
    name: str(o.name, base.name),
    createdAt: str(o.createdAt, base.createdAt),
    updatedAt: str(o.updatedAt, base.updatedAt),
    processMap: shapeProcessMap(o.processMap, base.processMap),
    seamCandidates: arr(o.seamCandidates).map(shapeCandidate),
    seamWeights: shapeWeights(o.seamWeights, base.seamWeights),
    chosenSeamId: typeof o.chosenSeamId === 'string' ? o.chosenSeamId : null,
    seamJustification: str(o.seamJustification, base.seamJustification),
    sop: shapeSop(o.sop, base.sop),
    integrations: arr(o.integrations).map(shapeIntegration),
    evalPlan: shapeEvalPlan(o.evalPlan, base.evalPlan),
    pillars: shapePillars(o.pillars),
  }
}

export function exportScope(scope: Scope): void {
  const blob = new Blob([JSON.stringify(scope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(scope.name)}.seam.json`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Parse + repair an imported scope. Repairs partially-bad objects rather than
 * throwing; only rejects non-objects or a missing/wrong-type name.
 */
export function parseImportedScope(text: string): Scope {
  const parsed: unknown = JSON.parse(text)
  const o = obj(parsed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof o.name !== 'string') {
    throw new Error('Not a Seam scope file')
  }
  return migrate(parsed)
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scope'
