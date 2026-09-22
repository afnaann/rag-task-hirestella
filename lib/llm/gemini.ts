/**
 * Gemini LLM provider — fallback generation backend.
 *
 * Model: gemini-2.5-flash (current stable Flash model, @google/genai SDK)
 * SDK:   @google/genai (same SDK already used for embeddings in Phase 1)
 *
 * This provider is ONLY called when Groq fails with a transient error.
 * It is not the primary generation path.
 *
 * IMPORTANT: No grounding tools, no web search, no Google Search grounding.
 * The model receives ONLY the retrieved context and the user question.
 * This application is a closed-world document QA system.
 *
 * Key constraints:
 *   - API key from GOOGLE_API_KEY env var only (server-side)
 *   - No tools, no Google Search grounding, no URL context
 *   - Single-turn grounded generation
 *   - TransientProviderError on 429/5xx → informs caller both providers failed
 */

import { GoogleGenAI } from "@google/genai";
import { GEMINI_LLM_MODEL } from "@/lib/config";
import { SYSTEM_INSTRUCTION, buildUserMessage, sanitizeAnswer } from "@/lib/prompts/system";
import { TransientProviderError } from "./types";
import type { LLMProvider, LLMInput, GenerationResult } from "./types";

/** Maximum output tokens. Matches the Groq provider budget. */
const MAX_OUTPUT_TOKENS = 1024;

export class GeminiGenerationProvider implements LLMProvider {
  readonly name = "gemini" as const;

  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env["GOOGLE_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Missing GOOGLE_API_KEY environment variable.\n" +
          "Add it to .env.local: GOOGLE_API_KEY=AIza...\n" +
          "Get a free key at: https://aistudio.google.com/apikey"
      );
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = GEMINI_LLM_MODEL;
  }

  async generate(input: LLMInput): Promise<GenerationResult> {
    const userMessage = buildUserMessage(input.query, input.retrievedChunks);

    // Combine system instruction with user message for Gemini
    // (Gemini's generateContent accepts a system instruction separately)
    let responseText: string;
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: userMessage,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.1, // Low temperature: factual, not creative
          // No tools, no grounding, no search — intentional
        },
      });

      responseText = response.text?.trim() ?? "";
    } catch (err) {
      throw classifyGeminiError(err);
    }

    if (!responseText) {
      throw new Error(
        `Gemini returned an empty response for model "${this.model}".`
      );
    }

    return { answer: sanitizeAnswer(responseText), provider: "gemini" };
  }
}

/**
 * Converts a @google/genai error into either a TransientProviderError
 * (for retriable failures) or a plain Error (for non-retriable ones).
 */
function classifyGeminiError(err: unknown): Error {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // 429 / quota errors — transient
    if (msg.includes("429") || msg.includes("quota") || msg.includes("rate")) {
      return new TransientProviderError("gemini", `Gemini rate limited: ${err.message}`, 429);
    }

    // 5xx / server errors — transient
    if (msg.includes("500") || msg.includes("503") || msg.includes("server error")) {
      return new TransientProviderError("gemini", `Gemini server error: ${err.message}`, 500);
    }

    // Network errors — transient
    if (
      msg.includes("timeout") ||
      msg.includes("network") ||
      msg.includes("econnreset")
    ) {
      return new TransientProviderError("gemini", `Gemini network error: ${err.message}`);
    }

    // Auth / bad request — non-retriable
    return err;
  }

  return new Error(`Unknown Gemini generation error: ${String(err)}`);
}
