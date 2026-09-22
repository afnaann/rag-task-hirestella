/**
 * Groq LLM provider — primary generation backend.
 *
 * Model: openai/gpt-oss-120b (production on Groq, 131K context window)
 * SDK:   groq-sdk (official)
 *
 * IMPORTANT: Tools are intentionally NOT enabled.
 * GPT-OSS supports tool use, but this application must remain a closed-world
 * document QA system. No web search, no code execution, no external APIs.
 *
 * Key constraints:
 *   - API key from GROQ_API_KEY env var only (server-side)
 *   - No tools, no function calling
 *   - Single-turn grounded generation
 *   - TransientProviderError on 429/5xx/timeout → triggers fallback
 *   - Hard error on 401/400/bad config → surfaces as application error
 */

import Groq from "groq-sdk";
import { GROQ_MODEL, LLM_FORCE_PRIMARY_FAILURE } from "@/lib/config";
import { SYSTEM_INSTRUCTION, buildUserMessage, sanitizeAnswer } from "@/lib/prompts/system";
import { TransientProviderError } from "./types";
import type { LLMProvider, LLMInput, GenerationResult } from "./types";

/** Maximum tokens to generate. Keeps responses concise and within quota. */
const MAX_TOKENS = 1024;

/** Request timeout in milliseconds. Groq is fast; 30s is generous. */
const REQUEST_TIMEOUT_MS = 30_000;

export class GroqProvider implements LLMProvider {
  readonly name = "groq" as const;

  private readonly client: Groq;
  private readonly model: string;

  constructor() {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Missing GROQ_API_KEY environment variable.\n" +
          "Add it to .env.local: GROQ_API_KEY=gsk_...\n" +
          "Get a free key at: https://console.groq.com"
      );
    }
    this.client = new Groq({ apiKey });
    this.model = GROQ_MODEL;
  }

  async generate(input: LLMInput): Promise<GenerationResult> {
    // Development-only: simulate transient failure to test fallback path.
    // This branch is controlled by an env var, not by client input.
    if (LLM_FORCE_PRIMARY_FAILURE) {
      console.warn(
        "[GroqProvider] LLM_FORCE_PRIMARY_FAILURE=true — simulating transient failure"
      );
      throw new TransientProviderError(
        "groq",
        "Simulated transient failure (LLM_FORCE_PRIMARY_FAILURE=true)",
        429
      );
    }

    const userMessage = buildUserMessage(input.query, input.retrievedChunks);

    let response: Groq.Chat.ChatCompletion;
    try {
      response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: userMessage },
          ],
          max_tokens: MAX_TOKENS,
          temperature: 0.1, // Low temperature: factual, not creative
          // tools: intentionally omitted — no tool use in this application
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );
    } catch (err) {
      // Classify the error: transient (retriable) vs. non-retriable
      throw classifyGroqError(err);
    }

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      // Empty response from a working API is unexpected but non-retriable
      throw new Error(
        `Groq returned an empty response for model "${this.model}".`
      );
    }

    return { answer: sanitizeAnswer(answer), provider: "groq" };
  }
}

/**
 * Converts a Groq SDK error into either a TransientProviderError
 * (for retriable failures) or a plain Error (for non-retriable ones).
 *
 * TransientProviderError triggers fallback to Gemini.
 * Plain Error surfaces as an application/configuration failure.
 */
function classifyGroqError(err: unknown): Error {
  // groq-sdk throws Groq.APIError for HTTP-level errors
  if (err instanceof Groq.APIError) {
    const status = err.status;

    // 429 rate limit — transient, fallback
    if (status === 429) {
      return new TransientProviderError("groq", `Groq rate limited (429): ${err.message}`, 429);
    }

    // 5xx server errors — transient, fallback
    if (status >= 500) {
      return new TransientProviderError("groq", `Groq server error (${status}): ${err.message}`, status);
    }

    // 401 auth, 400 bad request, 404 unknown model — non-retriable
    // These indicate a configuration problem, not a transient failure
    return new Error(`Groq API error (${status}): ${err.message}`);
  }

  // Network-level errors (ECONNRESET, ETIMEDOUT, etc.) — transient, fallback
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("network")
    ) {
      return new TransientProviderError("groq", `Groq network error: ${err.message}`);
    }
    return err;
  }

  return new Error(`Unknown Groq error: ${String(err)}`);
}
