// Applying an accepted assist value into a Scope.
//
// The key rule: do NOT create a parallel validator or a new write path. A
// model-proposed value must land in a Scope through the SAME coercers
// (storage.ts shapers) that loaded/imported scopes go through, and through the
// existing App reducer pattern `update((s: Scope) => Scope)`. So acceptSourced
// returns a reducer; the caller hands it to `update`, exactly like every other
// edit. The Sourced wrapper is unwrapped here; only its `value` is applied, and
// only through a shaper.

import { shapeCandidate, shapeProcessMap, axis } from '../storage'
import type { Scope, SeamCandidate } from '../types'
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
 */
export type AcceptTarget =
  | { field: 'processMap' }
  | { field: 'seamCandidate' }
  | {
      field: 'seamCandidateAxis'
      candidateId: string
      axis: 'volume' | 'ruleBound' | 'lowJudgement' | 'lowBlastRadius'
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
  }
}
