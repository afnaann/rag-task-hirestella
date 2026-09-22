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

/** Directory to scan for source documents. Relative to project root. */
export const DOCUMENTS_DIR = "documents";

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Maximum number of chunks to return per query.
 *
 * For a ~50-chunk corpus, 5 is a reasonable default: wide enough to capture
 * multi-section answers, narrow enough to keep LLM context tight.
 * Override with the RETRIEVAL_TOP_K environment variable.
 */
export const RETRIEVAL_TOP_K = Number(process.env["RETRIEVAL_TOP_K"] ?? 5);

/**
 * Minimum cosine similarity score for a chunk to be considered supporting evidence.
 *
 * IMPORTANT: This is NOT a universal "good enough" cosine threshold.
 * Different embedding models and corpora produce different score distributions.
 * This value is a starting point only and must be calibrated against the
 * evaluation set (Phase 4) by inspecting the score gap between relevant and
 * irrelevant queries.
 *
 * Current value: 0.62
 * Rationale: Calibrated against the real portfolio corpus (gemini-embedding-2, 768d):
 *   - Answerable queries:   min=0.691  avg=0.818  max=0.878
 *   - Truly off-domain:     min=0.518  avg=0.523  max=0.529
 *   - Short noise/greeting: ~0.602
 *   - Score gap:            0.691 - 0.529 = 0.162
 * 0.62 sits comfortably in the gap, filtering off-domain queries and greetings
 * cleanly into the deterministic no-evidence gate.
 *
 * Override with the RETRIEVAL_MIN_SCORE environment variable.
 */
export const RETRIEVAL_MIN_SCORE = Number(
  process.env["RETRIEVAL_MIN_SCORE"] ?? 0.62
);

// ---------------------------------------------------------------------------
// LLM Generation (Phase 3)
// ---------------------------------------------------------------------------

/**
 * Primary generation model via Groq.
 *
 * openai/gpt-oss-120b is listed as a production model on Groq as of 2026.
 * Verify current available models at: https://console.groq.com/docs/models
 * Override with GROQ_MODEL environment variable.
 */
export const GROQ_MODEL =
  process.env["GROQ_MODEL"] ?? "openai/gpt-oss-120b";

/**
 * Fallback generation model via Google Gemini.
 *
 * gemini-3.6-flash is the current stable Flash model available via the
 * @google/genai SDK. (gemini-2.5-flash is no longer available to new users.)
 * Override with GEMINI_LLM_MODEL environment variable.
 */
export const GEMINI_LLM_MODEL =
  process.env["GEMINI_LLM_MODEL"] ?? "gemini-3.6-flash";

/**
 * Maximum characters in a user message.
 * Prevents excessively long inputs from being sent upstream.
 */
export const MAX_MESSAGE_CHARS = 1000;

/**
 * The fixed refusal / redirect text returned when hasEvidence === false.
 * Centralised here so the wording can be changed in one place.
 * Friendly, deterministic scope response suitable for off-domain queries
 * and greetings without requiring conversational routing.
 */
export const NO_EVIDENCE_RESPONSE =
  "I can help with questions about Afnan's experience, projects, skills, and background. What would you like to know?";

/**
 * Development-only flag: when "true", the Groq provider will simulate a
 * transient failure to exercise the Gemini fallback path.
 *
 * NEVER set this in production. It is read only in the GroqProvider.
 * The client cannot set this — it is an environment variable.
 */
export const LLM_FORCE_PRIMARY_FAILURE =
  process.env["LLM_FORCE_PRIMARY_FAILURE"] === "true";
