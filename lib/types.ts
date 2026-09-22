/**
 * Core data types for the document-agnostic RAG pipeline.
 *
 * These types represent generic document concepts only.
 * Nothing here should reference specific people, files, or domains.
 */

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * A raw document loaded from the documents directory.
 */
export interface Document {
  /** Derived deterministically from the filename (e.g. "project-wiral-ai" from "project-wiral-ai.md"). */
  readonly id: string;
  /** Original filename including extension (e.g. "project-wiral-ai.md"). */
  readonly name: string;
  /** Full raw text content of the file. */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Chunk
// ---------------------------------------------------------------------------

/**
 * A sub-section of a document produced by the chunker.
 * Chunks are the unit of retrieval in the RAG pipeline.
 */
export interface Chunk {
  /** Deterministic ID combining documentId and chunk index (e.g. "project-wiral-ai-003"). */
  readonly chunkId: string;
  /** ID of the parent document. */
  readonly documentId: string;
  /** Filename of the parent document. */
  readonly documentName: string;
  /**
   * The nearest Markdown heading above this chunk, if any.
   * Optional — some documents may have no headings.
   */
  readonly heading?: string;
  /** The actual text content of this chunk. */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Embedded Chunk
// ---------------------------------------------------------------------------

/**
 * A chunk with its embedding vector attached.
 * This is the unit stored in the vector store.
 */
export interface EmbeddedChunk extends Chunk {
  /** Dense embedding vector produced by the embedding model. */
  readonly embedding: number[];
}

// ---------------------------------------------------------------------------
// Vector Store
// ---------------------------------------------------------------------------

/**
 * The persisted vector index written to data/vector-store.json.
 * Loaded entirely into memory at query time.
 */
export interface VectorStore {
  /** Schema version. Bump when the format changes incompatibly. */
  readonly version: number;
  /** The embedding model identifier used to produce these vectors. */
  readonly embeddingModel: string;
  /** Number of dimensions in each embedding vector. */
  readonly dimensions: number;
  /** ISO timestamp of when this store was created. */
  readonly createdAt: string;
  /** Total number of source documents that were ingested. */
  readonly documentCount: number;
  /** All embedded chunks. */
  readonly chunks: EmbeddedChunk[];
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * A chunk returned by the retrieval layer, augmented with its similarity score.
 * The embedding vector is deliberately stripped — it is not needed downstream
 * and excluding it keeps the retrieved payload small.
 */
export interface RetrievedChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentName: string;
  readonly heading?: string;
  readonly content: string;
  /** Cosine similarity score in [-1, 1]. Higher = more relevant. */
  readonly score: number;
}

/**
 * The complete result returned by the retrieve() function.
 *
 * Designed to make debugging straightforward:
 *   - `hasEvidence` answers "should we call the LLM?"
 *   - `retrieved` contains the chunks to use as LLM context
 *   - `diagnostics` explains why this result was produced
 *
 * The LLM is only called when hasEvidence === true.
 */
export interface RetrievalResult {
  /** The original query string. */
  readonly query: string;

  /**
   * Whether enough evidence was found to attempt an answer.
   * false  → deterministic refusal, no LLM call needed.
   * true   → pass `retrieved` chunks to the LLM as context.
   */
  readonly hasEvidence: boolean;

  /**
   * Chunks that passed the similarity threshold, sorted by score descending.
   * Empty when hasEvidence is false.
   */
  readonly retrieved: RetrievedChunk[];

  /**
   * Diagnostic information about the retrieval process.
   * Exposed here (not just in logs) so the API route can log it server-side
   * and the test script can print it.
   */
  readonly diagnostics: RetrievalDiagnostics;
}

/**
 * Internal diagnostics attached to every retrieval result.
 * Useful for understanding score distributions during threshold calibration.
 */
export interface RetrievalDiagnostics {
  /** Total number of chunks compared (= full store size). */
  readonly candidateCount: number;
  /** Number of chunks returned after threshold + topK filtering. */
  readonly returnedCount: number;
  /** Similarity score of the best-matching chunk (null if store is empty). */
  readonly maxScore: number | null;
  /** Similarity score of the second-best chunk (null if fewer than 2 candidates). */
  readonly secondScore: number | null;
  /** Similarity threshold applied. */
  readonly thresholdUsed: number;
  /** Maximum chunks requested (topK). */
  readonly topK: number;
  /** Dimensionality of the query embedding. */
  readonly queryEmbeddingDimension: number;
}

// ---------------------------------------------------------------------------
// API (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Source metadata returned in the API response.
 * Contains everything Phase 4 needs to render a citation.
 */
export interface SourceMetadata {
  readonly chunkId: string;
  readonly documentName: string;
  readonly heading?: string;
  readonly score: number;
}

/**
 * The JSON body expected by POST /api/chat.
 */
export interface ChatRequest {
  readonly message: string;
}

/**
 * The JSON body returned by POST /api/chat.
 *
 * - `answer`:   The grounded response (or deterministic refusal text)
 * - `sources`:  Retrieved chunks that grounded the answer (empty on refusal)
 * - `grounded`: Always true — signals that this is a RAG response
 * - `refused`:  true when the retrieval gate fired (no evidence found)
 * - `provider`: Which LLM provider generated the answer (null on refusal)
 */
export interface ChatResponse {
  readonly answer: string;
  readonly sources: SourceMetadata[];
  readonly grounded: true;
  readonly refused: boolean;
  readonly provider: "groq" | "gemini" | null;
}

