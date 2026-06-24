// The single, optional, offline-safe AI surface. These types describe a
// value extracted by the model together with where it came from in the source
// text, so the UI can verify and a human can accept it.

/** Coarse, 3-bucket confidence. Never expose a raw decimal. */
export type Confidence = 'high' | 'medium' | 'low'

/** A literal span of the source the model quoted to justify a value. */
export interface SourceSpan {
  quote: string
  charStart: number
  charEnd: number
}

/**
 * A model-proposed value with provenance. `status` is always 'draft' — nothing
 * the model produces is committed until a human accepts it (see accept.ts).
 */
export interface Sourced<T> {
  value: T | null
  confidence: Confidence
  sourceSpans: SourceSpan[]
  status: 'draft'
}

// ---------- transport ----------

export type AssistModel = 'claude-sonnet-4-6' | 'claude-opus-4-8'

export interface AssistMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A single tool the model is forced to call to return structured output. */
export interface AssistTool {
  name: string
  description: string
  /** JSON Schema for the tool's input — the caller's desired output shape. */
  input_schema: Record<string, unknown>
}

export type ToolChoice = { type: 'tool'; name: string }

/** A provider-agnostic request. Transports map this onto a concrete API. */
export interface AssistRequest {
  model: AssistModel
  system?: string
  messages: AssistMessage[]
  tools: AssistTool[]
  tool_choice: ToolChoice
  maxTokens?: number
}

export interface AssistUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * The response carries the forced tool-call's arguments (the structured
 * result), the raw assistant text (if any), and usage.
 */
export interface AssistResponse {
  /** Arguments of the forced tool_use block — the structured output. */
  toolInput: Record<string, unknown> | null
  /** Raw assistant text, if the model emitted any alongside the tool call. */
  rawText: string
  usage: AssistUsage
}

/**
 * The seam between the app and the network. mockTransport (tests) and
 * byoKeyTransport (real fetch) both implement this; a proxyTransport can drop
 * in later. client.ts depends only on this interface.
 */
export interface AssistTransport {
  complete(req: AssistRequest): Promise<AssistResponse>
}
