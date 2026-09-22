/**
 * LLM provider abstraction types.
 *
 * The generation layer uses these interfaces exclusively.
 * No provider SDK types leak beyond their implementation files.
 */

import type { RetrievedChunk } from "@/lib/types";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Everything the LLM needs to generate a grounded answer.
 *
 * Retrieved chunks are provided as structured evidence — the provider
 * implementation formats them into the prompt as labelled context blocks.
 * The system prompt is injected by the provider; callers do not construct it.
 */
export interface LLMInput {
  /** The user's original question. */
  readonly query: string;
  /** Chunks retrieved by Phase 2 — the grounding evidence. */
  readonly retrievedChunks: RetrievedChunk[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Which provider produced this result. */
export type ProviderName = "groq" | "gemini";

/**
 * The result returned by a successful LLM generation.
 */
export interface GenerationResult {
  /** The model's answer, grounded in the supplied context. */
  readonly answer: string;
  /** Which provider generated this answer. */
  readonly provider: ProviderName;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface that every LLM provider must satisfy.
 *
 * Deliberately small: one method, typed inputs, typed outputs.
 * The retrieval layer and API route depend only on this interface.
 */
export interface LLMProvider {
  readonly name: ProviderName;

  /**
   * Generate a grounded answer from the supplied evidence.
   *
   * The implementation must:
   *   - Build a grounded system prompt (see lib/prompts/system.ts)
   *   - Format retrieved chunks as labelled context
   *   - Send ONLY query + context to the model
   *   - Return the model's text response
   *
   * @throws {TransientProviderError} for retriable failures (rate limits,
   *   network errors, 5xx responses). The orchestrator uses this to trigger
   *   fallback.
   * @throws {Error} for non-retriable failures (bad API key, bad model name,
   *   malformed input). These surface as application errors.
   */
  generate(input: LLMInput): Promise<GenerationResult>;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown by provider implementations when a transient operational failure
 * occurs that justifies trying the fallback provider.
 *
 * Examples: HTTP 429, HTTP 5xx, network timeout.
 * NOT used for: missing API key, invalid model name, malformed request.
 */
export class TransientProviderError extends Error {
  readonly provider: ProviderName;
  readonly statusCode?: number;

  constructor(provider: ProviderName, message: string, statusCode?: number) {
    super(message);
    this.name = "TransientProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
  }
}
