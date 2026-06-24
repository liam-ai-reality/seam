import type { Scope } from '../types'

export interface StageProps {
  scope: Scope
  update: (fn: (s: Scope) => Scope) => void
}
