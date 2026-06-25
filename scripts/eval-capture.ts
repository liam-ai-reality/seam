// #16 runner — prints the Capture Copilot eval SCORECARD and exits non-zero when
// any metric is below its declared ship threshold. PURE + OFFLINE: it scores a
// CHECKED-IN model-output fixture (tests/golden/capture.golden.json) against the
// checked-in expected answers. It makes NO network calls and uses NO live data.
//
// Run it:   node scripts/eval-capture.ts
// Regenerate the corpus first if you edit it:  node scripts/build-golden.ts
//
// The SAME gate is asserted in CI by tests/golden/capture.eval.test.ts (so
// `npm test` fails the build on a regression); this runner is the human-facing
// scorecard. `.ts` extensions on the imports below let `node` (type-stripping)
// resolve the small pure graph without a bundler.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  evaluateGate,
  scoreCorpus,
  SHIP_THRESHOLD,
  type GoldenCorpus,
  type Scorecard,
} from '../src/assist/captureEval.ts'
import type { SeamWeights } from '../src/types'

// Equal weights — the product default; ranking agreement is measured under the
// same weighting the app ships with.
const WEIGHTS: SeamWeights = { volume: 1, ruleBound: 1, lowJudgement: 1, lowBlastRadius: 1 }

function loadCorpus(): GoldenCorpus {
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '..', 'tests', 'golden', 'capture.golden.json')
  return JSON.parse(readFileSync(path, 'utf8')) as GoldenCorpus
}

function pct(n: number): string {
  return (n * 100).toFixed(1).padStart(5) + '%'
}

function printScorecard(card: Scorecard): void {
  console.log('\nCapture Copilot — field-level eval scorecard (offline, deterministic)')
  console.log('='.repeat(72))
  console.log(`cases: ${card.cases.length}\n`)

  console.log('Per-case:')
  console.log(
    '  ' +
      'id'.padEnd(34) +
      'kind'.padEnd(12) +
      'pmF1'.padStart(7) +
      'candF1'.padStart(8) +
      'rank'.padStart(7) +
      'fabr'.padStart(7),
  )
  for (const c of card.cases) {
    console.log(
      '  ' +
        c.id.padEnd(34) +
        c.kind.padEnd(12) +
        pct(c.processMap.f1).padStart(7) +
        pct(c.candidateOverlap.prf.f1).padStart(8) +
        pct(c.ranking.agreement).padStart(7) +
        pct(c.fabrication.rate).padStart(7),
    )
  }

  console.log('\nAggregate (each metric SEPARATE — never blended):')
  console.log(
    `  ProcessMap        P=${pct(card.processMap.precision)}  R=${pct(card.processMap.recall)}  F1=${pct(card.processMap.f1)}`,
  )
  console.log(
    `  Candidate set     P=${pct(card.candidate.prf.precision)}  R=${pct(card.candidate.prf.recall)}  F1=${pct(card.candidate.prf.f1)}  meanJaccard=${pct(card.candidate.meanJaccard)}`,
  )
  console.log(`  Ranking agreement ${pct(card.rankingAgreement)}  (via the product's rankSeams)`)
  console.log(
    `  Fabricated spans  ${pct(card.fabricationRate.rate)}  (${card.fabricationRate.fabricated}/${card.fabricationRate.totalSpans})  [HARD SAFETY METRIC]`,
  )
}

function printThreshold(): void {
  console.log('\nShip threshold (declared):')
  console.log(`  ProcessMap F1        >= ${SHIP_THRESHOLD.processMapF1}`)
  console.log(`  Candidate F1         >= ${SHIP_THRESHOLD.candidateF1}`)
  console.log(`  Ranking agreement    >= ${SHIP_THRESHOLD.rankingAgreement}`)
  console.log(`  Fabricated-span rate <= ${SHIP_THRESHOLD.maxFabricationRate}  (any fabrication is a hard fail)`)
}

function main(): void {
  const corpus = loadCorpus()
  const card = scoreCorpus(corpus, WEIGHTS)
  printScorecard(card)
  printThreshold()

  const gate = evaluateGate(card, SHIP_THRESHOLD)
  console.log('\n' + '='.repeat(72))
  if (gate.pass) {
    console.log('RESULT: PASS — all metrics at or above threshold.')
    process.exit(0)
  }
  console.log('RESULT: FAIL — below ship threshold:')
  for (const f of gate.failures) console.log(`  - ${f}`)
  process.exit(1)
}

main()
