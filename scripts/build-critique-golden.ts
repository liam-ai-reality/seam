// One-off generator for tests/golden/critiques/critique.golden.json (#17).
//
// The Scope Critic eval needs a PLANTED-FLAW corpus: synthetic scopes with known
// defects injected, plus the critic's CHECKED-IN findings for each, so the
// offline scorer can measure RECALL (planted flaws caught) without a model. It
// also needs the KNOWN-CLEAN case: the reference-good sample.ts scope and the
// findings the critic raised against it — which MUST be empty (any finding is a
// false flag that fails precision, AC3).
//
// We build the findings as fixtures here (deterministic, by construction) so the
// checked-in corpus is correct and a test re-derives it to stay in sync. Re-run:
//
//   npx tsx scripts/build-critique-golden.ts
//
// then commit the regenerated JSON. All scopes are SYNTHETIC + fictional — no
// real PII. A test asserts the PII-free property and re-generation match.
//
// Type-only imports below: node strips them and never resolves the (extensionless)
// src graph, so this generator runs standalone.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CriticFinding, Severity, StageKey } from '../src/assist/tasks/critique'
import type {
  CleanGoldenCase,
  CritiqueCorpus,
  CritiqueGoldenCase,
  PlantedFlaw,
} from '../src/assist/criticEval'

// Re-implemented (one trivial pure line) so this generator needn't import the
// runtime critique module (which would drag client/transports into the runner).
// A test pins this against the real findingKey().
function findingKey(stageKey: string, claim: string): string {
  return `${stageKey}::${claim.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

/** Build a typed finding fixture. confirmed=true / high confidence: these mimic
 *  findings that already survived the cross-model confirm pass (what the UI
 *  surfaces). The scorer ignores confidence; severity + stage + fields are what
 *  matter for recall. */
function finding(
  stageKey: StageKey,
  severity: Severity,
  claim: string,
  suggestedFix: string,
  fields: string[],
): CriticFinding {
  return {
    key: findingKey(stageKey, claim),
    stageKey,
    severity,
    claim,
    suggestedFix,
    fields,
    confirmed: true,
    confidence: 'high',
  }
}

function flaw(
  id: string,
  stageKey: StageKey,
  field: string,
  minSeverity: Severity,
  note: string,
): PlantedFlaw {
  return { id, stageKey, field, minSeverity, note }
}

// ---------- planted cases ----------
//
// Each case lists the flaws planted into a synthetic brief, plus the critic
// findings produced for that brief. We make the findings CATCH the planted flaws
// (matching stage + cited field + adequate severity) so a healthy critic scores
// high recall — the fixtures stand in for a real (good) model run.

const planted: CritiqueGoldenCase[] = [
  {
    id: 'invoice-reconciliation',
    kind: 'planted',
    planted: [
      flaw('inv-no-baseline', 'eval', 'evalPlan.baseline', 'major', 'No beats-the-human baseline given'),
      flaw('inv-vague-done', 'process', 'processMap.doneDefinition', 'major', 'Definition of done is vague ("handled")'),
      flaw('inv-no-stop', 'sop', 'sop.stopConditions', 'blocker', 'No stop conditions — agent never escalates'),
    ],
    findings: [
      finding('eval', 'major', 'No human baseline to beat — you cannot tell if the agent is an improvement.', 'State the clerks current accuracy and time-per-invoice as the bar to clear.', ['evalPlan.baseline']),
      finding('process', 'major', 'Definition of done is vague ("invoices handled") and unmeasurable.', 'Define done concretely: matched to a PO, posted to the ledger, exceptions queued.', ['processMap.doneDefinition']),
      finding('sop', 'blocker', 'No stop conditions: the agent has no defined point at which it down-tools and escalates.', 'Add explicit escalation triggers (missing PO, amount over threshold, low confidence).', ['sop.stopConditions']),
    ],
  },
  {
    id: 'support-ticket-triage',
    kind: 'planted',
    planted: [
      flaw('sup-screen-unstable', 'integration', 'integrations', 'major', 'Screen-scraping an unstable UI with no change-detection'),
      flaw('sup-no-detection', 'eval', 'evalPlan.detection', 'major', 'No way to detect a bad job in production'),
    ],
    findings: [
      finding('integration', 'major', 'Screen-scraping a UI described as changing weekly, with no change-detection planned.', 'Pin selectors, add screenshot diffing and selector-miss alerts, or push for an API.', ['integrations', 'integration.approach']),
      finding('eval', 'major', 'No detection mechanism: a mis-triaged ticket would go unnoticed.', 'Add a daily reconciliation or sampling pass that surfaces mis-routes.', ['evalPlan.detection']),
      // A correctly-severe but DIFFERENT-stage extra finding (not a planted flaw):
      // exercises that recall counts catches, not raw finding count.
      finding('seam', 'minor', 'The chosen seam mixes two sub-tasks; consider splitting for a cleaner first Assignment.', 'Carve triage from routing so the first Assignment is narrower.', ['seamJustification']),
    ],
  },
  {
    id: 'order-entry-rekeying',
    kind: 'planted',
    planted: [
      flaw('ord-no-thresholds', 'sop', 'sop.thresholds', 'major', 'No thresholds/allow-lists for what the agent may act on'),
      flaw('ord-blast-radius', 'seam', 'seamCandidates', 'major', 'Chosen seam has high blast radius (irreversible writes)'),
      flaw('ord-no-offline', 'eval', 'evalPlan.offline', 'blocker', 'No offline eval before scaling'),
    ],
    findings: [
      finding('sop', 'major', 'No thresholds or allow-lists: nothing bounds what the agent may auto-process.', 'Add value caps and an allow-list of order types eligible for auto-entry.', ['sop.thresholds']),
      finding('seam', 'major', 'Chosen seam writes irreversible orders directly — blast radius is high for a first Assignment.', 'Prefer a reversible seam first, or stage writes behind human approval until trust is earned.', ['seamCandidates', 'seamJustification']),
      finding('eval', 'blocker', 'No offline evaluation: there is no golden set or shadow-run before going live.', 'Assemble a labelled case set, shadow-run, and set a ship threshold before scaling.', ['evalPlan.offline']),
    ],
  },
  {
    id: 'expense-approval',
    kind: 'planted',
    planted: [
      flaw('exp-no-human', 'sop', 'sop.needsApproval', 'major', 'Nothing requires human approval — full autonomy on money'),
      flaw('exp-no-cost-weight', 'eval', 'evalPlan.costWeightedQuality', 'minor', 'No cost-weighting of errors'),
    ],
    findings: [
      finding('sop', 'major', 'No human-approval gate on financial approvals — the agent can approve any amount alone.', 'Require human sign-off above a value threshold and for any policy exception.', ['sop.needsApproval', 'sop.agentDecides']),
      finding('eval', 'minor', 'Errors are not cost-weighted: a wrong high-value approval is treated like a trivial one.', 'Weight the quality metric so expensive mistakes dominate the score.', ['evalPlan.costWeightedQuality']),
    ],
  },
  {
    id: 'data-migration-mapping',
    kind: 'planted',
    planted: [
      flaw('dat-no-who', 'process', 'processMap.who', 'minor', 'Who does it today is unstated'),
      flaw('dat-no-cost', 'process', 'processMap.costOfError', 'major', 'Cost of error unstated for an irreversible migration'),
    ],
    findings: [
      finding('process', 'minor', 'It is unclear who performs this today, so the agent has no behaviour to match.', 'Name the current owner(s) and capture their tacit rules.', ['processMap.who']),
      finding('process', 'major', 'No stated cost of error for a one-way data migration — the risk is invisible.', 'State the downstream cost of a mis-mapped field so guardrails can be sized.', ['processMap.costOfError']),
    ],
  },
]

// ---------- the known-clean case (AC3 false-flag guard) ----------
//
// The reference-good sample.ts scope is complete and self-consistent. A healthy
// critic raises NOTHING here. We check in an EMPTY findings list; any non-empty
// list would (correctly) fail the precision gate and the AC3 test.
const clean: CleanGoldenCase = {
  id: 'sample-claims-intake',
  kind: 'clean',
  findings: [],
}

const corpus: CritiqueCorpus = { version: 1, planted, clean }

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'tests', 'golden', 'critiques', 'critique.golden.json')
writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8')
console.log(`wrote ${out}`)
console.log(`  planted cases: ${planted.length}, total planted flaws: ${planted.reduce((n, c) => n + c.planted.length, 0)}`)
console.log(`  clean case findings (must be 0): ${clean.findings.length}`)
