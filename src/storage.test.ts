import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveScopes, parseImportedScope, exportScope } from './storage'
import { newScope } from './constants'
import { sampleScope } from './sample'
import { generateBrief } from './brief'
import type { Scope } from './types'

// The test runner uses the node environment (no real DOM), so we install a
// controllable localStorage / Blob / URL / document for these tests.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubStorage(setItem: (k: string, v: string) => void) {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem,
    removeItem: () => {},
    clear: () => {},
  } as unknown as Storage)
}

describe('saveScopes — failure tolerance (#2)', () => {
  it('does NOT throw and reports quota when setItem hits QuotaExceededError', () => {
    stubStorage(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    let result: ReturnType<typeof saveScopes> | undefined
    expect(() => {
      result = saveScopes([newScope('a')])
    }).not.toThrow()
    expect(result).toEqual({ ok: false, kind: 'quota', message: expect.any(String) })
  })

  it('does NOT throw and reports blocked when storage is unavailable', () => {
    stubStorage(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    let result: ReturnType<typeof saveScopes> | undefined
    expect(() => {
      result = saveScopes([newScope('a')])
    }).not.toThrow()
    expect(result).toEqual({ ok: false, kind: 'blocked', message: expect.any(String) })
  })

  it('quota and blocked are distinguishable, and a clean save is ok', () => {
    stubStorage(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const quota = saveScopes([newScope('a')])

    stubStorage(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const blocked = saveScopes([newScope('a')])

    const stored: Record<string, string> = {}
    stubStorage((k, v) => {
      stored[k] = v
    })
    const okResult = saveScopes([newScope('a')])

    expect(quota.ok).toBe(false)
    expect(blocked.ok).toBe(false)
    expect(quota).not.toEqual(blocked)
    expect(okResult).toEqual({ ok: true })
  })
})

describe('parseImportedScope — repair, not crash (#3)', () => {
  it('repairs a deeply-malformed object into a fully-shaped Scope', () => {
    const junk = JSON.stringify({
      name: 'Broken import',
      // no processMap at all
      seamCandidates: [
        { id: 'c1', name: 'x', volume: 99, ruleBound: -4, lowJudgement: 3.7, lowBlastRadius: 'nope' },
      ],
      evalPlan: { grader: 'totally-invalid-grader', freeFormOutput: 'yes please' },
      integrations: [{ id: 'i1', systemId: 's1', systemName: 'S', approach: 'magic' }],
      pillars: 'not even an array',
      extraJunk: { nested: [1, 2, 3] },
      chosenSeamId: 42,
    })

    const scope = parseImportedScope(junk)

    // Fully shaped against newScope() defaults.
    expect(scope.processMap).toBeDefined()
    expect(Array.isArray(scope.processMap.systems)).toBe(true)
    expect(scope.pillars).toHaveLength(4)
    expect(scope.seamWeights).toBeDefined()
    expect(scope.sop).toBeDefined()
    // grader coerced to a valid value
    expect(['programmatic', 'reference', 'llm-judge', 'human']).toContain(scope.evalPlan.grader)
    expect(scope.evalPlan.grader).toBe('programmatic')
    // freeFormOutput coerced to boolean
    expect(typeof scope.evalPlan.freeFormOutput).toBe('boolean')
    // axes coerced to integers clamped 1..5
    const c = scope.seamCandidates[0]!
    expect(c.volume).toBe(5)
    expect(c.ruleBound).toBe(1)
    expect(c.lowJudgement).toBe(4)
    expect(Number.isInteger(c.lowBlastRadius)).toBe(true)
    expect(c.lowBlastRadius).toBeGreaterThanOrEqual(1)
    // invalid approach coerced to null
    expect(scope.integrations[0]!.approach).toBeNull()
    // bad chosenSeamId coerced to null
    expect(scope.chosenSeamId).toBeNull()
  })

  it('generateBrief does NOT throw on the repaired malformed object', () => {
    const junk = JSON.stringify({
      name: 'Broken import',
      evalPlan: { grader: 'totally-invalid-grader' },
      integrations: [{ id: 'i1', systemId: 's1', systemName: 'S', approach: 'magic' }],
    })
    const scope = parseImportedScope(junk)
    expect(() => generateBrief(scope)).not.toThrow()
    expect(generateBrief(scope)).toContain('# Scoping Brief')
  })

  it('still throws on non-objects and wrong-type name', () => {
    expect(() => parseImportedScope('null')).toThrow()
    expect(() => parseImportedScope('42')).toThrow()
    expect(() => parseImportedScope('[]')).toThrow()
    expect(() => parseImportedScope(JSON.stringify({ name: 123 }))).toThrow()
  })
})

describe('export -> import round-trip (#3)', () => {
  it('round-trips sampleScope() to a deep-equal Scope', () => {
    const sample = sampleScope()
    let captured = ''

    // exportScope serializes into a Blob and triggers a download via an <a>.
    // Capture the JSON text the Blob is built from.
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
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click: () => {} }),
    })

    exportScope(sample)

    const roundTripped: Scope = parseImportedScope(captured)
    expect(roundTripped).toEqual(sample)
  })
})
