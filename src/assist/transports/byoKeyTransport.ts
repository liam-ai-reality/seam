// Bring-your-own-key transport: a direct browser fetch to the Anthropic
// Messages API. Dev / internal only — it ships the key to the browser. The
// AssistTransport interface is the seam, so a server-side proxyTransport can
// drop in later without touching client.ts or callers.
//
// This is the ONLY file in the module that touches the network.

import { assistAvailable } from '../gate'
import type { AssistRequest, AssistResponse, AssistTransport } from '../types'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 4096

// --- Anthropic Messages API response shapes (only the bits we read) ---
interface ToolUseBlock {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}
interface TextBlock {
  type: 'text'
  text: string
}
type ContentBlock = ToolUseBlock | TextBlock | { type: string }

interface MessagesResponse {
  content?: ContentBlock[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export interface ByoKeyOptions {
  apiKey: string
  /** Override the endpoint (e.g. a local mock); defaults to the real API. */
  endpoint?: string
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Construct a transport that POSTs to the Anthropic Messages API with a
 * bring-your-own key. Gated: each call re-checks assistAvailable() so a
 * disabled surface can never reach the network even if a transport leaks.
 */
export function byoKeyTransport(opts: ByoKeyOptions): AssistTransport {
  const endpoint = opts.endpoint ?? ENDPOINT
  const doFetch = opts.fetchImpl ?? globalThis.fetch

  return {
    async complete(req: AssistRequest): Promise<AssistResponse> {
      if (!assistAvailable()) {
        throw new Error('assist disabled: byoKeyTransport refused to call the network')
      }

      const body = {
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        tool_choice: req.tool_choice,
      }

      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // Required for direct browser-to-API calls. Dev/internal only.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`assist transport error ${res.status}: ${detail.slice(0, 500)}`)
      }

      const json = (await res.json()) as MessagesResponse
      const blocks = json.content ?? []
      const toolBlock = blocks.find((b): b is ToolUseBlock => b.type === 'tool_use')
      const rawText = blocks
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      return {
        toolInput: toolBlock ? toolBlock.input : null,
        rawText,
        usage: {
          inputTokens: json.usage?.input_tokens ?? 0,
          outputTokens: json.usage?.output_tokens ?? 0,
        },
      }
    },
  }
}
