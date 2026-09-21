/**
 * Validation script — npm run validate
 *
 * Reads the existing vector-store.json and performs a series of checks
 * to confirm the ingestion output is structurally correct.
 *
 * This is NOT the evaluation runner (which tests retrieval quality).
 * This is a structural sanity check — run it after "npm run ingest".
 *
 * Checks performed:
 *   1. vector-store.json is readable and valid JSON
 *   2. Schema version matches current code
 *   3. Expected metadata fields are present
 *   4. All chunks have required metadata fields
 *   5. All chunks have embeddings
 *   6. All embeddings have the same dimension (matching store metadata)
 *   7. No obviously leaking secrets in chunk content
 *   8. Chunk count is greater than zero
 *   9. At least one chunk per document (basic discovery check)
 *
 * Usage:
 *   npm run validate
 */

import path from "path";
import { readVectorStore, validateVectorStore } from "@/lib/retrieval/store.js";

function section(title: string) {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(50));
}

function pass(msg: string) {
  console.log(`  ✅ ${msg}`);
}

function fail(msg: string) {
  console.log(`  ❌ ${msg}`);
}

async function validate(): Promise<void> {
  console.log("\n🔍 Phase 1 Validation\n");

  let hasErrors = false;

  // ------------------------------------------------------------------
  // 1. Read the vector store
  // ------------------------------------------------------------------
  section("1. Reading vector-store.json");

  let store;
  try {
    store = readVectorStore();
    pass(
      `Read successfully from: ${path.resolve(process.cwd(), "data/vector-store.json")}`
    );
  } catch (err) {
    fail(`Failed to read vector store: ${err}`);
    console.error("\nRun 'npm run ingest' first to generate the vector store.");
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // 2. Metadata checks
  // ------------------------------------------------------------------
  section("2. Metadata");

  pass(`Schema version:   ${store.version}`);
  pass(`Embedding model:  ${store.embeddingModel}`);
  pass(`Dimensions:       ${store.dimensions}`);
  pass(`Created at:       ${store.createdAt}`);
  pass(`Document count:   ${store.documentCount}`);
  pass(`Total chunks:     ${store.chunks.length}`);

  if (!store.embeddingModel) {
    fail("embeddingModel is missing from metadata");
    hasErrors = true;
  }

  if (!store.dimensions || store.dimensions <= 0) {
    fail(`Invalid dimensions: ${store.dimensions}`);
    hasErrors = true;
  }

  // ------------------------------------------------------------------
  // 3. Run the generic validator from store.ts
  // ------------------------------------------------------------------
  section("3. Structural validation (all chunks)");

  const errors = validateVectorStore(store);
  if (errors.length === 0) {
    pass(`All ${store.chunks.length} chunks passed structural validation`);
  } else {
    for (const err of errors) {
      fail(err);
      hasErrors = true;
    }
  }

  // ------------------------------------------------------------------
  // 4. Embedding dimension consistency
  // ------------------------------------------------------------------
  section("4. Embedding dimension consistency");

  const dimensions = new Set(store.chunks.map((c) => c.embedding.length));
  if (dimensions.size === 1) {
    const dim = [...dimensions][0];
    pass(`All embeddings have consistent dimension: ${dim}`);
    if (dim !== store.dimensions) {
      fail(
        `Dimension mismatch: chunks have ${dim} dims but metadata says ${store.dimensions}`
      );
      hasErrors = true;
    }
  } else {
    fail(`Inconsistent embedding dimensions found: ${[...dimensions].join(", ")}`);
    hasErrors = true;
  }

  // ------------------------------------------------------------------
  // 5. Per-document chunk coverage
  // ------------------------------------------------------------------
  section("5. Per-document chunk coverage");

  const chunksByDoc = store.chunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.documentName] = (acc[c.documentName] ?? 0) + 1;
    return acc;
  }, {});

  if (Object.keys(chunksByDoc).length < store.documentCount) {
    fail(
      `Expected chunks from ${store.documentCount} documents but found chunks from only ${Object.keys(chunksByDoc).length}`
    );
    hasErrors = true;
  }

  for (const [docName, count] of Object.entries(chunksByDoc)) {
    pass(`${docName}: ${count} chunk${count === 1 ? "" : "s"}`);
  }

  // ------------------------------------------------------------------
  // 6. Security check — no API keys in chunk content
  // ------------------------------------------------------------------
  section("6. Security check (no secrets in stored chunks)");

  const apiKeyPatterns = [
    { name: "Google API key (AIza...)", pattern: /AIza/ },
    { name: "Groq API key (gsk_...)", pattern: /gsk_/ },
    { name: "OpenAI-style key (sk-...)", pattern: /sk-[A-Za-z0-9]{20,}/ },
  ];

  let secretsFound = false;
  for (const chunk of store.chunks) {
    for (const { name, pattern } of apiKeyPatterns) {
      if (pattern.test(chunk.content)) {
        fail(`Possible ${name} found in chunk ${chunk.chunkId}!`);
        hasErrors = true;
        secretsFound = true;
      }
    }
  }

  if (!secretsFound) {
    pass("No obvious API keys or secrets detected in chunk content");
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  section("Summary");

  if (hasErrors) {
    console.log("\n❌ Validation FAILED — see errors above\n");
    process.exit(1);
  } else {
    console.log("\n✅ All validation checks passed\n");
    console.log("  The vector store is structurally sound.");
    console.log("  Ready for Phase 2: retrieval and chat API.\n");
  }
}

validate().catch((err: unknown) => {
  console.error("\n❌ Validation script error:\n");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
