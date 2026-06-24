// #16 — OUT-OF-BAND cross-model judge runner. This is the ONLY eval entry that
// touches the network, and it NEVER runs in CI. It grades the fuzzy free-text
// fields of the golden corpus's model outputs with a DIFFERENT model than
// produced them (opus extracts → sonnet judges; "no model grades its own work").
//
// It is network-gated three ways:
//   1. assistAvailable() must be true (seam.assist enabled) — runAssist refuses
//      otherwise, so an accidental offline invocation is a no-op throw.
//   2. byoKeyTransport re-checks the gate before every fetch.
//   3. It is not a *.test.ts file, so `npm test` / CI never collect it.
//
// HOW TO RUN (out-of-band, with a key — costs tokens, hits the API):
//   SEAM_ASSIST_KEY=sk-ant-... node scripts/eval-judge.ts
//
// Without SEAM_ASSIST_KEY it prints how to enable and exits 0 (no network).
//
// `.ts` extensions on the imports let `node` (type-stripping) resolve the graph
// without a bundler. Note: byoKeyTransport pulls in the gate, which reads
// localStorage; this runner shims a minimal localStorage from the env so the
// gate can be flipped on deliberately for the out-of-band run.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { GoldenCorpus } from '../src/assist/captureEval.ts'
import type { JudgeItem } from '../src/assist/captureJudge.ts'

const key = process.env.SEAM_ASSIST_KEY ?? ''

// No key → print how to run and exit WITHOUT importing the assist runtime graph
// (no network, no module side effects). This is the only path reachable in a
// keyless environment; the keyed path below lazy-imports the gated runtime.
if (!key) {
  console.log('cross-model judge: OUT-OF-BAND only — no network performed.')
  console.log('To run it (costs tokens, hits the Anthropic API):')
  console.log('  SEAM_ASSIST_KEY=sk-ant-... node scripts/eval-judge.ts')
  console.log('Judge model: claude-sonnet-4-6  (extractor: claude-opus-4-8 — must differ).')
  process.exit(0)
}

// Deliberately enable the gate for this explicit, opt-in run by shimming the
// localStorage the gate + transport read. This is the single place the network
// is intentionally turned on, and only when a key was supplied.
const store: Record<string, string> = {
  'seam.assist': JSON.stringify({ enabled: true, apiKey: key }),
}
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
  removeItem: (k: string) => {
    delete store[k]
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k]
  },
}

async function main(): Promise<void> {
  // Imported AFTER the localStorage shim so the gate sees the enabled flag.
  const { byoKeyTransport } = await import('../src/assist/transports/byoKeyTransport.ts')
  const { judgeAll, summariseVerdicts, JUDGE_DEFAULT_MODEL, EXTRACTOR_MODEL } = await import(
    '../src/assist/captureJudge.ts'
  )
  const transport = byoKeyTransport({ apiKey: key })

  const here = dirname(fileURLToPath(import.meta.url))
  const corpus = JSON.parse(
    readFileSync(join(here, '..', 'tests', 'golden', 'capture.golden.json'), 'utf8'),
  ) as GoldenCorpus

  // Collect the fuzzy free-text fields the programmatic scorer can't grade.
  const items: JudgeItem[] = []
  for (const c of corpus.cases) {
    const dd = c.modelOutput.processMap.doneDefinition.value
    if (dd) items.push({ id: `${c.id}:doneDefinition`, source: c.source, field: 'doneDefinition', produced: dd })
    const ce = c.modelOutput.processMap.costOfError.value
    if (ce) items.push({ id: `${c.id}:costOfError`, source: c.source, field: 'costOfError', produced: ce })
    for (const [i, f] of c.modelOutput.failureModes.entries()) {
      if (f.value.value) items.push({ id: `${c.id}:failureMode[${i}]`, source: c.source, field: 'failureMode', produced: f.value.value })
    }
  }

  console.log(`Judging ${items.length} fuzzy fields with ${JUDGE_DEFAULT_MODEL} (produced by ${EXTRACTOR_MODEL})...\n`)
  const verdicts = await judgeAll(items, transport)
  for (const v of verdicts) {
    const flag = v.grounded && v.useful ? 'PASS' : 'FAIL'
    console.log(`  [${flag}] ${v.id}  grounded=${v.grounded} useful=${v.useful}  ${v.rationale}`)
  }
  const sum = summariseVerdicts(verdicts)
  console.log(`\nFuzzy-field pass rate: ${(sum.passRate * 100).toFixed(1)}%  (${sum.grounded}/${sum.total} grounded, ${sum.useful}/${sum.total} useful)`)
  process.exit(sum.passRate >= 0.8 ? 0 : 1)
}

void main()
