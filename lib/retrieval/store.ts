/**
 * Vector store persistence.
 *
 * Handles reading and writing the vector-store.json file.
 * The store is a plain JSON file committed to the repository.
 *
 * Design note:
 *   This approach is appropriate for a small, public corpus (~50-200 chunks).
 *   For private data or large corpora, use a protected vector database instead.
 *   See README.md for details on this deliberate scope decision.
 */

import fs from "fs";
import path from "path";
import { VECTOR_STORE_PATH, VECTOR_STORE_VERSION } from "@/lib/config";
import type { EmbeddedChunk, VectorStore } from "@/lib/types";

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Writes the vector store to disk.
 * Creates the data/ directory if it does not exist.
 * Always overwrites any previous store — this is a full rebuild by design.
 *
 * @throws On any filesystem or serialisation error.
 */
export function writeVectorStore(
  chunks: EmbeddedChunk[],
  embeddingModel: string,
  dimensions: number,
  documentCount: number
): void {
  const outPath = path.join(process.cwd(), "data", "vector-store.json");
  const outDir = path.dirname(outPath);

  // Ensure the output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const store: VectorStore = {
    version: VECTOR_STORE_VERSION,
    embeddingModel,
    dimensions,
    createdAt: new Date().toISOString(),
    documentCount,
    chunks,
  };

  try {
    fs.writeFileSync(outPath, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    throw new Error(`Failed to write vector store to "${outPath}": ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Reads and parses the vector store from disk.
 *
 * @throws If the file is missing, unparseable, or has an incompatible version/dimensions.
 */
export function readVectorStore(): VectorStore {
  const storePath = path.join(process.cwd(), "data", "vector-store.json");

  if (!fs.existsSync(storePath)) {
    throw new Error(
      `Vector store not found at "${storePath}".\n` +
        `Run "npm run ingest" to generate it.`
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(storePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read vector store at "${storePath}": ${err}`);
  }

  let store: VectorStore;
  try {
    store = JSON.parse(raw) as VectorStore;
  } catch (err) {
    throw new Error(
      `Vector store at "${storePath}" is not valid JSON: ${err}\n` +
        `Try re-running "npm run ingest".`
    );
  }

  // Schema version check
  if (store.version !== VECTOR_STORE_VERSION) {
    throw new Error(
      `Vector store version mismatch: expected ${VECTOR_STORE_VERSION}, found ${store.version}.\n` +
        `Re-run "npm run ingest" to rebuild the store.`
    );
  }

  return store;
}

/**
 * Validates an in-memory vector store for internal consistency.
 * Used by the validation step after ingestion.
 *
 * @returns Array of error messages. Empty array means the store is valid.
 */
export function validateVectorStore(store: VectorStore): string[] {
  const errors: string[] = [];

  if (!store.embeddingModel) {
    errors.push("Missing embeddingModel in vector store metadata.");
  }

  if (!store.dimensions || store.dimensions <= 0) {
    errors.push(`Invalid dimensions: ${store.dimensions}`);
  }

  if (!Array.isArray(store.chunks) || store.chunks.length === 0) {
    errors.push("Vector store contains no chunks.");
    return errors; // Can't validate chunks further
  }

  for (let i = 0; i < store.chunks.length; i++) {
    const chunk = store.chunks[i];
    const prefix = `Chunk[${i}] (${chunk.chunkId})`;

    if (!chunk.chunkId) errors.push(`${prefix}: missing chunkId`);
    if (!chunk.documentId) errors.push(`${prefix}: missing documentId`);
    if (!chunk.documentName) errors.push(`${prefix}: missing documentName`);
    if (!chunk.content || chunk.content.trim().length === 0) {
      errors.push(`${prefix}: empty content`);
    }

    if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) {
      errors.push(`${prefix}: missing or empty embedding`);
    } else if (chunk.embedding.length !== store.dimensions) {
      errors.push(
        `${prefix}: embedding dimension ${chunk.embedding.length} ≠ expected ${store.dimensions}`
      );
    }

    // Security check: make sure no API key leaked into the store
    const contentStr = JSON.stringify(chunk);
    if (
      contentStr.includes("AIza") || // Google API key prefix
      contentStr.includes("gsk_") || // Groq API key prefix
      contentStr.includes("sk-") // Generic OpenAI-style key prefix
    ) {
      errors.push(`${prefix}: possible API key detected in chunk data!`);
    }
  }

  return errors;
}
