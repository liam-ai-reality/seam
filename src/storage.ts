import { newPillars } from './constants'
import type { Scope } from './types'

const KEY = 'seam.scopes.v1'

export function loadScopes(): Scope[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(migrate) : []
  } catch {
    return []
  }
}

export function saveScopes(scopes: Scope[]): void {
  localStorage.setItem(KEY, JSON.stringify(scopes))
}

/** Tolerate scopes written by older/partial shapes (e.g. imported JSON). */
function migrate(s: Scope): Scope {
  return {
    ...s,
    seamCandidates: s.seamCandidates ?? [],
    integrations: s.integrations ?? [],
    pillars: s.pillars?.length === 4 ? s.pillars : newPillars(),
  }
}

export function exportScope(scope: Scope): void {
  const blob = new Blob([JSON.stringify(scope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(scope.name)}.seam.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Parse + validate an imported scope. Throws on garbage. */
export function parseImportedScope(text: string): Scope {
  const obj = JSON.parse(text)
  if (!obj || typeof obj !== 'object' || typeof obj.name !== 'string' || !obj.processMap) {
    throw new Error('Not a Seam scope file')
  }
  return migrate(obj as Scope)
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scope'
