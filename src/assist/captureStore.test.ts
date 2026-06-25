import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginCapture,
  confirmRedaction,
  defaultChoice,
} from './capture'
import {
  buildProvenance,
  clearDraft,
  loadDraft,
  saveDraft,
  type PersistedDraft,
} from './captureStore'

// An in-memory localStorage so we can assert exactly what bytes are written.
let store: Record<string, string>
beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  } as unknown as Storage)
})
afterEach(() => vi.unstubAllGlobals())

const PASTE = 'Email jane.doe@acme.co about policy AB-99812.'

describe('captureStore — redacted source is what is persisted (#14 AC4)', () => {
  it('persisted bytes never contain the raw PII for a redacted send', () => {
    const draft = beginCapture(PASTE)
    const pass = confirmRedaction(draft, defaultChoice(draft))
    const persistable: PersistedDraft = {
      v: 1,
      text: pass.outgoing,
      provenance: buildProvenance('redacted', pass.redactions, null, '2026-06-25T00:00:00.000Z'),
    }
    expect(saveDraft(persistable).ok).toBe(true)
    // Inspect the RAW localStorage bytes — no un-redacted text leaked.
    const rawBytes = store['seam.draft.v1'] ?? ''
    expect(rawBytes).not.toContain('jane.doe@acme.co')
    expect(rawBytes).not.toContain('AB-99812')
    expect(rawBytes).toContain('REDACTED')
  })

  it('round-trips a redacted draft through load', () => {
    const draft = beginCapture(PASTE)
    const pass = confirmRedaction(draft, defaultChoice(draft))
    saveDraft({
      v: 1,
      text: pass.outgoing,
      provenance: buildProvenance('redacted', pass.redactions, null, '2026-06-25T00:00:00.000Z'),
    })
    const loaded = loadDraft()
    expect(loaded?.text).toBe(pass.outgoing)
    expect(loaded?.provenance.mode).toBe('redacted')
    expect(loaded?.provenance.redactedCounts.email).toBe(1)
  })
})

describe('captureStore — send-raw persists the timestamped record (#14 AC3)', () => {
  it('only the raw path lets un-redacted text into storage, with a recorded choice', () => {
    const draft = beginCapture(PASTE)
    const fixed = new Date('2026-06-25T09:30:00.000Z')
    const pass = confirmRedaction(draft, { decisions: {}, sendRaw: true }, () => fixed)
    saveDraft({
      v: 1,
      text: pass.outgoing,
      provenance: buildProvenance('raw', pass.redactions, pass.sendRawRecord, pass.sendRawRecord!.at),
    })
    const loaded = loadDraft()
    expect(loaded?.text).toContain('jane.doe@acme.co') // raw, by explicit choice
    expect(loaded?.provenance.mode).toBe('raw')
    expect(loaded?.provenance.sendRaw?.choice).toBe('send-raw')
    expect(loaded?.provenance.sendRaw?.at).toBe('2026-06-25T09:30:00.000Z')
  })
})

describe('captureStore — migration-safe load (#14 / Phase 1)', () => {
  it('returns null for absent/corrupt drafts', () => {
    expect(loadDraft()).toBeNull()
    store['seam.draft.v1'] = 'not json'
    expect(loadDraft()).toBeNull()
    store['seam.draft.v1'] = JSON.stringify({ nope: true })
    expect(loadDraft()).toBeNull()
  })

  it('clears a draft', () => {
    saveDraft({ v: 1, text: 'x', provenance: buildProvenance('redacted', [], null, 'now') })
    expect(loadDraft()).not.toBeNull()
    clearDraft()
    expect(loadDraft()).toBeNull()
  })
})
