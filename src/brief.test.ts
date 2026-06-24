import { describe, expect, it } from 'vitest'
import { newScope } from './constants'
import { sampleScope } from './sample'
import { INTEGRATION_APPROACHES } from './constants'
import { escapeCell, execSummary, generateBrief } from './brief'
import type { Scope } from './types'

/** A minimal scope with a single chosen candidate, for focused assertions. */
function oneCandidateScope(name = 'Triage'): Scope {
  const s = newScope('Test scope')
  s.processMap.who = 'a clerk'
  s.seamCandidates = [
    { id: 'c1', name, volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 4 },
  ]
  s.chosenSeamId = 'c1'
  return s
}

describe('execSummary — clean sentences', () => {
  it('does not glue the grader label onto the next clause as a run-on', () => {
    const s = oneCandidateScope()
    s.evalPlan.grader = 'programmatic'
    s.sop.stopConditions = ''
    const summary = execSummary(s)
    // The old code emitted "graded programmatic, biased toward escalation when the
    // agent is unsure" unconditionally — a glued fragment asserting escalation
    // even with no stop conditions. That must be gone.
    expect(summary).not.toContain('biased toward escalation when the agent is unsure')
    // Each sentence ends in a period; no comma-spliced run-on of the grader clause.
    expect(summary).toContain('Quality is graded programmatic.')
  })

  it('asserts escalation behaviour IFF stopConditions is set, worded from content', () => {
    const without = oneCandidateScope()
    without.sop.stopConditions = ''
    expect(execSummary(without).toLowerCase()).not.toContain('escalate')

    const withStop = oneCandidateScope()
    withStop.sop.stopConditions = 'Confidence below 0.6'
    const summary = execSummary(withStop)
    expect(summary.toLowerCase()).toContain('escalate')
    // Worded from the actual stop-condition content, not a canned phrase.
    expect(summary).toContain('confidence below 0.6')
  })
})

describe('generateBrief — Markdown table safety', () => {
  it('a candidate name containing "|" still produces a valid 7-column row', () => {
    const s = oneCandidateScope('Re-key A | B into portal')
    const brief = generateBrief(s)
    const row = brief
      .split('\n')
      .find((l) => l.startsWith('| 1 |'))
    expect(row).toBeDefined()
    // A Markdown table row has cells delimited by unescaped pipes. Count the
    // structural pipes (escaped \| must not count as a delimiter). 7 columns
    // => 8 structural pipes.
    const structuralPipes = row!.replace(/\\\|/g, '').match(/\|/g) ?? []
    expect(structuralPipes.length).toBe(8)
    // The literal name pipe survives as an escaped pipe in the cell.
    expect(row).toContain('Re-key A \\| B into portal')
  })

  it('escapeCell escapes pipe and backslash', () => {
    expect(escapeCell('a|b')).toBe('a\\|b')
    expect(escapeCell('a\\b')).toBe('a\\\\b')
  })
})

describe('generateBrief — section 4 captures auth type', () => {
  it('prints the captured authType on the system line when set', () => {
    const s = sampleScope()
    const salesforce = s.integrations.find((i) => i.systemName === 'Salesforce')!
    expect(salesforce.authType.trim().length).toBeGreaterThan(0)
    const brief = generateBrief(s)
    const line = brief
      .split('\n')
      .find((l) => l.includes(`**${salesforce.systemName}**`))
    expect(line).toBeDefined()
    expect(line).toContain(`(auth: ${salesforce.authType})`)
  })

  it('omits the auth annotation when authType is empty', () => {
    const s = sampleScope()
    s.integrations = s.integrations.map((i) => ({ ...i, authType: '' }))
    const brief = generateBrief(s)
    expect(brief).not.toContain('(auth:')
  })
})

describe('sample integration label matches its note', () => {
  it('the shared claims inbox label agrees with its files/email note', () => {
    const s = sampleScope()
    const email = s.integrations.find((i) => i.systemName === 'Shared claims inbox')
    expect(email).toBeDefined()
    expect(email!.approach).toBe('files')
    const label = INTEGRATION_APPROACHES[email!.approach!].label
    // Label and note describe the same approach: the files/email pipeline.
    expect(label).toBe('Normalise → validate → dedupe')
    expect(email!.notes).toContain('Normalise → validate → dedupe')
  })
})
