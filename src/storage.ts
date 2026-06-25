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

/**
 * Read the corpus with per-scope fault isolation: one malformed scope is
 * dropped (or salvaged) without taking down the rest, and a top-level array
 * parse failure falls back to best-effort element recovery instead of nuking
 * everything. Never throws — a React initializer can call it directly.
 */
export function loadScopes(): Scope[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // Storage unavailable (private mode / disabled) — behave as empty.
    return []
  }
  if (!raw) return []

  const elements = parseCorpusElements(raw)
  return migrateAll(elements)
}

/**
 * Best-effort split of the stored corpus into per-scope JSON values. Tries a
 * clean array parse first; on failure (one corrupt blob breaks the whole
 * array) it salvages whatever well-formed top-level elements it can.
 */
function parseCorpusElements(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
    // A lone object that isn't wrapped in an array — salvage it as one scope.
    if (parsed && typeof parsed === 'object') return [parsed]
    return []
  } catch {
    return salvageArrayElements(raw)
  }
}

/**
 * Scan a malformed array string and pull out each top-level element span,
 * parsing the ones that are individually valid. A single broken element no
 * longer poisons its siblings.
 */
function salvageArrayElements(raw: string): unknown[] {
  const open = raw.indexOf('[')
  const close = raw.lastIndexOf(']')
  if (open === -1 || close <= open) return []
  const out: unknown[] = []
  let depth = 0
  let inStr = false
  let escaped = false
  let start = -1
  for (let i = open + 1; i < close; i++) {
    const ch = raw[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      if (depth === 0 && start === -1) start = i
      continue
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0 && start === -1) start = i
      depth++
      continue
    }
    if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0 && start !== -1) {
        pushParsed(out, raw.slice(start, i + 1))
        start = -1
      }
      continue
    }
    if (depth === 0 && ch === ',') {
      if (start !== -1) {
        pushParsed(out, raw.slice(start, i))
        start = -1
      }
      continue
    }
    if (depth === 0 && start === -1 && ch !== undefined && !/\s/.test(ch)) start = i
  }
  if (start !== -1) pushParsed(out, raw.slice(start, close))
  return out
}

function pushParsed(out: unknown[], span: string): void {
  try {
    out.push(JSON.parse(span))
  } catch {
    // Individually-corrupt element — drop it, keep the rest.
  }
}

/** Migrate each element under its own try/catch so one throw can't sink the array. */
function migrateAll(elements: unknown[]): Scope[] {
  const out: Scope[] = []
  for (const el of elements) {
    try {
      out.push(migrate(el))
    } catch {
      // A scope that even migrate() can't shape is dropped, not fatal.
    }
  }
  return out
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

/** Coerce to a positive-integer schema version; anything invalid defaults. */
const schemaVer = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : fallback

/** Shape an arbitrary (possibly partial / corrupt) object into a full Scope. */
function migrate(s: unknown): Scope {
  const o = obj(s)
  const base = newScope(str(o.name, 'Untitled'))
  return {
    id: str(o.id, base.id),
    schemaVersion: schemaVer(o.schemaVersion, base.schemaVersion),
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
