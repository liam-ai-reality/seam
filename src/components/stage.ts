import type { StageKey } from '../constants'
import type { Scope } from '../types'

export interface StageProps {
  scope: Scope
  update: (fn: (s: Scope) => Scope) => void
}

/** StageReady also navigates to other stages from its readiness gate. */
export interface StageReadyProps extends StageProps {
  setStage: (k: StageKey) => void
}
