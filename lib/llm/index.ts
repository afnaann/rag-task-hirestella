/**
 * LLM orchestration layer.
 *
 * Implements the provider fallback chain:
 *   Primary:  Groq (openai/gpt-oss-120b)
 *   Fallback: Gemini (gemini-2.5-flash)
 *
 * Fallback is triggered ONLY for transient operational failures
 * (TransientProviderError: 429, 5xx, network errors).
 *
 * Fallback is NOT triggered for configuration errors (missing API key,
 * invalid model, 401 auth failure). Those surface immediately as errors
 * so the problem is visible and correctable.
 *
 * The API route calls generate() from this module, not individual providers.
 */

import { GroqProvider } from "./groq";
import { GeminiGenerationProvider } from "./gemini";
import { TransientProviderError } from "./types";
import type { LLMInput, GenerationResult } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The result of an orchestrated generation attempt, including which provider
 * was ultimately used and whether fallback occurred.
 */
export interface OrchestrationResult extends GenerationResult {
  /** Whether the primary provider failed and fallback was used. */
  readonly usedFallback: boolean;
}

/**
 * Generate a grounded answer using the provider fallback chain.
 *
 * Flow:
 *   1. Try Groq
 *   2. If TransientProviderError → log → try Gemini
 *   3. If both fail → throw so the API route returns 503
 *
 * @throws {Error} If both providers fail (caller should return 503)
 */
export async function generate(
  input: LLMInput
): Promise<OrchestrationResult> {
  const groq = new GroqProvider();

  // ------------------------------------------------------------------
  // Attempt 1: Primary (Groq)
  // ------------------------------------------------------------------
  try {
    const result = await groq.generate(input);
    return { ...result, usedFallback: false };
  } catch (err) {
    if (err instanceof TransientProviderError) {
      // Log enough information to diagnose the failure without leaking secrets
      console.warn(
        `[LLM] Primary provider (groq) transient failure: ${err.message}` +
          (err.statusCode ? ` [HTTP ${err.statusCode}]` : "")
      );
      console.info("[LLM] Attempting fallback provider (gemini)...");
    } else {
      // Non-retriable error from primary — surface immediately
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Attempt 2: Fallback (Gemini)
  // ------------------------------------------------------------------
  const gemini = new GeminiGenerationProvider();
  try {
    const result = await gemini.generate(input);
    console.info(`[LLM] Fallback provider (gemini) succeeded.`);
    return { ...result, usedFallback: true };
  } catch (err) {
    if (err instanceof TransientProviderError) {
      console.error(
        `[LLM] Fallback provider (gemini) also failed: ${err.message}`
      );
    } else {
      console.error(
        `[LLM] Fallback provider (gemini) error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    // Both providers failed — throw a clean error for the API route to catch
    throw new Error(
      "Both LLM providers are currently unavailable. Please try again later."
    );
  }
}
