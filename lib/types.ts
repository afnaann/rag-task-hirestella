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
  /** Derived deterministically from the filename (e.g. "dummy-profile" from "dummy-profile.md"). */
  readonly id: string;
  /** Original filename including extension (e.g. "dummy-profile.md"). */
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
  /** Deterministic ID combining documentId and chunk index (e.g. "dummy-profile-003"). */
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
