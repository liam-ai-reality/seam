import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAssistSettings, writeAssistSettings, clearAssistSettings } from './AssistSettings'
import { assistAvailable } from '../assist/gate'

function memLocalStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

beforeEach(() => vi.stubGlobal('localStorage', memLocalStorage()))
afterEach(() => vi.unstubAllGlobals())

describe('assist settings <-> gate contract', () => {
  it('enabled + key makes assistAvailable() true and round-trips', () => {
    writeAssistSettings({ enabled: true, apiKey: 'sk-ant-test' })
    expect(readAssistSettings()).toEqual({ enabled: true, apiKey: 'sk-ant-test' })
    expect(assistAvailable()).toBe(true)
  })

  it('enabled but no key does NOT enable assist', () => {
    writeAssistSettings({ enabled: true, apiKey: '' })
    expect(assistAvailable()).toBe(false)
  })

  it('key present but not enabled does NOT enable assist', () => {
    writeAssistSettings({ enabled: false, apiKey: 'sk-ant-test' })
    expect(assistAvailable()).toBe(false)
  })

  it('clear removes the key and disables assist', () => {
    writeAssistSettings({ enabled: true, apiKey: 'sk-ant-test' })
    clearAssistSettings()
    expect(readAssistSettings()).toEqual({ enabled: false, apiKey: '' })
    expect(assistAvailable()).toBe(false)
  })

  it('malformed config reads as disabled defaults', () => {
    localStorage.setItem('seam.assist', '{not json')
    expect(readAssistSettings()).toEqual({ enabled: false, apiKey: '' })
    expect(assistAvailable()).toBe(false)
  })
})
