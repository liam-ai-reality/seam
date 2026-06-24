// The entry point for every assist call. Guards on the gate, forces structured
// output via a single forced tool, and delegates the actual call to an injected
// transport. client.ts itself NEVER fetches.

import { assistAvailable } from './gate.ts'
import type {
  AssistMessage,
  AssistModel,
  AssistResponse,
  AssistTransport,
} from './types'

export const DEFAULT_MODEL: AssistModel = 'claude-sonnet-4-6'

const TOOL_NAME = 'emit_structured_output'

export interface RunAssistRequest {
  system?: string
  messages: AssistMessage[]
  /** JSON Schema for the structured result the caller wants. */
  schema: Record<string, unknown>
  /** Per-call override; defaults to DEFAULT_MODEL. */
  model?: AssistModel
  maxTokens?: number
}

/**
 * Run a single assist call.
 *
 * - Throws a clear 'assist disabled' error when the gate is off (defence in
 *   depth — the transport must also be gated, but we refuse before delegating).
 * - Forces STRUCTURED OUTPUT: wraps the caller's JSON schema in one tool and
 *   forces the model to call it (tool_choice). The result is that tool's input.
 * - Delegates the network to `transport`; does not fetch.
 */
export async function runAssist(
  req: RunAssistRequest,
  transport: AssistTransport,
): Promise<AssistResponse> {
  if (!assistAvailable()) {
    throw new Error('assist disabled: enable it in settings (seam.assist) before calling runAssist')
  }
  return transport.complete({
    model: req.model ?? DEFAULT_MODEL,
    system: req.system,
    messages: req.messages,
    tools: [
      {
        name: TOOL_NAME,
        description: 'Return the structured result. You MUST call this tool.',
        input_schema: req.schema,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    maxTokens: req.maxTokens,
  })
}
