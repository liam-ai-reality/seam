// The ONLY thing that enables the network. Defaults FALSE. v1 with this off
// behaves exactly as today and makes no network calls.

const FLAG_KEY = 'seam.assist'

interface AssistConfig {
  enabled?: unknown
  apiKey?: unknown
  transport?: unknown
}

/**
 * True only when the user has explicitly opted in AND a transport/key is
 * configured. Pure and synchronous: reads localStorage once, never throws,
 * never touches the network. Anything malformed → false.
 */
export function assistAvailable(): boolean {
  try {
    const raw = localStorage.getItem(FLAG_KEY)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const cfg = parsed as AssistConfig
    const optedIn = cfg.enabled === true
    const hasKey = typeof cfg.apiKey === 'string' && cfg.apiKey.length > 0
    const hasTransport = typeof cfg.transport === 'string' && cfg.transport.length > 0
    return optedIn && (hasKey || hasTransport)
  } catch {
    return false
  }
}
