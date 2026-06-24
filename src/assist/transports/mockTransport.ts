// Canned transport for tests. No network. Returns scripted responses keyed by
// call order, or a single fixed response.

import type { AssistRequest, AssistResponse, AssistTransport } from '../types'

const EMPTY_RESPONSE: AssistResponse = {
  toolInput: null,
  rawText: '',
  usage: { inputTokens: 0, outputTokens: 0 },
}

/**
 * Build a mock transport from one or more canned responses. With multiple
 * responses they are returned in order (the last is repeated once exhausted).
 * Records every request it received for assertions.
 */
export function mockTransport(
  responses: AssistResponse | AssistResponse[],
): AssistTransport & { calls: AssistRequest[] } {
  const queue = Array.isArray(responses) ? responses : [responses]
  const calls: AssistRequest[] = []
  let i = 0
  return {
    calls,
    complete(req: AssistRequest): Promise<AssistResponse> {
      calls.push(req)
      const idx = Math.min(i, queue.length - 1)
      i += 1
      return Promise.resolve(queue[idx] ?? EMPTY_RESPONSE)
    },
  }
}
