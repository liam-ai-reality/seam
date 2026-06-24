import { GRADERS, INTEGRATION_APPROACHES, SEAM_AXES } from './constants'
import { isReady, rankSeams, readinessGaps } from './logic'
import type { Scope } from './types'

const dash = (v: string) => (v.trim() ? v.trim() : '—')

/** Escape a value for safe placement in a Markdown table cell. */
export function escapeCell(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

/** One-paragraph executive summary, robust to half-filled scopes. */
export function execSummary(s: Scope): string {
  const chosen = s.seamCandidates.find((c) => c.id === s.chosenSeamId)
  const who = s.processMap.who.trim() || 'the team'
  const approaches = [...new Set(s.integrations.filter((i) => i.approach).map((i) => INTEGRATION_APPROACHES[i.approach!].label))]
  const ready = isReady(s)

  const sentences: string[] = []
  sentences.push(
    chosen
      ? `**${s.name}** scopes "${chosen.name}" as the first Assignment carved out of ${who}'s process.`
      : `**${s.name}** scopes an automation out of ${who}'s process.`,
  )
  if (s.processMap.trigger.trim()) sentences.push(`It is triggered when ${lower(s.processMap.trigger.trim())}.`)
  if (approaches.length) sentences.push(`Integration is ${approaches.join(' + ')}.`)

  const grader = GRADERS[s.evalPlan.grader].label.toLowerCase()
  const stop = s.sop.stopConditions.trim()
  if (stop) {
    sentences.push(`Quality is graded ${grader}, and the agent stops to escalate when ${lower(stop)}.`)
  } else {
    sentences.push(`Quality is graded ${grader}.`)
  }

  sentences.push(
    ready
      ? 'All five stages and four reliability pillars are complete — ready to build.'
      : `Not yet ready to build (${readinessGaps(s).join('; ')}).`,
  )
  return sentences.join(' ')
}

const lower = (v: string) => v.charAt(0).toLowerCase() + v.slice(1)

/** The full sectioned scoping brief, as Markdown. */
export function generateBrief(s: Scope): string {
  const pm = s.processMap
  const out: string[] = []

  out.push(`# Scoping Brief — ${s.name}`, '')
  out.push(`_${execSummary(s)}_`, '')

  // 1
  out.push('## 1. The Process', '')
  out.push(`- **Who does it:** ${dash(pm.who)}`)
  out.push(`- **Trigger:** ${dash(pm.trigger)}`)
  out.push(`- **Definition of done:** ${dash(pm.doneDefinition)}`)
  out.push(`- **Frequency / volume:** ${dash(pm.frequency)}`)
  out.push(`- **Cost when it goes wrong:** ${dash(pm.costOfError)}`)
  out.push(`- **Systems involved:** ${pm.systems.length ? pm.systems.map((x) => x.name).join(', ') : '—'}`)
  out.push('')

  // 2
  out.push('## 2. The Seam (first Assignment)', '')
  if (s.seamCandidates.length) {
    const ranked = rankSeams(s.seamCandidates, s.seamWeights)
    out.push('| # | Candidate | Vol | Rule | Judg. | Blast | Score |')
    out.push('|---|-----------|-----|------|-------|-------|-------|')
    for (const r of ranked) {
      const c = r.candidate
      const star = c.id === s.chosenSeamId ? ' ⭐' : ''
      out.push(
        `| ${r.rank} | ${escapeCell(c.name)}${star} | ${c.volume} | ${c.ruleBound} | ${c.lowJudgement} | ${c.lowBlastRadius} | ${r.score.toFixed(2)} |`,
      )
    }
    out.push('')
    const weights = SEAM_AXES.map((a) => `${a.label} ×${s.seamWeights[a.key]}`).join(', ')
    out.push(`_Weights: ${weights}. ⭐ = chosen first Assignment._`, '')
    const chosen = s.seamCandidates.find((c) => c.id === s.chosenSeamId)
    if (chosen) out.push(`**Chosen first Assignment:** ${chosen.name}`)
    out.push(`**Why:** ${dash(s.seamJustification)}`)
  } else {
    out.push('_No candidates scored yet._')
  }
  out.push('')

  // 3
  out.push('## 3. SOP & Guardrails', '')
  out.push(`- **Agent may decide alone:** ${dash(s.sop.agentDecides)}`)
  out.push(`- **Needs human approval:** ${dash(s.sop.needsApproval)}`)
  out.push(`- **Thresholds / tolerances / allow-lists:** ${dash(s.sop.thresholds)}`)
  out.push(`- **Stop conditions (down tools, escalate):** ${dash(s.sop.stopConditions)}`)
  out.push('')

  // 4
  out.push('## 4. Integration Approach', '')
  if (s.integrations.length) {
    for (const i of s.integrations) {
      const label = i.approach ? INTEGRATION_APPROACHES[i.approach].label : 'Not yet decided'
      out.push(`- **${i.systemName}** → ${label}`)
      if (i.notes.trim()) out.push(`  - ${i.notes.trim()}`)
    }
  } else {
    out.push('_No systems added._')
  }
  out.push('')

  // 5
  const ep = s.evalPlan
  out.push('## 5. Failure Modes & Evaluation', '')
  out.push(`- **Worst wrong output:** ${dash(ep.worstOutput)}`)
  out.push(`- **How a bad Job is detected:** ${dash(ep.detection)}`)
  out.push(`- **Offline (before scale):** ${dash(ep.offline)}`)
  out.push(`- **Online (after deploy):** ${dash(ep.online)}`)
  out.push(`- **Cost-weighted quality:** ${dash(ep.costWeightedQuality)}`)
  out.push(`- **Beats-the-human baseline:** ${dash(ep.baseline)}`)
  out.push(`- **Grader:** ${GRADERS[ep.grader].label} — ${GRADERS[ep.grader].note}`)
  out.push('')

  // Pillars
  out.push('## Agent-Reliability Pillars', '')
  for (const p of s.pillars) {
    out.push(`- ${p.done ? '✅' : '⬜'} **${p.title}** — ${p.description}`)
    if (p.handling.trim()) out.push(`  - ${p.handling.trim()}`)
  }
  out.push('')

  out.push('---')
  out.push(isReady(s) ? '**Readiness: READY TO BUILD**' : `**Readiness: NOT READY** — missing: ${readinessGaps(s).join('; ')}`)
  out.push('')

  return out.join('\n')
}
