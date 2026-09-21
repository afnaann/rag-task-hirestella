# Grounded RAG Portfolio System

A document-agnostic Retrieval-Augmented Generation (RAG) system built as a technical assessment for an AI Developer / Junior AI Engineer role.

The system answers questions about a candidate by retrieving relevant information from indexed documents and grounding the LLM's responses in that evidence. It is designed to refuse when the retrieved context is insufficient — not because of a hardcoded forbidden-question list, but because of retrieval evidence quality.

---

## Status

**Phase 1 complete** — Ingestion pipeline (document loading, chunking, embedding, vector store).

Phase 2 (retrieval, LLM generation, chat API, UI) is not yet implemented.

---

## Architecture

```
OFFLINE (npm run ingest)
────────────────────────────────────────────────
documents/*.md
    → Document Discovery (loader.ts)
    → Markdown-Aware Chunking (chunker.ts)
    → Embedding Generation (gemini-embedding-2)
    → data/vector-store.json

RUNTIME (Phase 2)
────────────────────────────────────────────────
User Question
    → Query Embedding
    → Cosine Similarity Search (similarity.ts)
    → Retrieval Gate (chunks.length === 0 → deterministic refusal)
    → Grounded LLM Prompt
    → Primary: Groq (gpt-oss-120b)
    → Fallback: Gemini (gemini-3.8-flash)
    → Response + source metadata
```

### Design Principles

- **Document-agnostic**: No code references specific filenames, people, or topics.
- **Deterministic retrieval gate**: If no chunks pass the similarity threshold, the system refuses without calling the LLM.
- **Provider abstraction**: Embedding and LLM providers are behind interfaces. Swapping providers means adding one file.
- **Full rebuild on ingest**: No incremental updates. Simple, predictable, avoids stale-chunk bugs.
- **Calibrated thresholds**: The similarity threshold is not a universal constant — it is calibrated against the evaluation set and documented.

---

## Project Structure

```
documents/           Source Markdown documents (replaceable)
data/                Generated vector store (vector-store.json)
lib/
  types.ts           Core TypeScript interfaces (Document, Chunk, EmbeddedChunk, VectorStore)
  config.ts          All tunable constants (chunk sizes, model names, paths)
  documents/
    loader.ts        Dynamic document discovery and loading
    chunker.ts       Markdown-aware chunking
  embeddings/
    types.ts         EmbeddingProvider interface
    gemini.ts        Gemini embedding-2 implementation + factory
  retrieval/
    store.ts         Vector store read/write/validate
    similarity.ts    Cosine similarity (independent, testable)
scripts/
  ingest.ts          npm run ingest — full ingestion pipeline
  validate.ts        npm run validate — structural sanity check
app/                 Next.js App Router (Phase 2 UI goes here)
eval/                Evaluation test cases (Phase 2)
```

---

## Setup

### Prerequisites

- Node.js 18+
- A Google AI Studio API key (free): https://aistudio.google.com/apikey

### Installation

```bash
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | Yes (Phase 1+) | Embedding generation via Gemini Embedding 2 |
| `GROQ_API_KEY` | Phase 2+ | LLM generation via Groq |

---

## Running Ingestion

```bash
npm run ingest
```

This will:
1. Discover all `.md` files in `documents/`
2. Chunk them using the Markdown-aware chunker
3. Generate embeddings using Gemini Embedding 2
4. Write `data/vector-store.json`
5. Validate the written store

**Re-running ingestion** always performs a full rebuild. No state is carried over from previous runs.

**To use different documents**: replace the files in `documents/`, then re-run `npm run ingest`. No code changes are needed.

### Validation (after ingestion)

```bash
npm run validate
```

Checks that `data/vector-store.json` is structurally sound: correct schema, consistent embedding dimensions, per-document chunk coverage, no leaked secrets.

---

## Running the Application

```bash
npm run dev     # Development server
npm run build   # Production build (for Vercel)
```

The chat interface is not yet implemented (Phase 2).

---

## Chunking Approach

**Strategy**: Markdown heading-aware hierarchical splitting.

1. The document is split on ATX headings (`#`, `##`, `###`, etc.) into sections.
2. Sections smaller than `MIN_CHUNK_CHARS` (100 chars) are merged with the next section.
3. Sections larger than `MAX_CHUNK_CHARS` (1500 chars) are split on paragraph boundaries (`\n\n`), then sentence boundaries, then word boundaries as a last resort.
4. Adjacent chunks receive `CHUNK_OVERLAP_CHARS` (200 chars) of overlap: the tail of the previous chunk is prepended to the next chunk.

**Why this approach**: For a personal-document corpus (CV, project write-ups, FAQ), headings map naturally to semantic topics. Splitting within a section loses context; splitting across sections mixes unrelated topics. Overlap preserves context at boundaries.

**All parameters** live in `lib/config.ts` and are documented with rationale.

**Character count ≠ token count.** 1500 chars ≈ 375 tokens at ~4 chars/token for English. This is approximate — a production system requiring precise token budgets should use a tokeniser.

---

## Embedding Approach

| Parameter | Value |
|---|---|
| Model | `gemini-embedding-2` |
| SDK | `@google/genai` (current unified SDK, replaces deprecated `@google/generative-ai`) |
| Dimensions | 768 (configurable via `EMBEDDING_DIMENSIONS` in `lib/config.ts`) |
| Max input | 8,192 tokens |

**Why 768 dimensions**: `gemini-embedding-2` supports 128–3072 via Matryoshka Representation Learning. 768 provides good semantic quality while keeping the vector store small (~300KB for ~100 chunks).

**Batching**: chunks are embedded in concurrent groups of 5 with a 200ms pause between batches to stay within free-tier rate limits.

---

## Vector Store Design

The vector store is a plain JSON file (`data/vector-store.json`) committed to the repository.

**Format**:
```json
{
  "version": 1,
  "embeddingModel": "gemini-embedding-2",
  "dimensions": 768,
  "createdAt": "...",
  "documentCount": 4,
  "chunks": [
    {
      "chunkId": "dummy-profile-000",
      "documentId": "dummy-profile",
      "documentName": "dummy-profile.md",
      "heading": "Summary",
      "content": "...",
      "embedding": [...]
    }
  ]
}
```

**Why a JSON file**: For a corpus of ~4 documents and ~50-150 chunks, an external vector database adds operational complexity without benefit. The entire store fits in memory (~300KB). Full similarity search across 150 chunks takes <1ms.

**Privacy note**: This approach is appropriate because this assessment corpus contains intentionally public portfolio material. For private data, use a protected vector database and do not commit indexed content to the repository.

**Version field**: Used to detect incompatible schema changes. If `version` in the file doesn't match `VECTOR_STORE_VERSION` in `lib/config.ts`, the application will refuse to load the store and prompt for re-ingestion.

---

## Retrieval Approach (Phase 2)

*Not yet implemented. Documented here for context.*

1. Embed the user's query using the same model as ingestion.
2. Compute cosine similarity between the query vector and all stored chunk vectors.
3. Collect diagnostics: `candidatesConsidered`, `maxScore`, `returnedCount`.
4. Filter chunks below `RETRIEVAL_MIN_SCORE` (calibrated against the evaluation set).
5. **Retrieval gate**: if zero chunks pass, return a deterministic refusal without calling the LLM.
6. Pass the top-K chunks to the LLM with a grounded system prompt.

---

## LLM Choice (Phase 2)

*Not yet implemented.*

| Role | Model | Provider |
|---|---|---|
| Primary | `gpt-oss-120b` | Groq (free tier: 1,000 req/day, 200K tokens/day) |
| Fallback | `gemini-3.8-flash` | Google AI Studio (free tier) |

Fallback is triggered on Groq 429/5xx/timeout — not on every request. This provides resilience during demos where free-tier rate limits are a real operational risk.

---

## Grounded Refusal Behavior (Phase 2)

*Not yet implemented. Documented for context.*

Refusal happens at two layers:

**Layer 1 (retrieval gate — deterministic)**: If zero chunks pass the similarity threshold, the system returns a fixed refusal message without invoking any LLM. This is cheap, fast, and reliable.

**Layer 2 (LLM grounding — prompt-based)**: When chunks are retrieved, the system prompt instructs the model to answer only from the provided context and to say "I don't have that information in the available documents" when evidence is insufficient.

No hardcoded forbidden question lists. No keyword matching. Refusal emerges from evidence quality.

---

## Evaluation Approach (Phase 2)

*Not yet implemented.*

A 10-question evaluation set in `eval/questions.json` with two-layer checking:
- **Retrieval evaluation**: Did the expected documents get retrieved? What was the max similarity score?
- **Generation evaluation**: Did the LLM respond appropriately (answer vs. refusal)?

Categories: answerable (single-doc), answerable (cross-doc), refusal (not in corpus), hallucination traps, ambiguous.

---

## Deployment (Phase 2)

*Not yet implemented.*

Target: Vercel (free tier). `GOOGLE_API_KEY` and `GROQ_API_KEY` stored as Vercel environment variables. The generated `data/vector-store.json` is committed to the repository and served as a static file loaded at runtime.

---

## What Is Intentionally Not Built

| Omission | Reason |
|---|---|
| Streaming responses | Adds complexity. Batch response is sufficient for the assessment. |
| Conversation memory | Single-turn Q&A demonstrates RAG quality more clearly. |
| Re-ranking model | Cosine similarity is sufficient at this corpus scale. |
| Hybrid search (BM25 + vector) | Adds complexity without proportional benefit for ~4 documents. |
| LLM-as-judge evaluation | Over-scoped. Heuristic + manual review is more honest for 10 questions. |
| Complex provider abstraction | Two simple provider files behind a minimal interface. No factory-factory patterns. |
| Token-precise chunking | Character approximation is sufficient. Production would use a tokeniser. |
| Incremental ingestion | Full rebuild is simpler and more predictable for a small corpus. |

---

## Dummy Corpus

The initial corpus contains four fictional documents about "Alex Chen":

| File | Content |
|---|---|
| `dummy-profile.md` | Professional profile: skills, work history, education, open source |
| `dummy-project-a.md` | DocMind: enterprise RAG search system (Luminary Labs) |
| `dummy-project-b.md` | AnomalyGuard: real-time fraud detection system (DataStream) |
| `dummy-faq.md` | FAQ covering role preferences, technical background, work style |

**To use your own documents**: delete the dummy files, add your `.md` files to `documents/`, run `npm run ingest`. No code changes required.
