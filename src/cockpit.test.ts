import { afterEach, describe, expect, it, vi } from 'vitest'
import { newScope, SCHEMA_VERSION } from './constants'
import { sampleScope } from './sample'
import { isReady, seamScore } from './logic'
import {
  MODULE_SUMMARY_VERSION,
  deriveModuleSummary,
  exportModuleSummary,
  moduleSummaryText,
  type ModuleSummary,
} from './cockpit'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('deriveModuleSummary — versioning + reuse', () => {
  it('carries the cockpit schema version (independent of the Scope version)', () => {
    const s = deriveModuleSummary(sampleScope())
    expect(s.summaryVersion).toBe(MODULE_SUMMARY_VERSION)
    expect(s.scopeSchemaVersion).toBe(SCHEMA_VERSION)
  })

  it('reuses the ranking authority — chosen score equals seamScore()', () => {
    const scope = sampleScope()
    const summary = deriveModuleSummary(scope)
    const chosen = scope.seamCandidates.find((c) => c.id === scope.chosenSeamId)!
    expect(summary.chosenSeamScore).toBe(seamScore(chosen, scope.seamWeights))
    // The chosen seam is flagged, and exactly one is chosen.
    expect(summary.seams.filter((s) => s.chosen)).toHaveLength(1)
    expect(summary.seams.find((s) => s.chosen)!.id).toBe(scope.chosenSeamId)
  })

  it('reuses isReady — ready flag matches the gate', () => {
    expect(deriveModuleSummary(sampleScope()).ready).toBe(isReady(sampleScope()))
    expect(deriveModuleSummary(newScope('blank')).ready).toBe(false)
  })

  it('a blank scope: no chosen score, zero completion', () => {
    const s = deriveModuleSummary(newScope('blank'))
    expect(s.chosenSeamScore).toBeNull()
    expect(s.seams).toEqual([])
    expect(s.completion.stagesComplete).toBe(0)
    expect(s.completion.pillarsComplete).toBe(0)
  })
})

describe('deriveModuleSummary — PII-free by construction', () => {
  // The export contract must NEVER carry a free-text field a human typed. We
  // seed the sample with unique sentinels in every free-text field, serialise
  // the whole payload, and assert not one sentinel survives.
  it('excludes process / SOP / justification / notes / names', () => {
    const scope = sampleScope()
    scope.name = 'SENTINEL_SCOPE_NAME'
    scope.processMap.who = 'SENTINEL_WHO'
    scope.processMap.trigger = 'SENTINEL_TRIGGER'
    scope.processMap.doneDefinition = 'SENTINEL_DONE'
    scope.processMap.frequency = 'SENTINEL_FREQ'
    scope.processMap.costOfError = 'SENTINEL_COST'
    scope.processMap.systems = scope.processMap.systems.map((sys) => ({ ...sys, name: 'SENTINEL_SYSTEM' }))
    scope.seamCandidates = scope.seamCandidates.map((c) => ({ ...c, name: 'SENTINEL_CANDIDATE' }))
    scope.seamJustification = 'SENTINEL_JUSTIFICATION'
    scope.sop = {
      agentDecides: 'SENTINEL_AGENT_DECIDES',
      needsApproval: 'SENTINEL_APPROVAL',
      thresholds: 'SENTINEL_THRESHOLDS',
      stopConditions: 'SENTINEL_STOP',
    }
    scope.integrations = scope.integrations.map((i) => ({
      ...i,
      systemName: 'SENTINEL_SYSTEM',
      authType: 'SENTINEL_AUTH',
      notes: 'SENTINEL_NOTES',
    }))
    scope.evalPlan = {
      ...scope.evalPlan,
      worstOutput: 'SENTINEL_WORST',
      detection: 'SENTINEL_DETECTION',
      offline: 'SENTINEL_OFFLINE',
      online: 'SENTINEL_ONLINE',
      costWeightedQuality: 'SENTINEL_CWQ',
      baseline: 'SENTINEL_BASELINE',
    }
    scope.pillars = scope.pillars.map((p) => ({ ...p, handling: 'SENTINEL_HANDLING' }))

    const json = moduleSummaryText(scope)
    expect(json).not.toMatch(/SENTINEL_/)
  })

  it('the type surface carries only scores, enums, readiness, numbers', () => {
    const s: ModuleSummary = deriveModuleSummary(sampleScope())
    // Enumerate the exact top-level keys — a new free-text leak would fail this.
    expect(Object.keys(s).sort()).toEqual(
      [
        'chosenSeamScore',
        'completion',
        'freeFormOutput',
        'grader',
        'integrations',
        'ready',
        'scopeId',
        'scopeSchemaVersion',
        'seams',
        'summaryVersion',
      ].sort(),
    )
  })
})

describe('exportModuleSummary — local, no network', () => {
  it('writes the PII-free ModuleSummary to a Blob download (no fetch)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    let captured = ''
    vi.stubGlobal(
      'Blob',
      class {
        constructor(parts: unknown[]) {
          captured = String(parts[0])
        }
      },
    )
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:stub',
      revokeObjectURL: () => {},
    })
    let downloadName = ''
    vi.stubGlobal('document', {
      createElement: () => ({
        set download(v: string) {
          downloadName = v
        },
        href: '',
        click: () => {},
      }),
    })

    const scope = sampleScope()
    exportModuleSummary(scope)

    expect(fetchSpy).not.toHaveBeenCalled()
    const parsed: ModuleSummary = JSON.parse(captured)
    expect(parsed).toEqual(deriveModuleSummary(scope))
    expect(downloadName.endsWith('.cockpit.json')).toBe(true)
  })
})
