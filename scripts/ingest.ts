/**
 * Ingestion script — npm run ingest
 *
 * Builds the vector store from scratch by:
 *   1. Discovering Markdown documents in the documents/ directory
 *   2. Chunking each document using the markdown-aware chunker
 *   3. Generating embeddings for every chunk via Gemini Embedding 2
 *   4. Writing the result to data/vector-store.json
 *
 * Every run is a complete rebuild — no incremental updates.
 * This is intentional: for a small corpus, a full rebuild is simpler,
 * more predictable, and avoids stale-chunk bugs.
 *
 * Usage:
 *   npm run ingest
 *
 * Required environment variable:
 *   GOOGLE_API_KEY — your Google AI Studio API key
 */

// Load environment variables from .env.local before anything else
import { config } from "dotenv";
config({ path: ".env.local" });

import path from "path";
import { loadDocuments } from "@/lib/documents/loader";
import { chunkDocuments } from "@/lib/documents/chunker";
import { createEmbeddingProvider } from "@/lib/embeddings/gemini";
import { writeVectorStore, validateVectorStore, readVectorStore } from "@/lib/retrieval/store";
import type { EmbeddedChunk } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------------

async function ingest(): Promise<void> {
  console.log("\n🚀 Starting ingestion pipeline\n");
  const startTime = Date.now();

  // ------------------------------------------------------------------
  // Step 1: Load documents
  // ------------------------------------------------------------------
  console.log("📂 Step 1: Loading documents...");
  const documents = await loadDocuments();
  console.log(`   ✅ Loaded ${pluralise(documents.length, "document")}:`);
  for (const doc of documents) {
    console.log(
      `      • ${doc.name} (${doc.content.length.toLocaleString()} chars)`
    );
  }

  // ------------------------------------------------------------------
  // Step 2: Chunk documents
  // ------------------------------------------------------------------
  console.log("\n✂️  Step 2: Chunking documents...");
  const chunks = chunkDocuments(documents);

  if (chunks.length === 0) {
    throw new Error(
      "Chunking produced zero chunks. Check that documents contain meaningful content."
    );
  }

  console.log(`   ✅ Created ${pluralise(chunks.length, "chunk")}`);

  // Show chunk distribution per document
  const chunksByDoc = chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.documentName] = (acc[c.documentName] ?? 0) + 1;
    return acc;
  }, {});
  for (const [docName, count] of Object.entries(chunksByDoc)) {
    console.log(`      • ${docName}: ${pluralise(count, "chunk")}`);
  }

  // ------------------------------------------------------------------
  // Step 3: Initialise embedding provider
  // ------------------------------------------------------------------
  console.log("\n🔌 Step 3: Initialising embedding provider...");
  const embeddingProvider = createEmbeddingProvider();
  console.log(`   ✅ Provider:    ${embeddingProvider.modelId}`);
  console.log(`   ✅ Dimensions:  ${embeddingProvider.dimensions}`);

  // ------------------------------------------------------------------
  // Step 4: Generate embeddings
  // ------------------------------------------------------------------
  console.log(`\n🔢 Step 4: Embedding ${chunks.length} chunks...`);

  const texts = chunks.map((c) => c.content);
  const embeddedChunks: EmbeddedChunk[] = [];

  // We embed all at once using the provider's batching — progress is tracked
  // by overriding the batch size for reporting purposes
  const REPORT_EVERY = 5;
  let embedded = 0;

  // Process in reporting-sized groups so we can show progress
  for (let i = 0; i < texts.length; i += REPORT_EVERY) {
    const batch = texts.slice(i, i + REPORT_EVERY);
    const batchEmbeddings = await embeddingProvider.embedBatch(batch);

    for (let j = 0; j < batchEmbeddings.length; j++) {
      embeddedChunks.push({
        ...chunks[i + j],
        embedding: batchEmbeddings[j],
      });
      embedded++;
    }

    process.stdout.write(
      `\r   Embedded ${embedded}/${chunks.length} chunks...`
    );
  }

  console.log(
    `\r   ✅ Embedded ${pluralise(chunks.length, "chunk")} successfully`
  );

  // ------------------------------------------------------------------
  // Step 5: Write vector store
  // ------------------------------------------------------------------
  console.log("\n💾 Step 5: Writing vector store...");
  writeVectorStore(
    embeddedChunks,
    embeddingProvider.modelId,
    embeddingProvider.dimensions,
    documents.length
  );

  const storePath = path.resolve(process.cwd(), "data/vector-store.json");
  console.log(`   ✅ Written to ${storePath}`);

  // ------------------------------------------------------------------
  // Step 6: Validate the written store
  // ------------------------------------------------------------------
  console.log("\n🔍 Step 6: Validating vector store...");

  // Use the already-imported readVectorStore to validate round-trip serialisation
  const writtenStore = readVectorStore();
  const errors = validateVectorStore(writtenStore);

  if (errors.length > 0) {
    console.error("\n❌ Validation failed:");
    for (const err of errors) {
      console.error(`   • ${err}`);
    }
    process.exit(1);
  }

  // Verify chunk count round-trips correctly
  if (writtenStore.chunks.length !== embeddedChunks.length) {
    console.error(
      `❌ Chunk count mismatch after write: ingested ${embeddedChunks.length}, stored ${writtenStore.chunks.length}`
    );
    process.exit(1);
  }

  console.log("   ✅ All validation checks passed");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "─".repeat(50));
  console.log("✅ Ingestion complete\n");
  console.log(`   Documents:       ${documents.length}`);
  console.log(`   Chunks:          ${chunks.length}`);
  console.log(`   Embedding model: ${embeddingProvider.modelId}`);
  console.log(`   Dimensions:      ${embeddingProvider.dimensions}`);
  console.log(`   Time elapsed:    ${elapsed}s`);
  console.log("─".repeat(50) + "\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

ingest().catch((err: unknown) => {
  console.error("\n❌ Ingestion failed:\n");
  console.error(err instanceof Error ? err.message : String(err));
  console.error();
  process.exit(1);
});
