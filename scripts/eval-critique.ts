// #17 runner — prints the Scope Critic eval SCORECARD and exits non-zero when
// recall is below threshold OR the critic raised any false flag on the
// reference-good scope. PURE + OFFLINE: it scores CHECKED-IN critic findings
// (tests/golden/critiques/critique.golden.json) against the planted ground truth
// and the known-clean scope. It makes NO network calls and uses NO live data.
//
// Run it:   node scripts/eval-critique.ts
// Regenerate the corpus first if you edit it:  npx tsx scripts/build-critique-golden.ts
//
// The SAME gate is asserted in CI by tests/golden/critiques/critique.eval.test.ts.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  CRITIC_SHIP_THRESHOLD,
  evaluateGate,
  scoreCorpus,
  type CriticScorecard,
  type CritiqueCorpus,
} from '../src/assist/criticEval.ts'

function loadCorpus(): CritiqueCorpus {
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '..', 'tests', 'golden', 'critiques', 'critique.golden.json')
  return JSON.parse(readFileSync(path, 'utf8')) as CritiqueCorpus
}

function pct(n: number): string {
  return (n * 100).toFixed(1).padStart(6) + '%'
}

function printScorecard(card: CriticScorecard): void {
  console.log('\nScope Critic — planted-flaw eval scorecard (offline, deterministic)')
  console.log('='.repeat(72))
  console.log(`planted cases: ${card.perCase.length}\n`)

  console.log('Per-case recall (planted flaws caught):')
  console.log('  ' + 'id'.padEnd(30) + 'caught'.padStart(8) + 'planted'.padStart(9) + 'recall'.padStart(9))
  for (const c of card.perCase) {
    console.log(
      '  ' +
        c.id.padEnd(30) +
        String(c.recall.caught).padStart(8) +
        String(c.recall.planted).padStart(9) +
        pct(c.recall.recall).padStart(9),
    )
  }

  console.log('\nAggregate (each metric SEPARATE — never blended):')
  console.log(
    `  Recall      ${pct(card.recall.recall)}  (${card.recall.caught}/${card.recall.planted} planted flaws caught)`,
  )
  if (card.recall.missed.length) console.log(`    missed: ${card.recall.missed.join(', ')}`)
  console.log(
    `  Precision   ${pct(card.precision.precision)}  (${card.precision.falseFlags} false flag(s) on the reference-good scope) [FALSE-FLAG GUARD]`,
  )
}

function printThreshold(): void {
  console.log('\nShip threshold (declared):')
  console.log(`  Recall              >= ${CRITIC_SHIP_THRESHOLD.minRecall}`)
  console.log(`  Clean precision     >= ${CRITIC_SHIP_THRESHOLD.minCleanPrecision}  (any false flag on the good scope fails)`)
}

function main(): void {
  const corpus = loadCorpus()
  const card = scoreCorpus(corpus)
  printScorecard(card)
  printThreshold()

  const gate = evaluateGate(card)
  console.log('\n' + '='.repeat(72))
  if (gate.pass) {
    console.log('RESULT: PASS — recall at/above threshold and zero false flags on the clean scope.')
    process.exit(0)
  }
  console.log('RESULT: FAIL — below ship threshold:')
  for (const f of gate.failures) console.log(`  - ${f}`)
  process.exit(1)
}

main()
