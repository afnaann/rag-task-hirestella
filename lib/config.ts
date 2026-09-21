/**
 * Centralised configuration for the RAG ingestion and retrieval pipeline.
 *
 * All tunable constants live here so they are easy to find and change.
 * Use environment variables for overrides where appropriate.
 */

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Maximum number of characters per chunk.
 *
 * Note: character count ≠ token count. At roughly 4 chars/token for English,
 * 1500 chars ≈ 375 tokens — comfortably under typical LLM context limits
 * while providing meaningful semantic units.
 */
export const MAX_CHUNK_CHARS = 1500;

/**
 * Minimum number of characters for a chunk to stand on its own.
 * Sections shorter than this will be merged with the next section.
 */
export const MIN_CHUNK_CHARS = 100;

/**
 * Number of characters from the end of the previous chunk to prepend
 * to the current chunk as overlap, so context at boundaries is not lost.
 */
export const CHUNK_OVERLAP_CHARS = 200;

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

/**
 * Gemini embedding model identifier.
 * Using gemini-embedding-2 which is GA as of April 2026.
 *
 * Verify current models at: https://ai.google.dev/gemini-api/docs/models
 */
export const EMBEDDING_MODEL = "gemini-embedding-2";

/**
 * Output dimensionality for gemini-embedding-2.
 *
 * The model supports 128–3072 via Matryoshka Representation Learning.
 * 768 provides a good balance between semantic quality and storage size.
 * Stored in the vector store metadata so dimension mismatches can be detected.
 */
export const EMBEDDING_DIMENSIONS = 768;

// ---------------------------------------------------------------------------
// Vector store
// ---------------------------------------------------------------------------

/** Path where the vector store JSON is written. Relative to project root. */
export const VECTOR_STORE_PATH = "data/vector-store.json";

/** Schema version. Increment when the VectorStore format changes incompatibly. */
export const VECTOR_STORE_VERSION = 1;

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Directory to scan for Markdown source documents. Relative to project root. */
export const DOCUMENTS_DIR = "documents";

/** File extension to discover. Change to .txt etc. for other corpora. */
export const DOCUMENT_EXTENSION = ".md";
