// Applying an accepted assist value into a Scope.
//
// The key rule: do NOT create a parallel validator or a new write path. A
// model-proposed value must land in a Scope through the SAME coercers
// (storage.ts shapers) that loaded/imported scopes go through, and through the
// existing App reducer pattern `update((s: Scope) => Scope)`. So acceptSourced
// returns a reducer; the caller hands it to `update`, exactly like every other
// edit. The Sourced wrapper is unwrapped here; only its `value` is applied, and
// only through a shaper.

import { shapeCandidate, shapeEvalPlan, shapeIntegration, shapeProcessMap, axis } from '../storage'
import type { EvalPlan, Integration, Scope, SeamCandidate } from '../types'
import type { Sourced } from './types'

/** A Scope reducer — the shape App.tsx's `update` expects. */
export type ScopeReducer = (s: Scope) => Scope

/**
 * The set of accept targets. Each names a place in the Scope and routes the
 * accepted value through the matching existing coercer.
 *
 * - `processMap`            → whole ProcessMap via shapeProcessMap
 * - `seamCandidate`         → append a candidate via shapeCandidate
 * - `seamCandidateAxis`     → set one axis on one candidate via axis()
 * - `evalPlanText`          → set one free-text EvalPlan field via shapeEvalPlan
 */
export type AcceptTarget =
  | { field: 'processMap' }
  | { field: 'seamCandidate' }
  | {
      field: 'seamCandidateAxis'
      candidateId: string
      axis: 'volume' | 'ruleBound' | 'lowJudgement' | 'lowBlastRadius'
    }
  | {
      // A single free-text EvalPlan field the eval drafter (#18) proposes. The
      // accepted string is routed through the EXISTING shapeEvalPlan coercer
      // (with the current plan as the base, so only this field is overwritten) —
      // no new write path, no parallel validator. Restricted to the free-text
      // fields; grader is the deterministic recommendGrader's decision, never set
      // here.
      field: 'evalPlanText'
      key: 'offline' | 'online' | 'worstOutput' | 'detection' | 'costWeightedQuality' | 'baseline'
    }
  | {
      // A single integration free-text field the integration copilot (#19)
      // proposes: `notes` (gotchas) or `authType`. The accepted string is routed
      // through the EXISTING shapeIntegration coercer with the current row as the
      // base, so ONLY this field is overwritten — no new write path, no parallel
      // validator. `approach` is NEVER a key here: that decision stays
      // recommendApproach()'s, applied by the user in StageIntegration, never the
      // model's.
      field: 'integrationText'
      integrationId: string
      key: 'notes' | 'authType'
    }

/**
 * Build a reducer that applies an accepted Sourced value into a Scope through
 * the existing shapers. A null value (model declined) is a no-op reducer, so
 * callers can apply unconditionally.
 *
 * Usage in the app: `update(acceptSourced(target, sourced))`.
 */
export function acceptSourced<T>(target: AcceptTarget, sourced: Sourced<T>): ScopeReducer {
  const value = sourced.value
  if (value === null) return (s) => s

  switch (target.field) {
    case 'processMap':
      // Reuse the ProcessMap coercer with the current map as the fallback base,
      // so partial proposals only overwrite the fields they actually carry.
      return (s) => ({ ...s, processMap: shapeProcessMap(value, s.processMap) })

    case 'seamCandidate':
      return (s) => ({
        ...s,
        seamCandidates: [...s.seamCandidates, shapeCandidate(value, s.seamCandidates.length)],
      })

    case 'seamCandidateAxis': {
      const clamped = axis(value)
      return (s) => ({
        ...s,
        seamCandidates: s.seamCandidates.map((c): SeamCandidate =>
          c.id === target.candidateId ? { ...c, [target.axis]: clamped } : c,
        ),
      })
    }

    case 'evalPlanText': {
      // Coerce the accepted string to text and route the single-field patch
      // through the existing shapeEvalPlan, basing on the current plan so the
      // other fields are preserved. Same shaper that loads/imports a Scope.
      const text = typeof value === 'string' ? value : String(value)
      const patch: Partial<EvalPlan> = { [target.key]: text }
      return (s) => ({ ...s, evalPlan: shapeEvalPlan(patch, s.evalPlan) })
    }

    case 'integrationText': {
      // Coerce the accepted string and route a single-field patch through the
      // existing shapeIntegration, basing on the current row so every other field
      // (crucially `approach`) is preserved untouched. Same shaper that loads /
      // imports a Scope. A null/absent row is a no-op.
      const text = typeof value === 'string' ? value : String(value)
      return (s) => ({
        ...s,
        integrations: s.integrations.map((i, idx): Integration =>
          i.id === target.integrationId
            ? shapeIntegration({ ...i, [target.key]: text }, idx)
            : i,
        ),
      })
    }
  }
}

// Compile-time proof the integration accept target can only touch free text, not
// the approach decision. If a future edit widens the key union to include
// 'approach' this resolves to `never` and the assignment fails to build.
type _IntegrationKey = Extract<AcceptTarget, { field: 'integrationText' }>['key']
type _IntegrationTextOmitsApproach = 'approach' extends _IntegrationKey ? never : true
export const INTEGRATION_ACCEPT_OMITS_APPROACH: _IntegrationTextOmitsApproach = true
