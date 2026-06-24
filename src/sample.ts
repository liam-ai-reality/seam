import { newId, newPillars } from './constants'
import { recommendApproach } from './logic'
import type { Scope } from './types'

/** A fully-worked sample so a new user can see the shape of a finished scope. */
export function sampleScope(): Scope {
  const now = new Date().toISOString()
  const sysSalesforce = { id: newId(), name: 'Salesforce' }
  const sysPortal = { id: newId(), name: 'Carrier web portal' }
  const sysEmail = { id: newId(), name: 'Shared claims inbox' }

  const candidates = [
    { id: newId(), name: 'Triage & categorise inbound claims', volume: 5, ruleBound: 4, lowJudgement: 4, lowBlastRadius: 4 },
    { id: newId(), name: 'Draft the final settlement letter', volume: 3, ruleBound: 2, lowJudgement: 1, lowBlastRadius: 1 },
    { id: newId(), name: 'Re-key claim data into the carrier portal', volume: 4, ruleBound: 5, lowJudgement: 5, lowBlastRadius: 3 },
  ]
  const chosen = candidates[0]!

  const mkIntegration = (sys: { id: string; name: string }, fields: Partial<{ apiAvailable: boolean; authType: string; onPrem: boolean; uiStable: boolean; notes: string }>) => {
    const apiAvailable = fields.apiAvailable ?? null
    const onPrem = fields.onPrem ?? null
    return {
      id: newId(),
      systemId: sys.id,
      systemName: sys.name,
      apiAvailable,
      authType: fields.authType ?? '',
      onPrem,
      uiStable: fields.uiStable ?? null,
      approach: recommendApproach({ apiAvailable, onPrem }),
      notes: fields.notes ?? '',
    }
  }

  return {
    id: newId(),
    name: 'Sample — Claims intake triage',
    createdAt: now,
    updatedAt: now,
    processMap: {
      who: 'Two claims clerks in the ops team',
      systems: [sysSalesforce, sysPortal, sysEmail],
      trigger: 'A new claim email lands in the shared inbox',
      doneDefinition: 'The claim is categorised, logged in Salesforce, and routed to the right adjuster queue',
      frequency: '~400 claims/week, spikes after storms',
      costOfError: 'A mis-routed high-value claim misses its SLA and the carrier is fined',
    },
    seamCandidates: candidates,
    seamWeights: { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 },
    chosenSeamId: chosen.id,
    seamJustification:
      'Triage is high-volume, well-defined, and reversible — a mis-categorisation is caught at the adjuster queue, not at payout.',
    sop: {
      agentDecides: 'Category, urgency, and which adjuster queue for claims under £10k',
      needsApproval: 'Anything over £10k, or any claim flagged potential-fraud',
      thresholds: 'Confidence ≥ 0.8 to auto-route; allow-list of 6 claim categories only',
      stopConditions: 'Missing policy number, unreadable attachment, or category confidence < 0.6 → escalate to a clerk',
    },
    integrations: [
      mkIntegration(sysSalesforce, { apiAvailable: true, authType: 'OAuth service account', onPrem: false, uiStable: true, notes: 'Use the API. OAuth service account, idempotent upserts keyed by claim ref, retry with backoff, respect 100 req/min limit.' }),
      mkIntegration(sysPortal, { apiAvailable: false, authType: 'Username/password', onPrem: false, uiStable: false, notes: 'Screen-driven. Layout changes monthly — screenshot every step, alert on selector miss, rotate the shared credential quarterly.' }),
      mkIntegration(sysEmail, { apiAvailable: true, authType: 'OAuth (Graph API)', onPrem: false, uiStable: true, notes: 'Normalise → validate → dedupe. De-dupe on message-id, validate sender against the policy book, count rows ingested vs processed daily.' }),
    ],
    evalPlan: {
      worstOutput: 'A fraud-flagged claim silently auto-routed to fast-track payout',
      detection: 'Daily reconciliation: every auto-routed claim cross-checked against the fraud watchlist; mismatches alert ops',
      offline: '200 historically-labelled claims as a golden set; shadow-run the agent against them; ship only at ≥ 97% routing accuracy',
      online: 'Track auto-route rate, escalation rate, and confidence distribution; sample 5% of auto-routed claims for human review weekly',
      costWeightedQuality: 'A wrong fast-track on a fraud claim costs ~100× a wrong queue on a routine one — threshold biased hard toward escalation',
      baseline: 'Clerks currently triage at ~94% accuracy in ~6 min/claim; agent must beat both before scale',
      freeFormOutput: false,
      grader: 'programmatic',
    },
    pillars: newPillars().map((p) => ({
      ...p,
      done: true,
      handling: {
        guardrails: 'Hard caps: £10k value ceiling, 6-category allow-list, no auto-route below 0.8 confidence.',
        'human-in-loop': 'Clerk approves all >£10k and all fraud-flagged claims before they move.',
        observability: 'Every Job stores the email, the features, the decision, and the confidence — replayable from the claim ref.',
        'eval-before-scale': 'Golden set of 200 claims; programmatic grader; 97% threshold; every escalation that turns out wrong is added back as a case.',
      }[p.key],
    })),
  }
}
