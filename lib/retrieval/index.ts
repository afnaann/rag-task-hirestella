/**
 * Retrieval module — the core of the RAG pipeline.
 *
 * This module answers: "What evidence do we have for this query?"
 * It does NOT answer: "How should that evidence be expressed to the user?"
 * That is the LLM's job (Phase 3).
 *
 * The separation is intentional and important:
 *   - Retrieval can be tested without an LLM
 *   - Retrieval failures can be distinguished from LLM failures
 *   - The evidence gate prevents hallucination before any LLM is called
 *
 * Pipeline:
 *   query → embed → cosine similarity vs. all chunks → sort → gate → result
 *
 * No LLM is called here. No document-specific logic here.
 * No hardcoded forbidden questions. No keyword matching.
 * Grounded refusal emerges from evidence quality alone.
 */

import { createEmbeddingProvider } from "@/lib/embeddings/gemini";
import { readVectorStore } from "@/lib/retrieval/store";
import { cosineSimilarity } from "@/lib/retrieval/similarity";
import { RETRIEVAL_TOP_K, RETRIEVAL_MIN_SCORE } from "@/lib/config";
import type {
  RetrievalResult,
  RetrievedChunk,
  RetrievalDiagnostics,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Retrieval options
// ---------------------------------------------------------------------------

export interface RetrievalOptions {
  /**
   * Maximum number of chunks to return.
   * Defaults to RETRIEVAL_TOP_K from config.
   */
  topK?: number;

  /**
   * Minimum cosine similarity score for a chunk to count as evidence.
   * Chunks below this threshold are excluded from the result.
   * Defaults to RETRIEVAL_MIN_SCORE from config.
   *
   * See lib/config.ts for calibration notes.
   */
  minScore?: number;
}

// ---------------------------------------------------------------------------
// Vector store cache
// ---------------------------------------------------------------------------

/**
 * The vector store is loaded once and cached in memory for the lifetime of
 * the process. For a script, this means once per run. For the API route
 * (Phase 3), this means once per server instance (warm requests are free).
 *
 * Invalidated by re-running `npm run ingest`, which rebuilds the JSON file.
 */
let _cachedStore: ReturnType<typeof readVectorStore> | null = null;

function getStore() {
  if (!_cachedStore) {
    _cachedStore = readVectorStore();
  }
  return _cachedStore;
}

/**
 * Clears the in-memory vector store cache.
 * Useful in tests where the store may be rebuilt between runs.
 */
export function clearStoreCache(): void {
  _cachedStore = null;
}

// ---------------------------------------------------------------------------
// Main retrieve function
// ---------------------------------------------------------------------------

/**
 * Retrieves the most relevant chunks from the vector store for a given query.
 *
 * Steps:
 *   1. Validate the query
 *   2. Embed the query using the configured embedding provider
 *   3. Validate that the query embedding dimensions match the stored embeddings
 *   4. Score every chunk with cosine similarity
 *   5. Sort candidates by score descending
 *   6. Apply evidence gate: filter by minScore threshold
 *   7. Return topK qualifying chunks plus diagnostics
 *
 * @param query - The user's question (plain text)
 * @param options - Optional overrides for topK and minScore
 * @returns RetrievalResult with evidence flag, matching chunks, and diagnostics
 *
 * @throws If GOOGLE_API_KEY is missing, the embedding API fails,
 *         the vector store is missing/corrupt, or dimensions mismatch.
 */
export async function retrieve(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const topK = options.topK ?? RETRIEVAL_TOP_K;
  const minScore = options.minScore ?? RETRIEVAL_MIN_SCORE;

  // ------------------------------------------------------------------
  // 1. Validate query
  // ------------------------------------------------------------------
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    throw new Error("Query must not be empty.");
  }

  // ------------------------------------------------------------------
  // 2. Embed the query
  // ------------------------------------------------------------------
  const embeddingProvider = createEmbeddingProvider();
  const queryEmbedding = await embeddingProvider.embed(trimmedQuery);

  // ------------------------------------------------------------------
  // 3. Load vector store and validate dimension compatibility
  // ------------------------------------------------------------------
  const store = getStore();

  if (store.chunks.length === 0) {
    // Edge case: store exists but has no chunks
    const diagnostics: RetrievalDiagnostics = {
      candidateCount: 0,
      returnedCount: 0,
      maxScore: null,
      secondScore: null,
      thresholdUsed: minScore,
      topK,
      queryEmbeddingDimension: queryEmbedding.length,
    };
    return {
      query: trimmedQuery,
      hasEvidence: false,
      retrieved: [],
      diagnostics,
    };
  }

  // Dimension mismatch check — catches stale stores after model changes
  const storeDimensions = store.dimensions;
  if (queryEmbedding.length !== storeDimensions) {
    throw new Error(
      `Embedding dimension mismatch: query embedding has ${queryEmbedding.length} dimensions ` +
      `but the vector store expects ${storeDimensions}. ` +
      `The query may have been embedded with a different model than the stored chunks. ` +
      `Re-run "npm run ingest" to rebuild the vector store.`
    );
  }

  // ------------------------------------------------------------------
  // 4. Score every chunk with cosine similarity
  // ------------------------------------------------------------------
  type ScoredChunk = RetrievedChunk;

  const scored: ScoredChunk[] = store.chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    heading: chunk.heading,
    content: chunk.content,
    // Note: embedding is intentionally excluded from the scored chunk —
    // it is only needed for the similarity computation, not downstream.
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  // ------------------------------------------------------------------
  // 5. Sort by score descending
  // ------------------------------------------------------------------
  scored.sort((a, b) => b.score - a.score);

  // ------------------------------------------------------------------
  // 6. Build diagnostics from the full sorted list
  //    (before threshold filtering — we want the raw distribution)
  // ------------------------------------------------------------------
  const maxScore = scored[0]?.score ?? null;
  const secondScore = scored[1]?.score ?? null;

  // ------------------------------------------------------------------
  // 7. Apply evidence gate
  // ------------------------------------------------------------------
  const qualifying = scored.filter((c) => c.score >= minScore);
  const retrieved = qualifying.slice(0, topK);

  const diagnostics: RetrievalDiagnostics = {
    candidateCount: scored.length,
    returnedCount: retrieved.length,
    maxScore,
    secondScore,
    thresholdUsed: minScore,
    topK,
    queryEmbeddingDimension: queryEmbedding.length,
  };

  return {
    query: trimmedQuery,
    hasEvidence: retrieved.length > 0,
    retrieved,
    diagnostics,
  };
}
