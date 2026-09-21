/**
 * Gemini embedding provider.
 *
 * Implements EmbeddingProvider using Google's gemini-embedding-2 model
 * via the @google/genai SDK (the current, non-deprecated SDK as of 2026).
 *
 * Model details:
 *   - gemini-embedding-2: GA since April 2026
 *   - Supports 128–3072 output dimensions (Matryoshka Representation Learning)
 *   - Input limit: 8,192 tokens
 *   - Docs: https://ai.google.dev/gemini-api/docs/models
 *
 * API key is read from GOOGLE_API_KEY environment variable.
 * This file must only be imported in server-side code (scripts, API routes).
 */

import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "@/lib/config.js";
import type { EmbeddingProvider } from "./types.js";

/**
 * How many texts to embed in a single API call.
 *
 * The Gemini embedding API accepts individual embedContent calls.
 * We send them concurrently in batches to balance throughput and
 * avoid hitting per-minute rate limits on the free tier.
 */
const BATCH_CONCURRENCY = 5;

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string = EMBEDDING_MODEL;
  readonly dimensions: number = EMBEDDING_DIMENSIONS;

  private readonly client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing GOOGLE_API_KEY environment variable.\n" +
          "Create a .env.local file with:\n" +
          "  GOOGLE_API_KEY=your_key_here\n" +
          "Get a key at: https://aistudio.google.com/apikey"
      );
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Embeds a single text string.
   */
  async embed(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: this.modelId,
      contents: text,
      config: {
        outputDimensionality: this.dimensions,
      },
    });

    // The @google/genai SDK returns `embeddings` (plural array) not `embedding`
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error(
        `Gemini embedding API returned an empty vector for text: "${text.slice(0, 80)}..."`
      );
    }

    // Validate that the returned dimensions match configuration
    if (values.length !== this.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimensions}, got ${values.length}. ` +
          `Check EMBEDDING_DIMENSIONS in lib/config.ts.`
      );
    }

    return values;
  }

  /**
   * Embeds multiple texts using concurrent batches to maximise throughput
   * while staying within free-tier rate limits.
   *
   * Results are returned in the same order as the input texts.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);

    // Process in chunks of BATCH_CONCURRENCY
    for (let i = 0; i < texts.length; i += BATCH_CONCURRENCY) {
      const batch = texts.slice(i, i + BATCH_CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map((text) => this.embed(text))
      );

      for (let j = 0; j < batchResults.length; j++) {
        results[i + j] = batchResults[j];
      }

      // Brief pause between batches to be polite to the free-tier rate limit
      if (i + BATCH_CONCURRENCY < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return results;
  }
}

/**
 * Factory: creates and returns the configured embedding provider.
 *
 * This is the single place where the concrete provider is chosen.
 * Retrieval and ingestion code call this, not the class directly,
 * making future provider changes a one-line swap here.
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  return new GeminiEmbeddingProvider();
}
